-- Rollback for 000016_v2_billing_ready. Restores the 000013 analytics engine, the 000003 Owner bootstrap and the
-- 000015 slug hook (captured with pg_get_functiondef), and drops billing, reservations, export, Discover and the
-- retention sweep. The billing event log and reservations are dropped with it: canonical rehearsal only.
drop function if exists lv_api.lv_checkout_start(text, uuid, int, text);
drop function if exists lv_api.lv_billing_summary(uuid);
drop function if exists lv_api.lv_hub_reservation_status(text);
drop function if exists lv_api.lv_analytics_export(uuid);
drop function if exists lv_api.lv_discover_apply(uuid);
drop function if exists lv.retention_sweep();
drop function if exists lv.api_discover_apply(uuid);
drop function if exists lv.genuine_active_members(uuid);
drop function if exists lv.api_billing_summary(uuid);
drop function if exists lv.billing_apply_event(text, text, text, jsonb);
drop function if exists lv.api_checkout_start(text, uuid, int, text);
drop function if exists lv.checkout_amount(text, int);
drop function if exists lv.api_hub_reservation_status(text);
drop function if exists lv.api_analytics_export(uuid);

CREATE OR REPLACE FUNCTION lv.analytics_core(p_campaign uuid, p_caller uuid, p_metric text, p_question uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  c record;
  q record;
  v_pol jsonb;
  v_sensitive boolean;
  v_n bigint;
  v_guests bigint;
  v_rel record;
  v_cells jsonb;
  v_shown jsonb;
  v_min int;
  v_part jsonb;
  v_mean numeric;
begin
  select * into c from lv.campaigns where id = p_campaign;
  if c is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_not_found', 'message', 'No such Campaign.'));
  end if;
  if c.status = 'draft' then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_lifecycle_invalid', 'message', 'This Campaign has no results yet.'));
  end if;

  v_sensitive := (c.anonymity = 'anonymous');

  if v_sensitive then
    v_pol := lv.analytics_policy_state();
    if v_pol ? 'missing' then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'policy_missing');
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'lv_policy_undecided',
        'message', 'Anonymous results are not available until the privacy policy is set.',
        'missing', v_pol->'missing'));
    end if;

    -- Live anonymous results are not published: they would become a running identity-linked tally.
    if not lv.campaign_finished(c.status, c.closes_at) then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'live_restricted');
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'lv_policy_undecided',
        'message', 'Anonymous results are available only after the Campaign has finished.'));
    end if;

    -- Population (members and guests) is frozen at first release; a changed population withholds results.
    perform pg_advisory_xact_lock(hashtextextended('lv_release:' || p_campaign::text, 0));
    select (select count(*) from lv.participation x where x.campaign_id = p_campaign)
         + (select count(*) from lv.guest_participation g where g.campaign_id = p_campaign) into v_n;
    select * into v_rel from lv.analytics_releases r where r.campaign_id = p_campaign;
    if v_rel.campaign_id is null then
      insert into lv.analytics_releases (campaign_id, participant_n, released_by) values (p_campaign, v_n, p_caller);
    elsif v_rel.participant_n <> v_n then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'population_changed');
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'lv_policy_undecided',
        'message', 'These results can no longer be shown because the population changed after first release.'));
    end if;
  end if;

  v_min := case when v_sensitive then (v_pol->>'min_cohort')::int else 1 end;

  if p_metric = 'participant_count' then
    select count(*) into v_n from lv.participation x where x.campaign_id = p_campaign;
    select count(*) into v_guests from lv.guest_participation g where g.campaign_id = p_campaign;
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome)
    values (p_campaign, p_caller, p_metric, p_question, case when v_sensitive and v_n < v_min then 'suppressed' else 'published' end);
    return jsonb_build_object('ok', true, 'metric', p_metric,
      'n', case when v_sensitive and v_n < v_min then null else v_n end,
      'suppressed', v_sensitive and v_n < v_min,
      'guest_n', case when v_sensitive and v_guests > 0 and v_guests < v_min then null else v_guests end,
      'guest_suppressed', v_sensitive and v_guests > 0 and v_guests < v_min);
  end if;

  if p_metric = 'participation_rate' then
    v_part := lv.campaign_member_participation(p_campaign);
    v_n := (v_part->>'participants')::bigint;
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome)
    values (p_campaign, p_caller, p_metric, p_question, case when v_sensitive and v_n < v_min then 'suppressed' else 'published' end);
    if v_sensitive and v_n < v_min then
      return jsonb_build_object('ok', true, 'metric', p_metric, 'n', null, 'eligible_n', (v_part->>'eligible')::bigint,
                                'rate', null, 'suppressed', true);
    end if;
    return jsonb_build_object('ok', true, 'metric', p_metric, 'n', v_n, 'eligible_n', (v_part->>'eligible')::bigint,
      'rate', case when (v_part->>'eligible')::bigint = 0 then null
                   else round(v_n::numeric / (v_part->>'eligible')::numeric, 4) end,
      'suppressed', false);
  end if;

  if p_metric in ('answer_distribution', 'rating_summary') then
    select * into q from lv.campaign_questions cq where cq.id = p_question and cq.campaign_id = p_campaign;
    if not found then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_invalid_input', 'message', 'Choose a question of this Campaign.'));
    end if;
    if q.kind = 'text' then
      -- Free text can identify a respondent by its content; publishing it needs a decided policy.
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'type_not_available');
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'lv_policy_undecided',
        'message', 'Results for free-text questions are not available yet.'));
    end if;
  end if;

  if p_metric = 'answer_distribution' then
    -- One count per selected option: a multi_choice array contributes each element once.
    select coalesce(jsonb_agg(jsonb_build_object('key', k, 'n', cn) order by k), '[]'::jsonb) into v_cells
    from (
      select e.k, count(*) as cn
        from lv.answers a
        join lv.submissions s on s.id = a.submission_id
        cross join lateral jsonb_array_elements_text(
          case when jsonb_typeof(a.value) = 'array' then a.value else jsonb_build_array(a.value) end) as e(k)
       where s.campaign_id = p_campaign and a.question_id = p_question
       group by e.k
    ) x;

    v_shown := lv.suppress_cells(v_cells, v_min, case when v_sensitive then (v_pol->>'complementary')::boolean else false end);
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'published');
    return jsonb_build_object('ok', true, 'metric', p_metric, 'question_id', p_question, 'cells', v_shown);
  end if;

  if p_metric = 'rating_summary' then
    if q.kind <> 'rating' then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_invalid_input', 'message', 'rating_summary needs a rating question.'));
    end if;
    select count(*), avg((a.value)::numeric) into v_n, v_mean
      from lv.answers a join lv.submissions s on s.id = a.submission_id
     where s.campaign_id = p_campaign and a.question_id = p_question and jsonb_typeof(a.value) = 'number';
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome)
    values (p_campaign, p_caller, p_metric, p_question, case when v_sensitive and v_n < v_min then 'suppressed' else 'published' end);
    if v_sensitive and v_n < v_min then
      return jsonb_build_object('ok', true, 'metric', p_metric, 'question_id', p_question, 'n', null, 'mean', null, 'suppressed', true);
    end if;
    return jsonb_build_object('ok', true, 'metric', p_metric, 'question_id', p_question, 'n', v_n,
                              'mean', round(v_mean, 2), 'suppressed', false);
  end if;

  return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_invalid_input', 'message', 'Unknown metric.'));
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.api_analytics_overview(p_campaign uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid;
  v_count jsonb;
  v_rate jsonb;
  v_questions jsonb := '[]'::jsonb;
  q record;
  v_result jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
  if v_hub is null or lv.membership_of(v_account, v_hub) is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if not lv.has_capability(v_account, v_hub, 'analytics.read') then
    return lv.err('lv_forbidden', 'Reading results requires analytics.read.');
  end if;

  v_count := lv.analytics_core(p_campaign, v_account, 'participant_count', null);
  if not (v_count->>'ok')::boolean then return v_count; end if;
  v_rate := lv.analytics_core(p_campaign, v_account, 'participation_rate', null);

  for q in select * from lv.campaign_questions x where x.campaign_id = p_campaign order by x.position loop
    v_result := lv.analytics_core(p_campaign, v_account, 'answer_distribution', q.id);
    if q.kind = 'rating' and (v_result->>'ok')::boolean then
      v_result := v_result || jsonb_build_object('summary', lv.analytics_core(p_campaign, v_account, 'rating_summary', q.id) - 'ok' - 'metric' - 'question_id');
    end if;
    v_questions := v_questions || jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                                     'prompt', q.prompt, 'result', v_result);
  end loop;

  return jsonb_build_object('ok', true,
    'participant_count', v_count - 'ok' - 'metric',
    'participation_rate', v_rate - 'ok' - 'metric',
    'questions', v_questions);
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.owner_bootstrap_roles(p_hub uuid, p_owner uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_member uuid;
  v_role uuid;
  v_owner_active uuid;
begin
  -- Owner membership (created by the caller of lv_hub_create) must be accepted.
  select id into v_member from lv.hub_memberships
   where hub_id = p_hub and account_id = p_owner and status = 'accepted';
  if v_member is null then
    raise exception 'lv_invalid_input: the Owner must be an accepted member first' using errcode = '42501';
  end if;

  insert into lv.roles (hub_id, key, name, is_owner, is_system)
  values (p_hub, 'owner', 'Owner', true, true)
  on conflict (hub_id, key) do update set name = excluded.name
  returning id into v_role;

  insert into lv.role_capabilities (role_id, capability) values
    (v_role, 'hub.settings.manage'),
    (v_role, 'admin.members.admit'),
    (v_role, 'admin.members.remove'),
    (v_role, 'admin.roles.manage'),
    (v_role, 'campaign.manage'),
    (v_role, 'analytics.read')
  on conflict do nothing;

  -- The prototype's "no Owner role assignment" guard is expressed here instead: the Owner's role assignment
  -- is derived from hubs.owner_account_id, and this row exists so capability lookups work uniformly.
  insert into lv.membership_roles (membership_id, role_id) values (v_member, v_role) on conflict do nothing;

  -- Satisfy the owner_role_assignment invariant: exactly one assignment for the owner hub.
  select h.id into v_owner_active from lv.hubs h where h.id = p_hub and h.owner_account_id = p_owner;
  if v_owner_active is null then
    raise exception 'lv_invalid_input: hub owner mismatch';
  end if;
  return v_role;
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.slug_claim_blocked(p_slug text, p_account uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select case when lv.slug_quarantined(p_slug) then 'That Hub name was released recently and is not available yet.' end $function$

;

drop function if exists lv.slug_hold(text);
drop function if exists lv.reservation_state(timestamptz, timestamptz);
drop function if exists lv.question_total(uuid, uuid);
drop function if exists lv.question_cells(uuid, uuid);
drop function if exists lv.safe_cells(jsonb, int, bigint);
drop table if exists lv.discover_applications;
drop table if exists lv.billing_events;
drop table if exists lv.checkout_intents;
drop table if exists lv.hub_reservations;

delete from lv.role_capabilities where capability in ('analytics.export', 'billing.view');
delete from lv.capabilities where capability in ('analytics.export', 'billing.view');
delete from lv.policy where key in ('billing.provider_ready', 'billing.payment_links', 'reservation.grace_days',
  'discover.active_window_days', 'retention.logs_days', 'retention.guest_hash_days');
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke usage on schema lv from service_role';
  end if;
end $$;
