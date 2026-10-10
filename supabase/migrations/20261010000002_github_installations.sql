-- Maps a GitHub App installation to the human who owns it. Server-side writes only (service role),
-- after verifying that the installation's account matches the human's verified GitHub login.
create table github_installations (
  installation_id bigint primary key,
  human_id        uuid not null references humans(id) on delete cascade,
  account_login   text not null,
  created_at      timestamptz not null default now()
);
create index github_installations_human_idx on github_installations (human_id);

alter table github_installations enable row level security;

create policy github_installations_self_read on github_installations
  for select using (human_id = (select auth.uid()));

revoke all on github_installations from anon, authenticated;
grant select on github_installations to authenticated;
