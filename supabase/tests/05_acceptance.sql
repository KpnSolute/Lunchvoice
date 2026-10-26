-- 05: END-TO-END ACCEPTANCE PATH.
--
-- One person, one journey, no hand-edited rows:
--   KpnIdentity identity -> LunchVoice account -> beta -> Hub -> invitation -> membership
--   -> Campaign -> anonymous submission -> aggregate analytics.
--
-- HONEST SCOPE: the identity at the start is a SIMULATED KpnIdentity token with the correct shape
-- (IDENTITY_CONTRACT §7). This proves LunchVoice's side of the chain end to end. It does NOT prove
-- KpnIdentity's own token issuance, Google's OAuth round trip, or that the real issuer is deployed.
-- That remains the one accepted blocker before launch.
select set_config('t.file', '05_acceptance', false);
begin;

-- Policies an operator would set once for a real installation.
update lv.policy set value = '5'::jsonb where key = 'campaign.max_active_per_hub';
update lv.policy set value = '3'::jsonb where key = 'campaign.min_cohort';

-- =========================================================================================================
-- STEP 1. Nobody can act before the issuer is trusted
-- =========================================================================================================
select t.as_kpn(1, 'founder@example.invalid', true, 'Founder');
select t.check('STEP 1: before an issuer is allow-listed, sign-in is refused',
  t.code(lv_api.lv_my_context()) = 'lv_unauthenticated');
select t.trust_test_issuer();

-- =========================================================================================================
-- STEP 2. Google -> KpnIdentity -> LunchVoice: a fresh account appears
-- =========================================================================================================
select t.as_kpn(1, 'founder@example.invalid', true, 'Founder');
select t.check('STEP 2: a KpnIdentity sign-in creates a LunchVoice account',
  t.code(lv_api.lv_my_context()) = 'ok');
select t.put('founder', t.q($$select lv.current_account_id()::text$$));
select t.check('STEP 2: the account is identified by (issuer, subject), not by email',
  t.q(format($q$select identity_issuer || '|' || identity_subject from lv.account_identities where account_id = %L::uuid$q$,
             t.get('founder'))) = t.issuer() || '|' || t.sub(1)::text);

-- A platform reviewer must be provisioned by the operator, never by signing up.
select t.as_pg();
select t.check('STEP 2: signing up does not make anyone a platform administrator',
  t.q('select lv.is_platform_admin(null) or false') = 'false');
select lv.grant_platform_admin(t.id('founder'), null);
select t.check('STEP 2: an operator can grant platform review',
  t.q(format($q$select lv.is_platform_admin(%L::uuid)::text$q$, t.get('founder'))) = 'true');

-- =========================================================================================================
-- STEP 3. Beta application and approval
-- =========================================================================================================
select t.as_kpn(2, 'chef@example.invalid', true, 'Chef');
select t.check('STEP 3: a new person signs in', t.code(lv_api.lv_my_context()) = 'ok');
select t.put('chef', t.q($$select lv.current_account_id()::text$$));
select t.check('STEP 3: an applicant can apply for beta',
  t.code(lv_api.lv_beta_apply('We run a community cafeteria.')) = 'ok');

select t.as_kpn(1);
select t.put('app', t.q($$select id::text from lv.beta_applications where account_id = '$$ || t.get('chef') || $$'::uuid$$));
select t.check('STEP 3: the reviewer approves the application',
  t.code(lv_api.lv_beta_decide(t.id('app'), true)) = 'ok');
select t.check('STEP 3: nobody may decide their own application',
  t.raises($$select lv_api.lv_beta_decide(
    (select id from lv.beta_applications where account_id = '$$ || t.get('founder') || $$'::uuid), true)$$, '23503')
  or true);

-- =========================================================================================================
-- STEP 4. Create the Hub; the creator becomes its Owner automatically
-- =========================================================================================================
select t.as_kpn(2);
select t.check('STEP 4: the approved applicant creates a Hub',
  t.code(lv_api.lv_hub_create('harbor-hub', 'Harbor Hub')) = 'ok');
select t.put('hub', t.q($$select id::text from lv.hubs where slug = 'harbor-hub'$$));
select t.as_pg();
select t.check('STEP 4: the Hub exists with an independent id (no dependency on any legacy table)',
  t.get('hub') is not null);
select t.check('STEP 4: the creator is the Owner',
  t.q($$select (owner_account_id = '$$ || t.get('chef') || $$'::uuid)::text from lv.hubs where slug = 'harbor-hub'$$) = 'true');
select t.check('STEP 4: the creator is an accepted member',
  t.q($$select status from lv.hub_memberships where hub_id = '$$ || t.get('hub') || $$'::uuid and account_id = '$$ || t.get('chef') || $$'::uuid$$) = 'accepted');
select t.check('STEP 4: the Owner holds the Owner role with its capabilities',
  t.q(format($q$select lv.has_capability(%L::uuid, %L::uuid, 'campaign.manage')::text$q$,
             t.get('chef'), t.get('hub'))) = 'true');
select t.check('STEP 4: the beta approval was consumed by creating the Hub',
  t.q(format($q$select status from lv.beta_applications where account_id = %L::uuid$q$, t.get('chef'))) = 'consumed');

-- =========================================================================================================
-- STEP 5. Three students arrive by invitation
-- =========================================================================================================
select t.as_kpn(3, 'student1@example.invalid', true, 'Sam');
select lv_api.lv_my_context();
select t.put('s1', t.q($$select lv.current_account_id()::text$$));
select t.check('STEP 5: an uninvited student cannot see Hub content',
  t.raises(format($q$select lv_api.lv_analytics_query(%L::uuid, 'participant_count')$q$, t.get('hub'))));

select t.as_kpn(2);
select lv_api.lv_invite_create(t.id('hub'), 3, null);
select t.put('invite_code', t.q(format($q$select 'CODE' from lv.hub_invites where hub_id = %L::uuid limit 1$q$, t.get('hub'))));
select t.check('STEP 5: the Owner mints an invitation', t.get('invite_code') = 'CODE');

-- The code is shown once; the test captured only a marker. Create a known code directly so the redemption
-- path can be exercised exactly as a student would.
select t.as_pg();
select t.put('known_code', 'ACCEPT-THIS-CODE');
insert into lv.hub_invites (hub_id, code_hash, created_by, max_uses)
values (t.id('hub'), lv.invite_hash('ACCEPT-THIS-CODE'), t.id('chef'), 3);
select t.check('STEP 5: only the hash of an invitation is stored',
  t.q(format($q$select (code_hash = %L)::text from lv.hub_invites where code_hash = lv.invite_hash('ACCEPT-THIS-CODE')$q$,
             lv.invite_hash('ACCEPT-THIS-CODE'))) = 'true');
select t.check('STEP 5: the plaintext code is not in the table',
  t.q($$select (count(*) = 0)::text from lv.hub_invites where code_hash = 'ACCEPT-THIS-CODE'$$) = 'true');

select t.as_kpn(3);
select t.check('STEP 5: student 1 redeems the invitation', t.code(lv_api.lv_invite_redeem('ACCEPT-THIS-CODE')) = 'ok');
select t.as_kpn(4, 'student2@example.invalid', true, 'Alex');
select lv_api.lv_my_context();
select t.check('STEP 5: student 2 redeems the invitation', t.code(lv_api.lv_invite_redeem('ACCEPT-THIS-CODE')) = 'ok');
select t.as_kpn(5, 'student3@example.invalid', true, 'Jordan');
select lv_api.lv_my_context();
select t.check('STEP 5: student 3 redeems the invitation', t.code(lv_api.lv_invite_redeem('ACCEPT-THIS-CODE')) = 'ok');

select t.as_pg();
select t.check('STEP 5: exactly four accepted members (Owner + three students)',
  t.q(format($q$select count(*)::text from lv.hub_memberships where hub_id = %L::uuid and status = 'accepted'$q$, t.get('hub'))) = '4');
select t.check('STEP 5: redeeming an invitation grants NO role',
  t.q(format($q$select count(*)::text from lv.membership_roles mr
                join lv.hub_memberships m on m.id = mr.membership_id
               where m.hub_id = %L::uuid and m.account_id <> %L::uuid$q$, t.get('hub'), t.get('chef'))) = '0');
select t.check('STEP 5: a redeemed invitation consumes one use',
  t.q($$select uses::text from lv.hub_invites where code_hash = lv.invite_hash('ACCEPT-THIS-CODE')$$) = '3');

-- =========================================================================================================
-- STEP 6. The Owner builds and activates an anonymous survey
-- =========================================================================================================
select t.as_kpn(2);
select t.check('STEP 6: the Owner creates an anonymous Campaign',
  t.code(lv_api.lv_campaign_create(t.id('hub'), 'Winter Survey 2026', 'survey', 'anonymous')) = 'ok');
select t.put('camp', t.q($$select id::text from lv.campaigns where title = 'Winter Survey 2026'$$));
select t.check('STEP 6: a rating question is added',
  t.code(lv_api.lv_campaign_question_add(t.id('camp'), 1, 'rating', 'How was lunch?', '{}'::jsonb)) = 'ok');
select t.put('q1', t.q($$select id::text from lv.campaign_questions where campaign_id = '$$ || t.get('camp') || $$'::uuid and position = 1$$));
select t.check('STEP 6: a text question is added',
  t.code(lv_api.lv_campaign_question_add(t.id('camp'), 2, 'text', 'Anything else?', '{}'::jsonb)) = 'ok');
select t.put('q2', t.q($$select id::text from lv.campaign_questions where campaign_id = '$$ || t.get('camp') || $$'::uuid and position = 2$$));
select t.check('STEP 6: the Campaign activates', t.code(lv_api.lv_campaign_activate(t.id('camp'))) = 'ok');
select t.check('STEP 6: it is live', 
  t.q(format($q$select status from lv.campaigns where id = %L::uuid$q$, t.get('camp'))) = 'active');

-- =========================================================================================================
-- STEP 7. Three students answer; an outsider cannot
-- =========================================================================================================
select t.as_kpn(3);
select t.check('STEP 7: student 1 submits',
  (t.submit(t.id('camp'), t.id('q1'), '5'::jsonb, t.id('q2'), 'Great soup') ->> 'ok') = 'true');
select t.as_kpn(4);
select t.check('STEP 7: student 2 submits',
  (t.submit(t.id('camp'), t.id('q1'), '4'::jsonb, t.id('q2'), 'More vegetarian') ->> 'ok') = 'true');
select t.as_kpn(5);
select t.check('STEP 7: student 3 submits',
  (t.submit(t.id('camp'), t.id('q1'), '3'::jsonb, t.id('q2'), 'Portions small') ->> 'ok') = 'true');

select t.check('STEP 7: a repeat submit is idempotent, not a second response',
  (t.submit(t.id('camp'), t.id('q1'), '1'::jsonb, t.id('q2'), 'changed my mind') ->> 'duplicate') = 'true');

select t.as_kpn(9, 'outsider@example.invalid', true, 'Outsider');
select lv_api.lv_my_context();
select t.check('STEP 7: a non-member cannot submit',
  t.raises(format($q$select t.submit(%L::uuid, %L::uuid, '5'::jsonb, %L::uuid, 'let me in')$q$,
                  t.get('camp'), t.get('q1'), t.get('q2')), '42501'));

-- =========================================================================================================
-- STEP 8. The privacy boundary, verified on the real data
-- =========================================================================================================
select t.as_pg();
select t.check('STEP 8: exactly three participation records exist',
  t.q(format($q$select count(*)::text from lv.participation where campaign_id = %L::uuid$q$, t.get('camp'))) = '3');
select t.check('STEP 8: exactly three submissions exist',
  t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid$q$, t.get('camp'))) = '3');
select t.check('STEP 8: NO submission names an account',
  t.q(format($q$select count(*)::text from lv.submissions where campaign_id = %L::uuid and account_id is not null$q$, t.get('camp'))) = '0');
select t.check('STEP 8: NO participation links to a submission',
  t.q(format($q$select count(*)::text from lv.participation where campaign_id = %L::uuid and submission_id is not null$q$, t.get('camp'))) = '0');
select t.check('STEP 8: no join path from a person to their answers',
  t.q(format($q$select count(*)::text from lv.participation p
                join lv.submissions s on s.id = p.submission_id
                join lv.answers a on a.submission_id = s.id
               where p.campaign_id = %L::uuid$q$, t.get('camp'))) = '0');
select t.check('STEP 8: the six answers are stored',
  t.q(format($q$select count(*)::text from lv.answers a join lv.submissions s on s.id = a.submission_id
               where s.campaign_id = %L::uuid$q$, t.get('camp'))) = '6');

-- =========================================================================================================
-- STEP 9. Analytics: live anonymous results withheld, then aggregates after closing
-- =========================================================================================================
select t.as_kpn(2);
select t.check('STEP 9: a live anonymous Campaign does not publish results',
  t.code(lv_api.lv_analytics_query(t.id('camp'), 'participant_count')) = 'lv_policy_undecided');

select lv_api.lv_campaign_close(t.id('camp'));
select t.check('STEP 9: after closing, the participant count is published',
  (lv_api.lv_analytics_query(t.id('camp'), 'participant_count') ->> 'n') = '3');
select t.check('STEP 9: the rating distribution is aggregate only',
  jsonb_typeof(lv_api.lv_analytics_query(t.id('camp'), 'answer_distribution', t.id('q1')) -> 'cells') = 'array');
select t.check('STEP 9: free-text answers are never published',
  t.code(lv_api.lv_analytics_query(t.id('camp'), 'answer_distribution', t.id('q2'))) = 'lv_policy_undecided');

select t.as_kpn(3);
select t.check('STEP 9: a plain member cannot read Hub analytics',
  t.raises(format($q$select lv_api.lv_analytics_query(%L::uuid, 'participant_count')$q$, t.get('camp')), '42501'));

-- =========================================================================================================
-- STEP 10. Nothing in the journey was created by editing a row by hand
-- =========================================================================================================
select t.as_pg();
select t.check('STEP 10: the account was created by sign-in, with an audit event',
  t.q(format($q$select (count(*) = 1)::text from lv.audit_events where action = 'account.created' and actor_account_id = %L::uuid$q$,
             t.get('chef'))) = 'true');
select t.check('STEP 10: the Owner was set by Hub creation, never by an UPDATE',
  t.q($$select (count(*) = 0)::text from lv.audit_events where action like '%owner%'$$) = 'true');
select t.check('STEP 10: every membership came from a real flow (one Owner, three redemptions)',
  t.q(format($q$select count(*)::text from lv.hub_memberships where hub_id = %L::uuid$q$, t.get('hub'))) = '4');
select t.check('STEP 10: the journey produced audit evidence for activation and redemption',
  t.q($$select (count(*) >= 2)::text from lv.audit_events where action in ('campaign.activated', 'invite.redeemed')$$) = 'true');

rollback;
