-- Hiring pipeline core: companies, roles, hunts, matches, threads, approvals, offers, tokens, jobs.
-- Rule: private limits (budgets, minimum CTC) live ONLY in *_private_limits tables, readable by the server's
-- fit-check engine and nobody else. Browser roles get SELECT only on the rows a developer is party to.

-- ---------- Company side ----------
create table companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 2 and 80),
  domain        text not null unique check (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  status        text not null default 'pending' check (status in ('pending','approved','suspended')),
  slack_team_id text unique,
  created_at    timestamptz not null default now(),
  approved_at   timestamptz
);

create table company_members (
  company_id    uuid not null references companies(id) on delete cascade,
  slack_user_id text not null,
  email         text,
  created_at    timestamptz not null default now(),
  primary key (company_id, slack_user_id)
);

create table roles (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  title       text not null check (char_length(title) between 2 and 120),
  description text,
  skills      text[] not null default '{}',
  locations   text[] not null default '{}',
  remote      boolean not null default true,
  status      text not null default 'open' check (status in ('draft','open','paused','filled','closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index roles_company_idx on roles (company_id);
create index roles_open_idx on roles (status) where status = 'open';

-- Sealed: only the fit-check engine reads this.
create table role_private_limits (
  role_id        uuid primary key references roles(id) on delete cascade,
  budget_max_ctc numeric not null check (budget_max_ctc > 0)   -- annual CTC in INR
);

-- ---------- Developer side ----------
create table hunts (
  id                 uuid primary key default gen_random_uuid(),
  human_id           uuid not null references humans(id) on delete cascade,
  mode               text not null default 'hunting' check (mode in ('hunting','inbound')),
  role_types         text[] not null default '{}',
  places             text[] not null default '{}',
  daily_limit        int not null default 3 check (daily_limit between 1 and 10),
  blocked_domains    text[] not null default '{}',   -- current employer etc.; those companies never see the developer
  status             text not null default 'active' check (status in ('active','paused','ended')),
  expires_at         timestamptz not null,
  created_at         timestamptz not null default now()
);
create unique index hunts_one_active_per_human on hunts (human_id) where status = 'active';

create table developer_private_limits (
  human_id    uuid primary key references humans(id) on delete cascade,
  min_ctc     numeric check (min_ctc > 0),            -- annual CTC in INR
  notice_days int check (notice_days between 0 and 180)
);

-- ---------- Matching and threads ----------
create table matches (
  id         uuid primary key default gen_random_uuid(),
  role_id    uuid not null references roles(id) on delete cascade,
  human_id   uuid not null references humans(id) on delete cascade,
  score      int not null check (score between 0 and 100),
  reasons    jsonb not null default '[]'::jsonb,
  status     text not null default 'suggested' check (status in ('suggested','shared','dismissed')),
  created_at timestamptz not null default now(),
  unique (role_id, human_id)
);
create index matches_human_idx on matches (human_id);

create table threads (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null unique references matches(id) on delete cascade,
  role_id    uuid not null references roles(id) on delete cascade,
  human_id   uuid not null references humans(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  stage      text not null default 'shortlisted' check (stage in
             ('shortlisted','interview_requested','interview_confirmed','offer_proposed','offer_accepted','declined','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index threads_human_idx on threads (human_id);
create index threads_company_idx on threads (company_id);

-- Structured messages only: no free text from outside agents is ever executed.
create table thread_messages (
  id         bigint generated always as identity primary key,
  thread_id  uuid not null references threads(id) on delete cascade,
  sender     text not null check (sender in ('dev_agent','company_agent','dev_human','company_human','system')),
  kind       text not null,
  body       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index thread_messages_thread_idx on thread_messages (thread_id, id);

-- Coarse result only. Never stores or returns the numbers that produced it.
create table fit_checks (
  match_id   uuid primary key references matches(id) on delete cascade,
  result     text not null check (result in ('fits','no_fit','unknown')),
  checked_at timestamptz not null default now()
);

-- ---------- Approvals (Wynkogent rule 5) ----------
create table approvals (
  id          uuid primary key default gen_random_uuid(),
  human_id    uuid references humans(id) on delete cascade,
  company_id  uuid references companies(id) on delete cascade,
  thread_id   uuid references threads(id) on delete cascade,
  action      text not null check (action in ('share_profile','accept_interview','reveal_identity','send_offer','accept_offer','request_interview')),
  risk        text not null check (risk in ('external','material')),
  summary     text not null,
  payload     jsonb not null default '{}'::jsonb,
  status      text not null default 'pending' check (status in ('pending','approved','declined','expired')),
  expires_at  timestamptz not null,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  check ((human_id is not null)::int + (company_id is not null)::int = 1)   -- exactly one owner decides
);
create index approvals_human_pending_idx on approvals (human_id) where status = 'pending';
create index approvals_company_pending_idx on approvals (company_id) where status = 'pending';
create index approvals_expiry_idx on approvals (expires_at) where status = 'pending';

create table offers (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null unique references threads(id) on delete cascade,
  package    jsonb not null,
  status     text not null default 'proposed' check (status in ('proposed','accepted','declined','expired','withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- Flat per-hire fee tracking (never a percentage of salary). Pilot: waived.
create table placements (
  thread_id  uuid primary key references threads(id) on delete cascade,
  company_id uuid not null references companies(id),
  human_id   uuid not null references humans(id),
  joined_on  date,
  fee_inr    numeric,
  fee_status text not null default 'waived' check (fee_status in ('waived','due','paid')),
  created_at timestamptz not null default now()
);

-- ---------- Connector tokens ----------
create table agent_tokens (
  id           uuid primary key default gen_random_uuid(),
  human_id     uuid references humans(id) on delete cascade,
  company_id   uuid references companies(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 60),
  token_hash   text not null unique,                       -- sha256 of the token; the token itself is never stored
  scopes       text[] not null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  check ((human_id is not null)::int + (company_id is not null)::int = 1)
);

-- ---------- Job queue (driven by pg_cron -> /api/cron/dispatch) ----------
create table jobs (
  id           bigint generated always as identity primary key,
  kind         text not null,
  dedupe_key   text,
  payload      jsonb not null default '{}'::jsonb,
  run_at       timestamptz not null default now(),
  status       text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts     int not null default 0,
  locked_until timestamptz,
  last_error   text,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create unique index jobs_dedupe_idx on jobs (dedupe_key) where status in ('queued','running') and dedupe_key is not null;
create index jobs_due_idx on jobs (run_at) where status in ('queued','running');

-- Atomically claim due jobs; crashed workers' leases expire and the job is retried (max 5 attempts).
create function claim_jobs(batch int, lease_seconds int default 120)
returns setof jobs language sql security definer set search_path = public as $$
  update jobs set status = 'running', locked_until = now() + make_interval(secs => lease_seconds), attempts = attempts + 1
  where id in (
    select id from jobs
    where ((status = 'queued' and run_at <= now()) or (status = 'running' and locked_until < now())) and attempts < 5
    order by run_at limit batch for update skip locked
  )
  returning *;
$$;
revoke execute on function claim_jobs(int, int) from public, anon, authenticated;

-- ---------- RLS ----------
alter table companies               enable row level security;
alter table company_members         enable row level security;
alter table roles                   enable row level security;
alter table role_private_limits     enable row level security;
alter table hunts                   enable row level security;
alter table developer_private_limits enable row level security;
alter table matches                 enable row level security;
alter table threads                 enable row level security;
alter table thread_messages         enable row level security;
alter table fit_checks              enable row level security;
alter table approvals               enable row level security;
alter table offers                  enable row level security;
alter table placements              enable row level security;
alter table agent_tokens            enable row level security;
alter table jobs                    enable row level security;

revoke all on companies, company_members, roles, role_private_limits, hunts, developer_private_limits, matches, threads,
  thread_messages, fit_checks, approvals, offers, placements, agent_tokens, jobs from anon, authenticated;

-- A developer may read only what they are party to. All writes go through the server.
grant select on hunts, matches, threads, thread_messages, approvals, offers to authenticated;
-- Never expose token_hash to the browser, even though it is only a hash.
grant select (id, human_id, name, scopes, created_at, last_used_at, expires_at, revoked_at) on agent_tokens to authenticated;
create policy hunts_self_read     on hunts           for select using (human_id = (select auth.uid()));
create policy matches_self_read   on matches         for select using (human_id = (select auth.uid()));
create policy threads_self_read   on threads         for select using (human_id = (select auth.uid()));
create policy messages_self_read  on thread_messages for select using (exists (select 1 from threads t where t.id = thread_id and t.human_id = (select auth.uid())));
create policy approvals_self_read on approvals       for select using (human_id = (select auth.uid()));
create policy offers_self_read    on offers          for select using (exists (select 1 from threads t where t.id = thread_id and t.human_id = (select auth.uid())));
create policy tokens_self_read    on agent_tokens    for select using (human_id = (select auth.uid()));
