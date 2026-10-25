-- 16: identity-first model: allow-listed issuers, one account per (issuer, subject), no linking by email or name, no membership from
-- signing in, Hubs that own their address and name, platform administration that nobody can self-grant.
select set_config('t.file', '16_identity', false);
begin;

create function t.sid(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8900-' || lpad(n::text, 12, '0'))::uuid $$;

-- ---- fail closed: nobody is signed in until an issuer is trusted
update lv_private.policy set value = null where key = 'identity.trusted_issuers';
select t.as_central(t.sid(1), 'ada@example.invalid');
select t.check('no trusted issuer configured: even a correctly signed central token is not a person', t.code(public.lv_my_context()) = 'lv_unauthenticated');
select t.as_pg();
update lv_private.policy set value = '"https://auth.test.invalid"'::jsonb where key = 'identity.trusted_issuers';
select t.as_central(t.sid(1), 'ada@example.invalid');
select t.check('an issuer list that is not an array counts as unset', t.code(public.lv_my_context()) = 'lv_unauthenticated');
select t.as_pg();
update lv_private.policy set value = '["https://auth.test.invalid"]'::jsonb where key = 'identity.trusted_issuers';
select t.as_central(t.sid(1), 'ada@example.invalid', true, 'https://evil.invalid');
select t.check('a token from an issuer that is not on the list is refused', t.code(public.lv_my_context()) = 'lv_unauthenticated');
select t.as_pg();
select t.check('...and nothing was created for it', t.q('select count(*) from lv_private.accounts') = '0');
select set_config('request.jwt.claim.sub', t.sid(1)::text, false), set_config('request.jwt.claims', jsonb_build_object('sub', t.sid(1), 'role', 'authenticated')::text, false);
set role authenticated;
select t.check('a token with no issuer is refused', t.code(public.lv_my_context()) = 'lv_unauthenticated');
select t.as_anon();
select t.check('anon is unauthenticated', t.code(public.lv_my_context()) = 'lv_unauthenticated');
select t.as_pg();

-- ---- first sign-in creates exactly one account, linked to the central identity
select t.as_central(t.sid(1), 'ada.lovelace@example.invalid');
select t.check('first sign-in creates the product account', t.code(public.lv_my_context()) = 'ok' and (public.lv_my_context()->'data'->'account'->>'id')::uuid = t.sid(1));
select t.check('repeat sign-ins return the same account (no duplicate)', (public.lv_my_context()->'data'->'account'->>'id')::uuid = t.sid(1));
select t.as_pg();
select t.check('exactly one account and one identity exist, keyed by issuer and subject', t.q('select count(*) from lv_private.accounts') = '1'
  and t.q($$select count(*) from lv_private.account_identities where issuer = 'https://auth.test.invalid' and subject = $$ || quote_literal(t.sid(1)::text)) = '1');
select t.check('the display name defaults to the email local part, which is display only', t.q($$select display_name from lv_private.accounts where id = $$ || quote_literal(t.sid(1))) = 'ada.lovelace');
select t.check('a verified email is recorded as verified', t.q($$select (email_verified_at is not null)::text from lv_private.account_identities where subject = $$ || quote_literal(t.sid(1)::text)) = 'true');
select t.check('signing in grants NO membership of any Hub', t.q('select count(*) from lv_private.hub_memberships') = '0');
select t.check('...and the signing-in person is not a platform administrator', not lv_private.is_platform_admin(t.sid(1)));

-- a name claim wins over the email, an unverified email is not recorded as verified
select t.as_central(t.sid(2), 'unverified@example.invalid', false);
select t.check('an account is created for an unverified email too (verification is enforced where it matters)', t.code(public.lv_my_context()) = 'ok');
select t.as_pg();
select t.check('...but its email is not marked verified', t.q($$select (email_verified_at is null)::text from lv_private.account_identities where subject = $$ || quote_literal(t.sid(2)::text)) = 'true');
select set_config('request.jwt.claim.sub', t.sid(3)::text, false), set_config('request.jwt.claims', jsonb_build_object('sub', t.sid(3), 'iss', 'https://auth.test.invalid', 'name', 'Grace Hopper', 'email', 'g@example.invalid', 'email_verified', true)::text, false);
set role authenticated;
select t.check('the name claim becomes the display name', public.lv_my_context()->'data'->'account'->>'display_name' = 'Grace Hopper');
select set_config('request.jwt.claim.sub', t.sid(4)::text, false), set_config('request.jwt.claims', jsonb_build_object('sub', t.sid(4), 'iss', 'https://auth.test.invalid')::text, false);
select t.check('with no name or email the display name is a neutral placeholder', public.lv_my_context()->'data'->'account'->>'display_name' = 'Member');

-- ---- never linked by email or name
select t.as_central(t.sid(5), 'shared@example.invalid');
select t.check('first person with a shared email', t.code(public.lv_my_context()) = 'ok');
select t.as_central(t.sid(6), 'shared@example.invalid');
select t.check('a DIFFERENT subject with the same email gets a separate account', (public.lv_my_context()->'data'->'account'->>'id')::uuid = t.sid(6));
select t.as_pg();
update lv_private.policy set value = '["https://auth.test.invalid", "https://second-issuer.test.invalid"]'::jsonb where key = 'identity.trusted_issuers';
select t.as_central(t.sid(5), 'shared@example.invalid', true, 'https://second-issuer.test.invalid');
select t.check('the SAME subject from another trusted issuer is a different person (issuer is part of the identity)', (public.lv_my_context()->'data'->'account'->>'id')::uuid <> t.sid(5)
  and t.code(public.lv_my_context()) = 'ok');
select t.as_pg();
select t.check('seven accounts for seven (issuer, subject) pairs: nothing merged by email or name', t.q('select count(*) from lv_private.accounts') = '7');

-- ---- an uppercase subject is the same person
select set_config('request.jwt.claim.sub', upper(t.sid(1)::text), false), set_config('request.jwt.claims', jsonb_build_object('sub', upper(t.sid(1)::text), 'iss', 'https://auth.test.invalid')::text, false);
set role authenticated;
select t.check('subject case does not create a second account', (public.lv_my_context()->'data'->'account'->>'id')::uuid = t.sid(1));
select t.as_pg();

-- ---- the caller never supplies who they are: identity comes from the token, not from a parameter

-- ---- Hubs own their address and name
select t.as_pg();
insert into lv_private.hubs (id, slug, display_name) values ('00000000-0000-4000-8a00-000000000001', 'own-hub', 'Own Hub Name');
select t.check('the slug is stored lower-case', exists (select 1 from lv_private.hubs where lower(slug) = 'own-hub'));
select t.as_anon();
select t.check('lv_hub_public resolves a Hub that has no organization row', public.lv_hub_public('own-hub')->'data'->>'name' = 'Own Hub Name' and public.lv_hub_public('OWN-HUB')->'data'->>'slug' = 'own-hub');
select t.as_pg();
select t.check('...and it is not in the legacy organizations table that anon can list', not exists (select 1 from public.orgs where lower(slug) = 'own-hub'));
select t.check('slugs are unique', t.raises($$insert into lv_private.hubs (id, slug) values (gen_random_uuid(), 'own-hub')$$, '23505') and t.raises($$insert into lv_private.hubs (id, slug) values (gen_random_uuid(), 'OWN-HUB')$$, '23514'));
select t.check('slug format is enforced by the database', t.raises($$insert into lv_private.hubs (id, slug) values (gen_random_uuid(), 'Bad Slug!')$$, '23514')
  and t.raises($$insert into lv_private.hubs (id, slug) values (gen_random_uuid(), '-lead')$$, '23514') and t.raises($$insert into lv_private.hubs (id, slug) values (gen_random_uuid(), 'x')$$, '23514'));

-- ---- platform administration
select t.check('nobody is a platform administrator by default', t.q('select count(*) from lv_private.platform_admins') = '0');
select lv_private.grant_platform_admin(t.sid(2), 'founder (synthetic test)', 'rehearsal reviewer');
select t.check('an operator can grant it, with a reason and an audit event', lv_private.is_platform_admin(t.sid(2)) and t.q('select count(*) from lv_private.platform_admin_events') = '1');
select t.check('granting needs a named operator and an existing account', t.raises($$select lv_private.grant_platform_admin(t.sid(1), ' ', 'x')$$) and t.raises($$select lv_private.grant_platform_admin(gen_random_uuid(), 'op', 'reason')$$));
select lv_private.revoke_platform_admin(t.sid(2), 'founder (synthetic test)', 'rehearsal over');
select t.check('revocation takes effect immediately and is audited', not lv_private.is_platform_admin(t.sid(2)) and t.q('select count(*) from lv_private.platform_admin_events') = '2');
select t.as_central(t.sid(1), 'ada.lovelace@example.invalid');
select t.check('the API roles cannot grant or read platform administration', t.raises($$select lv_private.grant_platform_admin(t.sid(1), 'me', 'self grant')$$, '42501')
  and t.raises('select * from lv_private.platform_admins', '42501') and t.raises('select * from lv_private.platform_admin_events', '42501'));
select t.check('the API roles cannot read identities or the trusted-issuer list', t.raises('select * from lv_private.account_identities', '42501') and t.raises('select * from lv_private.policy', '42501'));

rollback;
