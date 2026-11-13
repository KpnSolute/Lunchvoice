-- 52: a signed-in respondent may answer under a chosen name; never on anonymous answers; label only.
select set_config('t.file', '52_respondent_display_name', false);
begin;
select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('id', lv_api.lv_quick_survey_create('Named', 'link', 'identified', true) #>> '{campaign,campaign_id}');
select lv_api.lv_campaign_question_add(t.id('id'), 1, 'rating', 'How was it?', '{}'::jsonb);
select t.put('qid', t.q(format($q$select id from lv.campaign_questions where campaign_id = %L::uuid$q$, t.get('id'))));
select t.check('publish identified', t.code(lv_api.lv_campaign_activate(t.id('id'))) = 'ok');
select t.put('anon', lv_api.lv_quick_survey_create('Hidden', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select lv_api.lv_campaign_question_add(t.id('anon'), 1, 'rating', 'How was it?', '{}'::jsonb);
select t.put('aq', t.q(format($q$select id from lv.campaign_questions where campaign_id = %L::uuid$q$, t.get('anon'))));
select t.check('publish anonymous', t.code(lv_api.lv_campaign_activate(t.id('anon'))) = 'ok');

-- Identified: a chosen name is cleaned and stored, tagged as a member's.
select t.as_kpn(2, null, true, 'Account Two'); select lv_api.lv_my_context();
select t.check('identified: submit with a name', t.code(lv_api.lv_submit_response(t.id('id'),
  jsonb_build_array(jsonb_build_object('question_id', t.get('qid'), 'value', 4)), '  Maurice   from  Corporate ')) = 'ok');
select t.as_pg();
select t.check('name is trimmed and collapsed', (select guest_name from lv.submissions where campaign_id = t.id('id')) = 'Maurice from Corporate');
select t.check('it is a member answer, not a guest', (select not is_guest and account_id is not null from lv.submissions where campaign_id = t.id('id')));

-- The creator sees the chosen name, tagged as an account.
select t.as_kpn(1);
select t.check('responses show the chosen name as a member', (
  select r->>'name' = 'Maurice from Corporate' and r->>'kind' = 'member'
    from jsonb_array_elements(lv_api.lv_campaign_responses(t.id('id'))->'responses') r limit 1));

-- One answer per account still: a second try with another name keeps the first.
select t.as_kpn(2);
select t.check('second submit is a duplicate', (lv_api.lv_submit_response(t.id('id'),
  jsonb_build_array(jsonb_build_object('question_id', t.get('qid'), 'value', 1)), 'Someone Else') ->> 'duplicate')::boolean);
select t.as_pg();
select t.check('duplicate did not change the stored name', (select guest_name from lv.submissions where campaign_id = t.id('id')) = 'Maurice from Corporate');

-- A blank name stores nothing and the account name shows. The old two-argument call still works.
select t.as_kpn(3, null, true, 'Account Three'); select lv_api.lv_my_context();
select t.check('blank name accepted', t.code(lv_api.lv_submit_response(t.id('id'),
  jsonb_build_array(jsonb_build_object('question_id', t.get('qid'), 'value', 5)), '   ')) = 'ok');
select t.as_kpn(4, null, true, 'Account Four'); select lv_api.lv_my_context();
select t.check('two-argument call still works', t.code(lv_api.lv_submit_response(t.id('id'),
  jsonb_build_array(jsonb_build_object('question_id', t.get('qid'), 'value', 3)))) = 'ok');
select t.as_pg();
select t.check('no name stored for blank and two-argument answers', (select count(*) from lv.submissions where campaign_id = t.id('id') and guest_name is null) = 2);

-- Bad names are refused.
select t.as_kpn(5, null, true, 'Account Five'); select lv_api.lv_my_context();
select t.check('control characters refused', t.code(lv_api.lv_submit_response(t.id('id'),
  jsonb_build_array(jsonb_build_object('question_id', t.get('qid'), 'value', 3)), E'Ana\nBob')) = 'lv_invalid_input');
select t.check('41 characters refused', t.code(lv_api.lv_submit_response(t.id('id'),
  jsonb_build_array(jsonb_build_object('question_id', t.get('qid'), 'value', 3)), repeat('a', 41))) = 'lv_invalid_input');
select t.check('40 characters accepted', t.code(lv_api.lv_submit_response(t.id('id'),
  jsonb_build_array(jsonb_build_object('question_id', t.get('qid'), 'value', 3)), repeat('a', 40))) = 'ok');

-- Anonymous: a crafted call with a name stores nothing, even a bad one is ignored.
select t.as_kpn(6, null, true, 'Account Six'); select lv_api.lv_my_context();
select t.check('anonymous: crafted name accepted but ignored', t.code(lv_api.lv_submit_response(t.id('anon'),
  jsonb_build_array(jsonb_build_object('question_id', t.get('aq'), 'value', 4)), 'Name To Leak')) = 'ok');
select t.as_kpn(7, null, true, 'Account Seven'); select lv_api.lv_my_context();
select t.check('anonymous: even a control-character name is ignored', t.code(lv_api.lv_submit_response(t.id('anon'),
  jsonb_build_array(jsonb_build_object('question_id', t.get('aq'), 'value', 4)), E'x\ny')) = 'ok');
select t.as_pg();
select t.check('anonymous: no name and no account on any answer', (select count(*) from lv.submissions where campaign_id = t.id('anon')) = 2
  and (select count(*) from lv.submissions where campaign_id = t.id('anon') and (guest_name is not null or account_id is not null)) = 0);
select t.check('anonymous: the trigger still refuses a name written directly', t.raises(format(
  $q$update lv.submissions set guest_name = 'x' where campaign_id = %L::uuid$q$, t.get('anon'))));

-- Signed out cannot call it.
select t.as_anon();
select t.check('anon role cannot call the named submit', t.raises(format($q$select lv_api.lv_submit_response(%L::uuid, '[]'::jsonb, 'x')$q$, t.get('id'))));
rollback;
