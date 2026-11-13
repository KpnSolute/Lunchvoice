-- 47: the v2 question types (000047): plan gates, settings rules, per-answer checks, identity rules, results keys.
select set_config('t.file', '47_question_types', false);
begin;
select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Creator'); select lv_api.lv_my_context();
select t.put('me', t.q($$select lv.current_account_id()::text$$));
select t.put('qs', lv_api.lv_quick_survey_create('Types', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.put('qp', lv_api.lv_quick_survey_create('Pro types', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.put('qi', lv_api.lv_quick_survey_create('Types identified', 'link', 'identified', true) #>> '{campaign,campaign_id}');

-- Free: the four new free kinds work; settings are checked.
select t.check('free: face scale is allowed', t.code(lv_api.lv_campaign_question_add(t.id('qs'), 1, 'face_scale', 'How was it?', '{}')) = 'ok');
select t.put('dd', lv_api.lv_campaign_question_add(t.id('qs'), 2, 'dropdown', 'Which room?', '{"options":["A","B","C"]}') ->> 'question_id');
select t.check('free: dropdown needs 2+ different options', t.code(lv_api.lv_campaign_question_add(t.id('qs'), 3, 'dropdown', 'x', '{"options":["A","a"]}')) = 'lv_invalid_input');
select t.put('num', lv_api.lv_campaign_question_add(t.id('qs'), 4, 'number', 'How many?', '{"min":1,"max":10,"integer":true}') ->> 'question_id');
select t.check('free: number min above max is refused', t.code(lv_api.lv_campaign_question_add(t.id('qs'), 5, 'number', 'x', '{"min":9,"max":1}')) = 'lv_invalid_input');
select t.put('dt', lv_api.lv_campaign_question_add(t.id('qs'), 5, 'date', 'When?', '{"min":"2026-01-01"}') ->> 'question_id');
select t.check('free: a bad date bound is refused', t.code(lv_api.lv_campaign_question_add(t.id('qs'), 6, 'date', 'x', '{"min":"2026-02-30"}')) = 'lv_invalid_input');

-- Plus and Pro are entitlement-gated and name the plan.
select t.put('nps_try', lv_api.lv_campaign_question_add(t.id('qs'), 6, 'nps', 'Recommend us?', '{}')::text);
select t.check('gate: NPS on Free is lv_entitlement_required naming Creator Plus',
  t.code(t.get('nps_try')::jsonb) = 'lv_entitlement_required' and (t.get('nps_try')::jsonb #>> '{error,product}') = 'creator_plus');
select t.check('gate: a matrix on Free names Creator Pro',
  (lv_api.lv_campaign_question_add(t.id('qs'), 6, 'agree_grid', 'Rate', '{"rows":["a","b"]}') #>> '{error,product}') = 'creator_pro');
select t.check('gate: kind tier says free', (lv_api.lv_kind_tier() ->> 'tier') = 'free');

select t.as_pg();
insert into lv.entitlements (scope, account_id, family, product, source) values ('account', t.id('me'), 'creator_plus', 'creator_plus', 'grant');
select t.as_kpn(1, null, true, 'Creator');
select t.check('plus: kind tier says plus', (lv_api.lv_kind_tier() ->> 'tier') = 'plus');
select t.put('np', lv_api.lv_campaign_question_add(t.id('qs'), 6, 'nps', 'Recommend us?', '{"low_label":"No way","high_label":"Definitely"}') ->> 'question_id');
select t.check('plus: NPS allowed', t.get('np') is not null);
select t.put('ag', lv_api.lv_campaign_question_add(t.id('qs'), 7, 'agree_scale', 'I felt heard.', '{"points":7}') ->> 'question_id');
select t.check('plus: agree scale labels must match the points', t.code(lv_api.lv_campaign_question_add(t.id('qs'), 8, 'agree_scale', 'x', '{"points":5,"labels":["a","b"]}')) = 'lv_invalid_input');
select t.put('rk', lv_api.lv_campaign_question_add(t.id('qs'), 8, 'ranking', 'Rank these', '{"options":["Soup","Salad","Pasta"]}') ->> 'question_id');
select t.put('sl', lv_api.lv_campaign_question_add(t.id('qs'), 9, 'slider', 'How spicy?', '{"min":0,"max":10,"step":1,"min_label":"Mild","max_label":"Hot"}') ->> 'question_id');
select t.check('plus: a slider step that does not fit is refused', t.code(lv_api.lv_campaign_question_add(t.id('qs'), 10, 'slider', 'x', '{"min":0,"max":10,"step":3}')) = 'lv_invalid_input');
select t.check('plus: still no matrix', (lv_api.lv_campaign_question_add(t.id('qs'), 10, 'agree_grid', 'Rate', '{"rows":["a","b"]}') #>> '{error,product}') = 'creator_pro');
select t.check('plus: no quiz scoring',
  (lv_api.lv_campaign_question_update(t.get('dd')::uuid, null, 'single_choice', null, '{"options":["A","B"],"quiz":{"correct":["A"],"points":2}}') #>> '{error,code}') = 'lv_entitlement_required');

-- Identity kinds: refused on an anonymous survey, fine on an identified one.
select t.check('identity: contact refused on an anonymous survey', t.code(lv_api.lv_campaign_question_add(t.id('qs'), 10, 'contact', 'Your details', '{"fields":["name","email"]}')) = 'lv_invalid_input');
select t.put('ct', lv_api.lv_campaign_question_add(t.id('qi'), 1, 'contact', 'Your details', '{"fields":["name","email"]}') ->> 'question_id');
select t.check('identity: contact allowed on an identified survey', t.get('ct') is not null);
select t.as_pg();
select t.check('identity: switching to anonymous with an identity question is refused at publish',
  t.raises(format($q$update lv.campaigns set anonymity = 'anonymous' where id = %L::uuid$q$, t.get('qi')), '22023'));

-- Pro.
update lv.entitlements set family = 'creator_pro', product = 'creator_pro' where account_id = t.id('me') and family = 'creator_plus';
select t.as_kpn(1, null, true, 'Creator');
select t.check('pro: kind tier says pro', (lv_api.lv_kind_tier() ->> 'tier') = 'pro');
select t.put('gr', lv_api.lv_campaign_question_add(t.id('qp'), 1, 'agree_grid', 'Rate each', '{"points":5,"rows":["Food","Speed"]}') ->> 'question_id');
select t.put('ba', lv_api.lv_campaign_question_add(t.id('qp'), 2, 'before_after', 'Then and now', '{"points":5}') ->> 'question_id');
select t.put('pl', lv_api.lv_campaign_question_add(t.id('qp'), 3, 'price_ladder', 'Top price?', '{"prices":[5,10,15],"currency":"USD"}') ->> 'question_id');
select t.check('pro: prices must rise', t.code(lv_api.lv_campaign_question_add(t.id('qp'), 4, 'price_ladder', 'x', '{"prices":[10,5]}')) = 'lv_invalid_input');
select t.put('qz', lv_api.lv_campaign_question_add(t.id('qp'), 4, 'single_choice', 'Capital of France?', '{"options":["Paris","Rome"],"quiz":{"correct":["Paris"],"points":2}}') ->> 'question_id');
select t.check('pro: quiz needs a correct answer from the options', t.code(lv_api.lv_campaign_question_add(t.id('qp'), 5, 'single_choice', 'x', '{"options":["a","b"],"quiz":{"correct":["z"]}}')) = 'lv_invalid_input');
select t.put('fu', lv_api.lv_campaign_question_add(t.id('qi'), 2, 'file_upload', 'Attach proof', '{"max_mb":2,"types":["image","pdf"]}') ->> 'question_id');
select t.put('cn', lv_api.lv_campaign_question_add(t.id('qi'), 3, 'consent', 'Agree', '{"statement":"I agree to be contacted."}') ->> 'question_id');
select t.put('sg', lv_api.lv_campaign_question_add(t.id('qi'), 4, 'signature', 'Sign', '{}') ->> 'question_id');
select t.check('pro: identity kinds saved on the identified survey', t.get('fu') is not null and t.get('cn') is not null and t.get('sg') is not null);

-- Per-answer checks (the function).
select t.as_pg();
select t.check('answer: face 1-5', lv.check_answer_value('face_scale', '{}', '5') is null and lv.check_answer_value('face_scale', '{}', '6') is not null);
select t.check('answer: dropdown option', lv.check_answer_value('dropdown', '{"options":["A","B"]}', '"A"') is null and lv.check_answer_value('dropdown', '{"options":["A","B"]}', '"Z"') is not null);
select t.check('answer: number bounds and integer', lv.check_answer_value('number', '{"min":1,"max":10,"integer":true}', '4') is null
  and lv.check_answer_value('number', '{"min":1,"max":10,"integer":true}', '4.5') is not null and lv.check_answer_value('number', '{"min":1,"max":10}', '11') is not null);
select t.check('answer: date', lv.check_answer_value('date', '{"min":"2026-01-01"}', '"2026-05-01"') is null and lv.check_answer_value('date', '{"min":"2026-01-01"}', '"2025-05-01"') is not null);
select t.check('answer: nps 0-10', lv.check_answer_value('nps', '{}', '0') is null and lv.check_answer_value('nps', '{}', '11') is not null);
select t.check('answer: agree 7 points', lv.check_answer_value('agree_scale', '{"points":7}', '7') is null and lv.check_answer_value('agree_scale', '{}', '6') is not null);
select t.check('answer: ranking is a full permutation', lv.check_answer_value('ranking', '{"options":["a","b"]}', '["b","a"]') is null
  and lv.check_answer_value('ranking', '{"options":["a","b"]}', '["a","a"]') is not null and lv.check_answer_value('ranking', '{"options":["a","b"]}', '["a"]') is not null);
select t.check('answer: slider step', lv.check_answer_value('slider', '{"min":0,"max":10,"step":2}', '4') is null and lv.check_answer_value('slider', '{"min":0,"max":10,"step":2}', '5') is not null);
select t.check('answer: contact email shape', lv.check_answer_value('contact', '{"fields":["email"]}', '{"email":"a@b.co"}') is null
  and lv.check_answer_value('contact', '{"fields":["email"]}', '{"email":"nope"}') is not null and lv.check_answer_value('contact', '{"fields":["email"]}', '{"email":"a@b.co","phone":"1"}') is not null);
select t.check('answer: grid needs every row', lv.check_answer_value('agree_grid', '{"rows":["a","b"]}', '{"a":1,"b":5}') is null and lv.check_answer_value('agree_grid', '{"rows":["a","b"]}', '{"a":1}') is not null);
select t.check('answer: before and after', lv.check_answer_value('before_after', '{}', '{"before":2,"after":4}') is null and lv.check_answer_value('before_after', '{}', '{"before":2}') is not null);
select t.check('answer: file type and size', lv.check_answer_value('file_upload', '{"max_mb":1}', '{"path":"x/y","name":"a.png","size":1000,"type":"image/png"}') is null
  and lv.check_answer_value('file_upload', '{"max_mb":1}', '{"path":"x/y","name":"a.exe","size":1000,"type":"application/x-msdownload"}') is not null
  and lv.check_answer_value('file_upload', '{"max_mb":1}', '{"path":"x/y","name":"a.png","size":5000000,"type":"image/png"}') is not null);
select t.check('answer: consent must be true', lv.check_answer_value('consent', '{}', 'true') is null and lv.check_answer_value('consent', '{}', 'false') is not null);
select t.check('answer: signature needs a name', lv.check_answer_value('signature', '{}', '"Ada Lovelace"') is null and lv.check_answer_value('signature', '{}', '" "') is not null);
select t.check('answer: price is on the ladder or none', lv.check_answer_value('price_ladder', '{"prices":[5,10]}', '10') is null
  and lv.check_answer_value('price_ladder', '{"prices":[5,10]}', '"none"') is null and lv.check_answer_value('price_ladder', '{"prices":[5,10]}', '7') is not null);
select t.check('answer_matches: strings, lists, booleans', lv.answer_matches('dropdown', '"A"', '["A","B"]') and lv.answer_matches('multi_choice', '["x","A"]', '["A"]')
  and lv.answer_matches('yes_no', 'true', '["true"]') and not lv.answer_matches('dropdown', '"C"', '["A"]'));

-- Publish and answer through the real path: the trigger refuses a bad value, results keep identity out of cells.
select t.as_kpn(1, null, true, 'Creator');
select t.put('qk', lv_api.lv_campaign_question_add(t.id('qs'), 9, 'text', 'Anything else?', '{"optional":true}') ->> 'question_id');
-- trim the survey to what fits the limit of the free personal-space cap? creator plans have no cap row, so publish as is.
select t.check('publish: the survey publishes', t.code(lv_api.lv_campaign_activate(t.id('qs'))) = 'ok');
select t.put('code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('qs'))));
select t.as_anon();
select t.put('good', jsonb_build_array(
  jsonb_build_object('question_id', t.get('dd'), 'value', 'A'), jsonb_build_object('question_id', t.get('num'), 'value', 4),
  jsonb_build_object('question_id', t.get('dt'), 'value', '2026-05-01'), jsonb_build_object('question_id', t.get('np'), 'value', 9),
  jsonb_build_object('question_id', t.get('ag'), 'value', 6), jsonb_build_object('question_id', t.get('rk'), 'value', jsonb_build_array('Pasta','Soup','Salad')),
  jsonb_build_object('question_id', t.get('sl'), 'value', 7))::text);
-- face_scale (first question) is required too: add it by id.
select t.put('fs', t.q(format($q$select id::text from lv.campaign_questions where campaign_id = %L::uuid and kind = 'face_scale'$q$, t.get('qs'))));
select t.put('good2', (t.get('good')::jsonb || jsonb_build_array(jsonb_build_object('question_id', t.get('fs'), 'value', 4)))::text);
select t.check('submit: a valid answer to every type is accepted', t.code(lv_api.lv_guest_submit(t.get('code'), repeat('a', 40), t.get('good2')::jsonb)) = 'ok');
select t.check('submit: a value outside the options is refused', t.code(lv_api.lv_guest_submit(t.get('code'), repeat('b', 40),
  (t.get('good2')::jsonb - 0 || jsonb_build_array(jsonb_build_object('question_id', t.get('dd'), 'value', 'Z'))))) in ('lv_invalid_input'));
select t.as_pg();
select t.check('results: a ranking adds the first choice only', (lv.question_cells(t.id('qs'), t.id('rk'))) = '[{"key": "Pasta", "n": 1}]'::jsonb);
select t.check('results: NPS keys are the numbers', (lv.question_cells(t.id('qs'), t.id('np'))) = '[{"key": "9", "n": 1}]'::jsonb);

-- Pro survey: grid, before/after, price, quiz.
select t.as_kpn(1, null, true, 'Creator');
select t.put('qq', lv_api.lv_campaign_question_add(t.id('qp'), 5, 'text', 'Why?', '{"optional":true}') ->> 'question_id');
select t.check('pro: publishes', t.code(lv_api.lv_campaign_activate(t.id('qp'))) = 'ok');
select t.put('code2', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('qp'))));
select t.as_anon();
select t.check('submit: grid, before/after, price and a quiz answer are accepted', t.code(lv_api.lv_guest_submit(t.get('code2'), repeat('c', 40), jsonb_build_array(
  jsonb_build_object('question_id', t.get('gr'), 'value', jsonb_build_object('Food', 4, 'Speed', 2)),
  jsonb_build_object('question_id', t.get('ba'), 'value', jsonb_build_object('before', 2, 'after', 4)),
  jsonb_build_object('question_id', t.get('pl'), 'value', 10), jsonb_build_object('question_id', t.get('qz'), 'value', 'Paris')))) = 'ok');
select t.as_pg();
select t.check('results: a grid adds one key per statement', jsonb_array_length(lv.question_cells(t.id('qp'), t.id('gr'))) = 2);
rollback;
