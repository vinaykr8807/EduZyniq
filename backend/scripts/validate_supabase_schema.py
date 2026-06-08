import sys
from pathlib import Path
from typing import Iterable


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from supabase_client import supabase  # noqa: E402


EXPECTED_TABLE_COLUMNS: dict[str, list[str]] = {
    "users": ["id", "email", "full_name", "password_hash", "role", "created_at"],
    "student_profiles": [
        "id",
        "user_id",
        "degree",
        "branch",
        "academic_year",
        "domain",
        "skills",
        "created_at",
    ],
    "chat_messages": ["id", "user_id", "role", "content", "mode", "timestamp"],
    "user_progress": [
        "id",
        "user_id",
        "points",
        "level",
        "streak_days",
        "badges",
        "career_phase",
        "knowledge_graph",
        "last_active",
    ],
    "teacher_progress": [
        "id",
        "user_id",
        "domain",
        "roadmap_id",
        "phase_name",
        "phase_index",
        "milestone_title",
        "milestone_index",
        "status",
        "notes_path",
        "completed_at",
        "created_at",
        "updated_at",
    ],
    "interview_sessions": [
        "id",
        "user_id",
        "role",
        "domain",
        "level",
        "readiness_score",
        "extracted_skills",
        "matched_skills",
        "missing_skills",
        "market_skills",
        "strong_domains",
        "ats_score",
        "session_date",
        "created_at",
    ],
    "quiz_sessions": ["id", "user_id", "domain", "subject", "topic", "score", "weak_areas", "created_at"],
    "quiz_history": [
        "id",
        "user_id",
        "topic",
        "score",
        "weak_areas",
        "quiz_mode",
        "average_confidence",
        "date",
    ],
    "progress_tracking": [
        "id",
        "user_id",
        "topic",
        "confidence_score",
        "mastery_level",
        "topic_status",
        "last_practiced",
        "times_attempted",
    ],
    "coding_sessions": ["id", "user_id", "language", "optimization_score", "bugs_found", "created_at"],
    "mock_interview_sessions": [
        "id",
        "user_id",
        "role",
        "domain",
        "language",
        "avg_score",
        "weak_areas",
        "num_questions",
        "session_kind",
        "readiness_score",
        "eye_contact_score",
        "confidence_score",
        "speech_clarity_score",
        "body_language_score",
        "posture_score",
        "expression_score",
        "communication_score",
        "presence_alerts",
        "room_summary",
        "report",
        "created_at",
    ],
    "market_insights": ["id", "user_id", "role", "domain", "type", "result", "evidence_count", "created_at"],
    "career_reports": [
        "id",
        "user_id",
        "role",
        "city",
        "readiness_score",
        "resume_match_score",
        "evidence_count",
        "report",
        "created_at",
    ],
    "job_notifications": [
        "id",
        "user_id",
        "role",
        "city",
        "min_score",
        "is_active",
        "last_notified_at",
        "created_at",
        "updated_at",
    ],
    "job_matches": ["id", "user_id", "job_link", "match_score", "created_at"],
    "coding_errors": ["id", "user_id", "language", "mistake_type", "frequency"],
    "adaptive_learning_logs": [
        "id",
        "user_id",
        "subtopic",
        "gap_analysis",
        "remediation_steps",
        "resolved",
        "created_at",
    ],
}

EXPECTED_BUCKETS = {"resumes", "student-notes", "rag-vectors"}


def _select_columns(columns: Iterable[str]) -> str:
    return ",".join(columns)


def validate_tables() -> list[str]:
    failures: list[str] = []
    for table_name, columns in EXPECTED_TABLE_COLUMNS.items():
        try:
            supabase.table(table_name).select(_select_columns(columns)).limit(1).execute()
            print(f"OK table {table_name}: {len(columns)} expected columns")
        except Exception as error:
            failures.append(f"{table_name}: {error}")
            print(f"FAIL table {table_name}: {error}")
    return failures


def validate_buckets() -> list[str]:
    try:
        buckets = supabase.storage.list_buckets()
    except Exception as error:
        print(f"FAIL storage buckets: {error}")
        return [f"storage.buckets: {error}"]

    found = {getattr(bucket, "name", None) or getattr(bucket, "id", None) for bucket in buckets}
    found = {name for name in found if name}
    missing = sorted(EXPECTED_BUCKETS - found)
    if not missing:
        print(f"OK storage buckets: {', '.join(sorted(EXPECTED_BUCKETS))}")
        return []

    print(f"FAIL storage buckets missing: {', '.join(missing)}")
    return [f"storage.buckets missing: {', '.join(missing)}"]


def main() -> int:
    print("Validating Supabase schema against backend contract...")
    failures = validate_tables()
    failures.extend(validate_buckets())

    if failures:
        print("\nSchema validation failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("\nSchema validation passed. Backend tables and storage buckets match.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
