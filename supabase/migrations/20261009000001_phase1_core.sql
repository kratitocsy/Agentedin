-- Agentedin Phase 1: developer agent core + Wynkogent v1 (consents, append-only audit).
-- Every table has row-level security on. Service-role (server only) is the only writer
-- for audit_events and evidence; the browser never holds a secret key.

create extension if not exists pgcrypto;

-- One verified person. id = auth.users.id (Supabase Auth, GitHub provider).
create table humans (
  id           uuid primary key references auth.users(id) on delete cascade,
  github_login text,
  display_name text,
  photo_url    text,          -- revealed to a company only after the human confirms an interview
  email        text,
  whatsapp_e164 text unique,  -- set after number verification
  whatsapp_verified_at timestamptz,
  created_at   timestamptz not null default now()
);

-- One agent per human (pet name + abstract avatar). Trust level per plan: 0 claimed, 1 verified, 2 hiring-ready.
create table agents (
  id          uuid primary key default gen_random_uuid(),
  human_id    uuid not null unique references humans(id) on delete cascade,
  pet_name    text not null check (char_length(pet_name) between 2 and 24),
  avatar_seed text not null default encode(gen_random_bytes(8), 'hex'),
  trust_level smallint not null default 0 check (trust_level between 0 and 2),
  created_at  timestamptz not null default now()
);

-- Linked identities (GitHub, X, WhatsApp, Codeforces...), each tied to exactly one human.
create table identities (
  id          uuid primary key default gen_random_uuid(),
  human_id    uuid not null references humans(id) on delete cascade,
  provider    text not null check (provider in ('github','x','whatsapp','codeforces','leetcode')),
  external_id text not null,
  handle      text,
  verified    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (provider, external_id)
);

-- Project cards, ratings, skills. Every row is verified or self-reported, never unlabeled.
create table evidence (
  id          uuid primary key default gen_random_uuid(),
  human_id    uuid not null references humans(id) on delete cascade,
  kind        text not null check (kind in ('project','skill','rating','resume')),
  title       text not null,
  summary     text,
  source      text not null check (source in ('github','codeforces','leetcode','resume')),
  status      text not null check (status in ('verified','self_reported')),
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  -- only GitHub/Codeforces API data may be verified
  check (status = 'self_reported' or source in ('github','codeforces'))
);

-- Recorded consent (a hunt session's "Yes" etc). Revocable from the privacy center.
create table consents (
  id          uuid primary key default gen_random_uuid(),
  human_id    uuid not null references humans(id) on delete cascade,
  kind        text not null check (kind in ('hunt_session','open_to_inbound','accept_referrals','lounge','public_profile')),
  scope       jsonb not null default '{}'::jsonb,  -- role types, places, duration, daily limit
  expires_at  timestamptz,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

-- Append-only audit log. Writes via service role only; no update/delete, ever.
create table audit_events (
  id         bigint generated always as identity primary key,
  actor      text not null check (actor in ('human','agent','system')),
  human_id   uuid references humans(id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  text,
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function audit_events_immutable() returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'audit_events is append-only';
end $$;
create trigger audit_events_no_change
  before update or delete on audit_events
  for each row execute function audit_events_immutable();

-- ---------- Row-level security ----------
alter table humans       enable row level security;
alter table agents       enable row level security;
alter table identities   enable row level security;
alter table evidence     enable row level security;
alter table consents     enable row level security;
alter table audit_events enable row level security;

create policy humans_self_read   on humans for select using (id = (select auth.uid()));
create policy humans_self_update on humans for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy agents_self_read   on agents for select using (human_id = (select auth.uid()));
create policy agents_self_update on agents for update using (human_id = (select auth.uid()))
  with check (human_id = (select auth.uid()) and trust_level = (select trust_level from agents a where a.id = agents.id));

create policy identities_self_read on identities for select using (human_id = (select auth.uid()));

-- Evidence: read own; may add/edit/delete own *self-reported* rows only. Verified rows come from the server.
create policy evidence_self_read   on evidence for select using (human_id = (select auth.uid()));
create policy evidence_self_insert on evidence for insert with check (human_id = (select auth.uid()) and status = 'self_reported');
create policy evidence_self_update on evidence for update using (human_id = (select auth.uid()) and status = 'self_reported')
  with check (human_id = (select auth.uid()) and status = 'self_reported');
create policy evidence_self_delete on evidence for delete using (human_id = (select auth.uid()));

-- Consents: read own, grant own, revoke own (revoke = set revoked_at; no delete so history stays).
create policy consents_self_read   on consents for select using (human_id = (select auth.uid()));
create policy consents_self_insert on consents for insert with check (human_id = (select auth.uid()));
create policy consents_self_revoke on consents for update using (human_id = (select auth.uid()))
  with check (human_id = (select auth.uid()));

-- Privacy center: humans can read their own audit trail. No insert/update/delete policies = service role only.
create policy audit_self_read on audit_events for select using (human_id = (select auth.uid()));

revoke all on audit_events from anon, authenticated;
grant select on audit_events to authenticated;

-- Create human + agent rows on first GitHub sign-in.
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  login text := new.raw_user_meta_data->>'user_name';
begin
  insert into humans (id, github_login, display_name, photo_url, email)
  values (new.id, login, new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'avatar_url', new.email);

  insert into agents (human_id, pet_name)
  values (new.id, coalesce(nullif(left(login, 24), ''), 'Byte'));

  insert into identities (human_id, provider, external_id, handle, verified)
  values (new.id, 'github', new.raw_user_meta_data->>'provider_id', login, true);

  insert into audit_events (actor, human_id, action, entity, entity_id, details)
  values ('system', new.id, 'human.created', 'human', new.id::text, '{"provider":"github"}');
  return new;
end $$;

revoke execute on function handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
