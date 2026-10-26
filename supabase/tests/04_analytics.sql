-- 04: privacy-safe analytics -- suppression, complementary disclosure, fail-closed policy, release freezing.
select set_config('t.file', '04_analytics', false);
begin;

-- ---------------------------------------------------------------------------------------------------------
-- The suppression engine in isolation (pure function, no data needed)
-- ---------------------------------------------------------------------------------------------------------
select t.check('a cell below the minimum cohort is NULL, never 0',
  (lv.suppress_cells('[{"key":"a","n":2}]'::jsonb, 5, false)->0->>'n') is null);
select t.check('...and is marked suppressed with a reason',
  (lv.suppress_cells('[{"key":"a","n":2}]'::jsonb, 5, false)->0->>'suppressed') = 'true');
select t.check('a cell at or above the minimum is published',
  (lv.suppress_cells('[{"key":"a","n":5}]'::jsonb, 5, false)->0->>'n') = '5');
select t.check('an empty cell (n=0) is not suppressed, it is simply empty',
  (lv.suppress_cells('[{"key":"a","n":0}]'::jsonb, 5, false)->0->>'n') = '0');

-- Complementary disclosure: if exactly one cell is suppressed, a second must be suppressed too.
select t.check('with one small cell, a second cell is suppressed as well (complementary)',
  (select count(*) from jsonb_array_elements(
     lv.suppress_cells('[{"key":"a","n":1},{"key":"b","n":9},{"key":"c","n":20}]'::jsonb, 5, true)) e
    where (e->>'suppressed')::boolean) = 2);
select t.check('with two small cells already suppressed, no extra cell is hidden',
  (select count(*) from jsonb_array_elements(
     lv.suppress_cells('[{"key":"a","n":1},{"key":"b","n":2},{"key":"c","n":20}]'::jsonb, 5, true)) e
    where (e->>'suppressed')::boolean) = 2);
select t.check('complementary suppression is off when the policy says so',
  (select count(*) from jsonb_array_elements(
     lv.suppress_cells('[{"key":"a","n":1},{"key":"b","n":9},{"key":"c","n":20}]'::jsonb, 5, false)) e
    where (e->>'suppressed')::boolean) = 1);

-- ---------------------------------------------------------------------------------------------------------
-- Build a Hub with an active anonymous Campaign
-- ---------------------------------------------------------------------------------------------------------
select t.trust_test_issuer();
select t.as_kpn(10, 'owner@example.invalid', true, 'Owner');
select lv_api.lv_my_context();
select t.put('acc', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
insert into lv.beta_applications (account_id, status) values (t.id('acc'), 'approved');
update lv.policy set value = '5'::jsonb where key = 'campaign.max_active_per_hub';
select t.as_kpn(10);
select t.check('analytics Hub created', t.code(lv_api.lv_hub_create('analytics-hub', 'Analytics Hub')) = 'ok');
select t.put('hub', t.q($$select id::text from lv.hubs where slug = 'analytics-hub'$$));

select lv_api.lv_campaign_create(t.id('hub'), 'Anon', 'survey', 'anonymous');
select t.put('c', t.q($$select id::text from lv.campaigns where title = 'Anon'$$));
select lv_api.lv_campaign_question_add(t.id('c'), 1, 'rating', 'Rate lunch');
select t.put('q', t.q($$select id::text from lv.campaign_questions where campaign_id = '$$ || t.get('c') || $$'::uuid$$));
select t.check('analytics Campaign activated', t.code(lv_api.lv_campaign_activate(t.id('c'))) = 'ok');

-- ---------------------------------------------------------------------------------------------------------
-- Fail closed: no minimum cohort policy means NO results
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(10);
select t.check('with no min-cohort policy set, anonymous results are refused entirely',
  t.code(lv_api.lv_analytics_query(t.id('c'), 'participant_count')) = 'lv_policy_undecided');

-- ---------------------------------------------------------------------------------------------------------
-- Live anonymous Campaign: results are withheld even when the policy exists
-- ---------------------------------------------------------------------------------------------------------
select t.as_pg();
insert into lv.policy (key, value, note) values ('campaign.min_cohort', '3'::jsonb, 'test')
on conflict (key) do update set value = '3'::jsonb;

select t.as_kpn(10);
select t.check('a LIVE anonymous Campaign does not publish results, even above the threshold',
  t.code(lv_api.lv_analytics_query(t.id('c'), 'participant_count')) = 'lv_policy_undecided');

-- ---------------------------------------------------------------------------------------------------------
-- Populate the Campaign with 5 members, then close it
-- ---------------------------------------------------------------------------------------------------------
select t.as_pg();
insert into lv.hub_memberships (hub_id, account_id, status, accepted_at)
select t.id('hub'), gen_random_uuid(), 'accepted', now() from generate_series(1, 0);  -- no-op, keeps shape explicit

do $$
declare
  i int;
  v_acc uuid;
  v_sub uuid;
begin
  for i in 1..5 loop
    insert into lv.accounts (display_name) values ('Member ' || i) returning id into v_acc;
    insert into lv.account_identities (account_id, identity_issuer, identity_subject, email, email_verified_at)
    values (v_acc, t.issuer(), t.sub(i + 100)::text, 'm' || i || '@example.invalid', now());
    insert into lv.hub_memberships (hub_id, account_id, status, accepted_at)
    values (t.id('hub'), v_acc, 'accepted', now());
    insert into lv.submissions (campaign_id, hub_id, campaign_revision) values (t.id('c'), t.id('hub'), 2)
      returning id into v_sub;
    insert into lv.answers (submission_id, question_id, value)
    values (v_sub, t.id('q'), to_jsonb(case when i <= 2 then 5 else 3 end)::jsonb);
    insert into lv.participation (campaign_id, hub_id, account_id, campaign_revision)
    values (t.id('c'), t.id('hub'), v_acc, 2);
  end loop;
end $$;

update lv.campaigns set status = 'closed', closed_at = now() where id = t.id('c');

select t.check('a closed anonymous Campaign above the threshold publishes the participant count',
  t.q(format($q$select (lv.analytics_core(%L::uuid, null, 'participant_count', null)->>'n')$q$, t.get('c'))) = '5');

-- ---------------------------------------------------------------------------------------------------------
-- Suppression on a real distribution: 2 of 5 chose 5, 3 chose 3, with min cohort 3
-- ---------------------------------------------------------------------------------------------------------
do $$
declare
  v_cells jsonb;
begin
  v_cells := lv.analytics_core(t.id('c'), null, 'answer_distribution', t.id('q')) -> 'cells';
  perform t.check('a distribution cell below the minimum cohort is withheld as NULL',
    exists (select 1 from jsonb_array_elements(v_cells) e where e->>'n' is null));
  perform t.check('no published cell ever leaks a count below the minimum',
    not exists (select 1 from jsonb_array_elements(v_cells) e
                where (e->>'suppressed')::boolean = false and (e->>'n')::bigint < 3));
  perform t.check('the analytics result never contains a submission or account identifier',
    v_cells::text not like '%account%' and v_cells::text not like '%submission%');
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Free text is never published
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(10);
select lv_api.lv_campaign_create(t.id('hub'), 'TextAnon', 'survey', 'anonymous');
select t.put('tc', t.q($$select id::text from lv.campaigns where title = 'TextAnon'$$));
select lv_api.lv_campaign_question_add(t.id('tc'), 1, 'text', 'Anything else?');
select t.put('tq', t.q($$select id::text from lv.campaign_questions where campaign_id = '$$ || t.get('tc') || $$'::uuid$$));
select lv_api.lv_campaign_activate(t.id('tc'));
select t.as_pg();
update lv.campaigns set status = 'closed', closed_at = now() where id = t.id('tc');
select t.as_kpn(10);
select t.check('free-text answers are not published, even with a policy set',
  t.code(lv_api.lv_analytics_query(t.id('tc'), 'answer_distribution', t.id('tq'))) = 'lv_policy_undecided');

-- ---------------------------------------------------------------------------------------------------------
-- Capability enforcement and no raw row access
-- ---------------------------------------------------------------------------------------------------------
select t.as_kpn(101);
select t.check('a non-admin member cannot read analytics',
  t.code(lv_api.lv_analytics_query(t.id('c'), 'participant_count')) = 'lv_forbidden');
select t.check('no caller can query the answers table directly',
  t.raises($$select * from lv.answers$$));
select t.check('no caller can query submissions directly',
  t.raises($$select * from lv.submissions$$));

-- ---------------------------------------------------------------------------------------------------------
-- Release freezing: a changed population withholds previously released results
-- ---------------------------------------------------------------------------------------------------------
select t.as_pg();
insert into lv.accounts (display_name) values ('Late Member');
insert into lv.participation (campaign_id, hub_id, account_id, campaign_revision)
select t.id('c'), t.id('hub'), id, 2 from lv.accounts where display_name = 'Late Member';
select t.as_kpn(10);
select t.check('after the population changes, previously released results are withheld',
  t.code(lv_api.lv_analytics_query(t.id('c'), 'participant_count')) = 'lv_policy_undecided');
select t.check('the release record froze the original participant count',
  t.q($$select participant_n::text from lv.analytics_releases where campaign_id = '$$ || t.get('c') || $$'::uuid$$) = '5');

-- ---------------------------------------------------------------------------------------------------------
-- Queries are logged (an audit trail of who looked at results)
-- ---------------------------------------------------------------------------------------------------------
select t.check('analytics queries are logged',
  t.q($$select (count(*) > 0)::text from lv.analytics_query_log where campaign_id = '$$ || t.get('c') || $$'::uuid$$) = 'true');

rollback;
