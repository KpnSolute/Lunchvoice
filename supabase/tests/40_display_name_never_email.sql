-- 40: a display name is never an email address (000040, audit P3).
select set_config('t.file', '40_display_name_never_email', false);
begin;
select t.trust_test_issuer();
select t.as_pg();
select t.check('p3: a normal name is kept', lv.safe_display_name('Dana Reyes', 'dana@example.invalid') = 'Dana Reyes');
select t.check('p3: an email as name becomes the local part with digits trimmed', lv.safe_display_name('jdoe1985@example.invalid', null) = 'jdoe');
select t.check('p3: no name falls back to the email local part', lv.safe_display_name(null, 'sam42@example.invalid') = 'sam');
select t.check('p3: only digits falls back to Member', lv.safe_display_name('12345@example.invalid', '678@example.invalid') = 'Member');
select t.check('p3: nothing at all is Member', lv.safe_display_name(null, null) = 'Member');

-- KpnIdentity sends the email as `name` for email/password sign-ups.
select t.as_kpn(1, 'ria2024@example.invalid', true, 'ria2024@example.invalid'); select lv_api.lv_my_context();
select t.put('ria', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.check('p3: a new account never stores an email as its name', (select display_name from lv.accounts where id = t.id('ria')) = 'ria');
select t.check('p3: the identity cache drops an email-shaped name', (select display_name from lv.account_identities where account_id = t.id('ria')) is null);

select t.as_kpn(1, 'ria2024@example.invalid', true, 'ria2024@example.invalid');
select t.check('p3: the profile editor refuses @', t.code(lv_api.lv_profile_update('ria@example.invalid')) = 'lv_invalid_input');
select t.check('p3: the profile editor still accepts a normal name', t.code(lv_api.lv_profile_update('Ria M.')) = 'ok');

select t.as_pg();
select t.check('p3: the table rejects an @ name even from the owner role',
  t.raises($$update lv.accounts set display_name = 'x@example.invalid' where id = '$$ || t.get('ria') || $$'$$, '23514'));
rollback;
