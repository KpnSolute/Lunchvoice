-- 01: the six invariants in docs/v2/KPNIDENTITY_SCHEMA_V1.md section 5, plus the privilege posture.
select set_config('t.file', '01_kpni_invariants', false);
begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'ada@example.invalid', now(),
   '{"name":"Ada Lovelace","picture":"https://img.example.invalid/ada.png","email_verified":true}'),
  ('22222222-2222-4222-8222-222222222222', 'bob@example.invalid', null, '{"name":"Bob"}');

-- 1. subject is allocated once, unique, and stable across email/name changes
select set_config('t.ada', (select subject::text from kpni.profiles where auth_user_id = '11111111-1111-4111-8111-111111111111'), false);
select t.check('a profile is created for each auth user with a subject',
  (select count(*) from kpni.profiles) = 2 and current_setting('t.ada') is not null);
select t.check('the profile carries the Google claims', (select display_name || '|' || email_verified::text
  from kpni.profiles where auth_user_id = '11111111-1111-4111-8111-111111111111') = 'Ada Lovelace|true');
select t.check('an unverified email is recorded as unverified', not (select email_verified from kpni.profiles
  where auth_user_id = '22222222-2222-4222-8222-222222222222'));

update auth.users set email = 'ada.new@example.invalid' where id = '11111111-1111-4111-8111-111111111111';
update kpni.profiles set display_name = 'Ada L' where auth_user_id = '11111111-1111-4111-8111-111111111111';
select t.check('subject survives email and name changes',
  (select subject::text from kpni.profiles where auth_user_id = '11111111-1111-4111-8111-111111111111') = current_setting('t.ada'));
select t.check('email change is mirrored to the cached profile attribute',
  (select email::text from kpni.profiles where auth_user_id = '11111111-1111-4111-8111-111111111111') = 'ada.new@example.invalid');
select t.check('subject cannot be regenerated or edited',
  t.raises($$update kpni.profiles set subject = gen_random_uuid() where auth_user_id = '11111111-1111-4111-8111-111111111111'$$, '42501'));

-- 2. the same subject cannot attach to two people
select t.check('the same subject cannot be held by a second person',
  t.raises($$update kpni.profiles set subject = '$$ || current_setting('t.ada') || $$' where auth_user_id = '22222222-2222-4222-8222-222222222222'$$));
select t.check('two people hold different subjects',
  (select count(distinct subject) from kpni.profiles) = 2);
select t.check('the subject equals the auth user id, which is the `sub` Supabase puts in the token',
  (select bool_and(subject = auth_user_id) from kpni.profiles));
select t.check('a profile whose subject differs from the auth user id cannot exist',
  t.raises($$insert into kpni.profiles (auth_user_id, subject) values (gen_random_uuid(), gen_random_uuid())$$));

-- 3. deleting the auth user cascades the profile; security events survive
delete from auth.users where id = '22222222-2222-4222-8222-222222222222';
select t.check('deleting the auth user removes the profile',
  (select count(*) from kpni.profiles) = 1);
select t.check('security events for the deleted person survive',
  (select count(*) from kpni.security_events where event = 'account_created') = 2);
select t.check('events record the email change', (select count(*) from kpni.security_events where event = 'email_changed') = 1);
select t.check('security events cannot be updated', t.raises($$update kpni.security_events set event = 'sign_in'$$, '42501'));
select t.check('security events cannot be deleted', t.raises($$delete from kpni.security_events$$, '42501'));
select t.check('security events cannot be truncated', t.raises($$truncate kpni.security_events$$, '42501'));

-- 4. redirect URIs match exactly; look-alikes and wildcards are refused
select kpni.create_client('lunchvoice', 'LunchVoice', 's3cret-value', array['https://lunchvoice.com/auth/callback']);
select t.check('the registered redirect URI is accepted', kpni.client_can_authorize('lunchvoice', 'https://lunchvoice.com/auth/callback'));
select t.check('a look-alike host is refused', not kpni.client_can_authorize('lunchvoice', 'https://lunchvoice.com.evil.invalid/auth/callback'));
select t.check('a path prefix is refused', not kpni.client_can_authorize('lunchvoice', 'https://lunchvoice.com/auth/callback/extra'));
select t.check('a different scheme is refused', not kpni.client_can_authorize('lunchvoice', 'http://lunchvoice.com/auth/callback'));
select t.check('an unknown client is refused', not kpni.client_can_authorize('nobody', 'https://lunchvoice.com/auth/callback'));
select t.check('a wildcard redirect cannot be registered',
  t.raises($$insert into kpni.oauth_redirect_uris (client_id, uri) values ('lunchvoice', 'https://*.lunchvoice.com/cb')$$, '23514'));
select t.check('a fragment redirect cannot be registered',
  t.raises($$insert into kpni.oauth_redirect_uris (client_id, uri) values ('lunchvoice', 'https://lunchvoice.com/cb#x')$$, '23514'));
select t.check('plain http is refused except for loopback development',
  t.raises($$insert into kpni.oauth_redirect_uris (client_id, uri) values ('lunchvoice', 'http://lunchvoice.com/cb')$$, '23514'));
select t.check('a loopback development redirect can be registered',
  not t.raises($$insert into kpni.oauth_redirect_uris (client_id, uri) values ('lunchvoice', 'http://localhost:3000/auth/callback')$$));

-- 5. the client secret is stored hashed, never in plaintext
select t.check('the stored secret is a bcrypt hash, not the plaintext',
  (select client_secret_hash from kpni.oauth_clients where client_id = 'lunchvoice') like '$2%'
  and (select client_secret_hash from kpni.oauth_clients where client_id = 'lunchvoice') <> 's3cret-value');
select t.check('the right secret verifies', kpni.verify_client_secret('lunchvoice', 's3cret-value'));
select t.check('a wrong secret does not', not kpni.verify_client_secret('lunchvoice', 'wrong'));
select t.check('a plaintext secret cannot be written directly',
  t.raises($$insert into kpni.oauth_clients (client_id, client_name, client_secret_hash) values ('plain-one', 'P', 'plaintext-secret')$$, '23514'));
select t.check('a confidential client requires a secret',
  t.raises($$insert into kpni.oauth_clients (client_id, client_name, is_confidential) values ('no-secret', 'N', true)$$, '23514'));
select t.check('client creation is audited', (select count(*) from kpni.security_events where event = 'client_created') = 1);

-- 6. a deactivated client cannot complete a flow
update kpni.oauth_clients set is_active = false where client_id = 'lunchvoice';
select t.check('a deactivated client cannot authorize', not kpni.client_can_authorize('lunchvoice', 'https://lunchvoice.com/auth/callback'));
select t.check('a deactivated client cannot authenticate with its secret', not kpni.verify_client_secret('lunchvoice', 's3cret-value'));

-- Email verification is derived from GoTrue's email_confirmed_at only, and kept current
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('33333333-3333-4333-8333-333333333333', 'eve@example.invalid', null, '{"email_verified":true,"name":"Eve"}');
select t.check('forged user_metadata email_verified does not make an email verified',
  not (select email_verified from kpni.profiles where auth_user_id = '33333333-3333-4333-8333-333333333333'));
update auth.users set email_confirmed_at = now() where id = '33333333-3333-4333-8333-333333333333';
select t.check('confirming the email after signup marks the profile verified',
  (select email_verified from kpni.profiles where auth_user_id = '33333333-3333-4333-8333-333333333333'));
update auth.users set email = 'eve.new@example.invalid', email_confirmed_at = null where id = '33333333-3333-4333-8333-333333333333';
select t.check('an email change that is not yet confirmed clears verification and updates the cached email',
  (select not email_verified and email::text = 'eve.new@example.invalid'
     from kpni.profiles where auth_user_id = '33333333-3333-4333-8333-333333333333'));
update auth.users set email_confirmed_at = now() where id = '33333333-3333-4333-8333-333333333333';
select t.check('confirming the new email restores verification',
  (select email_verified from kpni.profiles where auth_user_id = '33333333-3333-4333-8333-333333333333'));

-- Default privileges: new objects in kpni are closed by default
create function kpni.zz_probe() returns int language sql as 'select 1';
create table kpni.zz_probe_t (id int);
select t.check('a new function in kpni is not executable by public, anon or authenticated',
  not has_function_privilege('anon', 'kpni.zz_probe()', 'execute')
  and not has_function_privilege('authenticated', 'kpni.zz_probe()', 'execute'));
select t.check('a new table in kpni is not readable by anon or authenticated',
  not has_table_privilege('anon', 'kpni.zz_probe_t', 'select')
  and not has_table_privilege('authenticated', 'kpni.zz_probe_t', 'select'));

-- Privilege posture: the Data API roles see nothing
set local role anon;
select t.check('anon cannot read profiles', t.raises($$select * from kpni.profiles$$, '42501'));
select t.check('anon cannot call the client helpers', t.raises($$select kpni.verify_client_secret('lunchvoice','x')$$, '42501'));
reset role;
set local role authenticated;
select t.check('authenticated cannot read profiles', t.raises($$select * from kpni.profiles$$, '42501'));
select t.check('authenticated cannot read security events', t.raises($$select * from kpni.security_events$$, '42501'));
select t.check('authenticated cannot read clients', t.raises($$select * from kpni.oauth_clients$$, '42501'));
reset role;

rollback;
