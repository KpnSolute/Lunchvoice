-- 51: My home reports the caller's real Quick Survey limits.
select set_config('t.file', '51_context_creator_limits', false);
begin;
select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Creator'); select lv_api.lv_my_context();
select t.put('me', t.q($$select lv.current_account_id()::text$$));
select lv_api.lv_quick_survey_create('First', 'link', 'anonymous', true);
select t.check('free: 5 active and 10 questions', (lv_api.lv_my_context() #>> '{quick_surveys,limit}') = '5'
  and (lv_api.lv_my_context() #>> '{quick_surveys,question_limit}') = '10');
select t.as_pg();
insert into lv.entitlements (scope, account_id, family, product, source) values ('account', t.id('me'), 'creator_pro', 'creator_pro', 'grant');
select t.as_kpn(1);
select t.check('creator pro: 100 active and 100 questions', (lv_api.lv_my_context() #>> '{quick_surveys,limit}') = '100'
  and (lv_api.lv_my_context() #>> '{quick_surveys,question_limit}') = '100');
select t.check('suspension block is still present', lv_api.lv_my_context() ? 'suspension');
select t.as_pg();
update lv.entitlements set family = 'creator_plus', product = 'creator_plus' where account_id = t.id('me') and family = 'creator_pro';
select t.as_kpn(1);
select t.check('creator plus: 15 active and 30 questions', (lv_api.lv_my_context() #>> '{quick_surveys,limit}') = '15'
  and (lv_api.lv_my_context() #>> '{quick_surveys,question_limit}') = '30');
rollback;
