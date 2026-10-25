-- 02: authorization -- membership isolation, role isolation per Hub, capability enforcement, Owner protection.
select set_config('t.file', '02_authorization', false);
begin;

select t.trust_test_issuer();

-- Two Hubs owned by two different people, to prove isolation.
select t.as_kpn(10, 'owner.a@example.invalid', true, 'Owner A');
select lv_api.lv_my_context();
select t.put('acc_a', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
insert into lv.beta_applications (account_id, status) values (t.id('acc_a'), 'approved');
select t.as_kpn(10);
select t.check('Hub A is created by its owner', t.code(lv_api.lv_hub_create('hub-a', 'Hub A')) = 'ok');
select t.put('hub_a', t.q($$select id::text from lv.hubs where slug = 'hub-a'$$));

select t.as_kpn(20, 'owner.b@example.invalid', true, 'Owner B');
select lv_api.lv_my_context();
select t.put('acc_b', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
insert into lv.beta_applications (account_id, status) values (t.id('acc_b'), 'approved');
select t.as_kpn(20);
select t.check('Hub B is created by its owner', t.code(lv_api.lv_hub_create('hub-b', 'Hub B')) = 'ok');
select t.put('hub_b', t.q($$select id::text from lv.hubs where slug = 'hub-b'$$));

-- ---------------------------------------------------------------------------------------------------------
-- Hub creation rules
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(30, 'nobeta@example.invalid', true, 'No Beta');
select lv_api.lv_my_context();
select t.check('creating a Hub without an approved beta application fails closed',
  t.code(lv_api.lv_hub_create('hub-c', 'Hub C')) = 'lv_beta_required');

select t.as_kpn(10);
select t.check('a reserved slug is refused', t.code(lv_api.lv_hub_create('admin', 'Sneaky')) = 'lv_invalid_input');

-- Isolate the slug rule from the beta rule: consumption of the approval is a separate behaviour, so grant a
-- fresh approval before asserting on the uniqueness failure.
select t.as_pg();
update lv.beta_applications set status = 'approved' where account_id = t.id('acc_a');
select t.as_kpn(10);
select t.check('a duplicate slug is refused', t.code(lv_api.lv_hub_create('hub-a', 'Copy')) = 'lv_conflict');
select t.check('an approval is NOT consumed by a failed Hub creation',
  t.q($$select status from lv.beta_applications where account_id = '$$ || t.get('acc_a') || $$'::uuid$$) = 'approved');

select t.as_pg();
select t.check('the creator becomes a member of their own Hub',
  t.q($$select status from lv.hub_memberships where hub_id = '$$ || t.get('hub_a') || $$'::uuid and account_id = '$$ || t.get('acc_a') || $$'::uuid$$) = 'accepted');
select t.check('the creator becomes the Owner',
  t.q($$select (owner_account_id = '$$ || t.get('acc_a') || $$'::uuid)::text from lv.hubs where id = '$$ || t.get('hub_a') || $$'::uuid$$) = 'true');
select t.check('the Owner holds the Owner role',
  t.q($$select r.key from lv.membership_roles mr
            join lv.roles r on r.id = mr.role_id
            join lv.hub_memberships m on m.id = mr.membership_id
           where m.hub_id = '$$ || t.get('hub_a') || $$'::uuid and m.account_id = '$$ || t.get('acc_a') || $$'::uuid$$) = 'owner');

-- ---------------------------------------------------------------------------------------------------------
-- Membership isolation: the Owner of A has no standing in B
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(10);
select t.check('the Owner of Hub A holds no capability in Hub B',
  t.q($$select lv.has_capability('$$ || t.get('acc_a') || $$'::uuid, '$$ || t.get('hub_b') || $$'::uuid, 'campaign.manage')::text$$) = 'false');
select t.check('the Owner of Hub A cannot create a Campaign in Hub B',
  t.raises($$select lv_api.lv_campaign_create('$$ || t.get('hub_b') || $$'::uuid, 'Sneaky', 'survey')$$, '42501'));
select t.check('the Owner of Hub A cannot mint an invitation for Hub B',
  t.raises($$select lv_api.lv_invite_create('$$ || t.get('hub_b') || $$'::uuid)$$, '42501'));
select t.check('a non-member cannot read Hub B analytics',
  t.raises($$select lv.analytics_query(gen_random_uuid(), 'participant_count')$$));

-- ---------------------------------------------------------------------------------------------------------
-- Role isolation per Hub: a role from A cannot be attached to a membership in B
-- ---------------------------------------------------------------------------------------------------------
select t.as_pg();
select t.check('attaching a Hub A role to a Hub B membership is refused by the database',
  t.raises($$insert into lv.membership_roles (membership_id, role_id)
              select m.id, r.id
                from lv.hub_memberships m, lv.roles r
               where m.hub_id = '$$ || t.get('hub_b') || $$'::uuid
                 and r.hub_id = '$$ || t.get('hub_a') || $$'::uuid
                 and r.key = 'owner'$$, '42501'));

-- ---------------------------------------------------------------------------------------------------------
-- Only accepted members can hold roles
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(40, 'pending@example.invalid', true, 'Pending Person');
select lv_api.lv_my_context();
select t.put('acc_p', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
insert into lv.hub_memberships (hub_id, account_id, status) values (t.id('hub_a'), t.id('acc_p'), 'pending');
select t.check('a pending membership cannot hold a role',
  t.raises($$insert into lv.membership_roles (membership_id, role_id)
              select m.id, r.id from lv.hub_memberships m, lv.roles r
               where m.hub_id = '$$ || t.get('hub_a') || $$'::uuid and m.account_id = '$$ || t.get('acc_p') || $$'::uuid
                 and r.hub_id = '$$ || t.get('hub_a') || $$'::uuid and r.key = 'owner'$$, '42501'));

-- ---------------------------------------------------------------------------------------------------------
-- Capability enforcement uses roles, and dropping to non-accepted removes privilege
-- ---------------------------------------------------------------------------------------------------------
select t.as_pg();
insert into lv.roles (hub_id, key, name) values (t.id('hub_a'), 'viewer', 'Viewer');
insert into lv.role_capabilities (role_id, capability)
  select id, 'analytics.read' from lv.roles where hub_id = t.id('hub_a') and key = 'viewer';
update lv.hub_memberships set status = 'accepted', accepted_at = now()
 where hub_id = t.id('hub_a') and account_id = t.id('acc_p');
insert into lv.membership_roles (membership_id, role_id)
  select m.id, r.id from lv.hub_memberships m, lv.roles r
   where m.hub_id = t.id('hub_a') and m.account_id = t.id('acc_p')
     and r.hub_id = t.id('hub_a') and r.key = 'viewer';

select t.check('an accepted member with a granted capability holds exactly that capability',
  t.q($$select lv.has_capability('$$ || t.get('acc_p') || $$'::uuid, '$$ || t.get('hub_a') || $$'::uuid, 'analytics.read')::text$$) = 'true');
select t.check('...and does not silently gain an undelegated capability',
  t.q($$select lv.has_capability('$$ || t.get('acc_p') || $$'::uuid, '$$ || t.get('hub_a') || $$'::uuid, 'campaign.manage')::text$$) = 'false');

update lv.hub_memberships set status = 'removed' where hub_id = t.id('hub_a') and account_id = t.id('acc_p');
select t.check('losing accepted status drops the role assignments',
  t.q($$select count(*)::text from lv.membership_roles mr
            join lv.hub_memberships m on m.id = mr.membership_id
           where m.account_id = '$$ || t.get('acc_p') || $$'::uuid$$) = '0');
select t.check('...and the capability is gone with them',
  t.q($$select lv.has_capability('$$ || t.get('acc_p') || $$'::uuid, '$$ || t.get('hub_a') || $$'::uuid, 'analytics.read')::text$$) = 'false');

-- ---------------------------------------------------------------------------------------------------------
-- Owner protection
-- ---------------------------------------------------------------------------------------------------------
select t.check('the Owner membership cannot be removed',
  t.raises($$update lv.hub_memberships set status = 'removed'
              where hub_id = '$$ || t.get('hub_a') || $$'::uuid and account_id = '$$ || t.get('acc_a') || $$'::uuid$$, '42501'));
select t.check('the Owner membership cannot be suspended',
  t.raises($$update lv.hub_memberships set status = 'suspended'
              where hub_id = '$$ || t.get('hub_a') || $$'::uuid and account_id = '$$ || t.get('acc_a') || $$'::uuid$$));
select t.check('the Owner membership cannot be deleted',
  t.raises($$delete from lv.hub_memberships
              where hub_id = '$$ || t.get('hub_a') || $$'::uuid and account_id = '$$ || t.get('acc_a') || $$'::uuid$$, '42501'));
select t.check('the Owner role cannot be unassigned',
  t.raises($$delete from lv.membership_roles
              where role_id = (select id from lv.roles where hub_id = '$$ || t.get('hub_a') || $$'::uuid and is_owner)$$, '42501'));
select t.check('the Owner role cannot be demoted',
  t.raises($$update lv.roles set is_owner = false
              where hub_id = '$$ || t.get('hub_a') || $$'::uuid and is_owner$$, '42501'));
select t.check('the Owner role cannot be deleted',
  t.raises($$delete from lv.roles where hub_id = '$$ || t.get('hub_a') || $$'::uuid and is_owner$$, '42501'));
select t.check('the Hub Owner cannot be reassigned directly',
  t.raises($$update lv.hubs set owner_account_id = '$$ || t.get('acc_b') || $$'::uuid
              where id = '$$ || t.get('hub_a') || $$'::uuid$$, '42501'));
select t.check('a Hub cannot have two Owner roles',
  t.raises($$insert into lv.roles (hub_id, key, name, is_owner)
              values ('$$ || t.get('hub_a') || $$'::uuid, 'owner2', 'Owner 2', true)$$, '23505'));

-- ---------------------------------------------------------------------------------------------------------
-- A removed member cannot be readmitted
-- ---------------------------------------------------------------------------------------------------------
select t.check('a removed member cannot return to accepted',
  t.raises($$update lv.hub_memberships set status = 'accepted', accepted_at = now()
              where hub_id = '$$ || t.get('hub_a') || $$'::uuid and account_id = '$$ || t.get('acc_p') || $$'::uuid$$, '42501'));

rollback;
