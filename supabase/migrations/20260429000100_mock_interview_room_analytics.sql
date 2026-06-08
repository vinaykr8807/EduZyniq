alter table if exists mock_interview_sessions
    add column if not exists session_kind text not null default 'classic',
    add column if not exists readiness_score numeric(5,1) not null default 0,
    add column if not exists eye_contact_score numeric(5,1) not null default 0,
    add column if not exists confidence_score numeric(5,1) not null default 0,
    add column if not exists speech_clarity_score numeric(5,1) not null default 0,
    add column if not exists body_language_score numeric(5,1) not null default 0,
    add column if not exists posture_score numeric(5,1) not null default 0,
    add column if not exists expression_score numeric(5,1) not null default 0,
    add column if not exists communication_score numeric(5,1) not null default 0,
    add column if not exists presence_alerts jsonb not null default '[]'::jsonb,
    add column if not exists room_summary jsonb not null default '{}'::jsonb,
    add column if not exists report jsonb not null default '{}'::jsonb;

create index if not exists idx_mock_sessions_created_at on mock_interview_sessions(created_at desc);
