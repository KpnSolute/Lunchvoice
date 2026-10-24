-- 03: membership flows, authorization (allow/deny), cross-Hub isolation, counts, and direct API denial.
select set_config('t.file', '03_membership_flows', false);
begin;

-- Fixture: Hub A = LionCafe (private, invite_only; Owner u2), Hub B = synthetic-two (public, approval; Owner u11),
-- plus outsiders u21..u26 whose legacy org (C) is not a Hub.
select lv_private.backfill_org_hub(t.org_a(), t.u(2));
select lv_private.backfill_org_hub(t.org_b(), t.u(11));
update lv_private.hubs set visibility = 'public', membership_mode = 'approval' where id = t.org_b();
insert into public.orgs (id, slug, name) values ('00000000-0000-4000-8001-0000000000c3', 'synthetic-three', 'Synthetic Org Three');
insert into auth.users (id, email, raw_user_meta_data)
  select t.u(n), 'outsider' || n || '@example.invalid',
         jsonb_build_object('display_name', 'Outsider ' || n, 'org_id', '00000000-0000-4000-8001-0000000000c3')
  from generate_series(21, 26) n;

-- ---- anonymous callers
select t.as_anon();
select t.check('anon: my_context is unauthenticated', t.code(public.lv_my_context()) = 'lv_unauthenticated');
select t.check('anon: join is unauthenticated', t.code(public.lv_join_hub(t.org_b())) = 'lv_unauthenticated');
select t.check('anon: decide is unauthenticated', t.code(public.lv_decide_join(t.org_b(), t.u(11), 'accept')) = 'lv_unauthenticated');
select t.check('anon: remove is unauthenticated', t.code(public.lv_remove_member(t.org_b(), t.u(11))) = 'lv_unauthenticated');
select t.check('anon: suspend is unauthenticated', t.code(public.lv_suspend_member(t.org_b(), t.u(11))) = 'lv_unauthenticated');
select t.check('anon: members_list is unauthenticated', t.code(public.lv_members_list(t.org_b())) = 'lv_unauthenticated');
select t.check('anon: leave is unauthenticated', t.code(public.lv_leave_hub(t.org_b())) = 'lv_unauthenticated');
select t.check('anon: public Hub card works', t.code(public.lv_hub_public('synthetic-two')) = 'ok');
select t.check('anon: public Hub shows its accepted count', (public.lv_hub_public('synthetic-two')->'data'->>'member_count')::int = 1);
select t.check('anon: private Hub card hides the count', public.lv_hub_public('lioncafe')->'data'->'member_count' = 'null'::jsonb);
select t.check('anon: private Hub card shows no viewer access', public.lv_hub_public('lioncafe')->'data'->'viewer' = '{"status":"none","can_join":false}'::jsonb);
select t.check('anon: private Hub count is not_found', t.code(public.lv_member_count(t.org_a())) = 'lv_not_found');
select t.check('anon: public Hub count works', (public.lv_member_count(t.org_b())->'data'->>'member_count')::int = 1);
select t.check('unknown slug is not_found', t.code(public.lv_hub_public('no-such-hub')) = 'lv_not_found');
select t.check('invalid slug is invalid_input', t.code(public.lv_hub_public('x')) = 'lv_invalid_input');
select t.check('envelope carries a request id', length(public.lv_hub_public('no-such-hub')->>'request_id') > 4);

-- ---- context and isolation
select t.as_user(t.u(3));
select t.check('member context: ok', t.code(public.lv_my_context()) = 'ok');
select t.check('member context: account id is the preserved legacy id', (public.lv_my_context()->'data'->'account'->>'id')::uuid = t.u(3));
select t.check('member context: exactly one accepted membership, Hub A',
  jsonb_array_length(public.lv_my_context()->'data'->'memberships') = 1
  and (public.lv_my_context()->'data'->'memberships'->0->>'hub_id')::uuid = t.org_a());
select t.check('member context: slug is the lower-case deep link', public.lv_my_context()->'data'->'memberships'->0->>'slug' = 'lioncafe');
select t.check('member context: not owner, no roles, no capabilities',
  (public.lv_my_context()->'data'->'memberships'->0->>'is_owner')::boolean = false
  and public.lv_my_context()->'data'->'memberships'->0->'roles' = '[]'::jsonb
  and public.lv_my_context()->'data'->'memberships'->0->'capabilities' = '[]'::jsonb);
select t.check('member context: pending is empty', public.lv_my_context()->'data'->'pending' = '[]'::jsonb);
select t.check('member sees the private Hub count', (public.lv_hub_public('lioncafe')->'data'->>'member_count')::int = 6);
select t.check('member private count via member_count', (public.lv_member_count(t.org_a())->'data'->>'member_count')::int = 6);
select t.check('member of A cannot read B members', t.code(public.lv_members_list(t.org_b())) = 'lv_forbidden');
select t.as_user(t.u(2));
select t.check('owner context: is_owner', (public.lv_my_context()->'data'->'memberships'->0->>'is_owner')::boolean);
select t.as_user(t.u(11));
select t.check('org B user sees only Hub B', jsonb_array_length(public.lv_my_context()->'data'->'memberships') = 1
  and (public.lv_my_context()->'data'->'memberships'->0->>'hub_id')::uuid = t.org_b());
select t.check('org B user cannot count private Hub A', t.code(public.lv_member_count(t.org_a())) = 'lv_not_found');
select t.check('org B owner cannot list Hub A', t.code(public.lv_members_list(t.org_a())) = 'lv_forbidden');
select t.check('org B owner cannot remove from Hub A', t.code(public.lv_remove_member(t.org_a(), t.u(3))) = 'lv_forbidden');

-- ---- a user with no account yet gets one on first use; never merged by email
select t.as_user(t.u(21));
select t.check('outsider context creates an account with the auth id', (public.lv_my_context()->'data'->'account'->>'id')::uuid = t.u(21));
select t.check('outsider has no memberships', public.lv_my_context()->'data'->'memberships' = '[]'::jsonb);

-- ---- approval Hub (B): pending -> accepted; pending/invited never count
select t.check('apply to approval Hub: pending', public.lv_join_hub(t.org_b())->'data'->>'status' = 'pending');
select t.check('apply again is idempotent', public.lv_join_hub(t.org_b())->'data'->>'status' = 'pending');
select t.as_pg();
select t.check('exactly one membership row after repeat', (select count(*) from lv_private.hub_memberships where hub_id = t.org_b() and account_id = t.u(21)) = 1);
select t.as_user(t.u(21));
select t.check('pending shows in context.pending only',
  public.lv_my_context()->'data'->'memberships' = '[]'::jsonb and public.lv_my_context()->'data'->'pending'->0->>'status' = 'pending');
select t.check('pending applicant cannot approve themselves', t.code(public.lv_decide_join(t.org_b(), t.u(21), 'accept')) = 'lv_forbidden');
select t.check('pending applicant cannot see members', t.code(public.lv_members_list(t.org_b())) = 'lv_forbidden');
select t.as_anon();
select t.check('pending is not in the public count', (public.lv_member_count(t.org_b())->'data'->>'member_count')::int = 1);
select t.as_user(t.u(2));
select t.check('owner of A cannot decide in B', t.code(public.lv_decide_join(t.org_b(), t.u(21), 'accept')) = 'lv_forbidden');
select t.as_user(t.u(11));
select t.check('owner of B sees the applicant', exists (
  select 1 from jsonb_array_elements(public.lv_members_list(t.org_b())->'data'->'members') m where m->>'account_id' = t.u(21)::text and m->>'status' = 'pending'));
select t.check('invalid decision is invalid_input', t.code(public.lv_decide_join(t.org_b(), t.u(21), 'maybe')) = 'lv_invalid_input');
select t.check('owner of B accepts', public.lv_decide_join(t.org_b(), t.u(21), 'accept')->'data'->>'status' = 'accepted');
select t.check('deciding twice is a conflict', t.code(public.lv_decide_join(t.org_b(), t.u(21), 'accept')) = 'lv_conflict');
select t.check('deciding on a stranger is not_found', t.code(public.lv_decide_join(t.org_b(), t.u(22), 'accept')) = 'lv_not_found');
select t.as_anon();
select t.check('accepted counts', (public.lv_member_count(t.org_b())->'data'->>'member_count')::int = 2);

-- ---- reject deletes the application and allows re-applying (provisional)
select t.as_user(t.u(22));
select t.check('second applicant pending', public.lv_join_hub(t.org_b())->'data'->>'status' = 'pending');
select t.as_user(t.u(11));
select t.check('reject', public.lv_decide_join(t.org_b(), t.u(22), 'reject')->'data'->>'status' = 'removed');
select t.as_pg();
select t.check('rejected application row is gone', not exists (select 1 from lv_private.hub_memberships where hub_id = t.org_b() and account_id = t.u(22)));
select t.check('rejection is in the audit trail', exists (select 1 from lv_private.hub_membership_events where account_id = t.u(22) and event = 'delete' and from_status = 'pending'));
select t.as_user(t.u(22));
select t.check('rejected person may re-apply', public.lv_join_hub(t.org_b())->'data'->>'status' = 'pending');

-- ---- open Hub joins immediately; leave and rejoin
select t.as_pg();
update lv_private.hubs set membership_mode = 'open' where id = t.org_b();
select t.as_user(t.u(23));
select t.check('open Hub: accepted immediately', public.lv_join_hub(t.org_b())->'data'->>'status' = 'accepted');
select t.check('leave', public.lv_leave_hub(t.org_b())->'data'->>'status' = 'left');
select t.check('leave again is not_member', t.code(public.lv_leave_hub(t.org_b())) = 'lv_not_member');
select t.check('left member is out of context', public.lv_my_context()->'data'->'memberships' = '[]'::jsonb);
select t.check('rejoin an open Hub', public.lv_join_hub(t.org_b())->'data'->>'status' = 'accepted');
select t.as_user(t.u(11));
select t.check('owner cannot leave', t.code(public.lv_leave_hub(t.org_b())) = 'lv_forbidden');

-- ---- invite-only Hub (A)
select t.as_user(t.u(24));
select t.check('invite-only without invitation is forbidden', t.code(public.lv_join_hub(t.org_a())) = 'lv_forbidden');
select t.check('invite code alone does not bypass (not implemented)', t.code(public.lv_join_hub(t.org_a(), 'LETMEIN')) = 'lv_forbidden');
select t.as_pg();
insert into lv_private.hub_memberships (hub_id, account_id, status) values (t.org_a(), t.u(24), 'invited');
select t.as_user(t.u(24));
select t.check('invited shows as pending in context', public.lv_my_context()->'data'->'pending'->0->>'status' = 'invited');
select t.check('invited cannot see the private count', t.code(public.lv_member_count(t.org_a())) = 'lv_not_found');
select t.as_pg();
select t.check('invited is not an accepted member', (select count(*) from lv_private.hub_memberships where hub_id = t.org_a() and status = 'accepted') = 6);
select t.as_user(t.u(24));
select t.check('invited accepts', public.lv_join_hub(t.org_a())->'data'->>'status' = 'accepted');

-- ---- authorization inside Hub A: only the Owner (roles do not exist yet); legacy admin gets nothing
select t.as_user(t.u(1));
select t.check('legacy staff admin cannot list members', t.code(public.lv_members_list(t.org_a())) = 'lv_forbidden');
select t.check('legacy staff admin cannot remove', t.code(public.lv_remove_member(t.org_a(), t.u(3))) = 'lv_forbidden');
select t.check('legacy staff admin cannot suspend', t.code(public.lv_suspend_member(t.org_a(), t.u(3))) = 'lv_forbidden');
select t.as_user(t.u(3));
select t.check('plain member cannot list members', t.code(public.lv_members_list(t.org_a())) = 'lv_forbidden');
select t.check('plain member cannot suspend a peer', t.code(public.lv_suspend_member(t.org_a(), t.u(4))) = 'lv_forbidden');

select t.as_user(t.u(2));
select t.check('owner lists accepted members', jsonb_array_length(public.lv_members_list(t.org_a())->'data'->'members') = 7);
select t.check('owner cannot suspend the Owner', t.code(public.lv_suspend_member(t.org_a(), t.u(2))) = 'lv_forbidden');
select t.check('owner cannot remove the Owner', t.code(public.lv_remove_member(t.org_a(), t.u(2))) = 'lv_forbidden');
select t.check('owner cannot leave without transfer', t.code(public.lv_leave_hub(t.org_a())) = 'lv_forbidden');
select t.check('suspend unknown member is not_found', t.code(public.lv_suspend_member(t.org_a(), t.u(26))) = 'lv_not_found');
select t.check('suspend a member', public.lv_suspend_member(t.org_a(), t.u(4))->'data'->>'status' = 'suspended');
select t.check('suspend is idempotent', public.lv_suspend_member(t.org_a(), t.u(4))->'data'->>'status' = 'suspended');
select t.check('remove a member', public.lv_remove_member(t.org_a(), t.u(5))->'data'->>'status' = 'removed');

select t.as_user(t.u(3));
select t.check('count excludes suspended and removed (7 accepted incl. u24 -> 5)', (public.lv_member_count(t.org_a())->'data'->>'member_count')::int = 5);
select t.as_user(t.u(4));
select t.check('suspended: join forbidden', t.code(public.lv_join_hub(t.org_a())) = 'lv_forbidden');
select t.check('suspended: leave forbidden', t.code(public.lv_leave_hub(t.org_a())) = 'lv_forbidden');
select t.check('suspended: not in memberships', public.lv_my_context()->'data'->'memberships' = '[]'::jsonb);
select t.check('suspended: private Hub count hidden', t.code(public.lv_member_count(t.org_a())) = 'lv_not_found');
select t.check('suspended: card shows suspended viewer', public.lv_hub_public('lioncafe')->'data'->'viewer'->>'status' = 'suspended');
select t.as_user(t.u(5));
select t.check('removed: join forbidden', t.code(public.lv_join_hub(t.org_a())) = 'lv_forbidden');

-- ---- unknown Hub and invalid input
select t.as_user(t.u(3));
select t.check('join unknown Hub is not_found', t.code(public.lv_join_hub(gen_random_uuid())) = 'lv_not_found');
select t.check('join null Hub is invalid_input', t.code(public.lv_join_hub(null)) = 'lv_invalid_input');

-- ---- direct API denial: the Data API roles have no path to the tables or the operator functions
select t.as_user(t.u(3));
select t.check('direct: cannot select memberships', t.raises('select * from lv_private.hub_memberships', '42501'));
select t.check('direct: cannot insert a membership for itself', t.raises($$insert into lv_private.hub_memberships (hub_id, account_id, status) values (t.org_a(), t.u(3), 'accepted')$$, '42501'));
select t.check('direct: cannot promote itself to Owner', t.raises($$update lv_private.hubs set owner_account_id = t.u(3) where id = t.org_a()$$, '42501'));
select t.check('direct: cannot call the backfill', t.raises($$select lv_private.backfill_org_hub(t.org_a(), t.u(3))$$, '42501'));
select t.check('direct: cannot call reconcile', t.raises($$select lv_private.reconcile_org_hub(t.org_a())$$, '42501'));
select t.check('direct: cannot read the audit trail', t.raises('select * from lv_private.hub_membership_events', '42501'));
select t.as_anon();
select t.check('direct anon: cannot read accounts', t.raises('select * from lv_private.accounts', '42501'));

-- ---- Owner protection holds even for the database owner (only the transfer flow may change it)
select t.as_pg();
select t.check('owner membership cannot be suspended by SQL', t.raises($$update lv_private.hub_memberships set status = 'suspended' where hub_id = t.org_a() and account_id = t.u(2)$$, '42501'));
select t.check('owner membership cannot be deleted by SQL', t.raises($$delete from lv_private.hub_memberships where hub_id = t.org_a() and account_id = t.u(2)$$, '42501'));
select t.check('Owner cannot be reassigned by SQL', t.raises($$update lv_private.hubs set owner_account_id = t.u(3) where id = t.org_a()$$, '42501'));
select t.check('Owner cannot be cleared by SQL', t.raises($$update lv_private.hubs set owner_account_id = null where id = t.org_a()$$, '42501'));
select t.check('a Hub cannot be created with an Owner already set', t.raises($$insert into lv_private.hubs (id, owner_account_id) values ('00000000-0000-4000-8001-0000000000c3', t.u(3))$$, '42501'));

rollback;
