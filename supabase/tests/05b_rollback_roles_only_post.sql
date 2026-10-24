-- After rolling back ONLY migration 2: migration 1 must work exactly as before.
select t.check('lv_private still exists', exists (select 1 from pg_namespace where nspname = 'lv_private'));
select t.check('role tables are gone', to_regclass('lv_private.roles') is null and to_regclass('lv_private.owner_transfer_offers') is null);
select t.check('role RPCs are gone', t.raises('select public.lv_role_create(null, null)', '42883') or not exists (select 1 from pg_proc where proname = 'lv_role_create'));
select t.check('Hub and membership data survive', t.q('select count(*) from lv_private.hub_memberships') = '6');
select t.check('the Owner is unchanged', t.q($$select owner_account_id from lv_private.hubs where id = t.org_a()$$) = t.u(2)::text);
select t.check('migration-1 capability rule is back (only the Owner)',
  lv_private.has_capability(t.org_a(), t.u(2), 'admin.members.admit') and not lv_private.has_capability(t.org_a(), t.u(3), 'admin.members.admit'));
select t.check('owner protection still holds (migration-1 trigger)', t.raises($$update lv_private.hubs set owner_account_id = t.u(3) where id = t.org_a()$$, '42501'));
begin;
select t.as_user(t.u(3));
select t.check('context works and shows no roles', public.lv_my_context()->'data'->'memberships'->0->'roles' = '[]'::jsonb and public.lv_my_context()->'data'->'memberships'->0->'capabilities' = '[]'::jsonb);
select t.as_user(t.u(2));
select t.check('the Owner can still remove a member', t.code(public.lv_remove_member(t.org_a(), t.u(4))) = 'ok');
select t.as_pg();
select t.check('legacy data unchanged', t.legacy_fingerprint() = (select fp from t.snapshot where name = 'pre'));
commit;
