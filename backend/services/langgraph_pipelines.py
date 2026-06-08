from typing import Any, Callable, TypedDict


class CodingMentorState(TypedDict, total=False):
    code: str
    language: str
    execution: dict[str, Any]
    analysis: dict[str, Any]


class QuizGenerationState(TypedDict, total=False):
    subject: str
    topic: str
    difficulty: str
    mode: str
    domain: str | None
    subtopic: str | None
    questions: list[dict[str, Any]]


class QuizFeedbackState(TypedDict, total=False):
    results: list[dict[str, Any]]
    subject: str
    topic: str
    mastery: dict[str, float]
    feedback: dict[str, Any]


class NotesGenerationState(TypedDict, total=False):
    topic: str
    subtopic: str
    domain: str
    rag_context: str
    notes: dict[str, Any]


class TeacherDoubtAttachmentState(TypedDict, total=False):
    file_bytes: bytes
    filename: str
    extension: str
    label: str
    is_supported: bool
    extracted_text: str
    context: str
    error: str | None


def _run_state_graph(
    state_schema: type,
    initial_state: dict[str, Any],
    nodes: list[tuple[str, Callable[[dict[str, Any]], dict[str, Any]]]],
) -> dict[str, Any]:
    """Run a small LangGraph pipeline with deterministic sequential fallback."""
    try:
        from langgraph.graph import END, StateGraph

        graph = StateGraph(state_schema)
        for name, fn in nodes:
            graph.add_node(name, fn)
        graph.set_entry_point(nodes[0][0])
        for index in range(len(nodes) - 1):
            graph.add_edge(nodes[index][0], nodes[index + 1][0])
        graph.add_edge(nodes[-1][0], END)
        return dict(graph.compile().invoke(initial_state))
    except Exception as e:
        print(f"LangGraph pipeline fallback: {e}")
        state = dict(initial_state)
        for _, fn in nodes:
            state = fn(state)
        return state


def run_coding_mentor_graph(
    code: str,
    language: str,
    execute_fn: Callable[[str, str], dict[str, Any]],
    analyze_fn: Callable[[str, str, dict[str, Any]], dict[str, Any]],
) -> dict[str, Any]:
    def execute_node(state: CodingMentorState) -> CodingMentorState:
        state["execution"] = execute_fn(state["code"], state["language"])
        return state

    def analyze_node(state: CodingMentorState) -> CodingMentorState:
        state["analysis"] = analyze_fn(state["code"], state["language"], state["execution"])
        return state

    def finalize_node(state: CodingMentorState) -> CodingMentorState:
        analysis = state.get("analysis") or {}
        analysis["execution"] = state.get("execution") or {}
        state["analysis"] = analysis
        return state

    final = _run_state_graph(
        CodingMentorState,
        {"code": code, "language": language},
        [("execute", execute_node), ("analyze", analyze_node), ("finalize", finalize_node)],
    )
    return final.get("analysis") or {}


def run_quiz_generation_graph(
    subject: str,
    topic: str,
    difficulty: str,
    mode: str,
    domain: str | None,
    subtopic: str | None,
    generate_fn: Callable[[QuizGenerationState], list[dict[str, Any]]],
    enrich_fn: Callable[[list[dict[str, Any]], QuizGenerationState], list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    def generate_node(state: QuizGenerationState) -> QuizGenerationState:
        state["questions"] = generate_fn(state)
        return state

    def enrich_node(state: QuizGenerationState) -> QuizGenerationState:
        state["questions"] = enrich_fn(state.get("questions") or [], state)
        return state

    final = _run_state_graph(
        QuizGenerationState,
        {
            "subject": subject,
            "topic": topic,
            "difficulty": difficulty,
            "mode": mode,
            "domain": domain,
            "subtopic": subtopic,
        },
        [("generate", generate_node), ("enrich_visuals", enrich_node)],
    )
    return final.get("questions") or []


def run_quiz_feedback_graph(
    results: list[dict[str, Any]],
    subject: str,
    topic: str,
    mastery_fn: Callable[[list[dict[str, Any]]], dict[str, float]],
    feedback_fn: Callable[[list[dict[str, Any]], str, str, dict[str, float]], dict[str, Any]],
) -> dict[str, Any]:
    def mastery_node(state: QuizFeedbackState) -> QuizFeedbackState:
        state["mastery"] = mastery_fn(state["results"])
        return state

    def feedback_node(state: QuizFeedbackState) -> QuizFeedbackState:
        state["feedback"] = feedback_fn(state["results"], state["subject"], state["topic"], state["mastery"])
        return state

    final = _run_state_graph(
        QuizFeedbackState,
        {"results": results, "subject": subject, "topic": topic},
        [("calculate_mastery", mastery_node), ("generate_feedback", feedback_node)],
    )
    return final.get("feedback") or {}


def run_notes_generation_graph(
    topic: str,
    subtopic: str,
    domain: str,
    rag_fn: Callable[[str, str, str], str],
    notes_fn: Callable[[str, str, str, str], dict[str, Any]],
) -> dict[str, Any]:
    def rag_node(state: NotesGenerationState) -> NotesGenerationState:
        state["rag_context"] = rag_fn(state["topic"], state["subtopic"], state["domain"])
        return state

    def notes_node(state: NotesGenerationState) -> NotesGenerationState:
        state["notes"] = notes_fn(state["topic"], state["subtopic"], state["domain"], state.get("rag_context") or "")
        return state

    final = _run_state_graph(
        NotesGenerationState,
        {"topic": topic, "subtopic": subtopic, "domain": domain},
        [("retrieve_context", rag_node), ("generate_notes_json", notes_node)],
    )
    return final.get("notes") or {}


def run_teacher_doubt_attachment_graph(
    file_bytes: bytes,
    filename: str,
    extract_fn: Callable[[bytes, str], str | None],
) -> dict[str, Any]:
    """Run a 7-step pipeline for doubt attachments: metadata, validation, extraction, and context."""

    supported_extensions = {"pdf", "doc", "docx", "png", "jpg", "jpeg", "webp"}

    def metadata_node(state: TeacherDoubtAttachmentState) -> TeacherDoubtAttachmentState:
        safe_filename = state.get("filename") or "attachment"
        state["filename"] = safe_filename
        state["extension"] = safe_filename.rsplit(".", 1)[-1].lower() if "." in safe_filename else ""
        return state

    def support_node(state: TeacherDoubtAttachmentState) -> TeacherDoubtAttachmentState:
        ext = state.get("extension", "")
        state["is_supported"] = ext in supported_extensions
        if not state["is_supported"]:
            state["error"] = "Unsupported attachment type. Upload a PDF, DOCX, or image."
        return state

    def label_node(state: TeacherDoubtAttachmentState) -> TeacherDoubtAttachmentState:
        ext = state.get("extension", "")
        if ext == "pdf":
            state["label"] = "Attached PDF Context"
        elif ext in {"doc", "docx"}:
            state["label"] = "Attached Document Context"
        elif ext in {"png", "jpg", "jpeg", "webp"}:
            state["label"] = "Attached Image OCR Context"
        else:
            state["label"] = "Attached File Context"
        return state

    def extract_node(state: TeacherDoubtAttachmentState) -> TeacherDoubtAttachmentState:
        if not state.get("is_supported"):
            return state
        text = extract_fn(state["file_bytes"], state["filename"]) or ""
        state["extracted_text"] = text
        if not text.strip():
            state["error"] = "Could not extract readable text from the attachment."
        return state

    def normalize_node(state: TeacherDoubtAttachmentState) -> TeacherDoubtAttachmentState:
        text = state.get("extracted_text", "")
        state["extracted_text"] = "\n".join(line.strip() for line in text.splitlines() if line.strip())
        return state

    def trim_node(state: TeacherDoubtAttachmentState) -> TeacherDoubtAttachmentState:
        text = state.get("extracted_text", "")
        state["extracted_text"] = text[:8000]
        return state

    def context_node(state: TeacherDoubtAttachmentState) -> TeacherDoubtAttachmentState:
        text = state.get("extracted_text", "")
        label = state.get("label", "Attached File Context")
        state["context"] = f"[{label} from {state.get('filename', 'attachment')}]:\n{text}" if text else ""
        return state

    final = _run_state_graph(
        TeacherDoubtAttachmentState,
        {"file_bytes": file_bytes, "filename": filename},
        [
            ("read_metadata", metadata_node),
            ("validate_type", support_node),
            ("classify_context", label_node),
            ("extract_text_or_ocr", extract_node),
            ("normalize_text", normalize_node),
            ("trim_context", trim_node),
            ("build_prompt_context", context_node),
        ],
    )
    return {
        "text": final.get("extracted_text", ""),
        "context": final.get("context", ""),
        "label": final.get("label", "Attached File Context"),
        "error": final.get("error"),
    }
