-- 56: hardening of usernames and link candidates (000056): both emails verified, a verified flag never survives an email
-- change, and a deleted account's username stays held for everyone.
select set_config('t.file', '56_usernames_hardening', false);
begin;
select t.trust_test_issuer();
update lv.policy set value = value || to_jsonb('https://other.example/auth/v1'::text) where key = 'identity.trusted_issuers';

-- Candidates need a verified email on both sides.
select t.as_kpn(1, 'sam@example.com', true, 'Sam Verified'); select lv_api.lv_my_context();
select t.as_kpn(2, 'sam@example.com', true, 'Sam New', 'https://other.example/auth/v1'); select lv_api.lv_my_context();
select t.check('both verified: the old account is offered', jsonb_array_length(lv_api.lv_link_candidates() -> 'candidates') = 1);
select t.as_pg();
update lv.account_identities set email_verified_at = null
 where identity_subject = t.sub(1)::text and identity_issuer = t.issuer();
select t.as_kpn(2, 'sam@example.com', true, 'Sam New', 'https://other.example/auth/v1');
select t.check('the old email is unverified: nothing is offered', jsonb_array_length(lv_api.lv_link_candidates() -> 'candidates') = 0);

-- A changed email is unverified until a verified sign-in says otherwise.
select t.as_pg();
select t.check('before the change the new identity is verified', (select email_verified_at is not null from lv.account_identities
  where identity_subject = t.sub(2)::text));
update lv.account_identities set email = 'sam.other@example.com' where identity_subject = t.sub(2)::text;
select t.check('changing the email clears the verified flag', (select email_verified_at is null from lv.account_identities
  where identity_subject = t.sub(2)::text));
update lv.account_identities set email_verified_at = now() where identity_subject = t.sub(2)::text;
select t.check('setting only the flag keeps it (no email change)', (select email_verified_at is not null from lv.account_identities
  where identity_subject = t.sub(2)::text));

-- A deleted account's username is held for everyone.
select t.as_kpn(3, null, true, 'Leaver'); select lv_api.lv_my_context();
select lv_api.lv_handle_set('leaver_name');
select t.as_kpn(4, null, true, 'Watcher'); select lv_api.lv_my_context();
select t.check('before deletion the name is taken', lv_api.lv_handle_check('leaver_name') ->> 'reason' = 'taken');
select t.as_pg();
delete from lv.accounts where handle = 'leaver_name';
select t.check('the history row survives the delete with no owner', exists (
  select 1 from lv.handle_history where handle = 'leaver_name' and account_id is null and held_until > now()));
select t.as_kpn(4);
select t.check('after deletion the name is held for everyone', lv_api.lv_handle_check('leaver_name') ->> 'reason' = 'held');
select t.check('and cannot be claimed', t.code(lv_api.lv_handle_set('leaver_name')) = 'lv_conflict');
select t.as_pg();
update lv.handle_history set held_until = now() - interval '1 day' where handle = 'leaver_name';
select t.as_kpn(4);
select t.check('after the hold it is free', (lv_api.lv_handle_check('leaver_name') ->> 'available')::boolean);
select t.as_pg();
rollback;
