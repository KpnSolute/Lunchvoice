-- 55: unique usernames chosen at sign-up (E11): format, reserved words, case-insensitive uniqueness, races, change
-- interval, hold period, rate limit, no access to the helper tables, and the email-indexed link-candidate lookup.
select set_config('t.file', '55_usernames', false);
begin;
select t.trust_test_issuer();

-- Two fresh accounts: nobody has a username until they choose one.
select t.as_kpn(1, null, true, 'Account One'); select lv_api.lv_my_context();
select t.as_kpn(2, null, true, 'Account Two'); select lv_api.lv_my_context();
select t.as_kpn(1);
select t.check('a new account has no username', (lv_api.lv_handle_get() ->> 'handle') is null);

-- Format and reserved words.
select t.check('too short', lv_api.lv_handle_check('ab') ->> 'reason' = 'length');
select t.check('too long', lv_api.lv_handle_check('abcdefghijklmnopqrstu') ->> 'reason' = 'length');
select t.check('starts with a digit', lv_api.lv_handle_check('1abc') ->> 'reason' = 'format');
select t.check('no double underscore', lv_api.lv_handle_check('a__b') ->> 'reason' = 'format');
select t.check('no spaces', lv_api.lv_handle_check('a b c') ->> 'reason' = 'format');
select t.check('an email is never a username', lv_api.lv_handle_check('pat@example.com') ->> 'reason' = 'format');
select t.check('reserved word', lv_api.lv_handle_check('admin') ->> 'reason' = 'reserved');
select t.check('reserved word in any case', lv_api.lv_handle_check('LunchVoice') ->> 'reason' = 'reserved');
select t.check('a free name is available', (lv_api.lv_handle_check('sunny_day') ->> 'available')::boolean);
select t.check('checking does not claim it', (lv_api.lv_handle_get() ->> 'handle') is null);
select t.check('set refuses a reserved word', t.code(lv_api.lv_handle_set('admin')) = 'lv_invalid_input');
select t.check('set refuses a bad format', t.code(lv_api.lv_handle_set('Not Ok!')) = 'lv_invalid_input');

-- The first claim.
select t.check('claim a username', (lv_api.lv_handle_set('  Sunny_Day  ') ->> 'handle') = 'sunny_day');
select t.check('it is stored lowercase', (lv_api.lv_handle_get() ->> 'handle') = 'sunny_day');
select t.check('the first claim does not start the change interval', (lv_api.lv_handle_get() ->> 'can_change_at') is null);
select t.check('setting the same name again is fine', (lv_api.lv_handle_set('sunny_day') ->> 'ok')::boolean);

-- Uniqueness, case-insensitive, for another account.
select t.as_kpn(2);
select t.check('taken name reports taken', lv_api.lv_handle_check('SUNNY_DAY') ->> 'reason' = 'taken');
select t.check('and offers free suggestions', jsonb_array_length(lv_api.lv_handle_check('sunny_day') -> 'suggestions') >= 1);
select t.check('suggestions never include the taken name', not exists (
  select 1 from jsonb_array_elements_text(lv_api.lv_handle_check('sunny_day') -> 'suggestions') s where s.value = 'sunny_day'));
select t.check('cannot take it in another case', t.code(lv_api.lv_handle_set('Sunny_DAY')) = 'lv_conflict');
select t.check('another name works', (lv_api.lv_handle_set('moonlight') ->> 'ok')::boolean);

-- The database itself refuses a duplicate or a malformed value, whatever the caller.
select t.as_pg();
select t.check('unique index refuses a duplicate', t.raises($$update lv.accounts set handle = 'sunny_day' where handle = 'moonlight'$$, '23505'));
select t.check('check constraint refuses an uppercase value', t.raises($$update lv.accounts set handle = 'Moon' where handle = 'moonlight'$$, '23514'));
select t.check('check constraint refuses an @', t.raises($$update lv.accounts set handle = 'a@b' where handle = 'moonlight'$$, '23514'));

-- Changing: once every 30 days; the old name is held for 14.
select t.as_kpn(1);
select t.check('the first change is allowed', (lv_api.lv_handle_set('sunny_two') ->> 'ok')::boolean);
select t.check('the second change is blocked', t.code(lv_api.lv_handle_set('sunny_three')) = 'lv_rate_limited');
select t.check('the answer says when', (lv_api.lv_handle_get() ->> 'can_change_at') is not null);
select t.as_pg();
select t.check('the old name is held', exists (select 1 from lv.handle_history where handle = 'sunny_day' and held_until > now()));
select t.as_kpn(2);
select t.check('another person cannot take a held name', lv_api.lv_handle_check('sunny_day') ->> 'reason' = 'held');
select t.check('nor claim it', t.code(lv_api.lv_handle_set('sunny_day')) = 'lv_conflict');
select t.as_pg();
update lv.handle_history set held_until = now() - interval '1 day' where handle = 'sunny_day';
update lv.accounts set handle_changed_at = now() - interval '31 days' where handle = 'sunny_two';
select t.as_kpn(2);
select t.check('after the hold it is free again', (lv_api.lv_handle_check('sunny_day') ->> 'available')::boolean);
select t.as_kpn(1);
select t.check('after the interval the owner can change again', (lv_api.lv_handle_set('sunny_three') ->> 'ok')::boolean);

-- Signed out callers get nothing.
select t.as_anon();
select t.check('anonymous cannot check', t.raises($$select lv_api.lv_handle_check('anything')$$));

-- Rate limit: 30 checks a minute per account.
select t.as_kpn(3, null, true, 'Account Three'); select lv_api.lv_my_context();
select count(*) from generate_series(1, 30) g, lateral (select lv_api.lv_handle_check('probe' || g)) x;
select t.check('the 31st check in a minute is refused', t.code(lv_api.lv_handle_check('probe31')) = 'lv_rate_limited');

-- The helper tables are not reachable by API roles.
select t.check('authenticated cannot read the history', t.raises($$select * from lv.handle_history$$));
select t.check('authenticated cannot read the reserved list', t.raises($$select * from lv.reserved_handles$$));
select t.check('authenticated cannot read the check log', t.raises($$select * from lv.handle_check_log$$));

-- Link candidates: an existing account is found by the person's verified email (indexed lookup), as a hint only.
select t.as_pg();
update lv.policy set value = value || to_jsonb('https://other.example/auth/v1'::text) where key = 'identity.trusted_issuers';
select t.as_kpn(4, 'Pat@Example.com', true, 'Pat Old'); select lv_api.lv_my_context();
select t.as_kpn(5, 'pat@example.com', true, 'Pat New', 'https://other.example/auth/v1'); select lv_api.lv_my_context();
select t.check('the new sign-in finds the old account by email, ignoring case', jsonb_array_length(lv_api.lv_link_candidates() -> 'candidates') = 1);
select t.check('the hint carries a name, never an email or id', (
  select not (c ? 'email') and not (c ? 'account_id') and not (c ? 'id') and c ->> 'display_name' = 'Pat Old'
    from jsonb_array_elements(lv_api.lv_link_candidates() -> 'candidates') c limit 1));
select t.as_kpn(6, 'someone@example.com', true, 'Nobody Matches', 'https://other.example/auth/v1'); select lv_api.lv_my_context();
select t.check('no match, no candidates', jsonb_array_length(lv_api.lv_link_candidates() -> 'candidates') = 0);
select t.as_kpn(7, 'pat@example.com', false, 'Unverified Pat', 'https://other.example/auth/v1'); select lv_api.lv_my_context();
select t.check('an unverified email finds nothing', jsonb_array_length(lv_api.lv_link_candidates() -> 'candidates') = 0);
select t.as_anon();
select t.check('anonymous cannot ask for candidates', t.raises($$select lv_api.lv_link_candidates()$$));
select t.as_pg();
select t.check('the email lookup is indexed', exists (select 1 from pg_indexes where indexname = 'account_identities_email_idx'));
select t.check('handle changes are audited', exists (select 1 from lv.audit_events where action = 'account.handle_set'));
rollback;
