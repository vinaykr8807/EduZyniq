-- Align Supabase schema with the FastAPI backend read/write contract.
-- Idempotent and non-destructive: this migration only creates missing objects,
-- adds missing columns, relaxes unsafe NOT NULLs, and adds indexes/policies.

create extension if not exists pgcrypto;

create table if not exists public.users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null,
    full_name text,
    password_hash text not null,
    role text default 'student',
    created_at timestamptz default now()
);

create table if not exists public.student_profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    degree text,
    branch text,
    academic_year text,
    domain text,
    skills text[] default '{}',
    created_at timestamptz default now()
);

create table if not exists public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    role text,
    content text,
    mode text,
    timestamp timestamptz default now()
);

create table if not exists public.user_progress (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    points integer default 0,
    level integer default 1,
    streak_days integer default 0,
    badges text[] default '{}',
    career_phase text default 'Foundational',
    knowledge_graph jsonb default '{}'::jsonb,
    last_active timestamptz default now(),
    unique(user_id)
);

create table if not exists public.teacher_progress (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    domain text not null,
    roadmap_id text not null,
    phase_name text not null,
    phase_index integer not null,
    milestone_title text not null,
    milestone_index integer not null,
    status text default 'learning',
    notes_path text,
    completed_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique(user_id, roadmap_id, phase_index, milestone_index)
);

create table if not exists public.interview_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    role text not null,
    domain text not null,
    level text not null,
    readiness_score integer not null default 0,
    extracted_skills text[] default '{}',
    matched_skills text[] default '{}',
    missing_skills text[] default '{}',
    market_skills text[] default '{}',
    strong_domains text[] default '{}',
    ats_score jsonb default '{}'::jsonb,
    session_date timestamptz default now(),
    created_at timestamptz default now()
);

create table if not exists public.quiz_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete cascade,
    domain text,
    subject text not null,
    topic text not null,
    score integer not null,
    weak_areas text[] default '{}',
    created_at timestamptz default now()
);

create table if not exists public.quiz_history (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    subject text,
    domain text,
    topic text,
    score integer,
    weak_areas text[] default '{}',
    quiz_mode text default 'standard',
    average_confidence double precision default 0,
    date timestamptz default now()
);

create table if not exists public.progress_tracking (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    topic text,
    confidence_score double precision,
    mastery_level double precision default 0,
    topic_status text default 'learning',
    last_practiced timestamptz default now(),
    times_attempted integer default 1,
    unique(user_id, topic)
);

create table if not exists public.coding_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    language text not null default 'unknown',
    optimization_score numeric not null default 0,
    bugs_found integer default 0,
    created_at timestamptz default now()
);

create table if not exists public.mock_interview_sessions (
    id bigserial primary key,
    user_id uuid references public.users(id) on delete cascade,
    role text,
    domain text,
    language text,
    avg_score numeric(5,1) default 0,
    weak_areas text[] default '{}',
    num_questions integer default 0,
    session_kind text not null default 'classic',
    readiness_score numeric(5,1) not null default 0,
    eye_contact_score numeric(5,1) not null default 0,
    confidence_score numeric(5,1) not null default 0,
    speech_clarity_score numeric(5,1) not null default 0,
    body_language_score numeric(5,1) not null default 0,
    posture_score numeric(5,1) not null default 0,
    expression_score numeric(5,1) not null default 0,
    communication_score numeric(5,1) not null default 0,
    presence_alerts jsonb not null default '[]'::jsonb,
    room_summary jsonb not null default '{}'::jsonb,
    report jsonb not null default '{}'::jsonb,
    created_at timestamptz default now()
);

create table if not exists public.market_insights (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    role text not null,
    domain text not null,
    type text not null,
    result jsonb default '{}'::jsonb,
    evidence_count integer default 0,
    created_at timestamptz default now()
);

create table if not exists public.career_reports (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    role text not null,
    city text not null,
    readiness_score integer default 0,
    resume_match_score integer default 0,
    evidence_count integer default 0,
    report jsonb not null,
    created_at timestamptz default now()
);

create table if not exists public.job_notifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    role text not null,
    city text not null,
    min_score integer default 90,
    is_active boolean default true,
    last_notified_at timestamptz,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists public.job_matches (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    job_link text not null,
    match_score integer not null,
    created_at timestamptz default now()
);

create table if not exists public.coding_errors (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    language text,
    mistake_type text,
    frequency integer default 1
);

create table if not exists public.adaptive_learning_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.users(id) on delete cascade,
    subtopic text,
    gap_analysis text,
    remediation_steps text[],
    resolved boolean default false,
    created_at timestamptz default now()
);

alter table public.student_profiles add column if not exists skills text[] default '{}';
alter table public.user_progress add column if not exists knowledge_graph jsonb default '{}'::jsonb;
alter table public.interview_sessions add column if not exists ats_score jsonb default '{}'::jsonb;
alter table public.quiz_history add column if not exists subject text;
alter table public.quiz_history add column if not exists domain text;
alter table public.quiz_history add column if not exists quiz_mode text default 'standard';
alter table public.quiz_history add column if not exists average_confidence double precision default 0;
alter table public.progress_tracking add column if not exists mastery_level double precision default 0;
alter table public.progress_tracking add column if not exists topic_status text default 'learning';
alter table public.coding_sessions add column if not exists language text;
alter table public.coding_sessions alter column language set default 'unknown';
update public.coding_sessions set language = 'unknown' where language is null;
alter table public.coding_sessions alter column language set not null;
alter table public.coding_sessions add column if not exists bugs_found integer default 0;
alter table public.market_insights add column if not exists result jsonb default '{}'::jsonb;

create index if not exists idx_teacher_progress_user on public.teacher_progress(user_id);
create index if not exists idx_teacher_progress_domain on public.teacher_progress(domain);
create index if not exists idx_interview_sessions_user on public.interview_sessions(user_id);
create index if not exists idx_interview_sessions_role on public.interview_sessions(role);
create index if not exists idx_quiz_sessions_user on public.quiz_sessions(user_id);
create index if not exists idx_quiz_history_user_date on public.quiz_history(user_id, date desc);
create index if not exists idx_coding_sessions_user_created on public.coding_sessions(user_id, created_at desc);
create index if not exists idx_mock_sessions_user_created on public.mock_interview_sessions(user_id, created_at desc);
create index if not exists idx_mock_sessions_created_at on public.mock_interview_sessions(created_at desc);
create index if not exists idx_market_insights_user_created on public.market_insights(user_id, created_at desc);
create index if not exists idx_career_reports_user_created on public.career_reports(user_id, created_at desc);
create index if not exists idx_career_reports_role_city on public.career_reports(role, city);
create unique index if not exists idx_job_notifications_user on public.job_notifications(user_id);
create unique index if not exists idx_user_job_link on public.job_matches(user_id, job_link);

alter table public.users enable row level security;
alter table public.student_profiles enable row level security;
alter table public.chat_messages enable row level security;
alter table public.user_progress enable row level security;
alter table public.teacher_progress enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.quiz_sessions enable row level security;
alter table public.quiz_history enable row level security;
alter table public.progress_tracking enable row level security;
alter table public.coding_sessions enable row level security;
alter table public.mock_interview_sessions enable row level security;
alter table public.market_insights enable row level security;
alter table public.career_reports enable row level security;
alter table public.job_notifications enable row level security;
alter table public.job_matches enable row level security;
alter table public.coding_errors enable row level security;
alter table public.adaptive_learning_logs enable row level security;

drop policy if exists "Service role all access - users" on public.users;
create policy "Service role all access - users" on public.users for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - student_profiles" on public.student_profiles;
create policy "Service role all access - student_profiles" on public.student_profiles for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - chat_messages" on public.chat_messages;
create policy "Service role all access - chat_messages" on public.chat_messages for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - user_progress" on public.user_progress;
create policy "Service role all access - user_progress" on public.user_progress for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - teacher_progress" on public.teacher_progress;
create policy "Service role all access - teacher_progress" on public.teacher_progress for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - interview_sessions" on public.interview_sessions;
create policy "Service role all access - interview_sessions" on public.interview_sessions for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - quiz_sessions" on public.quiz_sessions;
create policy "Service role all access - quiz_sessions" on public.quiz_sessions for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - quiz_history" on public.quiz_history;
create policy "Service role all access - quiz_history" on public.quiz_history for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - progress_tracking" on public.progress_tracking;
create policy "Service role all access - progress_tracking" on public.progress_tracking for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - coding_sessions" on public.coding_sessions;
create policy "Service role all access - coding_sessions" on public.coding_sessions for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - mock_interview_sessions" on public.mock_interview_sessions;
create policy "Service role all access - mock_interview_sessions" on public.mock_interview_sessions for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - market_insights" on public.market_insights;
create policy "Service role all access - market_insights" on public.market_insights for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - career_reports" on public.career_reports;
create policy "Service role all access - career_reports" on public.career_reports for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - job_notifications" on public.job_notifications;
create policy "Service role all access - job_notifications" on public.job_notifications for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - job_matches" on public.job_matches;
create policy "Service role all access - job_matches" on public.job_matches for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - coding_errors" on public.coding_errors;
create policy "Service role all access - coding_errors" on public.coding_errors for all to service_role using (true) with check (true);
drop policy if exists "Service role all access - adaptive_learning_logs" on public.adaptive_learning_logs;
create policy "Service role all access - adaptive_learning_logs" on public.adaptive_learning_logs for all to service_role using (true) with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
    ('student-notes', 'student-notes', false, 10485760, array['application/pdf']),
    ('resumes', 'resumes', false, 10485760, array[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'image/jpeg',
        'image/png'
    ]),
    ('rag-vectors', 'rag-vectors', false, 10485760, array['application/octet-stream', 'application/json'])
on conflict (id) do nothing;

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf']
where id = 'student-notes';

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
        'image/jpeg',
        'image/png'
    ]
where id = 'resumes';

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['application/octet-stream', 'application/json']
where id = 'rag-vectors';

drop policy if exists "Service role all access - student-notes" on storage.objects;
create policy "Service role all access - student-notes"
  on storage.objects for all to service_role using (bucket_id = 'student-notes') with check (bucket_id = 'student-notes');
drop policy if exists "Service role all access - resumes" on storage.objects;
create policy "Service role all access - resumes"
  on storage.objects for all to service_role using (bucket_id = 'resumes') with check (bucket_id = 'resumes');
drop policy if exists "Service role all access - rag-vectors" on storage.objects;
create policy "Service role all access - rag-vectors"
  on storage.objects for all to service_role using (bucket_id = 'rag-vectors') with check (bucket_id = 'rag-vectors');
