-- 18: Hub invitation codes: create, preview, redeem, limits, expiry, revocation, and what they never grant.
select set_config('t.file', '18_invites', false);
begin;

create function t.sid(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8900-' || lpad((200 + n)::text, 12, '0'))::uuid $$;

update lv_private.policy set value = '["https://auth.test.invalid"]'::jsonb where key = 'identity.trusted_issuers';
-- people: 1 owner, 2 admitter (role), 3 student, 4 student, 5 student, 6 outsider, 7 to be removed
select t.as_central(t.sid(1), 'owner@example.invalid', true); select public.lv_my_context();
select t.as_central(t.sid(2), 'mod@example.invalid', true);   select public.lv_my_context();
select t.as_central(t.sid(3), 's3@example.invalid', true);    select public.lv_my_context();
select t.as_central(t.sid(4), 's4@example.invalid', true);    select public.lv_my_context();
select t.as_central(t.sid(5), 's5@example.invalid', true);    select public.lv_my_context();
select t.as_central(t.sid(6), 's6@example.invalid', true);    select public.lv_my_context();
select t.as_central(t.sid(7), 's7@example.invalid', true);    select public.lv_my_context();
select t.as_pg();
insert into lv_private.hubs (id, slug, display_name, visibility, membership_mode) values ('00000000-0000-4000-8a00-0000000000c1', 'lioncafe', 'LionCafe', 'private', 'invite_only');
insert into lv_private.hub_memberships (hub_id, account_id, status, joined_at) values ('00000000-0000-4000-8a00-0000000000c1', t.sid(1), 'accepted', now());
update lv_private.hubs set owner_account_id = t.sid(1) where slug = 'lioncafe';
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values ('00000000-0000-4000-8a00-0000000000c1', 'team', 'synthetic');
insert into lv_private.hubs (id, slug, display_name) values ('00000000-0000-4000-8a00-0000000000c2', 'other', 'Other Hub');
select t.put('hub', '00000000-0000-4000-8a00-0000000000c1');
select t.put('other', '00000000-0000-4000-8a00-0000000000c2');

-- ---- create
select t.as_central(t.sid(3), 's3@example.invalid', true);
select t.check('a person with no role cannot create an invitation', t.code(public.lv_invite_create(t.get('hub')::uuid)) = 'lv_forbidden');
select t.as_anon();
select t.check('anon cannot create one', t.code(public.lv_invite_create(t.get('hub')::uuid)) = 'lv_unauthenticated');
select t.as_central(t.sid(1), 'owner@example.invalid', true);
select t.check('invalid settings are refused', t.code(public.lv_invite_create(t.get('hub')::uuid, 0)) = 'lv_invalid_input'
  and t.code(public.lv_invite_create(t.get('hub')::uuid, null, now() - interval '1 hour')) = 'lv_invalid_input'
  and t.code(public.lv_invite_create(null)) = 'lv_invalid_input' and t.code(public.lv_invite_create(gen_random_uuid())) = 'lv_not_found');
select t.put('res1', public.lv_invite_create(t.get('hub')::uuid, null, null, 'general')::text);
select t.check('the Owner creates an invitation and receives the code once', (t.get('res1')::jsonb->>'ok')::boolean and length(t.get('res1')::jsonb->'data'->>'code') = 20);
select t.put('code1', t.get('res1')::jsonb->'data'->>'code');
select t.put('inv1', t.get('res1')::jsonb->'data'->>'id');
select t.check('the list shows status and a four-character hint but never the code', public.lv_invite_list(t.get('hub')::uuid)::text not like '%' || t.get('code1') || '%'
  and public.lv_invite_list(t.get('hub')::uuid)->'data'->'invites'->0->>'status' = 'active'
  and public.lv_invite_list(t.get('hub')::uuid)->'data'->'invites'->0->>'code_hint' = right(t.get('code1'), 4));
select t.as_pg();
select t.check('only the hash is stored', not exists (select 1 from lv_private.hub_invites where code_hash = t.get('code1')) and exists (select 1 from lv_private.hub_invites where code_hash = lv_private.invite_hash(t.get('code1'))));

-- a delegated admitter (role with admin.members.admit) can manage too
select t.as_central(t.sid(1), 'owner@example.invalid', true);
select public.lv_role_create(t.get('hub')::uuid, 'Greeter', null, array['admin.members.admit']);
select t.as_pg();
select t.put('role', (select id::text from lv_private.roles where hub_id = t.get('hub')::uuid));
insert into lv_private.hub_memberships (hub_id, account_id, status, joined_at) values (t.get('hub')::uuid, t.sid(2), 'accepted', now());
select t.as_central(t.sid(1), 'owner@example.invalid', true);
select public.lv_role_assign(t.get('role')::uuid, t.sid(2));
select t.as_central(t.sid(2), 'mod@example.invalid', true);
select t.check('a member holding admin.members.admit can create and list invitations', t.code(public.lv_invite_create(t.get('hub')::uuid, 1)) = 'ok' and t.code(public.lv_invite_list(t.get('hub')::uuid)) = 'ok');
select t.as_central(t.sid(1), 'owner@example.invalid', true);
select t.check('...and cannot touch another Hub', t.code(public.lv_invite_create(t.get('other')::uuid)) = 'lv_forbidden');

-- ---- preview
select t.as_anon();
select t.check('anyone holding a valid code can preview the Hub name and address', public.lv_invite_preview(t.get('code1'))->'data'->>'hub_name' = 'LionCafe'
  and public.lv_invite_preview(upper(t.get('code1')))->'data'->>'hub_slug' = 'lioncafe');
select t.check('a wrong, short or empty code is not found, identically', t.code(public.lv_invite_preview('0000000000000000000a')) = 'lv_not_found' and t.code(public.lv_invite_preview('x')) = 'lv_not_found'
  and t.code(public.lv_invite_preview(null)) = 'lv_not_found'
  and public.lv_invite_preview('0000000000000000000a')->'error'->>'message' = public.lv_invite_preview(null)->'error'->>'message');

-- ---- redeem
select t.check('anon cannot redeem', t.code(public.lv_invite_redeem(t.get('code1'))) = 'lv_unauthenticated');
select t.as_central(t.sid(3), 's3@example.invalid', true);
select t.check('before redeeming the student is not a member and cannot join an invite-only Hub', t.code(public.lv_join_hub(t.get('hub')::uuid)) = 'lv_forbidden');
select t.check('a wrong code does nothing', t.code(public.lv_invite_redeem('0000000000000000000a')) = 'lv_not_found');
select t.check('redeeming a valid code admits the student as an accepted member', t.code(public.lv_invite_redeem(t.get('code1'))) = 'ok'
  and public.lv_my_context()->'data'->'memberships'->0->>'name' = 'LionCafe');
select t.check('redeeming again is harmless and says so', (public.lv_invite_redeem(t.get('code1'))->'data'->>'already_member')::boolean);
select t.as_pg();
select t.check('exactly one use was counted for the two redemptions', (select uses from lv_private.hub_invites where code_hash = lv_private.invite_hash(t.get('code1'))) = 1);
select t.check('the new member holds no role and is not the Owner', not exists (select 1 from lv_private.role_assignments where account_id = t.sid(3))
  and (select owner_account_id from lv_private.hubs where slug = 'lioncafe') = t.sid(1));

-- ---- limits: max_uses 1
select t.as_central(t.sid(1), 'owner@example.invalid', true);
select t.put('res2', public.lv_invite_create(t.get('hub')::uuid, 1)::text);
select t.put('code2', t.get('res2')::jsonb->'data'->>'code');
select t.as_central(t.sid(4), 's4@example.invalid', true);
select t.check('a single-use invitation admits the first person', t.code(public.lv_invite_redeem(t.get('code2'))) = 'ok');
select t.as_central(t.sid(5), 's5@example.invalid', true);
select t.check('...and is not valid for the second', t.code(public.lv_invite_redeem(t.get('code2'))) = 'lv_not_found'
  and t.code(public.lv_invite_preview(t.get('code2'))) = 'lv_not_found');
select t.as_pg();
select t.check('...and the second person is not a member', not exists (select 1 from lv_private.hub_memberships where hub_id = t.get('hub')::uuid and account_id = t.sid(5)));

-- ---- expiry
insert into lv_private.hub_invites (hub_id, code_hash, code_hint, created_by, created_at, expires_at)
  values (t.get('hub')::uuid, lv_private.invite_hash('expiredcode0000000001'), '0001', t.sid(1), now() - interval '2 days', now() - interval '1 day');
select t.as_central(t.sid(5), 's5@example.invalid', true);
select t.check('an expired invitation is not valid', t.code(public.lv_invite_redeem('expiredcode0000000001')) = 'lv_not_found');
select t.as_central(t.sid(1), 'owner@example.invalid', true);
select t.check('the list reports it as expired', exists (select 1 from jsonb_array_elements(public.lv_invite_list(t.get('hub')::uuid)->'data'->'invites') e where e->>'status' = 'expired'));

-- ---- revoke
select t.put('res3', public.lv_invite_create(t.get('hub')::uuid)::text);
select t.put('code3', t.get('res3')::jsonb->'data'->>'code');
select t.put('inv3', t.get('res3')::jsonb->'data'->>'id');
select t.as_central(t.sid(3), 's3@example.invalid', true);
select t.check('a plain member cannot revoke an invitation, and learns nothing about it', t.code(public.lv_invite_revoke(t.get('inv3')::uuid)) = 'lv_not_found');
select t.as_central(t.sid(1), 'owner@example.invalid', true);
select t.check('the Owner revokes it', public.lv_invite_revoke(t.get('inv3')::uuid)->'data'->>'status' = 'revoked' and t.code(public.lv_invite_revoke(t.get('inv3')::uuid)) = 'ok');
select t.as_central(t.sid(5), 's5@example.invalid', true);
select t.check('a revoked invitation no longer admits anyone', t.code(public.lv_invite_redeem(t.get('code3'))) = 'lv_not_found');

-- ---- people the Hub has excluded stay excluded
select t.as_pg();
insert into lv_private.hub_memberships (hub_id, account_id, status) values (t.get('hub')::uuid, t.sid(7), 'removed');
select t.as_central(t.sid(7), 's7@example.invalid', true);
select t.check('a removed person is not readmitted by a code', t.code(public.lv_invite_redeem(t.get('code1'))) = 'lv_forbidden');
select t.as_pg();
select t.check('...and their status did not change', t.q($$select status from lv_private.hub_memberships where account_id = $$ || quote_literal(t.sid(7))) = 'removed');

-- ---- invitations never cross Hubs
select t.as_central(t.sid(6), 's6@example.invalid', true);
select t.check('redeeming a LionCafe code does not admit to another Hub', t.code(public.lv_invite_redeem(t.get('code1'))) = 'ok');
select t.as_pg();
select t.check('...only LionCafe', t.q($$select count(*) from lv_private.hub_memberships where account_id = $$ || quote_literal(t.sid(6))) = '1'
  and not exists (select 1 from lv_private.hub_memberships where hub_id = t.get('other')::uuid and account_id = t.sid(6)));

-- ---- the API cannot read the tables
select t.as_central(t.sid(1), 'owner@example.invalid', true);
select t.check('the API roles cannot read invitations or redemptions', t.raises('select * from lv_private.hub_invites', '42501') and t.raises('select * from lv_private.hub_invite_redemptions', '42501'));

rollback;
