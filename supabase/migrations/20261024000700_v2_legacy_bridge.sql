-- LunchVoice v2 foundation 7/N: MJCC legacy bridge (mapping, reconciliation, rehearsal). The Hub keeps the name LionCafe.
--
-- DEPENDS ON migrations 1-6. NOT APPLIED TO PRODUCTION. Operator-run only: nothing here is callable through the API except that
-- archived records appear in existing read operations. It writes NOTHING to any legacy table and removes nothing from them.
--
-- What it does: maps each HISTORICAL legacy survey session (session + template questions + responses + answers + points awarded)
-- onto an archived, closed v2 Campaign with the original ids, join code, times, answers and receipts, so history is preserved
-- and queryable. It deliberately does NOT: turn live sessions or menu-rating sessions into Campaigns; activate anything; use a
-- quota slot; count toward the participation gate; invent anonymity, audience, schedule or revision settings (legacy responses keep
-- the respondent id, so the archived Campaign is identified, guest access is off, times are copied as they are, the question set is
-- revision 1 exactly as it stands in the legacy template); publish results (analytics for these records is policy-pending); or
-- guess about ambiguous records (they are listed with a reason, in lv_private.legacy_bridge_issues and the reconciliation report).
-- Legacy RPCs, login and surveys keep working unchanged; responses that arrive later are picked up by the next sync.
--
-- Requires the Hub to exist (the explicit-Owner backfill from migration 1). Production use needs the verified real Owner mapping
-- and a separate authorization: this migration neither supplies nor infers an Owner.

alter table lv_private.campaigns add column legacy_historical boolean not null default false;
create unique index campaigns_legacy_session_idx on lv_private.campaigns (legacy_session_id) where legacy_session_id is not null;

create table lv_private.legacy_session_map (
  session_id uuid primary key,
  org_id uuid not null,
  status text not null check (status in ('mapped', 'ambiguous', 'live_not_mapped', 'menu_session_not_mapped')),
  reason text,
  campaign_id uuid unique references lv_private.campaigns (id) on delete restrict,
  evaluated_at timestamptz not null default now()
);
create table lv_private.legacy_question_map (
  legacy_question_id uuid not null,
  campaign_id uuid not null references lv_private.campaigns (id) on delete restrict,
  question_id uuid not null references lv_private.campaign_questions (id) on delete restrict,
  primary key (legacy_question_id, campaign_id)
);
create table lv_private.legacy_response_map (
  response_id uuid primary key,
  participation_id uuid not null unique references lv_private.campaign_participation (id) on delete restrict,
  answer_response_id uuid not null references lv_private.campaign_answers (response_id) on delete restrict
);
create table lv_private.legacy_answer_map (
  answer_id uuid primary key,
  answer_response_id uuid not null references lv_private.campaign_answers (response_id) on delete restrict,
  question_id uuid not null references lv_private.campaign_questions (id) on delete restrict
);
create table lv_private.legacy_bridge_issues (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  kind text not null,
  legacy_table text not null,
  legacy_id uuid not null,
  detail jsonb,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (kind, legacy_table, legacy_id)
);
alter table lv_private.legacy_session_map enable row level security;
alter table lv_private.legacy_question_map enable row level security;
alter table lv_private.legacy_response_map enable row level security;
alter table lv_private.legacy_answer_map enable row level security;
alter table lv_private.legacy_bridge_issues enable row level security;

-- Archived records are read-only history: they never activate, never count toward the gate, never publish analytics, and the
-- campaign shape returned to clients says so.
create or replace function lv_private.activation_checks(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  c record; out jsonb := '[]'::jsonb; v_eff text; v_ent jsonb; v_total int; v_survey int; v_used_total int; v_used_survey int; g jsonb;
  v_undec text[] := '{}';
begin
  select * into c from lv_private.campaigns x where x.id = p_campaign;
  if not found then return jsonb_build_array(jsonb_build_object('code', 'lv_not_found', 'message', 'Not found.')); end if;
  v_eff := lv_private.campaign_effective_state(c.state, c.closes_at);

  -- An archived record of a legacy session is history, never an activatable Campaign.
  if c.legacy_historical then
    return jsonb_build_array(jsonb_build_object('code', 'lv_lifecycle_invalid', 'message', 'This is an archived record of a legacy session.',
      'details', jsonb_build_object('reason', 'legacy_historical', 'state', c.state)));
  end if;

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

create or replace function lv_private.gate_evaluate(p_hub uuid, p_exclude uuid) returns jsonb
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
  join lv_private.campaigns cc on cc.id = cp.campaign_id and not cc.legacy_historical
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

create or replace function lv_private.campaign_json(p_campaign uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'hub_id', c.hub_id, 'mode', c.mode,
    'state', lv_private.campaign_effective_state(c.state, c.closes_at),
    'title', c.title, 'anonymous', c.anonymous, 'guest_access', c.guest_access,
    'opens_at', c.opens_at, 'closes_at', c.closes_at, 'activated_at', c.activated_at,
    'expires_at', c.closes_at, 'legacy_session_id', c.legacy_session_id, 'join_code', c.join_code, 'legacy_historical', c.legacy_historical)
  from lv_private.campaigns c where c.id = p_campaign
$$;

create or replace function lv_private.questions_frozen_after_draft() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  c record;
begin
  select x.state, x.activated_at, x.published_revision, x.legacy_historical into c from lv_private.campaigns x where x.id = coalesce(new.campaign_id, old.campaign_id);
  if (c.state is distinct from 'draft' or c.activated_at is not null or c.published_revision is not null) and not (tg_op = 'DELETE' and c.legacy_historical) then
    raise exception 'lv_published_immutable: questions cannot change once a Campaign is no longer a draft' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function lv_private.analytics_core(p_campaign uuid, p_caller uuid, p_metric text, p_question uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c record; q record; v_pol jsonb; v_sensitive boolean; v_state text; v_rel record;
  v_pm bigint; v_pg bigint; v_guests boolean;
  v_groups jsonb := '[]'::jsonb; v_aud text; v_cells jsonb; v_shown jsonb; v_pn bigint; v_cell jsonb; v_part jsonb := '{}'::jsonb;
  v_window_to timestamptz; v_partition boolean; v_k int; v_minp int; v_comp boolean; v_status text;
begin
  select * into c from lv_private.campaigns x where x.id = p_campaign;
  v_state := lv_private.campaign_effective_state(c.state, c.closes_at);
  -- Legacy history: respondents were never asked about anonymous publication and no policy evidence exists, so nothing is
  -- published until the founder decides (D-10/D-12).
  if c.legacy_historical then
    return lv_private.fail('lv_policy_undecided', 'Results for archived legacy sessions are not available until the privacy policy covers them.',
      jsonb_build_object('reason', 'legacy_record_policy_pending', 'decision', 'D-10'));
  end if;
  if c.state in ('draft', 'scheduled') then
    return lv_private.fail('lv_lifecycle_invalid', 'This Campaign has no results yet.', jsonb_build_object('reason', 'no_responses_yet', 'state', v_state));
  end if;

  if p_metric = 'answer_distribution' then
    select * into q from lv_private.campaign_questions cq where cq.id = p_question and cq.campaign_id = p_campaign;
    if not found then return lv_private.fail('lv_invalid_input', 'Choose a question of this Campaign.', jsonb_build_object('reason', 'unknown_question')); end if;
    if q.type in ('text', 'ranking') then
      return lv_private.fail('lv_policy_undecided', 'Results for that question type are not available yet.',
        jsonb_build_object('reason', 'question_type_not_available', 'type', q.type, 'decision', 'D-10'));
    end if;
  end if;

  select count(*) filter (where a.audience = 'member'), count(*) filter (where a.audience = 'guest')
    into v_pm, v_pg from lv_private.campaign_answers a where a.campaign_id = p_campaign;
  v_guests := v_pg > 0;
  v_sensitive := c.anonymous or v_guests;

  v_k := null; v_minp := null; v_comp := null;
  if v_sensitive then
    v_pol := lv_private.analytics_policy_state();
    if v_pol ? 'missing' then
      return lv_private.fail('lv_policy_undecided', 'Anonymous results are not available until the privacy policy is set.',
        jsonb_build_object('reason', 'policy_pending', 'missing', v_pol->'missing', 'decision', 'D-10'));
    end if;
    v_k := (v_pol->>'min_cohort')::int; v_minp := (v_pol->>'min_participants')::int; v_comp := (v_pol->>'complementary')::boolean;
    if v_state = 'active' then
      return lv_private.fail('lv_policy_undecided', 'Anonymous results are available only after the Campaign has finished.',
        jsonb_build_object('reason', 'live_anonymous_results_restricted', 'decision', 'D-10'));
    end if;
    -- One release per Campaign: the participant counts at first release are frozen.
    perform pg_advisory_xact_lock(hashtextextended('lv_release:' || p_campaign::text, 0));
    select * into v_rel from lv_private.analytics_releases r where r.campaign_id = p_campaign;
    if not found then
      insert into lv_private.analytics_releases (campaign_id, member_n, guest_n, released_by) values (p_campaign, v_pm, v_pg, p_caller);
    elsif v_rel.member_n <> v_pm or v_rel.guest_n <> v_pg then
      return lv_private.fail('lv_policy_undecided', 'These results can no longer be shown because responses changed after they were first released.',
        jsonb_build_object('reason', 'population_changed_after_release', 'decision', 'D-10'));
    end if;
  end if;
  v_status := case when v_sensitive then 'applied' else 'not_required' end;

  v_window_to := case v_state when 'closed' then c.closed_at when 'expired' then c.closes_at else clock_timestamp() end;

  -- Participants per audience.
  foreach v_aud in array array['member', 'guest'] loop
    v_pn := case v_aud when 'member' then v_pm else v_pg end;
    if v_sensitive and v_pn > 0 and v_pn < v_minp then
      v_part := v_part || jsonb_build_object(v_aud, jsonb_build_object('n', null, 'suppressed', true, 'reason', 'below_min_participants'));
    else
      v_part := v_part || jsonb_build_object(v_aud, jsonb_build_object('n', v_pn, 'suppressed', false, 'reason', null));
    end if;
  end loop;

  if p_metric in ('completion', 'answer_distribution') then
    foreach v_aud in array array['member', 'guest'] loop
      v_pn := case v_aud when 'member' then v_pm else v_pg end;
      continue when v_pn = 0;
      v_cells := '[]'::jsonb;
      v_partition := false;
      if p_metric = 'completion' then
        select coalesce(jsonb_agg(jsonb_build_object('key', cq.id::text, 'n', (
            select count(*) from lv_private.campaign_answer_values v join lv_private.campaign_answers a on a.response_id = v.response_id
            where v.question_id = cq.id and a.audience = v_aud)) order by cq.position), '[]'::jsonb)
          into v_cells from lv_private.campaign_questions cq where cq.campaign_id = p_campaign;
      else
        v_partition := q.type in ('single_choice', 'yes_no', 'rating', 'slider', 'flame', 'nps');
        if q.type in ('single_choice', 'multi_choice') then
          select coalesce(jsonb_agg(jsonb_build_object('key', o, 'n', (
              select count(*) from lv_private.campaign_answer_values v join lv_private.campaign_answers a on a.response_id = v.response_id
              where v.question_id = q.id and a.audience = v_aud
                and case when q.type = 'single_choice' then (v.value #>> '{}') = o else v.value ? o end)) order by o), '[]'::jsonb)
            into v_cells from jsonb_array_elements_text(q.options) o;
        elsif q.type = 'yes_no' then
          select jsonb_agg(jsonb_build_object('key', o, 'n', (
              select count(*) from lv_private.campaign_answer_values v join lv_private.campaign_answers a on a.response_id = v.response_id
              where v.question_id = q.id and a.audience = v_aud and (v.value #>> '{}') = o)) order by o)
            into v_cells from unnest(array['false', 'true']) o;
        else
          select jsonb_agg(jsonb_build_object('key', o::text, 'n', (
              select count(*) from lv_private.campaign_answer_values v join lv_private.campaign_answers a on a.response_id = v.response_id
              where v.question_id = q.id and a.audience = v_aud and (v.value #>> '{}')::int = o)) order by o)
            into v_cells from generate_series(q.scale_min, least(q.scale_max, q.scale_min + 100)) o;
        end if;
      end if;

      if v_sensitive and v_pn < v_minp then
        -- The whole audience is below the participant minimum: every cell is withheld.
        select coalesce(jsonb_agg(jsonb_build_object('key', x->>'key', 'n', null, 'suppressed', true, 'reason', 'below_min_participants')), '[]'::jsonb)
          into v_shown from jsonb_array_elements(v_cells) x;
      elsif v_sensitive then
        v_shown := lv_private.suppress_cells(v_cells, v_k, v_comp, v_partition);
      else
        select coalesce(jsonb_agg(jsonb_build_object('key', x->>'key', 'n', (x->>'n')::bigint, 'suppressed', false, 'reason', null)), '[]'::jsonb)
          into v_shown from jsonb_array_elements(v_cells) x;
      end if;

      for v_cell in select * from jsonb_array_elements(v_shown) loop
        v_groups := v_groups || jsonb_build_object('key', v_cell->>'key', 'audience', v_aud, 'n', v_cell->'n', 'suppressed', (v_cell->>'suppressed')::boolean,
          'reason', v_cell->'reason',
          'value', case when (v_cell->>'suppressed')::boolean or v_part->v_aud->'n' = 'null'::jsonb then null
                        else round((v_cell->>'n')::numeric / v_pn::numeric, 4) end);
      end loop;
    end loop;
  end if;

  return lv_private.ok(jsonb_build_object(
    'campaign_id', p_campaign, 'metric', p_metric, 'question_id', p_question,
    'population', 'Distinct accepted Hub members who submitted (member) and distinct guest grants that submitted (guest), counted separately and never added together. Responses are final answers only.',
    'window', jsonb_build_object('from', c.activated_at, 'to', v_window_to),
    'freshness_at', clock_timestamp(),
    'participants', v_part,
    'groups', v_groups,
    'policy', jsonb_build_object('status', v_status, 'min_cohort', v_k, 'complementary_suppression', v_comp)));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Classification (read-only). One row per legacy session of the organization.
-- ---------------------------------------------------------------------------------------------------------
create function lv_private.legacy_session_classes(p_org uuid) returns table (session_id uuid, status text, reason text)
language sql stable security definer set search_path = ''
as $$
with s as (select * from public.sessions where org_id = p_org),
q as (
  select qq.template_id, count(*) as n,
    bool_or(qq.type not in ('rating', 'text', 'single_choice', 'multi_choice', 'yes_no', 'flame', 'slider')) as bad_type,
    bool_or(jsonb_typeof(qq.options) is distinct from 'array') as bad_options,
    bool_or(qq.type in ('rating', 'slider', 'flame') and qq.scale_min >= qq.scale_max) as bad_scale,
    bool_or(length(btrim(qq.prompt)) not between 1 and 500) as bad_prompt
  from public.survey_questions qq group by qq.template_id),
codes as (select upper(btrim(s.join_code)) as code, count(*) as n from s group by 1)
select s.id as session_id, split_part(x.v, '|', 1) as status, split_part(x.v, '|', 2) as reason
from s
left join q on q.template_id = s.template_id
left join codes on codes.code = upper(btrim(s.join_code))
cross join lateral (select case
    when s.menu_cycle_id is not null then 'menu_session_not_mapped|menu_rating_session_stays_in_legacy_tables'
    when s.template_id is null then 'ambiguous|no_template'
    when not exists (select 1 from public.survey_templates t where t.id = s.template_id) then 'ambiguous|template_missing'
    when s.is_active and (s.closes_at is null or s.closes_at > now()) then 'live_not_mapped|session_is_still_live_in_the_legacy_app'
    when coalesce(q.n, 0) = 0 then 'ambiguous|no_questions'
    when q.bad_type then 'ambiguous|unknown_question_type'
    when q.bad_options then 'ambiguous|question_options_not_an_array'
    when q.bad_scale then 'ambiguous|question_scale_invalid'
    when q.bad_prompt then 'ambiguous|question_prompt_length'
    when length(btrim(s.title)) not between 1 and 120 then 'ambiguous|title_length'
    when s.opens_at is not null and s.closes_at is not null and s.closes_at <= s.opens_at then 'ambiguous|bad_time_window'
    when length(btrim(s.join_code)) = 0 then 'ambiguous|join_code_empty'
    when codes.n > 1 then 'ambiguous|join_code_collision_within_legacy'
    when exists (select 1 from lv_private.campaigns x where x.join_code = upper(btrim(s.join_code)) and x.legacy_session_id is distinct from s.id)
      then 'ambiguous|join_code_collision_with_existing_campaign'
    else 'mappable|'
  end as v) x
$$;

create function lv_private.legacy_session_classes_overlay(p_org uuid) returns table (session_id uuid, status text, reason text)
language sql stable security definer set search_path = ''
as $$
  select c.session_id, case when m.campaign_id is not null then 'mapped' else c.status end, case when m.campaign_id is not null then '' else c.reason end
  from lv_private.legacy_session_classes(p_org) c
  left join lv_private.legacy_session_map m on m.session_id = c.session_id and m.campaign_id is not null
$$;

-- READ-ONLY inventory: counts and the ambiguous list, before or after a sync. Identical query to supabase/bridge/legacy_inventory.sql
-- except that it also checks join-code collisions with existing Campaigns.
create function lv_private.legacy_inventory(p_org uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with cls as (select session_id, status, reason from lv_private.legacy_session_classes(p_org))
  select jsonb_build_object(
  'org_id', p_org,
  'sessions', jsonb_build_object(
     'total', (select count(*) from cls),
     'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) as n from cls group by 1) z), '{}'::jsonb),
     'ambiguous_by_reason', coalesce((select jsonb_object_agg(reason, n) from (select reason, count(*) as n from cls where status = 'ambiguous' group by 1) z), '{}'::jsonb),
     'ambiguous', coalesce((select jsonb_agg(jsonb_build_object('session_id', session_id, 'reason', reason) order by session_id) from cls where status = 'ambiguous'), '[]'::jsonb)),
  'responses', jsonb_build_object(
     'total', (select count(*) from public.responses r join public.sessions s on s.id = r.session_id where s.org_id = p_org),
     'in_mappable_sessions', (select count(*) from public.responses r join cls on cls.session_id = r.session_id and cls.status = 'mappable'),
     'in_live_sessions', (select count(*) from public.responses r join cls on cls.session_id = r.session_id and cls.status = 'live_not_mapped'),
     'in_menu_sessions', (select count(*) from public.responses r join cls on cls.session_id = r.session_id and cls.status = 'menu_session_not_mapped'),
     'in_ambiguous_sessions', (select count(*) from public.responses r join cls on cls.session_id = r.session_id and cls.status = 'ambiguous'),
     'in_mappable_sessions_without_a_profile_in_this_org', (select count(*) from public.responses r join cls on cls.session_id = r.session_id and cls.status = 'mappable'
         where not exists (select 1 from public.profiles p where p.id = r.student_id and p.org_id = p_org)),
     'with_free_text_not_copied', (select count(*) from public.responses r join cls on cls.session_id = r.session_id and cls.status = 'mappable' where nullif(btrim(coalesce(r.feedback, '') || coalesce(r.idea, '')), '') is not null)),
  'answers', jsonb_build_object(
     'in_mappable_sessions', (select count(*) from public.survey_answers a join public.responses r on r.id = a.response_id join cls on cls.session_id = r.session_id and cls.status = 'mappable'
         where a.value is not null and a.value <> 'null'::jsonb),
     'with_unexpected_value_type', (select count(*) from public.survey_answers a join public.responses r on r.id = a.response_id join cls on cls.session_id = r.session_id and cls.status = 'mappable'
         join public.survey_questions qq on qq.id = a.question_id
         where a.value is not null and a.value <> 'null'::jsonb and not (
           (qq.type in ('rating', 'slider', 'flame') and jsonb_typeof(a.value) = 'number')
           or (qq.type = 'yes_no' and jsonb_typeof(a.value) = 'boolean')
           or (qq.type in ('single_choice', 'text') and jsonb_typeof(a.value) = 'string')
           or (qq.type = 'multi_choice' and jsonb_typeof(a.value) = 'array'))),
     'for_questions_outside_the_session_template', (select count(*) from public.survey_answers a join public.responses r on r.id = a.response_id join cls on cls.session_id = r.session_id and cls.status = 'mappable'
         join public.sessions s on s.id = r.session_id
         where a.value is not null and not exists (select 1 from public.survey_questions qq where qq.id = a.question_id and qq.template_id = s.template_id))),
  'points', jsonb_build_object(
     'awarded_in_mappable_sessions', (select coalesce(sum(r.points_awarded), 0) from public.responses r join cls on cls.session_id = r.session_id and cls.status = 'mappable'),
     'awarded_in_all_sessions', (select coalesce(sum(r.points_awarded), 0) from public.responses r join public.sessions s on s.id = r.session_id where s.org_id = p_org),
     'profile_balances_total', (select coalesce(sum(p.points), 0) from public.profiles p where p.org_id = p_org)),
  'untouched_by_the_bridge', jsonb_build_object(
     'profiles', (select count(*) from public.profiles p where p.org_id = p_org),
     'orders', (select count(*) from public.orders o where o.org_id = p_org),
     'session_members', (select count(*) from public.session_members m join public.sessions s on s.id = m.session_id where s.org_id = p_org),
     'dish_ratings', (select count(*) from public.dish_ratings d where d.org_id = p_org),
     'voice_notes', (select count(*) from public.voice_notes v where v.org_id = p_org))
)
$$;

create function lv_private.note_legacy_issue(p_org uuid, p_kind text, p_table text, p_id uuid, p_detail jsonb default null) returns void
language sql volatile security definer set search_path = ''
as $$
  insert into lv_private.legacy_bridge_issues (org_id, kind, legacy_table, legacy_id, detail) values (p_org, p_kind, p_table, p_id, p_detail)
  on conflict (kind, legacy_table, legacy_id) do update set last_seen = now(), detail = excluded.detail
$$;

-- Copies the answers of ONE legacy response into its answer set. Idempotent per legacy answer id, so an answer that reaches the
-- legacy table after its response was already mapped is picked up by the next sync instead of being lost.
create function lv_private.legacy_copy_answers(p_org uuid, p_campaign uuid, p_response uuid, p_answer_set uuid) returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  a record; v_q uuid; v_type text; n int; v_added int := 0;
begin
  for a in select * from public.survey_answers x where x.response_id = p_response and x.value is not null and x.value <> 'null'::jsonb
           and not exists (select 1 from lv_private.legacy_answer_map am where am.answer_id = x.id) order by x.created_at, x.id loop
    select qm.question_id into v_q from lv_private.legacy_question_map qm where qm.campaign_id = p_campaign and qm.legacy_question_id = a.question_id;
    if v_q is null then
      perform lv_private.note_legacy_issue(p_org, 'answer_question_not_in_template', 'survey_answers', a.id, jsonb_build_object('question_id', a.question_id));
      continue;
    end if;
    select cq.type into v_type from lv_private.campaign_questions cq where cq.id = v_q;
    if not ((v_type in ('rating', 'slider', 'flame') and jsonb_typeof(a.value) = 'number') or (v_type = 'yes_no' and jsonb_typeof(a.value) = 'boolean')
            or (v_type in ('single_choice', 'text') and jsonb_typeof(a.value) = 'string') or (v_type = 'multi_choice' and jsonb_typeof(a.value) = 'array')) then
      perform lv_private.note_legacy_issue(p_org, 'answer_value_unexpected', 'survey_answers', a.id, jsonb_build_object('question_type', v_type, 'json_type', jsonb_typeof(a.value)));
    end if;
    insert into lv_private.campaign_answer_values (response_id, question_id, value) values (p_answer_set, v_q, a.value)
    on conflict on constraint campaign_answer_values_pkey do nothing;
    get diagnostics n = row_count;
    if n = 0 then
      perform lv_private.note_legacy_issue(p_org, 'duplicate_answer_for_question', 'survey_answers', a.id, null);
    else
      insert into lv_private.legacy_answer_map (answer_id, answer_response_id, question_id) values (a.id, p_answer_set, v_q);
      v_added := v_added + 1;
    end if;
  end loop;
  return v_added;
end;
$$;

-- Copies ONE legacy response (answers, receipt, points as recorded) into an already mapped Campaign. Idempotent by response id;
-- for a response that is already mapped it only adds answers that have arrived since.
create function lv_private.legacy_copy_response(p_campaign uuid, p_response uuid) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r record; s record; v_account uuid; v_ans uuid; v_part uuid; v_set uuid;
begin
  select * into r from public.responses x where x.id = p_response;
  select * into s from public.sessions x where x.id = r.session_id;
  select m.answer_response_id into v_set from lv_private.legacy_response_map m where m.response_id = p_response;
  if v_set is not null then
    return case when lv_private.legacy_copy_answers(s.org_id, p_campaign, p_response, v_set) > 0 then 'answers_added' else 'already' end;
  end if;
  select i.account_id into v_account from lv_private.account_identities i where i.auth_user_id = r.student_id;
  if v_account is null then
    perform lv_private.note_legacy_issue(s.org_id, 'response_student_without_account', 'responses', r.id, jsonb_build_object('student_id', r.student_id));
    return 'skipped';
  end if;
  if not exists (select 1 from public.profiles p where p.id = r.student_id and p.org_id = s.org_id) then
    perform lv_private.note_legacy_issue(s.org_id, 'response_student_other_org', 'responses', r.id, jsonb_build_object('student_id', r.student_id));
    return 'skipped';
  end if;

  insert into lv_private.campaign_answers (campaign_id, hub_id, question_revision, audience, account_id, submitted_on)
  values (p_campaign, s.org_id, 1, 'member', v_account, r.submitted_at::date) returning response_id into v_ans;
  perform lv_private.legacy_copy_answers(s.org_id, p_campaign, r.id, v_ans);

  -- The receipt keeps the ORIGINAL submission time and the points exactly as the legacy app awarded them (recorded, not re-applied).
  insert into lv_private.campaign_participation (campaign_id, hub_id, account_id, created_at, question_revision, response_id, reward_state, points)
  values (p_campaign, s.org_id, v_account, r.submitted_at, 1, v_ans, 'recorded', greatest(r.points_awarded, 0))
  returning id into v_part;
  insert into lv_private.legacy_response_map (response_id, participation_id, answer_response_id) values (r.id, v_part, v_ans);
  return 'copied';
end;
$$;

-- Maps ONE session atomically (all or nothing), or records why it was not mapped. Safe to call repeatedly and concurrently.
create function lv_private.legacy_map_session(p_session uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  s record; cls record; v_campaign uuid; v_pos int := 0; q record; v_newq uuid; v_copied int := 0; v_skipped int := 0; r record; v_res text; v_creator uuid;
begin
  select * into s from public.sessions x where x.id = p_session;
  if not found then raise exception 'legacy session % does not exist', p_session; end if;
  if not exists (select 1 from lv_private.hubs h where h.id = s.org_id) then
    raise exception 'organization % is not a Hub yet: run the explicit-Owner backfill first', s.org_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_legacy_map:' || p_session::text, 0));

  select m.campaign_id into v_campaign from lv_private.legacy_session_map m where m.session_id = p_session and m.campaign_id is not null;
  if v_campaign is null then
    select c.status, c.reason into cls from lv_private.legacy_session_classes(s.org_id) c where c.session_id = p_session;
    if cls.status <> 'mappable' then
      insert into lv_private.legacy_session_map (session_id, org_id, status, reason) values (p_session, s.org_id, cls.status, cls.reason)
      on conflict (session_id) do update set status = excluded.status, reason = excluded.reason, evaluated_at = now();
      if cls.status = 'ambiguous' then
        perform lv_private.note_legacy_issue(s.org_id, 'ambiguous_session', 'sessions', p_session, jsonb_build_object('reason', cls.reason));
      end if;
      return jsonb_build_object('session_id', p_session, 'status', cls.status, 'reason', cls.reason);
    end if;

    select i.account_id into v_creator from lv_private.account_identities i where i.auth_user_id = s.created_by;
    insert into lv_private.campaigns (hub_id, mode, state, title, anonymous, guest_access, opens_at, closes_at, join_code, legacy_session_id, legacy_historical, created_by)
    values (s.org_id, 'survey', 'draft', btrim(s.title), false, 'off', s.opens_at, s.closes_at, upper(btrim(s.join_code)), s.id, true, v_creator)
    returning id into v_campaign;
    for q in select * from public.survey_questions x where x.template_id = s.template_id order by x.position, x.created_at, x.id loop
      v_pos := v_pos + 1;
      insert into lv_private.campaign_questions (campaign_id, position, type, prompt, help_text, required, options, scale_min, scale_max)
      values (v_campaign, v_pos, q.type, btrim(q.prompt), nullif(q.help_text, ''), q.required, q.options, q.scale_min, q.scale_max) returning id into v_newq;
      insert into lv_private.legacy_question_map (legacy_question_id, campaign_id, question_id) values (q.id, v_campaign, v_newq);
    end loop;
    -- Closed history: state and revision are set only after the questions exist (questions freeze once it leaves draft).
    update lv_private.campaigns c set state = 'closed', closed_at = s.closes_at, published_revision = 1, question_revision = 1 where c.id = v_campaign;
    insert into lv_private.legacy_session_map (session_id, org_id, status, reason, campaign_id) values (p_session, s.org_id, 'mapped', null, v_campaign)
    on conflict (session_id) do update set status = 'mapped', reason = null, campaign_id = excluded.campaign_id, evaluated_at = now();
  end if;

  for r in select x.id from public.responses x where x.session_id = p_session order by x.submitted_at, x.id loop
    v_res := lv_private.legacy_copy_response(v_campaign, r.id);
    if v_res = 'copied' then v_copied := v_copied + 1; elsif v_res = 'skipped' then v_skipped := v_skipped + 1; end if;
  end loop;
  return jsonb_build_object('session_id', p_session, 'status', 'mapped', 'campaign_id', v_campaign, 'responses_copied', v_copied, 'responses_skipped_with_issue', v_skipped);
end;
$$;

-- Maps (or re-checks) every session of the organization. Each session is its own subtransaction: a failure leaves that session
-- untouched, is recorded as an issue, and does not stop the others. Re-running continues where it left off.
create function lv_private.legacy_sync_org(p_org uuid, p_limit int default 1000) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  s record; v_res jsonb; v_out jsonb := '[]'::jsonb; v_errors int := 0;
begin
  if not exists (select 1 from lv_private.hubs h where h.id = p_org) then
    raise exception 'organization % is not a Hub yet: run the explicit-Owner backfill first', p_org;
  end if;
  for s in select x.id from public.sessions x where x.org_id = p_org order by x.created_at, x.id limit p_limit loop
    begin
      v_res := lv_private.legacy_map_session(s.id);
      v_out := v_out || v_res;
    exception when others then
      v_errors := v_errors + 1;
      perform lv_private.note_legacy_issue(p_org, 'sync_error', 'sessions', s.id, jsonb_build_object('sqlstate', sqlstate, 'message', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('org_id', p_org, 'errors', v_errors, 'sessions', v_out);
end;
$$;

-- READ-ONLY reconciliation: does everything the bridge was supposed to carry over match, and what is still open?
create function lv_private.legacy_reconcile(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_by jsonb; v_amb jsonb; v_pending int; v_resp_mapped_sessions int; v_resp_unmapped int; v_ans_legacy int; v_ans_mapped int; v_ans_issue int;
  v_pts_legacy bigint; v_pts_mapped bigint; v_drift jsonb; v_open int;
begin
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) into v_by from (select status, count(*) as n from lv_private.legacy_session_classes_overlay(p_org) group by 1) z;
  select coalesce(jsonb_agg(jsonb_build_object('session_id', session_id, 'reason', reason) order by session_id), '[]'::jsonb) into v_amb from lv_private.legacy_session_classes_overlay(p_org) where status = 'ambiguous';
  select count(*) into v_pending from lv_private.legacy_session_classes_overlay(p_org) where status = 'mappable';
  select count(*) into v_resp_mapped_sessions from public.responses r join lv_private.legacy_session_map m on m.session_id = r.session_id and m.campaign_id is not null;
  select count(*) into v_resp_unmapped from public.responses r join lv_private.legacy_session_map m on m.session_id = r.session_id and m.campaign_id is not null
    where not exists (select 1 from lv_private.legacy_response_map x where x.response_id = r.id)
      and not exists (select 1 from lv_private.legacy_bridge_issues i where i.legacy_table = 'responses' and i.legacy_id = r.id and i.kind in ('response_student_without_account', 'response_student_other_org'));
  select count(*) into v_ans_legacy from public.survey_answers a join lv_private.legacy_response_map x on x.response_id = a.response_id where a.value is not null and a.value <> 'null'::jsonb;
  select count(*) into v_ans_mapped from lv_private.campaign_answer_values v join lv_private.legacy_response_map x on x.answer_response_id = v.response_id;
  select count(*) into v_ans_issue from lv_private.legacy_bridge_issues i where i.org_id = p_org and i.kind in ('answer_question_not_in_template', 'duplicate_answer_for_question');
  select coalesce(sum(r.points_awarded), 0) into v_pts_legacy from public.responses r join lv_private.legacy_response_map x on x.response_id = r.id;
  select coalesce(sum(p.points), 0) into v_pts_mapped from lv_private.campaign_participation p join lv_private.legacy_response_map x on x.participation_id = p.id;
  select coalesce(jsonb_agg(m.session_id order by m.session_id), '[]'::jsonb) into v_drift from lv_private.legacy_session_map m join public.sessions s on s.id = m.session_id
    where m.campaign_id is not null and s.is_active and (s.closes_at is null or s.closes_at > now());
  select count(*) into v_open from lv_private.legacy_bridge_issues i where i.org_id = p_org and i.kind not in ('answer_value_unexpected');
  return jsonb_build_object(
    'org_id', p_org,
    'sessions_by_status', v_by,
    'ambiguous', v_amb,
    'mappable_but_not_yet_mapped', v_pending,
    'responses', jsonb_build_object('legacy_in_mapped_sessions', v_resp_mapped_sessions, 'mapped', (select count(*) from lv_private.legacy_response_map),
       'not_yet_mapped_and_unexplained', v_resp_unmapped,
       'skipped_with_recorded_issue', (select count(*) from lv_private.legacy_bridge_issues i where i.org_id = p_org and i.kind in ('response_student_without_account', 'response_student_other_org'))),
    'answers', jsonb_build_object('legacy_for_mapped_responses', v_ans_legacy, 'mapped', v_ans_mapped, 'skipped_with_recorded_issue', v_ans_issue,
       'unexplained_gap', v_ans_legacy - v_ans_mapped - v_ans_issue),
    'points', jsonb_build_object('legacy_awarded_for_mapped_responses', v_pts_legacy, 'recorded_on_receipts', v_pts_mapped, 'difference', v_pts_legacy - v_pts_mapped),
    'drift', jsonb_build_object('mapped_sessions_active_again_in_legacy', v_drift),
    'open_issues', v_open,
    'ok', v_pending = 0 and v_resp_unmapped = 0 and (v_ans_legacy - v_ans_mapped - v_ans_issue) = 0 and v_pts_legacy = v_pts_mapped and v_drift = '[]'::jsonb);
end;
$$;

-- Rollback of the bridge's DERIVED data for one organization. Deletes only archived Campaigns (legacy_historical), their questions,
-- answers, receipts, maps and issues. Never touches a legacy table, and never touches a native v2 Campaign or its responses.
create function lv_private.legacy_unmap_org(p_org uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  n_c int; n_p int; n_a int;
begin
  perform pg_advisory_xact_lock(hashtextextended('lv_legacy_unmap:' || p_org::text, 0));
  delete from lv_private.legacy_response_map m where exists (select 1 from lv_private.campaign_participation p join lv_private.campaigns c on c.id = p.campaign_id where p.id = m.participation_id and c.hub_id = p_org and c.legacy_historical);
  delete from lv_private.campaign_participation p using lv_private.campaigns c where c.id = p.campaign_id and c.hub_id = p_org and c.legacy_historical;
  get diagnostics n_p = row_count;
  delete from lv_private.legacy_answer_map am using lv_private.campaign_answers a, lv_private.campaigns c where a.response_id = am.answer_response_id and c.id = a.campaign_id and c.hub_id = p_org and c.legacy_historical;
  delete from lv_private.campaign_answer_values v using lv_private.campaign_answers a, lv_private.campaigns c where a.response_id = v.response_id and c.id = a.campaign_id and c.hub_id = p_org and c.legacy_historical;
  delete from lv_private.campaign_answers a using lv_private.campaigns c where c.id = a.campaign_id and c.hub_id = p_org and c.legacy_historical;
  get diagnostics n_a = row_count;
  delete from lv_private.legacy_question_map q using lv_private.campaigns c where c.id = q.campaign_id and c.hub_id = p_org and c.legacy_historical;
  delete from lv_private.campaign_questions q using lv_private.campaigns c where c.id = q.campaign_id and c.hub_id = p_org and c.legacy_historical;
  delete from lv_private.legacy_session_map m where m.org_id = p_org;
  delete from lv_private.campaign_activations a using lv_private.campaigns c where c.id = a.campaign_id and c.hub_id = p_org and c.legacy_historical;
  delete from lv_private.campaigns c where c.hub_id = p_org and c.legacy_historical;
  get diagnostics n_c = row_count;
  delete from lv_private.legacy_bridge_issues i where i.org_id = p_org;
  return jsonb_build_object('campaigns_removed', n_c, 'receipts_removed', n_p, 'answer_sets_removed', n_a);
end;
$$;

revoke all on all tables in schema lv_private from public, anon, authenticated;
revoke all on all functions in schema lv_private from public, anon, authenticated;
