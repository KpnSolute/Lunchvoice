-- 27: a paused Campaign can be edited (000027). Title, description and schedule always; mode, anonymity and questions
-- only while nobody has answered. Running and ended Campaigns stay immutable.
select set_config('t.file', '27_edit_paused_campaign', false);
begin;
select t.trust_test_issuer();

select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('owner'), 'starter');
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('pause-edit', 'Pause Edit') ->> 'hub_id'));
select t.put('c', (lv_api.lv_campaign_create(t.id('hub'), 'Black or White?', 'poll', 'identified') ->> 'campaign_id'));
select t.put('q1', (lv_api.lv_campaign_question_add(t.id('c'), 1, 'rating', 'How much?') ->> 'question_id'));
select t.check('the manager''s view says no one has answered yet',
  (lv_api.lv_campaign_get(t.id('c')) #>> '{campaign,has_responses}') = 'false');
select t.check('setup: the Campaign activates', t.code(lv_api.lv_campaign_activate(t.id('c'))) = 'ok');

select t.check('running: the title is immutable', t.code(lv_api.lv_campaign_update(t.id('c'), p_title => 'Nope')) = 'lv_locked');
select t.check('running: questions are immutable', t.code(lv_api.lv_campaign_question_update(t.id('q1'), p_prompt => 'Nope')) = 'lv_locked');

select t.check('pause works', t.code(lv_api.lv_campaign_pause(t.id('c'))) = 'ok');
select t.check('paused, no answers: the title can change', t.code(lv_api.lv_campaign_update(t.id('c'), p_title => 'Black or white?')) = 'ok'
  and t.q(format($q$select title from lv.campaigns where id = %L::uuid$q$, t.get('c'))) = 'Black or white?');
select t.check('paused, no answers: the description can change', t.code(lv_api.lv_campaign_update(t.id('c'), p_description => 'Pick one')) = 'ok'
  and t.q(format($q$select description from lv.campaigns where id = %L::uuid$q$, t.get('c'))) = 'Pick one');
select t.check('paused, no answers: the mode and anonymity can change',
  t.code(lv_api.lv_campaign_update(t.id('c'), p_mode => 'survey', p_anonymity => 'anonymous')) = 'ok');
select t.check('paused, no answers: a question can be reworded and another added',
  t.code(lv_api.lv_campaign_question_update(t.id('q1'), p_prompt => 'How much do you like it?')) = 'ok'
  and t.code(lv_api.lv_campaign_question_add(t.id('c'), 2, 'rating', 'And now?')) = 'ok');
select t.check('paused: the status stays paused and the revision is unchanged by editing',
  t.q(format($q$select status || ':' || revision from lv.campaigns where id = %L::uuid$q$, t.get('c'))) = 'paused:2');

select t.check('resume works', t.code(lv_api.lv_campaign_resume(t.id('c'))) = 'ok');
select t.check('running again: immutable again', t.code(lv_api.lv_campaign_update(t.id('c'), p_title => 'Nope')) = 'lv_locked');

-- An answer arrives; now the meaning of answers is protected.
select t.put('q2', t.q(format($q$select id::text from lv.campaign_questions where campaign_id = %L::uuid and position = 2$q$, t.get('c'))));
select t.check('an answer is recorded',
  t.code(lv_api.lv_submit_response(t.id('c'), format('[{"question_id":"%s","value":4},{"question_id":"%s","value":5}]', t.get('q1'), t.get('q2'))::jsonb)) = 'ok');
select t.check('pause again', t.code(lv_api.lv_campaign_pause(t.id('c'))) = 'ok');
select t.check('paused with answers: the title and description can still change',
  t.code(lv_api.lv_campaign_update(t.id('c'), p_title => 'Renamed')) = 'ok'
  and t.code(lv_api.lv_campaign_update(t.id('c'), p_description => 'Updated text')) = 'ok');
select t.check('paused with answers: the schedule can still change',
  t.code(lv_api.lv_campaign_update(t.id('c'), p_closes_at => now() + interval '30 days')) = 'ok');
select t.check('paused with answers: the mode is locked, with an explanation',
  t.code(lv_api.lv_campaign_update(t.id('c'), p_mode => 'poll')) = 'lv_locked'
  and (lv_api.lv_campaign_update(t.id('c'), p_mode => 'poll') #>> '{error,message}') like '%already has answers%');
select t.check('paused with answers: anonymity is locked',
  t.code(lv_api.lv_campaign_update(t.id('c'), p_anonymity => 'identified')) = 'lv_locked');
select t.check('paused with answers: setting the same mode or anonymity again is harmless',
  t.code(lv_api.lv_campaign_update(t.id('c'), p_mode => 'survey', p_anonymity => 'anonymous')) = 'ok');
select t.check('paused with answers: questions are locked',
  t.code(lv_api.lv_campaign_question_update(t.id('q1'), p_prompt => 'Changed meaning')) = 'lv_locked'
  and t.code(lv_api.lv_campaign_question_add(t.id('c'), 3, 'rating', 'Sneaky')) = 'lv_locked'
  and t.code(lv_api.lv_campaign_question_remove(t.id('q2'))) = 'lv_locked');
select t.check('the manager''s view now says answers exist',
  (lv_api.lv_campaign_get(t.id('c')) #>> '{campaign,has_responses}') = 'true');
select t.check('the answer is untouched', t.q(format($q$select count(*)::text from lv.participation where campaign_id = %L::uuid$q$, t.get('c'))) = '1');

select t.check('closed: immutable', t.code(lv_api.lv_campaign_close(t.id('c'))) = 'ok'
  and t.code(lv_api.lv_campaign_update(t.id('c'), p_title => 'Nope')) = 'lv_locked');

-- A stranger cannot edit a paused Campaign.
select t.put('c2', (lv_api.lv_campaign_create(t.id('hub'), 'Second', 'poll', 'identified') ->> 'campaign_id'));
select t.put('c2q', (lv_api.lv_campaign_question_add(t.id('c2'), 1, 'rating', 'Q?') ->> 'question_id'));
select lv_api.lv_campaign_activate(t.id('c2'));
select lv_api.lv_campaign_pause(t.id('c2'));
select t.as_kpn(9, null, true, 'Stranger'); select lv_api.lv_my_context();
select t.check('a stranger cannot edit a paused Campaign', t.code(lv_api.lv_campaign_update(t.id('c2'), p_title => 'Hijack')) in ('lv_forbidden', 'lv_not_found'));


select t.as_pg();
select t.check('the API function is still callable by signed-in users and not by the signed-out role or the moved base',
  has_function_privilege('authenticated', 'lv_api.lv_campaign_get(uuid)', 'execute')
  and not has_function_privilege('anon', 'lv_api.lv_campaign_get(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'lv.campaign_get_base(uuid)', 'execute'));

rollback;
