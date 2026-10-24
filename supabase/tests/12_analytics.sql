-- 12: privacy-safe analytics: fail-closed policy (three separate values), finished-only and single-release for sensitive
-- results, suppression incl. complementary, member/guest separation, no zero for withheld data, restricted shapes,
-- permissions, audit log, and no path from aggregates back to people. ALL policy values here are SYNTHETIC.
select set_config('t.file', '12_analytics', false);
begin;

select lv_private.backfill_org_hub(t.org_a(), t.u(2));
select lv_private.backfill_org_hub(t.org_b(), t.u(11));
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (t.org_a(), 'team', 'synthetic'), (t.org_a(), 'starter', 'synthetic'), (t.org_b(), 'starter', 'synthetic');
update lv_private.policy set value = '["active"]'::jsonb where key = 'quota.consuming_states';
update lv_private.policy set value = '{"window_days": 30}'::jsonb where key = 'gate.measurement';
update lv_private.policy set value = '{"sources": ["v2","legacy_backfill","legacy_signup","legacy_repair"]}'::jsonb where key = 'gate.eligible_population';
update lv_private.policy set value = '{"min_other_active_surveys": 100}'::jsonb where key = 'gate.applies_to';
update lv_private.policy set value = '{"zero_members": "unmet"}'::jsonb where key = 'gate.bootstrap';
-- Analyst role (community.analytics.view) -> u3; u4 is a plain member.
insert into lv_private.roles (hub_id, name) values (t.org_a(), 'Analyst');
insert into lv_private.role_capabilities select r.id, 'community.analytics.view' from lv_private.roles r where r.name = 'Analyst';
insert into lv_private.role_assignments (hub_id, account_id, role_id) select t.org_a(), t.u(3), r.id from lv_private.roles r where r.name = 'Analyst';

-- ---- identified Campaigns need no privacy policy (before any analytics policy exists)
select t.put('I1', t.pubcamp('I1', t.org_a(), false)::text);
select t.fill('I1', t.org_a(), '{"A": 1, "B": 2}');
select t.as_user(t.u(3));
select t.check('identified, live, no analytics policy: allowed with exact small counts', public.lv_analytics_query(t.id('I1'), 'participation')->'data'->'participants'->'member'->>'n' = '3'
  and public.lv_analytics_query(t.id('I1'), 'participation')->'data'->'policy'->>'status' = 'not_required');
select t.check('identified distribution shows exact cells (n = 1 is not suppressed)', (select (g->>'n')::int from jsonb_array_elements(public.lv_analytics_query(t.id('I1'), 'answer_distribution', t.get('I1.q2')::uuid)->'data'->'groups') g where g->>'key' = 'A' and g->>'audience' = 'member') = 1);
select t.as_pg();
update lv_private.campaigns set guest_access = 'link' where id = t.id('I1');
select t.fill('I1', t.org_a(), '{}', 1);
select t.as_user(t.u(3));
select t.check('...but once guests have responded the Campaign needs the privacy policy', public.lv_analytics_query(t.id('I1'), 'participation')->'error'->'details'->>'reason' = 'policy_pending');
select t.as_pg();

-- ---- anonymous Campaigns: fail closed until all three values are decided
select t.put('N1', t.pubcamp('N1', t.org_a(), true)::text);
select t.fill('N1', t.org_a(), '{"A": 7, "B": 4, "C": 1}');
select t.finish('N1');
select t.as_user(t.u(3));
select t.check('no policy: unavailable, naming all three missing values',
  public.lv_analytics_query(t.id('N1'), 'participation')->'error'->'details'->'missing' = '["analytics.min_cohort","analytics.min_participants","analytics.disclosure_controls"]'::jsonb);
select t.check('...the code is lv_policy_undecided and the decision is named', public.lv_analytics_query(t.id('N1'), 'participation')->'error'->'details'->>'decision' = 'D-10'
  and t.code(public.lv_analytics_query(t.id('N1'), 'participation')) = 'lv_policy_undecided');
select t.as_pg();
select t.check('a refused request recorded no release', t.q('select count(*) from lv_private.analytics_releases') = '0');
update lv_private.policy set value = '"3"'::jsonb where key = 'analytics.min_cohort';
select t.as_user(t.u(3));
select t.check('a threshold given as text is not a decision', jsonb_array_length(public.lv_analytics_query(t.id('N1'), 'participation')->'error'->'details'->'missing') = 3);
select t.as_pg();
update lv_private.policy set value = '1'::jsonb where key = 'analytics.min_cohort';
select t.as_user(t.u(3));
select t.check('a threshold of 1 hides nothing and is rejected', jsonb_array_length(public.lv_analytics_query(t.id('N1'), 'participation')->'error'->'details'->'missing') = 3);
select t.as_pg();
update lv_private.policy set value = '3'::jsonb where key = 'analytics.min_cohort';
select t.as_user(t.u(3));
select t.check('approving ONLY the cell threshold is not enough (two values still missing)',
  public.lv_analytics_query(t.id('N1'), 'participation')->'error'->'details'->'missing' = '["analytics.min_participants","analytics.disclosure_controls"]'::jsonb);
select t.as_pg();
update lv_private.policy set value = '2'::jsonb where key = 'analytics.min_participants';
select t.as_user(t.u(3));
select t.check('a participant minimum below the cell threshold is rejected', public.lv_analytics_query(t.id('N1'), 'participation')->'error'->'details'->'missing' = '["analytics.min_participants","analytics.disclosure_controls"]'::jsonb);
select t.as_pg();
update lv_private.policy set value = '5'::jsonb where key = 'analytics.min_participants';
update lv_private.policy set value = '{"complementary_suppression": "yes"}'::jsonb where key = 'analytics.disclosure_controls';
select t.as_user(t.u(3));
select t.check('disclosure controls must be explicit booleans', public.lv_analytics_query(t.id('N1'), 'participation')->'error'->'details'->'missing' = '["analytics.disclosure_controls"]'::jsonb);
select t.as_pg();
update lv_private.policy set value = '{"complementary_suppression": true}'::jsonb where key = 'analytics.disclosure_controls';

-- ---- lifecycle restrictions on sensitive results
select t.put('N2', t.pubcamp('N2', t.org_a(), true)::text);
select t.fill('N2', t.org_a(), '{"A": 8}');
select t.as_user(t.u(3));
select t.check('anonymous results are not served while the Campaign is live', public.lv_analytics_query(t.id('N2'), 'participation')->'error'->'details'->>'reason' = 'live_anonymous_results_restricted');
select t.as_pg();
select t.put('D1', t.pubcamp('D1', t.org_a(), true, false)::text);
select t.as_user(t.u(3));
select t.check('a draft has no results (lv_lifecycle_invalid)', t.code(public.lv_analytics_query(t.id('D1'), 'participation')) = 'lv_lifecycle_invalid');

-- ---- results with the illustrative policy (cohort 3, minimum 5, complementary on)
select t.check('participation: exact member total, guests a real zero, no groups',
  public.lv_analytics_query(t.id('N1'), 'participation')->'data'->'participants' = '{"member":{"n":12,"suppressed":false,"reason":null},"guest":{"n":0,"suppressed":false,"reason":null}}'::jsonb
  and public.lv_analytics_query(t.id('N1'), 'participation')->'data'->'groups' = '[]'::jsonb);
select t.check('policy block reports what was applied', public.lv_analytics_query(t.id('N1'), 'participation')->'data'->'policy' = '{"status":"applied","min_cohort":3,"complementary_suppression":true}'::jsonb);
select t.put('r', public.lv_analytics_query(t.id('N1'), 'answer_distribution', t.get('N1.q2')::uuid)::text);
select t.check('distribution A=7 B=4 C=1: A shown', (select (g->>'n')::int from jsonb_array_elements((t.get('r')::jsonb)->'data'->'groups') g where g->>'key' = 'A') = 7);
select t.check('...C (n=1) is suppressed by size', (select g->>'reason' from jsonb_array_elements((t.get('r')::jsonb)->'data'->'groups') g where g->>'key' = 'C') = 'below_min_cohort');
select t.check('...B is withheld too (complementary) so C cannot be derived from the total', (select g->>'reason' from jsonb_array_elements((t.get('r')::jsonb)->'data'->'groups') g where g->>'key' = 'B') = 'complementary');
select t.check('suppressed cells are null (never 0) with no value', not exists (select 1 from jsonb_array_elements((t.get('r')::jsonb)->'data'->'groups') g where (g->>'suppressed')::boolean and (g->'n' <> 'null'::jsonb or g->'value' <> 'null'::jsonb)));
select t.check('shown cell value is the share of members, 4 decimals', (select (g->>'value')::numeric from jsonb_array_elements((t.get('r')::jsonb)->'data'->'groups') g where g->>'key' = 'A') = 0.5833);
select t.check('every group carries the audience and only the documented keys', not exists (select 1 from jsonb_array_elements((t.get('r')::jsonb)->'data'->'groups') g where (select array_agg(k order by k) from jsonb_object_keys(g) k) <> array['audience','key','n','reason','suppressed','value']));
select t.check('completion: answered counts per question (a required question is answered by all 12)', (select (g->>'n')::int from jsonb_array_elements(public.lv_analytics_query(t.id('N1'), 'completion')->'data'->'groups') g where g->>'key' = t.get('N1.q1')) = 12);

-- complementary suppression off, two small cells, true zeros
select t.as_pg();
update lv_private.policy set value = '{"complementary_suppression": false}'::jsonb where key = 'analytics.disclosure_controls';
select t.put('N3', t.pubcamp('N3', t.org_a(), true)::text);
select t.fill('N3', t.org_a(), '{"A": 7, "B": 4, "C": 1}');
select t.finish('N3');
select t.as_user(t.u(3));
select t.check('with complementary suppression OFF only the small cell is withheld (B is shown)',
  (select count(*) from jsonb_array_elements(public.lv_analytics_query(t.id('N3'), 'answer_distribution', t.get('N3.q2')::uuid)->'data'->'groups') g where (g->>'suppressed')::boolean) = 1);
select t.as_pg();
update lv_private.policy set value = '{"complementary_suppression": true}'::jsonb where key = 'analytics.disclosure_controls';
select t.put('N4', t.pubcamp('N4', t.org_a(), true)::text);
select t.fill('N4', t.org_a(), '{"A": 9, "B": 2, "C": 1}');
select t.finish('N4');
select t.put('N5', t.pubcamp('N5', t.org_a(), true)::text);
select t.fill('N5', t.org_a(), '{"A": 12}');
select t.finish('N5');
select t.as_user(t.u(3));
select t.check('two cells already suppressed by size: no extra withholding, A shown', (select count(*) from jsonb_array_elements(public.lv_analytics_query(t.id('N4'), 'answer_distribution', t.get('N4.q2')::uuid)->'data'->'groups') g where (g->>'suppressed')::boolean) = 2
  and (select (g->>'n')::int from jsonb_array_elements(public.lv_analytics_query(t.id('N4'), 'answer_distribution', t.get('N4.q2')::uuid)->'data'->'groups') g where g->>'key' = 'A') = 9);
select t.check('real zeros are shown as 0 and are not suppressed', (select count(*) from jsonb_array_elements(public.lv_analytics_query(t.id('N5'), 'answer_distribution', t.get('N5.q2')::uuid)->'data'->'groups') g where (g->>'n')::int = 0 and not (g->>'suppressed')::boolean) = 2);
select t.check('rating distribution covers the whole scale', jsonb_array_length(public.lv_analytics_query(t.id('N5'), 'answer_distribution', t.get('N5.q1')::uuid)->'data'->'groups') = 5);

-- ---- too few participants: the total itself is withheld, as null, not 0
select t.as_pg();
select t.put('N6', t.pubcamp('N6', t.org_a(), true)::text);
select t.fill('N6', t.org_a(), '{"A": 3, "B": 1}');
select t.finish('N6');
select t.as_user(t.u(3));
select t.check('4 participants (< 5): the member total is withheld with a reason', public.lv_analytics_query(t.id('N6'), 'participation')->'data'->'participants'->'member' = '{"n":null,"suppressed":true,"reason":"below_min_participants"}'::jsonb);
select t.check('...every cell is withheld, none shown as 0', (select bool_and((g->>'suppressed')::boolean and g->'n' = 'null'::jsonb) from jsonb_array_elements(public.lv_analytics_query(t.id('N6'), 'answer_distribution', t.get('N6.q2')::uuid)->'data'->'groups') g));

-- ---- members and guests are separate populations
select t.as_pg();
select t.put('G1', t.pubcamp('G1', t.org_a(), true)::text);
update lv_private.campaigns set guest_access = 'link' where id = t.id('G1');
select t.fill('G1', t.org_a(), '{"A": 6, "B": 6}', 2);
select t.put('G2', t.pubcamp('G2', t.org_a(), true)::text);
update lv_private.campaigns set guest_access = 'link' where id = t.id('G2');
select t.fill('G2', t.org_a(), '{"A": 6, "B": 6}', 7);
select t.finish('G1');
select t.finish('G2');
select t.as_user(t.u(3));
select t.check('2 guests (< minimum): guest total withheld, members exact, never combined',
  public.lv_analytics_query(t.id('G1'), 'participation')->'data'->'participants' = '{"member":{"n":12,"suppressed":false,"reason":null},"guest":{"n":null,"suppressed":true,"reason":"below_min_participants"}}'::jsonb);
select t.check('7 guests (>= minimum): shown separately from 12 members', public.lv_analytics_query(t.id('G2'), 'participation')->'data'->'participants' = '{"member":{"n":12,"suppressed":false,"reason":null},"guest":{"n":7,"suppressed":false,"reason":null}}'::jsonb);
select t.check('distribution rows are split by audience, with no combined row', (select count(distinct g->>'audience') from jsonb_array_elements(public.lv_analytics_query(t.id('G2'), 'answer_distribution', t.get('G2.q2')::uuid)->'data'->'groups') g) = 2
  and (select count(*) from jsonb_array_elements(public.lv_analytics_query(t.id('G2'), 'answer_distribution', t.get('G2.q2')::uuid)->'data'->'groups') g where g->>'audience' not in ('member', 'guest')) = 0);
select t.check('guest cells honour the cohort threshold on their own (guest B=0 shown as a real zero, A=7 shown)', (select (g->>'n')::int from jsonb_array_elements(public.lv_analytics_query(t.id('G2'), 'answer_distribution', t.get('G2.q2')::uuid)->'data'->'groups') g where g->>'audience' = 'guest' and g->>'key' = 'A') = 7);

-- ---- single release: the population is frozen at first release
select t.as_user(t.u(3));
select t.put('first', public.lv_analytics_query(t.id('N1'), 'participation')::text);
select t.check('repeated queries return identical figures', (select (t.get('first')::jsonb)->'data'->'participants') = public.lv_analytics_query(t.id('N1'), 'participation')->'data'->'participants');
select t.as_pg();
select t.check('the first release recorded the population once', t.q(format('select member_n::text || guest_n::text from lv_private.analytics_releases where campaign_id = %L', t.id('N1'))) = '120');
-- reopen N1, one more person answers, close again: the two releases could be differenced -> unavailable
update lv_private.campaigns set state = 'active', closed_at = null where id = t.id('N1');
select t.fill('N1', t.org_a(), '{"C": 1}');
select t.finish('N1');
select t.as_user(t.u(3));
select t.check('after a later response the earlier-released results are unavailable (no differencing)', public.lv_analytics_query(t.id('N1'), 'participation')->'error'->'details'->>'reason' = 'population_changed_after_release');
select t.check('...for every metric', public.lv_analytics_query(t.id('N1'), 'completion')->'error'->'details'->>'reason' = 'population_changed_after_release');
select t.check('other Campaigns are unaffected', t.code(public.lv_analytics_query(t.id('N3'), 'participation')) = 'ok');

-- ---- restricted query shapes
select t.check('unknown metric is invalid_input', t.code(public.lv_analytics_query(t.id('N3'), 'by_hour')) = 'lv_invalid_input');
select t.check('answer_distribution needs a question', t.code(public.lv_analytics_query(t.id('N3'), 'answer_distribution')) = 'lv_invalid_input');
select t.check('participation takes no question', t.code(public.lv_analytics_query(t.id('N3'), 'participation', t.get('N3.q1')::uuid)) = 'lv_invalid_input');
select t.check('a question of another Campaign is refused', public.lv_analytics_query(t.id('N3'), 'answer_distribution', t.get('N4.q2')::uuid)->'error'->'details'->>'reason' = 'unknown_question');
select t.check('free-text results are not available', public.lv_analytics_query(t.id('N3'), 'answer_distribution', t.get('N3.q5')::uuid)->'error'->'details'->>'reason' = 'question_type_not_available');
select t.check('ranking results are not available', public.lv_analytics_query(t.id('N3'), 'answer_distribution', t.get('N3.q6')::uuid)->'error'->'details'->>'type' = 'ranking');
select t.as_pg();
select t.check('the function accepts exactly three arguments: no filter, slice or comparison parameter exists',
  (select string_agg(a, ',' order by a) from (select unnest(p.proargnames) a from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'lv_analytics_query') x) = 'campaign_id,metric,question_id');

-- ---- permissions and audit
select t.as_user(t.u(4));
select t.check('a plain member cannot read analytics', t.code(public.lv_analytics_query(t.id('N3'), 'participation')) = 'lv_forbidden');
select t.as_user(t.u(11));
select t.check('another Hub''s Owner cannot', t.code(public.lv_analytics_query(t.id('N3'), 'participation')) = 'lv_forbidden');
select t.as_user(t.u(2));
select t.check('the Owner holds the capability', t.code(public.lv_analytics_query(t.id('N3'), 'participation')) = 'ok');
select t.as_anon();
select t.check('anon: unauthenticated', t.code(public.lv_analytics_query(t.id('N3'), 'participation')) = 'lv_unauthenticated');
select t.as_user(t.u(3));
select t.check('unknown Campaign: not_found', t.code(public.lv_analytics_query(gen_random_uuid(), 'participation')) = 'lv_not_found');
select t.as_pg();
select t.check('every request, including refusals, was logged', t.q('select count(*) from lv_private.analytics_query_log')::int > 20
  and t.q($$select count(*) from lv_private.analytics_query_log where outcome = 'lv_forbidden'$$) = '2'
  and t.q($$select count(*) from lv_private.analytics_query_log where outcome = 'lv_policy_undecided'$$) <> '0');

-- ---- nothing in a result points back to a person; nothing else reads answers
select t.as_user(t.u(3));
select t.put('big', public.lv_analytics_query(t.id('N3'), 'answer_distribution', t.get('N3.q2')::uuid)::text);
select t.put('big2', public.lv_analytics_query(t.id('G2'), 'participation')::text);
select t.as_pg();
select t.check('no account, auth or receipt id from the Campaign appears in any result',
  not exists (select 1 from lv_private.accounts a where position(a.id::text in t.get('big') || t.get('big2')) > 0)
  and not exists (select 1 from lv_private.campaign_participation p where position(p.receipt_id::text in t.get('big') || t.get('big2')) > 0));
select t.check('results contain only the documented top-level keys', (select array_agg(k order by k) from jsonb_object_keys((t.get('big')::jsonb)) k) is not null
  and (select array_agg(k order by k) from jsonb_object_keys(((t.get('big')::jsonb)->'data')) k) = array['campaign_id','freshness_at','groups','metric','participants','policy','population','question_id','window']);
select t.check('no public function reads the answer tables (the core lives in lv_private)', (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and (p.prosrc ilike '%campaign_answers%' or p.prosrc ilike '%campaign_answer_values%')) = 0);
select t.check('no export or embed function exists', not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname ilike '%export%' or p.proname ilike '%embed%')));
select t.as_user(t.u(2));
select t.check('Owner cannot read releases', t.raises('select * from lv_private.analytics_releases', '42501'));
select t.check('Owner cannot read the query log', t.raises('select * from lv_private.analytics_query_log', '42501'));
select t.check('Owner cannot call the analytics core', t.raises($$select lv_private.analytics_core(gen_random_uuid(), t.u(2), 'participation', null)$$, '42501'));
select t.check('Owner cannot call the suppression helper', t.raises($$select lv_private.suppress_cells('[]'::jsonb, 3, true, true)$$, '42501'));

rollback;
