-- 10: CUSTOM ROLES AND MEMBERSHIP LIFECYCLE (000010, roadmap slice 7).
--
-- Custom roles fail closed until a slot limit exists, respect the limit, never let anyone grant, edit, delete
-- or assign a capability they do not hold, and never touch the Owner. Members join by Hub mode, leave and
-- rejoin, are admitted or declined, and removal is permanent and cannot be used against a stronger admin.
select set_config('t.file', '10_roles_members', false);
begin;

select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, null, true, 'Admin'); select lv_api.lv_my_context();
select t.put('admin', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(3, null, true, 'Member'); select lv_api.lv_my_context();
select t.put('member', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(4, null, true, 'Joiner'); select lv_api.lv_my_context();
select t.put('joiner', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
insert into lv.beta_applications (account_id, status) values (t.id('owner'), 'approved');

select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('roles-hub', 'Roles Hub')->>'hub_id'));
select t.as_pg();
update lv.hubs set membership_mode = 'open', visibility = 'public' where id = t.id('hub');

-- ===== catalogue ========================================================================================
select t.as_anon();
select t.check('catalogue: the capability catalogue lists groups',
  jsonb_array_length(lv_api.lv_capability_catalog()->'groups') >= 5);

-- ===== joining an open Hub ================================================================================
select t.as_kpn(2);
select t.check('join: an open public Hub admits at once', (lv_api.lv_hub_join(t.id('hub'))->>'status') = 'accepted');
select t.as_kpn(3);
select lv_api.lv_hub_join(t.id('hub'));
select t.check('join: joining twice is harmless', (lv_api.lv_hub_join(t.id('hub'))->>'already_member') = 'true');
select t.as_pg();
select t.put('m_admin', t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('hub'), t.get('admin'))));
select t.put('m_member', t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('hub'), t.get('member'))));

-- ===== custom roles fail closed until a limit is set ======================================================
select t.as_kpn(1);
select t.check('roles: creating a custom role without a slot limit is lv_policy_undecided',
  t.code(lv_api.lv_role_create(t.id('hub'), 'Moderator', 'shield', array['admin.members.admit'])) = 'lv_policy_undecided');
select t.as_pg();
update lv.policy set value = '2'::jsonb where key = 'roles.max_custom_per_hub';

select t.as_kpn(1);
select t.put('r_admin', (lv_api.lv_role_create(t.id('hub'), 'Member admin', 'users',
  array['admin.members.admit', 'admin.members.remove'], array['roles']) #>> '{role,role_id}'));
select t.check('roles: the Owner creates a role from capabilities and a group',
  t.q(format($q$select string_agg(capability, ',' order by capability) from lv.role_capabilities where role_id = %L::uuid$q$, t.get('r_admin')))
    = 'admin.members.admit,admin.members.remove,admin.roles.manage');
select t.check('roles: a duplicate name (any case) is lv_conflict',
  t.code(lv_api.lv_role_create(t.id('hub'), 'MEMBER ADMIN', null, array['analytics.read'])) = 'lv_conflict');
select t.check('roles: an unknown capability is lv_invalid_input',
  t.code(lv_api.lv_role_create(t.id('hub'), 'Bad', null, array['hub.delete.everything'])) = 'lv_invalid_input');
select t.check('roles: an unknown group is lv_invalid_input',
  t.code(lv_api.lv_role_create(t.id('hub'), 'Bad', null, null, array['nonsense'])) = 'lv_invalid_input');
select t.check('roles: a malformed icon is lv_invalid_input',
  t.code(lv_api.lv_role_create(t.id('hub'), 'Iconic', 'Not An Icon!', array['analytics.read'])) = 'lv_invalid_input');
select t.put('r_analyst', (lv_api.lv_role_create(t.id('hub'), 'Analyst', 'chart', array['analytics.read']) #>> '{role,role_id}'));
select t.check('roles: the third custom role exceeds the limit of 2 (lv_limit_reached)',
  t.code(lv_api.lv_role_create(t.id('hub'), 'Third', null, array['analytics.read'])) = 'lv_limit_reached');
select t.check('roles: the Owner role does not consume a slot',
  (lv_api.lv_role_list(t.id('hub')) #>> '{custom_slots,used}') = '2'
  and jsonb_array_length(lv_api.lv_role_list(t.id('hub'))->'roles') = 3);

-- ===== assignment and escalation ==========================================================================
select t.check('assign: the Owner assigns the member-admin role',
  t.code(lv_api.lv_member_role_assign(t.id('m_admin'), t.id('r_admin'))) = 'ok');
select t.put('r_owner', t.q(format($q$select id::text from lv.roles where hub_id = %L::uuid and is_owner$q$, t.get('hub'))));
select t.check('assign: the Owner role can never be assigned',
  t.code(lv_api.lv_member_role_assign(t.id('m_member'), t.id('r_owner'))) = 'lv_owner_protected');
select t.check('roles: the Owner role cannot be edited', t.code(lv_api.lv_role_update(t.id('r_owner'), 'Boss')) = 'lv_owner_protected');
select t.check('roles: the Owner role cannot be deleted', t.code(lv_api.lv_role_delete(t.id('r_owner'))) = 'lv_owner_protected');

select t.as_kpn(2);  -- holds admin.members.*, admin.roles.manage; not analytics.read or campaign.manage
select t.check('escalation: a role manager cannot assign a role carrying a capability they lack',
  t.code(lv_api.lv_member_role_assign(t.id('m_member'), t.id('r_analyst'))) = 'lv_forbidden');
select t.check('escalation: a role manager cannot grant themselves more by editing their own role',
  t.code(lv_api.lv_role_update(t.id('r_admin'), null, null, array['admin.members.admit', 'campaign.manage'])) = 'lv_forbidden');
select t.check('escalation: a role manager cannot edit a role carrying a capability they lack',
  t.code(lv_api.lv_role_update(t.id('r_analyst'), 'Renamed')) = 'lv_forbidden');
select t.check('escalation: a role manager cannot delete a role carrying a capability they lack',
  t.code(lv_api.lv_role_delete(t.id('r_analyst'))) = 'lv_forbidden');
select t.check('escalation: a role manager can assign a role within their own capabilities',
  t.code(lv_api.lv_member_role_assign(t.id('m_member'), t.id('r_admin'))) = 'ok');
select t.check('escalation: a member admin cannot remove the Owner',
  t.code(lv_api.lv_member_remove(t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('hub'), t.get('owner')))::uuid)) = 'lv_owner_protected');
select t.as_kpn(4);
select t.check('roles: a non-member cannot list roles', t.code(lv_api.lv_role_list(t.id('hub'))) = 'lv_not_found');

select t.as_kpn(3);
select t.check('unassign: a member admin unassigns a role within their capabilities',
  t.code(lv_api.lv_member_role_unassign(t.id('m_member'), t.id('r_admin'))) = 'ok');
select t.check('unassign: the member no longer holds the capability',
  t.code(lv_api.lv_member_remove(t.id('m_admin'))) = 'lv_forbidden');

select t.as_kpn(1);
select t.check('update: the Owner renames a role, changes its icon and capabilities',
  (lv_api.lv_role_update(t.id('r_analyst'), 'Insights', 'eye', array['analytics.read', 'campaign.manage']) #>> '{role,name}') = 'Insights');
select t.check('update: an empty icon clears it',
  (lv_api.lv_role_update(t.id('r_analyst'), null, '') #>> '{role,icon}') is null);
select t.check('delete: the Owner deletes a custom role', t.code(lv_api.lv_role_delete(t.id('r_analyst'))) = 'ok');
select t.check('delete: deleting frees its slot', (lv_api.lv_role_list(t.id('hub')) #>> '{custom_slots,used}') = '1');

-- ===== leave, rejoin, approval, decline ==================================================================
select t.as_kpn(1);
select t.check('leave: the Owner cannot leave their Hub', t.code(lv_api.lv_member_leave(t.id('hub'))) = 'lv_owner_protected');
select t.as_kpn(2);
select t.check('leave: a member leaves', t.code(lv_api.lv_member_leave(t.id('hub'))) = 'ok');
select t.as_pg();
select t.check('leave: leaving drops role assignments',
  t.q(format($q$select count(*)::text from lv.membership_roles where membership_id = %L::uuid$q$, t.get('m_admin'))) = '0');
select t.as_kpn(2);
select t.check('leave: a member who left may join again', (lv_api.lv_hub_join(t.id('hub'))->>'status') = 'accepted');

select t.as_pg();
update lv.hubs set membership_mode = 'approval' where id = t.id('hub');
select t.as_kpn(4);
select t.check('approval: joining an approval Hub creates a pending request', (lv_api.lv_hub_join(t.id('hub'))->>'status') = 'pending');
select t.as_pg();
select t.put('m_joiner', t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('hub'), t.get('joiner'))));
select t.as_kpn(3);
select t.check('approval: a member without admin.members.admit cannot admit', t.code(lv_api.lv_member_admit(t.id('m_joiner'))) = 'lv_forbidden');
select t.as_kpn(1);
select t.check('approval: declining deletes the request', t.code(lv_api.lv_member_reject(t.id('m_joiner'))) = 'ok');
select t.as_kpn(4);
select t.check('approval: a declined person may ask again', (lv_api.lv_hub_join(t.id('hub'))->>'status') = 'pending');
select t.as_pg();
select t.put('m_joiner', t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('hub'), t.get('joiner'))));
select t.as_kpn(1);
select t.check('approval: the Owner admits the request', t.code(lv_api.lv_member_admit(t.id('m_joiner'))) = 'ok');
select t.check('approval: admitting twice is lv_lifecycle_invalid', t.code(lv_api.lv_member_admit(t.id('m_joiner'))) = 'lv_lifecycle_invalid');

select t.as_pg();
update lv.hubs set membership_mode = 'invite_only' where id = t.id('hub');
select t.as_kpn(5); select lv_api.lv_my_context();
select t.check('invite-only: joining without an invitation is lv_forbidden', t.code(lv_api.lv_hub_join(t.id('hub'))) = 'lv_forbidden');
select t.as_pg();
update lv.hubs set visibility = 'private' where id = t.id('hub');
select t.as_kpn(5);
select t.check('private: a private Hub is invisible to a non-member', t.code(lv_api.lv_hub_join(t.id('hub'))) = 'lv_not_found');

-- ===== removal ===========================================================================================
select t.as_kpn(1);
select t.check('remove: removing yourself is refused (use leave)',
  t.code(lv_api.lv_member_remove(t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('hub'), t.get('owner')))::uuid)) = 'lv_owner_protected');
select t.check('remove: the Owner removes a member', t.code(lv_api.lv_member_remove(t.id('m_joiner'))) = 'ok');
select t.as_pg();
select t.put('code', 'ROLES-REJOIN-CODE');
insert into lv.hub_invites (hub_id, code_hash, created_by) values (t.id('hub'), lv.invite_hash(t.get('code')), t.id('owner'));
select t.as_kpn(4);
select t.check('remove: a removed member cannot rejoin, even with an invitation',
  t.code(lv_api.lv_invite_redeem(t.get('code'))) = 'lv_forbidden');
select t.as_kpn(2);
select lv_api.lv_member_leave(t.id('hub'));
select t.check('invite: an invitation re-admits a member who left',
  (lv_api.lv_invite_redeem(t.get('code'))->>'already_member') = 'false');
select t.as_pg();
select t.check('invite: re-admission grants no role',
  t.q(format($q$select count(*)::text from lv.membership_roles mr join lv.hub_memberships m on m.id = mr.membership_id
                 where m.hub_id = %L::uuid and m.account_id = %L::uuid$q$, t.get('hub'), t.get('admin'))) = '0');
select t.check('audit: role and member actions are audited',
  t.q(format($q$select count(distinct action)::text from lv.audit_events where hub_id = %L::uuid
                 and action in ('role.created','role.updated','role.deleted','role.assigned','role.unassigned',
                                'member.joined','member.requested','member.left','member.admitted','member.declined','member.removed')$q$,
             t.get('hub'))) = '11');

rollback;
