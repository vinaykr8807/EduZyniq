from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
import re
import asyncio
from contextlib import asynccontextmanager
from router import detect_mode
from llm_service import generate_response, extract_text_from_file, analyze_resume_domain
from auth_service import get_password_hash, verify_password, create_access_token
from supabase_client import supabase
from datetime import datetime, timezone
from assistants.interview_coach import analyze_resume_deep
from assistants.ats_coach import calculate_ats_score
from assistants.quiz_master import generate_dynamic_quiz, generate_quiz_feedback
from assistants.coding_mentor import analyze_code_deep
from services.pdf_generator import generate_roadmap_pdf
from services.career_pathfinder import generate_career_report
from services.teacher_service import explain_subtopic, generate_topic_notes_pdf, get_market_skills, get_pro_coach_beginner_guide
from services.historical_market_data import historical_service, risk_service
from services.notification_service import notification_service
from services.mock_interview_service import build_mock_plan, generate_mock_question, evaluate_mock_answer, evaluate_coding_answer, run_code_against_tests, save_mock_session

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {
        "message": "Welcome to Edunovas AI Backend",
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


def _get_user_id_by_email(user_email: str) -> Optional[str]:
    if not user_email:
        return None
    user_result = supabase.table("users").select("id").eq("email", user_email).execute()
    if not user_result.data:
        return None
    return user_result.data[0]["id"]


def _store_resume_for_user(contents: bytes, original_filename: str, user_email: Optional[str]) -> Optional[str]:
    user_id = _get_user_id_by_email(user_email) if user_email else None
    if not user_id:
        return None

    timestamp = int(datetime.now().timestamp())
    safe_name = _sanitize_filename(original_filename)
    storage_path = f"users/{user_id}/{timestamp}_{safe_name}"
    supabase.storage.from_("resumes").upload(storage_path, contents)
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


def _load_resume_text(file: Optional[UploadFile], user_email: Optional[str]):
    # Returns (text, source_path, error)
    if file is not None:
        contents = file.file.read()
        text = extract_text_from_file(contents, file.filename)
        if not text:
            return None, None, "Text extraction failed. Please upload a readable PDF/DOCX/Image resume."

        source_path = None
        if user_email:
            try:
                source_path = _store_resume_for_user(contents, file.filename, user_email)
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
    return {"status": "ok", "message": "Edunovas Backend is Alive"}

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
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    new_user = supabase.table('users').insert({
        'email': user_data.email,
        'full_name': user_data.full_name or user_data.email,
        'password_hash': get_password_hash(user_data.password),
        'role': user_data.role
    }).execute()
    
    user = new_user.data[0]
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
    if not result.data or not verify_password(user_data.password, result.data[0]['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user = result.data[0]
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
    reply = generate_response(req.message, mode, profile_dict)
    return {"mode": mode, "response": reply}

@app.post("/save-profile")
def save_profile(profile: StudentProfileSchema, user_email: str):
    user_result = supabase.table('users').select('id').eq('email', user_email).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_id = user_result.data[0]['id']
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
        if existing.data:
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
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_id = user_result.data[0]['id']
    profile_result = supabase.table('student_profiles').select('*').eq('user_id', user_id).execute()
    
    # Also check resume status
    resume_status = get_resume_status(user_email)
    
    profile = profile_result.data[0] if profile_result.data else None
    return {
        "profile": profile,
        "has_stored_resume": resume_status.get("has_stored_resume", False)
    }

@app.get("/student/progress")
def get_progress(user_email: str):
    user_result = supabase.table('users').select('id').eq('email', user_email).execute()
    if not user_result.data:
        raise HTTPException(status_code=404)
    
    user_id = user_result.data[0]['id']
    prog_result = supabase.table('user_progress').select('*').eq('user_id', user_id).execute()
    
    if not prog_result.data:
        try:
            new_prog = supabase.table('user_progress').insert({
                'user_id': user_id,
                'points': 0,
                'level': 1,
                'streak_days': 0,
                'badges': [],
                'career_phase': 'Foundational'
            }).execute()
            prog = new_prog.data[0] if new_prog.data else {
                'id': user_id, 'points': 0, 'level': 1, 'streak_days': 0,
                'badges': [], 'career_phase': 'Foundational', 'last_active': None
            }
        except Exception as e:
            print(f"Progress Init Error: {e}")
            prog = {
                'id': user_id, 'points': 0, 'level': 1, 'streak_days': 0,
                'badges': [], 'career_phase': 'Foundational', 'last_active': None
            }
    else:
        prog = prog_result.data[0]
    
    profile_result = supabase.table('student_profiles').select('*').eq('user_id', user_id).execute()
    
    return {
        "id": str(prog.get('id', user_id)),
        "points": prog.get('points', 0),
        "level": prog.get('level', 1),
        "streak_days": prog.get('streak_days', 0),
        "badges": prog.get('badges', []),
        "career_phase": prog.get('career_phase', 'Foundational'),
        "last_active": prog.get('last_active'),
        "profile_completed": len(profile_result.data) > 0
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
def save_teacher_progress(data: TeacherProgressModel):
    """Upsert a student's subtopic progress into Supabase."""
    user_result = supabase.table('users').select('id').eq('email', data.user_email).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = user_result.data[0]['id']

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
            supabase.table('user_progress').update({'points': supabase.table('user_progress').select('points').eq('user_id', user_id).execute().data[0].get('points', 0) + 15}).eq('user_id', user_id).execute()
        return {"success": True}
    except Exception as e:
        print(f"Teacher progress save error: {e}")
        return {"success": False, "error": str(e)}

@app.post("/save-interview-session")
def save_interview_session(data: InterviewSessionModel):
    """Save a student's interview coach session results to Supabase."""
    user_result = supabase.table('users').select('id').eq('email', data.user_email).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")
    user_id = user_result.data[0]['id']

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
        print(f"Interview session save error: {e}")
        return {"success": False, "error": str(e)}

@app.get("/admin/analytics")
def get_analytics():
    """Aggregated analytics for admin dashboard."""
    users = supabase.table('users').select('id, email, full_name, created_at').eq('role', 'student').execute()
    profiles = supabase.table('student_profiles').select('skills, domain').execute()
    progress = supabase.table('user_progress').select('points').execute()

    # Skills from profiles
    skill_counts: dict = {}
    for p in profiles.data:
        if p.get('skills'):
            for skill in p['skills']:
                skill_counts[skill] = skill_counts.get(skill, 0) + 1
    top_skills_pairs = sorted(skill_counts.items(), key=lambda x: x[1], reverse=True)
    top_skills = top_skills_pairs[:10]
    total_xp = sum(int(p.get('points', 0)) for p in progress.data)

    # Domain distribution from teacher_progress (how many topics done per domain)
    try:
        tp = supabase.table('teacher_progress').select('domain').eq('status', 'done').execute()
        domain_dist: dict = {}
        for row in tp.data:
            d = row.get('domain', 'Other')
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
        total_interviews = len(interview_rows.data)
        avg_readiness = round(float(sum(r.get('readiness_score', 0) for r in interview_rows.data)) / max(total_interviews, 1), 1) if total_interviews else 0
    except Exception:
        total_interviews = 0
        avg_readiness = 0
        
    # Code Optimization Avg
    try:
        coding_rows = supabase.table('coding_sessions').select('optimization_score').execute()
        total_optimizations = len(coding_rows.data)
        avg_optimization = round(float(sum(r.get('optimization_score', 80) for r in coding_rows.data)) / max(total_optimizations, 1), 1) if total_optimizations else None
    except Exception:
        total_optimizations = 0
        avg_optimization = None

    return {
        "total_students": len(users.data),
        "active_today": 0,
        "total_xp": total_xp,
        "total_interaction_hits": topics_completed,
        "total_interviews": total_interviews,
        "total_optimizations": total_optimizations,
        "avg_readiness_score": avg_readiness,
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
        for user in users.data:
            uid = user['id']

            # Teacher progress
            tp = supabase.table('teacher_progress').select('domain, roadmap_id, milestone_title, status, completed_at').eq('user_id', uid).execute()
            done_topics = [r for r in tp.data if r.get('status') == 'done']
            domains_studied = list(set(r['domain'] for r in tp.data if r.get('domain')))

            # Interview sessions
            iv = supabase.table('interview_sessions').select('role, domain, level, readiness_score, session_date').eq('user_id', uid).order('session_date', desc=True).limit(5).execute()

            # XP
            prog = supabase.table('user_progress').select('points, level').eq('user_id', uid).execute()
            xp = prog.data[0].get('points', 0) if prog.data else 0
            level = prog.data[0].get('level', 1) if prog.data else 1

            # Code optimizations
            coding = supabase.table('coding_sessions').select('optimization_score').eq('user_id', uid).execute()
            avg_opt = round(float(sum(c['optimization_score'] for c in coding.data)) / max(len(coding.data), 1), 1) if coding.data else None

            result.append({
                "user_id": uid,
                "email": user.get('email'),
                "full_name": user.get('full_name', user.get('email')),
                "joined": user.get('created_at'),
                "xp": xp,
                "level": level,
                "topics_completed": len(done_topics),
                "total_topics_attempted": len(tp.data),
                "domains_studied": domains_studied,
                "last_topic": done_topics[-1]['milestone_title'] if done_topics else None,
                "interview_sessions": len(iv.data),
                "latest_readiness": iv.data[0]['readiness_score'] if iv.data else None,
                "avg_readiness": round(float(sum(s['readiness_score'] for s in iv.data)) / max(len(iv.data), 1), 1) if iv.data else None,
                "last_interview_role": iv.data[0]['role'] if iv.data else None,
                "code_optimizations_done": len(coding.data),
                "avg_optimization_score": avg_opt
            })
        return {"students": result}
    except Exception as e:
        print(f"Student performance error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload-resume")
async def upload_resume(file: UploadFile = File(...), user_email: Optional[str] = Form(None)):
    contents = file.file.read()

    text = extract_text_from_file(contents, file.filename)
    if not text:
        return {"error": "Text extraction failed. Supported formats: PDF, DOCX, IMG."}

    storage_path = None
    if user_email:
        try:
            storage_path = _store_resume_for_user(contents, file.filename, user_email)
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
    role: str = Form(...),
    level: str = Form(...),
    user_email: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
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
    role: str = Form(...),
    level: str = Form(...),
    city: str = Form(...),
    user_email: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
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
def subscribe_job_agent(req: JobAgentSubscribeRequest):
    """Enable the AI Job Agent for daily automated notifications."""
    try:
        user_res = supabase.table('users').select('id').eq('email', req.user_email).execute()
        if not user_res.data:
            raise HTTPException(status_code=404, detail="User not found.")
        user_id = user_res.data[0]['id']
        
        # Upsert subscription
        existing = supabase.table('job_notifications').select('*').eq('user_id', user_id).eq('role', req.role).eq('city', req.city).execute()
        
        if existing.data:
            supabase.table('job_notifications').update({
                'is_active': True,
                'min_score': req.min_score,
                'updated_at': datetime.now(timezone.utc).isoformat()
            }).eq('id', existing.data[0]['id']).execute()
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
        if not subs.data:
            print("ℹ️ [Crawler] No active subscribers found.")
            return {"success": True, "message": "No active subscribers."}
            
        print(f"👥 [Crawler] Found {len(subs.data)} active subscribers.")
        notifications_sent: int = 0
        for sub in subs.data:
            user_id = sub['user_id']
            user_email = sub['users']['email']
            role = sub['role']
            city = sub['city']
            min_score = sub['min_score']
            
            print(f"👤 [Crawler] Processing {user_email} (Role: {role}, City: {city})...")
            
            # Fetch user's latest resume to extract skills
            resume_res = supabase.table('student_profiles').select('skills').eq('user_id', user_id).execute()
            user_skills = resume_res.data[0]['skills'] if resume_res.data and resume_res.data[0].get('skills') else []
            
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
                    supabase.table('job_notifications').update({'last_notified_at': datetime.now(timezone.utc).isoformat()}).eq('id', sub['id']).execute()
            else:
                print(f"⏭️ [Crawler] No new high-match jobs for {user_email}.")
                    
        return {"success": True, "message": f"Crawler finished. Sent {notifications_sent} notifications."}
    except Exception as e:
        print(f"❌ [Crawler] Error: {e}")
        return {"success": False, "error": str(e)}

@app.get("/generate-quiz")
def get_quiz_endpoint(subject: str, topic: str, difficulty: str, mode: str = "standard", domain: Optional[str] = None, subtopic: Optional[str] = None):
    from assistants.quiz_master import generate_dynamic_quiz
    return generate_dynamic_quiz(subject, topic, difficulty, mode, domain, subtopic)

@app.post("/evaluate-explanation")
def evaluate_explanation_endpoint(data: ExplanationEvaluationRequest):
    from assistants.quiz_master import evaluate_student_explanation
    return evaluate_student_explanation(data.topic, data.explanation, data.subject)

@app.post("/submit-quiz")
def submit_quiz_endpoint(data: QuizSubmission):
    user_result = supabase.table('users').select('id').eq('email', data.user_email).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_id = user_result.data[0]['id']
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    
    try:
        # 1. Update general points
        points_earned = 10 + (data.score // 10)
        current_progress = supabase.table('user_progress').select('points').eq('user_id', user_id).execute()
        if current_progress.data:
            new_points = current_progress.data[0].get('points', 0) + points_earned
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
        
        if existing_tracking.data:
            new_mastery = min(1.0, existing_tracking.data[0].get('mastery_level', 0) + mastery_inc)
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
    
    # Calculate optimization score (Time improvement %)
    score = 0
    if res_orig['execution_time'] > 0:
        imp = ((res_orig['execution_time'] - res_enh['execution_time']) / res_orig['execution_time']) * 100
        score = max(0, min(100, round(imp) + 50)) # baseline 50 if zero improvement
    else:
        score = 80 # default good score
        
    if user_email:
        user_res = supabase.table('users').select('id').eq('email', user_email).execute()
        if user_res.data:
            supabase.table('coding_sessions').insert({
                'user_id': user_res.data[0]['id'],
                'optimization_score': score,
                'created_at': datetime.now(timezone.utc).isoformat()
            }).execute()
            
    return [
        {'name': 'Original', 'time': res_orig['execution_time'], 'memory': res_orig['memory_used'], 'complexity': res_orig.get('complexity', 'O(n)'), 'success': res_orig['success']},
        {'name': 'Enhanced', 'time': res_enh['execution_time'], 'memory': res_enh['memory_used'], 'complexity': res_enh.get('complexity', 'O(n)'), 'success': res_enh['success']}
    ]

@app.get("/performance-stats")
def get_performance_stats(user_email: str):
    """Fetch real-time student performance metrics from Supabase."""
    try:
        user_res = supabase.table('users').select('id').eq('email', user_email).execute()
        if not user_res.data:
            return {"quiz_accuracy": 0, "interview_score": 0, "code_optimization": 80, "accuracy_trend": [0], "domain_strength": {}}
        
        user_id = user_res.data[0]['id']

        # 1. Quiz Performance
        quizzes = supabase.table('quiz_sessions').select('score, created_at').eq('user_id', user_id).order('created_at', desc=True).limit(10).execute()
        quiz_accuracy = round(sum(q['score'] for q in quizzes.data) / len(quizzes.data)) if quizzes.data else 0
        accuracy_trend = [q['score'] for q in reversed(quizzes.data)] if quizzes.data else [0]

        # 2. Interview Score
        interviews = supabase.table('interview_sessions').select('readiness_score').eq('user_id', user_id).order('session_date', desc=True).limit(1).execute()
        interview_score = interviews.data[0]['readiness_score'] if interviews.data else 0

        # 3. Code Optimization
        coding = supabase.table('coding_sessions').select('optimization_score').eq('user_id', user_id).order('created_at', desc=True).limit(10).execute()
        code_optimization = round(sum(c['optimization_score'] for c in coding.data) / len(coding.data)) if coding.data else 80

        # 4. Domain Strength (Based on teacher progress + quiz domains)
        progress = supabase.table('teacher_progress').select('domain').eq('user_id', user_id).eq('status', 'done').execute()
        domain_counts = {}
        for p in progress.data:
            d = p.get('domain', 'General')
            domain_counts[d] = domain_counts.get(d, 0) + 1
        
        # Normalize domain strength (placeholder logic)
        total_topics = len(progress.data) or 1
        domain_strength = {d: round((c / total_topics) * 100) for d, c in domain_counts.items()}
        if not domain_strength: domain_strength = {"General": 0}

        return {
            "quiz_accuracy": quiz_accuracy,
            "interview_score": interview_score,
            "code_optimization": code_optimization,
            "accuracy_trend": accuracy_trend,
            "domain_strength": domain_strength
        }
    except Exception as e:
        print(f"Stats Error: {e}")
        return {"quiz_accuracy": 0, "interview_score": 0, "code_optimization": 0, "accuracy_trend": [0], "domain_strength": {}}

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
    history: Optional[List[dict]] = [] # [{role: "user", content: "..."}]

class MarketSkillsRequest(BaseModel):
    role: str
    domain: str
    user_email: Optional[str] = None

@app.post("/coach/historical-trends")
def coach_historical_trends(req: MarketSkillsRequest):
    """Fetch historical trends for the specified role and domain."""
    return historical_service.get_role_trends(req.role, req.domain)

@app.post("/teacher/market-skills")
def teacher_market_skills(req: MarketSkillsRequest):
    """Return what skills the market demands for the given role/domain via Groq."""
    if req.user_email:
        try:
            u = supabase.table('users').select('id').eq('email', req.user_email).execute()
            if u.data:
                supabase.table('market_insights').insert({
                    'user_id': u.data[0]['id'],
                    'role': req.role,
                    'domain': req.domain,
                    'type': 'market_skills'
                }).execute()
        except: pass
    return get_market_skills(req.role, req.domain)

@app.post("/coach/beginner-guide")
def coach_beginner_guide(req: MarketSkillsRequest):
    """Generate a pro mentor guide for beginners."""
    if req.user_email:
        try:
            u = supabase.table('users').select('id').eq('email', req.user_email).execute()
            if u.data:
                supabase.table('market_insights').insert({
                    'user_id': u.data[0]['id'],
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

@app.post("/coach/mock-interview/plan")
def mock_interview_plan(req: MockInterviewPlanReq):
    plan = build_mock_plan(req.role, req.domain, req.extracted_skills, req.user_email)
    return {"plan": plan, "difficulty": "Easy", "questions": []}

class MockInterviewEvalReq(BaseModel):
    role: str
    domain: str
    question: str
    answer: str

@app.post("/coach/mock-interview/evaluate")
def mock_interview_evaluate(req: MockInterviewEvalReq):
    ev = evaluate_mock_answer(req.question, req.answer, req.role, req.domain)
    return ev

class MockInterviewQuestionReq(BaseModel):
    role: str
    domain: str
    plan_item: dict
    asked_questions: List[str]
    difficulty: str
    user_email: Optional[str] = None

@app.post("/coach/mock-interview/question")
def mock_interview_question(req: MockInterviewQuestionReq):
    q = generate_mock_question(req.role, req.domain, req.plan_item, req.asked_questions, req.difficulty, req.user_email)
    return q

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
    return evaluate_coding_answer(
        req.question, req.approach_text, req.code,
        req.language, req.test_cases, req.role, req.domain
    )

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

@app.post("/coach/mock-interview/save-session")
def mock_save_session(req: MockSaveSessionReq):
    """Persist mock session for adaptive learning in future sessions."""
    save_mock_session(req.user_email, req.role, req.domain, req.language, req.evaluations)
    return {"success": True}

@app.post("/teacher/explain")
def teacher_explain(req: TeacherExplainRequest):
    """Groq-powered subtopic explanation. If has_doubt, answer the specific doubt."""
    from services.personal_rag_service import save_teacher_interaction
    
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

@app.post("/teacher/generate-notes")
def teacher_generate_notes(req: TeacherExplainRequest):
    """Generate professional PDF notes, save to Supabase Storage, and stream for download."""
    import time, io
    pdf_buffer = generate_topic_notes_pdf(req.topic, req.subtopic, req.domain)
    safe_name_raw = str(re.sub(r"[^A-Za-z0-9_-]", "_", req.subtopic))
    safe_name = safe_name_raw[:60]
    filename = f"{safe_name}_Notes.pdf"

    # --- Persist to Supabase Storage if user is logged in ---
    storage_path = None
    if req.user_email:
        try:
            user_result = supabase.table('users').select('id').eq('email', req.user_email).execute()
            if user_result.data:
                user_id = user_result.data[0]['id']
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
        if not user_result.data:
            raise HTTPException(status_code=404, detail="User not found")
        user_id = user_result.data[0]['id']
        folder = f"notes/{user_id}"

        files = supabase.storage.from_("student-notes").list(folder)
        notes = []
        for f in (files or []):
            name = f.get("name", "")
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
                "created_at": f.get("created_at") or f.get("updated_at") or ""
            })
        # Sort newest first
        notes.sort(key=lambda x: x["name"], reverse=True)
        return {"notes": notes, "count": len(notes)}
    except HTTPException:
        raise
    except Exception as e:
        print(f"List notes error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/admin/market-insights")
def admin_market_insights():
    try:
        res = supabase.table('market_insights').select('*').execute()
        # Simple aggregation
        roles = {}
        domains = {}
        for row in res.data:
            roles[row['role']] = roles.get(row['role'], 0) + 1
            domains[row['domain']] = domains.get(row['domain'], 0) + 1
        
        top_roles_list = sorted([{"name": k, "count": v} for k, v in roles.items()], key=lambda x: x["count"], reverse=True)
        top_domains_list = sorted([{"name": k, "count": v} for k, v in domains.items()], key=lambda x: x["count"], reverse=True)
        
        return {
            "top_roles": top_roles_list[:5],
            "top_domains": top_domains_list[:5],
            "total_searches": len(res.data)
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

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting Edunovas Backend...")
    uvicorn.run(app, host="0.0.0.0", port=8000)
@app.get("/student/weak-areas")
def get_weak_areas(user_email: str):
    """Identify weak areas from past quiz history."""
    try:
        user_res = supabase.table('users').select('id').eq('email', user_email).execute()
        if not user_res.data:
            return {"weak_areas": []}
        user_id = user_res.data[0]['id']
        
        # Fetch last 10 quizzes with weak areas
        history = supabase.table('quiz_history').select('weak_areas, topic, score').eq('user_id', user_id).order('date', desc=True).limit(20).execute()
        
        # Aggregate unique weak areas where score was low or they were explicitly listed
        all_weak = []
        for h in history.data:
            if h.get('weak_areas'):
                all_weak.extend(h['weak_areas'])
            elif h.get('score', 100) < 60:
                all_weak.append(h['topic'])
                
        # Deduplicate and clean
        unique_weak = list(set([w.strip() for w in all_weak if w and len(w.strip()) > 2]))
        return {"weak_areas": unique_weak[:12]}
    except Exception as e:
        print(f"Error fetching weak areas: {e}")
        return {"weak_areas": []}

@app.get("/student/weak-area-explanation")
def explain_weak_area(user_email: str, topic: str, subtopic: str, domain: str):
    """Generate notes specifically for a weak area to improve confidence."""
    from services.teacher_service import explain_subtopic
    result = explain_subtopic(topic, subtopic, domain, user_email=user_email)
    # Add a motivation prefix
    result["explanation"] = f"### 💡 Focus Session: Improving your {subtopic} skills\n\n" + result["explanation"]
    return result

@app.post("/student/targeted-quiz")
def targeted_quiz_endpoint(req: TargetedQuizRequest):
    """Generate a quiz focusing strictly on the provided weak areas."""
    from assistants.quiz_master import generate_dynamic_quiz
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
    user_email: str = Form(...),
    topic: str = Form(...),
    subtopic: str = Form(...),
    domain: str = Form(...),
    message: str = Form(""),
    file: Optional[UploadFile] = File(None)
):
    """Handle text + image screenshots for doubts."""
    from services.teacher_service import explain_subtopic
    from llm_service import extract_text_from_image
    
    ocr_text = ""
    if file:
        contents = await file.read()
        ocr_text = extract_text_from_image(contents) or ""
    
    combined_doubt = f"{message}\n\n[Attached Screenshot Context]:\n{ocr_text}" if ocr_text else message
    
    result = explain_subtopic(
        topic=topic,
        subtopic=subtopic,
        domain=domain,
        has_doubt=True,
        doubt_text=combined_doubt,
        user_email=user_email
    )
    return result
