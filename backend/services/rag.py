import os
import io
import json
import numpy as np

# In-memory document store
DOC_STORE = []
INDEX = None
EMBEDDINGS = None
model = None
DIMENSION = 384 # For all-MiniLM-L6-v2
RAG_VECTOR_BUCKET = os.getenv("RAG_VECTOR_BUCKET", "rag-vectors")
RAG_VECTOR_PREFIX = os.getenv("RAG_VECTOR_PREFIX", "knowledge-base")
RAG_VECTOR_BACKEND = os.getenv("RAG_VECTOR_BACKEND", "numpy").lower()


def _get_model():
    global model
    if model is None:
        print("Loading RAG Knowledge Model...")
        try:
            from sentence_transformers import SentenceTransformer
            model = SentenceTransformer("all-MiniLM-L6-v2")
        except Exception as e:
            print(f"RAG Model failed to load: {e}")
            return None
    return model


def _use_faiss() -> bool:
    return RAG_VECTOR_BACKEND == "faiss"


def _get_faiss():
    try:
        import faiss
        return faiss
    except Exception as e:
        print(f"FAISS backend requested but faiss-cpu is unavailable: {e}")
        return None


def _get_supabase():
    try:
        from supabase_client import supabase
        return supabase
    except Exception as e:
        print(f"Supabase vector storage unavailable: {e}")
        return None


def _storage_path(name: str) -> str:
    return f"{RAG_VECTOR_PREFIX}/{name}"


def _download_vector_blob(name: str) -> bytes | None:
    supabase = _get_supabase()
    if supabase is None:
        return None
    try:
        return supabase.storage.from_(RAG_VECTOR_BUCKET).download(_storage_path(name))
    except Exception as e:
        print(f"Vector storage download skipped for {name}: {e}")
        return None


def _upload_vector_blob(name: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    supabase = _get_supabase()
    if supabase is None:
        return
    try:
        supabase.storage.from_(RAG_VECTOR_BUCKET).upload(
            _storage_path(name),
            data,
            {"content-type": content_type, "upsert": "true"},
        )
    except Exception as e:
        print(f"Vector storage upload skipped for {name}: {e}")


def _serialize_embeddings(embeddings: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    np.save(buffer, embeddings)
    return buffer.getvalue()


def _deserialize_embeddings(data: bytes) -> np.ndarray:
    return np.load(io.BytesIO(data)).astype("float32")


def _load_faiss_from_storage():
    global DOC_STORE, INDEX, EMBEDDINGS
    faiss = _get_faiss()
    if faiss is None:
        return False

    index_blob = _download_vector_blob("faiss.index")
    embeddings_blob = _download_vector_blob("embeddings.npy")
    metadata_blob = _download_vector_blob("metadata.json")
    if not index_blob or not embeddings_blob or not metadata_blob:
        return False

    try:
        INDEX = faiss.deserialize_index(np.frombuffer(index_blob, dtype="uint8"))
        EMBEDDINGS = _deserialize_embeddings(embeddings_blob)
        metadata = json.loads(metadata_blob.decode("utf-8"))
        DOC_STORE = metadata.get("documents", [])
        print(f"Loaded FAISS RAG index from Supabase Storage with {len(DOC_STORE)} documents.")
        return True
    except Exception as e:
        print(f"Failed to restore FAISS index from Supabase Storage: {e}")
        return False


def _save_faiss_to_storage() -> None:
    if not _use_faiss() or INDEX is None or EMBEDDINGS is None:
        return
    faiss = _get_faiss()
    if faiss is None:
        return

    try:
        _upload_vector_blob("faiss.index", bytes(faiss.serialize_index(INDEX)))
        _upload_vector_blob("embeddings.npy", _serialize_embeddings(EMBEDDINGS))
        metadata = json.dumps({"documents": DOC_STORE}, ensure_ascii=False).encode("utf-8")
        _upload_vector_blob("metadata.json", metadata, "application/json")
    except Exception as e:
        print(f"Failed to persist FAISS index to Supabase Storage: {e}")

def initialize_knowledge_base():
    global INDEX, DOC_STORE, EMBEDDINGS
    if _use_faiss() and _load_faiss_from_storage():
        return
    
    # Sample Knowledge Data
    sample_data = [
        {"text": "B-Trees are self-balancing search trees commonly used in databases.", "source": "Lesson: Data Structures"},
        {"text": "A Dockerfile is a text document that contains all the commands a user could call on the command line to assemble an image.", "source": "Lesson: DevOps"},
        {"text": "Interview Tips: Always explain your brute-force solution first before optimizing to O(n) or O(log n).", "source": "Interview Prep"},
        {"text": "RESTful APIs use HTTP requests to GET, PUT, POST and DELETE data. They are stateless.", "source": "Lesson: Backend"},
    ]
    
    DOC_STORE = sample_data
    texts = [d['text'] for d in sample_data]
    
    loaded_model = _get_model()
    if loaded_model:
        embeddings = loaded_model.encode(texts)
        EMBEDDINGS = np.array(embeddings).astype('float32')
        if _use_faiss():
            faiss = _get_faiss()
            if faiss is not None:
                INDEX = faiss.IndexFlatL2(EMBEDDINGS.shape[1])
                INDEX.add(EMBEDDINGS)
                _save_faiss_to_storage()
            else:
                INDEX = EMBEDDINGS
        else:
            INDEX = EMBEDDINGS
        print(f"Knowledge base initialized with {len(texts)} documents.")

def search_knowledge(query, top_k=3):
    if INDEX is None:
        initialize_knowledge_base()

    if model is None or INDEX is None or not DOC_STORE:
        return []
        
    query_vec = np.array(model.encode([query])).astype('float32')
    if _use_faiss() and hasattr(INDEX, "search"):
        _, indices = INDEX.search(query_vec, top_k)
        nearest_indices = indices[0]
    else:
        distances = np.linalg.norm(INDEX - query_vec[0], axis=1)
        nearest_indices = np.argsort(distances)[:top_k]
    
    results = []
    for idx in nearest_indices:
        if idx < len(DOC_STORE):
            results.append(DOC_STORE[int(idx)])
            
    return results

def inject_rag_context(prompt, query):
    knowledge = search_knowledge(query)
    if not knowledge: return prompt
    
    context_str = "\n".join([f"- {k['text']} (Source: {k['source']})" for k in knowledge])
    
    rag_prompt = f"""
    CONTEXT FROM EDUNOVAS KNOWLEDGE BASE:
    {context_str}
    
    ---
    
    Using the context above (if relevant), please address the following user query.
    
    USER QUERY: {query}
    """
    return rag_prompt
