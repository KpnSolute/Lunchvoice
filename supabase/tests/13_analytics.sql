-- 13: ANALYTICS ACROSS THE LIFECYCLE AND FOR GUESTS (000013, roadmap slice 11).
select set_config('t.file', '13_analytics', false);
begin;

update lv.policy set value = '5'::jsonb where key = 'campaign.max_active_per_hub';
update lv.policy set value = '2'::jsonb where key = 'campaign.min_cohort';
update lv.policy set value = '50'::jsonb where key = 'participation.guest_rate_per_minute';
select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
insert into lv.beta_applications (account_id, status) values (t.id('owner'), 'approved');
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('results-hub', 'Results Hub')->>'hub_id'));
select t.put('invite', (lv_api.lv_invite_create(t.id('hub'))->>'code'));
-- Five more members (people 2..6).
select t.as_kpn(2); select lv_api.lv_invite_redeem(t.get('invite'));
select t.as_kpn(3); select lv_api.lv_invite_redeem(t.get('invite'));
select t.as_kpn(4); select lv_api.lv_invite_redeem(t.get('invite'));
select t.as_kpn(5); select lv_api.lv_invite_redeem(t.get('invite'));
select t.as_kpn(6); select lv_api.lv_invite_redeem(t.get('invite'));

-- Anonymous Campaign open to guests: rating, multi_choice, text.
select t.as_kpn(1);
select t.put('c', (lv_api.lv_campaign_create(t.id('hub'), 'Results', 'survey', 'anonymous')->>'campaign_id'));
select t.put('qr', (lv_api.lv_campaign_question_add(t.id('c'), 1, 'rating', 'Rate')->>'question_id'));
select t.put('qm', (lv_api.lv_campaign_question_add(t.id('c'), 2, 'multi_choice', 'Pick', '{"options":["x","y","z"]}'::jsonb)->>'question_id'));
select t.put('qt', (lv_api.lv_campaign_question_add(t.id('c'), 3, 'text', 'Say')->>'question_id'));
select lv_api.lv_campaign_set_participation(t.id('c'), 'members_and_guests');
select lv_api.lv_campaign_schedule(t.id('c'));
select t.as_pg();
select t.put('code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('c'))));

create function t.ans(p_rating int, p_pick text) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('question_id', t.get('qr'), 'value', p_rating),
    jsonb_build_object('question_id', t.get('qm'), 'value', p_pick::jsonb),
    jsonb_build_object('question_id', t.get('qt'), 'value', 'fine'))
$$;
grant execute on function t.ans(int, text) to public;

select t.as_kpn(2); select lv_api.lv_submit_response(t.id('c'), t.ans(5, '["x","y"]'));
select t.as_kpn(3); select lv_api.lv_submit_response(t.id('c'), t.ans(4, '["x"]'));
select t.as_kpn(4); select lv_api.lv_submit_response(t.id('c'), t.ans(4, '["x","z"]'));
select t.as_anon(); select lv_api.lv_guest_submit(t.get('code'), repeat('g', 40), t.ans(1, '["y"]'));

-- ===== live, paused and ended ============================================================================
select t.as_kpn(1);
select t.check('live: an open anonymous Campaign withholds results', t.code(lv_api.lv_analytics_overview(t.id('c'))) = 'lv_policy_undecided');
select lv_api.lv_campaign_pause(t.id('c'));
select t.check('paused: a paused anonymous Campaign still withholds results (it can resume)',
  t.code(lv_api.lv_analytics_query(t.id('c'), 'participant_count')) = 'lv_policy_undecided');
select t.as_pg();
update lv.campaigns set status = 'active', paused_at = null, closes_at = now() - interval '1 minute' where id = t.id('c');
select t.as_kpn(1);
select t.check('ended: an active Campaign past its close time counts as finished',
  t.code(lv_api.lv_analytics_query(t.id('c'), 'participant_count')) = 'ok');

-- ===== metrics ============================================================================================
select t.check('count: members and guests are counted apart',
  (lv_api.lv_analytics_query(t.id('c'), 'participant_count')->>'n') = '3');
select t.check('count: a single guest is below the cohort, so guest_n is withheld, not 0',
  (lv_api.lv_analytics_query(t.id('c'), 'participant_count')->>'guest_n') is null
  and (lv_api.lv_analytics_query(t.id('c'), 'participant_count')->>'guest_suppressed') = 'true');
select t.check('rate: participation rate is unique member participants over accepted members (guests excluded)',
  (lv_api.lv_analytics_query(t.id('c'), 'participation_rate')->>'n') = '3'
  and (lv_api.lv_analytics_query(t.id('c'), 'participation_rate')->>'eligible_n') = '6'
  and (lv_api.lv_analytics_query(t.id('c'), 'participation_rate')->>'rate') = '0.5000');
select t.check('distribution: multi_choice is counted per option',
  (select string_agg((e->>'key') || '=' || coalesce(e->>'n', 'null'), ',' order by e->>'key')
     from jsonb_array_elements(lv_api.lv_analytics_query(t.id('c'), 'answer_distribution', t.id('qm'))->'cells') e)
  = 'x=3,y=null,z=null');
select t.check('distribution: suppressed cells give a reason',
  (select count(*) from jsonb_array_elements(lv_api.lv_analytics_query(t.id('c'), 'answer_distribution', t.id('qm'))->'cells') e
    where (e->>'suppressed')::boolean and e->>'reason' in ('below_min_cohort', 'complementary')) = 2);
select t.check('rating: rating_summary publishes count and mean over members and guests',
  (lv_api.lv_analytics_query(t.id('c'), 'rating_summary', t.id('qr'))->>'n') = '4'
  and (lv_api.lv_analytics_query(t.id('c'), 'rating_summary', t.id('qr'))->>'mean') = '3.50');
select t.check('rating: rating_summary refuses a non-rating question',
  t.code(lv_api.lv_analytics_query(t.id('c'), 'rating_summary', t.id('qm'))) = 'lv_invalid_input');
select t.check('text: free text stays withheld',
  t.code(lv_api.lv_analytics_query(t.id('c'), 'answer_distribution', t.id('qt'))) = 'lv_policy_undecided');

-- ===== overview ==========================================================================================
select t.check('overview: one call returns count, rate and every question',
  jsonb_array_length(lv_api.lv_analytics_overview(t.id('c'))->'questions') = 3
  and (lv_api.lv_analytics_overview(t.id('c')) #>> '{participant_count,n}') = '3'
  and (lv_api.lv_analytics_overview(t.id('c')) #>> '{participation_rate,eligible_n}') = '6');
select t.check('overview: a rating question carries its summary',
  (lv_api.lv_analytics_overview(t.id('c')) #>> '{questions,0,result,summary,mean}') = '3.50');
select t.check('overview: a free-text question carries its own refusal',
  (lv_api.lv_analytics_overview(t.id('c')) #>> '{questions,2,result,error,code}') = 'lv_policy_undecided');
select t.check('overview: results never contain an account or submission reference',
  lv_api.lv_analytics_overview(t.id('c'))::text not like '%account%'
  and lv_api.lv_analytics_overview(t.id('c'))::text not like '%submission%');
select t.as_kpn(2);
select t.check('overview: a member without analytics.read is lv_forbidden', t.code(lv_api.lv_analytics_overview(t.id('c'))) = 'lv_forbidden');
select t.as_kpn(9); select lv_api.lv_my_context();
select t.check('overview: a non-member is lv_not_found', t.code(lv_api.lv_analytics_overview(t.id('c'))) = 'lv_not_found');

-- ===== frozen population includes guests ==================================================================
select t.as_pg();
insert into lv.guest_participation (campaign_id, hub_id, key_hash, campaign_revision)
values (t.id('c'), t.id('hub'), 'late-guest', 2);
select t.as_kpn(1);
select t.check('release: a late guest changes the frozen population, so results are withheld',
  t.code(lv_api.lv_analytics_query(t.id('c'), 'participant_count')) = 'lv_policy_undecided');

-- ===== threshold helper ==================================================================================
select t.as_pg();
select t.check('threshold: the participation helper counts unique accepted members only',
  lv.campaign_member_participation(t.id('c')) = '{"eligible": 6, "participants": 3}'::jsonb);

-- ===== identified Campaign: published live, no cohort =====================================================
select t.as_kpn(1);
select t.put('ci', (lv_api.lv_campaign_create(t.id('hub'), 'Identified', 'poll', 'identified')->>'campaign_id'));
select t.put('qi', (lv_api.lv_campaign_question_add(t.id('ci'), 1, 'yes_no', 'Yes?')->>'question_id'));
select lv_api.lv_campaign_schedule(t.id('ci'));
select t.as_kpn(2);
select lv_api.lv_submit_response(t.id('ci'), format('[{"question_id":"%s","value":"yes"}]', t.get('qi'))::jsonb);
select t.as_kpn(1);
select t.check('identified: results are live and a single answer is shown',
  (lv_api.lv_analytics_query(t.id('ci'), 'answer_distribution', t.id('qi')) #>> '{cells,0,n}') = '1');

rollback;
