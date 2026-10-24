-- 07: roles and capabilities: slots, catalog, toggles, server-side enforcement, no privilege escalation,
-- cross-Hub isolation, immediate revocation.
select set_config('t.file', '07_roles', false);
begin;

-- Fixture. Hub A (LionCafe): Owner u2, members u1(legacy admin) u3 u4 u5 u6. Hub B: Owner u11. Outsider u21.
select lv_private.backfill_org_hub(t.org_a(), t.u(2));
select lv_private.backfill_org_hub(t.org_b(), t.u(11));
insert into public.orgs (id, slug, name) values ('00000000-0000-4000-8001-0000000000c3', 'synthetic-three', 'Synthetic Org Three');
insert into auth.users (id, email, raw_user_meta_data)
  values (t.u(21), 'outsider21@example.invalid', '{"display_name":"Outsider 21","org_id":"00000000-0000-4000-8001-0000000000c3"}');

select t.check('the migration itself creates no entitlement grants', (select count(*) from lv_private.entitlement_grants) = 0);
select t.check('Owner-only policy values start UNSET (fail closed)', (select count(*) from lv_private.policy where value is not null) = 0);

-- ---- catalog
select t.as_anon();
select t.check('anon: catalog is unauthenticated', t.code(public.lv_capability_catalog()) = 'lv_unauthenticated');
select t.as_user(t.u(3));
select t.check('catalog: 27 capabilities', jsonb_array_length(public.lv_capability_catalog()->'data'->'capabilities') = 27);
select t.check('catalog: 10 administration, 6 structure, 11 community',
  (select count(*) from jsonb_array_elements(public.lv_capability_catalog()->'data'->'capabilities') c where c->>'category' = 'administration') = 10
  and (select count(*) from jsonb_array_elements(public.lv_capability_catalog()->'data'->'capabilities') c where c->>'category' = 'structure') = 6
  and (select count(*) from jsonb_array_elements(public.lv_capability_catalog()->'data'->'capabilities') c where c->>'category' = 'community') = 11);
select t.check('catalog: Owner-only operations are listed outside the grantable set',
  public.lv_capability_catalog()->'data'->'owner_only' = '["hub.delete","hub.transfer_ownership"]'::jsonb
  and not exists (select 1 from jsonb_array_elements(public.lv_capability_catalog()->'data'->'capabilities') c where c->>'id' like 'hub.%'));
select t.as_pg();
select t.check('the database refuses a hub.* capability in the catalog', t.raises($$insert into lv_private.capabilities (id, category, sort) values ('hub.delete', 'administration', 99)$$, '23514'));
select t.check('...including hub.transfer_ownership', t.raises($$insert into lv_private.capabilities (id, category, sort) values ('hub.transfer_ownership', 'administration', 98)$$, '23514'));

-- ---- slots: no grant, undecided plan, Starter 3, Team 6, expiry
select t.as_user(t.u(2));
select t.check('no entitlement: role creation is lv_entitlement_missing', t.code(public.lv_role_create(t.org_a(), 'Moderator', null, array['admin.members.admit'])) = 'lv_entitlement_missing');
select t.as_pg();
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (t.org_a(), 'manual', 'synthetic');
select t.as_user(t.u(2));
select t.check('a plan with no decided role allowance is lv_policy_undecided', t.code(public.lv_role_create(t.org_a(), 'Moderator', null, '{}')) = 'lv_policy_undecided');
select t.as_pg();
delete from lv_private.entitlement_grants where hub_id = t.org_a();
insert into lv_private.entitlement_grants (hub_id, plan_code, source, valid_from, valid_to) values (t.org_a(), 'starter', 'synthetic', now() - interval '2 days', now() - interval '1 day');
select t.as_user(t.u(2));
select t.check('an expired grant is no entitlement', t.code(public.lv_role_create(t.org_a(), 'Moderator', null, '{}')) = 'lv_entitlement_missing');
select t.as_pg();
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (t.org_a(), 'starter', 'synthetic');

select t.as_user(t.u(2));
select t.put('mod', public.lv_role_create(t.org_a(), 'Moderator', 'shield', array['admin.members.admit', 'admin.members.remove', 'admin.members.suspend'])->'data'->>'id');
select t.put('surveyor', public.lv_role_create(t.org_a(), 'Surveyor', 'clipboard', array['community.campaign.draft', 'community.campaign.activate', 'community.campaign.close'])->'data'->>'id');
select t.put('rolemgr', public.lv_role_create(t.org_a(), 'Role Manager', null, array['admin.roles.manage', 'admin.members.admit'])->'data'->>'id');
select t.check('Starter: three custom roles created', t.q($$select count(*) from lv_private.roles where hub_id = t.org_a()$$) = '3');
select t.check('Starter: the fourth is lv_quota_exceeded with limit 3 and used 3', public.lv_role_create(t.org_a(), 'Fourth', null, '{}')->'error'->'details' = '{"limit":3,"used":3}'::jsonb);
select t.check('slots: the Owner does not consume one (used 3 of 3, three roles)', public.lv_role_list(t.org_a())->'data'->'slots' = '{"used":3,"limit":3}'::jsonb);
select t.check('role_list returns the three roles with their capabilities', jsonb_array_length(public.lv_role_list(t.org_a())->'data'->'roles') = 3);
select t.check('a duplicate name (case-insensitive) is lv_conflict', t.code(public.lv_role_delete(t.id('surveyor'))) = 'ok' and t.code(public.lv_role_create(t.org_a(), '  moderator ', null, '{}')) = 'lv_conflict');
select t.check('deleting a role frees its slot', t.code(public.lv_role_create(t.org_a(), 'Surveyor', 'clipboard', array['community.campaign.draft', 'community.campaign.activate', 'community.campaign.close'])) = 'ok');
select t.put('surveyor', t.q($$select id from lv_private.roles where hub_id = t.org_a() and name = 'Surveyor'$$));
select t.as_pg();
select t.check('database backstop: a direct insert past the limit is refused', t.raises($$insert into lv_private.roles (hub_id, name) values (t.org_a(), 'Sneaky')$$, '53400'));
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (t.org_b(), 'team', 'synthetic');
select t.as_user(t.u(11));
select count(*) filter (where public.lv_role_create(t.org_b(), 'Role ' || n, null, '{}')->>'ok' = 'true') as created from generate_series(1, 6) n \gset
select t.check('Team: six custom roles', :created = 6);
select t.check('Team: the seventh is lv_quota_exceeded with limit 6', public.lv_role_create(t.org_b(), 'Seventh', null, '{}')->'error'->'details' = '{"limit":6,"used":6}'::jsonb);

-- ---- validation
select t.as_user(t.u(2));
select t.as_pg();
delete from lv_private.roles where hub_id = t.org_a() and name = 'Role Manager';
select t.as_user(t.u(2));
select t.check('empty name is invalid_input', t.code(public.lv_role_create(t.org_a(), '   ', null, '{}')) = 'lv_invalid_input');
select t.check('41-character name is invalid_input', t.code(public.lv_role_create(t.org_a(), repeat('x', 41), null, '{}')) = 'lv_invalid_input');
select t.check('65-character icon is invalid_input', t.code(public.lv_role_create(t.org_a(), 'Ok', repeat('i', 65), '{}')) = 'lv_invalid_input');
select t.check('unknown capability is invalid_input', public.lv_role_create(t.org_a(), 'Ok', null, array['x.y.z'])->'error'->'details'->'ungrantable' = '["x.y.z"]'::jsonb);
select t.check('hub.delete can never be granted', t.code(public.lv_role_create(t.org_a(), 'Ok', null, array['hub.delete'])) = 'lv_invalid_input');
select t.check('hub.transfer_ownership can never be granted', t.code(public.lv_role_create(t.org_a(), 'Ok', null, array['hub.transfer_ownership'])) = 'lv_invalid_input');
select t.check('...nor toggled on an existing role', t.code(public.lv_role_set_capability(t.id('mod'), 'hub.delete', true)) = 'lv_invalid_input');
select t.check('invalid category is invalid_input', t.code(public.lv_role_set_group(t.id('mod'), 'owner', true)) = 'lv_invalid_input');

-- Recreate the Role Manager (a slot is free again).
select t.put('rolemgr', public.lv_role_create(t.org_a(), 'Role Manager', null, array['admin.roles.manage', 'admin.members.admit'])->'data'->>'id');
select t.check('Role Manager created', t.id('rolemgr') is not null);

-- ---- toggles: individual and group (Owner holds everything delegable)
select t.check('individual toggle on', public.lv_role_set_capability(t.id('surveyor'), 'community.analytics.view', true)->'data'->'capabilities' @> '["community.analytics.view"]'::jsonb);
select t.check('individual toggle off', not (public.lv_role_set_capability(t.id('surveyor'), 'community.analytics.view', false)->'data'->'capabilities' @> '["community.analytics.view"]'::jsonb));
select t.check('group toggle on: all 6 structure capabilities',
  (select count(*) from jsonb_array_elements_text(public.lv_role_set_group(t.id('surveyor'), 'structure', true)->'data'->'capabilities') c where c like 'structure.%') = 6);
select t.check('group toggle on affects only that category', (select count(*) from jsonb_array_elements_text(public.lv_role_set_group(t.id('surveyor'), 'structure', true)->'data'->'capabilities') c where c like 'admin.%') = 0);
select t.check('group toggle off removes the category', (select count(*) from jsonb_array_elements_text(public.lv_role_set_group(t.id('surveyor'), 'structure', false)->'data'->'capabilities') c where c like 'structure.%') = 0);
select t.check('Administration group on for the Owner: 10 capabilities', (select count(*) from jsonb_array_elements_text(public.lv_role_set_group(t.id('mod'), 'administration', true)->'data'->'capabilities') c) = 10);
select t.check('role update replaces capabilities', public.lv_role_update(t.id('mod'), null, null, array['admin.members.admit', 'admin.members.remove', 'admin.members.suspend'])->'data'->'capabilities' = '["admin.members.admit","admin.members.remove","admin.members.suspend"]'::jsonb);
select t.check('role update renames and keeps capabilities', public.lv_role_update(t.id('mod'), 'Moderators', null, null)->'data'->>'name' = 'Moderators');
select t.check('role update: empty icon clears it', public.lv_role_update(t.id('mod'), null, '', null)->'data'->'icon' = 'null'::jsonb);
select t.check('role update to a duplicate name is lv_conflict', t.code(public.lv_role_update(t.id('mod'), 'surveyor', null, null)) = 'lv_conflict');
select t.check('toggle on an unknown role is not_found', t.code(public.lv_role_set_capability(gen_random_uuid(), 'admin.members.admit', true)) = 'lv_not_found');

-- ---- assignment, cross-Hub, effective capabilities
select t.check('assign Moderators to u3', public.lv_role_assign(t.id('mod'), t.u(3))->'data'->>'status' = 'accepted');
select t.check('assign is idempotent', t.code(public.lv_role_assign(t.id('mod'), t.u(3))) = 'ok');
select t.check('assigned_count is 1', (select (r->>'assigned_count')::int from jsonb_array_elements(public.lv_role_list(t.org_a())->'data'->'roles') r where r->>'name' = 'Moderators') = 1);
select t.check('cannot assign a role to the Owner', t.code(public.lv_role_assign(t.id('mod'), t.u(2))) = 'lv_forbidden');
select t.check('cannot assign to someone from another Hub', t.code(public.lv_role_assign(t.id('mod'), t.u(11))) = 'lv_not_member');
select t.check('cannot assign to a non-member', t.code(public.lv_role_assign(t.id('mod'), t.u(21))) = 'lv_not_member');
select t.check('unknown role is not_found', t.code(public.lv_role_assign(gen_random_uuid(), t.u(3))) = 'lv_not_found');
select t.as_pg();
update lv_private.hub_memberships set status = 'suspended' where hub_id = t.org_a() and account_id = t.u(6);
select t.as_user(t.u(2));
select t.check('cannot assign to a suspended member', t.code(public.lv_role_assign(t.id('mod'), t.u(6))) = 'lv_not_member');
select t.as_pg();
update lv_private.hub_memberships set status = 'accepted' where hub_id = t.org_a() and account_id = t.u(6);
select t.as_user(t.u(3));
select t.check('context shows the role and its capabilities',
  public.lv_my_context()->'data'->'memberships'->0->'roles'->0->>'name' = 'Moderators'
  and public.lv_my_context()->'data'->'memberships'->0->'capabilities' = '["admin.members.admit","admin.members.remove","admin.members.suspend"]'::jsonb);
select t.check('holder can now list members (capability enforced server-side)', t.code(public.lv_members_list(t.org_a())) = 'ok');
select t.check('the member list shows their role', exists (select 1 from jsonb_array_elements(public.lv_members_list(t.org_a())->'data'->'members') m where m->>'account_id' = t.u(3)::text and m->'roles'->0->>'name' = 'Moderators'));
select t.check('...but the role does not reach other Hubs', t.code(public.lv_members_list(t.org_b())) = 'lv_forbidden');
select t.check('...and does not include capabilities it lacks (roles.manage)', t.code(public.lv_role_list(t.org_a())) = 'lv_forbidden');
select t.check('...nor the Owner-only operations', t.code(public.lv_owner_transfer_start(t.org_a(), t.u(4))) = 'lv_forbidden');
select t.as_user(t.u(1));
select t.check('the legacy staff admin still holds nothing in v2', t.code(public.lv_members_list(t.org_a())) = 'lv_forbidden');

-- ---- privilege escalation: u4 is a Role Manager (roles.manage + members.admit) and nothing else
select t.as_user(t.u(2));
select t.check('assign Role Manager to u4', t.code(public.lv_role_assign(t.id('rolemgr'), t.u(4))) = 'ok');
select t.as_user(t.u(4));
select t.check('manager can list roles', t.code(public.lv_role_list(t.org_a())) = 'ok');
select t.check('manager cannot create a role carrying a capability they lack', public.lv_role_create(t.org_a(), 'Escalate', null, array['community.campaign.activate'])->'error'->'details'->>'reason' = 'cannot_grant_unheld_capability');
select t.check('...and the failed attempt created nothing', t.q($$select count(*) from lv_private.roles where hub_id = t.org_a() and name = 'Escalate'$$) = '0');
select t.check('manager cannot assign a more powerful role (Moderators)', public.lv_role_assign(t.id('mod'), t.u(5))->'error'->'details'->>'reason' = 'role_exceeds_your_authority');
select t.check('manager cannot assign a more powerful role to themselves', t.code(public.lv_role_assign(t.id('surveyor'), t.u(4))) = 'lv_forbidden');
select t.check('manager cannot edit a more powerful role', t.code(public.lv_role_update(t.id('mod'), 'Mine now', null, null)) = 'lv_forbidden');
select t.check('manager cannot delete a more powerful role', t.code(public.lv_role_delete(t.id('mod'))) = 'lv_forbidden');
select t.check('manager cannot unassign a more powerful role from its holder', t.code(public.lv_role_unassign(t.id('mod'), t.u(3))) = 'lv_forbidden');
select t.check('manager cannot toggle on a capability they lack', t.code(public.lv_role_set_capability(t.id('rolemgr'), 'admin.billing.manage', true)) = 'lv_forbidden');
select t.check('manager cannot enable a whole category they only partly hold', public.lv_role_set_group(t.id('rolemgr'), 'administration', true)->'error'->'details'->>'reason' = 'cannot_grant_unheld_capability');
select t.check('manager cannot enable the community category', t.code(public.lv_role_set_group(t.id('rolemgr'), 'community', true)) = 'lv_forbidden');
select t.check('...and none of those attempts changed Role Manager', t.q(format('select count(*) from lv_private.role_capabilities where role_id = %L', t.id('rolemgr'))) = '2');
select t.as_pg();
delete from lv_private.roles where hub_id = t.org_a() and name = 'Surveyor';
select t.as_user(t.u(4));
select t.check('manager CAN create a role from capabilities they hold', t.code(public.lv_role_create(t.org_a(), 'Greeters', null, array['admin.members.admit'])) = 'ok');
select t.put('greeters', t.q($$select id from lv_private.roles where hub_id = t.org_a() and name = 'Greeters'$$));
select t.check('manager CAN assign a role within their authority', t.code(public.lv_role_assign(t.id('greeters'), t.u(5))) = 'ok');
select t.check('manager CAN unassign a role within their authority', t.code(public.lv_role_unassign(t.id('greeters'), t.u(5))) = 'ok');
select t.check('unassigning a role nobody holds is not_found', t.code(public.lv_role_unassign(t.id('greeters'), t.u(5))) = 'lv_not_found');
select t.check('Owner-only capabilities stay un-grantable even by a manager', t.code(public.lv_role_set_capability(t.id('greeters'), 'hub.transfer_ownership', true)) = 'lv_invalid_input');

-- ---- cross-Hub isolation of managers
select t.as_user(t.u(11));
select t.check('Hub B owner cannot list Hub A roles', t.code(public.lv_role_list(t.org_a())) = 'lv_forbidden');
select t.check('Hub B owner cannot assign a Hub A role', t.code(public.lv_role_assign(t.id('mod'), t.u(11))) = 'lv_forbidden');
select t.check('Hub B owner cannot edit a Hub A role', t.code(public.lv_role_update(t.id('mod'), 'Hijack', null, null)) = 'lv_forbidden');
select t.check('Hub B owner cannot delete a Hub A role', t.code(public.lv_role_delete(t.id('mod'))) = 'lv_forbidden');
select t.as_user(t.u(4));
select t.check('Hub A manager has nothing in Hub B', t.code(public.lv_role_list(t.org_b())) = 'lv_forbidden');

-- ---- members with authority cannot be removed or suspended by lesser members
select t.as_user(t.u(2));
select t.as_pg();
delete from lv_private.roles where hub_id = t.org_a() and name = 'Greeters';
select t.as_user(t.u(2));
select t.check('Remover role created', t.code(public.lv_role_create(t.org_a(), 'Remover', null, array['admin.members.remove'])) = 'ok');
select t.put('remover', t.q($$select id from lv_private.roles where hub_id = t.org_a() and name = 'Remover'$$));
select t.check('assign Remover to u5', t.code(public.lv_role_assign(t.id('remover'), t.u(5))) = 'ok');
select t.as_user(t.u(5));
select t.check('a lesser member cannot remove a member with more authority', public.lv_remove_member(t.org_a(), t.u(3))->'error'->'details'->>'reason' = 'target_exceeds_your_authority');
select t.check('...but can remove an ordinary member', t.code(public.lv_remove_member(t.org_a(), t.u(6))) = 'ok');
select t.check('u5 cannot suspend (does not hold that capability)', t.code(public.lv_suspend_member(t.org_a(), t.u(3))) = 'lv_forbidden');

-- ---- revocation is immediate
select t.as_user(t.u(3));
select t.check('before revocation: u3 can list members', t.code(public.lv_members_list(t.org_a())) = 'ok');
select t.as_user(t.u(4));
select t.check('...u4 cannot unassign it (Moderators exceeds Role Manager)', t.code(public.lv_role_unassign(t.id('mod'), t.u(3))) = 'lv_forbidden');
select t.as_user(t.u(2));
select t.check('Owner toggles one capability off the role', not (public.lv_role_set_capability(t.id('mod'), 'admin.members.admit', false)->'data'->'capabilities' @> '["admin.members.admit"]'::jsonb));
select t.as_user(t.u(3));
select t.check('after toggling off: u3 can no longer list members', t.code(public.lv_members_list(t.org_a())) = 'lv_forbidden');
select t.check('after toggling off: advisory capabilities shrink', not (public.lv_my_context()->'data'->'memberships'->0->'capabilities' @> '["admin.members.admit"]'::jsonb));
select t.as_user(t.u(2));
select t.check('Owner toggles it back on', public.lv_role_set_capability(t.id('mod'), 'admin.members.admit', true)->'data'->'capabilities' @> '["admin.members.admit"]'::jsonb);
select t.check('Owner unassigns the role', t.code(public.lv_role_unassign(t.id('mod'), t.u(3))) = 'ok');
select t.as_user(t.u(3));
select t.check('after unassign: access is gone immediately', t.code(public.lv_members_list(t.org_a())) = 'lv_forbidden');
select t.as_user(t.u(2));
select t.check('Owner re-assigns, then deletes the role', t.code(public.lv_role_assign(t.id('mod'), t.u(3))) = 'ok' and t.code(public.lv_role_delete(t.id('mod'))) = 'ok');
select t.as_user(t.u(3));
select t.check('after role deletion: access is gone and no assignment survives', t.code(public.lv_members_list(t.org_a())) = 'lv_forbidden');
select t.as_pg();
select t.check('...no orphan assignment rows', not exists (select 1 from lv_private.role_assignments ra where not exists (select 1 from lv_private.roles r where r.id = ra.role_id)));

-- Suspension, removal and leaving drop assignments; returning to accepted does not bring them back.
select t.as_user(t.u(2));
select t.put('mod2', public.lv_role_create(t.org_a(), 'Moderators', null, array['admin.members.admit'])->'data'->>'id');
select t.check('assign again', t.code(public.lv_role_assign(t.id('mod2'), t.u(3))) = 'ok');
select t.check('suspend the role holder', t.code(public.lv_suspend_member(t.org_a(), t.u(3))) = 'ok');
select t.as_pg();
select t.check('suspension dropped the assignment', not exists (select 1 from lv_private.role_assignments where account_id = t.u(3)));
update lv_private.hub_memberships set status = 'accepted' where hub_id = t.org_a() and account_id = t.u(3);
select t.as_user(t.u(3));
select t.check('restored member has no roles or capabilities', public.lv_my_context()->'data'->'memberships'->0->'roles' = '[]'::jsonb and public.lv_my_context()->'data'->'memberships'->0->'capabilities' = '[]'::jsonb);

-- ---- Owner context and direct API denial
select t.as_user(t.u(2));
select t.check('Owner context: every delegable capability, no hub.* id', jsonb_array_length(public.lv_my_context()->'data'->'memberships'->0->'capabilities') = 27
  and not (public.lv_my_context()->'data'->'memberships'->0->'capabilities')::text like '%hub.%');
select t.as_user(t.u(3));
select t.check('direct: cannot read roles', t.raises('select * from lv_private.roles', '42501'));
select t.check('direct: cannot read the capability catalog', t.raises('select * from lv_private.capabilities', '42501'));
select t.check('direct: cannot grant itself a role', t.raises($$insert into lv_private.role_assignments (hub_id, account_id, role_id) values (t.org_a(), t.u(3), t.id('mod2'))$$, '42501'));
select t.check('direct: cannot read entitlement grants', t.raises('select * from lv_private.entitlement_grants', '42501'));
select t.check('direct: cannot call a role helper', t.raises($$select lv_private.held_capabilities(t.org_a(), t.u(3))$$, '42501'));
select t.as_anon();
select t.check('anon: role operations are unauthenticated', t.code(public.lv_role_create(t.org_a(), 'x', null, '{}')) = 'lv_unauthenticated'
  and t.code(public.lv_role_assign(t.id('mod2'), t.u(3))) = 'lv_unauthenticated' and t.code(public.lv_role_list(t.org_a())) = 'lv_unauthenticated');
select t.as_pg();
insert into auth.users (id, email, raw_user_meta_data)
  values (t.u(41), 'hub.b.member@example.invalid', jsonb_build_object('display_name', 'Hub B Member', 'org_id', t.org_b()));
select t.check('precondition: u41 is an accepted member of Hub B', t.q($$select status from lv_private.hub_memberships where hub_id = t.org_b() and account_id = t.u(41)$$) = 'accepted');
select t.check('the database refuses a cross-Hub assignment even for SQL (composite foreign keys)',
  t.raises($$insert into lv_private.role_assignments (hub_id, account_id, role_id) values (t.org_b(), t.u(41), t.id('mod2'))$$, '23503'));
select t.check('the database refuses an assignment for a non-member', t.raises($$insert into lv_private.role_assignments (hub_id, account_id, role_id) values (t.org_a(), t.u(21), t.id('mod2'))$$, '23503'));
select t.check('the database refuses a role for the Owner', t.raises($$insert into lv_private.role_assignments (hub_id, account_id, role_id) values (t.org_a(), t.u(2), t.id('mod2'))$$, '42501'));

rollback;
