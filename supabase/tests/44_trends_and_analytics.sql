-- 44: Trends, plan limits, coarse response context and the premium results API (000044).
select set_config('t.file', '44_trends_and_analytics', false);
begin;
select t.trust_test_issuer();

-- ---------------------------------------------------------------- the map
select t.check('map: free 0, creator_plus 3, creator_pro 10, starter 3, team 5 Trends',
  (lv.plan_limit('free', 'trends.max'))::int = 0 and (lv.plan_limit('creator_plus', 'trends.max'))::int = 3
  and (lv.plan_limit('creator_pro', 'trends.max'))::int = 10 and (lv.plan_limit('starter', 'trends.max'))::int = 3
  and (lv.plan_limit('team', 'trends.max'))::int = 5);
select t.check('map: a Campaign pass includes 1 Trend', (lv.plan_limit('starter', 'trends.max_pass'))::int = 1 and (lv.plan_limit('team', 'trends.max_pass'))::int = 1);
select t.check('map: premium results are Team Hub and Creator Pro only',
  coalesce((lv.plan_limit('team', 'analytics.premium'))::boolean, false) and coalesce((lv.plan_limit('creator_pro', 'analytics.premium'))::boolean, false)
  and not coalesce((lv.plan_limit('starter', 'analytics.premium'))::boolean, false) and not coalesce((lv.plan_limit('creator_plus', 'analytics.premium'))::boolean, false));
select t.check('device class: coarse only',
  lv.device_class('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)') = 'mobile' and lv.device_class('Mozilla/5.0 (iPad; CPU OS 17_0)') = 'tablet'
  and lv.device_class('Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/120') = 'desktop' and lv.device_class(null) = 'unknown'
  and lv.device_class('Mozilla/5.0 (Linux; Android 14; Pixel) Mobile Safari') = 'mobile');

-- ---------------------------------------------------------------- a free person
select t.as_kpn(1, null, true, 'Creator'); select lv_api.lv_my_context();
select t.put('me', t.q($$select lv.current_account_id()::text$$));
select t.put('qs1', lv_api.lv_quick_survey_create('Lunch pulse', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.put('q1', lv_api.lv_campaign_question_add(t.id('qs1'), 1, 'rating', 'How was lunch?') ->> 'question_id');
select t.put('q2', lv_api.lv_campaign_question_add(t.id('qs1'), 2, 'single_choice', 'Where did you eat?', '{"options":["Hall","Desk","Outside"]}'::jsonb) ->> 'question_id');
select t.put('q3', lv_api.lv_campaign_question_add(t.id('qs1'), 3, 'yes_no', 'Would you eat here again?') ->> 'question_id');
select t.check('free: Trends are refused naming the limit',
  t.code(lv_api.lv_trend_create(null, 'Lunch over time', null, array[t.id('qs1')])) = 'lv_limit_reached');
select t.check('free: the list is empty and says the limit is 0',
  (lv_api.lv_trend_list(null) #>> '{limit,max}') = '0');
select t.check('free: premium results ask for Creator Pro', t.code(lv_api.lv_analytics_premium(t.id('qs1'))) in ('lv_entitlement_required', 'lv_lifecycle_invalid'));

-- ---------------------------------------------------------------- Creator Plus
select t.as_pg();
insert into lv.entitlements (scope, account_id, family, product, source) values ('account', t.id('me'), 'creator_plus', 'creator_plus', 'grant');
select t.as_kpn(1, null, true, 'Creator');
select t.check('plus: a Trend starts with a survey', t.code(lv_api.lv_trend_create(null, 'Lunch over time', 'Asked each term', array[t.id('qs1')])) = 'ok');
select t.put('tr', t.q($$select id::text from lv.trends where title = 'Lunch over time'$$));
select t.check('plus: one space per Trend (the personal space)', t.q(format($q$select h.kind from lv.trends x join lv.hubs h on h.id = x.hub_id where x.id = %L::uuid$q$, t.get('tr'))) = 'personal');
select t.check('plus: a survey is in at most one Trend',
  t.code(lv_api.lv_trend_create(null, 'Second', null, array[t.id('qs1')])) = 'lv_conflict');
select t.check('plus: a bad name is refused', t.code(lv_api.lv_trend_create(null, '   ', null, null)) = 'lv_invalid_input');
select t.check('plus: list shows the Trend and the allowance', (lv_api.lv_trend_list(null) #>> '{limit,max}') = '3'
  and jsonb_array_length(lv_api.lv_trend_list(null) -> 'trends') = 1);
select t.check('plus: the survey knows its Trend', (lv_api.lv_campaign_trend(t.id('qs1')) #>> '{trend,title}') = 'Lunch over time');
select t.check('plus: ask again waits until the survey has closed', t.code(lv_api.lv_trend_ask_again(t.id('qs1'))) = 'lv_lifecycle_invalid');
select t.check('plus: a survey that is in no Trend cannot be asked again', t.code(lv_api.lv_trend_ask_again(gen_random_uuid())) = 'lv_not_found');

-- Run 1: publish, six answers, then close.
select t.check('run 1 publishes', t.code(lv_api.lv_campaign_activate(t.id('qs1'))) = 'ok');
select t.put('code1', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('qs1'))));
select t.as_anon();
select t.check('run 1: ten guests answer (5 rate 4, 5 rate 2; 5 eat in the hall, 5 at a desk; 5 yes, 5 no)', (
  select bool_and(t.code(lv_api.lv_guest_submit(t.get('code1'), repeat(chr(97 + i), 40), jsonb_build_array(
    jsonb_build_object('question_id', t.get('q1'), 'value', case when i < 5 then 4 else 2 end),
    jsonb_build_object('question_id', t.get('q2'), 'value', case when i < 5 then 'Hall' else 'Desk' end),
    jsonb_build_object('question_id', t.get('q3'), 'value', i % 2 = 0)))) = 'ok') from generate_series(0, 9) i));
select t.as_kpn(1, null, true, 'Creator');
select t.check('run 1: the survey is open and anonymous, so its results are not released yet',
  t.code(lv_api.lv_analytics_summary(t.id('qs1'))) = 'lv_policy_undecided');
select t.as_pg();
update lv.campaigns set status = 'closed', closed_at = now(), activated_at = now() - interval '60 days' where id = t.id('qs1');
select t.as_kpn(1, null, true, 'Creator');
select t.check('run 1: closed with ten answers: the summary shows responses', (lv_api.lv_analytics_summary(t.id('qs1')) #>> '{responses,n}') = '10');
select t.check('run 1: completion is not shown without starts', (lv_api.lv_analytics_summary(t.id('qs1')) #>> '{completion,rate}') is null
  and (lv_api.lv_analytics_summary(t.id('qs1')) #>> '{completion,measured}') = 'false');

-- Ask again: a draft copy already in the Trend.
select t.check('ask again: makes a draft copy in the Trend', t.code(lv_api.lv_trend_ask_again(t.id('qs1'))) = 'ok');
select t.put('qs2', t.q($$select c.id::text from lv.trend_runs r join lv.campaigns c on c.id = r.campaign_id
                         where r.trend_id = $$ || quote_literal(t.get('tr')) || $$::uuid and c.status = 'draft'$$));
select t.check('ask again: the copy has the same questions and no responses',
  t.q(format($q$select count(*)::text from lv.campaign_questions where campaign_id = %L::uuid$q$, t.get('qs2'))) = '3'
  and t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid$q$, t.get('qs2'))) = '0');
select t.check('ask again: the copy has its own join code (none until published)', t.q(format($q$select (join_code is distinct from (select join_code from lv.campaigns where id = %L::uuid))::text from lv.campaigns where id = %L::uuid$q$, t.get('qs1'), t.get('qs2'))) = 'true');
select t.put('q2_1', t.q(format($q$select id::text from lv.campaign_questions where campaign_id = %L::uuid and position = 1$q$, t.get('qs2'))));
select t.put('q2_2', t.q(format($q$select id::text from lv.campaign_questions where campaign_id = %L::uuid and position = 2$q$, t.get('qs2'))));
select t.put('q2_3', t.q(format($q$select id::text from lv.campaign_questions where campaign_id = %L::uuid and position = 3$q$, t.get('qs2'))));
select t.check('ask again: a draft cannot be asked again twice from itself', t.code(lv_api.lv_trend_ask_again(t.id('qs2'))) = 'lv_lifecycle_invalid');

-- Run 2: three answers only (below the minimum), then close.
select t.check('run 2 publishes', t.code(lv_api.lv_campaign_activate(t.id('qs2'))) = 'ok');
select t.put('code2', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('qs2'))));
select t.as_anon();
select t.check('run 2: three guests answer', (
  select bool_and(t.code(lv_api.lv_guest_submit(t.get('code2'), repeat(chr(107 + i), 40), jsonb_build_array(
    jsonb_build_object('question_id', t.get('q2_1'), 'value', 5),
    jsonb_build_object('question_id', t.get('q2_2'), 'value', 'Hall'),
    jsonb_build_object('question_id', t.get('q2_3'), 'value', false)))) = 'ok') from generate_series(0, 2) i));
select t.as_pg();
update lv.campaigns set status = 'closed', closed_at = now() where id = t.id('qs2');
select t.as_kpn(1, null, true, 'Creator');
select t.put('trend', lv_api.lv_trend_get(t.id('tr'))::text);
select t.check('trend: two runs in time order with their answer counts',
  jsonb_array_length(t.get('trend')::jsonb -> 'runs') = 2 and (t.get('trend')::jsonb #>> '{runs,0,campaign_id}') = t.get('qs1')
  and (t.get('trend')::jsonb #>> '{runs,0,responses,n}') = '10');
select t.check('trend: run 2 has three answers, below the minimum: its count is null and suppressed, never 0',
  (t.get('trend')::jsonb #>> '{runs,1,responses,n}') is null and (t.get('trend')::jsonb #>> '{runs,1,responses,suppressed}') = 'true');
select t.check('trend: the three repeated questions are compared',
  jsonb_array_length(t.get('trend')::jsonb -> 'questions') = 3);
select t.check('trend: the rating mean is released for run 1 and withheld (not zero) for run 2',
  (select (q #>> '{points,0,state}') = 'released' and (q #>> '{points,0,mean}')::numeric = 3.0
          and (q #>> '{points,1,state}') = 'withheld' and (q #> '{points,1,mean}') is null
     from jsonb_array_elements(t.get('trend')::jsonb -> 'questions') q where q ->> 'kind' = 'rating'));
select t.check('trend: choice shares are given for run 1 and absent for withheld run 2',
  (select (q #>> '{points,0,state}') = 'released' and (q #>> '{points,1,state}') = 'withheld'
     from jsonb_array_elements(t.get('trend')::jsonb -> 'questions') q where q ->> 'kind' = 'single_choice'));
select t.check('trend: nothing in the Trend response is a per-person row',
  t.get('trend') !~ '(account_id|session|receipt|guest_token)');

-- Premium gate and the device counters.
select t.check('plus: premium results ask for Creator Pro', t.code(lv_api.lv_analytics_premium(t.id('qs1'))) = 'lv_entitlement_required'
  and (lv_api.lv_analytics_premium(t.id('qs1')) #>> '{error,product}') = 'creator_pro');
select t.check('plus: the cross-tab asks for Creator Pro too', t.code(lv_api.lv_analytics_crosstab(t.id('qs1'), t.id('q2'), t.id('q3'))) = 'lv_entitlement_required');
select t.check('plus: CSV export of released results is allowed on a paid Creator plan', t.code(lv_api.lv_analytics_export(t.id('qs1'))) = 'ok');

-- Device capture is a counter, never a header.
select t.as_pg();
select t.check('device: the header-less guest answers (10) were counted as unknown, with no per-response row',
  coalesce((select sum(n) from lv.campaign_response_context where campaign_id = t.id('qs1') and dimension = 'device' and value = 'unknown'), 0) = 10);
select t.check('device: the counter table holds no response or account columns',
  (select count(*) from information_schema.columns where table_schema = 'lv' and table_name = 'campaign_response_context'
     and column_name in ('submission_id', 'receipt_id', 'account_id', 'user_agent', 'ip')) = 0);

-- ---------------------------------------------------------------- Creator Pro: premium
select t.put('pro_before', (lv_api.lv_trend_list(null) #>> '{limit,max}'));
select t.as_pg();
update lv.entitlements set family = 'creator_pro', product = 'creator_pro' where account_id = t.id('me') and family = 'creator_plus';
select t.as_kpn(1, null, true, 'Creator');
select t.check('pro: ten Trends allowed', (lv_api.lv_trend_list(null) #>> '{limit,max}') = '10');
select t.as_pg();
-- Spread the ten answers over two days and give the counters a mix, so the released path is exercised.
update lv.submissions set created_at = created_at - interval '1 day'
 where id in (select id from lv.submissions where campaign_id = t.id('qs1') order by id limit 5);
delete from lv.campaign_response_context where campaign_id = t.id('qs1') and dimension in ('device', 'source');
insert into lv.campaign_response_context (campaign_id, dimension, value, n) values
  (t.id('qs1'), 'device', 'mobile', 5), (t.id('qs1'), 'device', 'desktop', 5), (t.id('qs1'), 'source', 'link', 5), (t.id('qs1'), 'source', 'qr', 5);
select t.as_kpn(1, null, true, 'Creator');
select t.put('prem', lv_api.lv_analytics_premium(t.id('qs1'))::text);
select t.check('pro: responses over time are released (5 + 5 over two days)',
  (t.get('prem')::jsonb #>> '{over_time,cells,0,n}') = '5' and (t.get('prem')::jsonb #>> '{over_time,withheld}') = 'false');
select t.check('pro: device and source are coarse buckets only',
  (select bool_and(x ->> 'key' in ('mobile', 'tablet', 'desktop', 'unknown')) from jsonb_array_elements(t.get('prem')::jsonb #> '{device,cells}') x)
  and (select bool_and(x ->> 'key' in ('link', 'qr', 'code', 'discord', 'unknown')) from jsonb_array_elements(t.get('prem')::jsonb #> '{source,cells}') x));
select t.check('pro: run 2 (three answers) is withheld whole, not zero',
  (lv_api.lv_analytics_premium(t.id('qs2')) #>> '{over_time,withheld}') = 'true' or (select bool_and((x ->> 'suppressed')::boolean) from jsonb_array_elements(lv_api.lv_analytics_premium(t.id('qs2')) #> '{over_time,cells}') x));

-- Cross-tab: ten answers over three rooms; the 5/5 split makes single-answer rows, so it is withheld; a dominant row is withheld.
select t.check('crosstab: two choice questions of an anonymous survey with small cells are withheld whole',
  (lv_api.lv_analytics_crosstab(t.id('qs1'), t.id('q2'), t.id('q3')) ->> 'withheld') = 'true'
  and jsonb_array_length(lv_api.lv_analytics_crosstab(t.id('qs1'), t.id('q2'), t.id('q3')) -> 'cells') = 0);
select t.check('crosstab: a rating question is refused', t.code(lv_api.lv_analytics_crosstab(t.id('qs1'), t.id('q1'), t.id('q3'))) = 'lv_invalid_input');
select t.check('crosstab: the same question twice is refused', t.code(lv_api.lv_analytics_crosstab(t.id('qs1'), t.id('q2'), t.id('q2'))) = 'lv_invalid_input');

-- A larger identified-style check of the safe path: 12 answers spread over two questions, all cells >= 5 is not
-- possible with dominance rules, so test that a balanced 2x2 of 6/6/6/6 is released.
select t.as_kpn(1, null, true, 'Creator');
select t.put('qs3', lv_api.lv_quick_survey_create('Balanced', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.put('a', lv_api.lv_campaign_question_add(t.id('qs3'), 1, 'single_choice', 'Team', '{"options":["A","B"]}'::jsonb) ->> 'question_id');
select t.put('b', lv_api.lv_campaign_question_add(t.id('qs3'), 2, 'yes_no', 'Happy?') ->> 'question_id');
select lv_api.lv_campaign_activate(t.id('qs3'));
select t.put('code3', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('qs3'))));
select t.as_pg();
update lv.policy set value = '100'::jsonb where key = 'participation.guest_rate_per_minute';
select t.as_anon();
select t.check('crosstab: 24 answers in a balanced 2x2', (
  select bool_and(t.code(lv_api.lv_guest_submit(t.get('code3'), repeat(chr(65 + i), 20) || repeat('z', 20), jsonb_build_array(
    jsonb_build_object('question_id', t.get('a'), 'value', case when i % 2 = 0 then 'A' else 'B' end),
    jsonb_build_object('question_id', t.get('b'), 'value', (i / 2) % 2 = 0)))) = 'ok') from generate_series(0, 23) i));
select t.as_pg();
update lv.campaigns set status = 'closed', closed_at = now() where id = t.id('qs3');
select t.as_kpn(1, null, true, 'Creator');
select t.check('crosstab: a balanced table with every cell >= 5 is released',
  (lv_api.lv_analytics_crosstab(t.id('qs3'), t.id('a'), t.id('b')) ->> 'withheld') = 'false'
  and jsonb_array_length(lv_api.lv_analytics_crosstab(t.id('qs3'), t.id('a'), t.id('b')) -> 'cells') = 4);

-- ---------------------------------------------------------------- limits and lapse
select t.check('pro: add the other surveys to Trends up to the limit', t.code(lv_api.lv_trend_add(t.id('tr'), t.id('qs3'))) = 'ok');
select t.as_pg();
update lv.entitlements set ends_at = now() - interval '1 minute', starts_at = now() - interval '1 day' where account_id = t.id('me');
select t.as_kpn(1, null, true, 'Creator');
select t.check('lapse: the Trend stays readable', t.code(lv_api.lv_trend_get(t.id('tr'))) = 'ok' and t.code(lv_api.lv_trend_list(null)) = 'ok');
select t.check('lapse: the limit is 0 and the list says it is over', (lv_api.lv_trend_list(null) #>> '{limit,max}') = '0'
  and (lv_api.lv_trend_list(null) #>> '{limit,over}') = 'true');
select t.check('lapse: creating a Trend is refused', t.code(lv_api.lv_trend_create(null, 'Another', null, null)) = 'lv_limit_reached');
select t.check('lapse: adding a survey is refused', t.code(lv_api.lv_trend_add(t.id('tr'), t.id('qs3'))) in ('lv_limit_reached', 'lv_conflict'));
select t.put('qs4', lv_api.lv_quick_survey_create('Loose', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.check('lapse: adding a new survey is refused', t.code(lv_api.lv_trend_add(t.id('tr'), t.id('qs4'))) = 'lv_limit_reached');
select t.check('lapse: asking again is refused', t.code(lv_api.lv_trend_ask_again(t.id('qs1'))) = 'lv_limit_reached');
select t.check('lapse: renaming still works', t.code(lv_api.lv_trend_update(t.id('tr'), 'Lunch, termly', null)) = 'ok');
select t.check('lapse: removing a survey from the Trend still works and deletes nothing',
  t.code(lv_api.lv_trend_remove(t.id('tr'), t.id('qs3'))) = 'ok' and t.q(format($q$select count(*)::text from lv.campaigns where id = %L::uuid$q$, t.get('qs3'))) = '1');
select t.check('lapse: premium results are refused again', t.code(lv_api.lv_analytics_premium(t.id('qs1'))) = 'lv_entitlement_required');
select t.check('lapse: deleting the Trend removes only the grouping', t.code(lv_api.lv_trend_delete(t.id('tr'))) = 'ok'
  and t.q(format($q$select count(*)::text from lv.campaigns where id = %L::uuid$q$, t.get('qs1'))) = '1' and t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid$q$, t.get('qs1'))) = '10');

-- ---------------------------------------------------------------- someone else
select t.as_kpn(2, null, true, 'Stranger'); select lv_api.lv_my_context();
select t.check('other: a stranger cannot read a Trend', t.code(lv_api.lv_trend_get(t.id('tr'))) = 'lv_not_found');
select t.check('other: a stranger cannot read a survey summary', t.code(lv_api.lv_analytics_summary(t.id('qs1'))) = 'lv_not_found');
select t.check('other: a stranger cannot ask again', t.code(lv_api.lv_trend_ask_again(t.id('qs1'))) = 'lv_not_found');

-- ---------------------------------------------------------------- the player reports a source, once
select t.as_anon();
select t.put('rec', t.q($$select receipt_id::text from lv.guest_participation where campaign_id = $$ || quote_literal(t.get('qs3')) || $$::uuid limit 1$$));
select t.check('context: a bad source is refused', t.code(lv_api.lv_response_context(t.id('rec'), 'carrier-pigeon', 30)) = 'lv_invalid_input');
select t.check('context: the first report is recorded', (lv_api.lv_response_context(t.id('rec'), 'qr', 30) ->> 'recorded') = 'true');
select t.check('context: the second report for the same receipt is ignored', (lv_api.lv_response_context(t.id('rec'), 'link', 700) ->> 'recorded') = 'false');
select t.check('context: an unknown receipt is not found', t.code(lv_api.lv_response_context(gen_random_uuid(), 'qr', 30)) = 'lv_not_found');
select t.check('context: starting a closed survey is not found', t.code(lv_api.lv_response_started(t.id('qs3'))) = 'lv_not_found');

-- ---------------------------------------------------------------- grants
select t.as_pg();
select t.check('grants: anon can call only the two player context functions among the new ones',
  has_function_privilege('anon', 'lv_api.lv_response_context(uuid, text, int)', 'execute')
  and has_function_privilege('anon', 'lv_api.lv_response_started(uuid)', 'execute')
  and not has_function_privilege('anon', 'lv_api.lv_trend_get(uuid)', 'execute')
  and not has_function_privilege('anon', 'lv_api.lv_analytics_summary(uuid)', 'execute')
  and not has_function_privilege('anon', 'lv_api.lv_analytics_premium(uuid)', 'execute'));
select t.check('grants: no new table is reachable by the API roles',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'lv' and c.relname in ('trends', 'trend_runs', 'campaign_response_context', 'response_context_marks')
      and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select'))) = 0);
select t.check('grants: row level security is on for every new table',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'lv' and c.relname in ('trends', 'trend_runs', 'campaign_response_context', 'response_context_marks') and c.relrowsecurity) = 4);

-- ---------------------------------------------------------------- a Starter Hub
select t.as_kpn(10, 'hubowner@example.invalid', true, 'Hub Owner'); select lv_api.lv_my_context();
select t.put('acc10', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('acc10'));
select t.as_kpn(10);
select t.check('hub: a Starter Hub is created', t.code(lv_api.lv_hub_create('trend-hub', 'Trend Hub')) = 'ok');
select t.put('hub', t.q($$select id::text from lv.hubs where slug = 'trend-hub'$$));
select t.check('hub: the Starter limit is 3 Trends', (lv_api.lv_trend_list(t.id('hub')) #>> '{limit,max}') = '3');
select t.check('hub: the owner creates a Trend', t.code(lv_api.lv_trend_create(t.id('hub'), 'Weekly menu rating', null, null)) = 'ok');
select t.put('htr', t.q($$select id::text from lv.trends where title = 'Weekly menu rating'$$));
select t.check('hub: a survey from another space cannot be added', t.code(lv_api.lv_trend_add(t.id('htr'), t.id('qs4'))) in ('lv_invalid_input', 'lv_not_found'));
select t.as_kpn(2);
select t.check('hub: a non-member cannot read the Hub Trend', t.code(lv_api.lv_trend_get(t.id('htr'))) = 'lv_not_found');
select t.check('hub: a non-member cannot create a Trend there', t.code(lv_api.lv_trend_create(t.id('hub'), 'Nope', null, null)) = 'lv_not_found');
rollback;
