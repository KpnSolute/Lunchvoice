-- 58: linking a new sign-in to an existing account (A9): only the service role can do it, only an empty new account can be merged,
-- the old account keeps everything, the username moves when the old account has none, and the link is audited and idempotent.
select set_config('t.file', '58_identity_link', false);
begin;
select t.trust_test_issuer();
update lv.policy set value = value || to_jsonb('https://other.example/auth/v1'::text) where key = 'identity.trusted_issuers';

-- The old account (original issuer) owns data; the new sign-in (other issuer) is a fresh account.
select t.as_kpn(1, 'kit@example.com', true, 'Kit Old'); select lv_api.lv_my_context();
select t.put('hub_survey', lv_api.lv_quick_survey_create('Old survey', 'link', 'anonymous', true) #>> '{campaign,campaign_id}');
select t.as_kpn(2, 'kit@example.com', true, 'Kit New', 'https://other.example/auth/v1'); select lv_api.lv_my_context();
select lv_api.lv_handle_set('kit_new');
select t.put('new_account', t.q(format($q$select account_id::text from lv.account_identities where identity_subject = %L$q$, t.sub(2)::text)));

-- API roles cannot call it.
select t.check('authenticated cannot link', t.raises(format($$select lv.link_identities(%L, %L, %L, %L)$$,
  'https://other.example/auth/v1', t.sub(2)::text, t.issuer(), t.sub(1)::text)));
select t.as_anon();
select t.check('anonymous cannot link', t.raises(format($$select lv.link_identities(%L, %L, %L, %L)$$,
  'https://other.example/auth/v1', t.sub(2)::text, t.issuer(), t.sub(1)::text)));

-- Unknown identities are refused.
select t.as_pg();
select t.check('an unknown identity is refused', t.code(lv.link_identities('https://other.example/auth/v1', t.sub(99)::text, t.issuer(), t.sub(1)::text)) = 'lv_not_found');

-- A new account that already has data cannot be merged away.
select t.as_kpn(3, 'kit@example.com', true, 'Kit Busy', 'https://other.example/auth/v1'); select lv_api.lv_my_context();
select lv_api.lv_quick_survey_create('Busy survey', 'link', 'anonymous', true);
select t.as_pg();
select t.check('a non-empty new account is refused', t.code(lv.link_identities('https://other.example/auth/v1', t.sub(3)::text, t.issuer(), t.sub(1)::text)) = 'lv_conflict');
select t.check('and nothing moved', (select account_id from lv.account_identities where identity_subject = t.sub(3)::text) <> (select account_id from lv.account_identities where identity_subject = t.sub(1)::text));

-- The real link.
select t.check('the empty new account is considered empty', lv.account_is_empty(t.id('new_account')));
select t.check('link succeeds', (lv.link_identities('https://other.example/auth/v1', t.sub(2)::text, t.issuer(), t.sub(1)::text) ->> 'ok')::boolean);
select t.check('the new identity now belongs to the old account', (select account_id from lv.account_identities where identity_subject = t.sub(2)::text)
  = (select account_id from lv.account_identities where identity_subject = t.sub(1)::text));
select t.check('the empty account is gone', not exists (select 1 from lv.accounts where id = t.id('new_account')));
select t.check('the old account kept its data', exists (select 1 from lv.campaigns where id = t.id('hub_survey')));
select t.check('the old account took the new username because it had none', (select handle from lv.accounts a
  join lv.account_identities i on i.account_id = a.id where i.identity_subject = t.sub(1)::text) = 'kit_new');
select t.check('the link is audited', exists (select 1 from lv.audit_events where action = 'account.identity_linked'));
select t.check('linking again is a no-op', (lv.link_identities('https://other.example/auth/v1', t.sub(2)::text, t.issuer(), t.sub(1)::text) ->> 'already_linked')::boolean);

-- After the link, signing in with the new method opens the old account.
select t.as_kpn(2, 'kit@example.com', true, 'Kit New', 'https://other.example/auth/v1');
select t.check('the new sign-in sees the old account data', exists (select 1 from jsonb_array_elements(lv_api.lv_quick_survey_list() -> 'surveys') s
  where s ->> 'title' = 'Old survey'));

-- The old username is kept when the old account already had one.
select t.as_pg();
select t.as_kpn(4, null, true, 'Has Name'); select lv_api.lv_my_context(); select lv_api.lv_handle_set('keeper');
select t.as_kpn(5, null, true, 'Fresh', 'https://other.example/auth/v1'); select lv_api.lv_my_context(); select lv_api.lv_handle_set('fresh_pick');
select t.as_pg();
select lv.link_identities('https://other.example/auth/v1', t.sub(5)::text, t.issuer(), t.sub(4)::text);
select t.check('the old username stays', (select handle from lv.accounts a join lv.account_identities i on i.account_id = a.id
  where i.identity_subject = t.sub(4)::text) = 'keeper');
select t.check('the released username is held, not free', exists (select 1 from lv.handle_history where handle = 'fresh_pick' and held_until > now()));
rollback;
