-- 37: feedback types for everyone (000036). Quick Surveys may be any free feedback type, read from the entitlement map.
select set_config('t.file', '37_feedback_types', false);
begin;
select t.trust_test_issuer();

select t.as_kpn(1, null, true, 'Asker'); select lv_api.lv_my_context();

-- the entitlement map publishes the list the UI reads
select t.check('map: lv_plan_limits lists the free feedback types',
  (lv_api.lv_plan_limits() #> '{families,free,quick.modes}') = '["survey","poll","rating","feedback"]'::jsonb);

-- creation
select t.check('create: the old four-argument call still makes a survey',
  (lv_api.lv_quick_survey_create('Old call', 'link', 'anonymous', true) #>> '{campaign,mode}') = 'survey');
select t.check('create: no type given is a survey', (lv_api.lv_quick_survey_create('Default', 'link') #>> '{campaign,mode}') = 'survey');
select t.put('poll', (lv_api.lv_quick_survey_create('Pizza or tacos?', 'link', p_mode => 'poll') #>> '{campaign,campaign_id}'));
select t.check('create: a poll', t.q(format($q$select mode from lv.campaigns where id = %L::uuid$q$, t.get('poll'))) = 'poll');
select t.check('create: a rating', (lv_api.lv_quick_survey_create('Rate lunch', 'link', p_mode => 'rating') #>> '{campaign,mode}') = 'rating');
select t.check('create: open feedback', (lv_api.lv_quick_survey_create('Ideas?', 'invite', p_mode => 'feedback') #>> '{campaign,mode}') = 'feedback');
select t.check('create: election is not a Quick Survey type yet (it needs its own model)',
  t.code(lv_api.lv_quick_survey_create('Vote', 'link', p_mode => 'election')) = 'lv_invalid_input');
select t.check('create: an unknown type is refused', t.code(lv_api.lv_quick_survey_create('X', 'link', p_mode => 'quiz')) = 'lv_invalid_input');
select t.check('create: a refused type created nothing',
  t.q($q$select count(*)::text from lv.campaigns c where c.title in ('Vote', 'X')$q$) = '0');

-- changing the type of a draft
select t.check('update: a draft poll can become a survey', t.code(lv_api.lv_campaign_update(t.id('poll'), p_mode => 'survey')) = 'ok');
select t.check('update: and back to a poll', t.code(lv_api.lv_campaign_update(t.id('poll'), p_mode => 'poll')) = 'ok');
select t.check('update: an unknown type is refused', t.code(lv_api.lv_campaign_update(t.id('poll'), p_mode => 'quiz')) = 'lv_invalid_input');
select t.check('update: the poll is still a poll', t.q(format($q$select mode from lv.campaigns where id = %L::uuid$q$, t.get('poll'))) = 'poll');

-- free limits still apply to every type
select t.check('limits: a poll Quick Survey still takes only core question kinds',
  t.code(lv_api.lv_campaign_question_add(t.id('poll'), 1, 'ranking', 'Rank them')) = 'lv_invalid_input');
select t.check('limits: a core kind is accepted', t.code(lv_api.lv_campaign_question_add(t.id('poll'), 1, 'single_choice', 'Which?',
  '{"options":["Pizza","Tacos"]}'::jsonb)) = 'ok');
select t.check('limits: a poll can be published like any Quick Survey', t.code(lv_api.lv_campaign_activate(t.id('poll'))) = 'ok');

-- someone else cannot change it
select t.as_kpn(2, null, true, 'Other'); select lv_api.lv_my_context();
select t.check('others: another account cannot change the type', t.code(lv_api.lv_campaign_update(t.id('poll'), p_mode => 'survey')) <> 'ok');
select t.check('others: and it is unchanged', t.q(format($q$select mode from lv.campaigns where id = %L::uuid$q$, t.get('poll'))) = 'poll');

-- the helper is not callable by API roles
select t.as_pg();
select t.check('grants: lv.quick_mode_allowed is not executable by public',
  not has_function_privilege('public', 'lv.quick_mode_allowed(text)', 'execute'));
rollback;
