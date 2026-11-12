-- 38: Elections and the Yes/No feedback type (000037).
select set_config('t.file', '38_elections', false);
begin;
select t.trust_test_issuer();
create function t.vote(p_campaign uuid, p_answers jsonb) returns jsonb language sql as $$ select lv_api.lv_submit_response(p_campaign, p_answers) $$;
grant execute on function t.vote(uuid, jsonb) to public;
create function t.ans(p_q1 uuid, p_v1 jsonb, p_q2 uuid default null, p_v2 jsonb default null) returns jsonb language sql immutable as $$
  select jsonb_build_array(jsonb_build_object('question_id', p_q1, 'value', p_v1))
         || case when p_q2 is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('question_id', p_q2, 'value', p_v2)) end
$$;
grant execute on function t.ans(uuid, jsonb, uuid, jsonb) to public;

select t.as_kpn(1, null, true, 'Organiser'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('owner'), 'starter');
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('vote-hub', 'Vote Hub') ->> 'hub_id'));
select t.put('inv', (lv_api.lv_invite_create(t.id('hub')) ->> 'code'));
select t.as_kpn(n) || lv_api.lv_my_context()::text || lv_api.lv_invite_redeem(t.get('inv'))::text from generate_series(2, 8) n;

-- ===== free plan: basic types yes, elections no ==========================================================
select t.as_kpn(20, null, true, 'Free'); select lv_api.lv_my_context();
select t.check('free: Yes/No is a free Quick Survey type', (lv_api.lv_quick_survey_create('Snow day?', 'link', p_mode => 'yes_no') #>> '{campaign,mode}') = 'yes_no');
select t.check('free: an election is not a Quick Survey type', t.code(lv_api.lv_quick_survey_create('Vote', 'link', p_mode => 'election')) = 'lv_invalid_input');
select t.check('free: the map lists Yes/No and not election',
  (lv_api.lv_plan_limits() #> '{families,free,quick.modes}') = '["survey","poll","rating","yes_no","feedback"]'::jsonb);
select t.check('map: Starter and Team include elections',
  (lv_api.lv_plan_limits() #>> '{families,starter,modes.election}') = 'true' and (lv_api.lv_plan_limits() #>> '{families,team,modes.election}') = 'true');

-- ===== creating an election ==============================================================================
select t.as_kpn(1);
select t.check('hub: Yes/No works in a Hub', t.code(lv_api.lv_campaign_create(t.id('hub'), 'Picnic?', 'yes_no', 'anonymous')) = 'ok');
select t.check('create: an identified election is refused (secret ballot)',
  t.code(lv_api.lv_campaign_create(t.id('hub'), 'Open vote', 'election', 'identified')) = 'lv_invalid_input');
select t.put('e1', (lv_api.lv_campaign_create(t.id('hub'), 'Homecoming court', 'election', 'anonymous') ->> 'campaign_id'));
select t.check('create: an anonymous election on a Starter Hub', t.q(format($q$select mode from lv.campaigns where id = %L::uuid$q$, t.get('e1'))) = 'election');
select t.put('ip', (lv_api.lv_campaign_create(t.id('hub'), 'Named', 'poll', 'identified') ->> 'campaign_id'));
select t.check('switch: an identified poll cannot become an election', t.code(lv_api.lv_campaign_update(t.id('ip'), p_mode => 'election')) = 'lv_invalid_input');
select t.check('rules: an election can never become identified', t.code(lv_api.lv_campaign_update(t.id('e1'), p_anonymity => 'identified')) <> 'ok'
  and t.q(format($q$select anonymity from lv.campaigns where id = %L::uuid$q$, t.get('e1'))) = 'anonymous');
select t.check('rules: guests can never vote in an election', t.code(lv_api.lv_campaign_set_participation(t.id('e1'), 'members_and_guests')) <> 'ok'
  and t.q(format($q$select audience from lv.campaigns where id = %L::uuid$q$, t.get('e1'))) = 'members');

-- races
select t.put('k', (lv_api.lv_campaign_question_add(t.id('e1'), 1, 'single_choice', 'Homecoming King', '{"options":["Avery","Blake","Casey"]}'::jsonb) ->> 'question_id'));
select t.put('c', (lv_api.lv_campaign_question_add(t.id('e1'), 2, 'multi_choice', 'Court (choose 2)', '{"options":["Dana","Eli","Finn","Gray"]}'::jsonb) ->> 'question_id'));
select t.check('gate: a multi-seat race needs a number of seats',
  (lv_api.lv_campaign_activate(t.id('e1')) #> '{error,reasons}') ? 'election_race_invalid');
select lv_api.lv_campaign_question_update(t.id('c'), p_config => '{"options":["Dana","Eli","Finn","Gray"],"max":4}'::jsonb);
select t.check('gate: seats must be fewer than the candidates', (lv_api.lv_campaign_activate(t.id('e1')) #> '{error,reasons}') ? 'election_race_invalid');
select lv_api.lv_campaign_question_update(t.id('c'), p_config => '{"options":["Dana","Eli","Finn","Gray"],"max":2}'::jsonb);
select t.put('r', (lv_api.lv_campaign_question_add(t.id('e1'), 3, 'rating', 'Rate the dance') ->> 'question_id'));
select t.check('gate: a rating is not a race', (lv_api.lv_campaign_activate(t.id('e1')) #> '{error,reasons}') ? 'election_race_invalid');
select lv_api.lv_campaign_question_remove(t.id('r'));
select t.as_pg();
update lv.plan_limits set value = 'false' where family = 'starter' and key = 'modes.election';
select t.as_kpn(1);
select t.check('gate: without the plan feature the election cannot be published (fails closed)',
  (lv_api.lv_campaign_activate(t.id('e1')) #> '{error,reasons}') ? 'election_unavailable');
select t.check('create: and no new election can be created',
  t.code(lv_api.lv_campaign_create(t.id('hub'), 'No plan', 'election', 'anonymous')) = 'lv_entitlement_required');
select t.as_pg();
update lv.plan_limits set value = 'true' where family = 'starter' and key = 'modes.election';
select t.as_kpn(1);
select t.check('publish: a valid election publishes', t.code(lv_api.lv_campaign_activate(t.id('e1'))) = 'ok');

-- ===== member votes ======================================================================================
select t.as_kpn(2);
select t.check('vote: a candidate who is not on the ballot is refused', t.code(t.vote(t.id('e1'), t.ans(t.id('k'), '"Zed"'))) = 'lv_invalid_input');
select t.check('vote: more than the seats is refused', t.code(t.vote(t.id('e1'), t.ans(t.id('c'), '["Dana","Eli","Finn"]'))) = 'lv_invalid_input');
select t.check('vote: the same candidate twice is refused', t.code(t.vote(t.id('e1'), t.ans(t.id('c'), '["Dana","Dana"]'))) = 'lv_invalid_input');
select t.check('vote: a single-seat race takes one name, not a list', t.code(t.vote(t.id('e1'), t.ans(t.id('k'), '["Avery"]'))) = 'lv_invalid_input');
select t.check('vote: an empty ballot is refused', t.code(t.vote(t.id('e1'), '[]'::jsonb)) = 'lv_invalid_input');
select t.check('vote: a voter may skip a race', t.code(t.vote(t.id('e1'), t.ans(t.id('k'), '"Avery"'))) = 'ok');
select t.check('vote: votes are final (a second ballot is the same participation)',
  (t.vote(t.id('e1'), t.ans(t.id('k'), '"Blake"', t.id('c'), '["Dana","Eli"]')) ->> 'duplicate') = 'true'
  and t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid$q$, t.get('e1'))) = '1');
select t.as_kpn(3);
select t.check('vote: a full ballot', t.code(t.vote(t.id('e1'), t.ans(t.id('k'), '"Blake"', t.id('c'), '["Dana","Gray"]'))) = 'ok');
select t.check('secret: the election stores no account on its submissions',
  t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid and account_id is not null$q$, t.get('e1'))) = '0');
select t.as_kpn(1);
select t.check('one list: codes cannot be issued once members have voted',
  t.code(lv_api.lv_election_ballot_codes_create(t.id('e1'), 5)) = 'lv_not_available');
select t.check('codes: only elections use ballot codes', t.code(lv_api.lv_election_ballot_codes_create(t.id('ip'), 5)) = 'lv_invalid_input');

-- ===== ballot codes (voters without accounts) ===========================================================
select t.put('e2', (lv_api.lv_campaign_create(t.id('hub'), 'Class president', 'election', 'anonymous') ->> 'campaign_id'));
select t.put('p', (lv_api.lv_campaign_question_add(t.id('e2'), 1, 'single_choice', 'President', '{"options":["Hana","Ira"]}'::jsonb) ->> 'question_id'));
select t.check('codes: 0 and 501 are refused', t.code(lv_api.lv_election_ballot_codes_create(t.id('e2'), 0)) = 'lv_invalid_input'
  and t.code(lv_api.lv_election_ballot_codes_create(t.id('e2'), 501)) = 'lv_invalid_input');
select t.put('codes', (lv_api.lv_election_ballot_codes_create(t.id('e2'), 7) -> 'codes')::text);
select t.check('codes: seven codes, shown once, in the ABCDE-FGHJK form',
  jsonb_array_length(t.get('codes')::jsonb) = 7
  and not exists (select 1 from jsonb_array_elements_text(t.get('codes')::jsonb) x where x !~ '^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$'));
select t.check('codes: stored only as hashes', t.q(format($q$select count(*)::text from lv.ballot_codes b
  where b.campaign_id = %L::uuid and b.code_hash = any(array(select jsonb_array_elements_text(%L::jsonb)))$q$, t.get('e2'), t.get('codes'))) = '0');
select t.check('status: seven issued; turnout hidden while it runs',
  (lv_api.lv_election_ballot_status(t.id('e2')) ->> 'issued') = '7' and (lv_api.lv_election_ballot_status(t.id('e2')) ->> 'used') is null);
select t.as_kpn(4);
select t.check('codes: a member cannot read the codes status', t.code(lv_api.lv_election_ballot_status(t.id('e2'))) <> 'ok');
select t.check('codes: a member cannot issue codes', t.code(lv_api.lv_election_ballot_codes_create(t.id('e2'), 3)) <> 'ok');
select t.as_kpn(1);
select lv_api.lv_campaign_activate(t.id('e2'));
select t.put('join', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('e2'))));
select t.put('c1', t.get('codes')::jsonb ->> 0);
select t.as_kpn(5);
select t.check('one list: a member cannot vote in a ballot-code election', t.code(t.vote(t.id('e2'), t.ans(t.id('p'), '"Hana"'))) = 'lv_not_available');

select t.as_anon();
select t.check('ballot: a valid code votes without an account', t.code(lv_api.lv_ballot_submit(t.get('join'), t.get('c1'), t.ans(t.id('p'), '"Hana"'))) = 'ok');
select t.check('ballot: a code works once', t.code(lv_api.lv_ballot_submit(t.get('join'), t.get('c1'), t.ans(t.id('p'), '"Ira"'))) = 'lv_conflict');
select t.check('ballot: lowercase and no dash are accepted',
  t.code(lv_api.lv_ballot_submit(t.get('join'), lower(replace(t.get('codes')::jsonb ->> 1, '-', '')), t.ans(t.id('p'), '"Ira"'))) = 'ok');
select t.check('ballot: a made-up code is refused', t.code(lv_api.lv_ballot_submit(t.get('join'), 'AAAAA-AAAAA', t.ans(t.id('p'), '"Ira"'))) = 'lv_not_found');
select t.check('ballot: an invalid vote does not use up the code',
  t.code(lv_api.lv_ballot_submit(t.get('join'), t.get('codes')::jsonb ->> 2, t.ans(t.id('p'), '"Zed"'))) = 'lv_invalid_input'
  and t.code(lv_api.lv_ballot_submit(t.get('join'), t.get('codes')::jsonb ->> 2, t.ans(t.id('p'), '"Hana"'))) = 'ok');
select t.code(lv_api.lv_ballot_submit(t.get('join'), t.get('codes')::jsonb ->> i, t.ans(t.id('p'), '"Hana"'))) from generate_series(3, 4) i;
select t.check('ballot: five votes recorded with no account',
  t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid and account_id is null$q$, t.get('e2'))) = '5');
select t.check('ballot: a code for another Campaign''s join code is refused',
  t.code(lv_api.lv_ballot_submit(t.q(format($q$select coalesce(join_code, 'NOPE00') from lv.campaigns where id = %L::uuid$q$, t.get('e1'))),
                                 t.get('codes')::jsonb ->> 5, t.ans(t.id('p'), '"Hana"'))) = 'lv_not_found');

-- results after the end
select t.as_kpn(1);
select lv_api.lv_campaign_close(t.id('e2'));
select t.check('status: turnout appears after the end', (lv_api.lv_election_ballot_status(t.id('e2')) ->> 'used') = '5');
select t.check('results: ballot voters are counted in the released population',
  (lv_api.lv_analytics_query(t.id('e2'), 'participant_count') ->> 'guest_n') = '5');
select t.check('results: the race distribution is released after the end',
  (lv_api.lv_analytics_query(t.id('e2'), 'answer_distribution', t.id('p')) ->> 'ok') = 'true');
select t.check('codes: none can be issued after the end', t.code(lv_api.lv_election_ballot_codes_create(t.id('e2'), 1)) = 'lv_lifecycle_invalid');
select t.as_anon();
select t.check('ballot: a closed election takes no votes', t.code(lv_api.lv_ballot_submit(t.get('join'), t.get('codes')::jsonb ->> 6, t.ans(t.id('p'), '"Ira"'))) <> 'ok');

-- grants
select t.as_pg();
select t.check('grants: anon may submit a ballot but not issue codes or read status',
  has_function_privilege('anon', 'lv_api.lv_ballot_submit(text, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'lv_api.lv_election_ballot_codes_create(uuid, int)', 'execute')
  and not has_function_privilege('anon', 'lv_api.lv_election_ballot_status(uuid)', 'execute'));
select t.check('grants: nobody outside the database reads ballot hashes',
  not has_table_privilege('authenticated', 'lv.ballot_codes', 'select') and not has_table_privilege('anon', 'lv.ballot_codes', 'select'));
rollback;
