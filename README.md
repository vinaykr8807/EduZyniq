# Edunovas

AI-assisted learning and career development platform built with React (frontend), FastAPI (backend), and Supabase (data/storage).

## Overview

Edunovas combines multiple learning modules in one interface:

- Interview coaching with resume analysis and readiness scoring
- Adaptive quiz generation and topic-level mastery tracking
- Coding mentor with sandboxed execution and AI optimization feedback
- Career pathfinder with market signals and job matching
- Teacher mode with explainers, generated notes, and downloadable PDFs
- Admin analytics for platform and student-performance monitoring

## Repository Structure

```text
.
├── src/                         # React + TypeScript frontend (Vite)
│   ├── pages/                   # Home, Assistant, Admin, Login, etc.
│   ├── pages/forge/             # Core learning modules
│   ├── components/              # UI and shared components
│   └── hooks/                   # Frontend data/API hooks
├── backend/                     # FastAPI backend
│   ├── assistants/              # Interview, quiz, coding assistant logic
│   ├── services/                # Domain services (teacher, market, jobs, etc.)
│   ├── migrations/              # SQL/Python migration helpers
│   ├── Codex/                   # Datasets and utilities for CodeX features
│   └── JOBS DATASET/            # Historical/market datasets used by services
├── supabase/
│   ├── config.toml
│   └── migrations/              # Supabase SQL migrations
└── README.md
```

## Tech Stack

- Frontend: React 19, TypeScript, React Router, Vite
- Backend: FastAPI, Pydantic, SQLAlchemy, Supabase Python client
- AI/ML: Groq API, sentence-transformers, FAISS, OCR toolchain
- Data: Supabase Postgres + Supabase Storage

## Prerequisites

- Node.js 18+
- Python 3.10+
- Supabase project (hosted or local via Supabase CLI)
- Groq API key

Optional but recommended:

- Docker (for safer multi-language code execution in coding mentor)
- System OCR dependencies for resume parsing:
  - `tesseract-ocr`
  - `poppler-utils` (required by `pdf2image`)

## Quick Start

### 1) Clone and install frontend dependencies

```bash
git clone https://github.com/vinaykr8807/Edunovas.git
cd Edunovas
npm install
```

### 2) Setup backend environment

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env`:

```env
# Required
GROQ_API_KEY=your_groq_key
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
# or use SUPABASE_ANON_KEY if running with limited access

# Optional / recommended
DATABASE_URL=postgresql://postgres:password@host:5432/postgres
JWT_SECRET_KEY=replace_with_strong_secret
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=gemma3:latest
PEXELS_API_KEY=your_pexels_key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_app_password
FROM_EMAIL=notifications@edunovas.ai
GITHUB_TOKEN=optional_for_codex_reference_search
```

### 3) Database and migrations

Use Supabase migrations in `supabase/migrations`.

If you use Supabase CLI locally:

```bash
supabase start
supabase db reset
```

Notes:

- `backend/init_db.py` contains hardcoded credentials and destructive `DROP TABLE` statements.
- Do not run `backend/init_db.py` in production environments.

### 4) Run backend

From `backend/`:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

### 5) Run frontend

From repository root:

```bash
npm run dev
```

Frontend runs on Vite default port (`5173`).

### 6) Expose Local Backend (Cloudflare Tunnel)

To expose your local backend to the internet (e.g., for Vercel frontend to access your local machine's Docker engine), use Cloudflare Tunnel:

```bash
# Expose the backend port (currently set to 8001)
cloudflared tunnel --url http://localhost:8001
```

Copy the `*.trycloudflare.com` URL generated and set it as `VITE_API_URL` in your Vercel or frontend environment.

## Core Modules

- Interview Coach: resume deep analysis, skill-gap mapping, interview plan and evaluation
- Quiz Master: quiz generation, explanation evaluation, feedback, confidence-aware progress updates
- Coding Mentor: code analysis + optional execution sandbox across languages
- Career Pathfinder: role/city-specific job discovery, suitability scoring, report generation
- Teacher: topic explanation, market skills, beginner guide, notes PDF generation/storage
- Analytics/Admin: student metrics, domain distribution, readiness and optimization aggregates

## API Surface (Selected)

Authentication:

- `POST /signup`
- `POST /login`

Student profile and progress:

- `POST /save-profile`
- `GET /student/profile`
- `GET /student/progress`
- `GET /performance-stats`

Assistant/core:

- `POST /chat`
- `POST /upload-resume`
- `POST /analyze-resume`
- `POST /career-pathfinder`
- `GET /generate-quiz`
- `POST /submit-quiz`
- `POST /quiz-feedback`
- `POST /analyze-code`
- `POST /execute-code`

Teacher/coach:

- `POST /teacher/explain`
- `POST /teacher/generate-notes`
- `GET /student/notes`
- `POST /teacher/market-skills`
- `POST /coach/beginner-guide`
- `POST /coach/mock-interview/plan`
- `POST /coach/mock-interview/question`
- `POST /coach/mock-interview/evaluate`

Admin:

- `GET /admin/analytics`
- `GET /admin/student-performance`
- `GET /admin/market-insights`
- `GET /admin/historical-market-overview`
- `GET /admin/risk-overview`

Jobs agent:

- `POST /job-agent/subscribe`
- `POST /job-agent/run-crawler`

CodeX:

- `GET /codex/problems`
- `POST /codex/check-alignment`
- `POST /codex/analyze-lines`
- `POST /codex/references`
- `POST /codex/generate-tests`
- `POST /codex/enhance`
- `POST /codex/compare`

## Environment and Deployment Notes

- Frontend API URLs are currently hardcoded in several places to `http://127.0.0.1:8000`.
- Supabase Storage buckets used by backend include at least:
  - `resumes`
  - `student-notes`
- A background task in `backend/main.py` runs a job crawler every 24 hours while the server is up.
- Coding execution falls back to local runtime if Docker is unavailable.

## Data and Large Files

- The repository includes sizeable datasets under `backend/JOBS DATASET` and `backend/Codex`.
- GitHub rejects files larger than 100 MB in normal Git history.
- If you need to version very large datasets, use Git LFS:
  - https://git-lfs.github.com/

## Security Notes

- Never commit real API keys, service-role keys, or SMTP credentials.
- Rotate any secrets that were previously exposed.
- Review CORS, auth policies, and RLS before production deployment.

## Development Workflow

- Frontend: `npm run dev`, `npm run build`, `npm run lint`
- Backend: `uvicorn main:app --reload`
- Contribution guidelines: see [CONTRIBUTING.md](CONTRIBUTING.md)

## License

Licensed under the MIT License. See [LICENSE](LICENSE).
