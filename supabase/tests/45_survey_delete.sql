-- 45: deleting a Quick Survey deletes its results (000045), and a deleted Campaign's questions cascade.
select set_config('t.file', '45_survey_delete', false);
begin;
select t.trust_test_issuer();
select t.as_kpn(2); select lv_api.lv_my_context();
select t.as_kpn(1); select lv_api.lv_my_context();
select t.put('me', t.q($$select lv.current_account_id()::text$$));

-- A published survey with a guest answer, a signed-in answer and an invite.
select t.put('qs', lv_api.lv_quick_survey_create('Team lunch', 'link', 'identified', true) #>> '{campaign,campaign_id}');
select t.put('q1', lv_api.lv_campaign_question_add(t.id('qs'), 1, 'yes_no', 'Was it good?', '{}'::jsonb) ->> 'question_id');
select t.put('q2', lv_api.lv_campaign_question_add(t.id('qs'), 2, 'text', 'What should change?', '{"optional":true}'::jsonb) ->> 'question_id');
select t.check('setup: the survey publishes', t.code(lv_api.lv_campaign_activate(t.id('qs'))) = 'ok');
select t.put('code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('qs'))));
select lv_api.lv_campaign_invite_create(t.id('qs'), 5, null);
select t.as_anon();
select t.check('setup: a guest answers', t.code(lv_api.lv_guest_submit(t.get('code'), repeat('a', 40), jsonb_build_array(
  jsonb_build_object('question_id', t.get('q1'), 'value', true), jsonb_build_object('question_id', t.get('q2'), 'value', 'More soup')))) = 'ok');
select t.as_kpn(2);
select t.check('setup: a signed-in person answers', t.code(lv_api.lv_submit_response(t.id('qs'), jsonb_build_array(
  jsonb_build_object('question_id', t.get('q1'), 'value', false)))) = 'ok');

-- Only the creator may delete it; a stranger learns nothing.
select t.check('delete: someone else gets lv_not_found', t.code(lv_api.lv_quick_survey_delete(t.id('qs'))) = 'lv_not_found');
select t.as_pg();
select t.check('delete: signed out cannot call it', not has_function_privilege('anon', 'lv_api.lv_quick_survey_delete(uuid)', 'execute'));
select t.check('delete: the internal function is not exposed', not has_function_privilege('authenticated', 'lv.api_quick_survey_delete(uuid)', 'execute'));
select t.as_kpn(1);
select t.check('delete: an unknown id is lv_not_found', t.code(lv_api.lv_quick_survey_delete(gen_random_uuid())) = 'lv_not_found');

-- Staff review blocks deletion so moderation evidence stays.
select t.as_kpn(1);
select t.as_anon();
select lv_api.lv_report_abuse(t.get('code'), 'Spam');
select t.as_kpn(1);
select t.check('delete: an open abuse report locks it', t.code(lv_api.lv_quick_survey_delete(t.id('qs'))) = 'lv_locked');
select t.as_pg();
update lv.abuse_reports set status = 'dismissed' where campaign_id = t.id('qs');
select t.as_kpn(1);

-- The creator deletes it: survey, questions, answers, receipts, invites all go.
select t.check('delete: the creator deletes a published survey with answers', t.code(lv_api.lv_quick_survey_delete(t.id('qs'))) = 'ok');
select t.as_pg();
select t.check('delete: the survey is gone', not exists (select 1 from lv.campaigns where id = t.id('qs')));
select t.check('delete: its questions are gone', not exists (select 1 from lv.campaign_questions where campaign_id = t.id('qs')));
select t.check('delete: its answers are gone', not exists (select 1 from lv.answers where question_id in (t.id('q1'), t.id('q2'))));
select t.check('delete: its submissions are gone', not exists (select 1 from lv.submissions where campaign_id = t.id('qs')));
select t.check('delete: signed-in receipts are gone', not exists (select 1 from lv.participation where campaign_id = t.id('qs')));
select t.check('delete: guest receipts are gone', not exists (select 1 from lv.guest_participation where campaign_id = t.id('qs')));
select t.check('delete: invites are gone', not exists (select 1 from lv.campaign_invites where campaign_id = t.id('qs')));
select t.check('delete: one audit event without content', (select count(*) from lv.audit_events where action = 'quick_survey.deleted' and target = t.get('qs')) = 1);
select t.as_kpn(1);
select t.check('delete: the list no longer shows it', not exists (
  select 1 from jsonb_array_elements(lv_api.lv_quick_survey_list() -> 'surveys') s where s->>'campaign_id' = t.get('qs')));
select t.check('delete: a second delete is lv_not_found', t.code(lv_api.lv_quick_survey_delete(t.id('qs'))) = 'lv_not_found');

-- A draft deletes too.
select t.put('draft', lv_api.lv_quick_survey_create('Draft', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select lv_api.lv_campaign_question_add(t.id('draft'), 1, 'rating', 'How was it?', '{}'::jsonb);
select t.check('delete: a draft deletes', t.code(lv_api.lv_quick_survey_delete(t.id('draft'))) = 'ok');

-- A survey staff blocked cannot be deleted by its creator.
select t.put('blk', lv_api.lv_quick_survey_create('Blocked', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.as_pg();
update lv.campaigns set blocked_at = now(), blocked_reason = 'Phishing' where id = t.id('blk');
select t.as_kpn(1);
select t.check('delete: a blocked survey is lv_locked', t.code(lv_api.lv_quick_survey_delete(t.id('blk'))) = 'lv_locked');

-- Hub Campaigns are never deleted by this call.
select t.grant_credit(t.id('me'));
select t.put('hub', lv_api.lv_hub_create('delete-test-hub', 'Delete Test Hub') ->> 'hub_id');
select t.put('hc', lv_api.lv_campaign_create(t.id('hub'), 'Hub poll', 'poll', 'anonymous') ->> 'campaign_id');
select t.check('delete: a Hub Campaign is lv_not_found here', t.code(lv_api.lv_quick_survey_delete(t.id('hc'))) = 'lv_not_found');

-- The cascade fix: questions still refuse direct changes on a live survey, and a deleted Campaign takes them along.
select t.put('live', lv_api.lv_quick_survey_create('Live', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.put('lq', lv_api.lv_campaign_question_add(t.id('live'), 1, 'yes_no', 'Yes?', '{}'::jsonb) ->> 'question_id');
select lv_api.lv_campaign_activate(t.id('live'));
select t.as_pg();
select t.check('freeze: a question of a live survey still cannot be deleted directly',
  t.raises(format($q$delete from lv.campaign_questions where id = %L::uuid$q$, t.get('lq')), '42501'));
select t.check('freeze: deleting the personal space with a live survey works (account deletion path)',
  t.raises(format($q$select lv.delete_hub(%L::uuid, %L::uuid)$q$, (select hub_id::text from lv.campaigns where id = t.id('live')), t.get('me'))) = false);
select t.check('freeze: its questions went with it', not exists (select 1 from lv.campaign_questions where id = t.id('lq')));
rollback;
