-- LunchVoice v2 foundation 5/N: privacy-safe aggregate analytics.
--
-- DEPENDS ON migrations 1-4 (PRs #11 to #14). NOT APPLIED TO PRODUCTION. Sets no policy value and creates no grant.
--
-- This is the ONLY reader of campaign answers, and it returns aggregates only. Design rules (all tested):
--   * Anonymous (or guest-bearing) Campaigns return NOTHING unless three separate privacy policy values are set: a cell
--     threshold, a minimum participant count, and the disclosure controls. A threshold alone does not settle D-10.
--   * Sensitive results are served only for finished (closed or expired) Campaigns and only for ONE population size: the
--     first release freezes the participant counts, and any later change makes the results unavailable. This blocks
--     differencing between releases and live trickle attacks until the founder decides how repeat releases should work.
--   * Query shapes are restricted to what is safe without further policy: one Campaign, one metric, optionally one
--     question. There are no filters, cross-tabulations, time slices, per-response timestamps or free-text results.
--   * Members and guests are separate populations with separate thresholds; they are never added together.
--   * A suppressed or unavailable value is NULL with suppressed = true (or an error), never 0. Only a real zero is 0.
--   * Complementary suppression stops a single suppressed cell being recovered from a displayed total.
--   * Every call, including refusals, is logged for audit. There is NO export or embed path.

insert into lv_private.policy (key, value, note) values
  ('analytics.min_cohort', null,
   'Smallest cell count that may be shown for an anonymous or guest population. JSON integer >= 2. Undecided (D-10): NULL makes anonymous analytics unavailable. A cell with 0 < n < this value is suppressed.'),
  ('analytics.min_participants', null,
   'Smallest participant total before ANY anonymous figure (even the total) is shown for an audience. JSON integer >= analytics.min_cohort. Undecided (D-10).'),
  ('analytics.disclosure_controls', null,
   'Disclosure controls. {"complementary_suppression": true|false}: when a distribution that partitions the participants has exactly one suppressed cell, also suppress the smallest remaining cell. Undecided (D-10): NULL makes anonymous analytics unavailable.');

-- One row per Campaign: the participant counts at the first release of sensitive results.
create table lv_private.analytics_releases (
  campaign_id uuid primary key references lv_private.campaigns (id) on delete restrict,
  member_n int not null,
  guest_n int not null,
  released_at timestamptz not null default now(),
  released_by uuid references lv_private.accounts (id)
);

-- Audit trail of every analytics request and its outcome. Not readable through the API.
create table lv_private.analytics_query_log (
  id bigint generated always as identity primary key,
  campaign_id uuid not null,
  caller_account_id uuid,
  metric text,
  question_id uuid,
  outcome text not null,
  at timestamptz not null default now()
);

alter table lv_private.analytics_releases enable row level security;
alter table lv_private.analytics_query_log enable row level security;

-- ---------------------------------------------------------------------------------------------------------
-- Policy state: {"missing": [...]} or {"min_cohort", "min_participants", "complementary"}
-- ---------------------------------------------------------------------------------------------------------
create function lv_private.analytics_policy_state() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_mc jsonb; v_mp jsonb; v_dc jsonb; v_missing text[] := '{}'; k int; p int;
begin
  select x.value into v_mc from lv_private.policy x where x.key = 'analytics.min_cohort';
  select x.value into v_mp from lv_private.policy x where x.key = 'analytics.min_participants';
  select x.value into v_dc from lv_private.policy x where x.key = 'analytics.disclosure_controls';
  if v_mc is null or jsonb_typeof(v_mc) <> 'number' or (v_mc::text) !~ '^[0-9]{1,6}$' or (v_mc::text)::int < 2 then
    v_missing := v_missing || 'analytics.min_cohort'::text;
  else
    k := (v_mc::text)::int;
  end if;
  if v_mp is null or jsonb_typeof(v_mp) <> 'number' or (v_mp::text) !~ '^[0-9]{1,6}$' or (v_mp::text)::int < coalesce(k, 2) then
    v_missing := v_missing || 'analytics.min_participants'::text;
  else
    p := (v_mp::text)::int;
  end if;
  if v_dc is null or jsonb_typeof(v_dc) <> 'object' or jsonb_typeof(v_dc->'complementary_suppression') is distinct from 'boolean' then
    v_missing := v_missing || 'analytics.disclosure_controls'::text;
  end if;
  if cardinality(v_missing) > 0 then return jsonb_build_object('missing', to_jsonb(v_missing)); end if;
  return jsonb_build_object('min_cohort', k, 'min_participants', p, 'complementary', (v_dc->>'complementary_suppression')::boolean);
end;
$$;

-- Suppress cells. Input: [{key, n}]. Output: [{key, n|null, suppressed, reason|null}].
-- Rule 1: 0 < n < min_cohort is suppressed ("below_min_cohort"). A real zero is shown as 0.
-- Rule 2 (only when p_partition and p_complementary): exactly one suppressed cell -> also suppress the smallest
--         remaining cell ("complementary"), ties broken by key, so the first cannot be derived from the total.
create function lv_private.suppress_cells(p_cells jsonb, p_min_cohort int, p_complementary boolean, p_partition boolean) returns jsonb
language plpgsql immutable set search_path = ''
as $$
declare
  v_out jsonb := '[]'::jsonb; c jsonb; v_prim int := 0; v_pick text; v_pick_n bigint; v_n bigint; v_key text;
begin
  for c in select * from jsonb_array_elements(p_cells) loop
    if (c->>'n')::bigint > 0 and (c->>'n')::bigint < p_min_cohort then v_prim := v_prim + 1; end if;
  end loop;
  if p_complementary and p_partition and v_prim = 1 then
    for c in select * from jsonb_array_elements(p_cells) loop
      v_n := (c->>'n')::bigint; v_key := c->>'key';
      if not (v_n > 0 and v_n < p_min_cohort) and (v_pick is null or v_n < v_pick_n or (v_n = v_pick_n and v_key < v_pick)) then
        v_pick := v_key; v_pick_n := v_n;
      end if;
    end loop;
  end if;
  for c in select * from jsonb_array_elements(p_cells) loop
    v_n := (c->>'n')::bigint; v_key := c->>'key';
    if v_n > 0 and v_n < p_min_cohort then
      v_out := v_out || jsonb_build_object('key', v_key, 'n', null, 'suppressed', true, 'reason', 'below_min_cohort');
    elsif v_pick is not null and v_key = v_pick then
      v_out := v_out || jsonb_build_object('key', v_key, 'n', null, 'suppressed', true, 'reason', 'complementary');
    else
      v_out := v_out || jsonb_build_object('key', v_key, 'n', v_n, 'suppressed', false, 'reason', null);
    end if;
  end loop;
  return v_out;
end;
$$;

-- The analytics core. Returns the usual envelope. Called only by the public wrapper.
create function lv_private.analytics_core(p_campaign uuid, p_caller uuid, p_metric text, p_question uuid) returns jsonb
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

revoke all on all tables in schema lv_private from public, anon, authenticated;
revoke all on all functions in schema lv_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Public RPC
-- ---------------------------------------------------------------------------------------------------------
create function public.lv_analytics_query(campaign_id uuid, metric text, question_id uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_hub uuid; v_caller uuid; v_res jsonb;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if campaign_id is null or metric is null or metric not in ('participation', 'completion', 'answer_distribution')
     or (metric = 'answer_distribution' and question_id is null) or (metric <> 'answer_distribution' and question_id is not null) then
    return lv_private.fail('lv_invalid_input', 'Check the metric and question.');
  end if;
  select c.hub_id into v_hub from lv_private.campaigns c where c.id = lv_analytics_query.campaign_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(v_hub, v_caller, 'community.analytics.view') then
    insert into lv_private.analytics_query_log (campaign_id, caller_account_id, metric, question_id, outcome) values (campaign_id, v_caller, metric, question_id, 'lv_forbidden');
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  v_res := lv_private.analytics_core(campaign_id, v_caller, metric, question_id);
  insert into lv_private.analytics_query_log (campaign_id, caller_account_id, metric, question_id, outcome)
  values (campaign_id, v_caller, metric, question_id, case when (v_res->>'ok')::boolean then 'ok' else v_res->'error'->>'code' end);
  return v_res;
end;
$$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'lv_analytics_query'
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
  end loop;
end;
$$;
