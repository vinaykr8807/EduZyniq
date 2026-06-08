# EduZyniq

EduZyniq is an AI-powered learning, interview-preparation, coding, and career-guidance platform. It combines a React student portal, a FastAPI intelligence backend, Supabase persistence/storage, Groq-powered reasoning, OCR/PDF extraction, market-source research, and real-time dashboard analytics.

The project objective is to move beyond a prototype dashboard and build a source-backed student-growth system where resumes, quizzes, interviews, coding attempts, market research, and profile preferences are stored, analyzed, and reused across the product.

## Project Objectives

- Give students one workspace for learning, doubts, quizzes, coding practice, interview preparation, resume analysis, and career planning.
- Store real student activity in Supabase instead of relying on local-only or hardcoded fallback data.
- Use resumes, uploaded notes, OCR/PDF extraction, quiz attempts, coding errors, and interview sessions as reusable learning context.
- Provide transparent market and career insights with visible source evidence, not fake or unexplained scores.
- Support admin monitoring for student progress, readiness, coding performance, and platform activity.
- Keep backend schema, frontend UI, and Supabase migrations aligned so records written today can be fetched later without mismatch.

## Tool Stack

### Frontend

- React 19
- TypeScript
- Vite
- React Router
- KaTeX / React KaTeX
- Mermaid rendering support
- html2canvas and jsPDF
- MediaPipe Tasks Vision for browser-side interview posture/frame analysis
- Custom responsive hooks and glass-style dashboard UI

### Backend

- Python 3.11 compatible FastAPI application
- Starlette / Uvicorn
- Pydantic request/response models
- Supabase Python client
- PostgreSQL through Supabase
- Groq API for LLM reasoning and summaries
- OpenAI package support where configured
- LangGraph pipeline services
- Neo4j service integration scaffolding
- Redis-ready backend dependency support

### AI, Search, OCR, and Documents

- Groq `llama-3.3-70b-versatile`
- Serper API for indexed market and source evidence
- DuckDuckGo Search / DDGS for public job discovery
- FAISS and NumPy for vector memory
- sentence-transformers for embeddings
- PyMuPDF, pypdf, pdfplumber, pdf2image
- pytesseract and Pillow for image OCR
- python-docx for DOCX extraction
- ReportLab for generated PDFs
- trafilatura for web text extraction

### Data and Storage

- Supabase Postgres tables for users, profiles, progress, quiz sessions, interview sessions, coding sessions, coding errors, career reports, market insights, job notifications, job matches, adaptive logs, and chat messages.
- Supabase Storage buckets:
  - `resumes`
  - `student-notes`
  - `rag-vectors`
- Optional local FAISS artifacts for interview memory and RAG vectors.

### Development and Deployment

- Vite dev server for frontend
- Uvicorn dev server for backend
- Supabase SQL migrations
- Schema validation script: `backend/scripts/validate_supabase_schema.py`
- Optional Docker Compose for Neo4j
- Optional Cloudflare Tunnel for exposing the local backend during remote frontend testing

## Repository Structure

```text
.
├── backend/
│   ├── assistants/                  # Coding mentor, quiz, and assistant-specific logic
│   ├── migrations/                  # Backend migration helpers and SQL scripts
│   ├── scripts/                     # Validation and security setup scripts
│   ├── services/                    # Domain services for career, market, RAG, teacher, interviews
│   ├── tests/                       # Backend logic tests
│   ├── main.py                      # FastAPI app and route orchestration
│   ├── auth_service.py              # Auth helpers and JWT integration
│   ├── supabase_client.py           # Supabase client initialization
│   └── requirements.txt
├── src/
│   ├── components/                  # Shared UI components
│   ├── hooks/                       # Frontend hooks and API-driven state
│   ├── pages/                       # Login, assistant, curriculum, interview room, etc.
│   ├── pages/forge/                 # Dashboard, career pathfinder, interview coach, coding mentor, teacher
│   ├── utils/                       # Profile/domain defaults
│   ├── App.tsx
│   └── config.ts
├── supabase/
│   ├── migrations/                  # Supabase schema migrations
│   └── reset_fresh_schema.sql       # Full public-schema reset and bucket recreation script
├── docs/
├── docker-compose.neo4j.yml
├── package.json
└── README.md
```

## Technical Architecture

```text
Student / Admin Browser
        |
        v
React + TypeScript + Vite Frontend
        |
        v
FastAPI Backend
        |
        +-- Auth + JWT middleware
        +-- Profile and progress services
        +-- Resume / PDF / DOCX / OCR pipeline
        +-- Teacher notes and doubt pipeline
        +-- Interview Coach and Interview Room
        +-- Coding Mentor and coding error tracking
        +-- Career Pathfinder and job matching
        +-- Admin analytics
        |
        +-- Supabase Postgres
        +-- Supabase Storage: resumes, notes, rag-vectors
        +-- FAISS / embedding memory
        +-- Personal RAG context
        +-- Groq LLM
        +-- Serper Search API
        +-- DDGS / public job sources
```

### Frontend Flow

1. User signs up or logs in.
2. Student profile modal captures degree, academic year, domain, branch, and optional resume.
3. Domain selections map to target roles across dashboard, Career Pathfinder, and Interview Coach.
4. Modules call FastAPI through `apiFetch`.
5. Dashboard fetches Supabase-backed progress instead of hardcoded metrics.
6. Career and interview screens show source-backed evidence, professional summaries, and clear no-data states.

### Backend Flow

1. FastAPI receives module-specific requests.
2. Auth middleware checks protected API requests.
3. Supabase clients read/write table rows and storage objects.
4. Resume uploads are parsed through PDF/DOCX/image extraction and stored in Supabase Storage.
5. AI services call Groq only where reasoning or rewriting is needed.
6. Market services query Serper/DDGS and keep source records visible.
7. Completed interviews, quiz attempts, coding sessions, and coding errors are recorded for later dashboard/admin use.

### Data Flow Principles

- Never present invented progress values when Supabase rows are empty.
- Do not count interrupted mock interviews as completed interview sessions.
- Do not treat aggregate job search pages as verified individual vacancies.
- Keep raw source evidence available while showing clean summaries in the UI.
- Prefer explicit no-data states over silent fallback scores.

## Core Features

### Student Dashboard

- Supabase-backed quiz accuracy, interview readiness, and code optimization metrics.
- Profile-aware domain and role selection.
- Real-time progress fetch from backend.
- Removed debug row-count labels from production dashboard cards.
- Empty Supabase rows now show `0%` instead of fallback progress.

### Profile and Onboarding

- Captures academic profile fields.
- Stores primary domain interest in Supabase.
- Maps domains to target roles across Career Pathfinder and Interview Coach.
- Optional AI resume sync with Supabase Storage.
- Resume upload supports PDF, DOCX, DOC, JPG, JPEG, and PNG MIME detection.

### Teaching Notes and Doubt Feature

- PDF text extraction using PyMuPDF / pypdf / pdfplumber pipeline support.
- Image text extraction using Tesseract OCR.
- DOCX extraction using python-docx.
- Notes storage in Supabase Storage.
- Personal RAG-ready context for student-specific explanations.
- Pipeline design supports uploaded images/PDFs as doubt context.

### Interview Coach

- Resume skill extraction and role readiness scoring.
- Market skill comparison with visible evidence.
- AI-generated interview plans and questions.
- Completed mock interviews are persisted only when the session is actually completed.
- Interview memory uses FAISS/vector artifacts when they exist.
- Missing vector files now do not crash the question generator.
- Removed fallback readiness inflation.
- Historical market panels show verified indexed sources instead of fake bar charts.
- Source cards display Groq-written professional summaries while preserving original links.

### Interview Room

- Live camera/frame analysis integration.
- Speech clarity now depends on real speech/audio evidence instead of defaulting to high values.
- Muted or typed-only sessions no longer produce fake speech clarity scores.
- Live metrics no longer carry previous-frame fallback values.
- Evaluation records only count as completed when the full interview flow finishes.

### Career Pathfinder

- Resume-driven career report generation.
- City and level aware job discovery.
- Role/domain normalization for Generative AI, ML, UI/UX, cloud, cyber security, and quantum paths.
- Exact skill matching to avoid false positives such as `SIEM` matching `Siemens`.
- Aggregate job pages are marked as aggregate sources.
- Low-detail job sources show role-baseline gaps to verify instead of empty gap sections.
- Live job demand shows real source-signal counts or `Unknown` when sources fail.
- Historical market context uses indexed source records instead of generated historical counts.
- Recruitment risk card now shows source evidence only, not a fake predictive risk score.
- Source snippets are rewritten into professional summaries through Groq without adding unsupported claims.

### Coding Mentor

- Code analysis and optimization guidance.
- Coding sessions and coding errors can be persisted in Supabase.
- Dashboard code optimization can be derived from real coding session/error records.
- Backend service structure supports code quality records, error tracking, and admin visibility.

### Quiz Master

- Adaptive quiz generation.
- Quiz session and history tables aligned with Supabase schema.
- Quiz accuracy dashboard depends on recorded attempts.
- Progress tracking supports fresh schema reset with zero-state behavior.

### Admin Dashboard

- Student performance analytics.
- Domain, quiz, interview, coding, and progress visibility.
- Backend tables aligned so admin views can fetch persisted data rather than local-only metrics.
- Market and risk overview endpoints now expose confidence/methodology when generated from snippets.

### Job Agent

- Job notification subscriptions.
- Job matching records.
- Crawler endpoint and scheduled background crawl support.
- Career reports can store matched jobs and market context.

## Supabase Schema Coverage

The backend contract currently validates these tables:

- `users`
- `student_profiles`
- `chat_messages`
- `user_progress`
- `teacher_progress`
- `interview_sessions`
- `quiz_sessions`
- `quiz_history`
- `progress_tracking`
- `coding_sessions`
- `mock_interview_sessions`
- `market_insights`
- `career_reports`
- `job_notifications`
- `job_matches`
- `coding_errors`
- `adaptive_learning_logs`

Storage buckets validated:

- `rag-vectors`
- `resumes`
- `student-notes`

Run validation:

```bash
python backend/scripts/validate_supabase_schema.py
```

Expected success message:

```text
Schema validation passed. Backend tables and storage buckets match.
```

## Setup

### Prerequisites

- Node.js 18+
- Python 3.10+
- Supabase project
- Groq API key
- Serper API key for live market/source evidence
- Tesseract OCR installed locally if image OCR is needed
- Poppler installed locally if using PDF-to-image OCR paths

### Frontend Install

```bash
npm install
```

### Backend Install

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

On macOS/Linux:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Environment Variables

Create `backend/.env` from `backend/.env.example`.

Required:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_publishable_key
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GROQ_API_KEY=your_groq_key
SERPER_API_KEY=your_serper_key
JWT_SECRET_KEY=replace_with_strong_random_secret
```

Optional:

```env
DATABASE_URL=postgresql://postgres:password@host:5432/postgres
OPENAI_API_KEY=optional
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_app_password
FROM_EMAIL=notifications@eduzyniq.ai
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

Never commit real `.env` files or backup copies containing secrets.

### Database Setup

For a fresh hosted Supabase project:

1. Open Supabase SQL Editor.
2. Run `supabase/reset_fresh_schema.sql` if you intentionally want to wipe public data and recreate the schema.
3. Run project migrations from `supabase/migrations`.
4. Run the validation script.

Important:

- Supabase does not allow direct deletion from storage system tables.
- Storage objects should be deleted through the Supabase Storage API.
- `reset_fresh_schema.sql` recreates public schema and buckets without direct storage-table deletion.

### Run Backend

```bash
cd backend
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Alternative:

```bash
cd backend
python main.py
```

### Run Frontend

```bash
npm run dev
```

Frontend default URL:

```text
http://localhost:5173
```

Backend default URL:

```text
http://127.0.0.1:8000
```

## API Surface

### Auth and Profile

- `POST /signup`
- `POST /login`
- `POST /save-profile`
- `GET /student/profile`
- `GET /resume-status`

### Student Progress

- `GET /student/progress`
- `GET /performance-stats`
- `GET /student/notes`

### Resume and Career

- `POST /upload-resume`
- `POST /analyze-resume`
- `POST /career-pathfinder`
- `POST /job-agent/subscribe`
- `POST /job-agent/run-crawler`

### Teacher

- `POST /teacher/explain`
- `POST /teacher/generate-notes`
- `POST /teacher/market-skills`

### Interview Coach

- `POST /coach/beginner-guide`
- `POST /coach/mock-interview/plan`
- `POST /coach/mock-interview/question`
- `POST /coach/mock-interview/analyze-frame`
- `POST /coach/mock-interview/analyze-speech`
- `POST /coach/mock-interview/evaluate`

### Quiz

- `GET /generate-quiz`
- `POST /submit-quiz`
- `POST /quiz-feedback`

### Coding

- `POST /analyze-code`
- `POST /execute-code`

### Admin

- `GET /admin/analytics`
- `GET /admin/student-performance`
- `GET /admin/market-insights`
- `GET /admin/historical-market-overview`
- `GET /admin/risk-overview`

## Recent Milestones

### Milestone 1: Backend Compatibility and Startup Fixes

- Fixed FastAPI/Starlette dependency mismatch that caused `Router.__init__() got an unexpected keyword argument 'on_startup'`.
- Aligned `requirements.txt` with compatible FastAPI and Starlette versions.
- Improved CORS/auth behavior so backend 500 errors do not appear as unexplained frontend CORS failures.

### Milestone 2: Supabase Connectivity and Schema Alignment

- Added backend schema validation against live Supabase.
- Created a full schema alignment migration.
- Added fresh reset SQL for starting from clean data without destroying table structure manually.
- Validated all expected tables and storage buckets.
- Updated backend logic to prefer Supabase-backed records over local fallback values.

### Milestone 3: Dashboard Accuracy

- Removed default dashboard values like `80%` interview readiness when Supabase rows are empty.
- Dashboard now shows `0%` when no quiz, interview, or coding records exist.
- Removed debug labels such as `Supabase rows: 0` from student-facing cards.
- Mock interview count now increments only after completed interviews.

### Milestone 4: Resume Storage and Extraction

- Fixed Supabase Storage MIME upload errors by detecting file content type.
- Added support for PDF, DOC, DOCX, JPG, JPEG, and PNG resume files.
- Ensured resume extraction can use PDF parsing and OCR/image parsing paths.
- Connected onboarding resume sync to Supabase Storage.

### Milestone 5: Interview Coach Reliability

- Fixed `NameError: interview_memory is not defined`.
- Made missing FAISS artifacts non-fatal when starting fresh after database reset.
- Removed fake speech clarity fallback values.
- Made interview metrics evidence-based.
- Added source-backed market views instead of estimated chart-only views.

### Milestone 6: Career Pathfinder Quality

- Removed fake historical source signal bars and replaced them with verified indexed market sources.
- Reworked recruitment risk from generated score to source evidence only.
- Added professional summaries for source cards through Groq.
- Improved job matching with exact skill matching.
- Penalized senior listings for junior/fresher candidates.
- Penalized aggregate job pages so they do not appear as perfect matches.
- Added low-detail source handling so empty gap fields now show role-baseline gaps to verify.

### Milestone 7: Domain and Role Memory

- Added profile default mapping from domain to target role.
- Career Pathfinder and Interview Coach now remember profile domain intent.
- Fixed cases where Generative AI / ML profile choices appeared as unrelated full-stack defaults.

### Milestone 8: Security and Operations

- Added safer database initialization behavior.
- Added environment setup script support.
- Documented no-secret commit policy.
- Kept service-role credentials out of README examples.

## Bugs Fixed

- FastAPI app startup crash caused by dependency mismatch.
- Frontend fetch failures caused by backend 500 errors surfacing as CORS errors.
- Supabase Storage upload failure: `invalid_mime_type text/plain is not supported`.
- Dashboard showing `80%` interview readiness after database reset.
- Debug Supabase row counts appearing on student dashboard.
- Mock interview sessions counted when the interview was interrupted.
- Speech clarity showing high values while muted or typed-only.
- Interview question endpoint crashing when vector memory files were absent.
- Career profile showing full-stack role despite Generative AI domain.
- Career job matching falsely matching `SIEM` with `Siemens`.
- Aggregate job pages being treated as individual verified jobs.
- Job gap section showing `No listed gaps` for low-detail aggregate pages.
- Recruitment risk showing scary generated levels without audited evidence.
- Historical market charts showing estimated counts as if they were real totals.
- Raw search snippets appearing as broken source text in UI.

## Features Added

- Supabase schema validator.
- Full fresh schema reset SQL.
- Profile-domain role mapping.
- Resume MIME detection and storage sync.
- PDF/DOCX/image extraction pipeline support.
- Interview room service and completion-aware persistence.
- Interview memory service scaffolding.
- Source-backed historical market records.
- Source-backed recruitment risk evidence.
- Groq professional summaries for source cards.
- Career report storage and job-match records.
- Low-detail job evidence flags.
- Aggregate source badges in Career Pathfinder.
- Responsive frontend hook.
- Neo4j and LangGraph service scaffolding.
- Backend tests for career matching edge cases.

## Testing and Verification

Run frontend build:

```bash
npm run build
```

Run backend compile checks:

```bash
python -m py_compile backend/main.py
python -m py_compile backend/services/career_pathfinder.py
python -m py_compile backend/services/historical_market_data.py
```

Run career logic tests:

```bash
cd backend
python -m unittest discover -s tests -p "test_career_pathfinder_logic.py" -v
```

Validate Supabase schema:

```bash
python backend/scripts/validate_supabase_schema.py
```

## Security Notes

- Do not commit `backend/.env`, `.env.local`, backup env files, service-role keys, JWT secrets, SMTP passwords, or local tokens.
- Use Supabase Row Level Security before production.
- Treat `SUPABASE_SERVICE_ROLE_KEY` as server-only.
- Keep CORS origin restrictions tight for production deployments.
- Rotate keys if they were ever pasted into logs, screenshots, or commits.
- Use Storage API for deleting Supabase Storage objects.

## Deployment Notes

Frontend can be deployed to Vercel, Netlify, or any static hosting provider after `npm run build`.

Backend can be deployed to a Python ASGI host with:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

For local testing with a remote frontend, expose the backend with Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:8000
```

Then configure the frontend API base URL accordingly.

## Roadmap

- Add formal RLS policies for every Supabase table.
- Add backend integration tests for profile, dashboard, interview, quiz, coding, and career endpoints.
- Add queue/background worker for job crawling and long-running market research.
- Add admin export reports.
- Add source-quality scoring for job links.
- Persist OCR extraction metadata for uploaded resumes and notes.
- Add GitHub Actions CI for frontend build, backend compile, and schema validation.
- Add semantic versioning and release notes.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
