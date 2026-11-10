-- 28: guest names for identified surveys, and the per-person Responses view (000028).
select set_config('t.file', '28_guest_names', false);
begin;
create function t.err_of(p_sql text) returns text language plpgsql security definer as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function t.err_of(text) to public;
select t.trust_test_issuer();

select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('owner'), 'starter');
update lv.policy set value = '30'::jsonb where key = 'participation.guest_rate_per_minute';
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('guest-names', 'Guest Names') ->> 'hub_id'));
select t.put('c', (lv_api.lv_campaign_create(t.id('hub'), 'Pizza?', 'poll', 'identified') ->> 'campaign_id'));
select t.put('q', (lv_api.lv_campaign_question_add(t.id('c'), 1, 'rating', 'How much?') ->> 'question_id'));
select t.put('a', format('[{"question_id":"%s","value":5}]', t.get('q')));

select t.check('names: off by default', (lv_api.lv_campaign_get(t.id('c')) #>> '{campaign,guest_names}') = 'off');
select t.check('names: guests must be allowed first', t.code(lv_api.lv_campaign_set_guest_names(t.id('c'), 'optional')) = 'lv_not_available');
select lv_api.lv_campaign_set_participation(t.id('c'), 'members_and_guests');
select t.check('names: a bad mode is refused', t.code(lv_api.lv_campaign_set_guest_names(t.id('c'), 'sometimes')) = 'lv_invalid_input');
select t.check('names: required can be chosen on an identified Campaign', t.code(lv_api.lv_campaign_set_guest_names(t.id('c'), 'required')) = 'ok');
select t.check('names: and the manager''s view shows it', (lv_api.lv_campaign_get(t.id('c')) #>> '{campaign,guest_names}') = 'required');
select t.check('names: a Campaign with names on cannot become anonymous (database refuses)',
  t.code(lv_api.lv_campaign_update(t.id('c'), p_anonymity => 'anonymous')) = 'lv_not_available');
select t.check('names: the Campaign is still identified', t.q(format($q$select anonymity from lv.campaigns where id = %L::uuid$q$, t.get('c'))) = 'identified');
select t.check('names: publishing works', t.code(lv_api.lv_campaign_activate(t.id('c'))) = 'ok');
select t.put('code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('c'))));
select t.check('names: running Campaigns cannot change the setting', t.code(lv_api.lv_campaign_set_guest_names(t.id('c'), 'off')) = 'lv_locked');

-- ===== the guest's side ===================================================================================
select t.as_anon();
select t.check('guest view: the respondent is told names are required',
  (lv_api.lv_guest_campaign_get(t.get('code')) #>> '{campaign,guest_names}') = 'required');
select t.check('guest: a required name must be given', t.code(lv_api.lv_guest_submit(t.get('code'), repeat('a', 40), t.get('a')::jsonb, null)) = 'lv_invalid_input'
  and t.code(lv_api.lv_guest_submit(t.get('code'), repeat('a', 40), t.get('a')::jsonb, '   ')) = 'lv_invalid_input');
select t.check('guest: the old three-argument call is refused too (no name given)', t.code(lv_api.lv_guest_submit(t.get('code'), repeat('a', 40), t.get('a')::jsonb)) = 'lv_invalid_input');
select t.check('guest: a name over 40 characters is refused', t.code(lv_api.lv_guest_submit(t.get('code'), repeat('a', 40), t.get('a')::jsonb, repeat('x', 41))) = 'lv_invalid_input');
select t.check('guest: a named answer is accepted', t.code(lv_api.lv_guest_submit(t.get('code'), repeat('a', 40), t.get('a')::jsonb, E'  Sam\t\x01   Lee  ')) = 'ok');
select t.check('guest: answering twice is still one answer', (lv_api.lv_guest_submit(t.get('code'), repeat('a', 40), t.get('a')::jsonb, 'Other') ->> 'duplicate') = 'true');

-- ===== the creator's side =================================================================================
select t.as_kpn(1);
select t.check('responses: the creator sees the guest by name, labelled unverified, with the answer',
  (lv_api.lv_campaign_responses(t.id('c')) #>> '{responses,0,kind}') = 'guest'
  and (lv_api.lv_campaign_responses(t.id('c')) #>> '{responses,0,verified}') = 'false'
  and (lv_api.lv_campaign_responses(t.id('c')) #>> '{responses,0,name}') = 'Sam Lee'
  and (lv_api.lv_campaign_responses(t.id('c')) #>> '{responses,0,answers,0,value}') = '5');
select t.check('responses: the name was cleaned (control characters removed, spaces collapsed, trimmed)',
  t.q(format($q$select guest_name from lv.submissions where campaign_id = %L::uuid and is_guest$q$, t.get('c'))) = 'Sam Lee');
select t.check('responses: opening the list is audited',
  t.q($$select count(*)::text from lv.audit_events where action = 'campaign.responses_viewed'$$)::int >= 1);
select t.check('responses: a total is reported', (lv_api.lv_campaign_responses(t.id('c')) ->> 'total') = '1');

-- A member answers; both show.
select t.as_kpn(2, null, true, 'Member'); select lv_api.lv_my_context();
select t.put('m2', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
insert into lv.hub_memberships (hub_id, account_id, status, accepted_at) values (t.id('hub'), t.id('m2'), 'accepted', now());
select t.as_kpn(2);
select t.check('member: answers as themselves', t.code(lv_api.lv_submit_response(t.id('c'), t.get('a')::jsonb)) = 'ok');
select t.as_kpn(1);
select t.check('responses: a member shows as a verified person',
  (select count(*) from jsonb_array_elements(lv_api.lv_campaign_responses(t.id('c')) -> 'responses') r where r->>'kind' = 'member' and (r->>'verified') = 'true' and r->>'name' = 'Member') = 1);
select t.as_kpn(2);
select t.check('responses: an ordinary member cannot read them', t.code(lv_api.lv_campaign_responses(t.id('c'))) = 'lv_forbidden');
select t.as_anon();
select t.check('responses: signed-out callers cannot', not has_function_privilege('anon', 'lv_api.lv_campaign_responses(uuid, int, timestamptz)', 'execute'));

-- ===== anonymous Campaigns never carry names ==============================================================
select t.as_kpn(1);
select t.put('c2', (lv_api.lv_campaign_create(t.id('hub'), 'Secret', 'poll', 'anonymous') ->> 'campaign_id'));
select t.check('anonymous: names cannot be turned on', t.code(lv_api.lv_campaign_set_guest_names(t.id('c2'), 'optional')) = 'lv_not_available');
select t.check('anonymous: the Responses view refuses', t.code(lv_api.lv_campaign_responses(t.id('c2'))) in ('lv_not_found', 'lv_not_available'));
select t.as_pg();
select t.check('anonymous: the table refuses a name even if the API were bypassed',
  t.err_of(format($q$insert into lv.submissions (campaign_id, hub_id, campaign_revision, is_guest, guest_name) values (%L, %L, 1, true, 'Nope')$q$, t.get('c2'), t.get('hub'))) like 'lv_not_available:%');
select t.check('anonymous: nor a name switched on at the table',
  t.err_of(format($q$update lv.campaigns set guest_names = 'optional' where id = %L$q$, t.get('c2'))) like 'lv_not_available:%');

-- ===== pausing: the setting can change only before any answer =============================================
select t.as_kpn(1);
select t.put('c3', (lv_api.lv_campaign_create(t.id('hub'), 'Second', 'poll', 'identified') ->> 'campaign_id'));
select t.put('q3', (lv_api.lv_campaign_question_add(t.id('c3'), 1, 'rating', 'Q?') ->> 'question_id'));
select lv_api.lv_campaign_set_participation(t.id('c3'), 'members_and_guests');
select lv_api.lv_campaign_set_guest_names(t.id('c3'), 'optional');
select lv_api.lv_campaign_activate(t.id('c3'));
select lv_api.lv_campaign_pause(t.id('c3'));
select t.check('paused, no answers: names can be switched', t.code(lv_api.lv_campaign_set_guest_names(t.id('c3'), 'required')) = 'ok');
select lv_api.lv_campaign_resume(t.id('c3'));
select t.put('code3', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('c3'))));
select t.as_anon();
select t.check('optional: a guest may skip the name', t.code(lv_api.lv_guest_submit(t.get('code3'), repeat('b', 40), format('[{"question_id":"%s","value":3}]', t.get('q3'))::jsonb)) = 'lv_invalid_input'); -- it is "required" now
select t.as_kpn(1);
select lv_api.lv_campaign_pause(t.id('c3'));
select lv_api.lv_campaign_set_guest_names(t.id('c3'), 'optional');
select lv_api.lv_campaign_resume(t.id('c3'));
select t.as_anon();
select t.check('optional: a guest may skip the name and is then listed without one',
  t.code(lv_api.lv_guest_submit(t.get('code3'), repeat('b', 40), format('[{"question_id":"%s","value":3}]', t.get('q3'))::jsonb, null)) = 'ok');
select t.as_kpn(1);
select lv_api.lv_campaign_pause(t.id('c3'));
select t.check('paused with answers: names are locked', t.code(lv_api.lv_campaign_set_guest_names(t.id('c3'), 'required')) = 'lv_locked');
select t.check('responses: the unnamed guest shows with no name', (lv_api.lv_campaign_responses(t.id('c3')) #>> '{responses,0,name}') is null
  and (lv_api.lv_campaign_responses(t.id('c3')) #>> '{responses,0,kind}') = 'guest');

select t.as_pg();
select t.check('grants: the new guest call is for signed-out callers, the setting and the list are not',
  has_function_privilege('anon', 'lv_api.lv_guest_submit(text, text, jsonb, text)', 'execute')
  and not has_function_privilege('anon', 'lv_api.lv_campaign_set_guest_names(uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'lv.api_campaign_responses(uuid, int, timestamptz)', 'execute'));

rollback;
