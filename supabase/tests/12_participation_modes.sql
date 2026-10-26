-- 12: PARTICIPATION MODES AND GUESTS (000012, roadmap slice 10).
--
-- Guests answer only Campaigns that allow them, fail closed until a rate limit is set, are deduplicated by a
-- hashed client key, never become members or count toward member totals, and leave no join path to answers.
select set_config('t.file', '12_participation_modes', false);
begin;

update lv.policy set value = '5'::jsonb where key = 'campaign.max_active_per_hub';
select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_pg();
insert into lv.beta_applications (account_id, status) values (t.id('owner'), 'approved');
select t.as_kpn(1);
select t.put('hub', (lv_api.lv_hub_create('guest-hub', 'Guest Hub')->>'hub_id'));

-- A members-only anonymous Campaign and a guest-enabled anonymous Campaign.
select t.put('cm', (lv_api.lv_campaign_create(t.id('hub'), 'Members only', 'survey', 'anonymous')->>'campaign_id'));
select lv_api.lv_campaign_question_add(t.id('cm'), 1, 'rating', 'Rate');
select lv_api.lv_campaign_schedule(t.id('cm'));
select t.put('cg', (lv_api.lv_campaign_create(t.id('hub'), 'Open to guests', 'survey', 'anonymous')->>'campaign_id'));
select t.put('qg', (lv_api.lv_campaign_question_add(t.id('cg'), 1, 'rating', 'Rate')->>'question_id'));
select t.check('policy: participation settings change in a draft',
  t.code(lv_api.lv_campaign_set_participation(t.id('cg'), 'members_and_guests', 3)) = 'ok');
select t.check('policy: an unknown audience is lv_invalid_input',
  t.code(lv_api.lv_campaign_set_participation(t.id('cg'), 'everyone')) = 'lv_invalid_input');
select lv_api.lv_campaign_schedule(t.id('cg'));
select t.check('policy: participation settings are locked once published',
  t.code(lv_api.lv_campaign_set_participation(t.id('cg'), 'members')) = 'lv_locked');
select t.as_pg();
select t.put('code_m', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('cm'))));
select t.put('code_g', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('cg'))));
select t.check('policy: the published version records the guest settings',
  t.q(format($q$select (settings->>'audience') || '|' || (settings->>'guest_limit') from lv.campaign_versions where campaign_id = %L::uuid$q$, t.get('cg'))) = 'members_and_guests|3');

-- ===== guest read ========================================================================================
select t.as_anon();
select t.check('guest: a members-only Campaign is invisible to guests', t.code(lv_api.lv_guest_campaign_get(t.get('code_m'))) = 'lv_not_found');
select t.check('guest: an unknown code is lv_not_found', t.code(lv_api.lv_guest_campaign_get('ZZZZZZ')) = 'lv_not_found');
select t.check('guest: a guest-enabled Campaign shows its questions and Hub name only',
  jsonb_array_length(lv_api.lv_guest_campaign_get(t.get('code_g'))->'questions') = 1
  and (lv_api.lv_guest_campaign_get(t.get('code_g')) #>> '{hub,name}') = 'Guest Hub'
  and (lv_api.lv_guest_campaign_get(t.get('code_g'))->'hub') - 'name' = '{}'::jsonb);
select t.check('guest: the code is case-insensitive', t.code(lv_api.lv_guest_campaign_get(lower(t.get('code_g')))) = 'ok');

-- ===== guest submit ======================================================================================
select t.check('guest: submissions fail closed until a rate limit is set',
  t.code(lv_api.lv_guest_submit(t.get('code_g'), repeat('a', 40), format('[{"question_id":"%s","value":4}]', t.get('qg'))::jsonb)) = 'lv_policy_undecided');
select t.as_pg();
update lv.policy set value = '2'::jsonb where key = 'participation.guest_rate_per_minute';
select t.as_anon();
select t.check('guest: a short guest key is lv_invalid_input',
  t.code(lv_api.lv_guest_submit(t.get('code_g'), 'short', format('[{"question_id":"%s","value":4}]', t.get('qg'))::jsonb)) = 'lv_invalid_input');
select t.check('guest: an incomplete answer set is lv_invalid_input',
  t.code(lv_api.lv_guest_submit(t.get('code_g'), repeat('a', 40), '[]'::jsonb)) = 'lv_invalid_input');
select t.put('receipt', (lv_api.lv_guest_submit(t.get('code_g'), repeat('a', 40), format('[{"question_id":"%s","value":4}]', t.get('qg'))::jsonb)->>'receipt_id'));
select t.check('guest: a guest submits and receives a receipt', t.get('receipt') is not null);
select t.check('guest: the same key again returns the same receipt as a duplicate',
  (lv_api.lv_guest_submit(t.get('code_g'), repeat('a', 40), format('[{"question_id":"%s","value":5}]', t.get('qg'))::jsonb)->>'receipt_id') = t.get('receipt'));
select t.check('guest: a members-only Campaign refuses guests',
  t.code(lv_api.lv_guest_submit(t.get('code_m'), repeat('b', 40), '[]'::jsonb)) = 'lv_not_found');
select lv_api.lv_guest_submit(t.get('code_g'), repeat('b', 40), format('[{"question_id":"%s","value":2}]', t.get('qg'))::jsonb);
select t.check('guest: the per-minute rate limit is enforced',
  t.code(lv_api.lv_guest_submit(t.get('code_g'), repeat('c', 40), format('[{"question_id":"%s","value":3}]', t.get('qg'))::jsonb)) = 'lv_rate_limited');
select t.as_pg();
update lv.guest_participation set created_at = created_at - interval '5 minutes' where campaign_id = t.id('cg');
select t.as_anon();
select lv_api.lv_guest_submit(t.get('code_g'), repeat('c', 40), format('[{"question_id":"%s","value":3}]', t.get('qg'))::jsonb);
select t.check('guest: the per-Campaign guest limit is enforced',
  t.code(lv_api.lv_guest_submit(t.get('code_g'), repeat('d', 40), format('[{"question_id":"%s","value":3}]', t.get('qg'))::jsonb)) = 'lv_limit_reached');
select t.check('guest: a full Campaign tells guests it cannot take more', (lv_api.lv_guest_campaign_get(t.get('code_g'))->>'can_respond') = 'false');

-- ===== guests are not members and leave no join path ======================================================
select t.as_pg();
select t.check('guest: no membership or account was created for guests',
  t.q(format($q$select (select count(*) from lv.hub_memberships where hub_id = %L::uuid)::text || '|' || (select count(*) from lv.accounts)::text$q$, t.get('hub'))) = '1|1');
select t.check('guest: guest submissions carry no account and are flagged as guest',
  t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid and is_guest and account_id is null$q$, t.get('cg'))) = '3');
select t.check('guest: the stored key is a hash, never the key',
  t.q(format($q$select count(*)::text from lv.guest_participation where campaign_id = %L::uuid and key_hash like '%%aaaa%%'$q$, t.get('cg'))) = '0');
select t.check('guest: guest participation has no column that references a submission or an account',
  not exists (select 1 from information_schema.columns where table_schema = 'lv' and table_name = 'guest_participation'
                and column_name in ('submission_id', 'account_id')));
select t.check('guest: anonymous guest submissions are coarsened to the day',
  t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid and created_at <> date_trunc('day', created_at)$q$, t.get('cg'))) = '0');
update lv.campaigns set status = 'paused' where id = t.id('cg');
select t.as_anon();
select t.check('guest: a paused Campaign is not shown to guests', t.code(lv_api.lv_guest_campaign_get(t.get('code_g'))) = 'lv_not_found');

rollback;
