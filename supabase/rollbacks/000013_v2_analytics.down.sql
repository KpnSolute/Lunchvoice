-- Rollback for 000013_v2_analytics. Restores the 000005 lv.analytics_core body.
drop function if exists lv_api.lv_analytics_overview(uuid);
drop function if exists lv.api_analytics_overview(uuid);

create or replace function lv.analytics_core(p_campaign uuid, p_caller uuid, p_metric text, p_question uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c record;
  q record;
  v_pol jsonb;
  v_sensitive boolean;
  v_n bigint;
  v_rel record;
  v_cells jsonb;
  v_shown jsonb;
  v_min int;
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

    if c.status = 'active' then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'live_restricted');
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'lv_policy_undecided',
        'message', 'Anonymous results are available only after the Campaign has finished.'));
    end if;

    perform pg_advisory_xact_lock(hashtextextended('lv_release:' || p_campaign::text, 0));
    select count(*) into v_n from lv.participation x where x.campaign_id = p_campaign;
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
    if v_sensitive and v_n < v_min then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'suppressed');
      return jsonb_build_object('ok', true, 'metric', p_metric, 'n', null, 'suppressed', true);
    end if;
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'published');
    return jsonb_build_object('ok', true, 'metric', p_metric, 'n', v_n, 'suppressed', false);
  end if;

  if p_metric = 'answer_distribution' then
    select * into q from lv.campaign_questions cq where cq.id = p_question and cq.campaign_id = p_campaign;
    if not found then
      return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_invalid_input', 'message', 'Choose a question of this Campaign.'));
    end if;
    if q.kind = 'text' then
      insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'type_not_available');
      return jsonb_build_object('ok', false, 'error', jsonb_build_object(
        'code', 'lv_policy_undecided',
        'message', 'Results for free-text questions are not available yet.'));
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('key', k, 'n', cn) order by k), '[]'::jsonb) into v_cells
    from (
      select coalesce(a.value #>> '{}', 'null') as k, count(*) as cn
        from lv.answers a
        join lv.submissions s on s.id = a.submission_id
       where s.campaign_id = p_campaign and a.question_id = p_question
       group by 1
    ) x;

    v_shown := lv.suppress_cells(v_cells, v_min, case when v_sensitive then (v_pol->>'complementary')::boolean else false end);
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'published');
    return jsonb_build_object('ok', true, 'metric', p_metric, 'question_id', p_question, 'cells', v_shown);
  end if;

  return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_invalid_input', 'message', 'Unknown metric.'));
end;
$$;

drop function if exists lv.campaign_member_participation(uuid);
drop function if exists lv.campaign_finished(text, timestamptz);
