-- =====================================================
-- Edunovas Supabase Migration
-- Run this in your Supabase SQL Editor
-- Dashboard: https://supabase.com/dashboard/project/wlnybmztpkocfbnoacgs/sql
-- =====================================================

-- 1. Teacher AI topic progress (per student, per subtopic)
CREATE TABLE IF NOT EXISTS teacher_progress (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain          TEXT NOT NULL,                    -- e.g. "Full Stack Development"
    roadmap_id      TEXT NOT NULL,                    -- e.g. "fsd"
    phase_name      TEXT NOT NULL,                    -- e.g. "Web Foundations & Frontend Mastery"
    phase_index     INTEGER NOT NULL,
    milestone_title TEXT NOT NULL,                    -- e.g. "JavaScript & React Ecosystem"
    milestone_index INTEGER NOT NULL,
    status          TEXT DEFAULT 'learning'           -- 'learning' | 'done'
        CHECK (status IN ('learning', 'done')),
    notes_path      TEXT,                             -- Supabase Storage path for PDF notes
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, roadmap_id, phase_index, milestone_index)
);

-- 2. Interview Coach sessions (per student, per analysis)
CREATE TABLE IF NOT EXISTS interview_sessions (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role                TEXT NOT NULL,                -- e.g. "Frontend Engineer"
    domain              TEXT NOT NULL,
    level               TEXT NOT NULL,
    readiness_score     INTEGER NOT NULL DEFAULT 0,   -- 0-100
    extracted_skills    TEXT[] DEFAULT '{}',
    matched_skills      TEXT[] DEFAULT '{}',          -- skills matching market demand
    missing_skills      TEXT[] DEFAULT '{}',
    market_skills       TEXT[] DEFAULT '{}',          -- what market demands
    strong_domains      TEXT[] DEFAULT '{}',
    session_date        TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_role ON interview_sessions(role);

-- 3. Quiz Master performance (per student, per quiz)
CREATE TABLE IF NOT EXISTS quiz_sessions (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain          TEXT,                             -- e.g. "Generative AI"
    subject         TEXT NOT NULL,                    -- e.g. "Deep Learning"
    topic           TEXT NOT NULL,                    -- e.g. "Transformers"
    score           INTEGER NOT NULL,                 -- 0-100
    weak_areas      TEXT[] DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Coding Mentor performance (per student, per review)
CREATE TABLE IF NOT EXISTS coding_sessions (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language            TEXT NOT NULL,
    optimization_score  INTEGER NOT NULL,             -- 0-100
    bugs_found          INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Enable RLS
ALTER TABLE teacher_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_sessions ENABLE ROW LEVEL SECURITY;

-- 6. Policies (Idempotent: Drop if exists then create)
DROP POLICY IF EXISTS "Service role all access - teacher_progress" ON teacher_progress;
CREATE POLICY "Service role all access - teacher_progress"
    ON teacher_progress FOR ALL
    TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role all access - interview_sessions" ON interview_sessions;
CREATE POLICY "Service role all access - interview_sessions"
    ON interview_sessions FOR ALL
    TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role all access - quiz_sessions" ON quiz_sessions;
CREATE POLICY "Service role all access - quiz_sessions"
    ON quiz_sessions FOR ALL
    TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role all access - coding_sessions" ON coding_sessions;
CREATE POLICY "Service role all access - coding_sessions"
    ON coding_sessions FOR ALL
    TO service_role USING (true) WITH CHECK (true);

-- 7. Indices
CREATE INDEX IF NOT EXISTS idx_teacher_progress_user ON teacher_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_progress_domain ON teacher_progress(domain);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_user ON interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user ON quiz_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_coding_sessions_user ON coding_sessions(user_id);

-- =====================================================
-- STORAGE BUCKETS: resumes & student-notes
-- =====================================================

-- 1. Create Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('student-notes', 'student-notes', false, 10485760, ARRAY['application/pdf']),
    ('resumes', 'resumes', false, 5242880, ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png']),
    ('rag-vectors', 'rag-vectors', false, 10485760, ARRAY['application/octet-stream', 'application/json'])
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies so service_role can upload/read
DROP POLICY IF EXISTS "Service role all access - student-notes" ON storage.objects;
CREATE POLICY "Service role all access - student-notes"
  ON storage.objects FOR ALL
  TO service_role USING (bucket_id = 'student-notes') WITH CHECK (bucket_id = 'student-notes');

DROP POLICY IF EXISTS "Service role all access - resumes" ON storage.objects;
CREATE POLICY "Service role all access - resumes"
  ON storage.objects FOR ALL
  TO service_role USING (bucket_id = 'resumes') WITH CHECK (bucket_id = 'resumes');

DROP POLICY IF EXISTS "Service role all access - rag-vectors" ON storage.objects;
CREATE POLICY "Service role all access - rag-vectors"
  ON storage.objects FOR ALL
  TO service_role USING (bucket_id = 'rag-vectors') WITH CHECK (bucket_id = 'rag-vectors');

-- =====================================================
-- VERIFY: Run these SELECT statements to confirm setup
-- =====================================================
-- SELECT id, name, public FROM storage.buckets;
-- SELECT * FROM teacher_progress LIMIT 5;
-- SELECT * FROM interview_sessions LIMIT 5;
-- SELECT * FROM quiz_sessions LIMIT 5;
-- SELECT * FROM coding_sessions LIMIT 5;
