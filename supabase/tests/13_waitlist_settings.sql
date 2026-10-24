-- 13: public waitlist (closed by default, no enumeration, throttled, PII protected) and Hub settings (capability, validation,
-- legacy name untouched). Policy values are SYNTHETIC test inputs.
select set_config('t.file', '13_waitlist_settings', false);
begin;

select lv_private.backfill_org_hub(t.org_a(), t.u(2));
select lv_private.backfill_org_hub(t.org_b(), t.u(11));
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (t.org_a(), 'starter', 'synthetic');
insert into lv_private.roles (hub_id, name) values (t.org_a(), 'Settings');
insert into lv_private.role_capabilities select r.id, 'admin.settings.edit' from lv_private.roles r where r.name = 'Settings';
insert into lv_private.role_assignments (hub_id, account_id, role_id) select t.org_a(), t.u(3), r.id from lv_private.roles r where r.name = 'Settings';

-- ---- waitlist: closed until the founder opens it
select t.as_anon();
select t.check('waitlist policy unset: lv_policy_undecided naming the key', public.lv_waitlist_join('a@example.invalid')->'error'->'details'->'missing' = '["waitlist.open"]'::jsonb
  and t.code(public.lv_waitlist_join('a@example.invalid')) = 'lv_policy_undecided');
select t.as_pg();
update lv_private.policy set value = 'false'::jsonb where key = 'waitlist.open';
select t.as_anon();
select t.check('waitlist deliberately closed: status closed, nothing stored', public.lv_waitlist_join('a@example.invalid')->'data'->>'status' = 'closed');
select t.as_pg();
select t.check('...and no row or throttle entry was written', t.q('select count(*) from lv_private.waitlist') = '0' and t.q('select count(*) from lv_private.waitlist_attempts') = '0');
update lv_private.policy set value = '"yes"'::jsonb where key = 'waitlist.open';
select t.as_anon();
select t.check('a non-boolean policy value counts as undecided', t.code(public.lv_waitlist_join('a@example.invalid')) = 'lv_policy_undecided');
select t.as_pg();
update lv_private.policy set value = 'true'::jsonb where key = 'waitlist.open';

-- ---- open: validation and normalization
select t.as_anon();
select t.check('anon can join', public.lv_waitlist_join('  Person.One@Example.INVALID ', 'My club')->'data'->>'status' = 'queued');
select t.as_user(t.u(4));
select t.check('a signed-in user can join too', t.code(public.lv_waitlist_join('person.two@example.invalid')) = 'ok');
select t.as_anon();
select t.check('a repeat with different case/space answers exactly like a new sign-up (no enumeration)',
  public.lv_waitlist_join('PERSON.ONE@example.invalid')->'data' = '{"status":"queued"}'::jsonb and public.lv_waitlist_join('person.three@example.invalid')->'data' = '{"status":"queued"}'::jsonb);
select t.check('the response never contains the address', position('person' in public.lv_waitlist_join('person.four@example.invalid')::text) = 0);
select t.as_pg();
select t.check('normalized: one row per address', t.q($$select count(*) from lv_private.waitlist where email_normalized = 'person.one@example.invalid'$$) = '1');
select t.check('the first sign-up''s details were kept (idempotent, not overwritten)', t.q($$select intended_hub_name from lv_private.waitlist where email_normalized = 'person.one@example.invalid'$$) = 'My club');
select t.as_anon();
select t.check('no @ is invalid', t.code(public.lv_waitlist_join('nobody')) = 'lv_invalid_input');
select t.check('inner space is invalid', t.code(public.lv_waitlist_join('a b@example.invalid')) = 'lv_invalid_input');
select t.check('two @ is invalid', t.code(public.lv_waitlist_join('a@b@example.invalid')) = 'lv_invalid_input');
select t.check('no domain dot is invalid', t.code(public.lv_waitlist_join('a@localhost')) = 'lv_invalid_input');
select t.check('control characters are invalid', t.code(public.lv_waitlist_join(E'a@exa\nmple.invalid')) = 'lv_invalid_input');
select t.check('over 254 characters is invalid', t.code(public.lv_waitlist_join(repeat('a', 250) || '@e.co')) = 'lv_invalid_input');
select t.check('null is invalid', t.code(public.lv_waitlist_join(null)) = 'lv_invalid_input');
select t.check('over-long or control-character Hub name is invalid', t.code(public.lv_waitlist_join('ok1@example.invalid', repeat('x', 81))) = 'lv_invalid_input'
  and t.code(public.lv_waitlist_join('ok2@example.invalid', E'bad\tname')) = 'lv_invalid_input');
select t.check('error details never echo the address', position('example' in public.lv_waitlist_join('bad email')::text) = 0);

-- ---- throttling (provisional limits): 5 per address per day, 30 per network address per hour
select t.as_anon();
select count(*) filter (where public.lv_waitlist_join('spammer@example.invalid')->>'ok' = 'true') as ok_n from generate_series(1, 8) \gset
select t.check('one address: only 5 attempts a day are accepted', :ok_n = 5);
select t.check('the 6th attempt says retry later with a delay', public.lv_waitlist_join('spammer@example.invalid')->'error'->'details'->>'retry_after_seconds' ~ '^[0-9]+$'
  and t.code(public.lv_waitlist_join('spammer@example.invalid')) = 'lv_rate_limited');
select t.check('another address is unaffected', t.code(public.lv_waitlist_join('other@example.invalid')) = 'ok');
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.9, 10.0.0.1"}', false);
select count(*) filter (where public.lv_waitlist_join('net' || n || '@example.invalid')->>'ok' = 'true') as ip_ok from generate_series(1, 33) n \gset
select t.check('one network address: only 30 an hour', :ip_ok = 30);
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.77"}', false);
select t.check('a different network address is unaffected', t.code(public.lv_waitlist_join('fresh@example.invalid')) = 'ok');
select set_config('request.headers', '', false);
select t.as_pg();
select t.check('the throttle ledger holds hashes only: no address and no IP text',
  not exists (select 1 from lv_private.waitlist_attempts a where a.email_hash like '%@%' or a.ip_hash like '%203.0.113%') and t.q('select count(*) from lv_private.waitlist_attempts where email_hash ~ ''^[0-9a-f]{64}$''') <> '0');

-- ---- PII boundary
select t.as_user(t.u(2));
select t.check('Owner cannot read the waitlist', t.raises('select * from lv_private.waitlist', '42501'));
select t.check('Owner cannot read the throttle ledger', t.raises('select * from lv_private.waitlist_attempts', '42501'));
select t.check('Owner cannot read the salt', t.raises('select * from lv_private.secrets', '42501'));
select t.as_anon();
select t.check('anon cannot read the waitlist', t.raises('select * from lv_private.waitlist', '42501'));
select t.as_pg();
select t.check('exactly one public function touches the waitlist', (select string_agg(p.proname, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and (p.prosrc ilike '%lv_private.waitlist%')) = 'lv_waitlist_join');
select t.check('no waitlist row links to an account, a Hub or a Campaign', not exists (select 1 from information_schema.columns where table_schema = 'lv_private' and table_name = 'waitlist' and column_name in ('account_id', 'hub_id', 'campaign_id')));

-- ---- Hub settings
select t.as_anon();
select t.check('anon: unauthenticated', t.code(public.lv_hub_settings_update(t.org_a(), 'x')) = 'lv_unauthenticated');
select t.as_user(t.u(4));
select t.check('a plain member cannot change settings', t.code(public.lv_hub_settings_update(t.org_a(), 'Nope')) = 'lv_forbidden');
select t.as_user(t.u(11));
select t.check('another Hub''s Owner cannot', t.code(public.lv_hub_settings_update(t.org_a(), 'Nope')) = 'lv_forbidden');
select t.as_user(t.u(3));
select t.check('a role holding admin.settings.edit can rename', public.lv_hub_settings_update(t.org_a(), '  Cafe Hub  ')->'data'->>'name' = 'Cafe Hub');
select t.check('nothing to change is invalid_input', t.code(public.lv_hub_settings_update(t.org_a())) = 'lv_invalid_input');
select t.check('invalid visibility / mode / name are invalid_input', t.code(public.lv_hub_settings_update(t.org_a(), null, 'secret')) = 'lv_invalid_input'
  and t.code(public.lv_hub_settings_update(t.org_a(), null, null, 'anyone')) = 'lv_invalid_input'
  and t.code(public.lv_hub_settings_update(t.org_a(), repeat('n', 81))) = 'lv_invalid_input'
  and t.code(public.lv_hub_settings_update(t.org_a(), E'bad\nname')) = 'lv_invalid_input');
select t.check('visibility and mode change together', (public.lv_hub_settings_update(t.org_a(), null, 'public', 'approval')->'data') - 'hub_id' = '{"name":"Cafe Hub","visibility":"public","membership_mode":"approval"}'::jsonb);
select t.as_anon();
select t.check('the card now reflects the new name, visibility and mode', public.lv_hub_public('lioncafe')->'data'->>'name' = 'Cafe Hub'
  and public.lv_hub_public('lioncafe')->'data'->>'visibility' = 'public' and public.lv_hub_public('lioncafe')->'data'->>'membership_mode' = 'approval');
select t.as_user(t.u(4));
select t.check('...and so does the member''s context', public.lv_my_context()->'data'->'memberships'->0->>'name' = 'Cafe Hub');
select t.as_user(t.u(3));
select t.check('an idempotent repeat changes nothing', public.lv_hub_settings_update(t.org_a(), 'Cafe Hub', 'public', 'approval')->>'ok' = 'true');
select t.as_pg();
select t.check('the audit trail recorded one change set per real change (2), with before/after', t.q('select count(*) from lv_private.hub_settings_events') = '2'
  and t.q($$select changes->'name'->>'to' from lv_private.hub_settings_events order by id limit 1$$) = 'Cafe Hub');
select t.check('the legacy organization name and slug are untouched', (select name from public.orgs where id = t.org_a()) = 'Miami Job Corps Cafeteria' and (select slug from public.orgs where id = t.org_a()) = 'LionCafe');
select t.check('legacy data is byte-identical', t.legacy_fingerprint() = (select fp from t.snapshot where name = 'pre'));
select t.check('Hub B''s settings were never touched', (select display_name from lv_private.hubs where id = t.org_b()) is null);
select t.check('the Owner role cannot be bypassed: settings do not change ownership', (select owner_account_id from lv_private.hubs where id = t.org_a()) = t.u(2));
select t.as_user(t.u(2));
select t.check('the Owner can always change settings', t.code(public.lv_hub_settings_update(t.org_a(), null, 'private')) = 'ok');
select t.as_user(t.u(3));
select t.check('direct: settings audit is unreadable', t.raises('select * from lv_private.hub_settings_events', '42501'));

rollback;
