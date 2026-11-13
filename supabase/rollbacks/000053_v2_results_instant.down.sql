-- Rollback for 000053: back to the waiting rules on every plan. Restores the 000042 per-question function, the 000028
-- respondent view and the 000042 manager view, removes the anonymous responses read and the results.instant entitlement.
begin;
drop function if exists lv_api.lv_campaign_responses_anon(uuid, int, int);
drop function if exists lv.api_campaign_responses_anon(uuid, int, int);
drop function if exists lv.analytics_core(uuid, uuid, text, uuid);
alter function lv.analytics_core_waiting(uuid, uuid, text, uuid) rename to analytics_core;
drop function if exists lv.results_instant(uuid);
drop function if exists lv.released_submissions(uuid);
drop function if exists lv.anon_batch_limit(uuid);
drop trigger if exists submissions_assign_batch on lv.submissions;
drop function if exists lv.assign_anon_batch();
alter table lv.submissions drop column if exists batch_no;
delete from lv.plan_limits where key = 'results.instant';
-- 000042 lv.api_analytics_question
create or replace function lv.api_analytics_question(p_campaign uuid, p_question uuid, p_filter jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c record;
  q record;
  f record;
  v_gate jsonb;
  v_min int;
  v_text_min int;
  v_sensitive boolean;
  v_filter jsonb := nullif(p_filter, 'null'::jsonb);
  v_subs jsonb;
  v_all bigint;
  v_group bigint;
  v_seen bigint;
  v_answered bigint;
  v_seen_w boolean;
  v_ans_w boolean;
  v_cells jsonb;
  v_safe jsonb;
  v_out jsonb;
  v_qid text := p_question::text;
  v_fkind text;
begin
  if v_account is null then raise exception 'lv_unauthenticated: sign in first' using errcode = '42501'; end if;
  select * into c from lv.campaigns where id = p_campaign;
  if c.id is null then raise exception 'lv_not_found: no such Campaign' using errcode = '23503'; end if;
  perform lv.require_capability(v_account, c.hub_id, 'analytics.read');
  -- The same gates as every results call (policy set, anonymous only after finishing, frozen population), logged.
  v_gate := lv.analytics_core(p_campaign, v_account, 'participant_count', null);
  if not coalesce((v_gate->>'ok')::boolean, false) then return v_gate; end if;

  select * into q from lv.campaign_questions cq where cq.id = p_question and cq.campaign_id = p_campaign;
  if q.id is null then return lv.err('lv_invalid_input', 'Choose a question of this Campaign.'); end if;
  if v_filter is not null then
    if jsonb_typeof(v_filter) <> 'object' or jsonb_typeof(v_filter->'question_id') is distinct from 'string'
       or (v_filter->>'question_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(v_filter->'any_of') is distinct from 'array' or jsonb_array_length(v_filter->'any_of') not between 1 and 10 then
      return lv.err('lv_invalid_input', 'A filter needs a question and 1 to 10 answers.');
    end if;
    select * into f from lv.campaign_questions cq where cq.id = (v_filter->>'question_id')::uuid and cq.campaign_id = p_campaign;
    if f.id is null or lv.kind_options(f.kind, f.config) is null then
      return lv.err('lv_invalid_input', 'Filter by a choice or yes/no question of this Campaign.');
    end if;
    v_fkind := f.kind;
    v_filter := jsonb_build_object('question_id', f.id, 'any_of', v_filter->'any_of');
  end if;

  v_sensitive := c.anonymity = 'anonymous';
  -- Security review (2026-11-13): on anonymous Campaigns a filter lets two queries differ by a few people (or isolate
  -- free text), which the minimum cohort cannot fully stop. Filters stay on identified Campaigns only until a
  -- cohort-safe partition design exists.
  if v_sensitive and v_filter is not null then
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, v_account, 'question_logic', p_question, 'suppressed');
    return lv.err('lv_invalid_input', 'Filtering results is not available on anonymous surveys.');
  end if;
  v_text_min := coalesce((lv.policy_json('campaign.min_cohort'))::int, 5);
  v_min := case when v_sensitive then v_text_min else 1 end;

  -- One entry per response: its answers as {question_id: value}, whether it is in the filter group, and whether its
  -- path showed this question. Never leaves this function.
  select coalesce(jsonb_agg(jsonb_build_object('ans', x.ans, 'in', x.in_group,
                                               'saw', x.in_group and p_question = any(lv.logic_walk(p_campaign, x.ans)))), '[]'::jsonb)
    into v_subs
    from (select s.ans, v_filter is null or lv.answer_matches(v_fkind, s.ans -> (v_filter->>'question_id'), v_filter->'any_of') as in_group
            from (select coalesce((select jsonb_object_agg(a.question_id::text, a.value) from lv.answers a where a.submission_id = sb.id), '{}'::jsonb) as ans
                    from lv.submissions sb where sb.campaign_id = p_campaign) s) x;

  select count(*), count(*) filter (where (x->>'in')::boolean), count(*) filter (where (x->>'saw')::boolean),
         count(*) filter (where (x->>'in')::boolean and not lv.answer_empty(x->'ans'->v_qid))
    into v_all, v_group, v_seen, v_answered from jsonb_array_elements(v_subs) x;

  v_out := jsonb_build_object('ok', true, 'metric', 'question_logic', 'question_id', p_question, 'filter', v_filter);
  -- A filter group under the cohort, or one that leaves fewer than the cohort outside it, could single people out.
  if v_sensitive and v_filter is not null and (v_group < v_min or (v_all - v_group) between 1 and v_min - 1) then
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, v_account, 'question_logic', p_question, 'suppressed');
    return v_out || jsonb_build_object('filter_withheld', true, 'seen', null, 'answered', null, 'seen_withheld', true,
                                       'cells', '[]'::jsonb, 'withheld', true, 'reason', 'below_min_cohort');
  end if;
  -- Seen and answered counts follow the same rule: neither the group nor what is left of it may be under the cohort.
  v_seen_w := v_sensitive and (v_seen between 1 and v_min - 1 or (v_group - v_seen) between 1 and v_min - 1);
  v_ans_w := v_seen_w or (v_sensitive and (v_answered between 1 and v_min - 1 or (v_seen - v_answered) between 1 and v_min - 1));
  v_out := v_out || jsonb_build_object('filter_withheld', false,
    'seen', case when v_seen_w then null else v_seen end, 'answered', case when v_ans_w then null else v_answered end, 'seen_withheld', v_seen_w);

  if q.kind = 'text' then
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome)
    values (p_campaign, v_account, 'question_logic', p_question, case when v_answered < v_text_min then 'suppressed' else 'published' end);
    if v_answered < v_text_min then return v_out || jsonb_build_object('cells', '[]'::jsonb, 'texts', null, 'texts_withheld', true); end if;
    return v_out || jsonb_build_object('cells', '[]'::jsonb, 'texts_withheld', false,
      'texts', (select coalesce(jsonb_agg(x->'ans'->>v_qid order by random()), '[]'::jsonb)
                  from jsonb_array_elements(v_subs) x where (x->>'in')::boolean and not lv.answer_empty(x->'ans'->v_qid)));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('key', k, 'n', cn) order by k), '[]'::jsonb) into v_cells
    from (select e.k, count(*) as cn from jsonb_array_elements(v_subs) x
            cross join lateral jsonb_array_elements_text(case when jsonb_typeof(x->'ans'->v_qid) = 'array' then x->'ans'->v_qid
                                                              else jsonb_build_array(x->'ans'->v_qid) end) e(k)
           where (x->>'in')::boolean and not lv.answer_empty(x->'ans'->v_qid) group by e.k) y;
  if v_sensitive then
    v_safe := lv.safe_cells(v_cells, v_min, v_answered);
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome)
    values (p_campaign, v_account, 'question_logic', p_question, case when (v_safe->>'withheld')::boolean then 'suppressed' else 'published' end);
    return v_out || jsonb_build_object('cells', v_safe->'cells', 'withheld', (v_safe->>'withheld')::boolean, 'reason', v_safe->'reason');
  end if;
  insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, v_account, 'question_logic', p_question, 'published');
  return v_out || jsonb_build_object('cells', lv.suppress_cells(v_cells, 1, false), 'withheld', false, 'reason', null);
end;
$$;

-- 000028 lv_guest_campaign_get
create or replace function lv_api.lv_guest_campaign_get(p_join_code text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_out jsonb;
begin
  v_out := lv.code_lookup_blocked(p_join_code);
  if v_out is not null then return v_out; end if;
  if exists (select 1 from lv.campaigns c where c.join_code = upper(btrim(coalesce(p_join_code, ''))) and lv.hub_suspended(c.hub_id)) then
    return lv.err('lv_closed', 'This Campaign isn''t accepting responses right now.');
  end if;
  v_out := lv.api_guest_campaign_get(p_join_code);
  if v_out #>> '{error,code}' = 'lv_not_found' then perform lv.code_lookup_miss(p_join_code); end if;
  if coalesce((v_out->>'ok')::boolean, false) and v_out ? 'campaign' then
    v_out := jsonb_set(v_out, '{campaign,guest_names}', to_jsonb(coalesce((
      select case when c.anonymity = 'identified' then c.guest_names else 'off' end
        from lv.campaigns c where c.join_code = upper(btrim(coalesce(p_join_code, '')))), 'off')));
  end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- 000042 lv_campaign_get
create or replace function lv_api.lv_campaign_get(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
  v_hub uuid;
  v_account uuid := lv.current_account_id();
begin
  v := lv.campaign_get_base(p_campaign);
  if coalesce((v->>'ok')::boolean, false) and coalesce((v->>'can_manage')::boolean, false) then
    v := jsonb_set(v, '{campaign,has_responses}', to_jsonb(lv.campaign_has_responses(p_campaign)));
    v := jsonb_set(v, '{campaign,guest_names}', to_jsonb((select c.guest_names from lv.campaigns c where c.id = p_campaign)));
    select c.hub_id into v_hub from lv.campaigns c where c.id = p_campaign;
    v := v || jsonb_build_object('features', jsonb_build_object(
           'branching', lv.feature_allowed(v_hub, v_account, 'survey.branching'),
           'branding', lv.feature_allowed(v_hub, v_account, 'survey.branding')));
    if lv.hub_kind(v_hub) = 'personal' then
      v := jsonb_set(v, '{campaign,question_limit}', to_jsonb(lv.quick_question_limit(v_hub)));
    end if;
  end if;
  return v;
end;
$$;
-- 000044 results gate
create or replace function lv.results_gate(p_campaign uuid, p_account uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c lv.campaigns;
  v_core jsonb;
begin
  if p_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null or lv.membership_of(p_account, c.hub_id) is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if not lv.has_capability(p_account, c.hub_id, 'analytics.read') then
    return lv.err('lv_forbidden', 'Reading results requires analytics.read.');
  end if;
  v_core := lv.analytics_core(p_campaign, p_account, 'participant_count', null);
  if not coalesce((v_core->>'ok')::boolean, false) then return v_core; end if;
  return jsonb_build_object('ok', true, 'hub', c.hub_id, 'sensitive', c.anonymity = 'anonymous',
                            'min', case when c.anonymity = 'anonymous' then (lv.analytics_policy_state()->>'min_cohort')::int else 1 end);
end;
$$;

-- 000024 released_participants
create or replace function lv.released_participants(p_campaign uuid) returns bigint
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v jsonb;
  v_owner uuid;
begin
  select h.owner_account_id into v_owner from lv.campaigns c join lv.hubs h on h.id = c.hub_id where c.id = p_campaign;
  v := lv.analytics_core(p_campaign, v_owner, 'participant_count', null);
  if not coalesce((v->>'ok')::boolean, false) or coalesce((v->>'suppressed')::boolean, true) then return null; end if;
  return (v->>'n')::bigint;
end;
$$;
commit;
