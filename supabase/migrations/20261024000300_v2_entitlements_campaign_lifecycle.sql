-- LunchVoice v2 foundation 3/N: entitlement limits and the Campaign lifecycle (draft, scheduled, active, closed,
-- expired) with one atomic activation path, quota enforcement and the participation gate.
--
-- DEPENDS ON 20261024000100 and 20261024000200 (PRs #11, #12). NOT APPLIED TO PRODUCTION. It creates no
-- entitlement grant and sets no policy value: every unresolved rule below reads lv_private.policy and FAILS CLOSED
-- (lv_policy_undecided with details.missing) until the founder decides it. Tests set synthetic, illustrative
-- policy values; those are not production policy.
--
-- Confirmed numbers coded here: Starter 3 roles / 3 pages / 15 active Campaigns / 2 active surveys; Team 6 roles /
-- 5 active surveys (Team pages and Team active-Campaign totals are UNDECIDED and stay NULL, never unlimited);
-- gate comparisons Starter 2R > M, Team 5R >= M in exact integer arithmetic. Everything else is policy.

-- ---------------------------------------------------------------------------------------------------------
-- Policy keys (all NULL = undecided). Shapes are validated; an invalid value counts as undecided.
-- ---------------------------------------------------------------------------------------------------------
insert into lv_private.policy (key, value, note) values
  ('quota.consuming_states', null,
   'Which Campaign states consume an active-Campaign slot. JSON array, subset of ["active","scheduled"]. Undecided (D-06): NULL makes activation fail closed.'),
  ('gate.measurement', null,
   'Participation measurement window. {"window_days": positive int}: unique responders counted over the last N days. Undecided (D-04).'),
  ('gate.eligible_population', null,
   'Which accepted members count in the denominator (and as eligible responders). {"sources": [membership sources]}. Undecided (D-04/D-05).'),
  ('gate.applies_to', null,
   'When the gate applies. {"min_other_active_surveys": int}: the gate applies when at least this many other surveys already hold a slot. Undecided (D-04).'),
  ('gate.bootstrap', null,
   'Gate result when the eligible population is empty. {"zero_members": "met"|"unmet"}. Undecided (D-04).');

-- ---------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------
create table lv_private.campaigns (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv_private.hubs (id) on delete restrict,
  mode text not null default 'survey' check (mode in ('survey', 'poll', 'rating', 'feedback', 'election', 'seasonal')),
  state text not null default 'draft' check (state in ('draft', 'scheduled', 'active', 'closed', 'expired')),
  title text not null check (length(btrim(title)) between 1 and 120),
  anonymous boolean not null default false,
  guest_access text not null default 'off' check (guest_access in ('off', 'link')),
  opens_at timestamptz,
  closes_at timestamptz,
  activated_at timestamptz,
  closed_at timestamptz,
  reopened_count int not null default 0,
  question_revision int not null default 1,
  join_code text not null unique,
  legacy_session_id uuid,
  created_by uuid references lv_private.accounts (id),
  scheduled_by uuid references lv_private.accounts (id),
  last_activation_error text,
  last_activation_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);
create index campaigns_hub_state_idx on lv_private.campaigns (hub_id, state);

create table lv_private.campaign_questions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lv_private.campaigns (id) on delete cascade,
  position int not null check (position >= 1),
  type text not null check (type in ('rating', 'text', 'single_choice', 'multi_choice', 'yes_no', 'flame', 'slider', 'nps', 'ranking')),
  prompt text not null check (length(btrim(prompt)) between 1 and 500),
  help_text text,
  required boolean not null default false,
  options jsonb not null default '[]'::jsonb,
  scale_min int not null default 1,
  scale_max int not null default 5,
  unique (campaign_id, position)
);

-- Who has participated, for the gate. One row per (campaign, account); guests (no account) are rows that can never
-- be counted as members. Rows are never deleted by closing, expiry or reopening, so history is preserved.
-- The submission RPC and the anonymity separation arrive with the participation migration.
create table lv_private.campaign_participation (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references lv_private.campaigns (id) on delete restrict,
  hub_id uuid not null references lv_private.hubs (id) on delete restrict,
  account_id uuid references lv_private.accounts (id),
  guest_ref text,
  created_at timestamptz not null default now(),
  check ((account_id is null) <> (guest_ref is null))
);
create unique index campaign_participation_account_idx on lv_private.campaign_participation (campaign_id, account_id) where account_id is not null;
create unique index campaign_participation_guest_idx on lv_private.campaign_participation (campaign_id, guest_ref) where guest_ref is not null;
create index campaign_participation_hub_time_idx on lv_private.campaign_participation (hub_id, created_at);

-- First result of each activation request, so a retry returns it instead of acting again.
create table lv_private.campaign_activations (
  campaign_id uuid not null references lv_private.campaigns (id) on delete restrict,
  idempotency_key uuid not null,
  actor_account_id uuid references lv_private.accounts (id),
  via text not null check (via in ('manual', 'reopen', 'scheduled')),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, idempotency_key)
);

alter table lv_private.campaigns enable row level security;
alter table lv_private.campaign_questions enable row level security;
alter table lv_private.campaign_participation enable row level security;
alter table lv_private.campaign_activations enable row level security;
revoke all on all tables in schema lv_private from public, anon, authenticated;

create function lv_private.touch_campaign() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;
create trigger campaigns_touch before update on lv_private.campaigns for each row execute function lv_private.touch_campaign();

-- A participation row can only join a campaign and member of the SAME Hub.
create function lv_private.check_participation() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from lv_private.campaigns c where c.id = new.campaign_id and c.hub_id = new.hub_id) then
    raise exception 'lv_hub_mismatch: participation must belong to the campaign''s Hub' using errcode = '23503';
  end if;
  return new;
end;
$$;
create trigger campaign_participation_hub before insert on lv_private.campaign_participation
  for each row execute function lv_private.check_participation();

-- ---------------------------------------------------------------------------------------------------------
-- Entitlements (single source of the confirmed limits)
-- ---------------------------------------------------------------------------------------------------------
create function lv_private.plan_limit(p_plan text, p_name text) returns int
language sql immutable set search_path = ''
as $$
  select case p_plan
    when 'starter' then case p_name when 'roles' then 3 when 'pages' then 3 when 'active_total' then 15 when 'active_survey' then 2 end
    when 'team' then case p_name when 'roles' then 6 when 'active_survey' then 5 end   -- Team pages/active_total: undecided = NULL
  end
$$;

create function lv_private.entitlement_summary(p_hub uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with g as (
    select * from lv_private.entitlement_grants x
    where x.hub_id = p_hub and x.valid_from <= now() and (x.valid_to is null or x.valid_to > now())
  )
  select jsonb_build_object(
    'has_grant', exists (select 1 from g),
    'plan_code', (select case when bool_or(g.plan_code = 'team') then 'team' when bool_or(g.plan_code = 'starter') then 'starter' else min(g.plan_code) end from g),
    'grants', coalesce((select jsonb_agg(jsonb_build_object('source', g.source, 'plan_code', g.plan_code, 'valid_from', g.valid_from, 'valid_to', g.valid_to) order by g.valid_from, g.id) from g), '[]'::jsonb),
    'roles', (select max(lv_private.plan_limit(g.plan_code, 'roles')) from g),
    'pages', (select max(lv_private.plan_limit(g.plan_code, 'pages')) from g),
    'active_total', (select max(lv_private.plan_limit(g.plan_code, 'active_total')) from g),
    'active_survey', (select max(lv_private.plan_limit(g.plan_code, 'active_survey')) from g))
$$;

-- Replace the migration-2 slot state so roles use the same single source of limits.
create or replace function lv_private.role_slot_state(p_hub uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'used', (select count(*) from lv_private.roles r where r.hub_id = p_hub),
    'limit', lv_private.entitlement_summary(p_hub)->'roles',
    'has_grant', (lv_private.entitlement_summary(p_hub)->>'has_grant')::boolean)
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Policy readers: return the validated value, or NULL (= undecided)
-- ---------------------------------------------------------------------------------------------------------
create function lv_private.policy_ok(p_key text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  select p.value into v from lv_private.policy p where p.key = p_key;
  if v is null then return null; end if;
  if p_key = 'quota.consuming_states' then
    if jsonb_typeof(v) = 'array' and jsonb_array_length(v) > 0
       and not exists (select 1 from jsonb_array_elements_text(v) s where s not in ('active', 'scheduled')) then return v; end if;
  elsif p_key = 'gate.measurement' then
    if jsonb_typeof(v) = 'object' and (v->>'window_days') ~ '^[1-9][0-9]*$' then return v; end if;
  elsif p_key = 'gate.eligible_population' then
    if jsonb_typeof(v) = 'object' and jsonb_typeof(v->'sources') = 'array' and jsonb_array_length(v->'sources') > 0
       and not exists (select 1 from jsonb_array_elements_text(v->'sources') s where s not in ('v2', 'legacy_backfill', 'legacy_signup', 'legacy_repair')) then return v; end if;
  elsif p_key = 'gate.applies_to' then
    if jsonb_typeof(v) = 'object' and (v->>'min_other_active_surveys') ~ '^[0-9]+$' then return v; end if;
  elsif p_key = 'gate.bootstrap' then
    if jsonb_typeof(v) = 'object' and (v->>'zero_members') in ('met', 'unmet') then return v; end if;
  end if;
  return null;
end;
$$;

create function lv_private.campaign_effective_state(p_state text, p_closes_at timestamptz) returns text
language sql stable set search_path = ''
as $$ select case when p_state in ('active', 'scheduled') and p_closes_at is not null and p_closes_at <= now() then 'expired' else p_state end $$;

-- Campaigns shown as active (display and "used"). Enforcement uses consumed_count() and the policy.
create function lv_private.active_count(p_hub uuid, p_mode text default null) returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from lv_private.campaigns c
  where c.hub_id = p_hub and (p_mode is null or c.mode = p_mode) and c.state = 'active' and (c.closes_at is null or c.closes_at > now())
$$;

-- Campaigns that hold a slot under the (undecided) policy; NULL when the policy is not decided.
create function lv_private.consumed_count(p_hub uuid, p_mode text, p_exclude uuid) returns int
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_states jsonb := lv_private.policy_ok('quota.consuming_states');
begin
  if v_states is null then return null; end if;
  return (select count(*)::int from lv_private.campaigns c
          where c.hub_id = p_hub and (p_mode is null or c.mode = p_mode) and (p_exclude is null or c.id <> p_exclude)
            and (c.closes_at is null or c.closes_at > now())
            and c.state in (select jsonb_array_elements_text(v_states)));
end;
$$;

-- Gate evaluation. Returns {missing:[...]} when ANY required policy is undecided (fail closed); otherwise
-- {applies, met, numerator, denominator, plan, window_days}. Exact bigint arithmetic, no rounding:
--   Starter: met iff 2*R > M      Team: met iff 5*R >= M      M = 0: the bootstrap policy decides.
-- R = distinct eligible accepted members who participated in any Campaign of the Hub inside the window; guests
-- (no account) and repeat submissions cannot add to R. M = eligible accepted members.
create function lv_private.gate_evaluate(p_hub uuid, p_exclude uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_missing text[] := '{}';
  v_meas jsonb := lv_private.policy_ok('gate.measurement');
  v_pop jsonb := lv_private.policy_ok('gate.eligible_population');
  v_app jsonb := lv_private.policy_ok('gate.applies_to');
  v_ent jsonb := lv_private.entitlement_summary(p_hub);
  v_plan text := v_ent->>'plan_code';
  v_sources text[];
  m bigint; r bigint; v_others int; v_boot jsonb; v_applies boolean; v_met boolean;
begin
  if v_meas is null then v_missing := v_missing || 'gate.measurement'::text; end if;
  if v_pop is null then v_missing := v_missing || 'gate.eligible_population'::text; end if;
  if v_app is null then v_missing := v_missing || 'gate.applies_to'::text; end if;
  if lv_private.policy_ok('quota.consuming_states') is null then v_missing := v_missing || 'quota.consuming_states'::text; end if;
  if v_plan is null or v_plan not in ('starter', 'team') then v_missing := v_missing || 'gate.rule_for_plan'::text; end if;
  if cardinality(v_missing) > 0 then return jsonb_build_object('missing', to_jsonb(v_missing)); end if;

  select array_agg(s) into v_sources from jsonb_array_elements_text(v_pop->'sources') s;
  select count(*) into m from lv_private.hub_memberships hm where hm.hub_id = p_hub and hm.status = 'accepted' and hm.source = any (v_sources);
  select count(distinct cp.account_id) into r
  from lv_private.campaign_participation cp
  join lv_private.hub_memberships hm on hm.hub_id = cp.hub_id and hm.account_id = cp.account_id and hm.status = 'accepted' and hm.source = any (v_sources)
  where cp.hub_id = p_hub and cp.account_id is not null
    and cp.created_at >= now() - make_interval(days => (v_meas->>'window_days')::int);

  if m = 0 then
    v_boot := lv_private.policy_ok('gate.bootstrap');
    if v_boot is null then return jsonb_build_object('missing', jsonb_build_array('gate.bootstrap')); end if;
    v_met := (v_boot->>'zero_members') = 'met';
  elsif v_plan = 'starter' then
    v_met := 2 * r > m;
  else
    v_met := 5 * r >= m;
  end if;

  v_others := lv_private.consumed_count(p_hub, 'survey', p_exclude);
  v_applies := v_others >= (v_app->>'min_other_active_surveys')::int;
  return jsonb_build_object('applies', v_applies, 'met', v_met, 'numerator', r, 'denominator', m, 'plan', v_plan,
    'window_days', (v_meas->>'window_days')::int, 'others', v_others);
end;
$$;

-- Every reason a Campaign cannot be activated right now, in priority order. Activation fails with the first one;
-- lv_campaign_activation_status shows them all. One function, so preview and enforcement cannot disagree.
create function lv_private.activation_checks(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c record; out jsonb := '[]'::jsonb; v_eff text; v_ent jsonb; v_total int; v_survey int; v_used_total int; v_used_survey int; g jsonb;
  v_undec text[] := '{}';
begin
  select * into c from lv_private.campaigns x where x.id = p_campaign;
  if not found then return jsonb_build_array(jsonb_build_object('code', 'lv_not_found', 'message', 'Not found.')); end if;
  v_eff := lv_private.campaign_effective_state(c.state, c.closes_at);

  if v_eff = 'active' then
    out := out || jsonb_build_object('code', 'lv_lifecycle_invalid', 'message', 'This Campaign is already active.', 'details', jsonb_build_object('reason', 'already_active', 'state', c.state));
  elsif v_eff = 'expired' then
    out := out || jsonb_build_object('code', 'lv_lifecycle_invalid', 'message', 'This Campaign has expired.', 'details', jsonb_build_object('reason', 'expired', 'state', 'expired'));
  elsif c.closes_at is not null and c.closes_at <= now() then
    out := out || jsonb_build_object('code', 'lv_lifecycle_invalid', 'message', 'Its closing time has passed.', 'details', jsonb_build_object('reason', 'closes_at_passed', 'state', c.state));
  elsif c.state in ('draft', 'scheduled') and not exists (select 1 from lv_private.campaign_questions q where q.campaign_id = c.id) then
    out := out || jsonb_build_object('code', 'lv_lifecycle_invalid', 'message', 'Add at least one question first.', 'details', jsonb_build_object('reason', 'no_questions', 'state', c.state));
  end if;

  if c.mode <> 'survey' then
    out := out || jsonb_build_object('code', 'lv_policy_undecided', 'message', 'That Campaign mode is not available yet.', 'details', jsonb_build_object('reason', 'mode_not_available', 'decision', 'D-08'));
    return out;
  end if;

  v_ent := lv_private.entitlement_summary(c.hub_id);
  if not (v_ent->>'has_grant')::boolean then
    return out || jsonb_build_object('code', 'lv_entitlement_missing', 'message', 'This Hub has no plan that includes Campaigns.');
  end if;

  v_total := (v_ent->>'active_total')::int;
  v_survey := (v_ent->>'active_survey')::int;
  if v_total is null then v_undec := v_undec || 'active_total'::text; end if;
  if v_survey is null then v_undec := v_undec || 'active_survey'::text; end if;
  if cardinality(v_undec) > 0 then
    out := out || jsonb_build_object('code', 'lv_policy_undecided', 'message', 'The Campaign allowance for this plan is not set yet.',
      'details', jsonb_build_object('reason', 'limit_undecided', 'limits', to_jsonb(v_undec)));
  end if;

  v_used_total := lv_private.consumed_count(c.hub_id, null, c.id);
  if v_used_total is null then
    out := out || jsonb_build_object('code', 'lv_policy_undecided', 'message', 'Which Campaigns use a slot is not decided yet.',
      'details', jsonb_build_object('reason', 'policy_pending', 'missing', jsonb_build_array('quota.consuming_states')));
  else
    v_used_survey := lv_private.consumed_count(c.hub_id, 'survey', c.id);
    if v_total is not null and v_used_total >= v_total then
      out := out || jsonb_build_object('code', 'lv_quota_exceeded', 'message', 'All active Campaign slots are in use.',
        'details', jsonb_build_object('limit_name', 'active_total', 'limit', v_total, 'used', v_used_total));
    end if;
    if v_survey is not null and v_used_survey >= v_survey then
      out := out || jsonb_build_object('code', 'lv_quota_exceeded', 'message', 'All active survey slots are in use.',
        'details', jsonb_build_object('limit_name', 'active_survey', 'limit', v_survey, 'used', v_used_survey));
    end if;

    g := lv_private.gate_evaluate(c.hub_id, c.id);
    if g ? 'missing' then
      out := out || jsonb_build_object('code', 'lv_policy_undecided', 'message', 'The participation requirement is not decided yet.',
        'details', jsonb_build_object('reason', 'policy_pending', 'missing', g->'missing'));
    elsif (g->>'applies')::boolean and not (g->>'met')::boolean then
      out := out || jsonb_build_object('code', 'lv_gate_unmet', 'message', 'Participation requirement not met.',
        'details', jsonb_build_object('numerator', g->'numerator', 'denominator', g->'denominator', 'plan', g->'plan'));
    end if;
  end if;
  return out;
end;
$$;

-- The single enforcement path for manual activation, reopening and scheduled activation.
create function lv_private.activate_campaign(p_campaign uuid, p_actor uuid, p_key uuid, p_via text) returns jsonb
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

create function lv_private.campaign_json(p_campaign uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'hub_id', c.hub_id, 'mode', c.mode,
    'state', lv_private.campaign_effective_state(c.state, c.closes_at),
    'title', c.title, 'anonymous', c.anonymous, 'guest_access', c.guest_access,
    'opens_at', c.opens_at, 'closes_at', c.closes_at, 'activated_at', c.activated_at,
    'expires_at', c.closes_at, 'legacy_session_id', c.legacy_session_id, 'join_code', c.join_code)
  from lv_private.campaigns c where c.id = p_campaign
$$;

create function lv_private.new_join_code() returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text; v_i int;
begin
  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from lv_private.campaigns c where c.join_code = v_code);
  end loop;
  return v_code;
end;
$$;

create function lv_private.any_capability(p_hub uuid, p_account uuid, p_caps text[]) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from unnest(p_caps) c where lv_private.has_capability(p_hub, p_account, c)) $$;

-- ---------------------------------------------------------------------------------------------------------
-- Operator jobs (not exposed; scheduling them is an ops decision outside this migration)
-- ---------------------------------------------------------------------------------------------------------

-- Persist expiry for Campaigns whose closing time has passed. Reads already treat them as expired.
create function lv_private.expire_due_campaigns() returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare n int;
begin
  update lv_private.campaigns c set state = 'expired'
  where c.state in ('active', 'scheduled') and c.closes_at is not null and c.closes_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Activate scheduled Campaigns that are due, through the SAME path as a manual activation. The person who
-- scheduled it must still be an accepted member holding the capability; entitlement, quota, gate and lifecycle
-- are re-checked at activation time. A failure leaves the Campaign scheduled with last_activation_error set.
create function lv_private.run_scheduled_activations(p_limit int default 100) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c record; v_res jsonb; v_activated int := 0; v_blocked int := 0; v_details jsonb := '[]'::jsonb;
begin
  perform lv_private.expire_due_campaigns();
  for c in
    select x.id, x.hub_id, x.scheduled_by from lv_private.campaigns x
    where x.state = 'scheduled' and x.opens_at is not null and x.opens_at <= now()
    order by x.opens_at, x.id limit p_limit
  loop
    begin
      if c.scheduled_by is null or not lv_private.has_capability(c.hub_id, c.scheduled_by, 'community.campaign.activate') then
        update lv_private.campaigns x set last_activation_error = 'scheduler_lost_permission', last_activation_attempt_at = now() where x.id = c.id;
        v_blocked := v_blocked + 1;
        v_details := v_details || jsonb_build_object('campaign_id', c.id, 'result', 'scheduler_lost_permission');
        continue;
      end if;
      v_res := lv_private.activate_campaign(c.id, c.scheduled_by, gen_random_uuid(), 'scheduled');
      if (v_res->>'ok')::boolean then
        v_activated := v_activated + 1;
        v_details := v_details || jsonb_build_object('campaign_id', c.id, 'result', 'activated');
      else
        v_blocked := v_blocked + 1;
        v_details := v_details || jsonb_build_object('campaign_id', c.id, 'result', v_res->'error'->>'code');
      end if;
    exception when others then
      v_blocked := v_blocked + 1;
      v_details := v_details || jsonb_build_object('campaign_id', c.id, 'result', 'error', 'sqlstate', sqlstate);
    end;
  end loop;
  return jsonb_build_object('activated', v_activated, 'blocked', v_blocked, 'details', v_details);
end;
$$;

revoke all on all functions in schema lv_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------------------------------------

create function public.lv_entitlements(hub_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_caller uuid; v_ent jsonb; v_undec text[] := '{}'; v_name text;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null then return lv_private.fail('lv_invalid_input', 'hub_id is required.'); end if;
  if not exists (select 1 from lv_private.hubs h where h.id = lv_entitlements.hub_id) then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.any_capability(hub_id, v_caller, array['admin.billing.view', 'admin.roles.manage', 'community.campaign.draft', 'community.campaign.activate']) then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  v_ent := lv_private.entitlement_summary(hub_id);
  if (v_ent->>'has_grant')::boolean then
    foreach v_name in array array['roles', 'pages', 'active_total', 'active_survey'] loop
      if v_ent->v_name = 'null'::jsonb then v_undec := v_undec || v_name; end if;
    end loop;
  end if;
  return lv_private.ok(jsonb_build_object(
    'hub_id', hub_id, 'plan_code', v_ent->'plan_code', 'grants', v_ent->'grants',
    'limits', jsonb_build_object(
      'roles', jsonb_build_object('used', (select count(*) from lv_private.roles r where r.hub_id = lv_entitlements.hub_id), 'limit', v_ent->'roles'),
      'pages', jsonb_build_object('used', 0, 'limit', v_ent->'pages'),
      'active_total', jsonb_build_object('used', lv_private.active_count(hub_id), 'limit', v_ent->'active_total'),
      'active_survey', jsonb_build_object('used', lv_private.active_count(hub_id, 'survey'), 'limit', v_ent->'active_survey')),
    'undecided', to_jsonb(v_undec)));
end;
$$;

create function public.lv_gate_status(hub_id uuid, mode text default 'survey') returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_caller uuid; g jsonb; v_policy text;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null then return lv_private.fail('lv_invalid_input', 'hub_id is required.'); end if;
  if not exists (select 1 from lv_private.hubs h where h.id = lv_gate_status.hub_id) then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(hub_id, v_caller, 'community.campaign.activate') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  if coalesce(mode, 'survey') <> 'survey' then
    return lv_private.fail('lv_policy_undecided', 'That Campaign mode is not available yet.', jsonb_build_object('reason', 'mode_not_available', 'decision', 'D-08'));
  end if;
  if not (lv_private.entitlement_summary(hub_id)->>'has_grant')::boolean then
    return lv_private.fail('lv_entitlement_missing', 'This Hub has no plan that includes Campaigns.');
  end if;
  g := lv_private.gate_evaluate(hub_id, null);
  if g ? 'missing' then
    return lv_private.fail('lv_policy_undecided', 'The participation requirement is not decided yet.',
      jsonb_build_object('reason', 'policy_pending', 'missing', g->'missing'));
  end if;
  v_policy := 'provisional-' || left(md5((select string_agg(p.key || '=' || coalesce(p.value::text, 'null'), ';' order by p.key) from lv_private.policy p where p.key like 'gate.%' or p.key like 'quota.%')), 8);
  return lv_private.ok(jsonb_build_object(
    'scope', format('Unique eligible accepted members who took part in any Campaign of this Hub in the last %s days, out of eligible accepted members (illustrative policy, not approved)', g->>'window_days'),
    'numerator', (g->>'numerator')::bigint,
    'denominator', (g->>'denominator')::bigint,
    'met', case when (g->>'applies')::boolean then (g->>'met')::boolean else true end,
    'next_action', case
      when not (g->>'applies')::boolean then 'No participation requirement applies to the next survey.'
      when (g->>'met')::boolean then 'Participation requirement met. Quotas and entitlement are still checked at activation.'
      else 'More unique eligible members need to participate.' end,
    'policy_version', v_policy));
end;
$$;

create function public.lv_campaign_create(hub_id uuid, mode text, title text, anonymous boolean default false,
  guest_access text default 'off', opens_at timestamptz default null, closes_at timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_id uuid; v_title text := btrim(title);
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null then return lv_private.fail('lv_invalid_input', 'hub_id is required.'); end if;
  if not exists (select 1 from lv_private.hubs h where h.id = lv_campaign_create.hub_id) then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(hub_id, v_caller, 'community.campaign.draft') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  if v_title is null or length(v_title) < 1 or length(v_title) > 120 or mode is null
     or mode not in ('survey', 'poll', 'rating', 'feedback', 'election', 'seasonal')
     or coalesce(guest_access, 'off') not in ('off', 'link')
     or (opens_at is not null and closes_at is not null and closes_at <= opens_at) then
    return lv_private.fail('lv_invalid_input', 'Check the Campaign details.');
  end if;
  if mode <> 'survey' then
    return lv_private.fail('lv_policy_undecided', 'That Campaign mode is not available yet.', jsonb_build_object('reason', 'mode_not_available', 'decision', 'D-08'));
  end if;
  if coalesce(guest_access, 'off') = 'link' then
    return lv_private.fail('lv_policy_undecided', 'Guest access is not available yet.', jsonb_build_object('reason', 'guest_access_not_available', 'decision', 'D-03'));
  end if;
  insert into lv_private.campaigns (hub_id, mode, title, anonymous, guest_access, opens_at, closes_at, join_code, created_by)
  values (hub_id, mode, v_title, coalesce(anonymous, false), 'off', opens_at, closes_at, lv_private.new_join_code(), v_caller)
  returning id into v_id;
  return lv_private.ok(lv_private.campaign_json(v_id));
end;
$$;

create function public.lv_campaign_list(hub_id uuid, state text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_caller uuid;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null then return lv_private.fail('lv_invalid_input', 'hub_id is required.'); end if;
  if state is not null and state not in ('draft', 'scheduled', 'active', 'closed', 'expired') then return lv_private.fail('lv_invalid_input', 'Unknown state.'); end if;
  if not exists (select 1 from lv_private.hubs h where h.id = lv_campaign_list.hub_id) then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.any_capability(hub_id, v_caller, array['community.campaign.draft', 'community.campaign.activate', 'community.campaign.close']) then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  return lv_private.ok(jsonb_build_object('hub_id', hub_id, 'campaigns', coalesce((
    select jsonb_agg(lv_private.campaign_json(c.id) order by c.created_at, c.id)
    from lv_private.campaigns c
    where c.hub_id = lv_campaign_list.hub_id
      and (lv_campaign_list.state is null or lv_private.campaign_effective_state(c.state, c.closes_at) = lv_campaign_list.state)), '[]'::jsonb)));
end;
$$;

create function public.lv_campaign_get(campaign_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hub uuid; v_caller uuid;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  select c.hub_id into v_hub from lv_private.campaigns c where c.id = lv_campaign_get.campaign_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.any_capability(v_hub, v_caller, array['community.campaign.draft', 'community.campaign.activate', 'community.campaign.close']) then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  return lv_private.ok(lv_private.campaign_json(campaign_id));
end;
$$;

create function public.lv_campaign_update(campaign_id uuid, title text default null, anonymous boolean default null, questions jsonb default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hub uuid; v_caller uuid; v_state text; v_title text := btrim(title); q jsonb; v_pos int := 0; v_type text; v_opts jsonb;
  v_min int; v_max int;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  select c.hub_id into v_hub from lv_private.campaigns c where c.id = lv_campaign_update.campaign_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(v_hub, v_caller, 'community.campaign.draft') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_campaign:' || campaign_id::text, 0));
  select c.state into v_state from lv_private.campaigns c where c.id = lv_campaign_update.campaign_id;
  if v_state <> 'draft' then
    return lv_private.fail('lv_lifecycle_invalid', 'Only a draft can be edited.', jsonb_build_object('reason', 'not_a_draft', 'state', v_state));
  end if;
  if (title is not null and (length(v_title) < 1 or length(v_title) > 120)) or (questions is not null and jsonb_typeof(questions) <> 'array') then
    return lv_private.fail('lv_invalid_input', 'Check the Campaign details.');
  end if;
  if questions is not null then
    if jsonb_array_length(questions) > 100 then return lv_private.fail('lv_invalid_input', 'Too many questions.'); end if;
    for q in select * from jsonb_array_elements(questions) loop
      if jsonb_typeof(q) <> 'object'
         or (q ? 'scale_min' and (q->>'scale_min') !~ '^-?[0-9]{1,6}$') or (q ? 'scale_max' and (q->>'scale_max') !~ '^-?[0-9]{1,6}$')
         or (q ? 'required' and jsonb_typeof(q->'required') <> 'boolean') then
        return lv_private.fail('lv_invalid_input', 'Check question ' || (v_pos + 1) || '.', jsonb_build_object('question', v_pos + 1));
      end if;
      v_type := q->>'type';
      v_opts := coalesce(q->'options', '[]'::jsonb);
      v_min := coalesce((q->>'scale_min')::int, 1);
      v_max := coalesce((q->>'scale_max')::int, 5);
      if v_type is null or v_type not in ('rating', 'text', 'single_choice', 'multi_choice', 'yes_no', 'flame', 'slider', 'nps', 'ranking')
         or coalesce(length(btrim(q->>'prompt')), 0) < 1 or length(q->>'prompt') > 500
         or jsonb_typeof(v_opts) <> 'array' or jsonb_array_length(v_opts) > 20
         or (v_type in ('single_choice', 'multi_choice', 'ranking') and jsonb_array_length(v_opts) < 2)
         or (v_type in ('rating', 'slider', 'flame', 'nps') and v_min >= v_max) then
        return lv_private.fail('lv_invalid_input', 'Check question ' || (v_pos + 1) || '.', jsonb_build_object('question', v_pos + 1));
      end if;
      v_pos := v_pos + 1;
    end loop;
    delete from lv_private.campaign_questions cq where cq.campaign_id = lv_campaign_update.campaign_id;
    v_pos := 0;
    for q in select * from jsonb_array_elements(questions) loop
      v_pos := v_pos + 1;
      insert into lv_private.campaign_questions (campaign_id, position, type, prompt, help_text, required, options, scale_min, scale_max)
      values (campaign_id, v_pos, q->>'type', btrim(q->>'prompt'), nullif(q->>'help_text', ''), coalesce((q->>'required')::boolean, false),
              coalesce(q->'options', '[]'::jsonb), coalesce((q->>'scale_min')::int, 1), coalesce((q->>'scale_max')::int, 5));
    end loop;
  end if;
  update lv_private.campaigns c set
    title = coalesce(v_title, c.title),
    anonymous = coalesce(lv_campaign_update.anonymous, c.anonymous),
    question_revision = c.question_revision + case when lv_campaign_update.questions is not null then 1 else 0 end
  where c.id = lv_campaign_update.campaign_id;
  return lv_private.ok(lv_private.campaign_json(campaign_id));
end;
$$;

create function public.lv_campaign_questions(campaign_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hub uuid; v_caller uuid; v_state text; v_rev int; v_editor boolean;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  select c.hub_id, lv_private.campaign_effective_state(c.state, c.closes_at), c.question_revision into v_hub, v_state, v_rev
  from lv_private.campaigns c where c.id = lv_campaign_questions.campaign_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  v_editor := lv_private.has_capability(v_hub, v_caller, 'community.campaign.draft');
  if not v_editor then
    if lv_private.membership_status(v_hub, v_caller) is distinct from 'accepted' then
      return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
    end if;
    if v_state <> 'active' then
      return lv_private.fail('lv_lifecycle_invalid', 'This Campaign is not open.', jsonb_build_object('state', v_state));
    end if;
  end if;
  return lv_private.ok(jsonb_build_object('campaign_id', campaign_id, 'revision', v_rev, 'questions', coalesce((
    select jsonb_agg(jsonb_build_object('id', q.id, 'position', q.position, 'type', q.type, 'prompt', q.prompt, 'help_text', q.help_text,
      'required', q.required, 'options', q.options, 'scale_min', q.scale_min, 'scale_max', q.scale_max) order by q.position)
    from lv_private.campaign_questions q where q.campaign_id = lv_campaign_questions.campaign_id), '[]'::jsonb)));
end;
$$;

create function public.lv_campaign_schedule(campaign_id uuid, opens_at timestamptz, closes_at timestamptz default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hub uuid; v_caller uuid; v_state text;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  select c.hub_id into v_hub from lv_private.campaigns c where c.id = lv_campaign_schedule.campaign_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(v_hub, v_caller, 'community.campaign.activate') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  if opens_at is null or (closes_at is not null and closes_at <= opens_at) then
    return lv_private.fail('lv_invalid_input', 'Check the opening and closing times.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_campaign:' || campaign_id::text, 0));
  select c.state into v_state from lv_private.campaigns c where c.id = lv_campaign_schedule.campaign_id for update;
  if v_state not in ('draft', 'scheduled') then
    return lv_private.fail('lv_lifecycle_invalid', 'Only a draft or scheduled Campaign can be scheduled.', jsonb_build_object('state', v_state));
  end if;
  if closes_at is not null and closes_at <= now() then
    return lv_private.fail('lv_invalid_input', 'The closing time is in the past.');
  end if;
  update lv_private.campaigns c set state = 'scheduled', opens_at = lv_campaign_schedule.opens_at, closes_at = lv_campaign_schedule.closes_at, scheduled_by = v_caller
  where c.id = lv_campaign_schedule.campaign_id;
  return lv_private.ok(lv_private.campaign_json(campaign_id));
end;
$$;

create function public.lv_campaign_activate(campaign_id uuid, idempotency_key uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hub uuid; v_caller uuid;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if campaign_id is null or idempotency_key is null then return lv_private.fail('lv_invalid_input', 'Check the request.'); end if;
  select c.hub_id into v_hub from lv_private.campaigns c where c.id = lv_campaign_activate.campaign_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(v_hub, v_caller, 'community.campaign.activate') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  return lv_private.activate_campaign(campaign_id, v_caller, idempotency_key, 'manual');
end;
$$;

create function public.lv_campaign_close(campaign_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hub uuid; v_caller uuid; v_state text;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  select c.hub_id into v_hub from lv_private.campaigns c where c.id = lv_campaign_close.campaign_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(v_hub, v_caller, 'community.campaign.close') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  perform 1 from lv_private.hubs h where h.id = v_hub for update;
  select c.state into v_state from lv_private.campaigns c where c.id = lv_campaign_close.campaign_id for update;
  if v_state in ('closed', 'expired') then
    return lv_private.ok(lv_private.campaign_json(campaign_id));
  end if;
  if v_state <> 'active' then
    return lv_private.fail('lv_lifecycle_invalid', 'Only an active Campaign can be closed.', jsonb_build_object('state', v_state));
  end if;
  -- Responses are never touched: closing only changes the state.
  update lv_private.campaigns c set state = 'closed', closed_at = now() where c.id = lv_campaign_close.campaign_id;
  return lv_private.ok(lv_private.campaign_json(campaign_id));
end;
$$;

-- Server-derived activation, quota and gate state for the UI. Read-only; uses the same checks as activation.
create function public.lv_campaign_activation_status(campaign_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_hub uuid; v_caller uuid; v_blockers jsonb; v_ent jsonb; v_eff text; g jsonb;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  select c.hub_id into v_hub from lv_private.campaigns c where c.id = lv_campaign_activation_status.campaign_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(v_hub, v_caller, 'community.campaign.activate') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  v_blockers := lv_private.activation_checks(campaign_id);
  v_ent := lv_private.entitlement_summary(v_hub);
  select lv_private.campaign_effective_state(c.state, c.closes_at) into v_eff from lv_private.campaigns c where c.id = lv_campaign_activation_status.campaign_id;
  g := case when (v_ent->>'has_grant')::boolean then lv_private.gate_evaluate(v_hub, campaign_id) else null end;
  return lv_private.ok(jsonb_build_object(
    'campaign_id', campaign_id, 'state', v_eff,
    'can_activate', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'quota', jsonb_build_object(
      'active_total', jsonb_build_object('used', lv_private.active_count(v_hub), 'limit', v_ent->'active_total'),
      'active_survey', jsonb_build_object('used', lv_private.active_count(v_hub, 'survey'), 'limit', v_ent->'active_survey')),
    'gate', case
      when g is null then null
      when g ? 'missing' then jsonb_build_object('applies', null, 'met', null, 'numerator', null, 'denominator', null, 'missing', g->'missing')
      else jsonb_build_object('applies', (g->>'applies')::boolean, 'met', (g->>'met')::boolean, 'numerator', (g->>'numerator')::bigint,
                              'denominator', (g->>'denominator')::bigint, 'missing', '[]'::jsonb) end));
end;
$$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'lv_entitlements', 'lv_gate_status', 'lv_campaign_create', 'lv_campaign_list', 'lv_campaign_get', 'lv_campaign_update',
      'lv_campaign_questions', 'lv_campaign_schedule', 'lv_campaign_activate', 'lv_campaign_close', 'lv_campaign_activation_status')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
  end loop;
end;
$$;
