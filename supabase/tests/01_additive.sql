-- 01: the migration is additive; legacy signup keeps working and is mirrored; a mirror failure never blocks signup.
select set_config('t.file', '01_additive', false);
begin;

select t.check('legacy data is byte-identical after the migration', t.legacy_fingerprint() = (select fp from t.snapshot where name = 'pre'));
select t.check('migration alone creates no accounts', (select count(*) from lv_private.accounts) = 0);
select t.check('migration alone creates no Hubs', (select count(*) from lv_private.hubs) = 0);
select t.check('migration alone creates no memberships', (select count(*) from lv_private.hub_memberships) = 0);

-- A new legacy signup (before any Hub exists) is mirrored into an account with the SAME id and no membership.
insert into auth.users (id, email, raw_user_meta_data) values (t.u(21), 'new.signup@example.invalid', '{"display_name":"New Signup"}');
select t.check('signup still creates the legacy profile', exists (select 1 from public.profiles where id = t.u(21)));
select t.check('signup is mirrored to an account with the same id', exists (select 1 from lv_private.accounts where id = t.u(21)));
select t.check('signup is linked to its identity', exists (select 1 from lv_private.account_identities where auth_user_id = t.u(21) and account_id = t.u(21)));
select t.check('no membership without a Hub', not exists (select 1 from lv_private.hub_memberships where account_id = t.u(21)));

-- Make the mirror fail: signup must still succeed (warning only), leaving no v2 rows to repair later.
alter table lv_private.accounts add constraint zz_fail check (display_name <> 'boom');
insert into auth.users (id, email, raw_user_meta_data) values (t.u(22), 'boom@example.invalid', '{"display_name":"boom"}');
select t.check('a failing mirror does not block signup', exists (select 1 from public.profiles where id = t.u(22)));
select t.check('a failing mirror leaves no half-created v2 rows',
  not exists (select 1 from lv_private.accounts where id = t.u(22)) and not exists (select 1 from lv_private.account_identities where auth_user_id = t.u(22)));
alter table lv_private.accounts drop constraint zz_fail;

-- The API roles cannot see or touch the private schema at all.
select t.as_user(t.u(3));
select t.check('authenticated cannot read accounts', t.raises('select * from lv_private.accounts', '42501'));
select t.check('authenticated cannot read memberships', t.raises('select * from lv_private.hub_memberships', '42501'));
select t.check('authenticated cannot write hubs', t.raises($$insert into lv_private.hubs (id) values (t.org_a())$$, '42501'));
select t.as_anon();
select t.check('anon cannot read hubs', t.raises('select * from lv_private.hubs', '42501'));
select t.check('anon cannot call internal helpers', t.raises('select lv_private.ensure_account()', '42501'));
select t.as_pg();

rollback;
