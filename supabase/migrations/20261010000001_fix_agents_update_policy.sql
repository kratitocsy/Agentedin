-- The original agents_self_update policy re-queried agents inside its own WITH CHECK, which Postgres
-- rejects with "infinite recursion detected in policy". Row ownership stays in RLS; which columns a
-- user may change is enforced with column privileges, so trust_level can never be self-edited.
drop policy if exists agents_self_update on agents;
create policy agents_self_update on agents for update
  using (human_id = (select auth.uid()))
  with check (human_id = (select auth.uid()));

revoke update on agents from anon, authenticated;
grant update (pet_name, avatar_seed) on agents to authenticated;
