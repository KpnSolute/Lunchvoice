-- 39: election night (000038): parties, voter groups and lv_election_results under the strict engine.
select set_config('t.file', '39_election_results', false);
begin;
select t.trust_test_issuer();
create function t.ballot(p_join text, p_code text, p_pairs jsonb) returns text language sql as $$
  select t.code(lv_api.lv_ballot_submit(p_join, p_code, p_pairs)) $$;
grant execute on function t.ballot(text, text, jsonb) to public;

select t.as_kpn(1, null, true, 'Organiser'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
select t.grant_credit(t.id('owner'), 'starter');
select t.check('setup: the minimum cohort is 5', (lv.analytics_policy_state()->>'min_cohort') = '5');
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('night-hub', 'Night Hub') ->> 'hub_id'));
select t.put('inv', (lv_api.lv_invite_create(t.id('hub')) ->> 'code'));
select t.as_kpn(2) || lv_api.lv_my_context()::text || lv_api.lv_invite_redeem(t.get('inv'))::text;
select t.as_kpn(1);

-- ===== parties ===========================================================================================
select t.put('e', (lv_api.lv_campaign_create(t.id('hub'), 'Student council', 'election', 'anonymous') ->> 'campaign_id'));
select t.put('pres', (lv_api.lv_campaign_question_add(t.id('e'), 1, 'single_choice', 'President',
  '{"options":["Hana","Ira","Jo"],"parties":{"Hana":"Blue Team","Ira":"Red Team"}}'::jsonb) ->> 'question_id'));
select t.put('cncl', (lv_api.lv_campaign_question_add(t.id('e'), 2, 'multi_choice', 'Council',
  '{"options":["Kai","Lee","Max","Ned"],"max":2,"parties":{"Kai":"Blue Team","Lee":"Red Team","Max":"Blue Team","Ned":"Red Team"}}'::jsonb) ->> 'question_id'));
select t.check('parties: listed in order of first appearance', t.q(format($q$select lv.election_parties(%L::uuid)::text$q$, t.get('e'))) = '{"Blue Team","Red Team"}');
select lv_api.lv_campaign_question_update(t.id('pres'), p_config => '{"options":["Hana","Ira","Jo"],"parties":{"Zed":"Blue Team"}}'::jsonb);
select t.check('parties: a party for someone who is not a candidate blocks publishing',
  (lv_api.lv_campaign_activate(t.id('e')) #> '{error,reasons}') ? 'election_race_invalid');
select lv_api.lv_campaign_question_update(t.id('pres'), p_config => '{"options":["Hana","Ira","Jo"],"parties":{"Hana":"A","Ira":"B","Jo":"C"}}'::jsonb);
select lv_api.lv_campaign_question_update(t.id('cncl'), p_config => '{"options":["Kai","Lee","Max","Ned"],"max":2,"parties":{"Kai":"D","Lee":"E","Max":"F","Ned":"G"}}'::jsonb);
select t.put('extra', (lv_api.lv_campaign_question_add(t.id('e'), 3, 'single_choice', 'Mascot',
  '{"options":["Owl","Fox"],"parties":{"Owl":"H","Fox":"I"}}'::jsonb) ->> 'question_id'));
select t.check('parties: at most 8 per election', (lv_api.lv_campaign_activate(t.id('e')) #> '{error,reasons}') ? 'election_too_many_parties');
select lv_api.lv_campaign_question_remove(t.id('extra'));
select lv_api.lv_campaign_question_update(t.id('pres'), p_config => '{"options":["Hana","Ira","Jo"],"parties":{"Hana":"Blue Team","Ira":"Red Team"}}'::jsonb);
select lv_api.lv_campaign_question_update(t.id('cncl'), p_config => '{"options":["Kai","Lee","Max","Ned"],"max":2,"parties":{"Kai":"Blue Team","Lee":"Red Team","Max":"Blue Team","Ned":"Red Team"}}'::jsonb);

-- ===== voter groups ======================================================================================
select t.put('g9', (lv_api.lv_election_ballot_codes_create(t.id('e'), 10, '  Grade   9 ') -> 'codes')::text);
select t.put('g10', (lv_api.lv_election_ballot_codes_create(t.id('e'), 17, 'Grade 10') -> 'codes')::text);
select t.put('st', (lv_api.lv_election_ballot_codes_create(t.id('e'), 2, 'Staff') -> 'codes')::text);
select t.check('groups: issued per group, names cleaned',
  (lv_api.lv_election_ballot_status(t.id('e')) -> 'groups') = '[{"label":"Grade 10","issued":17},{"label":"Grade 9","issued":10},{"label":"Staff","issued":2}]'::jsonb);
select t.check('groups: a group name over 40 characters is refused', t.code(lv_api.lv_election_ballot_codes_create(t.id('e'), 1, repeat('x', 41))) = 'lv_invalid_input');
select t.check('publish', t.code(lv_api.lv_campaign_activate(t.id('e'))) = 'ok');
select t.put('join', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('e'))));

select t.as_anon();
-- Grade 9 (10): President Hana 5, Ira 5; Council Kai+Lee.
select t.ballot(t.get('join'), t.get('g9')::jsonb ->> i, jsonb_build_array(
  jsonb_build_object('question_id', t.get('pres'), 'value', case when i < 5 then 'Hana' else 'Ira' end),
  jsonb_build_object('question_id', t.get('cncl'), 'value', '["Kai","Lee"]'::jsonb))) from generate_series(0, 9) i;
-- Grade 10 (11 of 17): President Hana 5, Ira 6; Council Kai+Max (unanimous inside the group).
select t.ballot(t.get('join'), t.get('g10')::jsonb ->> i, jsonb_build_array(
  jsonb_build_object('question_id', t.get('pres'), 'value', case when i < 5 then 'Hana' else 'Ira' end),
  jsonb_build_object('question_id', t.get('cncl'), 'value', '["Kai","Max"]'::jsonb))) from generate_series(0, 10) i;
-- Staff (2): President Hana; Council Kai+Ned.
select t.ballot(t.get('join'), t.get('st')::jsonb ->> i, jsonb_build_array(
  jsonb_build_object('question_id', t.get('pres'), 'value', 'Hana'),
  jsonb_build_object('question_id', t.get('cncl'), 'value', '["Kai","Ned"]'::jsonb))) from generate_series(0, 1) i;
select t.check('votes: 23 recorded, each with only its group',
  t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid and account_id is null and ballot_group in ('Grade 9', 'Grade 10', 'Staff')$q$, t.get('e'))) = '23');

-- ===== before the end: nothing ===========================================================================
select t.as_kpn(1);
select t.check('release: no election results while voting is open', t.code(lv_api.lv_election_results(t.id('e'))) = 'lv_policy_undecided');
select lv_api.lv_campaign_close(t.id('e'));
select t.as_kpn(2);
select t.check('access: a member without analytics.read cannot read results', t.code(lv_api.lv_election_results(t.id('e'))) = 'lv_forbidden');
select t.as_kpn(1);
select t.put('r', lv_api.lv_election_results(t.id('e'))::text);
select t.check('results: ok after the end', t.code(t.get('r')::jsonb) = 'ok');

-- ===== turnout and groups ================================================================================
select t.check('turnout: 23 voters of 29 codes (79.3%)',
  (t.get('r')::jsonb #>> '{turnout,voters}') = '23' and (t.get('r')::jsonb #>> '{turnout,issued}') = '29' and (t.get('r')::jsonb #>> '{turnout,turnout_pct}') = '79.3');
select t.check('groups: Grade 10 is shown with its turnout (11 of 17)',
  exists (select 1 from jsonb_array_elements(t.get('r')::jsonb -> 'groups') g
           where g->>'label' = 'Grade 10' and g->>'voted' = '11' and g->>'turnout_pct' = '64.7' and g->>'merged' = 'false'));
select t.check('groups: Staff (2 voters) is merged, and so is Grade 9, so the merged bucket is never fewer than 5',
  exists (select 1 from jsonb_array_elements(t.get('r')::jsonb -> 'groups') g where g->>'label' = 'Staff' and g->'voted' = 'null'::jsonb and g->>'merged' = 'true')
  and exists (select 1 from jsonb_array_elements(t.get('r')::jsonb -> 'groups') g where g->>'label' = 'Grade 9' and g->'voted' = 'null'::jsonb));

-- ===== races =============================================================================================
select t.put('p', (select r::text from jsonb_array_elements(t.get('r')::jsonb -> 'races') r where r->>'prompt' = 'President'));
select t.put('k', (select r::text from jsonb_array_elements(t.get('r')::jsonb -> 'races') r where r->>'prompt' = 'Council'));
select t.check('president: Hana wins 12 to 11, margin 4.3 points',
  (t.get('p')::jsonb -> 'winners') = '["Hana"]'::jsonb and (t.get('p')::jsonb ->> 'margin_pts') = '4.3' and (t.get('p')::jsonb ->> 'tie') = 'false');
select t.check('president: candidates keep their party; Jo (no votes) is independent',
  exists (select 1 from jsonb_array_elements(t.get('p')::jsonb -> 'candidates') x where x->>'name' = 'Hana' and x->>'party' = 'Blue Team' and x->>'votes' = '12')
  and exists (select 1 from jsonb_array_elements(t.get('p')::jsonb -> 'candidates') x where x->>'name' = 'Jo' and x->'party' = 'null'::jsonb));
select t.check('president: party shares (Blue 52.2, Red 47.8)',
  exists (select 1 from jsonb_array_elements(t.get('p')::jsonb -> 'parties') x where x->>'party' = 'Blue Team' and x->>'share' = '52.2'));
select t.check('president: how each group voted is published (Grade 10 and Other groups, every cell at least 5)',
  jsonb_array_length(t.get('p')::jsonb -> 'by_group') = 2
  and exists (select 1 from jsonb_array_elements(t.get('p')::jsonb -> 'by_group') g where g->>'label' = 'Grade 10' and g->>'voters' = '11')
  and exists (select 1 from jsonb_array_elements(t.get('p')::jsonb -> 'by_group') g where g->>'other' = 'true' and g->>'voters' = '12'));
select t.check('council: every voter chose Kai, so its counts are withheld (dominance)...',
  (t.get('k')::jsonb ->> 'withheld') = 'true' and (t.get('k')::jsonb -> 'votes') = 'null'::jsonb
  and not exists (select 1 from jsonb_array_elements(t.get('k')::jsonb -> 'candidates') x where x->'votes' <> 'null'::jsonb));
select t.check('council: ...but the winners are announced (Kai and Max, two seats)', (t.get('k')::jsonb -> 'winners') = '["Kai","Max"]'::jsonb);
select t.check('council: no margin, party split or group table that would reveal votes',
  (t.get('k')::jsonb -> 'margin_pts') = 'null'::jsonb and (t.get('k')::jsonb -> 'parties') = 'null'::jsonb
  and (t.get('k')::jsonb -> 'by_group') = 'null'::jsonb and (t.get('k')::jsonb ->> 'by_group_reason') = 'small_groups');
select t.check('scoreboard: Blue Team won all 3 seats', (t.get('r')::jsonb -> 'scoreboard') = '[{"party":"Blue Team","seats":3}]'::jsonb
  and (t.get('r')::jsonb ->> 'seats_total') = '3');

-- ===== a member election: no groups, a tie ===============================================================
select t.put('m', (lv_api.lv_campaign_create(t.id('hub'), 'Tiny vote', 'election', 'anonymous') ->> 'campaign_id'));
select t.put('mq', (lv_api.lv_campaign_question_add(t.id('m'), 1, 'single_choice', 'Captain', '{"options":["Uma","Vic"]}'::jsonb) ->> 'question_id'));
select lv_api.lv_campaign_activate(t.id('m'));
select t.code(lv_api.lv_submit_response(t.id('m'), jsonb_build_array(jsonb_build_object('question_id', t.get('mq'), 'value', 'Uma'))));
select t.as_kpn(2);
select t.code(lv_api.lv_submit_response(t.id('m'), jsonb_build_array(jsonb_build_object('question_id', t.get('mq'), 'value', 'Vic'))));
select t.as_kpn(1);
select lv_api.lv_campaign_close(t.id('m'));
select t.put('mr', lv_api.lv_election_results(t.id('m'))::text);
select t.check('small: two votes, no counts, no winner, no turnout number',
  (t.get('mr')::jsonb #> '{races,0,winners}') = 'null'::jsonb and (t.get('mr')::jsonb #> '{races,0,votes}') = 'null'::jsonb
  and (t.get('mr')::jsonb #> '{turnout,voters}') = 'null'::jsonb and (t.get('mr')::jsonb ->> 'voting') = 'members'
  and (t.get('mr')::jsonb #>> '{races,0,by_group_reason}') = 'no_groups');
select t.check('only elections', t.code(lv_api.lv_election_results(t.id('hub'))) <> 'ok');

select t.as_pg();
select t.check('grants: results are for signed-in callers only',
  not has_function_privilege('anon', 'lv_api.lv_election_results(uuid)', 'execute')
  and has_function_privilege('authenticated', 'lv_api.lv_election_results(uuid)', 'execute'));
rollback;
