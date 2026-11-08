-- 22: FB-01. Role targeting is for identified Campaigns only (000022).
select set_config('t.file', '22_anonymous_role_targeting', false);
begin;
select t.trust_test_issuer();

select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('owner'), 'team');
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('fb01-team', 'FB01 Team') ->> 'hub_id'));
select t.put('r_a', (lv_api.lv_role_create(t.id('hub'), 'Group A', 'star', array[]::text[]) #>> '{role,role_id}'));
select t.put('r_b', (lv_api.lv_role_create(t.id('hub'), 'Group A plus one', 'heart', array[]::text[]) #>> '{role,role_id}'));

-- The reproduced attack: two anonymous Campaigns, each sent to one of two overlapping roles.
select t.put('anon1', (lv_api.lv_campaign_create(t.id('hub'), 'Anon one', 'poll', 'anonymous') ->> 'campaign_id'));
select t.put('anon2', (lv_api.lv_campaign_create(t.id('hub'), 'Anon two', 'poll', 'anonymous') ->> 'campaign_id'));
select t.check('FB-01: an anonymous Campaign cannot be targeted at a role (lv_not_available)',
  t.code(lv_api.lv_campaign_set_audience_roles(t.id('anon1'), array[t.id('r_a')])) = 'lv_not_available'
  and t.code(lv_api.lv_campaign_set_audience_roles(t.id('anon2'), array[t.id('r_b')])) = 'lv_not_available');
select t.check('FB-01: the refusal changes nothing (still all members, no stored roles)',
  t.q(format($q$select audience_scope from lv.campaigns where id = %L::uuid$q$, t.get('anon1'))) = 'all_members'
  and t.q(format($q$select count(*)::text from lv.campaign_audience_roles where campaign_id in (%L::uuid, %L::uuid)$q$,
                 t.get('anon1'), t.get('anon2'))) = '0');
select t.check('FB-01: the refusal explains itself',
  (lv_api.lv_campaign_set_audience_roles(t.id('anon1'), array[t.id('r_a')]) #>> '{error,message}') like '%only for identified Campaigns%');
select t.check('FB-01: clearing roles on an anonymous Campaign is still fine',
  t.code(lv_api.lv_campaign_set_audience_roles(t.id('anon1'), array[]::uuid[])) = 'ok');

-- Identified Campaigns keep role targeting.
select t.put('ident', (lv_api.lv_campaign_create(t.id('hub'), 'Identified', 'poll', 'identified') ->> 'campaign_id'));
select t.check('FB-01: an identified Campaign can still be targeted at a role',
  (lv_api.lv_campaign_set_audience_roles(t.id('ident'), array[t.id('r_a')]) #>> '{audience,scope}') = 'roles');
select t.check('FB-01: a role-targeted draft cannot be switched to anonymous',
  t.code(lv_api.lv_campaign_update(t.id('ident'), p_anonymity => 'anonymous')) = 'lv_not_available'
  and t.q(format($q$select anonymity from lv.campaigns where id = %L::uuid$q$, t.get('ident'))) = 'identified');
select t.check('FB-01: after clearing the roles it can become anonymous',
  t.code(lv_api.lv_campaign_set_audience_roles(t.id('ident'), array[]::uuid[])) = 'ok'
  and t.code(lv_api.lv_campaign_update(t.id('ident'), p_anonymity => 'anonymous')) = 'ok');

-- Defence in depth: even a row forced past the trigger is blocked at activation.
select t.as_pg();
alter table lv.campaigns disable trigger campaigns_no_anonymous_role_targeting;
update lv.campaigns set audience_scope = 'roles' where id = t.id('anon2');
insert into lv.campaign_audience_roles (campaign_id, role_id) values (t.id('anon2'), t.id('r_b'));
alter table lv.campaigns enable trigger campaigns_no_anonymous_role_targeting;
select t.check('FB-01: the activation gate reports role_targeting_anonymous',
  lv.gate_evaluate(t.id('anon2')) -> 'reasons' ? 'role_targeting_anonymous');
select t.check('FB-01: the trigger cannot be bypassed by API roles (definer function not executable)',
  not has_function_privilege('authenticated', 'lv.forbid_anonymous_role_targeting()', 'execute'));

rollback;
