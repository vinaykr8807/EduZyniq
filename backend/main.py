from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List, Any, Mapping, cast
import re
import os
import mimetypes
import asyncio
import time
from contextlib import asynccontextmanager
from router import detect_mode
from llm_service import generate_response, extract_text_from_file, analyze_resume_domain
from auth_service import get_password_hash, verify_password, create_access_token, decode_access_token
from supabase_client import supabase, run_with_supabase_retry, is_transient_supabase_error
from datetime import datetime, timezone
from assistants.interview_coach import analyze_resume_deep
from assistants.ats_coach import calculate_ats_score
from assistants.quiz_master import generate_dynamic_quiz, generate_quiz_feedback
from assistants.coding_mentor import analyze_code_deep
from services.pdf_generator import generate_roadmap_pdf
from services.career_pathfinder import generate_career_report
from services.teacher_service import explain_subtopic, generate_topic_notes_pdf, get_market_skills, get_pro_coach_beginner_guide
from services.langgraph_pipelines import run_teacher_doubt_attachment_graph
from services.historical_market_data import historical_service, risk_service
from services.notification_service import notification_service
from services.mock_interview_service import build_mock_plan, generate_mock_question, evaluate_mock_answer, evaluate_coding_answer, run_code_against_tests, save_mock_session
from services.interview_room_service import analyze_webcam_frame, analyze_speech_clarity
from services.interview_memory_service import check_interview_vector_storage, retrieve_interview_memory
from services.neo4j_flow_service import neo4j_flow_service

import redis
try:
    redis_client = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
    redis_client.ping()
except Exception as e:
    redis_client = None

app = FastAPI()

_default_cors_origins = "http://localhost:5173,http://127.0.0.1:5173"
allowed_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", _default_cors_origins).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PUBLIC_PATHS = {
    "/",
    "/favicon.ico",
    "/health",
    "/login",
    "/signup",
}
PUBLIC_PREFIXES = ("/docs", "/redoc", "/openapi.json")
ADMIN_PREFIXES = ("/admin",)
ADMIN_PATHS = {"/job-agent/run-crawler"}
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))


def _unauthorized(message: str, code: int = status.HTTP_401_UNAUTHORIZED) -> JSONResponse:
    return JSONResponse(status_code=code, content={"detail": message})


@app.middleware("http")
async def require_authenticated_api(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    if path in PUBLIC_PATHS or any(path.startswith(prefix) for prefix in PUBLIC_PREFIXES):
        return await call_next(request)

    auth_header = request.headers.get("authorization", "")
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return _unauthorized("Missing bearer token")

    payload = decode_access_token(token)
    if not payload:
        return _unauthorized("Invalid or expired token")

    token_email = payload.get("sub")
    token_role = payload.get("role", "student")
    if not isinstance(token_email, str) or not token_email:
        return _unauthorized("Invalid token subject")

    if (path.startswith(ADMIN_PREFIXES) or path in ADMIN_PATHS) and token_role != "admin":
        return _unauthorized("Admin access required", status.HTTP_403_FORBIDDEN)

    query_email = request.query_params.get("user_email")
    if query_email and query_email.lower() != token_email.lower() and token_role != "admin":
        return _unauthorized("Cannot access another user's data", status.HTTP_403_FORBIDDEN)

    request.state.user_email = token_email
    request.state.user_role = token_role
    return await call_next(request)

@app.get("/")
def read_root():
    return {
        "message": "Welcome to EduZyniq AI Backend",
        "status": "Online",
        "documentation": "/docs",
        "health": "/health"
    }

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return {"message": "No favicon available"}


def _sanitize_filename(filename: str) -> str:
    if not filename:
        return "resume.pdf"
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", filename)
    safe_str = str(safe_name)
    return safe_str[:180]


def _detect_resume_content_type(filename: str) -> str:
    suffix = os.path.splitext(filename or "")[1].lower()
    explicit_types = {
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
    }
    if suffix in explicit_types:
        return explicit_types[suffix]

    guessed_type, _ = mimetypes.guess_type(filename or "")
    allowed_types = set(explicit_types.values())
    if guessed_type in allowed_types:
        return guessed_type

    raise ValueError("Unsupported resume file type. Upload PDF, DOC, DOCX, JPG, or PNG.")


def _ensure_filename(filename: Optional[str], default: str = "resume.pdf") -> str:
    return filename or default


def _validate_upload_size(contents: bytes, label: str = "file") -> Optional[str]:
    if len(contents) > MAX_UPLOAD_BYTES:
        max_mb = MAX_UPLOAD_BYTES // (1024 * 1024)
        return f"{label.capitalize()} is too large. Maximum allowed size is {max_mb} MB."
    return None


def _result_rows(result: Any) -> list[dict[str, Any]]:
    data = getattr(result, "data", None)
    if not isinstance(data, list):
        return []
    return [cast(dict[str, Any], item) for item in data if isinstance(item, dict)]


def _first_row(result: Any) -> Optional[dict[str, Any]]:
    rows = _result_rows(result)
    return rows[0] if rows else None


def _row_str(row: Optional[Mapping[str, Any]], key: str, default: Optional[str] = None) -> Optional[str]:
    if row is None:
        return default
    value = row.get(key)
    return value if isinstance(value, str) else default


def _row_int(row: Optional[Mapping[str, Any]], key: str, default: int = 0) -> int:
    if row is None:
        return default
    value = row.get(key)
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    return default


def _row_float(row: Optional[Mapping[str, Any]], key: str, default: float = 0.0) -> float:
    if row is None:
        return default
    value = row.get(key)
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    return default


def _row_list(row: Optional[Mapping[str, Any]], key: str) -> list[Any]:
    if row is None:
        return []
    value = row.get(key)
    return value if isinstance(value, list) else []


def _get_user_id_by_email(user_email: str) -> Optional[str]:
    if not user_email:
        return None
    user_result = supabase.table("users").select("id").eq("email", user_email).execute()
    row = _first_row(user_result)
    return _row_str(row, "id")


def _default_progress_response(user_email: str, error: Optional[str] = None) -> dict[str, Any]:
    response: dict[str, Any] = {
        "id": user_email or "guest",
        "points": 0,
        "level": 1,
        "streak_days": 1,
        "badges": [],
        "career_phase": "Foundational",
        "last_active": datetime.now(timezone.utc).isoformat(),
        "profile_completed": False,
        "is_guest": True,
    }
    if error:
        response["warning"] = error
    return response


def _is_transient_supabase_error(error: Exception) -> bool:
    return is_transient_supabase_error(error)


def _verify_recent_interview_session(record: dict[str, Any]) -> bool:
    try:
        result = (
            supabase.table("interview_sessions")
            .select("id")
            .eq("user_id", record["user_id"])
            .eq("role", record["role"])
            .eq("domain", record["domain"])
            .eq("level", record["level"])
            .eq("readiness_score", record["readiness_score"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return bool(_result_rows(result))
    except Exception:
        return False


def _store_resume_for_user(contents: bytes, original_filename: str, user_email: Optional[str]) -> Optional[str]:
    user_id = _get_user_id_by_email(user_email) if user_email else None
    if not user_id:
        return None

    timestamp = int(datetime.now().timestamp())
    safe_name = _sanitize_filename(original_filename)
    storage_path = f"users/{user_id}/{timestamp}_{safe_name}"
    content_type = _detect_resume_content_type(original_filename)
    supabase.storage.from_("resumes").upload(
        storage_path,
        contents,
        {"content-type": content_type, "upsert": "true"},
    )
    return storage_path


def _get_latest_resume_path_for_user(user_email: str) -> Optional[str]:
    user_id = _get_user_id_by_email(user_email)
    if not user_id:
        return None

    folder = f"users/{user_id}"
    try:
        files = supabase.storage.from_("resumes").list(folder)
    except Exception as e:
        print(f"Resume list error: {e}")
        return None

    if not files:
        return None

    latest_name = None
    latest_ts = -1
    for item in files:
        name = item.get("name")
        if not name:
            continue
        m = re.match(r"^(\d+)_", name)
        ts = int(m.group(1)) if m else 0
        if ts > latest_ts:
            latest_ts = ts
            latest_name = name

    if not latest_name:
        return None
    return f"{folder}/{latest_name}"


def _load_resume_text(file: Optional[UploadFile], user_email: Optional[str]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    # Returns (text, source_path, error)
    if file is not None:
        contents = file.file.read()
        size_error = _validate_upload_size(contents, "resume")
        if size_error:
            return None, None, size_error
        filename = _ensure_filename(file.filename, "resume")
        text = extract_text_from_file(contents, filename)
        if not text:
            return None, None, "Text extraction failed. Please upload a readable PDF/DOCX/Image resume."

        source_path = None
        if user_email:
            try:
                source_path = _store_resume_for_user(contents, filename, user_email)
            except Exception as e:
                print(f"Supabase storage upload error: {e}")

        return text, source_path, None

    if not user_email:
        return None, None, "Please upload a resume first, or sign in to use your stored resume."

    latest_path = _get_latest_resume_path_for_user(user_email)
    if not latest_path:
        return None, None, "No stored resume found. Please upload your resume once."

    try:
        contents = supabase.storage.from_("resumes").download(latest_path)
        filename = latest_path.split("/")[-1]
        text = extract_text_from_file(contents, filename)
        if not text:
            return None, latest_path, "Stored resume found but text extraction failed. Upload a clearer resume."
        return text, latest_path, None
    except Exception as e:
        print(f"Supabase resume download error: {e}")
        return None, latest_path, "Failed to fetch stored resume from Supabase."

@app.get("/health")
def health():
    return {"status": "ok", "message": "EduZyniq Backend is Alive"}

class UserAuth(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None
    role: Optional[str] = "student"

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    email: str
    full_name: Optional[str] = None

class StudentProfileSchema(BaseModel):
    degree: Optional[str] = None
    branch: Optional[str] = None
    year: Optional[str] = None
    domain: Optional[str] = None
    skills: List[str] = []

class ChatRequest(BaseModel):
    message: str
    mode: Optional[str] = "ROUTER"
    profile: Optional[StudentProfileSchema] = None
    user_email: Optional[str] = None

class QuizSubmission(BaseModel):
    user_email: str
    topic: str
    score: int
    weak_areas: List[str]
    subject: Optional[str] = "General"
    domain: Optional[str] = "General"
    quiz_mode: Optional[str] = "standard"
    average_confidence: Optional[float] = 0.0

class ExplanationEvaluationRequest(BaseModel):
    user_email: str
    topic: str
    explanation: str
    subject: str

class QuizFeedbackRequest(BaseModel):
    results: List[dict]
    subject: str
    topic: str

class TargetedQuizRequest(BaseModel):
    user_email: str
    subject: str
    domain: str
    weak_areas: List[str]
    difficulty: str = "medium"

@app.post("/signup", response_model=Token)
def signup(user_data: UserAuth):
    existing = supabase.table('users').select('*').eq('email', user_data.email).execute()
    if _result_rows(existing):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = supabase.table('users').insert({
        'email': user_data.email,
        'full_name': user_data.full_name or user_data.email,
        'password_hash': get_password_hash(user_data.password),
        'role': 'student'
    }).execute()
    
    user = _first_row(new_user)
    if user is None:
        raise HTTPException(status_code=500, detail="Unexpected response from database")
    access_token = create_access_token(data={"sub": user['email'], "role": user['role']})
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "role": user['role'], 
        "email": user['email'],
        "full_name": user.get('full_name') or user['email']
    }

@app.post("/login", response_model=Token)
def login(user_data: UserAuth):
    result = supabase.table('users').select('*').eq('email', user_data.email).execute()
    user = _first_row(result)
    password_hash = _row_str(user, 'password_hash')
    if user is None or not password_hash or not verify_password(user_data.password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token = create_access_token(data={"sub": user['email'], "role": user['role']})
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "role": user['role'], 
        "email": user['email'],
        "full_name": user.get('full_name') or user['email']
    }

@app.post("/chat")
def chat(req: ChatRequest):
    if req.mode == "ROUTER":
        mode = detect_mode(req.message)
    else:
        mode = req.mode
    profile_dict = None
    if req.profile:
        profile_dict = req.profile.dict()
    reply = generate_response(req.message, mode or "ROUTER", profile_dict)
    return {"mode": mode, "response": reply}

@app.post("/save-profile")
def save_profile(profile: StudentProfileSchema, user_email: str):
    user_result = supabase.table('users').select('id').eq('email', user_email).execute()
    user_row = _first_row(user_result)
    if user_row is None:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = _row_str(user_row, 'id')
    if not user_id:
        raise HTTPException(status_code=404, detail="User not found")
    existing = supabase.table('student_profiles').select('*').eq('user_id', user_id).execute()
    
    profile_data = {
        'user_id': user_id,
        'degree': profile.degree,
        'branch': profile.branch,
        'academic_year': profile.year,
        'domain': profile.domain,
        'skills': profile.skills
    }
    
    try:
        if _result_rows(existing):
            res = supabase.table('student_profiles').update(profile_data).eq('user_id', user_id).execute()
        else:
            res = supabase.table('student_profiles').insert(profile_data).execute()
        
        # Also ensure user progress exists
        supabase.table('user_progress').select('id').eq('user_id', user_id).execute()
        
        return {"success": True}
    except Exception as e:
        print(f"Profile Save Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/student/profile")
def get_user_profile(user_email: str):
    user_result = supabase.table('users').select('id').eq('email', user_email).execute()
    user_row = _first_row(user_result)
    if user_row is None:
        return {
            "profile": None,
            "has_stored_resume": False,
            "is_guest": True
        }
    
    user_id = _row_str(user_row, 'id')
    if not user_id:
        raise HTTPException(status_code=404)
    profile_result = supabase.table('student_profiles').select('*').eq('user_id', user_id).execute()
    
    # Also check resume status
    resume_status = get_resume_status(user_email)
    
    profile = _first_row(profile_result)
    return {
        "profile": profile,
        "has_stored_resume": resume_status.get("has_stored_resume", False),
        "is_guest": False
    }

@app.get("/student/progress")
def get_progress(user_email: str):
    try:
        user_result = run_with_supabase_retry(
            lambda client: client.table('users').select('id').eq('email', user_email).execute()
        )
    except Exception as e:
        print(f"Progress user lookup error: {e}")
        return _default_progress_response(user_email, "Progress is temporarily unavailable.")

    user_row = _first_row(user_result)
    if user_row is None:
        return _default_progress_response(user_email)

    user_id = _row_str(user_row, 'id')
    if not user_id:
        return _default_progress_response(user_email)

    try:
        prog_result = run_with_supabase_retry(
            lambda client: client.table('user_progress').select('*').eq('user_id', user_id).execute()
        )
    except Exception as e:
        print(f"Progress fetch error: {e}")
        return _default_progress_response(user_email, "Progress is temporarily unavailable.")

    existing_prog = _first_row(prog_result)
    
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    if existing_prog is None:
        try:
            new_prog = run_with_supabase_retry(
                lambda client: client.table('user_progress').insert({
                    'user_id': user_id,
                    'points': 0,
                    'level': 1,
                    'streak_days': 1,
                    'badges': [],
                    'career_phase': 'Foundational',
                    'last_active': now.isoformat()
                }).execute()
            )
            prog = _first_row(new_prog) or {
                'id': user_id, 'points': 0, 'level': 1, 'streak_days': 1,
                'badges': [], 'career_phase': 'Foundational', 'last_active': now.isoformat()
            }
        except Exception as e:
            print(f"Progress Init Error: {e}")
            prog = {
                'id': user_id, 'points': 0, 'level': 1, 'streak_days': 1,
                'badges': [], 'career_phase': 'Foundational', 'last_active': now.isoformat()
            }
    else:
        prog = existing_prog
        
    # Auto-calculate gamification and update if necessary
    points = _row_int(prog, 'points', 0)
    level_calculated = max(1, (points // 50) + 1)

    badges = set(str(item) for item in _row_list(prog, 'badges') if isinstance(item, str))
    if points >= 50: badges.add("Apprentice")
    if points >= 150: badges.add("Dedicated Learner")
    if points >= 300: badges.add("Code Ninja")
    if points >= 600: badges.add("Tech Wizard")
    
    streak = _row_int(prog, 'streak_days', 0)
    last_active_str = _row_str(prog, 'last_active')
    
    needs_update = False
    
    if last_active_str:
        try:
            # Parse handle with/without timezone
            las = last_active_str.replace("Z", "+00:00")
            last_active = datetime.fromisoformat(las)
            days_diff = (now.date() - last_active.date()).days
            
            if days_diff == 1:
                streak += 1
                needs_update = True
            elif days_diff > 1:
                streak = 1
                needs_update = True
        except ValueError:
            streak = 1
            needs_update = True
    else:
        streak = 1
        needs_update = True

    new_badges_list = list(badges)
    
    # Enforce chronological badge rarity ordering
    badge_tier = {"Apprentice": 1, "Dedicated Learner": 2, "Code Ninja": 3, "Tech Wizard": 4}
    new_badges_list.sort(key=lambda b: badge_tier.get(b, 5))
    
    if level_calculated != _row_int(prog, 'level', 1) or set(new_badges_list) != badges:
        needs_update = True
        
    if needs_update:
        try:
            run_with_supabase_retry(
                lambda client: client.table('user_progress').update({
                    'level': level_calculated,
                    'streak_days': streak,
                    'badges': new_badges_list,
                    'last_active': now.isoformat()
                }).eq('user_id', user_id).execute()
            )
        except Exception as e:
            print(f"Error auto-updating gamification: {e}")
            
    try:
        profile_result = run_with_supabase_retry(
            lambda client: client.table('student_profiles').select('*').eq('user_id', user_id).execute()
        )
        profile_completed = len(_result_rows(profile_result)) > 0
    except Exception as e:
        print(f"Progress profile lookup error: {e}")
        profile_completed = False
    
    return {
        "id": _row_str(prog, 'id', user_id) or user_id,
        "points": points,
        "level": level_calculated,
        "streak_days": streak,
        "badges": new_badges_list,
        "career_phase": _row_str(prog, 'career_phase', 'Foundational') or 'Foundational',
        "last_active": now.isoformat(),
        "profile_completed": profile_completed
    }

# ─────────────────────────────────────────────────────────────────
# Performance Tracking: Pydantic models
# ─────────────────────────────────────────────────────────────────

class TeacherProgressModel(BaseModel):
    user_email: str
    domain: str
    roadmap_id: str
    phase_name: str
    phase_index: int
    milestone_title: str
    milestone_index: int
    status: str = 'done'   # 'learning' | 'done'

class InterviewSessionModel(BaseModel):
    user_email: str
    role: str
    domain: str
    level: str
    readiness_score: int
    extracted_skills: List[str] = []
    matched_skills: List[str] = []
    missing_skills: List[str] = []
    market_skills: List[str] = []
    strong_domains: List[str] = []
    ats_score: Optional[dict] = None

@app.post("/save-teacher-progress")
def save_teacher_progress(request: Request, data: TeacherProgressModel):
    """Upsert a student's subtopic progress into Supabase."""
    data.user_email = getattr(request.state, "user_email", data.user_email)
    user_result = supabase.table('users').select('id').eq('email', data.user_email).execute()
    user_row = _first_row(user_result)
    if user_row is None:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = _row_str(user_row, 'id')
    if not user_id:
        raise HTTPException(status_code=404, detail="User not found")

    from datetime import timezone
    now = datetime.now(timezone.utc).isoformat()
    record = {
        'user_id': user_id,
        'domain': data.domain,
        'roadmap_id': data.roadmap_id,
        'phase_name': data.phase_name,
        'phase_index': data.phase_index,
        'milestone_title': data.milestone_title,
        'milestone_index': data.milestone_index,
        'status': data.status,
        'completed_at': now if data.status == 'done' else None,
        'updated_at': now
    }
    try:
        supabase.table('teacher_progress').upsert(
            record,
            on_conflict='user_id,roadmap_id,phase_index,milestone_index'
        ).execute()
        # Award XP: +15 per topic done
        if data.status == 'done':
            current_progress = supabase.table('user_progress').select('points').eq('user_id', user_id).execute()
            current_points = _row_int(_first_row(current_progress), 'points', 0)
            supabase.table('user_progress').update({'points': current_points + 15}).eq('user_id', user_id).execute()
        return {"success": True}
    except Exception as e:
        print(f"Teacher progress save error: {e}")
        return {"success": False, "error": str(e)}

@app.post("/save-interview-session")
def save_interview_session(request: Request, data: InterviewSessionModel):
    """Save a student's interview coach session results to Supabase."""
    data.user_email = getattr(request.state, "user_email", data.user_email)
    user_result = supabase.table('users').select('id').eq('email', data.user_email).execute()
    user_row = _first_row(user_result)
    if user_row is None:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = _row_str(user_row, 'id')
    if not user_id:
        raise HTTPException(status_code=404, detail="User not found")

    record = {
        'user_id': user_id,
        'role': data.role,
        'domain': data.domain,
        'level': data.level,
        'readiness_score': data.readiness_score,
        'extracted_skills': data.extracted_skills,
        'matched_skills': data.matched_skills,
        'missing_skills': data.missing_skills,
        'market_skills': data.market_skills,
        'strong_domains': data.strong_domains,
        'ats_score': data.ats_score or {}
    }
    try:
        supabase.table('interview_sessions').insert(record).execute()
        return {"success": True}
    except Exception as e:
        if _is_transient_supabase_error(e):
            if _verify_recent_interview_session(record):
                return {"success": True, "verified_after_disconnect": True}
            time.sleep(0.5)
            try:
                supabase.table('interview_sessions').insert(record).execute()
                return {"success": True, "retried_after_disconnect": True}
            except Exception as retry_error:
                print(f"Interview session save retry error: {retry_error}")
                raise HTTPException(status_code=503, detail=f"Interview session save failed after retry: {retry_error}") from retry_error

        print(f"Interview session save error: {e}")
        raise HTTPException(status_code=500, detail=f"Interview session save failed: {e}") from e

@app.get("/admin/analytics")
def get_analytics():
    """Aggregated analytics for admin dashboard."""
    users = supabase.table('users').select('id, email, full_name, created_at').eq('role', 'student').execute()
    profiles = supabase.table('student_profiles').select('skills, domain').execute()
    progress = supabase.table('user_progress').select('points').execute()
    user_rows = _result_rows(users)
    profile_rows = _result_rows(profiles)
    progress_rows = _result_rows(progress)

    # Skills from profiles
    skill_counts: dict = {}
    for p in profile_rows:
        for skill in _row_list(p, 'skills'):
            if isinstance(skill, str):
                skill_counts[skill] = skill_counts.get(skill, 0) + 1
    top_skills_pairs = sorted(skill_counts.items(), key=lambda x: x[1], reverse=True)
    top_skills = top_skills_pairs[:10]
    total_xp = sum(_row_int(p, 'points', 0) for p in progress_rows)

    # Domain distribution from teacher_progress (how many topics done per domain)
    try:
        tp = supabase.table('teacher_progress').select('domain').eq('status', 'done').execute()
        domain_dist: dict = {}
        for row in _result_rows(tp):
            d = _row_str(row, 'domain', 'Other') or 'Other'
            domain_dist[d] = domain_dist.get(d, 0) + 1
    except Exception:
        domain_dist = {}

    # Total teacher topics completed
    try:
        total_topics_done = supabase.table('teacher_progress').select('id', count='exact').eq('status', 'done').execute()
        topics_completed = total_topics_done.count or 0
    except Exception:
        topics_completed = 0

    # Total interview sessions
    try:
        interview_rows = supabase.table('interview_sessions').select('readiness_score').execute()
        interview_data = _result_rows(interview_rows)
        total_interviews = len(interview_data)
        avg_readiness = round(sum(_row_float(r, 'readiness_score', 0.0) for r in interview_data) / max(total_interviews, 1), 1) if total_interviews else 0
    except Exception:
        total_interviews = 0
        avg_readiness = 0

    try:
        live_mock_rows = supabase.table('mock_interview_sessions').select(
            'readiness_score, confidence_score, eye_contact_score, posture_score, speech_clarity_score, session_kind, num_questions, room_summary, report'
        ).eq('session_kind', 'live_room').execute()
        live_mock_data = [row for row in _result_rows(live_mock_rows) if _is_completed_mock_session(row)]
        live_room_sessions = len(live_mock_data)
        avg_live_readiness = round(sum(_row_float(r, 'readiness_score', 0.0) for r in live_mock_data) / max(live_room_sessions, 1), 1) if live_room_sessions else 0
        avg_live_confidence = round(sum(_row_float(r, 'confidence_score', 0.0) for r in live_mock_data) / max(live_room_sessions, 1), 1) if live_room_sessions else 0
    except Exception:
        live_room_sessions = 0
        avg_live_readiness = 0
        avg_live_confidence = 0
        
    # Code Optimization Avg
    try:
        coding_rows = supabase.table('coding_sessions').select('optimization_score').execute()
        coding_data = _result_rows(coding_rows)
        total_optimizations = len(coding_data)
        avg_optimization = round(sum(_row_float(r, 'optimization_score', 0.0) for r in coding_data) / max(total_optimizations, 1), 1) if total_optimizations else None
    except Exception:
        total_optimizations = 0
        avg_optimization = None

    # Quizzes
    try:
        quiz_rows = supabase.table('quiz_history').select('id').execute()
        total_quizzes = len(_result_rows(quiz_rows))
    except Exception:
        total_quizzes = 0

    return {
        "total_students": len(user_rows),
        "active_today": 0,
        "total_xp": total_xp,
        "total_interaction_hits": topics_completed,
        "total_interviews": total_interviews,
        "total_live_interviews": live_room_sessions,
        "total_optimizations": total_optimizations,  # Coding sessions completed
        "total_quizzes": total_quizzes,
        "avg_readiness_score": avg_readiness,
        "avg_live_readiness_score": avg_live_readiness,
        "avg_live_confidence_score": avg_live_confidence,
        "avg_optimization_score": avg_optimization,
        "domain_distribution": domain_dist,
        "top_skills": [{"name": k, "count": v} for k, v in top_skills]
    }

@app.get("/admin/student-performance")
def get_student_performance():
    """Per-student breakdown for admin: topics completed, interview scores, domains."""
    try:
        users = supabase.table('users').select('id, email, full_name, created_at').eq('role', 'student').execute()
        result = []
        for user in _result_rows(users):
            uid = _row_str(user, 'id')
            if not uid:
                continue

            # Teacher progress
            tp = supabase.table('teacher_progress').select('domain, roadmap_id, milestone_title, status, completed_at').eq('user_id', uid).execute()
            tp_rows = _result_rows(tp)
            done_topics = [r for r in tp_rows if _row_str(r, 'status') == 'done']
            domains_studied = list({_row_str(r, 'domain') for r in tp_rows if _row_str(r, 'domain')})

            # Interview sessions
            iv = supabase.table('interview_sessions').select('role, domain, level, readiness_score, session_date').eq('user_id', uid).order('session_date', desc=True).limit(10).execute()
            mock_iv = supabase.table('mock_interview_sessions').select(
                'role, domain, language, avg_score, readiness_score, confidence_score, eye_contact_score, posture_score, speech_clarity_score, created_at, num_questions, room_summary, report'
            ).eq('user_id', uid).order('created_at', desc=True).limit(20).execute()
            iv_rows = _result_rows(iv)
            mock_rows = [row for row in _result_rows(mock_iv) if _is_completed_mock_session(row)]
            mock_scores = [s for s in (_normalise_mock_readiness(row) for row in mock_rows) if s is not None]
            latest_mock = mock_rows[0] if mock_rows else None
            interview_history = []
            for row in iv_rows:
                interview_history.append({
                    "kind": "classic",
                    "score": _row_float(row, "readiness_score", 0.0),
                    "date": _row_str(row, "session_date"),
                    "role": _row_str(row, "role"),
                })
            for row in mock_rows:
                interview_history.append({
                    "kind": "live_room",
                    "score": _normalise_mock_readiness(row),
                    "date": _row_str(row, "created_at"),
                    "role": _row_str(row, "role"),
                })
            interview_history = sorted(
                [item for item in interview_history if item.get("score") is not None],
                key=lambda item: item.get("date") or "",
            )

            # XP
            prog = supabase.table('user_progress').select('points, level').eq('user_id', uid).execute()
            prog_row = _first_row(prog)
            xp = _row_int(prog_row, 'points', 0)
            level = _row_int(prog_row, 'level', 1)

            # Code optimizations
            coding = supabase.table('coding_sessions').select('optimization_score').eq('user_id', uid).execute()
            coding_rows = _result_rows(coding)
            avg_opt = round(sum(_row_float(c, 'optimization_score', 0.0) for c in coding_rows) / max(len(coding_rows), 1), 1) if coding_rows else None

            # Quizzes
            qz = supabase.table('quiz_history').select('score, weak_areas, topic').eq('user_id', uid).execute()
            qz_rows = _result_rows(qz)
            avg_quiz = round(sum(_row_float(q, 'score', 0.0) for q in qz_rows) / max(len(qz_rows), 1), 1) if qz_rows else None
            quiz_weak_areas: list[str] = []
            for quiz in qz_rows:
                explicit_weak = [item for item in _row_list(quiz, 'weak_areas') if isinstance(item, str)]
                if explicit_weak:
                    quiz_weak_areas.extend(explicit_weak)
                elif _row_float(quiz, 'score', 100.0) < 60:
                    topic = _row_str(quiz, 'topic')
                    if topic:
                        quiz_weak_areas.append(topic)
            quiz_weak_areas = list(dict.fromkeys(area.strip() for area in quiz_weak_areas if area and len(area.strip()) > 2))[:8]
            latest_mock_report = latest_mock.get('report', {}) if latest_mock and isinstance(latest_mock.get('report'), dict) else {}
            if quiz_weak_areas and not latest_mock_report.get('weak_areas'):
                latest_mock_report = {**latest_mock_report, "weak_areas": quiz_weak_areas}

            result.append({
                "user_id": uid,
                "email": _row_str(user, 'email'),
                "full_name": _row_str(user, 'full_name', _row_str(user, 'email')) or _row_str(user, 'email'),
                "joined": _row_str(user, 'created_at'),
                "xp": xp,
                "level": level,
                "topics_completed": len(done_topics),
                "total_topics_attempted": len(tp_rows),
                "domains_studied": [domain for domain in domains_studied if domain],
                "last_topic": _row_str(done_topics[-1], 'milestone_title') if done_topics else None,
                "interview_sessions": len(iv_rows) + len(mock_rows),
                "latest_readiness": _row_float(iv_rows[0], 'readiness_score', 0.0) if iv_rows else (mock_scores[0] if mock_scores else None),
                "avg_readiness": round(sum(_row_float(s, 'readiness_score', 0.0) for s in iv_rows) / max(len(iv_rows), 1), 1) if iv_rows else (round(sum(mock_scores) / max(len(mock_scores), 1), 1) if mock_scores else None),
                "last_interview_role": _row_str(iv_rows[0], 'role') if iv_rows else (_row_str(latest_mock, 'role') if latest_mock else None),
                "mock_room_sessions": len(mock_rows),
                "latest_mock_readiness": mock_scores[0] if mock_scores else None,
                "avg_mock_readiness": round(sum(mock_scores) / max(len(mock_scores), 1), 1) if mock_scores else None,
                "interview_readiness_trend": list(reversed(mock_scores[:5])),
                "interview_history": interview_history,
                "latest_mock_report": latest_mock_report,
                "latest_mock_metrics": {
                    "confidence": _row_float(latest_mock, 'confidence_score', 0.0) if latest_mock else None,
                    "eye_contact": _row_float(latest_mock, 'eye_contact_score', 0.0) if latest_mock else None,
                    "posture": _row_float(latest_mock, 'posture_score', 0.0) if latest_mock else None,
                    "speech_clarity": _row_float(latest_mock, 'speech_clarity_score', 0.0) if latest_mock else None,
                } if latest_mock else {},
                "code_optimizations_done": len(coding_rows),
                "avg_optimization_score": avg_opt,
                "quizzes_completed": len(qz_rows),
                "avg_quiz_score": avg_quiz
            })
        return {"students": result}
    except Exception as e:
        print(f"Student performance error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload-resume")
async def upload_resume(request: Request, file: UploadFile = File(...), user_email: Optional[str] = Form(None)):
    user_email = getattr(request.state, "user_email", user_email)
    contents = file.file.read()
    size_error = _validate_upload_size(contents, "resume")
    if size_error:
        raise HTTPException(status_code=413, detail=size_error)
    filename = _ensure_filename(file.filename)

    text = extract_text_from_file(contents, filename)
    if not text:
        return {"error": "Text extraction failed. Supported formats: PDF, DOCX, IMG."}

    storage_path = None
    if user_email:
        try:
            storage_path = _store_resume_for_user(contents, filename, user_email)
            print(f"Resume saved to storage: {storage_path}")
        except Exception as e:
            print(f"Supabase Storage Error: {e}")

    analysis = analyze_resume_domain(text)
    return {"success": True, "analysis": analysis, "stored_path": storage_path}


@app.get("/resume-status")
def get_resume_status(user_email: str):
    latest_path = _get_latest_resume_path_for_user(user_email)
    return {
        "has_stored_resume": bool(latest_path),
        "stored_path": latest_path
    }


@app.post("/analyze-resume")
async def analyze_resume_endpoint(
    request: Request,
    role: str = Form(...),
    level: str = Form(...),
    user_email: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    user_email = getattr(request.state, "user_email", user_email)
    text, source_path, error = _load_resume_text(file, user_email)
    if error:
        return {"error": error}
    analysis = analyze_resume_deep(text, role, level)
    analysis["source_resume_path"] = source_path
    
    # 🧬 Dynamic ATS Scoring Feature
    try:
        ats_data = calculate_ats_score(text, role)
        analysis["ats_score"] = ats_data
    except Exception as e:
        print(f"ATS Integration Error: {e}")
        
    return analysis


@app.post("/career-pathfinder")
async def career_pathfinder_endpoint(
    request: Request,
    role: str = Form(...),
    level: str = Form(...),
    city: str = Form(...),
    user_email: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    user_email = getattr(request.state, "user_email", user_email)
    text, source_path, error = _load_resume_text(file, user_email)
    if error:
        return {"error": error}
    report = generate_career_report(text, role, level, city, user_email=user_email)
    report["source_resume_path"] = source_path
    return report

class JobAgentSubscribeRequest(BaseModel):
    user_email: str
    role: str
    city: str
    min_score: int = 90

@app.post("/job-agent/subscribe")
def subscribe_job_agent_admin(request: Request, req: JobAgentSubscribeRequest):
    """Enable the AI Job Agent for daily automated notifications."""
    req.user_email = getattr(request.state, "user_email", req.user_email)
    try:
        user_res = supabase.table('users').select('id').eq('email', req.user_email).execute()
        user_row = _first_row(user_res)
        if user_row is None:
            raise HTTPException(status_code=404, detail="User not found.")
        user_id = _row_str(user_row, 'id')
        if not user_id:
            raise HTTPException(status_code=404, detail="User not found.")
        
        # Upsert subscription
        existing = supabase.table('job_notifications').select('*').eq('user_id', user_id).eq('role', req.role).eq('city', req.city).execute()
        existing_row = _first_row(existing)

        if existing_row:
            supabase.table('job_notifications').update({
                'is_active': True,
                'min_score': req.min_score,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }).eq('id', _row_str(existing_row, 'id')).execute()
        else:
            supabase.table('job_notifications').insert({
                'user_id': user_id,
                'role': req.role,
                'city': req.city,
                'min_score': req.min_score
            }).execute()
        
        return {"success": True, "message": "Subscribed to AI Job Alerts successfully!"}
    except Exception as e:
        print(f"Subscription error: {e}")
        return {"success": False, "error": str(e)}

@app.post("/job-agent/run-crawler")
def run_job_crawler_manual():
    """Manually trigger the background crawler to find jobs for all active subscribers."""
    from services.career_pathfinder import _search_jobs_multi_source, _extract_skills_from_text
    try:
        print("🔍 [Crawler] Fetching active subscribers...")
        subs = supabase.table('job_notifications').select('*, users(email)').eq('is_active', True).execute()
        sub_rows = _result_rows(subs)
        if not sub_rows:
            print("ℹ️ [Crawler] No active subscribers found.")
            return {"success": True, "message": "No active subscribers."}
            
        print(f"👥 [Crawler] Found {len(sub_rows)} active subscribers.")
        notifications_sent: int = 0
        for sub in sub_rows:
            user_id = _row_str(sub, 'user_id')
            users_nested = sub.get('users')
            user_email = _row_str(users_nested, 'email') if isinstance(users_nested, dict) else None
            role = _row_str(sub, 'role')
            city = _row_str(sub, 'city')
            min_score = _row_int(sub, 'min_score', 90)
            sub_id = _row_str(sub, 'id')
            if not user_id or not user_email or not role or not city:
                continue
            
            print(f"👤 [Crawler] Processing {user_email} (Role: {role}, City: {city})...")
            
            # Fetch user's latest resume to extract skills
            resume_res = supabase.table('student_profiles').select('skills').eq('user_id', user_id).execute()
            user_skills = [skill for skill in _row_list(_first_row(resume_res), 'skills') if isinstance(skill, str)]
            
            print(f"🔎 [Crawler] Searching jobs for {role} in {city}...")
            jobs = _search_jobs_multi_source(role, "Mid-Level", city, user_skills)
            print(f"🎯 [Crawler] Found {len(jobs)} potential matches for {user_email}.")
            
            high_matches = []
            for job in jobs:
                score = job.get('suitability_score', 0)
                link = job.get('link', '')
                if score >= min_score and link:
                    if not notification_service.was_notified(supabase, user_id, link):
                        high_matches.append(job)
                        notification_service.record_match(supabase, user_id, link, score)
                        
            if high_matches:
                print(f"✉️ [Crawler] Sending {len(high_matches)} notifications to {user_email}...")
                if notification_service.send_job_notification(user_email, high_matches):
                    notifications_sent += 1
                    if sub_id:
                        supabase.table('job_notifications').update({'last_notified_at': datetime.now(timezone.utc).isoformat()}).eq('id', sub_id).execute()
            else:
                print(f"⏭️ [Crawler] No new high-match jobs for {user_email}.")
                    
        return {"success": True, "message": f"Crawler finished. Sent {notifications_sent} notifications."}
    except Exception as e:
        print(f"❌ [Crawler] Error: {e}")
        return {"success": False, "error": str(e)}

@app.post("/generate-quiz")
def post_quiz_endpoint(
    subject: str = Form(...), 
    topic: str = Form(...), 
    difficulty: str = Form(...), 
    mode: str = Form("standard"), 
    domain: Optional[str] = Form(None), 
    subtopic: Optional[str] = Form(None)
):
    from assistants.quiz_master import generate_dynamic_quiz
    return generate_dynamic_quiz(subject, topic, difficulty, mode, domain, subtopic)

@app.get("/generate-quiz")
def get_quiz_endpoint(subject: str, topic: str, difficulty: str, mode: str = "standard", domain: Optional[str] = None, subtopic: Optional[str] = None):
    from assistants.quiz_master import generate_dynamic_quiz
    return generate_dynamic_quiz(subject, topic, difficulty, mode, domain, subtopic)

@app.post("/evaluate-explanation")
def evaluate_explanation_endpoint(request: Request, data: ExplanationEvaluationRequest):
    data.user_email = getattr(request.state, "user_email", data.user_email)
    from assistants.quiz_master import evaluate_student_explanation
    return evaluate_student_explanation(data.topic, data.explanation, data.subject)

@app.post("/submit-quiz")
def submit_quiz_endpoint(request: Request, data: QuizSubmission):
    data.user_email = getattr(request.state, "user_email", data.user_email)
    user_result = supabase.table('users').select('id').eq('email', data.user_email).execute()
    user_row = _first_row(user_result)
    if user_row is None:
        raise HTTPException(status_code=404, detail="User not found")

    user_id = _row_str(user_row, 'id')
    if not user_id:
        raise HTTPException(status_code=404, detail="User not found")
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    
    try:
        # 1. Update general points
        points_earned = 10 + (data.score // 10)
        current_progress = supabase.table('user_progress').select('points').eq('user_id', user_id).execute()
        current_progress_row = _first_row(current_progress)
        if current_progress_row:
            new_points = _row_int(current_progress_row, 'points', 0) + points_earned
            supabase.table('user_progress').update({'points': new_points}).eq('user_id', user_id).execute()
        
        # 2. Log quiz session (Legacy/Analytics)
        supabase.table('quiz_sessions').insert({
            'user_id': user_id,
            'domain': data.domain,
            'subject': data.subject,
            'topic': data.topic,
            'score': data.score,
            'weak_areas': data.weak_areas,
            'created_at': now
        }).execute()

        # 3. Log to quiz_history (New schema support)
        supabase.table('quiz_history').insert({
            'user_id': user_id,
            'topic': data.topic,
            'score': data.score,
            'weak_areas': data.weak_areas,
            'quiz_mode': data.quiz_mode,
            'average_confidence': data.average_confidence,
            'date': now
        }).execute()

        # 4. Update Topic-Level Mastery (Knowledge Graph Tracking)
        mastery_inc = (data.score / 100.0) * 0.2 # Max 20% mastery increase per quiz
        existing_tracking = supabase.table('progress_tracking').select('mastery_level').eq('user_id', user_id).eq('topic', data.topic).execute()
        existing_tracking_row = _first_row(existing_tracking)

        if existing_tracking_row:
            new_mastery = min(1.0, _row_float(existing_tracking_row, 'mastery_level', 0.0) + mastery_inc)
            status = 'done' if new_mastery > 0.8 else 'learning' if new_mastery > 0.3 else 'struggling' if data.score < 40 else 'learning'
            supabase.table('progress_tracking').update({
                'mastery_level': new_mastery,
                'confidence_score': data.average_confidence,
                'topic_status': status,
                'last_practiced': now
            }).eq('user_id', user_id).eq('topic', data.topic).execute()
        else:
            supabase.table('progress_tracking').insert({
                'user_id': user_id,
                'topic': data.topic,
                'mastery_level': min(1.0, mastery_inc),
                'confidence_score': data.average_confidence,
                'topic_status': 'learning',
                'last_practiced': now
            }).execute()
        
        return {"success": True, "score": data.score, "points_earned": points_earned}
    except Exception as e:
        print(f"Quiz submission error: {e}")
        return {"success": False, "error": str(e)}

@app.post("/quiz-feedback")
def get_quiz_feedback(data: QuizFeedbackRequest):
    return generate_quiz_feedback(data.results, data.subject, data.topic)

@app.post("/analyze-code")
def analyze_code_endpoint(code: str = Form(...), language: str = Form("python")):
    return analyze_code_deep(code, language)

@app.post("/execute-code")
def execute_code_endpoint(code: str = Form(...), language: str = Form("python")):
    from assistants.coding_mentor import execute_code_safely
    return execute_code_safely(code, language)

# ── CodeX Intelligence Endpoints ──────────────────────────────

@app.get("/codex/problems")
def get_problem_titles(language: str = "python"):
    """Load problem titles from Codex CSV datasets."""
    from services.codex_service import load_problem_titles
    titles = load_problem_titles(language)
    return {"language": language, "titles": titles, "count": len(titles)}

@app.post("/codex/check-alignment")
def check_code_alignment(problem_desc: str = Form(...), code: str = Form(...)):
    """Use Groq AI to check if code is logically aligned with the problem."""
    from services.codex_service import check_alignment
    return check_alignment(problem_desc, code)

@app.post("/codex/analyze-lines")
def analyze_code_lines(code: str = Form(...), language: str = Form("python")):
    """Per-line syntax and logic analysis."""
    from services.codex_service import analyze_lines
    line_results = analyze_lines(code, language)
    ok = sum(1 for r in line_results if r['status'] == 'ok')
    warn = sum(1 for r in line_results if r['status'] == 'warn')
    errors = sum(1 for r in line_results if r['status'] == 'error')
    return {"lines": line_results, "summary": {"ok": ok, "warn": warn, "errors": errors}}

@app.post("/codex/references")
def get_code_references(code: str = Form(...), language: str = Form("python")):
    """Fetch real-world code references from GitHub and StackOverflow."""
    from services.codex_service import fetch_references
    return fetch_references(code, language)

@app.post("/codex/generate-tests")
def generate_code_tests(
    code: str = Form(...),
    problem_desc: str = Form(...),
    language: str = Form("python")
):
    """Generate AI test cases for the given code and problem."""
    from services.codex_service import generate_test_cases
    tests = generate_test_cases(code, problem_desc, language)
    return {"test_cases": tests, "count": len(tests)}

@app.post("/codex/enhance")
def enhance_user_code(
    code: str = Form(...),
    problem_desc: str = Form(...),
    language: str = Form("python")
):
    """Enhance code using Groq AI with optional reference context."""
    from services.codex_service import enhance_code_with_ai, fetch_references
    refs_data = fetch_references(code, language)
    all_refs = refs_data.get("github", []) + refs_data.get("stackoverflow", [])
    return enhance_code_with_ai(code, problem_desc, language, all_refs)

@app.post("/codex/compare")
def compare_performance(
    request: Request,
    original_code: str = Form(...),
    enhanced_code: str = Form(...),
    language: str = Form("python"),
    user_email: Optional[str] = Form(None)
):
    """Compare execution cost of original vs enhanced code and record optimization score."""
    from assistants.coding_mentor import execute_code_safely
    from datetime import datetime, timezone
    
    res_orig = execute_code_safely(original_code, language)
    res_enh = execute_code_safely(enhanced_code, language)
    
    # Calculate optimization score from measured execution time only.
    score = 0
    if res_orig['execution_time'] > 0:
        imp = ((res_orig['execution_time'] - res_enh['execution_time']) / res_orig['execution_time']) * 100
        score = max(0, min(100, round(imp) + 50)) # baseline 50 if zero improvement
        
    user_email = getattr(request.state, "user_email", user_email)
    saved_to_supabase = False
    if user_email:
        user_res = supabase.table('users').select('id').eq('email', user_email).execute()
        user_row = _first_row(user_res)
        user_id = _row_str(user_row, 'id')
        if user_id:
            supabase.table('coding_sessions').insert({
                'user_id': user_id,
                'language': language,
                'optimization_score': score,
                'bugs_found': 0,
                'created_at': datetime.now(timezone.utc).isoformat()
            }).execute()
            saved_to_supabase = True
            
    return [
        {'name': 'Original', 'time': res_orig['execution_time'], 'memory': res_orig['memory_used'], 'complexity': res_orig.get('complexity', 'O(n)'), 'success': res_orig['success'], 'saved_to_supabase': saved_to_supabase},
        {'name': 'Enhanced', 'time': res_enh['execution_time'], 'memory': res_enh['memory_used'], 'complexity': res_enh.get('complexity', 'O(n)'), 'success': res_enh['success'], 'optimization_score': score, 'saved_to_supabase': saved_to_supabase}
    ]

@app.get("/performance-stats")
def get_performance_stats(user_email: str):
    """Fetch real-time student performance metrics from Supabase."""
    empty_stats = {
        "quiz_accuracy": 0,
        "interview_score": 0,
        "code_optimization": 0,
        "accuracy_trend": [0],
        "domain_strength": {},
        "source_counts": {
            "quiz_history": 0,
            "quiz_sessions": 0,
            "interview_sessions": 0,
            "mock_interview_sessions": 0,
            "coding_sessions": 0,
        },
        "no_fallback_used": True,
    }
    try:
        user_res = run_with_supabase_retry(
            lambda client: client.table('users').select('id').eq('email', user_email).execute()
        )
        user_row = _first_row(user_res)
        if user_row is None:
            return empty_stats

        user_id = _row_str(user_row, 'id')
        if not user_id:
            return empty_stats

        # 1. Quiz Performance (Prioritize quiz_history for modern records)
        quizzes = run_with_supabase_retry(
            lambda client: client.table('quiz_history').select('score, date').eq('user_id', user_id).order('date', desc=True).limit(10).execute()
        )
        quiz_rows = _result_rows(quizzes)
        quiz_history_count = len(quiz_rows)

        # Legacy quiz_sessions are real user rows from older app versions.
        quiz_session_rows: list[Mapping[str, Any]] = []
        if not quiz_rows:
            quizzes = run_with_supabase_retry(
                lambda client: client.table('quiz_sessions').select('score, created_at').eq('user_id', user_id).order('created_at', desc=True).limit(10).execute()
            )
            quiz_session_rows = _result_rows(quizzes)
            quiz_rows = quiz_session_rows

        quiz_accuracy = round(sum(_row_float(q, 'score', 0.0) for q in quiz_rows) / len(quiz_rows)) if quiz_rows else 0
        accuracy_trend = [_row_float(q, 'score', 0.0) for q in reversed(quiz_rows)] if quiz_rows else [0]

        # 2. Interview Score from actual saved interview tables.
        interviews = run_with_supabase_retry(
            lambda client: client.table('interview_sessions').select('readiness_score, session_date').eq('user_id', user_id).order('session_date', desc=True).limit(10).execute()
        )
        interview_rows = _result_rows(interviews)
        mock_interview_rows: list[Mapping[str, Any]] = []
        try:
            mock_interviews = run_with_supabase_retry(
                lambda client: client.table('mock_interview_sessions').select('readiness_score, avg_score, created_at, num_questions, room_summary, report').eq('user_id', user_id).order('created_at', desc=True).limit(10).execute()
            )
            mock_interview_rows = [row for row in _result_rows(mock_interviews) if _is_completed_mock_session(row)]
        except Exception as e:
            print(f"Mock interview stats fetch skipped: {e}")

        interview_scores = [
            _row_float(row, 'readiness_score', 0.0)
            for row in interview_rows
            if _row_float(row, 'readiness_score', 0.0) > 0
        ]
        interview_scores.extend(
            score for score in (_normalise_mock_readiness(row) for row in mock_interview_rows)
            if score is not None and score > 0
        )
        interview_score = round(sum(interview_scores) / len(interview_scores)) if interview_scores else 0

        # 3. Code Optimization
        coding = run_with_supabase_retry(
            lambda client: client.table('coding_sessions').select('optimization_score').eq('user_id', user_id).order('created_at', desc=True).limit(10).execute()
        )
        coding_rows = _result_rows(coding)
        code_optimization = round(sum(_row_float(c, 'optimization_score', 0.0) for c in coding_rows) / len(coding_rows)) if coding_rows else 0

        # 4. Domain Strength (Based on teacher progress + quiz domains)
        progress = run_with_supabase_retry(
            lambda client: client.table('teacher_progress').select('domain').eq('user_id', user_id).eq('status', 'done').execute()
        )
        domain_counts = {}
        progress_rows = _result_rows(progress)
        for p in progress_rows:
            d = _row_str(p, 'domain', 'General') or 'General'
            domain_counts[d] = domain_counts.get(d, 0) + 1
        
        # Normalize domain strength (placeholder logic)
        total_topics = len(progress_rows) or 1
        domain_strength = {d: round((c / total_topics) * 100) for d, c in domain_counts.items()}
        if not domain_strength: domain_strength = {"General": 0}

        return {
            "quiz_accuracy": quiz_accuracy,
            "interview_score": interview_score,
            "code_optimization": code_optimization,
            "accuracy_trend": accuracy_trend,
            "domain_strength": domain_strength,
            "source_counts": {
                "quiz_history": quiz_history_count,
                "quiz_sessions": len(quiz_session_rows),
                "interview_sessions": len(interview_rows),
                "mock_interview_sessions": len(mock_interview_rows),
                "coding_sessions": len(coding_rows),
            },
            "no_fallback_used": True,
        }
    except Exception as e:
        print(f"Stats Error: {e}")
        empty_stats["warning"] = "Performance stats are temporarily unavailable."
        return empty_stats

@app.post("/download-roadmap-pdf")
def download_roadmap_pdf(roadmap_data: dict):
    pdf_buffer = generate_roadmap_pdf(roadmap_data)
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={roadmap_data['title'].replace(' ', '_')}_Roadmap.pdf"}
    )

# ─────────────────────────────────────────────────────────────────
# Teacher AI endpoints
# ─────────────────────────────────────────────────────────────────

class TeacherExplainRequest(BaseModel):
    topic: str
    subtopic: str
    domain: str
    has_doubt: bool = False
    doubt_text: Optional[str] = None
    user_email: Optional[str] = None
    history: Optional[List[Any]] = []
    force_regenerate: bool = False

class TeacherCacheSaveRequest(BaseModel):
    topic: str
    subtopic: str
    domain: str
    explanation_data: dict

class TeacherDiagramRenderRequest(BaseModel):
    engine: str = "d2"
    code: str

class TeacherFlowGraphRequest(BaseModel):
    code: str
    title: Optional[str] = None

class MarketSkillsRequest(BaseModel):
    role: str
    domain: str
    user_email: Optional[str] = None

@app.post("/coach/historical-trends")
def coach_historical_trends(req: MarketSkillsRequest):
    """Fetch historical trends for the specified role and domain."""
    return historical_service.get_role_trends(req.role, req.domain)

@app.post("/teacher/market-skills")
def teacher_market_skills(request: Request, req: MarketSkillsRequest):
    """Return what skills the market demands for the given role/domain via Groq."""
    req.user_email = getattr(request.state, "user_email", req.user_email)
    result = get_market_skills(req.role, req.domain)
    if req.user_email:
        try:
            u = supabase.table('users').select('id').eq('email', req.user_email).execute()
            user_id = _row_str(_first_row(u), 'id')
            if user_id:
                supabase.table('market_insights').insert({
                    'user_id': user_id,
                    'role': req.role,
                    'domain': req.domain,
                    'type': 'market_skills',
                    'result': result,
                    'evidence_count': len(result.get('evidence_matrix', [])),
                }).execute()
        except Exception as e:
            print(f"Market insight persistence skipped: {e}")
    return result

@app.post("/coach/beginner-guide")
def coach_beginner_guide(request: Request, req: MarketSkillsRequest):
    """Generate a pro mentor guide for beginners."""
    req.user_email = getattr(request.state, "user_email", req.user_email)
    if req.user_email:
        try:
            u = supabase.table('users').select('id').eq('email', req.user_email).execute()
            user_id = _row_str(_first_row(u), 'id')
            if user_id:
                supabase.table('market_insights').insert({
                    'user_id': user_id,
                    'role': req.role,
                    'domain': req.domain,
                    'type': 'beginner_guide'
                }).execute()
        except: pass
    return get_pro_coach_beginner_guide(req.role, req.domain)

class MockInterviewPlanReq(BaseModel):
    role: str
    domain: str
    extracted_skills: List[str]
    user_email: Optional[str] = None
    resume_context: Optional[str] = None

@app.post("/coach/mock-interview/plan")
def mock_interview_plan(request: Request, req: MockInterviewPlanReq):
    req.user_email = getattr(request.state, "user_email", req.user_email)
    plan = build_mock_plan(req.role, req.domain, req.extracted_skills, req.user_email, req.resume_context)
    return {"plan": plan, "difficulty": "Easy", "questions": []}

class MockInterviewEvalReq(BaseModel):
    role: str
    domain: str
    question: str
    answer: str
    expected_key_points: List[str] = []
    interviewer_focus: List[str] = []
    live_metrics: Optional[dict] = None
    speech_feedback: Optional[dict] = None

@app.post("/coach/mock-interview/evaluate")
def mock_interview_evaluate(req: MockInterviewEvalReq):
    try:
        ev = evaluate_mock_answer(
            req.question,
            req.answer,
            req.role,
            req.domain,
            req.expected_key_points,
            req.interviewer_focus,
            req.live_metrics,
            req.speech_feedback,
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
    return ev

class MockInterviewQuestionReq(BaseModel):
    role: str
    domain: str
    plan_item: dict
    asked_questions: List[str]
    difficulty: str
    user_email: Optional[str] = None
    resume_context: Optional[str] = None

@app.post("/coach/mock-interview/question")
def mock_interview_question(request: Request, req: MockInterviewQuestionReq):
    req.user_email = getattr(request.state, "user_email", req.user_email)
    try:
        q = generate_mock_question(req.role, req.domain, req.plan_item, req.asked_questions, req.difficulty, req.user_email, req.resume_context)
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
    return q


class InterviewFrameAnalysisReq(BaseModel):
    image_data: str


@app.post("/coach/mock-interview/analyze-frame")
def mock_interview_analyze_frame(req: InterviewFrameAnalysisReq):
    return analyze_webcam_frame(req.image_data)


class InterviewSpeechAnalysisReq(BaseModel):
    transcript: str
    volume_score: Optional[float] = 0.0
    duration_seconds: Optional[float] = None
    speech_detected: bool = False


@app.post("/coach/mock-interview/analyze-speech")
def mock_interview_analyze_speech(req: InterviewSpeechAnalysisReq):
    return analyze_speech_clarity(
        req.transcript,
        req.volume_score if req.volume_score is not None else 0.0,
        req.duration_seconds,
        req.speech_detected,
    )

class MockCodingEvalReq(BaseModel):
    role: str
    domain: str
    question: str
    approach_text: str
    code: str
    language: str
    test_cases: List[dict] = []

@app.post("/coach/mock-interview/evaluate-code")
def mock_evaluate_code(req: MockCodingEvalReq):
    """Run user code against test cases and get AI feedback."""
    try:
        return evaluate_coding_answer(
            req.question, req.approach_text, req.code,
            req.language, req.test_cases, req.role, req.domain
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

class MockRunTestsReq(BaseModel):
    code: str
    language: str
    test_cases: List[dict]

@app.post("/coach/mock-interview/run-tests")
def mock_run_tests(req: MockRunTestsReq):
    """Execute code against test cases only (no AI feedback)."""
    return run_code_against_tests(req.code, req.language, req.test_cases)

class MockSaveSessionReq(BaseModel):
    user_email: str
    role: str
    domain: str
    language: str
    evaluations: List[dict]
    room_summary: Optional[dict] = None
    report: Optional[dict] = None
    expected_question_count: Optional[int] = None

class InterviewMemoryQueryReq(BaseModel):
    user_email: str
    query: str
    top_k: int = 5

@app.post("/coach/mock-interview/save-session")
def mock_save_session(request: Request, req: MockSaveSessionReq):
    """Persist mock session for adaptive learning in future sessions."""
    req.user_email = getattr(request.state, "user_email", req.user_email)
    saved = save_mock_session(
        req.user_email,
        req.role,
        req.domain,
        req.language,
        req.evaluations,
        req.room_summary,
        req.report,
        req.expected_question_count,
    )
    return {"success": saved, "saved": saved, "counted": saved}

@app.get("/coach/mock-interview/vector-health")
def mock_interview_vector_health():
    """Check whether Supabase Storage is ready for interview FAISS vectors."""
    return check_interview_vector_storage(supabase)

@app.post("/coach/mock-interview/memory-search")
def mock_interview_memory_search(request: Request, req: InterviewMemoryQueryReq):
    """Search the candidate's FAISS interview memory."""
    req.user_email = getattr(request.state, "user_email", req.user_email)
    return {
        "matches": retrieve_interview_memory(req.user_email, req.query, supabase, req.top_k)
    }


def _normalise_mock_readiness(mock_row: Optional[Mapping[str, Any]]) -> Optional[float]:
    if not mock_row:
        return None
    if not _is_completed_mock_session(mock_row):
        return None
    readiness = _row_float(mock_row, 'readiness_score', -1.0)
    if readiness > 0:
        return readiness
    avg_score = _row_float(mock_row, 'avg_score', -1.0)
    if avg_score < 0:
        return 0 if readiness == 0 else None
    return round(avg_score * 10, 1)


def _is_completed_mock_session(mock_row: Optional[Mapping[str, Any]]) -> bool:
    if not mock_row:
        return False

    report = mock_row.get("report")
    if isinstance(report, Mapping) and report.get("is_completed") is True:
        return True

    room_summary = mock_row.get("room_summary")
    if isinstance(room_summary, Mapping) and room_summary.get("is_completed") is True:
        return True

    return False

@app.post("/teacher/explain")
def teacher_explain(request: Request, req: TeacherExplainRequest):
    """Groq-powered subtopic explanation. Checks Redis cache first unless force_regenerate is True."""
    from services.personal_rag_service import save_teacher_interaction
    import json
    req.user_email = getattr(request.state, "user_email", req.user_email)
    
    # Simple cache key based on topic and subtopic
    cache_key = f"teacher_notes:{req.domain}:{req.topic}:{req.subtopic}"
    cache_key = cache_key.replace(" ", "_").lower()

    if not req.force_regenerate and not req.has_doubt and redis_client:
        try:
            cached_val = redis_client.get(cache_key)
            if isinstance(cached_val, (str, bytes, bytearray)):
                print(f"Cache hit for {cache_key}")
                result = json.loads(cached_val)
                # Ensure we return it as expected
                return result
        except Exception as e:
            print(f"Redis get error: {e}")

    # 1. Generate explanation/answer
    result = explain_subtopic(
        req.topic, 
        req.subtopic, 
        req.domain, 
        req.has_doubt, 
        req.doubt_text, 
        req.history, 
        req.user_email
    )
    
    # 2. Persist interaction for Personal RAG
    if req.user_email:
        if req.has_doubt and req.doubt_text:
            save_teacher_interaction(req.user_email, "user", req.doubt_text, supabase)
            save_teacher_interaction(req.user_email, "assistant", result.get("explanation", ""), supabase)
        elif not req.has_doubt:
            # Also save standard explanations as context
            summary = f"Student explored {req.subtopic} in {req.topic}."
            save_teacher_interaction(req.user_email, "system", summary, supabase)
            
    return result

@app.post("/teacher/save-cache")
def teacher_save_cache(req: TeacherCacheSaveRequest):
    """Explicitly save the approved AI notes into Redis cache."""
    import json
    if not redis_client:
        return {"success": False, "error": "Redis not configured"}
        
    cache_key = f"teacher_notes:{req.domain}:{req.topic}:{req.subtopic}"
    cache_key = cache_key.replace(" ", "_").lower()
    
    try:
        redis_client.setex(cache_key, 604800, json.dumps(req.explanation_data)) # Cache for 7 days
        print(f"Notes forcefully saved to cache: {cache_key}")
        return {"success": True}
    except Exception as e:
        print(f"Redis set error: {e}")
        return {"success": False, "error": str(e)}

@app.post("/teacher/render-diagram")
def teacher_render_diagram(req: TeacherDiagramRenderRequest):
    """Render diagrams through the backend so the browser doesn't hit Kroki directly."""
    import requests

    engine = (req.engine or "d2").strip().lower()
    engine = "graphviz" if engine == "dot" else engine
    supported_engines = {"d2", "graphviz", "mermaid", "plantuml"}

    if engine not in supported_engines:
        raise HTTPException(status_code=400, detail=f"Unsupported diagram engine: {engine}")

    if not req.code or not req.code.strip():
        raise HTTPException(status_code=400, detail="Diagram source is empty.")

    try:
        kroki_response = requests.post(
            f"https://kroki.io/{engine}/svg",
            data=req.code.encode("utf-8"),
            headers={"Content-Type": "text/plain"},
            timeout=12,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach the diagram renderer: {exc}") from exc

    if not kroki_response.ok:
        detail = kroki_response.text.strip() or kroki_response.reason or "Diagram renderer returned an error."
        raise HTTPException(
            status_code=kroki_response.status_code if 400 <= kroki_response.status_code < 600 else 502,
            detail=detail[:1200],
        )

    return Response(content=kroki_response.text, media_type="image/svg+xml")

@app.post("/teacher/render-flow-graph")
def teacher_render_flow_graph(req: TeacherFlowGraphRequest):
    """Persist and return teacher flow graphs from Neo4j for richer UI rendering."""
    try:
        return neo4j_flow_service.upsert_flow_graph(req.code, req.title)
    except Exception as exc:
        print(f"Neo4j flow graph unavailable, using backend fallback: {exc}")
        return neo4j_flow_service.local_flow_graph(req.code, req.title, str(exc))

@app.get("/teacher/flow-graph-health")
def teacher_flow_graph_health():
    """Check Neo4j connectivity used by teacher flow graph rendering."""
    return neo4j_flow_service.health()

@app.post("/teacher/generate-notes")
def teacher_generate_notes(request: Request, req: TeacherExplainRequest):
    """Generate professional PDF notes, save to Supabase Storage, and stream for download."""
    import time, io
    req.user_email = getattr(request.state, "user_email", req.user_email)
    pdf_buffer = generate_topic_notes_pdf(req.topic, req.subtopic, req.domain)
    safe_name_raw = str(re.sub(r"[^A-Za-z0-9_-]", "_", req.subtopic))
    safe_name = safe_name_raw[:60]
    filename = f"{safe_name}_Notes.pdf"

    # --- Persist to Supabase Storage if user is logged in ---
    storage_path = None
    if req.user_email:
        try:
            user_result = supabase.table('users').select('id').eq('email', req.user_email).execute()
            user_id = _row_str(_first_row(user_result), 'id')
            if user_id:
                ts = int(time.time())
                storage_path = f"notes/{user_id}/{ts}_{filename}"
                pdf_bytes = pdf_buffer.read()
                pdf_buffer.seek(0)   # reset for streaming
                supabase.storage.from_("student-notes").upload(
                    path=storage_path,
                    file=pdf_bytes,
                    file_options={"content-type": "application/pdf", "upsert": "true"}
                )
                try:
                    # Also record the note path in teacher_progress metadata
                    supabase.table('teacher_progress').update({
                        'notes_path': storage_path
                    }).eq('user_id', user_id).eq('domain', req.domain).eq('milestone_title', req.subtopic).execute()
                    print(f"Notes metadata updated: {storage_path}")
                except Exception as db_err:
                    # Optional column 'notes_path' might be missing - log and continue skip
                    print(f"Skip teacher_progress metadata update (column may be missing): {db_err}")
                
                print(f"Notes saved to storage: {storage_path}")
        except Exception as e:
            print(f"Notes storage upload error: {e}")
            pdf_buffer.seek(0)  # ensure buffer is reset even on error

    # Stream to browser for immediate download
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Storage-Path": storage_path or ""
        }
    )

@app.get("/student/notes")
def list_student_notes(user_email: str):
    """List all PDF notes saved in Supabase Storage for a student."""
    try:
        user_result = supabase.table('users').select('id').eq('email', user_email).execute()
        user_id = _row_str(_first_row(user_result), 'id')
        if not user_id:
            # Return empty notes for guest users instead of 404
            return {"notes": [], "count": 0, "is_guest": True}
        folder = f"notes/{user_id}"

        files = supabase.storage.from_("student-notes").list(folder)
        notes = []
        for f in (files or []):
            if not isinstance(f, dict):
                continue
            name = _row_str(f, "name", "") or ""
            if not name:
                continue
            path = f"{folder}/{name}"
            # Generate a signed URL valid for 1 hour
            try:
                signed = supabase.storage.from_("student-notes").create_signed_url(path, 3600)
                url = signed.get("signedURL") or signed.get("signed_url") or ""
            except Exception:
                url = ""
            # Parse display name from filename: remove timestamp prefix and _Notes.pdf suffix
            display = re.sub(r"^\d+_", "", name).replace("_Notes.pdf", "").replace("_", " ")
            notes.append({
                "name": name,
                "display_name": display,
                "path": path,
                "signed_url": url,
                "created_at": _row_str(f, "created_at") or _row_str(f, "updated_at", "") or ""
            })
        # Sort newest first
        notes.sort(key=lambda x: x["name"], reverse=True)
        return {"notes": notes, "count": len(notes)}
    except HTTPException:
        raise
    except Exception as e:
        print(f"List notes error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class JobSubscribeReq(BaseModel):
    user_email: str
    role: str
    city: str
    min_score: int = 85

@app.post("/job-agent/subscribe-v2")
def subscribe_job_agent(request: Request, req: JobSubscribeReq):
    """Subscribe user to daily AI job scanning."""
    req.user_email = getattr(request.state, "user_email", req.user_email)
    try:
        # Get user ID
        user_res = supabase.table('users').select('id').eq('email', req.user_email).execute()
        user_id = _row_str(_first_row(user_res), 'id')
        if not user_id:
            return {"success": False, "error": "User not found"}

        # Upsert subscription
        supabase.table('job_notifications').upsert({
            'user_id': user_id,
            'role': req.role,
            'city': req.city,
            'min_score': req.min_score,
            'is_active': True,
            'updated_at': datetime.now(timezone.utc).isoformat()
        }, on_conflict='user_id').execute()
        
        return {"success": True}
    except Exception as e:
        print(f"Subscription error: {e}")
        return {"success": False, "error": str(e)}

@app.get("/admin/market-insights")
def admin_market_insights():
    try:
        res = supabase.table('market_insights').select('*').execute()
        insight_rows = _result_rows(res)
        # Simple aggregation
        roles = {}
        domains = {}
        for row in insight_rows:
            role = _row_str(row, 'role')
            domain = _row_str(row, 'domain')
            if role:
                roles[role] = roles.get(role, 0) + 1
            if domain:
                domains[domain] = domains.get(domain, 0) + 1
        
        top_roles_list = sorted([{"name": k, "count": v} for k, v in roles.items()], key=lambda x: x["count"], reverse=True)
        top_domains_list = sorted([{"name": k, "count": v} for k, v in domains.items()], key=lambda x: x["count"], reverse=True)
        
        return {
            "top_roles": top_roles_list[:5],
            "top_domains": top_domains_list[:5],
            "total_searches": len(insight_rows)
        }
    except Exception as e:
        print(f"Admin Market Insight Error: {e}")
        return {"top_roles": [], "top_domains": [], "total_searches": 0}

@app.get("/admin/historical-market-overview")
def admin_historical_market_overview():
    """Historical overview of job market data from static dataset."""
    return historical_service.get_market_overview()

@app.get("/admin/risk-overview")
def admin_risk_overview():
    """Historical risk overview from fraud dataset."""
    return risk_service.get_fraud_overview()
@app.get("/student/weak-areas")
def get_weak_areas(user_email: str):
    """Identify weak areas from past quiz history."""
    try:
        user_res = supabase.table('users').select('id').eq('email', user_email).execute()
        user_id = _row_str(_first_row(user_res), 'id')
        if not user_id:
            return {"weak_areas": []}
        
        # Fetch last 10 quizzes with weak areas
        history = supabase.table('quiz_history').select('weak_areas, topic, score').eq('user_id', user_id).order('date', desc=True).limit(20).execute()
        history_rows = _result_rows(history)
        
        # Aggregate unique weak areas where score was low or they were explicitly listed
        all_weak: list[str] = []
        for h in history_rows:
            weak_areas = [item for item in _row_list(h, 'weak_areas') if isinstance(item, str)]
            if weak_areas:
                all_weak.extend(weak_areas)
            elif _row_float(h, 'score', 100.0) < 60:
                topic = _row_str(h, 'topic')
                if topic:
                    all_weak.append(topic)
                
        # Deduplicate and clean
        unique_weak = list(set([w.strip() for w in all_weak if w and len(w.strip()) > 2]))
        return {"weak_areas": unique_weak[:12]}
    except Exception as e:
        print(f"Error fetching weak areas: {e}")
        return {"weak_areas": []}

@app.get("/student/weak-area-explanation")
def explain_weak_area(request: Request, user_email: str, topic: str, subtopic: str, domain: str):
    """Generate notes specifically for a weak area to improve confidence."""
    from services.teacher_service import explain_subtopic
    user_email = getattr(request.state, "user_email", user_email)
    result = explain_subtopic(topic, subtopic, domain, user_email=user_email)
    # Add a motivation prefix
    result["explanation"] = f"### 💡 Focus Session: Improving your {subtopic} skills\n\n" + result["explanation"]
    return result

@app.post("/student/targeted-quiz")
def targeted_quiz_endpoint(request: Request, req: TargetedQuizRequest):
    """Generate a quiz focusing strictly on the provided weak areas."""
    from assistants.quiz_master import generate_dynamic_quiz
    req.user_email = getattr(request.state, "user_email", req.user_email)
    # Choose one random weak area or combine them
    import random
    focus_topic = random.choice(req.weak_areas) if req.weak_areas else "General"
    
    # We pass 'targeted' mode to quiz master
    return generate_dynamic_quiz(
        subject=req.subject,
        topic=focus_topic,
        difficulty=req.difficulty,
        mode="targeted",
        domain=req.domain,
        subtopic=focus_topic
    )

@app.post("/teacher/ask-multimodal")
async def teacher_multimodal_doubt(
    request: Request,
    user_email: str = Form(...),
    topic: str = Form(...),
    subtopic: str = Form(...),
    domain: str = Form(...),
    message: str = Form(""),
    file: Optional[UploadFile] = File(None)
):
    """Handle text + PDF/DOCX/image attachments for doubts."""
    from services.teacher_service import explain_subtopic
    user_email = getattr(request.state, "user_email", user_email)
    
    attachment_context = ""
    if file:
        contents = await file.read()
        size_error = _validate_upload_size(contents, "attachment")
        if size_error:
            raise HTTPException(status_code=413, detail=size_error)
        filename = _ensure_filename(file.filename, "attachment")
        attachment_result = run_teacher_doubt_attachment_graph(contents, filename, extract_text_from_file)
        if attachment_result.get("error"):
            raise HTTPException(status_code=400, detail=attachment_result["error"])
        attachment_context = attachment_result.get("context", "")
    
    combined_doubt = f"{message}\n\n{attachment_context}" if attachment_context else message
    
    result = explain_subtopic(
        topic=topic,
        subtopic=subtopic,
        domain=domain,
        has_doubt=True,
        doubt_text=combined_doubt,
        user_email=user_email
    )
    return result

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting EduZyniq Backend...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
