import io
import json
import os
import re
import time
import hashlib
from datetime import datetime, timezone
from typing import Any, TypedDict

import numpy as np


INTERVIEW_VECTOR_BUCKET = os.getenv("INTERVIEW_VECTOR_BUCKET", os.getenv("RAG_VECTOR_BUCKET", "rag-vectors"))
INTERVIEW_VECTOR_PREFIX = os.getenv("INTERVIEW_VECTOR_PREFIX", "interview-memory")
INTERVIEW_VECTOR_BACKEND = os.getenv("INTERVIEW_VECTOR_BACKEND", "faiss").lower()
INTERVIEW_EMBEDDING_DIMENSION = int(os.getenv("INTERVIEW_EMBEDDING_DIMENSION", "384"))


class InterviewMemoryState(TypedDict, total=False):
    user_email: str
    user_id: str
    query: str
    top_k: int
    records: list[dict[str, Any]]
    context: str


def _get_faiss():
    if INTERVIEW_VECTOR_BACKEND != "faiss":
        raise RuntimeError("Interview memory requires INTERVIEW_VECTOR_BACKEND=faiss.")
    import faiss
    return faiss


def _embed_texts(texts: list[str]) -> np.ndarray:
    """Create deterministic dense embeddings without Torch, avoiding FAISS/Torch OpenMP conflicts."""
    def stable_bucket(value: str) -> int:
        digest = hashlib.sha256(value.encode("utf-8")).digest()
        return int.from_bytes(digest[:8], "big") % INTERVIEW_EMBEDDING_DIMENSION

    vectors = np.zeros((len(texts), INTERVIEW_EMBEDDING_DIMENSION), dtype="float32")
    for row, text in enumerate(texts):
        tokens = re.findall(r"[A-Za-z0-9_+#.-]+", text.lower())
        for token in tokens:
            vectors[row, stable_bucket(token)] += 1.0
            if len(token) > 4:
                vectors[row, stable_bucket(token[:4])] += 0.35
                vectors[row, stable_bucket(token[-4:])] += 0.35
        norm = np.linalg.norm(vectors[row])
        if norm > 0:
            vectors[row] /= norm
    return vectors


def _get_user_id(user_email: str, supabase_client) -> str | None:
    if not user_email:
        return None
    result = supabase_client.table("users").select("id").eq("email", user_email).execute()
    rows = getattr(result, "data", None) or []
    if not rows:
        return None
    user_id = rows[0].get("id")
    return str(user_id) if user_id else None


def _base_path(user_id: str) -> str:
    return f"{INTERVIEW_VECTOR_PREFIX}/{user_id}"


def _storage_path(user_id: str, name: str) -> str:
    return f"{_base_path(user_id)}/{name}"


def _is_storage_not_found(error: Exception) -> bool:
    message = str(error).lower()
    return (
        "object not found" in message
        or "not_found" in message
        or "404" in message
        or "the resource was not found" in message
    )


def _memory_files_available(user_id: str, supabase_client) -> bool:
    """Return True only when all files needed to restore a user's FAISS memory exist."""
    try:
        items = supabase_client.storage.from_(INTERVIEW_VECTOR_BUCKET).list(_base_path(user_id), {"limit": 100})
    except TypeError:
        items = supabase_client.storage.from_(INTERVIEW_VECTOR_BUCKET).list(_base_path(user_id))
    except Exception as e:
        if not _is_storage_not_found(e):
            print(f"Interview vector folder check skipped: {e}")
        return False

    names = set()
    for item in items or []:
        if isinstance(item, dict) and item.get("name"):
            names.add(str(item["name"]))
        elif hasattr(item, "name"):
            names.add(str(item.name))
    return {"faiss.index", "embeddings.npy", "metadata.json"}.issubset(names)


def _download_blob(user_id: str, name: str, supabase_client) -> bytes | None:
    try:
        return supabase_client.storage.from_(INTERVIEW_VECTOR_BUCKET).download(_storage_path(user_id, name))
    except Exception as e:
        if not _is_storage_not_found(e):
            print(f"Interview vector download skipped for {name}: {e}")
        return None


def _upload_blob(user_id: str, name: str, data: bytes, supabase_client, content_type: str = "application/octet-stream") -> None:
    path = _storage_path(user_id, name)
    bucket = supabase_client.storage.from_(INTERVIEW_VECTOR_BUCKET)
    try:
        bucket.upload(path, data, {"content-type": content_type, "upsert": "true"})
    except TypeError:
        bucket.upload(path=path, file=data, file_options={"content-type": content_type, "upsert": "true"})
    except Exception as e:
        message = str(e).lower()
        if "already exists" not in message and "duplicate" not in message:
            raise
        try:
            bucket.update(path, data, {"content-type": content_type})
        except TypeError:
            bucket.update(path=path, file=data, file_options={"content-type": content_type})


def _serialize_embeddings(embeddings: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    np.save(buffer, embeddings.astype("float32"))
    return buffer.getvalue()


def _deserialize_embeddings(data: bytes) -> np.ndarray:
    return np.load(io.BytesIO(data)).astype("float32")


def _load_memory(user_id: str, supabase_client) -> tuple[Any | None, np.ndarray | None, list[dict[str, Any]]]:
    faiss = _get_faiss()
    if not _memory_files_available(user_id, supabase_client):
        return None, None, []

    index_blob = _download_blob(user_id, "faiss.index", supabase_client)
    embeddings_blob = _download_blob(user_id, "embeddings.npy", supabase_client)
    metadata_blob = _download_blob(user_id, "metadata.json", supabase_client)
    if not index_blob or not embeddings_blob or not metadata_blob:
        return None, None, []

    index = faiss.deserialize_index(np.frombuffer(index_blob, dtype="uint8"))
    embeddings = _deserialize_embeddings(embeddings_blob)
    metadata = json.loads(metadata_blob.decode("utf-8"))
    records = metadata.get("records", [])
    return index, embeddings, records if isinstance(records, list) else []


def _save_memory(user_id: str, index: Any, embeddings: np.ndarray, records: list[dict[str, Any]], supabase_client) -> None:
    faiss = _get_faiss()
    _upload_blob(user_id, "faiss.index", bytes(faiss.serialize_index(index)), supabase_client)
    _upload_blob(user_id, "embeddings.npy", _serialize_embeddings(embeddings), supabase_client)
    metadata = {
        "version": 1,
        "backend": "faiss",
        "embedding_model": f"hashing-{INTERVIEW_EMBEDDING_DIMENSION}-v1",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "records": records,
    }
    _upload_blob(user_id, "metadata.json", json.dumps(metadata, ensure_ascii=False).encode("utf-8"), supabase_client, "application/json")


def _as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value]
    return []


def _memory_text(role: str, domain: str, language: str, evaluation: dict[str, Any]) -> str:
    answer = (
        evaluation.get("answer")
        or evaluation.get("candidate_answer")
        or evaluation.get("user_answer")
        or evaluation.get("approach_text")
        or evaluation.get("code")
        or ""
    )
    return "\n".join([
        f"Role: {role}",
        f"Domain: {domain}",
        f"Language: {language}",
        f"Question: {evaluation.get('question', '')}",
        f"Candidate answer: {answer}",
        f"Score: {evaluation.get('overall_score', '')}",
        f"Technical accuracy: {evaluation.get('technical_accuracy', '')}",
        f"Communication: {evaluation.get('communication', '')}",
        f"Weak areas: {', '.join(_as_list(evaluation.get('weak_areas')))}",
        f"Mistakes: {', '.join(_as_list(evaluation.get('mistakes_made')))}",
        f"Skill gaps: {', '.join(_as_list(evaluation.get('skill_gaps')))}",
        f"Advice: {evaluation.get('advice', '')}",
        f"Better answer: {evaluation.get('improved_answer', '')}",
    ]).strip()


def _record_from_evaluation(
    user_id: str,
    role: str,
    domain: str,
    language: str,
    evaluation: dict[str, Any],
    session_id: str,
    index: int,
) -> dict[str, Any]:
    text = _memory_text(role, domain, language, evaluation)
    return {
        "id": f"{session_id}:{index}",
        "user_id": user_id,
        "session_id": session_id,
        "role": role,
        "domain": domain,
        "language": language,
        "question": evaluation.get("question", ""),
        "answer": evaluation.get("answer") or evaluation.get("candidate_answer") or evaluation.get("user_answer") or "",
        "type": evaluation.get("type") or evaluation.get("category") or "standard",
        "overall_score": evaluation.get("overall_score"),
        "weak_areas": _as_list(evaluation.get("weak_areas")),
        "mistakes_made": _as_list(evaluation.get("mistakes_made")),
        "skill_gaps": _as_list(evaluation.get("skill_gaps")),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "text": text,
    }


def store_interview_evaluations(
    user_email: str,
    role: str,
    domain: str,
    language: str,
    evaluations: list[dict[str, Any]],
    supabase_client,
) -> dict[str, Any]:
    """Store candidate interview answers and feedback in a per-user FAISS index persisted to Supabase Storage."""
    user_id = _get_user_id(user_email, supabase_client)
    if not user_id or not evaluations:
        return {"stored": 0, "user_id": user_id, "backend": INTERVIEW_VECTOR_BACKEND}

    faiss = _get_faiss()
    index, existing_embeddings, records = _load_memory(user_id, supabase_client)

    session_id = f"mock-{int(time.time())}"
    new_records = [
        _record_from_evaluation(user_id, role, domain, language, ev, session_id, i)
        for i, ev in enumerate(evaluations)
        if isinstance(ev, dict) and (ev.get("question") or ev.get("answer") or ev.get("candidate_answer"))
    ]
    if not new_records:
        return {"stored": 0, "user_id": user_id, "backend": INTERVIEW_VECTOR_BACKEND}

    new_embeddings = _embed_texts([record["text"] for record in new_records])
    if index is None or existing_embeddings is None:
        index = faiss.IndexFlatL2(new_embeddings.shape[1])
        embeddings = new_embeddings
    else:
        embeddings = np.vstack([existing_embeddings, new_embeddings]).astype("float32")

    index.add(new_embeddings)
    records.extend(new_records)
    _save_memory(user_id, index, embeddings, records, supabase_client)
    return {
        "stored": len(new_records),
        "total_records": len(records),
        "user_id": user_id,
        "bucket": INTERVIEW_VECTOR_BUCKET,
        "prefix": _base_path(user_id),
        "backend": INTERVIEW_VECTOR_BACKEND,
    }


def retrieve_interview_memory(user_email: str, query: str, supabase_client, top_k: int = 5) -> list[dict[str, Any]]:
    user_id = _get_user_id(user_email, supabase_client)
    if not user_id or not query.strip():
        return []

    index, _, records = _load_memory(user_id, supabase_client)
    if index is None or not records:
        return []

    query_vec = _embed_texts([query])
    _, indices = index.search(query_vec, min(top_k, len(records)))
    matches = []
    for idx in indices[0]:
        if 0 <= int(idx) < len(records):
            matches.append(records[int(idx)])
    return matches


def build_interview_memory_context(user_email: str, query: str, supabase_client, top_k: int = 5) -> str:
    def load_node(state: InterviewMemoryState) -> InterviewMemoryState:
        state["records"] = retrieve_interview_memory(state["user_email"], state["query"], supabase_client, state.get("top_k", top_k))
        return state

    def format_node(state: InterviewMemoryState) -> InterviewMemoryState:
        records = state.get("records", [])
        if not records:
            state["context"] = ""
            return state
        lines = []
        for record in records:
            lines.append(
                "- "
                + f"Question: {record.get('question', '')} | "
                + f"Score: {record.get('overall_score', 'N/A')} | "
                + f"Weak areas: {', '.join(_as_list(record.get('weak_areas')))} | "
                + f"Mistakes: {', '.join(_as_list(record.get('mistakes_made')))}"
            )
        state["context"] = "PAST INTERVIEW MEMORY:\n" + "\n".join(lines)
        return state

    try:
        from langgraph.graph import END, StateGraph

        graph = StateGraph(InterviewMemoryState)
        graph.add_node("retrieve", load_node)
        graph.add_node("format", format_node)
        graph.set_entry_point("retrieve")
        graph.add_edge("retrieve", "format")
        graph.add_edge("format", END)
        result = graph.compile().invoke({"user_email": user_email, "query": query, "top_k": top_k})
        return str(result.get("context") or "")
    except Exception as e:
        print(f"LangGraph interview memory pipeline fallback: {e}")
        records = retrieve_interview_memory(user_email, query, supabase_client, top_k)
        return "\n".join(record.get("text", "") for record in records)


def check_interview_vector_storage(supabase_client) -> dict[str, Any]:
    """Check Supabase Storage plus the local embedding and FAISS serialization pipeline."""
    test_path = f"{INTERVIEW_VECTOR_PREFIX}/_healthcheck.json"
    index_path = f"{INTERVIEW_VECTOR_PREFIX}/_healthcheck.faiss.index"
    payload = json.dumps({"ok": True, "ts": datetime.now(timezone.utc).isoformat()}).encode("utf-8")
    try:
        faiss = _get_faiss()
        sample_embeddings = _embed_texts(["candidate interview memory health check"])
        index = faiss.IndexFlatL2(sample_embeddings.shape[1])
        index.add(sample_embeddings)

        bucket = supabase_client.storage.from_(INTERVIEW_VECTOR_BUCKET)
        try:
            bucket.upload(test_path, payload, {"content-type": "application/json", "upsert": "true"})
        except TypeError:
            bucket.upload(path=test_path, file=payload, file_options={"content-type": "application/json", "upsert": "true"})
        index_bytes = bytes(faiss.serialize_index(index))
        try:
            bucket.upload(index_path, index_bytes, {"content-type": "application/octet-stream", "upsert": "true"})
        except TypeError:
            bucket.upload(path=index_path, file=index_bytes, file_options={"content-type": "application/octet-stream", "upsert": "true"})
        downloaded = bucket.download(test_path)
        downloaded_index = bucket.download(index_path)
        restored = faiss.deserialize_index(np.frombuffer(downloaded_index, dtype="uint8"))
        data = json.loads(downloaded.decode("utf-8"))
        return {
            "ok": bool(data.get("ok")) and restored.ntotal == 1,
            "bucket": INTERVIEW_VECTOR_BUCKET,
            "path": test_path,
            "index_path": index_path,
            "embedding_dimension": int(sample_embeddings.shape[1]),
            "faiss_vectors": int(restored.ntotal),
            "backend": INTERVIEW_VECTOR_BACKEND,
        }
    except Exception as e:
        return {"ok": False, "bucket": INTERVIEW_VECTOR_BUCKET, "path": test_path, "error": str(e)}
