-- Hiring engine: every state change that matters is one atomic function. Callable only by the server (service role).
-- Sealed limits are read inside the database; callers only ever receive 'fits' | 'no_fit' | 'unknown'.

create or replace function engine_fit_check(p_match uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_min numeric; v_max numeric; v_res text;
begin
  select dpl.min_ctc, rpl.budget_max_ctc into v_min, v_max
  from matches m
  left join developer_private_limits dpl on dpl.human_id = m.human_id
  left join role_private_limits rpl on rpl.role_id = m.role_id
  where m.id = p_match;
  if not found then raise exception 'match_not_found'; end if;
  v_res := case when v_min is null or v_max is null then 'unknown' when v_min <= v_max then 'fits' else 'no_fit' end;
  insert into fit_checks (match_id, result) values (p_match, v_res)
    on conflict (match_id) do update set result = excluded.result, checked_at = now();
  return v_res;
end $$;

create or replace function engine_create_match(p_role uuid, p_human uuid, p_score int, p_reasons jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into matches (role_id, human_id, score, reasons) values (p_role, p_human, p_score, coalesce(p_reasons, '[]'::jsonb))
  on conflict (role_id, human_id) do update set score = excluded.score, reasons = excluded.reasons
  returning id into v_id;
  return v_id;
end $$;

-- Hunting mode: the agent shares the persona card on its own, inside the hunt's consent scope and daily limit.
create or replace function engine_share_match(p_match uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare m matches%rowtype; r roles%rowtype; c companies%rowtype; h hunts%rowtype; v_thread uuid; v_today int;
begin
  select * into m from matches where id = p_match;
  if not found then raise exception 'match_not_found'; end if;
  if m.status <> 'suggested' then return null; end if;
  select * into r from roles where id = m.role_id and status = 'open';
  if not found then return null; end if;
  select * into c from companies where id = r.company_id and status = 'approved';
  if not found then return null; end if;
  select * into h from hunts where human_id = m.human_id and status = 'active' and expires_at > now() and mode = 'hunting';
  if not found then return null; end if;
  if c.domain = any (h.blocked_domains) then return null; end if;
  if engine_fit_check(p_match) <> 'fits' then return null; end if;
  select count(*) into v_today from threads where human_id = m.human_id and created_at >= date_trunc('day', now());
  if v_today >= h.daily_limit then return null; end if;

  insert into threads (match_id, role_id, human_id, company_id, stage) values (m.id, r.id, m.human_id, c.id, 'shortlisted') returning id into v_thread;
  update matches set status = 'shared' where id = m.id;
  insert into thread_messages (thread_id, sender, kind, body)
    values (v_thread, 'dev_agent', 'agent_applied', jsonb_build_object('score', m.score, 'reasons', m.reasons, 'fit', 'range fits'));
  insert into audit_events (actor, human_id, action, entity, entity_id, details)
    values ('agent', m.human_id, 'match.shared', 'thread', v_thread::text, jsonb_build_object('company_id', c.id, 'role_id', r.id, 'hunt_id', h.id));
  return v_thread;
end $$;

-- Company asks for an interview. Always needs the developer's approval; nothing is revealed yet.
create or replace function engine_request_interview(p_company uuid, p_match uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare m matches%rowtype; r roles%rowtype; c companies%rowtype; h hunts%rowtype; t threads%rowtype; v_thread uuid; v_appr uuid;
begin
  select * into m from matches where id = p_match;
  if not found then raise exception 'match_not_found'; end if;
  select * into r from roles where id = m.role_id and company_id = p_company and status = 'open';
  if not found then raise exception 'role_not_available'; end if;
  select * into c from companies where id = p_company and status = 'approved';
  if not found then raise exception 'company_not_approved'; end if;
  select * into h from hunts where human_id = m.human_id and status = 'active' and expires_at > now();
  -- Blocked companies (including the current employer) and unavailable candidates look identical to the caller.
  if not found or c.domain = any (h.blocked_domains) or engine_fit_check(p_match) = 'no_fit' then raise exception 'candidate_not_available'; end if;

  select * into t from threads where match_id = p_match;
  if not found then
    insert into threads (match_id, role_id, human_id, company_id, stage) values (m.id, r.id, m.human_id, c.id, 'interview_requested') returning id into v_thread;
    update matches set status = 'shared' where id = m.id;
  else
    v_thread := t.id;
    if t.stage = 'shortlisted' then update threads set stage = 'interview_requested', updated_at = now() where id = t.id;
    elsif t.stage <> 'interview_requested' then raise exception 'invalid_stage'; end if;
  end if;

  select id into v_appr from approvals where thread_id = v_thread and action = 'accept_interview' and status = 'pending' and expires_at > now();
  if v_appr is not null then return v_appr; end if;

  insert into approvals (human_id, thread_id, action, risk, summary, payload, expires_at)
    values (m.human_id, v_thread, 'accept_interview', 'material',
            format('%s wants to interview you for "%s". Accepting reveals your name, photo and email to %s only.', c.name, r.title, c.name),
            jsonb_build_object('company_id', c.id, 'role_id', r.id), now() + interval '48 hours')
    returning id into v_appr;
  insert into thread_messages (thread_id, sender, kind, body) values (v_thread, 'company_agent', 'interview_requested', '{}'::jsonb);
  insert into audit_events (actor, human_id, action, entity, entity_id, details)
    values ('agent', m.human_id, 'interview.requested', 'thread', v_thread::text, jsonb_build_object('company_id', c.id, 'role_id', r.id));
  return v_appr;
end $$;

-- Company proposes an offer: creates an approval that the company's own human must confirm before it is sent.
create or replace function engine_propose_offer(p_company uuid, p_thread uuid, p_package jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare t threads%rowtype; v_appr uuid;
begin
  select * into t from threads where id = p_thread and company_id = p_company;
  if not found then raise exception 'thread_not_found'; end if;
  if t.stage <> 'interview_confirmed' then raise exception 'invalid_stage'; end if;
  if exists (select 1 from offers where thread_id = p_thread) then raise exception 'offer_exists'; end if;
  if coalesce(p_package->>'title', '') = '' or coalesce((p_package->>'ctc_inr')::numeric, 0) <= 0 then raise exception 'invalid_package'; end if;
  select id into v_appr from approvals where thread_id = p_thread and action = 'send_offer' and status = 'pending' and expires_at > now();
  if v_appr is not null then return v_appr; end if;
  insert into approvals (company_id, thread_id, action, risk, summary, payload, expires_at)
    values (p_company, p_thread, 'send_offer', 'material',
            format('Send this offer: "%s", INR %s per year?', p_package->>'title', p_package->>'ctc_inr'),
            jsonb_build_object('package', p_package), now() + interval '24 hours')
    returning id into v_appr;
  return v_appr;
end $$;

-- One place where an expired approval is closed out, so lazy and scheduled expiry behave identically.
create or replace function engine_expire_one(a approvals) returns void
language plpgsql security definer set search_path = public as $$
begin
  update approvals set status = 'expired', decided_at = now() where id = a.id and status = 'pending';
  if a.action = 'accept_interview' then
    update threads set stage = 'closed', updated_at = now() where id = a.thread_id and stage = 'interview_requested';
    insert into thread_messages (thread_id, sender, kind) values (a.thread_id, 'system', 'interview_request_expired');
  elsif a.action = 'accept_offer' then
    update offers set status = 'expired', decided_at = now() where id = (a.payload->>'offer_id')::uuid and status = 'proposed';
    update threads set stage = 'closed', updated_at = now() where id = a.thread_id and stage = 'offer_proposed';
    insert into thread_messages (thread_id, sender, kind) values (a.thread_id, 'system', 'offer_expired');
  elsif a.action = 'send_offer' then
    insert into thread_messages (thread_id, sender, kind) values (a.thread_id, 'system', 'offer_approval_expired');
  end if;
  insert into audit_events (actor, human_id, action, entity, entity_id, details)
    values ('system', a.human_id, 'approval.expired', 'approval', a.id::text, jsonb_build_object('action', a.action));
end $$;

create or replace function engine_expire_approvals() returns int
language plpgsql security definer set search_path = public as $$
declare a approvals%rowtype; n int := 0;
begin
  for a in select * from approvals where status = 'pending' and expires_at <= now() for update skip locked loop
    perform engine_expire_one(a);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function engine_expire_hunts() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update hunts set status = 'ended' where status = 'active' and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- The only way an approval is decided. Only its owner can decide it; a decided or expired one cannot be re-decided.
create or replace function engine_decide_approval(p_approval uuid, p_human uuid, p_company uuid, p_approve boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a approvals%rowtype; t threads%rowtype; hm humans%rowtype; v_status text; v_offer uuid;
begin
  select * into a from approvals where id = p_approval for update;
  if not found then raise exception 'approval_not_found'; end if;
  if not (a.human_id is not distinct from p_human and a.company_id is not distinct from p_company) then raise exception 'not_owner'; end if;
  if a.status <> 'pending' then raise exception 'already_decided'; end if;
  if a.expires_at <= now() then
    perform engine_expire_one(a);
    return jsonb_build_object('status', 'expired', 'action', a.action, 'thread_id', a.thread_id);
  end if;

  v_status := case when p_approve then 'approved' else 'declined' end;
  update approvals set status = v_status, decided_at = now() where id = a.id;
  select * into t from threads where id = a.thread_id;

  if a.action = 'accept_interview' then
    if p_approve then
      if t.stage <> 'interview_requested' then raise exception 'invalid_stage'; end if;
      update threads set stage = 'interview_confirmed', updated_at = now() where id = t.id;
      select * into hm from humans where id = t.human_id;
      -- The reveal: name, photo and contact go into this thread only, which only this company can read.
      insert into thread_messages (thread_id, sender, kind, body)
        values (t.id, 'system', 'identity_revealed', jsonb_build_object('name', hm.display_name, 'github', hm.github_login, 'email', hm.email, 'photo_url', hm.photo_url));
      insert into audit_events (actor, human_id, action, entity, entity_id, details)
        values ('human', t.human_id, 'identity.revealed', 'thread', t.id::text, jsonb_build_object('company_id', t.company_id));
    else
      update threads set stage = 'declined', updated_at = now() where id = t.id;
      insert into thread_messages (thread_id, sender, kind) values (t.id, 'dev_human', 'interview_declined');  -- no reason is ever given
    end if;

  elsif a.action = 'send_offer' then
    if p_approve then
      if t.stage <> 'interview_confirmed' then raise exception 'invalid_stage'; end if;
      insert into offers (thread_id, package) values (t.id, a.payload->'package') returning id into v_offer;
      update threads set stage = 'offer_proposed', updated_at = now() where id = t.id;
      insert into approvals (human_id, thread_id, action, risk, summary, payload, expires_at)
        values (t.human_id, t.id, 'accept_offer', 'material',
                format('Offer: "%s", INR %s per year. Accept?', a.payload->'package'->>'title', a.payload->'package'->>'ctc_inr'),
                jsonb_build_object('offer_id', v_offer), now() + interval '48 hours');
      insert into thread_messages (thread_id, sender, kind, body) values (t.id, 'company_human', 'offer_proposed', a.payload->'package');
    else
      insert into thread_messages (thread_id, sender, kind) values (t.id, 'system', 'offer_not_sent');
    end if;

  elsif a.action = 'accept_offer' then
    if p_approve then
      if t.stage <> 'offer_proposed' then raise exception 'invalid_stage'; end if;
      update offers set status = 'accepted', decided_at = now() where id = (a.payload->>'offer_id')::uuid;
      update threads set stage = 'offer_accepted', updated_at = now() where id = t.id;
      insert into placements (thread_id, company_id, human_id) values (t.id, t.company_id, t.human_id) on conflict (thread_id) do nothing;
      insert into thread_messages (thread_id, sender, kind) values (t.id, 'dev_human', 'offer_accepted');
    else
      update offers set status = 'declined', decided_at = now() where id = (a.payload->>'offer_id')::uuid;
      update threads set stage = 'declined', updated_at = now() where id = t.id;
      insert into thread_messages (thread_id, sender, kind) values (t.id, 'dev_human', 'offer_declined');
    end if;
  end if;

  insert into audit_events (actor, human_id, action, entity, entity_id, details)
    values ('human', a.human_id, 'approval.' || v_status, 'approval', a.id::text, jsonb_build_object('action', a.action, 'company_id', a.company_id));
  return jsonb_build_object('status', v_status, 'action', a.action, 'thread_id', a.thread_id, 'stage', (select stage from threads where id = a.thread_id));
end $$;

revoke execute on function
  engine_fit_check(uuid), engine_create_match(uuid, uuid, int, jsonb), engine_share_match(uuid), engine_request_interview(uuid, uuid),
  engine_propose_offer(uuid, uuid, jsonb), engine_expire_one(approvals), engine_expire_approvals(), engine_expire_hunts(),
  engine_decide_approval(uuid, uuid, uuid, boolean)
from public, anon, authenticated;
