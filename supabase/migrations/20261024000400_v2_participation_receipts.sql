-- LunchVoice v2 foundation 4/N: participation and receipts.
--
-- DEPENDS ON migrations 1-3 (PRs #11, #12, #13). NOT APPLIED TO PRODUCTION. Creates no grant, sets no policy value.
--
-- Privacy model (tested, not just documented):
--   * lv_private.campaign_participation  = WHO took part (eligibility + receipts). Identity-bearing. Never holds answers.
--   * lv_private.campaign_answers/_values = WHAT was answered. For an anonymous Campaign these rows carry NO account and
--     NO reference to the participation row; nothing joins the two. For an identified Campaign the answer row names the
--     account (that is what "identified" means).
--   * No API role has any table grant. The only readers are lv_submit_response (writes), lv_my_receipts (the caller's own
--     receipts, never answers) and, in the next migration, privacy-guarded aggregate analytics.
--   Residual risk, stated plainly: someone with direct database access (not the API roles) can still correlate rows through
--   transaction metadata. Retention, access and operator rules for that are undecided (D-10).
--
-- Provisional (see contract P-20..P-27): one response per person per Campaign; reopening gives no second response; guests
-- have no public entry point (D-03); no reward unless a reward policy is set; audience is "accepted Hub members".

-- ---------------------------------------------------------------------------------------------------------
-- Published question revision is immutable
-- ---------------------------------------------------------------------------------------------------------
alter table lv_private.campaigns add column published_revision int;
update lv_private.campaigns set published_revision = question_revision where activated_at is not null and published_revision is null;

create function lv_private.questions_frozen_after_draft() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
begin
  select x.state, x.activated_at, x.published_revision into c from lv_private.campaigns x where x.id = coalesce(new.campaign_id, old.campaign_id);
  if c.state is distinct from 'draft' or c.activated_at is not null or c.published_revision is not null then
    raise exception 'lv_published_immutable: questions cannot change once a Campaign is no longer a draft' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger campaign_questions_frozen before insert or update or delete on lv_private.campaign_questions
  for each row execute function lv_private.questions_frozen_after_draft();

create function lv_private.published_revision_frozen() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.published_revision is not null and (new.published_revision is distinct from old.published_revision or new.question_revision is distinct from old.question_revision) then
    raise exception 'lv_published_immutable: the published question revision cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger campaigns_revision_frozen before update on lv_private.campaigns
  for each row execute function lv_private.published_revision_frozen();

-- Activation now pins the published revision (same single path as before; only this assignment is new).
create or replace function lv_private.activate_campaign(p_campaign uuid, p_actor uuid, p_key uuid, p_via text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hub uuid; c record; act record; v_checks jsonb; v_result jsonb; v_was_closed boolean;
begin
  select x.hub_id into v_hub from lv_private.campaigns x where x.id = p_campaign;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;

  -- Hub-level lock: every activation, reopening and expiry sweep for this Hub is serialized.
  perform 1 from lv_private.hubs h where h.id = v_hub for update;
  update lv_private.campaigns x set state = 'expired'
  where x.hub_id = v_hub and x.state in ('active', 'scheduled') and x.closes_at is not null and x.closes_at <= now();
  select * into c from lv_private.campaigns x where x.id = p_campaign for update;

  select * into act from lv_private.campaign_activations a where a.campaign_id = p_campaign and a.idempotency_key = p_key;
  if found then
    if act.actor_account_id is distinct from p_actor then
      return lv_private.fail('lv_conflict', 'That idempotency key belongs to another request.');
    end if;
    return lv_private.ok(jsonb_set(act.result, '{replay}', 'true'::jsonb));
  end if;

  v_checks := lv_private.activation_checks(p_campaign);
  if jsonb_array_length(v_checks) > 0 then
    update lv_private.campaigns x set last_activation_error = v_checks->0->>'code', last_activation_attempt_at = now() where x.id = p_campaign;
    return lv_private.fail(v_checks->0->>'code', v_checks->0->>'message', v_checks->0->'details');
  end if;

  v_was_closed := c.state = 'closed';
  update lv_private.campaigns x set
    state = 'active',
    activated_at = coalesce(x.activated_at, now()),
    published_revision = coalesce(x.published_revision, x.question_revision),
    closed_at = null,
    reopened_count = x.reopened_count + case when v_was_closed then 1 else 0 end,
    last_activation_error = null,
    last_activation_attempt_at = now()
  where x.id = p_campaign
  returning jsonb_build_object('campaign_id', x.id, 'state', 'active', 'activated_at', x.activated_at, 'expires_at', x.closes_at, 'replay', false)
  into v_result;
  insert into lv_private.campaign_activations (campaign_id, idempotency_key, actor_account_id, via, result)
  values (p_campaign, p_key, p_actor, case when p_via = 'manual' and v_was_closed then 'reopen' else p_via end, v_result);
  return lv_private.ok(v_result);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Participation ledger gains receipts; audience is DERIVED from the account so a guest can never be a member.
-- ---------------------------------------------------------------------------------------------------------
alter table lv_private.campaign_participation
  add column audience text generated always as (case when account_id is null then 'guest' else 'member' end) stored,
  add column receipt_id uuid not null default gen_random_uuid(),
  add column idempotency_key uuid,
  add column question_revision int,
  add column response_id uuid,
  add column reward_state text not null default 'unset' check (reward_state in ('unset', 'recorded', 'not_applicable')),
  add column points int check (points is null or points >= 0);
create unique index campaign_participation_receipt_idx on lv_private.campaign_participation (receipt_id);

create table lv_private.campaign_answers (
  response_id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lv_private.campaigns (id) on delete restrict,
  hub_id uuid not null references lv_private.hubs (id) on delete restrict,
  question_revision int not null,
  audience text not null check (audience in ('member', 'guest')),
  account_id uuid references lv_private.accounts (id),
  submitted_on date not null default current_date,
  check (audience = 'member' or account_id is null)
);
create index campaign_answers_campaign_idx on lv_private.campaign_answers (campaign_id, audience);

create table lv_private.campaign_answer_values (
  response_id uuid not null references lv_private.campaign_answers (response_id) on delete restrict,
  question_id uuid not null references lv_private.campaign_questions (id) on delete restrict,
  value jsonb not null,
  primary key (response_id, question_id)
);

alter table lv_private.campaign_participation
  add foreign key (response_id) references lv_private.campaign_answers (response_id) on delete restrict;

-- Explicit guest authorization. A guest is a grant scoped to ONE Campaign; how grants are proved and issued (links,
-- email, codes), their lifetime and abuse limits are UNDECIDED (D-03). No API creates grants.
create table lv_private.campaign_guest_grants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lv_private.campaigns (id) on delete restrict,
  token_hash text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

insert into lv_private.policy (key, value, note) values
  ('participation.reward', null,
   'Reward per completed member response. {"points": non-negative int}. Undecided (D-12): NULL means receipts carry reward_state "unset" and no points. A recorded reward does not change any balance in this migration.');

alter table lv_private.campaign_answers enable row level security;
alter table lv_private.campaign_answer_values enable row level security;
alter table lv_private.campaign_guest_grants enable row level security;

-- Database-level guards for the anonymity separation (defence in depth under the RPC logic).
create function lv_private.check_answers() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
begin
  select x.hub_id, x.anonymous into c from lv_private.campaigns x where x.id = new.campaign_id;
  if c.hub_id is distinct from new.hub_id then
    raise exception 'lv_hub_mismatch: answers must belong to the campaign''s Hub' using errcode = '23503';
  end if;
  if c.anonymous and new.account_id is not null then
    raise exception 'lv_anonymity_violation: an anonymous Campaign''s answers cannot name an account' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger campaign_answers_check before insert or update on lv_private.campaign_answers
  for each row execute function lv_private.check_answers();

create function lv_private.check_participation_link() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.response_id is not null and exists (select 1 from lv_private.campaigns c where c.id = new.campaign_id and c.anonymous) then
    raise exception 'lv_anonymity_violation: an anonymous Campaign''s participation cannot reference its answers' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger campaign_participation_link before insert or update on lv_private.campaign_participation
  for each row execute function lv_private.check_participation_link();

-- ---------------------------------------------------------------------------------------------------------
-- Validation, receipts, and the single submission path
-- ---------------------------------------------------------------------------------------------------------

-- NULL when the answers are valid for the Campaign's questions; otherwise {reason, question_id?, ...}.
create function lv_private.validate_answers(p_campaign uuid, p_answers jsonb) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  a jsonb; q record; v_seen uuid[] := '{}'; v_qid uuid; v_val jsonb; v_missing uuid[];
  v_text text;
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' then return jsonb_build_object('reason', 'answers_must_be_an_array'); end if;
  if jsonb_array_length(p_answers) > 100 then return jsonb_build_object('reason', 'too_many_answers'); end if;
  for a in select * from jsonb_array_elements(p_answers) loop
    if jsonb_typeof(a) <> 'object' or not (a ? 'question_id') or (a->>'question_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      return jsonb_build_object('reason', 'malformed_answer');
    end if;
    v_qid := (a->>'question_id')::uuid;
    if v_qid = any (v_seen) then return jsonb_build_object('reason', 'duplicate_answer', 'question_id', v_qid); end if;
    v_seen := v_seen || v_qid;
    select * into q from lv_private.campaign_questions cq where cq.id = v_qid and cq.campaign_id = p_campaign;
    if not found then return jsonb_build_object('reason', 'unknown_question', 'question_id', v_qid); end if;
    v_val := a->'value';
    if v_val is null or v_val = 'null'::jsonb then
      if q.required then return jsonb_build_object('reason', 'required_question_unanswered', 'question_id', v_qid); end if;
      continue;
    end if;
    if q.type in ('rating', 'slider', 'flame', 'nps') then
      if jsonb_typeof(v_val) <> 'number' then
        return jsonb_build_object('reason', 'value_out_of_range', 'question_id', v_qid, 'min', q.scale_min, 'max', q.scale_max);
      end if;
      if (v_val::text) !~ '^-?[0-9]{1,9}$' then
        return jsonb_build_object('reason', 'value_out_of_range', 'question_id', v_qid, 'min', q.scale_min, 'max', q.scale_max);
      end if;
      if (v_val::text)::int < q.scale_min or (v_val::text)::int > q.scale_max then
        return jsonb_build_object('reason', 'value_out_of_range', 'question_id', v_qid, 'min', q.scale_min, 'max', q.scale_max);
      end if;
    elsif q.type = 'yes_no' then
      if jsonb_typeof(v_val) <> 'boolean' then return jsonb_build_object('reason', 'value_must_be_boolean', 'question_id', v_qid); end if;
    elsif q.type = 'single_choice' then
      if jsonb_typeof(v_val) <> 'string' then
        return jsonb_build_object('reason', 'value_not_an_option', 'question_id', v_qid);
      end if;
      if not (q.options ? (v_val #>> '{}')) then
        return jsonb_build_object('reason', 'value_not_an_option', 'question_id', v_qid);
      end if;
    elsif q.type in ('multi_choice', 'ranking') then
      if jsonb_typeof(v_val) <> 'array' then
        return jsonb_build_object('reason', 'value_not_an_option', 'question_id', v_qid);
      end if;
      if exists (select 1 from jsonb_array_elements(v_val) e where jsonb_typeof(e) <> 'string' or not (q.options ? (e #>> '{}'))) then
        return jsonb_build_object('reason', 'value_not_an_option', 'question_id', v_qid);
      end if;
      if (select count(*) from jsonb_array_elements_text(v_val)) <> (select count(distinct e) from jsonb_array_elements_text(v_val) e) then
        return jsonb_build_object('reason', 'duplicate_options', 'question_id', v_qid);
      end if;
      if q.type = 'ranking' and jsonb_array_length(v_val) <> jsonb_array_length(q.options) then
        return jsonb_build_object('reason', 'ranking_must_order_every_option', 'question_id', v_qid);
      end if;
      if q.required and jsonb_array_length(v_val) = 0 then return jsonb_build_object('reason', 'required_question_unanswered', 'question_id', v_qid); end if;
    elsif q.type = 'text' then
      if jsonb_typeof(v_val) <> 'string' then return jsonb_build_object('reason', 'text_invalid_or_too_long', 'question_id', v_qid); end if;
      v_text := v_val #>> '{}';
      if length(v_text) > 2000 then return jsonb_build_object('reason', 'text_invalid_or_too_long', 'question_id', v_qid); end if;
      if q.required and length(btrim(v_text)) = 0 then return jsonb_build_object('reason', 'required_question_unanswered', 'question_id', v_qid); end if;
    end if;
  end loop;
  select array_agg(cq.id order by cq.position) into v_missing from lv_private.campaign_questions cq
  where cq.campaign_id = p_campaign and cq.required and cq.id <> all (v_seen);
  if v_missing is not null then return jsonb_build_object('reason', 'required_question_unanswered', 'question_ids', to_jsonb(v_missing)); end if;
  return null;
end;
$$;

create function lv_private.receipt_json(p_participation uuid, p_duplicate boolean) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', p.receipt_id, 'campaign_id', p.campaign_id, 'duplicate', p_duplicate,
    'points', p.points, 'reward_state', p.reward_state, 'submitted_at', p.created_at)
  from lv_private.campaign_participation p where p.id = p_participation
$$;

-- The one submission path for members and guests. Atomic: lifecycle, duplicate, validation, answers and receipt are
-- decided and written in a single transaction. Concurrency with close/expiry: the Campaign row is locked FOR SHARE, close
-- and activation take it FOR UPDATE, so each submission is wholly before or wholly after a close; the closing time is
-- re-read with clock_timestamp() AFTER the lock is acquired, so a submission that waited past closes_at is refused.
create function lv_private.submit_core(p_campaign uuid, p_account uuid, p_guest_ref text, p_answers jsonb, p_key uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c record; ex record; v_bad jsonb; v_resp uuid; v_part uuid; v_pol jsonb; v_points int; v_state text; a jsonb; v_aud text;
begin
  v_aud := case when p_account is null then 'guest' else 'member' end;
  select * into c from lv_private.campaigns x where x.id = p_campaign for share;
  if not found then return lv_private.fail('lv_not_found', 'Not found.'); end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_submit:' || p_campaign::text || ':' || coalesce(p_account::text, p_guest_ref), 0));

  -- Duplicate behaviour is independent of the idempotency key: one response per person per Campaign.
  select * into ex from lv_private.campaign_participation p
  where p.campaign_id = p_campaign and ((p_account is not null and p.account_id = p_account) or (p_account is null and p.guest_ref = p_guest_ref));
  if found then return lv_private.ok(lv_private.receipt_json(ex.id, true)); end if;

  if c.state <> 'active' or c.published_revision is null then
    return lv_private.fail('lv_lifecycle_invalid', 'This Campaign is not open.', jsonb_build_object('reason', 'not_active', 'state', lv_private.campaign_effective_state(c.state, c.closes_at)));
  end if;
  if c.closes_at is not null and c.closes_at <= clock_timestamp() then
    return lv_private.fail('lv_lifecycle_invalid', 'This Campaign has closed.', jsonb_build_object('reason', 'closed_by_time', 'state', 'expired'));
  end if;
  if c.mode <> 'survey' then
    return lv_private.fail('lv_policy_undecided', 'That Campaign mode is not available yet.', jsonb_build_object('reason', 'mode_not_available', 'decision', 'D-08'));
  end if;

  v_bad := lv_private.validate_answers(p_campaign, p_answers);
  if v_bad is not null then return lv_private.fail('lv_invalid_input', 'Check your answers.', v_bad); end if;

  -- Reward: only from a decided policy, only for members; recorded, never applied to a balance here.
  v_pol := lv_private.policy_ok_reward();
  if v_aud = 'guest' then v_state := 'not_applicable'; v_points := null;
  elsif v_pol is null then v_state := 'unset'; v_points := null;
  else v_state := 'recorded'; v_points := (v_pol->>'points')::int; end if;

  insert into lv_private.campaign_answers (campaign_id, hub_id, question_revision, audience, account_id)
  values (p_campaign, c.hub_id, c.published_revision, v_aud, case when c.anonymous then null else p_account end)
  returning response_id into v_resp;
  insert into lv_private.campaign_answer_values (response_id, question_id, value)
  select v_resp, (e->>'question_id')::uuid, e->'value' from jsonb_array_elements(p_answers) e
  where e->'value' is not null and e->'value' <> 'null'::jsonb;

  insert into lv_private.campaign_participation (campaign_id, hub_id, account_id, guest_ref, idempotency_key, question_revision, response_id, reward_state, points)
  values (p_campaign, c.hub_id, p_account, p_guest_ref, p_key, c.published_revision, case when c.anonymous then null else v_resp end, v_state, v_points)
  returning id into v_part;
  return lv_private.ok(lv_private.receipt_json(v_part, false));
end;
$$;

create function lv_private.policy_ok_reward() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v jsonb;
begin
  select p.value into v from lv_private.policy p where p.key = 'participation.reward';
  if v is not null and jsonb_typeof(v) = 'object' and (v->>'points') ~ '^[0-9]{1,6}$' then return v; end if;
  return null;
end;
$$;

-- Guest submission core. NOT exposed: there is no decided guest proof (D-03). A guest is an unexpired, unrevoked grant
-- scoped to this one Campaign; the Campaign must have guest_access = link. A guest never becomes a member, receives no
-- reward, and learns nothing about the Hub.
create function lv_private.submit_guest(p_grant uuid, p_answers jsonb, p_key uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  g record; c record;
begin
  select * into g from lv_private.campaign_guest_grants x where x.id = p_grant;
  if not found or g.revoked_at is not null or (g.expires_at is not null and g.expires_at <= clock_timestamp()) then
    return lv_private.fail('lv_forbidden', 'This guest link is not valid.');
  end if;
  select x.guest_access into c from lv_private.campaigns x where x.id = g.campaign_id;
  if c.guest_access is distinct from 'link' then
    return lv_private.fail('lv_forbidden', 'Guest access is not enabled for this Campaign.');
  end if;
  return lv_private.submit_core(g.campaign_id, null, p_grant::text, p_answers, p_key);
end;
$$;

revoke all on all tables in schema lv_private from public, anon, authenticated;
revoke all on all functions in schema lv_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------------------------------------
create function public.lv_submit_response(campaign_id uuid, answers jsonb, idempotency_key uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hub uuid; v_caller uuid;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if campaign_id is null or idempotency_key is null then return lv_private.fail('lv_invalid_input', 'Check the request.'); end if;
  select c.hub_id into v_hub from lv_private.campaigns c where c.id = lv_submit_response.campaign_id;
  v_caller := lv_private.current_account_id();
  -- Unknown Campaign and "not your Hub" look the same, so Campaign ids reveal nothing across Hubs.
  if v_hub is null or lv_private.membership_status(v_hub, v_caller) is distinct from 'accepted' then
    return lv_private.fail('lv_not_found', 'Not found.');
  end if;
  return lv_private.submit_core(campaign_id, v_caller, null, answers, idempotency_key);
end;
$$;

create function public.lv_my_receipts() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_caller uuid;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  v_caller := lv_private.current_account_id();
  return lv_private.ok(jsonb_build_object('receipts', coalesce((
    select jsonb_agg(lv_private.receipt_json(p.id, false) order by p.created_at desc, p.id)
    from lv_private.campaign_participation p where p.account_id = v_caller), '[]'::jsonb)));
end;
$$;

-- Resolve a join code. Private Hubs answer only accepted members (anyone else gets not_found); drafts and scheduled
-- Campaigns are never disclosed. No rate limiting yet (abuse limits undecided).
create function public.lv_campaign_resolve(code text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record; v_caller uuid := lv_private.current_account_id();
begin
  if code is null or length(btrim(code)) < 1 or length(code) > 64 then return lv_private.fail('lv_invalid_input', 'Enter a code.'); end if;
  select c.id, c.title, c.anonymous, c.state, c.closes_at, h.id as hub_id, h.visibility, o.slug into r
  from lv_private.campaigns c join lv_private.hubs h on h.id = c.hub_id join public.orgs o on o.id = h.id
  where c.join_code = upper(btrim(code)) and c.state in ('active', 'closed', 'expired');
  if not found or (r.visibility = 'private' and (v_caller is null or lv_private.membership_status(r.hub_id, v_caller) is distinct from 'accepted')) then
    return lv_private.fail('lv_not_found', 'No Campaign matches that code.');
  end if;
  return lv_private.ok(jsonb_build_object('campaign_id', r.id, 'hub_id', r.hub_id, 'hub_slug', lower(r.slug), 'title', r.title,
    'state', lv_private.campaign_effective_state(r.state, r.closes_at), 'anonymous', r.anonymous, 'requires_account', true));
end;
$$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('lv_submit_response', 'lv_my_receipts', 'lv_campaign_resolve')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
  end loop;
end;
$$;
