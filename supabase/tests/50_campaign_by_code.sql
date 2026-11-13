-- 50: a signed-in person opening a survey link gets its id only when they may take part or manage it.
select set_config('t.file', '50_campaign_by_code', false);
begin;
select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('qs', lv_api.lv_quick_survey_create('Code lookup', 'link', 'identified', true) #>> '{campaign,campaign_id}');
select lv_api.lv_campaign_question_add(t.id('qs'), 1, 'rating', 'How was it?', '{}'::jsonb);
select t.check('publish', t.code(lv_api.lv_campaign_activate(t.id('qs'))) = 'ok');
select t.put('code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('qs'))));

select t.check('owner: gets the id', (lv_api.lv_campaign_by_code(t.get('code')) ->> 'campaign_id') = t.get('qs'));
select t.check('owner: codes are case and space tolerant', (lv_api.lv_campaign_by_code(' ' || lower(t.get('code')) || ' ') ->> 'campaign_id') = t.get('qs'));

select t.as_kpn(2, null, true, 'Visitor'); select lv_api.lv_my_context();
select t.check('link survey: any signed-in person gets the id', (lv_api.lv_campaign_by_code(t.get('code')) ->> 'campaign_id') = t.get('qs'));
select t.check('unknown code: lv_not_found', t.code(lv_api.lv_campaign_by_code('ZZZZZZ')) = 'lv_not_found');

select t.as_pg();
update lv.campaigns set access = 'invite', audience = 'members' where id = t.id('qs');
select t.as_kpn(2);
select t.check('invite-only: someone not invited gets lv_not_found, not the id', t.code(lv_api.lv_campaign_by_code(t.get('code'))) = 'lv_not_found'
  and (lv_api.lv_campaign_by_code(t.get('code')) ->> 'campaign_id') is null);
select t.as_kpn(1);
select t.check('invite-only: the owner still gets the id', (lv_api.lv_campaign_by_code(t.get('code')) ->> 'campaign_id') = t.get('qs'));

select t.as_anon();
select t.check('anon: cannot call it', t.raises(format($q$select lv_api.lv_campaign_by_code(%L)$q$, t.get('code'))));
rollback;
