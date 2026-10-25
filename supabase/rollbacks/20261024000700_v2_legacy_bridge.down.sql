-- Rollback for 20261024000700_v2_legacy_bridge.sql. NOT a migration: never applied automatically.
-- Run deliberately, in one transaction, BEFORE rolling back migrations 6 to 1.
--
-- Effect: deletes ONLY what the bridge derived (archived Campaigns marked legacy_historical with their questions, answers, receipts,
-- maps and issues) and restores the earlier functions. It never touches a legacy table, so every legacy response, including any
-- accepted after the initial sync, remains exactly as the legacy app stored it, and native v2 Campaigns and their responses are
-- untouched. Re-running the sync after re-applying the migration rebuilds the same mapping.

begin;

select lv_private.legacy_unmap_org(h.id) from lv_private.hubs h;

drop table if exists lv_private.legacy_bridge_issues;
drop table if exists lv_private.legacy_answer_map;
drop table if exists lv_private.legacy_response_map;
drop table if exists lv_private.legacy_question_map;
drop table if exists lv_private.legacy_session_map;

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
    'expires_at', c.closes_at, 'legacy_session_id', c.legacy_session_id, 'join_code', c.join_code)
  from lv_private.campaigns c where c.id = p_campaign
$$;

create or replace function lv_private.questions_frozen_after_draft() returns trigger
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

drop index if exists lv_private.campaigns_legacy_session_idx;
alter table lv_private.campaigns drop column if exists legacy_historical;

drop function if exists lv_private.legacy_unmap_org(uuid);
drop function if exists lv_private.legacy_reconcile(uuid);
drop function if exists lv_private.legacy_sync_org(uuid, int);
drop function if exists lv_private.legacy_map_session(uuid);
drop function if exists lv_private.legacy_copy_answers(uuid, uuid, uuid, uuid);
drop function if exists lv_private.legacy_copy_response(uuid, uuid);
drop function if exists lv_private.note_legacy_issue(uuid, text, text, uuid, jsonb);
drop function if exists lv_private.legacy_inventory(uuid);
drop function if exists lv_private.legacy_session_classes_overlay(uuid);
drop function if exists lv_private.legacy_session_classes(uuid);

commit;
