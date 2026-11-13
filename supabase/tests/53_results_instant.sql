-- 53: results.instant (000053). Live results and individual responses on Creator Plus, Creator Pro and Team Hub /
-- Campaign Plus; the waiting rules on free, Starter Hub and Campaign Starter stay exactly as they were.
-- Founder decision 2026-11-13: "pro users should be able to see individual results from both guests and signed-in
-- users and it is not withheld for 4 or fewer responses to see analytics".
select set_config('t.file', '53_results_instant', false);
begin;
select t.trust_test_issuer();
update lv.policy set value = '5'::jsonb where key = 'campaign.min_cohort';
update lv.policy set value = '500'::jsonb where key = 'participation.guest_rate_per_minute';

create function t.gs3(p_code text, p_tag text, p_ans jsonb) returns jsonb language sql as $$
  select lv_api.lv_guest_submit(p_code, left(md5(p_tag) || md5(p_tag || 'x'), 40), p_ans) $$;
grant execute on function t.gs3(text, text, jsonb) to public;
create function t.ov(p_c text) returns jsonb language sql as $$ select lv_api.lv_analytics_overview(t.id(p_c)) $$;
grant execute on function t.ov(text) to public;

-- ===== the creator (account 1) starts on the FREE plan: two Quick Surveys, anonymous and identified ============
select t.as_kpn(1, null, true, 'Creator'); select lv_api.lv_my_context();
select t.put('me', t.q($$select lv.current_account_id()::text$$));
select t.put('an', lv_api.lv_quick_survey_create('Anon', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.put('an_r', lv_api.lv_campaign_question_add(t.id('an'), 1, 'rating', 'How was it?', '{}'::jsonb) ->> 'question_id');
select t.put('an_t', lv_api.lv_campaign_question_add(t.id('an'), 2, 'text', 'Anything else?', '{}'::jsonb) ->> 'question_id');
select t.check('publish anonymous', t.code(lv_api.lv_campaign_activate(t.id('an'))) = 'ok');
select t.put('idn', lv_api.lv_quick_survey_create('Named', 'link', 'identified', true) #>> '{campaign,campaign_id}');
select t.put('id_r', lv_api.lv_campaign_question_add(t.id('idn'), 1, 'rating', 'How was it?', '{}'::jsonb) ->> 'question_id');
select t.put('id_t', lv_api.lv_campaign_question_add(t.id('idn'), 2, 'text', 'Anything else?', '{}'::jsonb) ->> 'question_id');
select t.check('publish identified', t.code(lv_api.lv_campaign_activate(t.id('idn'))) = 'ok');
select t.as_pg();
select t.put('an_code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('an'))));
select t.put('id_code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('idn'))));

-- Two answers on each: one signed-in member (account 2) and one guest.
select t.as_kpn(2, null, true, 'Member Two'); select lv_api.lv_my_context();
select t.submit(t.id('an'), t.id('an_r'), '5'::jsonb, t.id('an_t'), 'Loved the soup');
select t.submit(t.id('idn'), t.id('id_r'), '4'::jsonb, t.id('id_t'), 'Nice room');
select t.as_anon();
select t.gs3(t.get('an_code'), 'g1', jsonb_build_array(jsonb_build_object('question_id', t.get('an_r'), 'value', 2), jsonb_build_object('question_id', t.get('an_t'), 'value', 'Too cold')));
select t.gs3(t.get('id_code'), 'g1', jsonb_build_array(jsonb_build_object('question_id', t.get('id_r'), 'value', 3), jsonb_build_object('question_id', t.get('id_t'), 'value', 'Noisy')));
select t.as_pg();
select t.check('setup: two answers on each survey',
  (select count(*) from lv.submissions where campaign_id = t.id('an')) = 2 and (select count(*) from lv.submissions where campaign_id = t.id('idn')) = 2);

-- ===== WAITING PLAN: a free creator keeps today's rules exactly =================================================
select t.as_kpn(1);
select t.check('free: results_instant is false for the manager', (lv_api.lv_campaign_get(t.id('an')) #>> '{campaign,results_instant}') = 'false');
select t.check('free: anonymous results wait for the survey to finish',
  t.code(t.ov('an')) = 'lv_policy_undecided' and t.code(lv_api.lv_analytics_query(t.id('an'), 'participant_count', null)) = 'lv_policy_undecided');
select t.check('free: per-question counts wait too',
  t.code(lv_api.lv_analytics_question(t.id('an'), t.id('an_r'))) = 'lv_policy_undecided');
select t.check('free: identified totals show from the first answer (as before)',
  (t.ov('idn') #>> '{participant_count,n}') = '1' and (t.ov('idn') #>> '{guest_n}') = '1');
select t.check('free: identified free text still waits for 5 answers',
  (t.ov('idn') #>> '{questions,1,result,texts_withheld}') = 'true');
select t.check('free: anonymous individual responses need a plan with live results',
  t.code(lv_api.lv_campaign_responses_anon(t.id('an'))) = 'lv_entitlement_required'
  and (lv_api.lv_campaign_responses_anon(t.id('an')) #>> '{error,product}') = 'creator_plus');
select t.check('free: the identified Responses list is unchanged and shows names',
  jsonb_array_length(lv_api.lv_campaign_responses(t.id('idn')) -> 'responses') = 2);
select t.check('free: closed anonymous survey under 5 answers is still withheld whole',
  t.code(lv_api.lv_campaign_close(t.id('an'))) = 'ok'
  and (t.ov('an') #>> '{participant_count,suppressed}') = 'true'
  and (t.ov('an') #>> '{questions,0,result,withheld}') = 'true'
  and (t.ov('an') #>> '{questions,1,result,texts_withheld}') = 'true');
-- Reopen a fresh anonymous survey for the live checks below.
select t.put('an2', lv_api.lv_quick_survey_create('Anon again', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.put('a2_r', lv_api.lv_campaign_question_add(t.id('an2'), 1, 'rating', 'How was it?', '{}'::jsonb) ->> 'question_id');
select t.put('a2_t', lv_api.lv_campaign_question_add(t.id('an2'), 2, 'text', 'Anything else?', '{}'::jsonb) ->> 'question_id');
select lv_api.lv_campaign_activate(t.id('an2'));
select t.as_pg();
select t.put('a2_code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('an2'))));
select t.as_kpn(2);
select t.submit(t.id('an2'), t.id('a2_r'), '5'::jsonb, t.id('a2_t'), 'Loved the soup');
select t.as_anon();
select t.gs3(t.get('a2_code'), 'g2', jsonb_build_array(jsonb_build_object('question_id', t.get('a2_r'), 'value', 2), jsonb_build_object('question_id', t.get('a2_t'), 'value', 'Too cold')));
select t.as_kpn(1);
select t.check('free: a second live anonymous survey with 2 answers is withheld', t.code(t.ov('an2')) = 'lv_policy_undecided');
select t.check('free: the respondent is not told results are live (flag false)',
  (lv_api.lv_guest_campaign_get(t.get('a2_code')) #>> '{campaign,results_instant}') = 'false');

-- ===== CREATOR PLUS: the same surveys now report live ===========================================================
select t.as_pg();
insert into lv.entitlements (scope, account_id, family, product, source) values ('account', t.id('me'), 'creator_plus', 'creator_plus', 'grant');
select t.as_kpn(1);
select t.check('plus: the manager is told results are live', (lv_api.lv_campaign_get(t.id('an2')) #>> '{campaign,results_instant}') = 'true');
select t.check('plus: anonymous totals show from the first answers, while live',
  t.code(t.ov('an2')) = 'ok' and (t.ov('an2') #>> '{participant_count,n}') = '1' and (t.ov('an2') #>> '{participant_count,suppressed}') = 'false'
  and (t.ov('an2') #>> '{guest_n}') = '1');
select t.check('plus: the anonymous rating shows its cells and mean (2 answers, not withheld)',
  (t.ov('an2') #>> '{questions,0,result,withheld}') = 'false'
  and jsonb_array_length(t.ov('an2') #> '{questions,0,result,cells}') = 2
  and (t.ov('an2') #>> '{questions,0,result,summary,mean}') = '3.50');
select t.check('plus: anonymous free text is included, with no metadata',
  (t.ov('an2') #>> '{questions,1,result,texts_withheld}') = 'false'
  and jsonb_array_length(t.ov('an2') #> '{questions,1,result,texts}') = 2
  and (t.ov('an2') #> '{questions,1,result,texts}') @> '"Too cold"'::jsonb
  and (t.ov('an2') #>> '{questions,1,result}') !~* '(account|receipt|at":|name)');
select t.check('plus: per-question counts show from the first answer',
  (lv_api.lv_analytics_question(t.id('an2'), t.id('a2_r')) ->> 'seen') = '2' and (lv_api.lv_analytics_question(t.id('an2'), t.id('a2_r')) ->> 'answered') = '2'
  and (lv_api.lv_analytics_question(t.id('an2'), t.id('a2_r')) ->> 'seen_withheld') = 'false');
select t.check('plus: per-question free text shows from the first answer',
  jsonb_array_length(lv_api.lv_analytics_question(t.id('an2'), t.id('a2_t')) -> 'texts') = 2
  and (lv_api.lv_analytics_question(t.id('an2'), t.id('a2_t')) ->> 'texts_withheld') = 'false');
select t.check('plus: a filter on an anonymous survey is refused (the Team survey below proves the reason)',
  t.code(lv_api.lv_analytics_question(t.id('an2'), t.id('a2_t'), jsonb_build_object('question_id', t.get('a2_r'), 'any_of', jsonb_build_array('5')))) = 'lv_invalid_input');

-- Individual responses of the anonymous survey: answers only, no person, time, receipt or arrival order.
select t.put('ra', lv_api.lv_campaign_responses_anon(t.id('an2'))::text);
select t.check('plus: both individual responses are listed (a member and a guest)',
  (t.get('ra')::jsonb ->> 'total') = '2' and jsonb_array_length(t.get('ra')::jsonb -> 'responses') = 2);
select t.check('plus: each row carries answers including free text',
  (t.get('ra')::jsonb #>> '{responses,0,answers,0,prompt}') = 'How was it?'
  and t.get('ra') ~ 'Loved the soup' and t.get('ra') ~ 'Too cold');
select t.check('plus: a row has only an opaque key and answers (no kind, name, time, account or receipt)',
  (select bool_and((select array_agg(k order by k) from jsonb_object_keys(r) k) = array['answers', 'response_id']) from jsonb_array_elements(t.get('ra')::jsonb -> 'responses') r)
  and t.get('ra') !~* '(receipt|"at"|created|guest|member|verified|"name"|account)');
select t.check('plus: the row key is not a submission id',
  (t.q(format($q$select count(*) from lv.submissions s where left(s.id::text, 16) in (select r->>'response_id' from jsonb_array_elements(%L::jsonb -> 'responses') r)$q$, t.get('ra'))))::int = 0);
select t.check('plus: the order is stable between reads and follows a hash, not submission time',
  (lv_api.lv_campaign_responses_anon(t.id('an2')) -> 'responses') = (t.get('ra')::jsonb -> 'responses')
  and (select string_agg(r->>'response_id', ',' order by ord) from jsonb_array_elements(t.get('ra')::jsonb -> 'responses') with ordinality x(r, ord))
    = t.q(format($q$select string_agg(left(md5(s.id::text || %L), 16), ',' order by md5(s.id::text || %L)) from lv.submissions s where s.campaign_id = %L::uuid$q$, t.get('an2'), t.get('an2'), t.get('an2'))));
select t.check('plus: pagination works (offset 1 returns the second row only)',
  jsonb_array_length(lv_api.lv_campaign_responses_anon(t.id('an2'), 1, 1) -> 'responses') = 1
  and (lv_api.lv_campaign_responses_anon(t.id('an2'), 1, 1) #>> '{responses,0,response_id}') = (t.get('ra')::jsonb #>> '{responses,1,response_id}'));
select t.check('plus: every read of anonymous responses is audited and logged',
  (t.q(format($q$select count(*) from lv.audit_events where action = 'campaign.responses_viewed' and target = %L and (detail->>'anonymous') = 'true'$q$, t.get('an2'))))::int >= 4
  and (t.q(format($q$select count(*) from lv.analytics_query_log where campaign_id = %L::uuid and metric = 'individual_responses'$q$, t.get('an2'))))::int >= 4);
select t.check('plus: the identified-only Responses list still refuses an anonymous survey',
  t.code(lv_api.lv_campaign_responses(t.id('an2'))) = 'lv_not_available');
select t.check('plus: the anonymous read refuses an identified survey', t.code(lv_api.lv_campaign_responses_anon(t.id('idn'))) = 'lv_not_available');

-- The respondent is told before answering, only on an anonymous survey.
select t.as_anon();
select t.check('plus: a guest of an anonymous survey is told results are live',
  (lv_api.lv_guest_campaign_get(t.get('a2_code')) #>> '{campaign,results_instant}') = 'true');
select t.check('plus: a guest of an identified survey is not told the creator''s plan (flag false)',
  (lv_api.lv_guest_campaign_get(t.get('id_code')) #>> '{campaign,results_instant}') = 'false');
select t.as_kpn(3, null, true, 'Member Three'); select lv_api.lv_my_context();
select t.check('plus: a signed-in respondent of an anonymous survey is told too',
  (lv_api.lv_campaign_get(t.id('an2')) #>> '{campaign,results_instant}') = 'true');
select t.check('plus: a signed-in respondent of an identified survey is not (flag false)',
  (lv_api.lv_campaign_get(t.id('idn')) #>> '{campaign,results_instant}') = 'false');
select t.check('plus: a respondent cannot read anonymous individual responses',
  t.code(lv_api.lv_campaign_responses_anon(t.id('an2'))) in ('lv_not_found', 'lv_forbidden'));

-- Identified on Creator Plus: live from the first answer, with names and tags kept.
select t.as_kpn(1);
select t.check('plus: identified free text shows from the first answer',
  (t.ov('idn') #>> '{questions,1,result,texts_withheld}') = 'false' and jsonb_array_length(t.ov('idn') #> '{questions,1,result,texts}') = 2);
select t.check('plus: identified individual responses keep the member and guest tags',
  (select count(*) from jsonb_array_elements(lv_api.lv_campaign_responses(t.id('idn')) -> 'responses') r where r->>'kind' = 'member' and r->>'name' = 'Member Two') = 1
  and (select count(*) from jsonb_array_elements(lv_api.lv_campaign_responses(t.id('idn')) -> 'responses') r where r->>'kind' = 'guest' and (r->>'verified')::boolean = false) = 1);

-- A closed anonymous survey on Creator Plus keeps reporting from the first answer too.
select t.check('plus: the survey closes', t.code(lv_api.lv_campaign_close(t.id('an2'))) = 'ok');
select t.check('plus: closed anonymous results with 2 answers are shown, not withheld',
  (t.ov('an2') #>> '{participant_count,n}') = '1' and (t.ov('an2') #>> '{questions,0,result,withheld}') = 'false');
select t.check('plus: closed anonymous individual responses still read', jsonb_array_length(lv_api.lv_campaign_responses_anon(t.id('an2')) -> 'responses') = 2);

-- ===== Creator Pro is the same; a lapsed plan falls back to the waiting rules =================================
select t.as_pg();
update lv.entitlements set family = 'creator_pro', product = 'creator_pro' where account_id = t.id('me') and family = 'creator_plus';
select t.as_kpn(1);
select t.check('pro: results are live too', (lv_api.lv_campaign_get(t.id('an')) #>> '{campaign,results_instant}') = 'true' and t.code(t.ov('an')) = 'ok');
select t.as_pg();
update lv.entitlements set starts_at = now() - interval '2 days', ends_at = now() - interval '1 minute' where account_id = t.id('me');
select t.as_kpn(1);
select t.check('lapsed: the waiting rules return (flag false, closed anonymous under 5 withheld)',
  (lv_api.lv_campaign_get(t.id('an')) #>> '{campaign,results_instant}') = 'false'
  and (t.ov('an') #>> '{participant_count,suppressed}') = 'true'
  and t.code(lv_api.lv_campaign_responses_anon(t.id('an'))) = 'lv_entitlement_required');

-- ===== HUB PLANS: Team is live, Starter waits ===================================================================
-- Account 4 owns a Team Hub, account 5 a Starter Hub. Each has an anonymous survey with one member's answer.
select t.as_kpn(4, null, true, 'Team Owner'); select lv_api.lv_my_context();
select t.put('o4', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(5, null, true, 'Starter Owner'); select lv_api.lv_my_context();
select t.put('o5', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('o4'), 'team');
select t.grant_credit(t.id('o5'), 'starter');
select t.as_kpn(4);
select t.put('hub4', lv_api.lv_hub_create('team-results', 'Team Results') ->> 'hub_id');
select t.put('c4', lv_api.lv_campaign_create(t.id('hub4'), 'Team anon', 'survey', 'anonymous') ->> 'campaign_id');
select t.put('c4_r', lv_api.lv_campaign_question_add(t.id('c4'), 1, 'rating', 'Rate', '{}'::jsonb) ->> 'question_id');
select t.put('c4_t', lv_api.lv_campaign_question_add(t.id('c4'), 2, 'text', 'Say', '{}'::jsonb) ->> 'question_id');
select t.put('c4_y', lv_api.lv_campaign_question_add(t.id('c4'), 3, 'yes_no', 'Again?', '{"optional":true}'::jsonb) ->> 'question_id');
select lv_api.lv_campaign_activate(t.id('c4'));
select t.submit(t.id('c4'), t.id('c4_r'), '4'::jsonb, t.id('c4_t'), 'Solid');
select t.check('team hub: a filter on an anonymous survey is still refused (no differencing)',
  t.code(lv_api.lv_analytics_question(t.id('c4'), t.id('c4_t'), jsonb_build_object('question_id', t.get('c4_y'), 'any_of', jsonb_build_array('true')))) = 'lv_invalid_input'
  and (lv_api.lv_analytics_question(t.id('c4'), t.id('c4_t'), jsonb_build_object('question_id', t.get('c4_y'), 'any_of', jsonb_build_array('true'))) #>> '{error,message}') ilike '%anonymous%');
select t.as_kpn(5);
select t.put('hub5', lv_api.lv_hub_create('starter-results', 'Starter Results') ->> 'hub_id');
select t.put('c5', lv_api.lv_campaign_create(t.id('hub5'), 'Starter anon', 'survey', 'anonymous') ->> 'campaign_id');
select t.put('c5_r', lv_api.lv_campaign_question_add(t.id('c5'), 1, 'rating', 'Rate', '{}'::jsonb) ->> 'question_id');
select t.put('c5_t', lv_api.lv_campaign_question_add(t.id('c5'), 2, 'text', 'Say', '{}'::jsonb) ->> 'question_id');
select lv_api.lv_campaign_activate(t.id('c5'));
select t.submit(t.id('c5'), t.id('c5_r'), '4'::jsonb, t.id('c5_t'), 'Solid');
select t.as_kpn(4);
select t.check('team hub: anonymous results are live with one answer (and a Team survey is flagged)',
  t.code(t.ov('c4')) = 'ok' and (t.ov('c4') #>> '{participant_count,n}') = '1' and (t.ov('c4') #>> '{questions,0,result,withheld}') = 'false'
  and (lv_api.lv_campaign_get(t.id('c4')) #>> '{campaign,results_instant}') = 'true');
select t.check('team hub: the single anonymous response can be read',
  jsonb_array_length(lv_api.lv_campaign_responses_anon(t.id('c4')) -> 'responses') = 1);
select t.as_kpn(5);
select t.check('starter hub: anonymous results still wait', t.code(t.ov('c5')) = 'lv_policy_undecided'
  and (lv_api.lv_campaign_get(t.id('c5')) #>> '{campaign,results_instant}') = 'false');
select t.check('starter hub: closed with fewer than 5 answers the anonymous results are withheld',
  t.code(lv_api.lv_campaign_close(t.id('c5'))) = 'ok' and (t.ov('c5') #>> '{participant_count,suppressed}') = 'true'
  and (t.ov('c5') #>> '{questions,0,result,withheld}') = 'true');
select t.check('starter hub: anonymous individual responses are not available',
  t.code(lv_api.lv_campaign_responses_anon(t.id('c5'))) = 'lv_entitlement_required');

-- ...but the Hub's survey creator can carry their own Creator Plus into a Starter Hub (feature_allowed: Hub OR person).
select t.as_pg();
insert into lv.entitlements (scope, account_id, family, product, source) values ('account', t.id('o5'), 'creator_plus', 'creator_plus', 'grant');
select t.as_kpn(5);
select t.check('creator plan in a Starter Hub: the survey this person created reports live',
  (lv_api.lv_campaign_get(t.id('c5')) #>> '{campaign,results_instant}') = 'true' and (t.ov('c5') #>> '{participant_count,n}') = '1');

-- ===== grants ===================================================================================================
select t.as_pg();
select t.check('grants: the anonymous-responses read is callable by signed-in people only',
  has_function_privilege('authenticated', 'lv_api.lv_campaign_responses_anon(uuid,int,int)', 'execute')
  and not has_function_privilege('anon', 'lv_api.lv_campaign_responses_anon(uuid,int,int)', 'execute'));
select t.check('grants: nothing in schema lv is newly callable by anon or authenticated',
  not has_function_privilege('anon', 'lv.results_instant(uuid)', 'execute') and not has_function_privilege('authenticated', 'lv.results_instant(uuid)', 'execute')
  and not has_function_privilege('anon', 'lv.analytics_core(uuid,uuid,text,uuid)', 'execute') and not has_function_privilege('authenticated', 'lv.analytics_core(uuid,uuid,text,uuid)', 'execute')
  and not has_function_privilege('anon', 'lv.analytics_core_waiting(uuid,uuid,text,uuid)', 'execute') and not has_function_privilege('authenticated', 'lv.analytics_core_waiting(uuid,uuid,text,uuid)', 'execute')
  and not has_function_privilege('anon', 'lv.api_campaign_responses_anon(uuid,int,int)', 'execute') and not has_function_privilege('authenticated', 'lv.api_campaign_responses_anon(uuid,int,int)', 'execute')
  and not has_function_privilege('anon', 'lv.api_analytics_question(uuid,uuid,jsonb)', 'execute'));
select t.check('entitlement map: results.instant is set for the live families only',
  (select array_agg(family order by family) from lv.plan_limits where key = 'results.instant' and value = 'true'::jsonb) = array['creator_plus', 'creator_pro', 'team']);
select t.as_anon();
select t.check('grants: a signed-out caller cannot read anonymous responses',
  t.raises(format($q$select lv_api.lv_campaign_responses_anon(%L::uuid)$q$, t.get('an2'))));
rollback;
