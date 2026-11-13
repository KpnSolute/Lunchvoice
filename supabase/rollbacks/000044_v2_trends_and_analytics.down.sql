-- Rollback for 000044_v2_trends_and_analytics. Refuses while any Trend exists (a rollback never deletes a customer's
-- Trend), restores lv.api_analytics_export as 000016 defined it, and drops everything 000044 added. Response-context
-- counters are aggregates only and are dropped with their tables.
begin;
do $$ begin
  if exists (select 1 from lv.trends) then
    raise exception 'Trends exist; resolve them before rolling back 000044.';
  end if;
end $$;

drop function if exists lv_api.lv_response_started(uuid);
drop function if exists lv_api.lv_response_context(uuid, text, int);
drop function if exists lv_api.lv_analytics_crosstab(uuid, uuid, uuid);
drop function if exists lv_api.lv_analytics_premium(uuid);
drop function if exists lv_api.lv_analytics_summary(uuid);
drop function if exists lv_api.lv_campaign_trend(uuid);
drop function if exists lv_api.lv_trend_ask_again(uuid);
drop function if exists lv_api.lv_trend_remove(uuid, uuid);
drop function if exists lv_api.lv_trend_add(uuid, uuid);
drop function if exists lv_api.lv_trend_delete(uuid);
drop function if exists lv_api.lv_trend_update(uuid, text, text);
drop function if exists lv_api.lv_trend_create(uuid, text, text, uuid[]);
drop function if exists lv_api.lv_trend_get(uuid);
drop function if exists lv_api.lv_trend_list(uuid);

drop trigger if exists submissions_capture_device on lv.submissions;
drop table if exists lv.response_context_marks;
drop table if exists lv.campaign_response_context;
drop table if exists lv.trend_runs;
drop table if exists lv.trends;
drop function if exists lv.api_analytics_crosstab(uuid, uuid, uuid);
drop function if exists lv.api_analytics_premium(uuid);
drop function if exists lv.premium_results_guard(uuid, uuid);
drop function if exists lv.api_trend_get(uuid);
drop function if exists lv.api_analytics_summary(uuid);
drop function if exists lv.analytics_summary_core(uuid, uuid);
drop function if exists lv.results_gate(uuid, uuid);
drop function if exists lv.release_cells(jsonb, boolean, int, bigint);
drop function if exists lv.api_response_started(uuid);
drop function if exists lv.api_response_context(uuid, text, int);
drop function if exists lv.capture_submission_device();
drop function if exists lv.device_class(text);
drop function if exists lv.bump_context(uuid, text, text);
drop function if exists lv.trend_point(uuid, uuid, uuid, text);
drop function if exists lv.api_campaign_trend(uuid);
drop function if exists lv.api_trend_ask_again(uuid);
drop function if exists lv.api_trend_remove(uuid, uuid);
drop function if exists lv.api_trend_add(uuid, uuid);
drop function if exists lv.api_trend_delete(uuid);
drop function if exists lv.api_trend_update(uuid, text, text);
drop function if exists lv.trend_manage_guard(uuid, uuid);
drop function if exists lv.api_trend_create(uuid, text, text, uuid[]);
drop function if exists lv.api_trend_list(uuid);
drop function if exists lv.trend_json(uuid);
drop function if exists lv.trend_space(uuid, uuid);
drop function if exists lv.trend_allowance(uuid);
drop function if exists lv.trend_limit(uuid);
drop function if exists lv.trend_run_same_space();


delete from lv.plan_limits where key in ('trends.max', 'trends.max_pass', 'analytics.premium')
  or (key = 'analytics.export' and family in ('creator_plus', 'creator_pro'));

create or replace function lv.api_analytics_export(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_hub uuid;
  v_family text;
  v_over jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_texts jsonb := '[]'::jsonb;
  qn jsonb;
  cell jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
  if v_hub is null or lv.membership_of(v_account, v_hub) is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if not lv.has_capability(v_account, v_hub, 'analytics.export') then
    return lv.err('lv_forbidden', 'Exporting results requires analytics.export.');
  end if;
  v_family := lv.hub_family(v_hub);
  if v_family is null or v_family = 'free' or coalesce((lv.plan_limit(v_family, 'analytics.export'))::boolean, false) is not true then
    return lv.err_x('lv_entitlement_required', 'Exports need a Starter or Team plan.', jsonb_build_object('product', 'starter_hub'));
  end if;

  v_over := lv.api_analytics_overview(p_campaign);
  if not (v_over->>'ok')::boolean then return v_over; end if;

  v_rows := v_rows || jsonb_build_object('question_position', null, 'question', null, 'kind', null, 'key', 'participants',
    'n', v_over #> '{participant_count,n}', 'suppressed', v_over #> '{participant_count,suppressed}', 'reason', null);
  v_rows := v_rows || jsonb_build_object('question_position', null, 'question', null, 'kind', null, 'key', 'guests',
    'n', v_over #> '{participant_count,guest_n}', 'suppressed', v_over #> '{participant_count,guest_suppressed}', 'reason', null);
  for qn in select * from jsonb_array_elements(v_over->'questions') loop
    continue when not coalesce((qn #>> '{result,ok}')::boolean, false);
    -- Free text goes in its own list, never into the aggregate rows.
    if qn->>'kind' = 'text' then
      v_texts := v_texts || jsonb_build_object('question_position', qn->'position', 'question', qn->'prompt',
        'texts', qn #> '{result,texts}', 'texts_withheld', qn #> '{result,texts_withheld}');
      continue;
    end if;
    if (qn #>> '{result,withheld}')::boolean then
      v_rows := v_rows || jsonb_build_object('question_position', qn->'position', 'question', qn->'prompt', 'kind', qn->'kind',
        'key', null, 'n', null, 'suppressed', true, 'reason', qn #> '{result,reason}');
    end if;
    for cell in select * from jsonb_array_elements(coalesce(qn #> '{result,cells}', '[]'::jsonb)) loop
      v_rows := v_rows || jsonb_build_object('question_position', qn->'position', 'question', qn->'prompt', 'kind', qn->'kind',
        'key', cell->'key', 'n', cell->'n', 'suppressed', cell->'suppressed', 'reason', cell->'reason');
    end loop;
    if qn #> '{result,summary}' is not null then
      v_rows := v_rows || jsonb_build_object('question_position', qn->'position', 'question', qn->'prompt', 'kind', qn->'kind',
        'key', 'mean', 'n', qn #> '{result,summary,mean}', 'suppressed', qn #> '{result,summary,suppressed}', 'reason', null);
    end if;
  end loop;
  perform lv.audit(v_account, v_hub, 'analytics.exported', p_campaign::text);
  return jsonb_build_object('ok', true, 'campaign_id', p_campaign, 'generated_at', now(),
                            'includes_guests', v_over->'includes_guests', 'rows', v_rows, 'texts', v_texts);
end;
$$;

commit;
