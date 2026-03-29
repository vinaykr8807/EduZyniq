-- Table to persist mock interview sessions for adaptive learning
create table if not exists mock_interview_sessions (
    id           bigserial primary key,
    user_id      uuid references users(id) on delete cascade,
    role         text not null,
    domain       text not null,
    language     text not null default 'python',
    avg_score    numeric(4,1) default 0,
    weak_areas   text[] default '{}',
    num_questions int default 0,
    created_at   timestamptz default now()
);

create index if not exists idx_mock_sessions_user_id on mock_interview_sessions(user_id);
