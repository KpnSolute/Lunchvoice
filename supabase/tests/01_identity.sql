-- 01: identity -- issuer/subject linkage, fail-closed behaviour, no email linking, duplicate prevention.
select set_config('t.file', '01_identity', false);
begin;

-- ---------------------------------------------------------------------------------------------------------
-- Fail closed before any issuer is configured
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(1);
select t.check('before an issuer is allow-listed, a correctly shaped token signs nobody in',
  t.q($$select lv.current_account_id()::text$$) is null);
select t.check('before an issuer is allow-listed, lv_my_context refuses',
  t.code(lv_api.lv_my_context()) = 'lv_unauthenticated');

-- ---------------------------------------------------------------------------------------------------------
-- Unknown issuer is refused even after configuration
-- ---------------------------------------------------------------------------------------------------------
select t.trust_test_issuer();
select t.as_kpn(1, p_issuer := 'https://evil.test.invalid/auth/v1');
select t.check('a token from an issuer not on the allow-list is refused',
  t.q($$select lv.current_account_id()::text$$) is null);

-- ---------------------------------------------------------------------------------------------------------
-- First sign-in creates exactly one account, keyed by (issuer, subject)
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(1, 'ada@example.invalid', true, 'Ada Lovelace');
select t.check('a correctly shaped token from an allow-listed issuer signs in',
  t.code(lv_api.lv_my_context()) = 'ok');
select t.put('ada_account', t.q($$select lv.current_account_id()::text$$));

select t.check('the account is keyed by the issuer + subject pair, not by email or a local auth user id',
  t.q($$select identity_issuer || '|' || identity_subject from lv.account_identities where account_id = '$$
      || t.get('ada_account') || $$'::uuid$$) = t.issuer() || '|' || t.sub(1)::text);

select t.check('the display name comes from the KpnIdentity claim', 
  t.q($$select display_name from lv.accounts where id = '$$ || t.get('ada_account') || $$'::uuid$$) = 'Ada Lovelace');

select t.check('a verified email records a verification timestamp',
  t.q($$select (email_verified_at is not null)::text from lv.account_identities where account_id = '$$
      || t.get('ada_account') || $$'::uuid$$) = 'true');

-- ---------------------------------------------------------------------------------------------------------
-- The same subject never creates a second account
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(1, 'ada.changed@example.invalid', true, 'Ada L');
select lv_api.lv_my_context();
select t.check('signing in again reuses the same account', t.q($$select lv.current_account_id()::text$$) = t.get('ada_account'));
select t.check('exactly one identity row exists for that person',
  t.q($$select count(*)::text from lv.account_identities where identity_subject = '$$ || t.sub(1)::text || $$'$$) = '1');
select t.check('a changed email updates the cached attribute without changing the identity key',
  t.q($$select email from lv.account_identities where account_id = '$$ || t.get('ada_account') || $$'::uuid$$) = 'ada.changed@example.invalid');

-- current_account_id() must be READ-ONLY: resolving a caller may never write. Only ensure_account() writes.
select t.as_pg();
select t.check('lv.current_account_id() is strictly read-only (no side effects)',
  (select provolatile = 's' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'lv' and p.proname = 'current_account_id'));

-- ---------------------------------------------------------------------------------------------------------
-- Database-level uniqueness on (issuer, subject)
-- ---------------------------------------------------------------------------------------------------------
select t.as_pg();
select t.check('a duplicate (issuer, subject) insert is refused by the database',
  t.raises($$insert into lv.account_identities (account_id, identity_issuer, identity_subject)
              values (gen_random_uuid(), '$$ || t.issuer() || $$', '$$ || t.sub(1)::text || $$')$$, '23503')
  or t.raises($$insert into lv.account_identities (account_id, identity_issuer, identity_subject)
              values ('$$ || t.get('ada_account') || $$'::uuid, '$$ || t.issuer() || $$', '$$ || t.sub(1)::text || $$')$$, '23505'));

-- ---------------------------------------------------------------------------------------------------------
-- Email is NOT an identity key: two people with the same email are two accounts
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(2, 'shared@example.invalid', true, 'Second Person');
select lv_api.lv_my_context();
select t.put('second_account', t.q($$select lv.current_account_id()::text$$));
select t.check('two different subjects sharing one email produce two distinct accounts',
  t.get('second_account') <> t.get('ada_account'));
select t.check('...and the shared email is stored on both, proving it is not unique or a key',
  t.q($$select count(*)::text from lv.account_identities where email = 'shared@example.invalid'$$) >= '1');

-- ---------------------------------------------------------------------------------------------------------
-- Unverified email is recorded as unverified
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(3, 'unverified@example.invalid', false, 'Unverified Person');
select lv_api.lv_my_context();
select t.put('unverified_account', t.q($$select lv.current_account_id()::text$$));
select t.check('an unverified email records NO verification timestamp',
  t.q($$select (email_verified_at is null)::text from lv.account_identities where account_id = '$$
      || t.get('unverified_account') || $$'::uuid$$) = 'true');

-- ---------------------------------------------------------------------------------------------------------
-- Malformed claims are refused, never coerced
-- ---------------------------------------------------------------------------------------------------------
select t.as_claims(jsonb_build_object('iss', t.issuer(), 'sub', 'not-a-uuid'));
select t.check('a non-UUID subject is refused', t.q($$select lv.current_account_id()::text$$) is null);

select t.as_claims(jsonb_build_object('iss', t.issuer()));
select t.check('a missing subject is refused', t.q($$select lv.current_account_id()::text$$) is null);

select t.as_claims(jsonb_build_object('sub', t.sub(9)::text));
select t.check('a missing issuer is refused', t.q($$select lv.current_account_id()::text$$) is null);

select t.as_claims('{}'::jsonb);
select t.check('an empty claim set is refused', t.q($$select lv.current_account_id()::text$$) is null);

select t.as_claims('"not an object"'::jsonb);
select t.check('a non-object claim set is refused', t.q($$select lv.current_account_id()::text$$) is null);

select t.as_claims(jsonb_build_object('iss', 12345, 'sub', t.sub(9)::text));
select t.check('a non-string issuer is refused', t.q($$select lv.current_account_id()::text$$) is null);

-- ---------------------------------------------------------------------------------------------------------
-- Anonymous callers and direct table access
-- ---------------------------------------------------------------------------------------------------------
select t.as_anon();
select t.check('an anonymous caller has no account', t.q($$select lv.current_account_id()::text$$) is null);
select t.check('an anonymous caller cannot read the tables directly',
  t.raises($$select * from lv.account_identities$$));
select t.check('an anonymous caller cannot reach lv.ensure_account to mint an account',
  t.raises($$select lv.ensure_account()$$));

select t.as_pg();
select t.check('no API role holds table privileges in the lv schema',
  (select count(*) from information_schema.table_privileges
    where table_schema = 'lv' and grantee in ('anon', 'authenticated', 'PUBLIC')) = 0);

rollback;
