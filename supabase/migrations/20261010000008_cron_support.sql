-- Scheduler plumbing. The dispatcher secret lives ONLY in Supabase Vault: pg_cron sends it, and the app verifies it
-- by calling verify_cron_secret(), so it is never copied into Vercel or any chat.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if not exists (select 1 from vault.secrets where name = 'cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cron_secret', 'Bearer secret for /api/cron/dispatch');
  end if;
end $$;

create or replace function verify_cron_secret(candidate text) returns boolean
language sql security definer set search_path = public, vault as $$
  select candidate is not null and exists (select 1 from vault.decrypted_secrets where name = 'cron_secret' and decrypted_secret = candidate);
$$;
revoke execute on function verify_cron_secret(text) from public, anon, authenticated;

-- Recurring jobs use dedupe keys like 'cron:<kind>:<bucket>'; one row per bucket regardless of status.
create unique index if not exists jobs_recurring_idx on jobs (dedupe_key) where dedupe_key like 'cron:%';

-- Proactivity limits (Wynkogent rule 6): >=24h between nudges, pause after a refusal or unsubscribe.
create table nudge_counters (
  human_id      uuid not null references humans(id) on delete cascade,
  kind          text not null,
  last_sent_at  timestamptz,
  sent_count    int not null default 0,
  paused_until  timestamptz,
  primary key (human_id, kind)
);
alter table nudge_counters enable row level security;
revoke all on nudge_counters from anon, authenticated;
