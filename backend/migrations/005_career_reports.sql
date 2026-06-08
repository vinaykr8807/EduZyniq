-- Persist evidence-backed Career Pathfinder runs.

CREATE TABLE IF NOT EXISTS career_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    city TEXT NOT NULL,
    readiness_score INTEGER DEFAULT 0,
    resume_match_score INTEGER DEFAULT 0,
    evidence_count INTEGER DEFAULT 0,
    report JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_career_reports_user_created
    ON career_reports(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_career_reports_role_city
    ON career_reports(role, city);
