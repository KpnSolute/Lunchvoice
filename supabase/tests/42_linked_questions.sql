-- 42: Linked Questions (000042): show-if rules, end survey, the validator security fix, results seen/answered and
-- the Creator Quick Survey limits.
select set_config('t.file', '42_linked_questions', false);
begin;
select t.trust_test_issuer();
update lv.policy set value = '5'::jsonb where key = 'campaign.min_cohort';
update lv.policy set value = '500'::jsonb where key = 'participation.guest_rate_per_minute';

-- helpers (rolled back with the transaction)
create function t.fill(p text) returns text language plpgsql as $$
declare r record; s text := p;
begin for r in select k, v as val from t.vars loop s := replace(s, chr(64) || r.k || chr(64), r.val); end loop; return s; end $$;
grant execute on function t.fill(text) to public;
create function t.addq(p_c text, p_key text, p_pos int, p_kind text, p_prompt text, p_config text default '{}') returns text language plpgsql as $$
declare j jsonb;
begin
  j := lv_api.lv_campaign_question_add(t.id(p_c), p_pos, p_kind, p_prompt, t.fill(p_config)::jsonb);
  if j ->> 'question_id' is null then return j::text; end if;
  perform t.put(p_key, j ->> 'question_id'); return 'ok';
end $$;
grant execute on function t.addq(text, text, int, text, text, text) to public;
create function t.upd(p_key text, p_config text) returns text language sql as $$
  select t.code(lv_api.lv_campaign_question_update(t.id(p_key), null, null, null, t.fill(p_config)::jsonb)) $$;
grant execute on function t.upd(text, text) to public;
create function t.o(p_key text, p_v text) returns jsonb language sql as $$ select jsonb_build_object('question_id', t.get(p_key), 'value', p_v::jsonb) $$;
grant execute on function t.o(text, text) to public;
create function t.gs(p_code text, p_tag text, p_ans jsonb) returns jsonb language sql as $$
  select lv_api.lv_guest_submit(p_code, left(md5(p_tag) || md5(p_tag || 'x'), 40), p_ans) $$;
grant execute on function t.gs(text, text, jsonb) to public;
create function t.rej(p_code text, p_tag text, p_ans jsonb, p_like text) returns boolean language sql as $$
  select t.code(t.gs(p_code, p_tag, p_ans)) = 'lv_invalid_input' and (t.gs(p_code, p_tag || '2', p_ans) #>> '{error,message}') ilike p_like $$;
grant execute on function t.rej(text, text, jsonb, text) to public;
create function t.anyof(p_q text, p_vals text) returns text language sql as $$
  select '{"show_if":{"match":"all","conditions":[{"question_id":"@' || p_q || '@","op":"any_of","values":' || p_vals || '}]}}' $$;
grant execute on function t.anyof(text, text) to public;

-- ===== a free personal space cannot use logic ===========================================================
select t.as_kpn(1, null, true, 'Creator'); select lv_api.lv_my_context();
select t.put('me', t.q($$select lv.current_account_id()::text$$));
select t.put('c', lv_api.lv_quick_survey_create('MJCC preview', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.check('limits: a free account has 10 questions', (lv_api.lv_campaign_get(t.id('c')) #>> '{campaign,question_limit}') = '10');
select t.addq('c', 'q1', 1, 'single_choice', 'What is your role?', '{"options":["Food service staff","Lead","Manager","Center leadership","Department head","Corporate"]}');
select t.addq('c', 'q2', 2, 'multi_choice', 'Which parts did you try?', '{"options":["Guides","Guest food request","Menu planner","Reports"]}');
select t.put('denied', lv_api.lv_campaign_question_add(t.id('c'), 3, 'rating', 'How clear were the guides?', t.fill(t.anyof('q2', '["Guides"]'))::jsonb)::text);
select t.check('plans: a show-only-if rule on the free plan is lv_entitlement_required naming Creator Plus',
  t.code(t.get('denied')::jsonb) = 'lv_entitlement_required' and (t.get('denied')::jsonb #>> '{error,product}') = 'creator_plus');
select t.check('plans: a skip (end survey) on the free plan is refused too',
  t.upd('q1', '{"options":["Food service staff","Lead","Manager","Center leadership","Department head","Corporate"],"jumps":[{"when":"Corporate","to":"end"}]}') = 'lv_entitlement_required');
-- 11th question for a free account.
select t.as_pg();
select t.put('free_c', '');
select t.as_kpn(1);
select t.check('limits: a free account cannot add an 11th question', (
  select t.code(lv_api.lv_campaign_question_add(t.id('c'), 20 + g, 'text', 'Extra ' || g)) = 'lv_limit_reached'
    from generate_series(1, 1) g
    where (select count(*) from (select lv_api.lv_campaign_question_add(t.id('c'), 2 + g2, 'text', 'Filler ' || g2) from generate_series(1, 8) g2) z) = 8));

-- ===== Creator Plus: build the MJCC survey ===========================================================
select t.as_pg();
insert into lv.entitlements (scope, account_id, family, product, source) values ('account', t.id('me'), 'creator_plus', 'creator_plus', 'grant');
-- fresh survey so numbering matches the brief
select t.as_kpn(1, null, true, 'Creator');
select lv_api.lv_campaign_archive(t.id('c'));
select t.put('c', lv_api.lv_quick_survey_create('MJCC preview', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.check('limits: Creator Plus has 30 questions', (lv_api.lv_campaign_get(t.id('c')) #>> '{campaign,question_limit}') = '30');
select t.addq('c', 'q1', 1, 'single_choice', 'What is your role?', '{"options":["Food service staff","Lead","Manager","Center leadership","Department head","Corporate"]}');
select t.addq('c', 'q2', 2, 'multi_choice', 'Which parts did you try?',
  '{"options":["Guides","Guest food request","Menu planner","Reports"],"show_if":{"match":"all","conditions":[{"question_id":"@q1@","op":"any_of","values":["Food service staff","Lead","Manager"]}]}}');
select t.addq('c', 'q3', 3, 'rating', 'How clear were the guides?', t.anyof('q2', '["Guides"]'));
select t.addq('c', 'q4', 4, 'rating', 'How easy was the guest food request?', t.anyof('q2', '["Guest food request"]'));
select t.addq('c', 'q5', 5, 'rating', 'How easy was your first week?', t.anyof('q1', '["Food service staff","Lead","Manager"]'));
select t.addq('c', 'q6', 6, 'yes_no', 'Did you hit a problem?', t.anyof('q1', '["Food service staff","Lead","Manager"]'));
select t.addq('c', 'q7', 7, 'text', 'What went wrong?', t.anyof('q6', '["true"]'));
select t.addq('c', 'q8', 8, 'rating', 'How useful is the menu planner?', t.anyof('q1', '["Food service staff","Lead","Manager"]'));
select t.addq('c', 'q12', 9, 'rating', 'How well does it fit your center?', t.anyof('q1', '["Center leadership","Department head","Corporate"]'));
select t.addq('c', 'q15', 10, 'yes_no', 'Would you roll it out further?', t.anyof('q1', '["Center leadership","Department head","Corporate"]'));
select t.addq('c', 'q16', 11, 'text', 'Where would you roll it out first?',
  '{"show_if":{"match":"all","conditions":[{"question_id":"@q1@","op":"any_of","values":["Center leadership","Department head","Corporate"]},{"question_id":"@q15@","op":"any_of","values":["true"]}]}}');
select t.addq('c', 'q20', 12, 'text', 'What should corporate standardise?', t.anyof('q1', '["Corporate"]'));
select t.addq('c', 'q21', 13, 'text', 'Anything else?', '{"optional":true}');
select t.check('mjcc: all questions were added', (select count(*) from jsonb_each_text((select jsonb_object_agg(k, v) from t.vars where k like 'q%'))) >= 13);

-- ===== publish checks =================================================================================
select t.upd('q3', '{"show_if":{"match":"all","conditions":[{"question_id":"@q8@","op":"any_of","values":["true"]}]}}');
select t.check('publish: a rule that looks at a later question is refused', t.code(lv_api.lv_campaign_activate(t.id('c'))) = 'lv_invalid_input'
  and (lv_api.lv_campaign_activate(t.id('c')) #>> '{error,message}') ilike '%later question%');
select t.upd('q3', t.anyof('q2', '["Gone"]'));
select t.check('publish: a rule on an option that no longer exists is refused', t.code(lv_api.lv_campaign_activate(t.id('c'))) = 'lv_invalid_input'
  and (lv_api.lv_campaign_activate(t.id('c')) #>> '{error,message}') ilike '%not an option%');
select t.upd('q3', '{"show_if":{"match":"all","conditions":[{"question_id":"@q1@","op":"at_least","min":3}]}}');
select t.check('publish: a rating comparison on a choice question is refused', t.code(lv_api.lv_campaign_activate(t.id('c'))) = 'lv_invalid_input'
  and (lv_api.lv_campaign_activate(t.id('c')) #>> '{error,message}') ilike '%not a rating%');
select t.upd('q3', '{"show_if":{"match":"all","conditions":[{"question_id":"@q1@","op":"any_of","values":["Lead"]}]},"jumps":[{"when":"x","to":"end"}]}');
select t.check('publish: a skip on a rating question is refused at write time', t.upd('q3', '{"jumps":[{"when":"3","to":"end"}]}') = 'lv_invalid_input');
select t.check('write: a skip forward to a question is not in this release', t.upd('q1', '{"options":["Food service staff","Lead","Manager","Center leadership","Department head","Corporate"],"jumps":[{"when":"Lead","to":"@q8@"}]}') = 'lv_invalid_input');
select t.check('write: a malformed rule is refused', t.upd('q3', '{"show_if":{"match":"sometimes","conditions":[]}}') = 'lv_invalid_input');
select t.upd('q3', t.anyof('q2', '["Guides"]'));
select t.check('publish: the valid MJCC survey publishes', t.code(lv_api.lv_campaign_activate(t.id('c'))) = 'ok');
select t.as_pg();
select t.put('code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('c'))));

-- ===== answering follows the path (and the security fix) ===============================================
select t.as_anon();
select t.check('path: staff answer Q1, Q2, Q3, Q5, Q6, Q8',
  t.code(t.gs(t.get('code'), 'staff1', jsonb_build_array(t.o('q1', '"Lead"'), t.o('q2', '["Guides"]'), t.o('q3', '4'), t.o('q5', '3'), t.o('q6', 'false'), t.o('q8', '5')))) = 'ok');
select t.check('path: staff with a problem and the guest request',
  t.code(t.gs(t.get('code'), 'staff2', jsonb_build_array(t.o('q1', '"Manager"'), t.o('q2', '["Guides","Guest food request"]'), t.o('q3', '2'), t.o('q4', '3'), t.o('q5', '1'),
    t.o('q6', 'true'), t.o('q7', '"The planner was slow"'), t.o('q8', '2'), t.o('q21', '"thanks"')))) = 'ok');
select t.check('path: Corporate answers the leadership questions and Q20',
  t.code(t.gs(t.get('code'), 'corp1', jsonb_build_array(t.o('q1', '"Corporate"'), t.o('q12', '4'), t.o('q15', 'true'), t.o('q16', '"Ohio"'), t.o('q20', '"Reports"')))) = 'ok');
select t.check('path: a department head answers Q16 only after Yes on Q15',
  t.code(t.gs(t.get('code'), 'head1', jsonb_build_array(t.o('q1', '"Department head"'), t.o('q12', '5'), t.o('q15', 'false')))) = 'ok');
select t.check('reject: an answer to Q4 when Guest food request was not picked',
  t.rej(t.get('code'), 'r1', jsonb_build_array(t.o('q1', '"Lead"'), t.o('q2', '["Guides"]'), t.o('q3', '4'), t.o('q4', '2'), t.o('q5', '3'), t.o('q6', 'false'), t.o('q8', '5')), '%not shown%'));
select t.check('reject: staff cannot answer a leadership question',
  t.rej(t.get('code'), 'r2', jsonb_build_array(t.o('q1', '"Lead"'), t.o('q2', '["Guides"]'), t.o('q3', '4'), t.o('q5', '3'), t.o('q6', 'false'), t.o('q8', '5'), t.o('q12', '4')), '%not shown%'));
select t.check('reject: Q16 is hidden when Q15 is No',
  t.rej(t.get('code'), 'r3', jsonb_build_array(t.o('q1', '"Department head"'), t.o('q12', '5'), t.o('q15', 'false'), t.o('q16', '"Texas"')), '%not shown%'));
select t.check('reject: Q20 is for Corporate only',
  t.rej(t.get('code'), 'r4', jsonb_build_array(t.o('q1', '"Department head"'), t.o('q12', '5'), t.o('q15', 'false'), t.o('q20', '"x"')), '%not shown%'));
select t.check('reject: Q20 is required for Corporate (shown means required)',
  t.rej(t.get('code'), 'r5', jsonb_build_array(t.o('q1', '"Corporate"'), t.o('q12', '4'), t.o('q15', 'false')), '%missing answer%'));
select t.check('reject: Q7 is required when Q6 is Yes',
  t.rej(t.get('code'), 'r6', jsonb_build_array(t.o('q1', '"Lead"'), t.o('q2', '["Menu planner"]'), t.o('q5', '3'), t.o('q6', 'true'), t.o('q8', '5')), '%missing answer%'));
-- security fix: every shown answer is checked
select t.check('security: a single choice that is not an option is refused',
  t.rej(t.get('code'), 's1', jsonb_build_array(t.o('q1', '"Intern"')), '%choose one of the options%'));
select t.check('security: a single choice sent as a list is refused',
  t.rej(t.get('code'), 's2', jsonb_build_array(t.o('q1', '["Lead"]')), '%choose one of the options%'));
select t.check('security: a multi choice outside its options is refused',
  t.rej(t.get('code'), 's3', jsonb_build_array(t.o('q1', '"Lead"'), t.o('q2', '["Dessert bar"]'), t.o('q5', '3'), t.o('q6', 'false'), t.o('q8', '5')), '%only from the options%'));
select t.check('security: a multi choice with a repeated option is refused',
  t.rej(t.get('code'), 's4', jsonb_build_array(t.o('q1', '"Lead"'), t.o('q2', '["Reports","Reports"]'), t.o('q5', '3'), t.o('q6', 'false'), t.o('q8', '5')), '%each option once%'));
select t.check('security: an empty multi choice counts as missing',
  t.rej(t.get('code'), 's5', jsonb_build_array(t.o('q1', '"Lead"'), t.o('q2', '[]'), t.o('q5', '3'), t.o('q6', 'false'), t.o('q8', '5')), '%missing answer%'));
select t.check('security: yes/no must be true or false',
  t.rej(t.get('code'), 's6', jsonb_build_array(t.o('q1', '"Lead"'), t.o('q2', '["Reports"]'), t.o('q5', '3'), t.o('q6', '"maybe"'), t.o('q8', '5')), '%yes or no%'));
select t.check('security: a rating above the scale is refused',
  t.rej(t.get('code'), 's7', jsonb_build_array(t.o('q1', '"Lead"'), t.o('q2', '["Reports"]'), t.o('q5', '9'), t.o('q6', 'false'), t.o('q8', '5')), '%out of range%'));
select t.check('security: a rating sent as text is refused',
  t.rej(t.get('code'), 's8', jsonb_build_array(t.o('q1', '"Lead"'), t.o('q2', '["Reports"]'), t.o('q5', '"high"'), t.o('q6', 'false'), t.o('q8', '5')), '%must be a number%'));
select t.check('security: a text answer over 280 characters is refused',
  t.rej(t.get('code'), 's9', jsonb_build_array(t.o('q1', '"Lead"'), t.o('q2', '["Reports"]'), t.o('q5', '3'), t.o('q6', 'false'), t.o('q8', '5'), t.o('q21', to_jsonb(repeat('a', 281))::text)), '%280%'));
select t.check('security: a text answer must be text',
  t.rej(t.get('code'), 's10', jsonb_build_array(t.o('q1', '"Lead"'), t.o('q2', '["Reports"]'), t.o('q5', '3'), t.o('q6', 'false'), t.o('q8', '5'), t.o('q21', '42')), '%must be text%'));
select t.check('security: a question id from nowhere is refused',
  t.rej(t.get('code'), 's11', jsonb_build_array(t.o('q1', '"Lead"'), t.o('q2', '["Reports"]'), t.o('q5', '3'), t.o('q6', 'false'), t.o('q8', '5'),
    jsonb_build_object('question_id', gen_random_uuid(), 'value', 1)), '%not in this survey%'));
select t.check('security: an entry without a question id is refused',
  t.rej(t.get('code'), 's12', jsonb_build_array(t.o('q1', '"Lead"'), jsonb_build_object('value', 1)), '%question_id%'));
select t.check('security: answering the same question twice is refused',
  t.rej(t.get('code'), 's13', jsonb_build_array(t.o('q1', '"Lead"'), t.o('q1', '"Manager"'), t.o('q2', '["Reports"]'), t.o('q5', '3'), t.o('q6', 'false'), t.o('q8', '5')), '%answered once%'));
select t.check('security: hidden answers were never stored',
  t.q($$select count(*)::text from lv.answers a where a.question_id in ((select v::uuid from t.vars where k = 'q4'), (select v::uuid from t.vars where k = 'q16'), (select v::uuid from t.vars where k = 'q20'))$$) = '3');

-- unit checks of the per-kind function and the matcher
select t.as_pg();
select t.check('kinds: check_answer_value accepts good values and names bad ones',
  lv.check_answer_value('rating', '{}', '3') is null and lv.check_answer_value('rating', '{}', '0') = 'rating out of range'
  and lv.check_answer_value('single_choice', '{"options":["a","b"]}', '"a"') is null and lv.check_answer_value('single_choice', '{"options":["a","b"]}', '"c"') is not null
  and lv.check_answer_value('multi_choice', '{"options":["a","b","c"],"max":2}', '["a","b","c"]') = 'choose at most 2 options'
  and lv.check_answer_value('multi_choice', '{"options":["a","b"]}', '["a","b"]') is null
  and lv.check_answer_value('yes_no', '{}', 'true') is null and lv.check_answer_value('yes_no', '{}', '1') is not null
  and lv.check_answer_value('text', '{}', '"hi"') is null);
select t.check('kinds: answer_matches handles lists, booleans and empty values',
  lv.answer_matches('multi_choice', '["a","b"]', '["b"]') and lv.answer_matches('yes_no', 'true', '["true"]')
  and not lv.answer_matches('yes_no', 'false', '["true"]') and not lv.answer_matches('single_choice', 'null', '["a"]')
  and not lv.answer_matches('single_choice', '"a"', '["b"]'));

-- ===== campaigns without logic keep working, and now also refuse unknown and duplicate ids ================
select t.as_kpn(1);
select t.put('p', lv_api.lv_quick_survey_create('Plain', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.addq('p', 'p1', 1, 'rating', 'Rate it');
select t.addq('p', 'p2', 2, 'text', 'Say more', '{"optional":true}');
select t.check('plain: a Campaign without logic publishes', t.code(lv_api.lv_campaign_activate(t.id('p'))) = 'ok');
select t.as_pg();
select t.put('pcode', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('p'))));
select t.as_anon();
select t.check('plain: valid answers are accepted', t.code(t.gs(t.get('pcode'), 'pl1', jsonb_build_array(t.o('p1', '4')))) = 'ok');
select t.check('plain: a rating out of range is refused (as before)', t.rej(t.get('pcode'), 'pl2', jsonb_build_array(t.o('p1', '9')), '%out of range%'));
select t.check('plain: an answer to a question of another survey is refused',
  t.rej(t.get('pcode'), 'pl3', jsonb_build_array(t.o('p1', '4'), t.o('q1', '"Lead"')), '%not in this survey%'));
select t.check('plain: answering the same question twice is refused', t.rej(t.get('pcode'), 'pl4', jsonb_build_array(t.o('p1', '4'), t.o('p1', '5')), '%answered once%'));

-- ===== sections alone (000041) now get the core checks too ===============================================
select t.as_kpn(1);
select t.put('s', lv_api.lv_quick_survey_create('Sections', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.addq('s', 's1', 1, 'single_choice', 'Role?', '{"options":["Staff","Corporate"]}');
select t.addq('s', 's2', 2, 'rating', 'Ease?', '{"section":{"title":"Staff","show_if":{"question_id":"@s1@","any_of":["Staff"]}}}');
select t.addq('s', 's3', 3, 'yes_no', 'Again?', '{"optional":true}');
select t.check('sections: the Campaign publishes', t.code(lv_api.lv_campaign_activate(t.id('s'))) = 'ok');
select t.as_pg();
select t.put('scode', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('s'))));
select t.as_anon();
select t.check('sections: valid staff answers are accepted', t.code(t.gs(t.get('scode'), 'sc1', jsonb_build_array(t.o('s1', '"Staff"'), t.o('s2', '4'), t.o('s3', 'true')))) = 'ok');
select t.check('sections: a choice outside the options is refused', t.rej(t.get('scode'), 'sc2', jsonb_build_array(t.o('s1', '"Intern"')), '%choose one of the options%'));
select t.check('sections: a non-boolean yes/no is refused', t.rej(t.get('scode'), 'sc3', jsonb_build_array(t.o('s1', '"Staff"'), t.o('s2', '4'), t.o('s3', '"yes"')), '%yes or no%'));
select t.check('sections: an unknown question id is refused', t.rej(t.get('scode'), 'sc4', jsonb_build_array(t.o('s1', '"Staff"'), t.o('s2', '4'), jsonb_build_object('question_id', gen_random_uuid(), 'value', 1)), '%not in this survey%'));
select t.check('sections: a duplicate question id is refused', t.rej(t.get('scode'), 'sc5', jsonb_build_array(t.o('s1', '"Staff"'), t.o('s2', '4'), t.o('s2', '5')), '%answered once%'));

-- ===== elections keep the installed validator ============================================================
select t.as_pg();
alter table lv.campaigns drop constraint if exists campaigns_mode_check;
update lv.campaigns set mode = 'election' where id = t.id('p');
select t.as_pg();
select t.check('election: the installed validator still decides a valid ballot', lv.validate_answers(t.id('p'), jsonb_build_array(t.o('p1', '3'))) is null);
select t.check('election: unknown and duplicate question ids are refused here too',
  lv.validate_answers(t.id('p'), jsonb_build_array(t.o('p1', '3'), jsonb_build_object('question_id', gen_random_uuid(), 'value', 1))) is not null
  and lv.validate_answers(t.id('p'), jsonb_build_array(t.o('p1', '3'), t.o('p1', '4'))) is not null);
select t.as_pg();
select t.check('election: question logic is refused on an election', t.q(format($q$select lv.logic_write_guard(%L::uuid, 'rating', null, null, 'x', %L::jsonb)$q$, t.get('p'), '{"show_if":{"match":"all","conditions":[{"question_id":"' || t.get('p1') || '","op":"at_least","min":2}]}}')) = 'An election has no question logic: every voter sees every race in the same order.');
update lv.campaigns set mode = 'survey' where id = t.id('p');

-- ===== end survey ========================================================================================
select t.as_kpn(1);
select t.put('e', lv_api.lv_quick_survey_create('Ends early', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.addq('e', 'e1', 1, 'yes_no', 'Use it?');
select t.addq('e', 'e2', 2, 'text', 'Why?');
select t.check('end: Creator Plus can end the survey on an answer', t.upd('e1', '{"jumps":[{"when":"false","to":"end"}]}') = 'ok');
select t.check('end: publishes', t.code(lv_api.lv_campaign_activate(t.id('e'))) = 'ok');
select t.as_pg();
select t.put('ecode', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('e'))));
select t.as_anon();
select t.check('end: answering No ends the survey', t.code(t.gs(t.get('ecode'), 'e1', jsonb_build_array(t.o('e1', 'false')))) = 'ok');
select t.check('end: an answer after the end is refused', t.rej(t.get('ecode'), 'e2', jsonb_build_array(t.o('e1', 'false'), t.o('e2', '"because"')), '%not shown%'));
select t.check('end: answering Yes continues to Q2', t.code(t.gs(t.get('ecode'), 'e3', jsonb_build_array(t.o('e1', 'true'), t.o('e2', '"because"')))) = 'ok');

-- ===== results: seen beside answered, withheld under 5 on anonymous ==============================================
select t.as_pg();
select t.check('results: setup counts', t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid$q$, t.get('c'))) = '4');
-- add more MJCC respondents so groups reach 5: 3 more staff paths (7 staff in total? staff1, staff2 + 3) and Corporate x1
select t.as_anon();
select t.gs(t.get('code'), 'more' || g, jsonb_build_array(t.o('q1', '"Lead"'), t.o('q2', '["Reports"]'), t.o('q5', '3'), t.o('q6', 'false'), t.o('q8', '4'))) from generate_series(1, 4) g;
select t.gs(t.get('code'), 'head' || g, jsonb_build_array(t.o('q1', '"Department head"'), t.o('q12', '3'), t.o('q15', 'false'))) from generate_series(2, 5) g;
select t.as_kpn(1);
select lv_api.lv_campaign_close(t.id('c'));
select t.check('results: Q5 was seen by the 6 staff paths and answered by all 6',
  (lv_api.lv_analytics_question(t.id('c'), t.id('q5')) ->> 'seen') = '6' and (lv_api.lv_analytics_question(t.id('c'), t.id('q5')) ->> 'answered') = '6');
select t.check('results: Q12 was seen and answered by the 5 leadership paths',
  (lv_api.lv_analytics_question(t.id('c'), t.id('q12')) ->> 'seen') = '6' and (lv_api.lv_analytics_question(t.id('c'), t.id('q12')) ->> 'answered') = '6');
select t.check('results: Q20 (one Corporate path, under 5) withholds seen and answered',
  (lv_api.lv_analytics_question(t.id('c'), t.id('q20')) ->> 'seen') is null and (lv_api.lv_analytics_question(t.id('c'), t.id('q20')) ->> 'answered') is null
  and (lv_api.lv_analytics_question(t.id('c'), t.id('q20')) ->> 'seen_withheld') = 'true');
select t.check('results: filtering by an earlier answer (Lead) counts only that group',
  (lv_api.lv_analytics_question(t.id('c'), t.id('q5'), jsonb_build_object('question_id', t.get('q1'), 'any_of', jsonb_build_array('Lead'))) ->> 'seen') = '5');
select t.check('results: a filter group under 5 is withheld completely',
  (lv_api.lv_analytics_question(t.id('c'), t.id('q5'), jsonb_build_object('question_id', t.get('q1'), 'any_of', jsonb_build_array('Corporate'))) ->> 'filter_withheld') = 'true'
  and (lv_api.lv_analytics_question(t.id('c'), t.id('q5'), jsonb_build_object('question_id', t.get('q1'), 'any_of', jsonb_build_array('Corporate'))) ->> 'seen') is null);
select t.check('results: a filter on a rating question is refused',
  t.code(lv_api.lv_analytics_question(t.id('c'), t.id('q5'), jsonb_build_object('question_id', t.get('q5'), 'any_of', jsonb_build_array('3')))) = 'lv_invalid_input');
select t.check('results: not callable by anonymous', (select not has_function_privilege('anon', 'lv_api.lv_analytics_question(uuid,uuid,jsonb)', 'execute')));

-- ===== Creator Pro limits ===================================================================================
select t.as_kpn(2, null, true, 'Pro'); select lv_api.lv_my_context();
select t.put('pro', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
insert into lv.entitlements (scope, account_id, family, product, source) values ('account', t.id('pro'), 'creator_pro', 'creator_pro', 'grant');
select t.as_kpn(2);
select t.put('pc', lv_api.lv_quick_survey_create('Big survey', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.check('limits: Creator Pro has 100 questions', (lv_api.lv_campaign_get(t.id('pc')) #>> '{campaign,question_limit}') = '100');
select t.check('limits: a Creator Pro account adds 12 questions to a Quick Survey (free stops at 10)',
  (select count(*) from (select lv_api.lv_campaign_question_add(t.id('pc'), g, 'text', 'Q' || g) ->> 'question_id' x from generate_series(1, 12) g) z where x is not null) = 12);
select t.check('limits: the activation gate counts those 12 as fine', t.code(lv_api.lv_campaign_activate(t.id('pc'))) = 'ok');
select t.check('limits: the Quick Surveys list shows the Creator limits',
  (lv_api.lv_quick_survey_list() ->> 'question_limit') = '100' and (lv_api.lv_quick_survey_list() ->> 'limit') = '100');
select t.as_kpn(3, null, true, 'Other'); select lv_api.lv_my_context();
select t.put('fc', lv_api.lv_quick_survey_create('Small', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.check('limits: a free account still stops at 10 questions',
  (select count(*) from (select lv_api.lv_campaign_question_add(t.id('fc'), g, 'text', 'Q' || g) ->> 'question_id' x from generate_series(1, 12) g) z where x is not null) = 10);
select t.check('limits: the free list shows the free limits', (lv_api.lv_quick_survey_list() ->> 'question_limit') = '10' and (lv_api.lv_quick_survey_list() ->> 'limit') = '5');
select t.as_pg();
select t.check('limits: the Creator rows are plain plan_limits rows (easy to change)',
  (select count(*) from lv.plan_limits where family in ('creator_plus','creator_pro') and key in ('quick.max_questions','quick.max_active')) = 4);
rollback;
