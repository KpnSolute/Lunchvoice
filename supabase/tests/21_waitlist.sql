-- 21: public waitlist (000021). Signed-out email sign-up that fails closed, never enumerates, throttles and stores no
-- raw address in its throttle ledger.
select set_config('t.file', '21_waitlist', false);
begin;

-- ===== closed until the founder decisions exist ==========================================================
select t.as_anon();
select t.check('closed: with no decisions the status is pending, not open', lv_api.lv_waitlist_status() ->> 'status' = 'pending');
select t.check('closed: joining before the decisions is lv_policy_undecided and lists what is missing',
  t.code(lv_api.lv_waitlist_join('a@example.invalid')) = 'lv_policy_undecided'
  and jsonb_array_length(lv_api.lv_waitlist_join('a@example.invalid') #> '{error,missing}') = 4);

select t.as_pg();
update lv.policy set value = 'true'::jsonb where key = 'waitlist.open';
select t.as_anon();
select t.check('closed: open=true alone is still not enough (consent, retention and removal missing)',
  t.code(lv_api.lv_waitlist_join('a@example.invalid')) = 'lv_policy_undecided'
  and jsonb_array_length(lv_api.lv_waitlist_join('a@example.invalid') #> '{error,missing}') = 3);

select t.as_pg();
update lv.policy set value = '"test-consent-v0"'::jsonb where key = 'waitlist.consent_version';
update lv.policy set value = '{"days": 30}'::jsonb where key = 'waitlist.retention';
update lv.policy set value = '{"channel": "test removal channel"}'::jsonb where key = 'waitlist.removal';

-- ===== open: signed-out visitors can join ================================================================
select t.as_anon();
select t.check('open: status shows the consent version, retention and removal channel',
  lv_api.lv_waitlist_status() ->> 'status' = 'open'
  and lv_api.lv_waitlist_status() ->> 'consent_version' = 'test-consent-v0'
  and (lv_api.lv_waitlist_status() ->> 'retention_days') = '30'
  and lv_api.lv_waitlist_status() ->> 'removal_channel' = 'test removal channel');
select t.check('open: a signed-out visitor joins with an email only',
  lv_api.lv_waitlist_join('  New.Person@Example.Invalid ') ->> 'status' = 'queued');
select t.check('open: a repeat sign-up answers exactly like a new one (no enumeration)',
  lv_api.lv_waitlist_join('new.person@example.invalid') = lv_api.lv_waitlist_join('new.person@example.invalid'));
select t.as_pg();
select t.check('open: the address is stored once, lower-cased, with the consent version and a deletion date',
  t.q($$select (count(*) = 1 and min(email_normalized) = 'new.person@example.invalid'
               and min(consent_version) = 'test-consent-v0' and min(delete_after) > now() + interval '29 days')::text
          from lv.waitlist$$) = 'true');
select t.check('open: the throttle ledger holds no raw address',
  t.q($$select (count(*) > 0 and bool_and(email_hash !~ '@' and email_hash ~ '^[0-9a-f]{64}$'))::text from lv.waitlist_attempts$$) = 'true');

-- ===== validation ========================================================================================
select t.as_anon();
select t.check('invalid: not an email', t.code(lv_api.lv_waitlist_join('not-an-email')) = 'lv_invalid_input');
select t.check('invalid: whitespace inside', t.code(lv_api.lv_waitlist_join('a b@example.invalid')) = 'lv_invalid_input');
select t.check('invalid: null', t.code(lv_api.lv_waitlist_join(null)) = 'lv_invalid_input');
select t.check('invalid: an over-long Hub name', t.code(lv_api.lv_waitlist_join('b@example.invalid', repeat('x', 81))) = 'lv_invalid_input');
select t.check('valid: an intended Hub name is accepted',
  lv_api.lv_waitlist_join('c@example.invalid', 'Some Hub') ->> 'status' = 'queued');

-- ===== throttle: the caller's own attempts only ==========================================================
select t.as_anon();
select lv_api.lv_waitlist_join('t@example.invalid');
select lv_api.lv_waitlist_join('t@example.invalid');
select lv_api.lv_waitlist_join('t@example.invalid');
select lv_api.lv_waitlist_join('t@example.invalid');
select t.check('throttle: the sixth attempt for one address in a day is lv_rate_limited with a retry time',
  t.code(lv_api.lv_waitlist_join('t@example.invalid')) = 'ok'
  and t.code(lv_api.lv_waitlist_join('t@example.invalid')) = 'lv_rate_limited'
  and (lv_api.lv_waitlist_join('t@example.invalid') #>> '{error,retry_after_seconds}')::int >= 60);

-- ===== privacy and exposure ==============================================================================
select t.as_anon();
select t.check('privacy: anon cannot read the waitlist', t.raises($$select * from lv.waitlist$$));
select t.check('privacy: anon cannot read the throttle ledger', t.raises($$select * from lv.waitlist_attempts$$));
select t.check('privacy: anon cannot read the salt', t.raises($$select * from lv.secrets$$));
select t.check('privacy: anon cannot run the operator removal', t.raises($$select lv.remove_waitlist_entry('new.person@example.invalid')$$));
select t.as_kpn(1);
select t.check('privacy: a signed-in user cannot read the waitlist either', t.raises($$select * from lv.waitlist$$));

-- ===== deliberately closed ===============================================================================
select t.as_pg();
update lv.policy set value = 'false'::jsonb where key = 'waitlist.open';
select t.as_anon();
select t.check('closed: open=false answers closed even though the other decisions exist',
  lv_api.lv_waitlist_join('z@example.invalid') ->> 'status' = 'closed' and lv_api.lv_waitlist_status() ->> 'status' = 'closed');

-- ===== retention and removal =============================================================================
select t.as_pg();
select t.check('removal: the operator removes an address and its throttle records',
  (lv.remove_waitlist_entry('new.person@example.invalid') ->> 'waitlist_rows_deleted') = '1'
  and t.q($$select count(*)::text from lv.waitlist where email_normalized = 'new.person@example.invalid'$$) = '0');
update lv.waitlist set delete_after = now() - interval '1 day' where email_normalized = 'c@example.invalid';
select t.check('retention: the purge deletes expired rows only',
  (lv.purge_expired_waitlist() ->> 'waitlist_rows_deleted') = '1'
  and t.q($$select count(*)::text from lv.waitlist$$) = '1');

rollback;
