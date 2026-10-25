-- After rolling back ONLY migration 8: the Supabase-user identity model is back and migrations 1 to 7 work as before.
select t.check('platform admin tables and the identity allow-list are gone', to_regclass('lv_private.platform_admins') is null
  and t.q($$select count(*) from lv_private.policy where key = 'identity.trusted_issuers'$$) = '0');
select t.check('identities are keyed by the auth user again', exists (select 1 from information_schema.columns where table_schema = 'lv_private' and table_name = 'account_identities' and column_name = 'auth_user_id' and is_nullable = 'NO')
  and not exists (select 1 from information_schema.columns where table_schema = 'lv_private' and table_name = 'account_identities' and column_name = 'issuer'));
select t.check('the signup mirror is back (migration-1 behaviour)', exists (select 1 from pg_trigger where tgname = 'profiles_sync_v2'));
begin;
select t.as_user(t.u(3));
select t.check('context works with the legacy identity model', public.lv_my_context()->'data'->'memberships'->0->>'name' is not null);
select t.as_pg();
select t.check('legacy data unchanged', t.legacy_fingerprint() = (select fp from t.snapshot where name = 'pre'));
commit;
