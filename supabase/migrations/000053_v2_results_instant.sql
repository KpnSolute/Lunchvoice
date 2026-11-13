-- 000053: live results and individual responses on the plans that include them (results.instant).
--
-- FOUNDER DECISION (approved 2026-11-13, in chat): "pro users should be able to see individual results from both
-- guests and signed-in users and it is not withheld for 4 or fewer responses to see analytics". Spec:
-- docs/v2/handoffs/2026-11-13-names-results-privacy-creator-studio.md section 3. This is the deliberate, entitlement-only
-- exception to 000005's "live anonymous results are not published" rule; it applies only where results.instant holds.
--
-- Who gets it. New plan_limits key results.instant = true for the families team (Team Hub, Campaign Plus),
-- creator_plus and creator_pro. It is resolved per survey with lv.feature_allowed: the Hub's active family OR the
-- survey creator's own active Creator plan (campaigns.created_by, else the Hub owner). Free Quick Survey, Starter Hub
-- and Campaign Starter keep today's rules exactly (anonymous waits for 5 answers and for the survey to finish).
--
-- What changes on a plan that has it (identified and anonymous alike):
--   * lv.analytics_core publishes totals, per-question distributions, rating means and free text from the FIRST answer,
--     while the survey is live and after it closes. No minimum cohort, no complementary suppression, no frozen population.
--   * lv.api_analytics_question (seen / answered per question) shows its counts and free text from the first answer.
--   * Individual responses of an ANONYMOUS survey: lv_api.lv_campaign_responses_anon. Each submission's answers only.
--     Safeguards (they keep "anonymous" honest without holding results back):
--       - no account, guest name, timestamp, receipt id, submission id or arrival order is returned; rows come in a stable
--         hash order that does not follow submission time; an opaque row key replaces the id;
--       - every read is written to lv.audit_events and lv.analytics_query_log;
--       - free text is included, shuffled, without metadata (lv.analytics_core text answers use random order).
--   * Filters on anonymous surveys stay refused (000042 security decision): live totals must not be differenced.
--   * The respondent is told before answering: campaign.results_instant is returned to the player of an anonymous
--     survey, and the start screen says "The creator can see results as they come in."
--   * Identified surveys keep names and "Account" / "Guest, unverified" tags through lv_campaign_responses (000052).
--
-- The UI never computes the plan; it only explains the server's answer. Not applied to production by this file's author.
-- Rollback: supabase/rollbacks/000053_v2_results_instant.down.sql.
begin;

-- ---------------------------------------------------------------- 1. the entitlement
insert into lv.plan_limits (family, key, value, note) values
  ('team', 'results.instant', 'true', 'Founder 2026-11-13: Team Hub and Campaign Plus see results live from the first answer, anonymous surveys included.'),
  ('creator_plus', 'results.instant', 'true', 'Founder 2026-11-13: Creator Plus sees results and individual responses live from the first answer.'),
  ('creator_pro', 'results.instant', 'true', 'Founder 2026-11-13: included above Creator Plus.');

-- Does this survey publish results from the first answer? Hub plan or the creator's own Creator plan.
create function lv.results_instant(p_campaign uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select lv.feature_allowed(c.hub_id, coalesce(c.created_by, h.owner_account_id), 'results.instant')
                     from lv.campaigns c join lv.hubs h on h.id = c.hub_id where c.id = p_campaign), false)
$$;

-- ---------------------------------------------------------------- 2. the analytics engine
-- The existing engine keeps every rule for the waiting plans, unchanged, under a new name. The wrapper takes the
-- results.instant path only; everything else (drafts, unknown Campaigns, waiting plans) goes straight to it.
alter function lv.analytics_core(uuid, uuid, text, uuid) rename to analytics_core_waiting;

create function lv.analytics_core(p_campaign uuid, p_caller uuid, p_metric text, p_question uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  c record;
  q lv.campaign_questions;
  v_n bigint;
  v_guests bigint;
  v_part jsonb;
  v_eligible bigint;
  v_cells jsonb;
  v_mean numeric;
  v_total bigint;
begin
  select * into c from lv.campaigns where id = p_campaign;
  if c.id is null or c.status = 'draft' or not lv.results_instant(p_campaign) then
    return lv.analytics_core_waiting(p_campaign, p_caller, p_metric, p_question);
  end if;

  select count(*) into v_guests from lv.guest_participation g where g.campaign_id = p_campaign;

  if p_metric = 'participant_count' then
    select count(*) into v_n from lv.participation x where x.campaign_id = p_campaign;
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'published');
    return jsonb_build_object('ok', true, 'metric', p_metric, 'n', v_n, 'suppressed', false,
                              'guest_n', v_guests, 'guest_suppressed', false);
  end if;

  if p_metric = 'participation_rate' then
    v_part := lv.campaign_member_participation(p_campaign);
    v_n := (v_part->>'participants')::bigint;
    v_eligible := (v_part->>'eligible')::bigint;
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'published');
    return jsonb_build_object('ok', true, 'metric', p_metric, 'n', v_n, 'eligible_n', v_eligible,
      'rate', case when coalesce(v_eligible, 0) = 0 then null else round(v_n::numeric / v_eligible, 4) end,
      'suppressed', false, 'reason', null);
  end if;

  if p_metric in ('answer_distribution', 'rating_summary', 'text_responses') then
    select * into q from lv.campaign_questions cq where cq.id = p_question and cq.campaign_id = p_campaign;
    if q.id is null then return lv.err('lv_invalid_input', 'Choose a question of this Campaign.'); end if;
  end if;

  -- Free text: every answer, in random order, never with a person, time or submission.
  if (p_metric = 'text_responses' or p_metric = 'answer_distribution') and q.kind = 'text' then
    v_total := lv.question_total(p_campaign, p_question);
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'published');
    v_cells := (select coalesce(jsonb_agg(x.v order by random()), '[]'::jsonb) from (
                  select a.value #>> '{}' as v from lv.answers a join lv.submissions s on s.id = a.submission_id
                   where s.campaign_id = p_campaign and a.question_id = p_question) x);
    return jsonb_build_object('ok', true, 'metric', p_metric, 'question_id', p_question, 'kind', 'text',
      'n', v_total, 'texts_withheld', false, 'suppressed', false, 'texts', v_cells, 'responses', v_cells);
  end if;
  if p_metric = 'text_responses' then return lv.err('lv_invalid_input', 'text_responses needs a text question.'); end if;

  if p_metric = 'answer_distribution' then
    v_cells := lv.question_cells(p_campaign, p_question);
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'published');
    return jsonb_build_object('ok', true, 'metric', p_metric, 'question_id', p_question,
      'cells', lv.suppress_cells(v_cells, 1, false), 'withheld', false, 'reason', null);
  end if;

  if p_metric = 'rating_summary' then
    if q.kind <> 'rating' then return lv.err('lv_invalid_input', 'rating_summary needs a rating question.'); end if;
    select count(*), avg((a.value)::numeric) into v_n, v_mean
      from lv.answers a join lv.submissions s on s.id = a.submission_id
     where s.campaign_id = p_campaign and a.question_id = p_question and jsonb_typeof(a.value) = 'number';
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, p_caller, p_metric, p_question, 'published');
    return jsonb_build_object('ok', true, 'metric', p_metric, 'question_id', p_question, 'n', v_n,
                              'mean', round(v_mean, 2), 'suppressed', false);
  end if;

  return lv.err('lv_invalid_input', 'Unknown metric.');
end;
$$;

-- ---------------------------------------------------------------- 3. per-question counts (000042 body, edits marked)
-- Same function as 000042 with: v_instant read from the plan; v_sensitive false when it holds; the minimum for free text
-- 1 when it holds; and the anonymous-filter refusal keyed on the raw anonymity, so it stays refused on every plan.
create or replace function lv.api_analytics_question(p_campaign uuid, p_question uuid, p_filter jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c record;
  q lv.campaign_questions;
  f record;
  v_gate jsonb;
  v_min int;
  v_text_min int;
  v_sensitive boolean;
  v_instant boolean;
  v_withhold_text boolean;
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
  -- The same gates as every results call (policy set, anonymous only after finishing unless results.instant), logged.
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

  v_instant := lv.results_instant(p_campaign);                           -- 000053
  v_sensitive := c.anonymity = 'anonymous' and not v_instant;            -- 000053
  -- Security review (2026-11-13): on anonymous Campaigns a filter lets two queries differ by a few people (or isolate
  -- free text), which the minimum cohort cannot fully stop. Filters stay on identified Campaigns only until a
  -- cohort-safe partition design exists. This holds on every plan, including results.instant (000053).
  if c.anonymity = 'anonymous' and v_filter is not null then             -- 000053: raw anonymity
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome) values (p_campaign, v_account, 'question_logic', p_question, 'suppressed');
    return lv.err('lv_invalid_input', 'Filtering results is not available on anonymous surveys.');
  end if;
  v_text_min := case when v_instant then 1 else coalesce((lv.policy_json('campaign.min_cohort'))::int, 5) end;   -- 000053
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
    v_withhold_text := v_answered < v_text_min and not v_instant;        -- 000053
    insert into lv.analytics_query_log (campaign_id, caller, metric, question_id, outcome)
    values (p_campaign, v_account, 'question_logic', p_question, case when v_withhold_text then 'suppressed' else 'published' end);
    if v_withhold_text then return v_out || jsonb_build_object('cells', '[]'::jsonb, 'texts', null, 'texts_withheld', true); end if;
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

-- ---------------------------------------------------------------- 4. individual responses of an anonymous survey
-- Offset pages over a stable hash order. Returns each submission's answers and an opaque row key; nothing that could
-- place a row in time or on a person (no account, name, timestamp, receipt id, submission id or arrival order).
create function lv.api_campaign_responses_anon(p_campaign uuid, p_limit int, p_offset int) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c lv.campaigns;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_rows jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null or c.status = 'draft' or lv.membership_of(v_account, c.hub_id) is null then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  if not lv.has_capability(v_account, c.hub_id, 'analytics.read') then
    return lv.err('lv_forbidden', 'Reading responses requires analytics.read.');
  end if;
  if c.anonymity <> 'anonymous' then
    return lv.err('lv_not_available', 'This survey is identified. Use its Responses list.');
  end if;
  if not lv.results_instant(c.id) then
    return lv.err_x('lv_entitlement_required', 'Individual responses on an anonymous survey need Creator Plus or a Team Hub.',
                    jsonb_build_object('product', 'creator_plus', 'feature', 'results.instant'));
  end if;

  select coalesce(jsonb_agg(r.j order by r.k), '[]'::jsonb) into v_rows
    from (
      select md5(s.id::text || c.id::text) as k, jsonb_build_object(
               'response_id', left(md5(s.id::text || c.id::text), 16),
               'answers', coalesce((
                 select jsonb_agg(jsonb_build_object('question_id', q.id, 'prompt', q.prompt, 'kind', q.kind, 'value', an.value) order by q.position)
                   from lv.answers an join lv.campaign_questions q on q.id = an.question_id
                  where an.submission_id = s.id), '[]'::jsonb)) as j
        from lv.submissions s
       where s.campaign_id = c.id
       order by md5(s.id::text || c.id::text) limit v_limit offset v_offset) r;

  -- Every read of anonymous individual responses is audited, on every page.
  perform lv.audit(v_account, c.hub_id, 'campaign.responses_viewed', c.id::text, jsonb_build_object('anonymous', true, 'offset', v_offset));
  insert into lv.analytics_query_log (campaign_id, caller, metric, outcome) values (c.id, v_account, 'individual_responses', 'published');
  return jsonb_build_object('ok', true, 'responses', v_rows,
    'total', (select count(*) from lv.submissions s where s.campaign_id = c.id));
end;
$$;

create function lv_api.lv_campaign_responses_anon(p_campaign uuid, p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_responses_anon(p_campaign, p_limit, p_offset); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- ---------------------------------------------------------------- 5. the flag the screens read
-- Respondents of an ANONYMOUS survey get campaign.results_instant so the start screen can say the creator sees results
-- as they come in. Managers get it for any survey, so the Results page can explain what it shows. Nobody else learns the
-- creator's plan (an identified survey's respondent view always says false).
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
    v_out := jsonb_set(v_out, '{campaign,results_instant}', to_jsonb(coalesce((
      select c.anonymity = 'anonymous' and lv.results_instant(c.id)
        from lv.campaigns c where c.join_code = upper(btrim(coalesce(p_join_code, '')))), false)));
  end if;
  return v_out;
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

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
  if coalesce((v->>'ok')::boolean, false) and v ? 'campaign' then
    v := jsonb_set(v, '{campaign,results_instant}', to_jsonb(coalesce((
      select lv.results_instant(c.id) and (coalesce((v->>'can_manage')::boolean, false) or c.anonymity = 'anonymous')
        from lv.campaigns c where c.id = p_campaign), false)));
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------- 6. grants: lv stays private; one new lv_api entry point
revoke all on function lv.results_instant(uuid), lv.analytics_core(uuid, uuid, text, uuid), lv.analytics_core_waiting(uuid, uuid, text, uuid),
  lv.api_analytics_question(uuid, uuid, jsonb), lv.api_campaign_responses_anon(uuid, int, int) from public;
revoke all on function lv_api.lv_campaign_responses_anon(uuid, int, int) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv.results_instant(uuid), lv.analytics_core(uuid, uuid, text, uuid), lv.analytics_core_waiting(uuid, uuid, text, uuid), lv.api_analytics_question(uuid, uuid, jsonb), lv.api_campaign_responses_anon(uuid, int, int) from anon';
    execute 'revoke all on function lv_api.lv_campaign_responses_anon(uuid, int, int) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function lv.results_instant(uuid), lv.analytics_core(uuid, uuid, text, uuid), lv.analytics_core_waiting(uuid, uuid, text, uuid), lv.api_analytics_question(uuid, uuid, jsonb), lv.api_campaign_responses_anon(uuid, int, int) from authenticated';
    execute 'grant execute on function lv_api.lv_campaign_responses_anon(uuid, int, int) to authenticated';
  end if;
end $$;

commit;
