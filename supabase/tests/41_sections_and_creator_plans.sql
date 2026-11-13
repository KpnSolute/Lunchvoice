-- 41: sections with "show only if" rules and the Creator plans (000041).
select set_config('t.file', '41_sections_and_creator_plans', false);
begin;
select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Creator'); select lv_api.lv_my_context();
select t.put('me', t.q($$select lv.current_account_id()::text$$));
select t.put('qs', lv_api.lv_quick_survey_create('Workspace feedback', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.put('q1', lv_api.lv_campaign_question_add(t.id('qs'), 1, 'single_choice', 'What is your role?',
  '{"options":["Staff","Manager","Corporate"]}'::jsonb) ->> 'question_id');

-- Free: no sections.
select t.check('plans: features say a free personal space cannot branch', (lv_api.lv_campaign_get(t.id('qs')) #>> '{features,branching}') = 'false');
select t.put('denied', lv_api.lv_campaign_question_add(t.id('qs'), 2, 'rating', 'How easy was it?',
  jsonb_build_object('section', jsonb_build_object('title', 'Your day', 'show_if', jsonb_build_object('question_id', t.get('q1'), 'any_of', jsonb_build_array('Staff', 'Manager')))))::text);
select t.check('plans: a section on the free plan is lv_entitlement_required naming Creator Plus',
  t.code(t.get('denied')::jsonb) = 'lv_entitlement_required' and (t.get('denied')::jsonb #>> '{error,product}') = 'creator_plus');

-- Creator Plus (a person's plan) unlocks it.
select t.as_pg();
select t.check('plans: a Creator plan cannot be attached to a Hub',
  t.raises(format($q$insert into lv.entitlements (scope, account_id, hub_id, family, product, source) select 'hub', %L::uuid, id, 'creator_plus', 'creator_plus', 'grant' from lv.hubs limit 1$q$, t.get('me')), '23514'));
insert into lv.entitlements (scope, account_id, family, product, source) values ('account', t.id('me'), 'creator_plus', 'creator_plus', 'grant');
select t.as_kpn(1, null, true, 'Creator');
select t.check('plans: features now allow branching and branding', (lv_api.lv_campaign_get(t.id('qs')) #>> '{features,branching}') = 'true'
  and (lv_api.lv_campaign_get(t.id('qs')) #>> '{features,branding}') = 'true');
select t.put('q2', lv_api.lv_campaign_question_add(t.id('qs'), 2, 'rating', 'How easy was it?',
  jsonb_build_object('section', jsonb_build_object('title', 'Your day', 'show_if', jsonb_build_object('question_id', t.get('q1'), 'any_of', jsonb_build_array('Staff', 'Manager'))))) ->> 'question_id');
select t.check('sections: Creator Plus adds a conditional section', t.get('q2') is not null);
select t.put('q3', lv_api.lv_campaign_question_add(t.id('qs'), 3, 'text', 'Which reports take the most time?',
  jsonb_build_object('section', jsonb_build_object('title', 'Across centers', 'show_if', jsonb_build_object('question_id', t.get('q1'), 'any_of', jsonb_build_array('Corporate'))))) ->> 'question_id');
select t.put('q4', lv_api.lv_campaign_question_add(t.id('qs'), 4, 'text', 'Anything else?',
  '{"optional":true,"section":{"title":"Last word"}}'::jsonb) ->> 'question_id');
select t.check('sections: a malformed rule is refused',
  t.code(lv_api.lv_campaign_question_update(t.id('q4'), null, null, null, '{"section":{"title":"x","show_if":{"question_id":"nope","any_of":[]}}}'::jsonb)) = 'lv_invalid_input');

-- Publishing checks the rules.
select lv_api.lv_campaign_question_update(t.id('q2'), null, null, null,
  jsonb_build_object('section', jsonb_build_object('title', 'Your day', 'show_if', jsonb_build_object('question_id', t.get('q1'), 'any_of', jsonb_build_array('Intern')))));
select t.check('publish: a rule matching a missing option is refused', t.code(lv_api.lv_campaign_activate(t.id('qs'))) = 'lv_invalid_input');
select lv_api.lv_campaign_question_update(t.id('q2'), null, null, null,
  jsonb_build_object('section', jsonb_build_object('title', 'Your day', 'show_if', jsonb_build_object('question_id', t.get('q1'), 'any_of', jsonb_build_array('Staff', 'Manager')))));
select t.check('publish: valid rules publish', t.code(lv_api.lv_campaign_activate(t.id('qs'))) = 'ok');
select t.put('code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('qs'))));

-- Answering follows the sections.
select t.as_anon();
select t.check('answers: staff answer their section only',
  t.code(lv_api.lv_guest_submit(t.get('code'), repeat('a', 40), jsonb_build_array(
    jsonb_build_object('question_id', t.get('q1'), 'value', 'Staff'), jsonb_build_object('question_id', t.get('q2'), 'value', 4)))) = 'ok');
select t.check('answers: corporate must answer the corporate section (required when shown)',
  t.code(lv_api.lv_guest_submit(t.get('code'), repeat('b', 40), jsonb_build_array(
    jsonb_build_object('question_id', t.get('q1'), 'value', 'Corporate')))) = 'lv_invalid_input');
select t.check('answers: an answer to a hidden section is refused',
  t.code(lv_api.lv_guest_submit(t.get('code'), repeat('c', 40), jsonb_build_array(
    jsonb_build_object('question_id', t.get('q1'), 'value', 'Corporate'), jsonb_build_object('question_id', t.get('q3'), 'value', 'Audits'),
    jsonb_build_object('question_id', t.get('q2'), 'value', 5)))) = 'lv_invalid_input');
select t.check('answers: corporate answering their section is accepted',
  t.code(lv_api.lv_guest_submit(t.get('code'), repeat('d', 40), jsonb_build_array(
    jsonb_build_object('question_id', t.get('q1'), 'value', 'Corporate'), jsonb_build_object('question_id', t.get('q3'), 'value', 'Audits')))) = 'ok');

-- A lapsed plan never breaks the published survey.
select t.as_pg();
update lv.entitlements set ends_at = now() - interval '1 minute', starts_at = now() - interval '1 day' where account_id = t.id('me') and family = 'creator_plus';
select t.as_anon();
select t.check('lapse: respondents still get the sections after the plan ends',
  t.code(lv_api.lv_guest_submit(t.get('code'), repeat('e', 40), jsonb_build_array(
    jsonb_build_object('question_id', t.get('q1'), 'value', 'Manager'), jsonb_build_object('question_id', t.get('q2'), 'value', 3)))) = 'ok');
rollback;
