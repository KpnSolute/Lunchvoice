-- 46: a public Hub shows its latest open guest Campaign to signed-out visitors (000046).
select set_config('t.file', '46_hub_public_poll', false);
begin;
select t.trust_test_issuer();
select t.as_kpn(1); select lv_api.lv_my_context();
select t.put('me', t.q($$select lv.current_account_id()::text$$));
select t.grant_credit(t.id('me'));
select t.put('hub', lv_api.lv_hub_create('poll-test-hub', 'Poll Test Hub') ->> 'hub_id');
select lv_api.lv_hub_update(t.id('hub'), null, 'public', 'open', null, null);

select t.as_anon();
select t.check('poll: anyone may call it signed out', has_function_privilege('anon', 'lv_api.lv_hub_public_poll(text)', 'execute'));
select t.check('poll: a public Hub with nothing open answers poll null', lv_api.lv_hub_public_poll('poll-test-hub') -> 'poll' = 'null'::jsonb
  and t.code(lv_api.lv_hub_public_poll('poll-test-hub')) = 'ok');

-- A members-only Campaign never shows; a guest Campaign does.
select t.as_kpn(1);
select t.put('members', lv_api.lv_campaign_create(t.id('hub'), 'Members only', 'poll', 'anonymous') ->> 'campaign_id');
select lv_api.lv_campaign_question_add(t.id('members'), 1, 'yes_no', 'Members?', '{}'::jsonb);
select t.check('setup: the members-only poll opens', t.code(lv_api.lv_campaign_activate(t.id('members'))) = 'ok');
select t.as_anon();
select t.check('poll: a members-only Campaign is never shown', lv_api.lv_hub_public_poll('poll-test-hub') -> 'poll' = 'null'::jsonb);

select t.as_kpn(1);
select t.put('guest', lv_api.lv_campaign_create(t.id('hub'), 'What should we build next?', 'poll', 'anonymous') ->> 'campaign_id');
select lv_api.lv_campaign_question_add(t.id('guest'), 1, 'single_choice', 'Pick one', '{"options":["Charts","Branding"]}'::jsonb);
select lv_api.lv_campaign_set_participation(t.id('guest'), 'members_and_guests', null);
select t.check('setup: the guest poll opens', t.code(lv_api.lv_campaign_activate(t.id('guest'))) = 'ok');
select t.put('token', t.q(format($q$select link_token from lv.campaigns where id = %L::uuid$q$, t.get('guest'))));
select t.as_anon();
select t.put('p', (lv_api.lv_hub_public_poll('Poll-Test-Hub') -> 'poll')::text);
select t.check('poll: the open guest poll is shown (slug in any case)', t.get('p')::jsonb ->> 'title' = 'What should we build next?');
select t.check('poll: it carries the link token so the visitor can answer', t.get('p')::jsonb ->> 'link_token' = t.get('token'));
select t.check('poll: it says how many questions', (t.get('p')::jsonb ->> 'question_count')::int = 1);
select t.check('poll: no ids, results or counts', not (t.get('p')::jsonb ?| array['campaign_id', 'participant_count', 'cells', 'join_code']));
select t.check('poll: the link token opens it in the guest player', t.code(lv_api.lv_guest_campaign_get(t.get('token'))) = 'ok');

-- Blocked, private, suspended or closed: nothing.
select t.as_pg();
update lv.campaigns set blocked_at = now() where id = t.id('guest');
select t.as_anon();
select t.check('poll: a blocked poll is not shown', lv_api.lv_hub_public_poll('poll-test-hub') -> 'poll' = 'null'::jsonb);
select t.as_pg();
update lv.campaigns set blocked_at = null where id = t.id('guest');
update lv.hubs set visibility = 'private' where id = t.id('hub');
select t.as_anon();
select t.check('poll: a private Hub answers exactly like a missing one',
  lv_api.lv_hub_public_poll('poll-test-hub') = lv_api.lv_hub_public_poll('no-such-hub-here'));
select t.as_pg();
update lv.hubs set visibility = 'public' where id = t.id('hub');
insert into lv.hub_suspensions (hub_id, reason) values (t.id('hub'), 'Review');
select t.as_anon();
select t.check('poll: a suspended Hub shows nothing', lv_api.lv_hub_public_poll('poll-test-hub') -> 'poll' = 'null'::jsonb);
select t.as_pg();
delete from lv.hub_suspensions where hub_id = t.id('hub');
select t.as_anon();
select t.check('setup: lifted, it shows again', lv_api.lv_hub_public_poll('poll-test-hub') #>> '{poll,title}' = 'What should we build next?');
select t.as_kpn(1);
select lv_api.lv_campaign_close(t.id('guest'));
select t.as_anon();
select t.check('poll: a closed poll is no longer shown', lv_api.lv_hub_public_poll('poll-test-hub') -> 'poll' = 'null'::jsonb);
rollback;
