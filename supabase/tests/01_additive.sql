-- 01: the migration is additive; legacy signup keeps working and is mirrored; a mirror failure never blocks signup.
select set_config('t.file', '01_additive', false);
begin;

select t.check('legacy data is byte-identical after the migration', t.legacy_fingerprint() = (select fp from t.snapshot where name = 'pre'));
select t.check('migration alone creates no accounts', (select count(*) from lv_private.accounts) = 0);
select t.check('migration alone creates no Hubs', (select count(*) from lv_private.hubs) = 0);
select t.check('migration alone creates no memberships', (select count(*) from lv_private.hub_memberships) = 0);

-- Signing up grants NOTHING. (A fixture helper trigger exists only in this test database; the product has none, proven in the pristine copy
-- by 15_pure. Here it is dropped so the behaviour of the product schema itself is what is observed.)
drop trigger t_profiles_mirror on public.profiles;
insert into auth.users (id, email, raw_user_meta_data) values (t.u(21), 'new.signup@example.invalid', '{"display_name":"New Signup"}');
select t.check('signup still creates the legacy profile', exists (select 1 from public.profiles where id = t.u(21)));
select t.check('...and creates no account, no identity and no membership', not exists (select 1 from lv_private.accounts where id = t.u(21))
  and not exists (select 1 from lv_private.account_identities where subject = t.u(21)::text) and not exists (select 1 from lv_private.hub_memberships where account_id = t.u(21)));

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
