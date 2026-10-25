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

-- ---- waitlist: closed until the founder has decided FOUR things (open, consent wording, retention, removal)
select t.as_anon();
select t.check('nothing decided: lv_policy_undecided naming all four keys', public.lv_waitlist_join('a@example.invalid')->'error'->'details'->'missing'
  = '["waitlist.open","waitlist.consent_version","waitlist.retention","waitlist.removal"]'::jsonb and t.code(public.lv_waitlist_join('a@example.invalid')) = 'lv_policy_undecided');
select t.as_pg();
update lv_private.policy set value = 'false'::jsonb where key = 'waitlist.open';
select t.as_anon();
select t.check('deliberately closed: status closed even though the other decisions are missing', public.lv_waitlist_join('a@example.invalid')->'data'->>'status' = 'closed');
select t.as_pg();
select t.check('...nothing stored, no throttle entry', t.q('select count(*) from lv_private.waitlist') = '0' and t.q('select count(*) from lv_private.waitlist_attempts') = '0');
update lv_private.policy set value = 'true'::jsonb where key = 'waitlist.open';
select t.as_anon();
select t.check('open=true alone is NOT enough: consent wording, retention and removal are still missing',
  public.lv_waitlist_join('a@example.invalid')->'error'->'details'->'missing' = '["waitlist.consent_version","waitlist.retention","waitlist.removal"]'::jsonb);
select t.as_pg();
update lv_private.policy set value = '"v-test-1"'::jsonb where key = 'waitlist.consent_version';
select t.as_anon();
select t.check('consent wording decided: retention and removal still missing', public.lv_waitlist_join('a@example.invalid')->'error'->'details'->'missing' = '["waitlist.retention","waitlist.removal"]'::jsonb);
select t.as_pg();
update lv_private.policy set value = '{"days": 0}'::jsonb where key = 'waitlist.retention';
update lv_private.policy set value = '{"channel": ""}'::jsonb where key = 'waitlist.removal';
select t.as_anon();
select t.check('invalid retention (0 days) and an empty removal channel count as undecided', public.lv_waitlist_join('a@example.invalid')->'error'->'details'->'missing' = '["waitlist.retention","waitlist.removal"]'::jsonb);
select t.as_pg();
update lv_private.policy set value = '{"days": 4000}'::jsonb where key = 'waitlist.retention';
select t.as_anon();
select t.check('retention beyond ten years is rejected too', jsonb_array_length(public.lv_waitlist_join('a@example.invalid')->'error'->'details'->'missing') = 2);
select t.as_pg();
-- Synthetic test decisions (NOT approved; they exist only so the mechanics can be tested).
update lv_private.policy set value = '{"days": 30}'::jsonb where key = 'waitlist.retention';
update lv_private.policy set value = '{"channel": "synthetic test channel"}'::jsonb where key = 'waitlist.removal';

-- ---- open: validation, normalization, stored fields
select t.as_anon();
select t.check('anon can join', public.lv_waitlist_join('  Person.One@Example.INVALID ', 'My club')->'data'->>'status' = 'queued');
select t.as_user(t.u(4));
select t.check('a signed-in user can join too', t.code(public.lv_waitlist_join('person.two@example.invalid')) = 'ok');
select t.as_anon();
select t.check('a repeat with different case/space answers exactly like a new sign-up', public.lv_waitlist_join('PERSON.ONE@example.invalid')->'data' = '{"status":"queued"}'::jsonb
  and public.lv_waitlist_join('person.three@example.invalid')->'data' = '{"status":"queued"}'::jsonb);
select t.check('the response never contains the address', position('person' in public.lv_waitlist_join('person.four@example.invalid')::text) = 0);
select t.as_pg();
select t.check('normalized: one row per address, first details kept', t.q($$select count(*) from lv_private.waitlist where email_normalized = 'person.one@example.invalid'$$) = '1'
  and t.q($$select intended_hub_name from lv_private.waitlist where email_normalized = 'person.one@example.invalid'$$) = 'My club');
select t.check('each sign-up records the consent version and a deletion date about 30 days out', t.q($$select consent_version from lv_private.waitlist where email_normalized = 'person.one@example.invalid'$$) = 'v-test-1'
  and t.q($$select extract(day from delete_after - created_at)::int from lv_private.waitlist where email_normalized = 'person.one@example.invalid'$$) = '30');
select t.as_anon();
select t.check('invalid emails are refused', t.code(public.lv_waitlist_join('nobody')) = 'lv_invalid_input' and t.code(public.lv_waitlist_join('a b@example.invalid')) = 'lv_invalid_input'
  and t.code(public.lv_waitlist_join('a@b@example.invalid')) = 'lv_invalid_input' and t.code(public.lv_waitlist_join('a@localhost')) = 'lv_invalid_input'
  and t.code(public.lv_waitlist_join(E'a@exa\nmple.invalid')) = 'lv_invalid_input' and t.code(public.lv_waitlist_join(repeat('a', 250) || '@e.co')) = 'lv_invalid_input'
  and t.code(public.lv_waitlist_join(null)) = 'lv_invalid_input');
select t.check('over-long or control-character Hub name is invalid', t.code(public.lv_waitlist_join('ok1@example.invalid', repeat('x', 81))) = 'lv_invalid_input'
  and t.code(public.lv_waitlist_join('ok2@example.invalid', E'bad\tname')) = 'lv_invalid_input');
select t.check('error details never echo the address', position('example' in public.lv_waitlist_join('bad email')::text) = 0);

-- ---- origin: only a configured, trusted position of a proxy header is believed
select t.as_pg();
delete from lv_private.waitlist_attempts;
select t.as_anon();
select set_config('request.headers', '{"x-forwarded-for": "198.51.100.1"}', false);
select count(*) filter (where public.lv_waitlist_join('shared' || n || '@example.invalid')->>'ok' = 'true') as ok_n from generate_series(1, 33) n \gset
select t.check('no trusted source configured: the caller-supplied header is IGNORED and everyone shares one bucket (30 an hour)', :ok_n = 30);
select count(*) filter (where public.lv_waitlist_join('rot' || n || '@example.invalid') ->>'ok' = 'true') as ok2 from (select n from generate_series(1, 5) n) x, lateral (select set_config('request.headers', format('{"x-forwarded-for": "198.51.100.%s"}', n + 50), false)) h \gset
select t.check('...rotating the header value does not escape the shared bucket', :ok2 = 0);
select set_config('request.headers', '', false);
select t.as_pg();
update lv_private.policy set value = '{"header": "x-forwarded-for", "hops_from_right": 1}'::jsonb where key = 'waitlist.trusted_ip';
delete from lv_private.waitlist_attempts;
select t.as_anon();
-- Origin A = rightmost entry 203.0.113.9; the browser prepends fake entries that must not matter.
do $$ declare n int; ok int := 0; begin
  for n in 1..8 loop
    perform set_config('request.headers', format('{"x-forwarded-for": "fake-%s, 203.0.113.9"}', n), false);
    if public.lv_waitlist_join('same@example.invalid')->>'ok' = 'true' then ok := ok + 1; end if;
  end loop;
  perform t.put('pair_ok', ok::text);
end $$;
select t.check('one address from one origin: 5 attempts a day, however the browser varies the leading header entries', t.get('pair_ok') = '5');
select set_config('request.headers', '{"x-forwarded-for": "fake-9, 203.0.113.9"}', false);
select t.check('the 6th is rate limited', t.code(public.lv_waitlist_join('same@example.invalid')) = 'lv_rate_limited');
select t.put('limited_a', public.lv_waitlist_join('same@example.invalid')::text);
select set_config('request.headers', '{"x-forwarded-for": "fake-1, 198.51.100.7"}', false);
select t.check('ENUMERATION: the same address from a DIFFERENT origin gets the plain queued answer', public.lv_waitlist_join('same@example.invalid')->'data' = '{"status":"queued"}'::jsonb);
select t.check('ENUMERATION: a never-seen address from that origin gets the identical answer', public.lv_waitlist_join('never.seen@example.invalid')->'data' = '{"status":"queued"}'::jsonb);
select t.check('ENUMERATION: an address already on the list answers identically to one that is not (same origin)',
  public.lv_waitlist_join('person.one@example.invalid')->'data' = public.lv_waitlist_join('absolutely.new@example.invalid')->'data');
select set_config('request.headers', '{"x-forwarded-for": "fake-2, 203.0.113.9"}', false);
select t.check('origin A is limited only on the address it hammered: a fresh address is accepted', t.code(public.lv_waitlist_join('fresh.for.a@example.invalid')) = 'ok');
do $$ declare n int; ok int := 0; begin
  for n in 1..40 loop
    if public.lv_waitlist_join('hour' || n || '@example.invalid')->>'ok' = 'true' then ok := ok + 1; end if;
  end loop;
  perform t.put('hour_ok', ok::text);
end $$;
select t.check('origin A is limited to 30 attempts an hour in total (it had already used 6)', t.get('hour_ok') = '24');
select set_config('request.headers', '{"x-forwarded-for": "fake-3, 198.51.100.7"}', false);
select t.check('...and origin B is unaffected by origin A''s exhaustion', t.code(public.lv_waitlist_join('b.again@example.invalid')) = 'ok');
select set_config('request.headers', '{"x-forwarded-for": "only-one-entry"}', false);
select t.check('too few header entries for the configured hop count: treated as an unknown origin, not trusted', t.code(public.lv_waitlist_join('lone@example.invalid')) in ('ok', 'lv_rate_limited'));
select set_config('request.headers', '', false);
select t.as_pg();
select t.check('the throttle ledger holds only hashes: no address, no IP text, no header fragment',
  not exists (select 1 from lv_private.waitlist_attempts a where a.email_hash !~ '^[0-9a-f]{64}$' or (a.origin_hash <> 'unknown' and a.origin_hash !~ '^[0-9a-f]{64}$')));

-- ---- operator functions: retention and removal
update lv_private.waitlist set delete_after = now() - interval '1 day' where email_normalized = 'person.three@example.invalid';
select t.check('purge deletes only expired sign-ups', (lv_private.purge_expired_waitlist()->>'waitlist_rows_deleted')::int = 1
  and t.q($$select count(*) from lv_private.waitlist where email_normalized = 'person.three@example.invalid'$$) = '0'
  and t.q($$select count(*) from lv_private.waitlist where email_normalized = 'person.one@example.invalid'$$) = '1');
select t.check('removal deletes the entry and that address''s throttle records and nothing else',
  (lv_private.remove_waitlist_entry(' Person.ONE@example.invalid ')->>'waitlist_rows_deleted')::int = 1
  and t.q($$select count(*) from lv_private.waitlist where email_normalized = 'person.one@example.invalid'$$) = '0'
  and t.q($$select count(*) from lv_private.waitlist where email_normalized = 'person.two@example.invalid'$$) = '1');
select t.check('removing an absent address is a harmless no-op', (lv_private.remove_waitlist_entry('absent@example.invalid')->>'waitlist_rows_deleted')::int = 0);
select t.as_user(t.u(2));
select t.check('Owner cannot run the purge or the removal', t.raises('select lv_private.purge_expired_waitlist()', '42501') and t.raises($$select lv_private.remove_waitlist_entry('x@example.invalid')$$, '42501'));

-- ---- PII boundary
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


-- ---- consequences of changing visibility and join mode
select t.as_pg();
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (t.org_a(), 'team', 'synthetic');
update lv_private.policy set value = '["active"]'::jsonb where key = 'quota.consuming_states';
update lv_private.policy set value = '{"window_days": 30}'::jsonb where key = 'gate.measurement';
update lv_private.policy set value = '{"sources": ["v2","legacy_backfill","legacy_signup","legacy_repair"]}'::jsonb where key = 'gate.eligible_population';
update lv_private.policy set value = '{"min_other_active_surveys": 100}'::jsonb where key = 'gate.applies_to';
update lv_private.policy set value = '{"zero_members": "unmet"}'::jsonb where key = 'gate.bootstrap';
insert into public.orgs (id, slug, name) values ('00000000-0000-4000-8001-0000000000c3', 'synthetic-three', 'Synthetic Org Three');
insert into auth.users (id, email, raw_user_meta_data)
  select t.u(n), 'newcomer' || n || '@example.invalid', jsonb_build_object('display_name', 'Newcomer ' || n, 'org_id', '00000000-0000-4000-8001-0000000000c3') from generate_series(21, 24) n;
update lv_private.hubs set visibility = 'public', membership_mode = 'approval' where id = t.org_a();
update lv_private.hub_memberships set status = 'pending' where hub_id = t.org_a() and account_id = t.u(6);
update lv_private.hub_memberships set status = 'suspended' where hub_id = t.org_a() and account_id = t.u(5);
select t.put('SC', t.pubcamp('SC', t.org_a(), false)::text);
select t.put('code', t.q(format('select join_code from lv_private.campaigns where id = %L', t.id('SC'))));
create temp table before_members as select account_id, status from lv_private.hub_memberships where hub_id = t.org_a();
grant all on before_members to public;
create function t.members_unchanged() returns boolean language sql security definer as $$
  select not exists (select 1 from before_members b join lv_private.hub_memberships m on m.hub_id = t.org_a() and m.account_id = b.account_id where m.status <> b.status)
     and (select count(*) from before_members) = (select count(*) from lv_private.hub_memberships where hub_id = t.org_a()) $$;

select t.as_anon();
select t.check('public Hub: anon sees the member count and can resolve the Campaign code', public.lv_hub_public('lioncafe')->'data'->'member_count' <> 'null'::jsonb and public.lv_campaign_resolve(t.get('code'))->>'ok' = 'true');
select t.check('approval mode: an outsider can apply', public.lv_hub_public('lioncafe')->'data'->'viewer'->>'can_join' = 'true');
select t.as_user(t.u(3));
select t.check('switch to OPEN', public.lv_hub_settings_update(t.org_a(), null, null, 'open')->'data'->>'membership_mode' = 'open');
select t.as_pg();
select t.check('...existing memberships were NOT rewritten (pending stays pending, suspended stays suspended)', t.members_unchanged());
select t.as_user(t.u(6));
select t.check('...the pending applicant is not silently admitted by the mode change', public.lv_join_hub(t.org_a())->'data'->>'status' = 'pending');
select t.as_user(t.u(5));
select t.check('...the suspended member still cannot join', t.code(public.lv_join_hub(t.org_a())) = 'lv_forbidden');
select t.as_user(t.u(21));
select t.check('...a NEW attempt follows the current mode (open: accepted)', public.lv_join_hub(t.org_a())->'data'->>'status' = 'accepted');
select t.as_user(t.u(3));
select t.check('switch to INVITE ONLY', public.lv_hub_settings_update(t.org_a(), null, null, 'invite_only')->'data'->>'membership_mode' = 'invite_only');
select t.as_user(t.u(22));
select t.check('...a new attempt is refused', t.code(public.lv_join_hub(t.org_a())) = 'lv_forbidden');
select t.as_anon();
select t.check('...and the card says an outsider cannot join', public.lv_hub_public('lioncafe')->'data'->'viewer'->>'can_join' = 'false');
select t.as_user(t.u(21));
select t.check('...the member admitted under OPEN keeps their membership after the mode changed', jsonb_array_length(public.lv_my_context()->'data'->'memberships') = 1
  and (public.lv_my_context()->'data'->'memberships'->0->>'hub_id')::uuid = t.org_a());
select t.as_user(t.u(3));
select t.check('switch to APPROVAL', public.lv_hub_settings_update(t.org_a(), null, null, 'approval')->'data'->>'membership_mode' = 'approval');
select t.as_user(t.u(23));
select t.check('...a new attempt becomes pending', public.lv_join_hub(t.org_a())->'data'->>'status' = 'pending');
select t.as_pg();
select t.check('no memberships other than the ones created by explicit attempts changed', (select count(*) from lv_private.hub_memberships m join before_members b on b.account_id = m.account_id where m.hub_id = t.org_a() and m.status <> b.status) = 0);

select t.as_user(t.u(3));
select t.check('switch to PRIVATE', public.lv_hub_settings_update(t.org_a(), null, 'private')->'data'->>'visibility' = 'private');
select t.as_anon();
select t.check('private: the member count disappears for outsiders immediately', public.lv_hub_public('lioncafe')->'data'->'member_count' = 'null'::jsonb and t.code(public.lv_member_count(t.org_a())) = 'lv_not_found');
select t.check('private: the Campaign code no longer resolves for anon', t.code(public.lv_campaign_resolve(t.get('code'))) = 'lv_not_found');
select t.as_user(t.u(22));
select t.check('private: nor for a signed-in non-member', t.code(public.lv_campaign_resolve(t.get('code'))) = 'lv_not_found');
select t.as_user(t.u(4));
select t.check('private: accepted members keep access (visibility and participation are separate)', public.lv_campaign_resolve(t.get('code'))->>'ok' = 'true'
  and public.lv_hub_public('lioncafe')->'data'->'member_count' <> 'null'::jsonb);
select t.as_user(t.u(5));
select t.check('private: a suspended member does not regain visibility', t.code(public.lv_member_count(t.org_a())) = 'lv_not_found');
select t.as_pg();
select t.check('visibility changes did not rewrite any pre-existing membership', (select count(*) from lv_private.hub_memberships m join before_members b on b.account_id = m.account_id where m.hub_id = t.org_a() and m.status <> b.status) = 0);
select t.check('role assignments are unchanged by visibility', t.q($$select count(*) from lv_private.role_assignments where hub_id = '$$ || t.org_a() || $$'$$)::int = 1);
select t.check('the settings audit has one entry per real change (4 more than before: open, invite-only, approval, private)', t.q('select count(*) from lv_private.hub_settings_events')::int >= 6);

rollback;
