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

-- ===================================================================================================
-- Security: the quiz key never reaches a respondent; uploads belong to their owner and follow the submit rules.
-- ===================================================================================================
select t.as_pg();
select t.check('quiz: the key is stored in its own column, not in config',
  (select quiz is not null and not (config ? 'quiz') from lv.campaign_questions where id = t.id('qz')));
select t.as_kpn(1, null, true, 'Creator');
select t.check('quiz: a manager reads the key through lv_campaign_quiz', (lv_api.lv_campaign_quiz(t.id('qp')) #>> array['quiz', t.get('qz'), 'correct', '0']) = 'Paris');
select t.check('quiz: the manager read of the survey itself carries no key', position('"quiz"' in lv_api.lv_campaign_get(t.id('qp'))::text) = 0 and position('Paris"]' in lv_api.lv_campaign_get(t.id('qp'))::text) = 0);
select t.as_kpn(2, null, true, 'Rae');
select lv_api.lv_my_context();
select t.check('quiz: a respondent cannot read the keys', t.code(lv_api.lv_campaign_quiz(t.id('qp'))) = 'lv_not_found');
select t.check('quiz: a respondent read of the survey has no key', position('"quiz"' in lv_api.lv_campaign_get(t.id('qp'))::text) = 0);
select t.check('quiz: a respondent lookup by code has no key', position('"quiz"' in coalesce(lv_api.lv_campaign_by_code(t.get('code2'))::text, '')) = 0);
select t.as_anon();
select t.check('quiz: a guest read has no key', position('"quiz"' in lv_api.lv_guest_campaign_get(t.get('code2'))::text) = 0 and position('"correct"' in lv_api.lv_guest_campaign_get(t.get('code2'))::text) = 0);

-- Quiz guard: the key is checked whenever the kind, settings or key change.
select t.as_kpn(1, null, true, 'Creator');
select t.put('qq1', lv_api.lv_campaign_question_add(t.id('qi'), 5, 'single_choice', 'Pick', '{"options":["a","b"],"quiz":{"correct":["a"],"points":2}}') ->> 'question_id');
select t.check('quiz guard: a valid key is accepted on a draft', t.get('qq1') is not null);
select t.check('quiz guard: changing the kind to text with a key is refused',
  t.code(lv_api.lv_campaign_question_update(t.id('qq1'), null, 'text', null, '{}')) = 'lv_invalid_input');
select t.as_pg();
select t.check('quiz guard: changing the kind straight in the table is refused (trigger, not wrapper)', t.raises(format($q$update lv.campaign_questions set kind = 'text' where id = %L::uuid$q$, t.get('qq1')), '22023'));
select t.check('quiz guard: options that no longer contain the right answer are refused', t.raises(format($q$update lv.campaign_questions set config = '{"options":["b","c"]}' where id = %L::uuid$q$, t.get('qq1')), '22023'));
select t.check('quiz guard: a quiz key on a text question is refused at the settings rule', lv.question_config_problem('text', '{"quiz":{"correct":["a"]}}') is not null);
update lv.campaign_questions set config = config || '{"quiz":null}' where id = t.id('qq1');
select t.check('quiz guard: a key can be cleared with null', (select quiz is null from lv.campaign_questions where id = t.id('qq1')));
select t.as_kpn(1, null, true, 'Creator');
select t.check('quiz results: withheld while few people answered', (lv_api.lv_quiz_results(t.id('qp')) ->> 'withheld') = 'true');

-- Uploads. A stand-in for Supabase Storage so the real checks run (this throwaway database has none).
select t.as_pg();
create schema storage;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text not null);
select t.as_kpn(1, null, true, 'Creator');
select t.put('me1', t.q($$select lv.current_account_id()::text$$));
select lv_api.lv_campaign_question_remove(t.id('ct')); select lv_api.lv_campaign_question_remove(t.id('cn')); select lv_api.lv_campaign_question_remove(t.id('sg')); select lv_api.lv_campaign_question_remove(t.id('qq1'));
select t.check('upload: the survey publishes', t.code(lv_api.lv_campaign_activate(t.id('qi'))) = 'ok');
select t.as_kpn(2, null, true, 'Rae');
select lv_api.lv_my_context();
select t.put('me2', t.q($$select lv.current_account_id()::text$$));
select t.put('mine', t.get('qi') || '/' || t.get('me2') || '/aa11-proof.png');
select t.put('theirs', t.get('qi') || '/' || t.get('me1') || '/aa11-proof.png');
select t.check('upload: I may write into my own folder', lv_storage.upload_writable(t.get('mine')));
select t.check('upload: I may not write into another person''s folder', not lv_storage.upload_writable(t.get('theirs')));
select t.check('upload: not for a survey that does not ask for a file', not lv_storage.upload_writable(t.get('qs') || '/' || t.get('me2') || '/x.png'));
select t.check('upload: an empty file name or a made-up survey is refused', not lv_storage.upload_writable(t.get('qi') || '/' || t.get('me2') || '/') and not lv_storage.upload_writable('nope/' || t.get('me2') || '/x.png'));
select t.put('fid', t.q(format($q$select id::text from lv.campaign_questions where campaign_id = %L::uuid and kind = 'file_upload'$q$, t.get('qi'))));
-- Submitting: the file must be mine, must exist, must not come from a guest.
select t.check('submit file: another person''s path is refused',
  t.code(lv_api.lv_submit_response(t.id('qi'), jsonb_build_array(jsonb_build_object('question_id', t.get('fid'), 'value', jsonb_build_object('path', t.get('theirs'), 'name', 'proof.png', 'size', 1000, 'type', 'image/png'))), 'Rae')) = 'lv_invalid_input');
select t.check('submit file: my path without an uploaded object is refused',
  t.code(lv_api.lv_submit_response(t.id('qi'), jsonb_build_array(jsonb_build_object('question_id', t.get('fid'), 'value', jsonb_build_object('path', t.get('mine'), 'name', 'proof.png', 'size', 1000, 'type', 'image/png'))), 'Rae')) = 'lv_invalid_input');
select t.as_pg();
insert into storage.objects (bucket_id, name) values ('survey-uploads', t.get('mine')), ('survey-uploads', t.get('theirs'));
select t.as_kpn(2, null, true, 'Rae');
select t.check('submit file: my own uploaded file is accepted',
  t.code(lv_api.lv_submit_response(t.id('qi'), jsonb_build_array(jsonb_build_object('question_id', t.get('fid'), 'value', jsonb_build_object('path', t.get('mine'), 'name', 'proof.png', 'size', 1000, 'type', 'image/png'))), 'Rae')) = 'ok');
select t.as_anon();
select t.put('code3', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('qi'))));
select t.check('submit file: a guest cannot attach a file',
  t.code(lv_api.lv_guest_submit(t.get('code3'), repeat('f', 40), jsonb_build_array(jsonb_build_object('question_id', t.get('fid'), 'value', jsonb_build_object('path', t.get('theirs'), 'name', 'proof.png', 'size', 1000, 'type', 'image/png'))), 'Guest')) <> 'ok');

-- Cap and suspension: five files per person per survey; a suspended account writes nothing.
select t.as_pg();
insert into storage.objects (bucket_id, name) select 'survey-uploads', t.get('qi') || '/' || t.get('me2') || '/f' || g || '.png' from generate_series(1, 4) g;
select t.as_kpn(2, null, true, 'Rae');
select t.check('upload: the sixth file for one survey is refused', not lv_storage.upload_writable(t.get('qi') || '/' || t.get('me2') || '/f6.png'));
select t.as_pg();
insert into lv.account_suspensions (account_id, reason) values (t.id('me2'), 'test');
select t.as_kpn(2, null, true, 'Rae');
select t.check('upload: a suspended account cannot write', not lv_storage.upload_writable(t.get('mine')));

rollback;
