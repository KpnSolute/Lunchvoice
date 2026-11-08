-- 14: ENTITLEMENTS, WAITLIST, PERSONAL SPACE AND QUICK SURVEYS (000014, launch plan step 2).
select set_config('t.file', '14_entitlements', false);
begin;

select t.trust_test_issuer();
select t.as_kpn(1, null, true, 'Founder'); select lv_api.lv_my_context();
select t.put('founder', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, null, true, 'Member'); select lv_api.lv_my_context();
select t.put('member', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(3, null, true, 'Outsider'); select lv_api.lv_my_context();
select t.put('outsider', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(4, null, true, 'Team owner'); select lv_api.lv_my_context();
select t.put('teamowner', t.q($$select lv.current_account_id()::text$$));

-- ===== the entitlement map ==============================================================================
select t.as_anon();
select t.check('map: lv_plan_limits works signed out', t.code(lv_api.lv_plan_limits()) = 'ok');
select t.check('map: free family carries the Quick Survey limits (5 active, 10 questions)',
  (lv_api.lv_plan_limits() #>> '{families,free,quick.max_active}') = '5'
  and (lv_api.lv_plan_limits() #>> '{families,free,quick.max_questions}') = '10');
select t.check('map: Starter is 3 roles, 3 pages, 15 Campaigns, 2 surveys, more than 50%',
  (lv_api.lv_plan_limits() #>> '{families,starter,roles.max_custom}') = '3'
  and (lv_api.lv_plan_limits() #>> '{families,starter,pages.max_custom}') = '3'
  and (lv_api.lv_plan_limits() #>> '{families,starter,campaigns.max_active}') = '15'
  and (lv_api.lv_plan_limits() #>> '{families,starter,surveys.max_active}') = '2'
  and (lv_api.lv_plan_limits() #> '{families,starter,surveys.threshold}') = '{"op":"gt","value":0.5}'::jsonb);
select t.check('map: Team is 6 roles, 5 surveys, at least 20%, Discover at 700',
  (lv_api.lv_plan_limits() #>> '{families,team,roles.max_custom}') = '6'
  and (lv_api.lv_plan_limits() #>> '{families,team,surveys.max_active}') = '5'
  and (lv_api.lv_plan_limits() #> '{families,team,surveys.threshold}') = '{"op":"gte","value":0.2}'::jsonb
  and (lv_api.lv_plan_limits() #>> '{families,team,discover.min_members}') = '700');
select t.check('products: prices are the canonical cents',
  (select string_agg(e->>'product' || '=' || coalesce(e->>'price_cents', 'null'), ',' order by e->>'product')
     from jsonb_array_elements(lv_api.lv_plan_limits()->'products') e
    where e->>'product' in ('starter_hub', 'team_hub', 'campaign_starter', 'hub_reservation'))
  = 'campaign_starter=1900,hub_reservation=2500,starter_hub=1300,team_hub=2900');
select t.check('products: Campaign Plus is $39 for 2 weeks + $19 per extra week, Team family, purchasable',
  (select (e->>'price_cents') = '3900' and (e->>'extra_week_cents') = '1900' and (e->>'first_period_weeks') = '2'
          and (e->>'purchasable') = 'true' and (e->>'family') = 'team'
     from jsonb_array_elements(lv_api.lv_plan_limits()->'products') e where e->>'product' = 'campaign_plus'));
select t.check('products: Campaign Starter extends at 1300 per extra week after 2 weeks',
  (select (e->>'first_period_weeks') = '2' and (e->>'extra_week_cents') = '1300'
     from jsonb_array_elements(lv_api.lv_plan_limits()->'products') e where e->>'product' = 'campaign_starter'));
select t.as_pg();
select t.check('policy: launch policies are set (min cohort 5, guest rate 10, 50 seats)',
  t.q($$select string_agg(value::text, ',' order by key) from lv.policy
         where key in ('campaign.min_cohort', 'participation.guest_rate_per_minute', 'waitlist.seats')$$) = '5,10,50');
select t.check('policy: the retired limit policies are gone', t.q($$select count(*)::text from lv.policy
         where key in ('campaign.max_active_per_hub', 'roles.max_custom_per_hub')$$) = '0');

-- ===== waitlist =========================================================================================
select t.as_anon();
select t.check('waitlist: status works signed out and omits me',
  t.code(lv_api.lv_waitlist_status()) = 'ok' and not (lv_api.lv_waitlist_status() ? 'me')
  and (lv_api.lv_waitlist_status() ->> 'seats_total') = '50' and (lv_api.lv_waitlist_status() ->> 'open') = 'true');
select t.check('waitlist: joining signed out is impossible', t.raises('select lv_api.lv_waitlist_join()', '42501'));
select t.as_kpn(1);
select t.check('waitlist: a bad contact email is lv_invalid_input', t.code(lv_api.lv_waitlist_join('not-an-email')) = 'lv_invalid_input');
select t.check('waitlist: a contact email needs the current consent version',
  t.code(lv_api.lv_waitlist_join('founder@example.invalid', 'Club Hub')) = 'lv_invalid_input'
  and t.code(lv_api.lv_waitlist_join('founder@example.invalid', 'Club Hub', '1999-01-01')) = 'lv_invalid_input');
select t.put('wl1', lv_api.lv_waitlist_join('founder@example.invalid', 'Club Hub', '2026-11-07')::text);
select t.as_pg();
select t.check('waitlist: the row keeps only email, intended Hub name, consent version and time',
  t.q(format($q$select contact_email || '|' || intended_hub_name || '|' || consent_version from lv.waitlist_entries where account_id = %L::uuid$q$, t.get('founder')))
    = 'founder@example.invalid|Club Hub|2026-11-07');
select t.as_kpn(1);
select t.check('waitlist: the first joiner is admitted at position 1 with a Founding grant',
  (t.get('wl1')::jsonb ->> 'status') = 'admitted' and (t.get('wl1')::jsonb ->> 'position') = '1'
  and (t.get('wl1')::jsonb #>> '{granted,product}') = 'founding' and (t.get('wl1')::jsonb #>> '{granted,family}') = 'starter'
  and (t.get('wl1')::jsonb #>> '{granted,state}') = 'active' and not ((t.get('wl1')::jsonb -> 'granted') ? 'ends_at'));
select t.check('waitlist: joining again is idempotent and grants nothing new',
  (lv_api.lv_waitlist_join() ->> 'already_joined') = 'true'
  and t.q(format($q$select count(*)::text from lv.hub_credits where account_id = %L::uuid$q$, t.get('founder'))) = '1');
select t.check('waitlist: context reports the seat and one Hub credit',
  (lv_api.lv_my_context() #>> '{waitlist,status}') = 'admitted' and (lv_api.lv_my_context() ->> 'hub_credits') = '1'
  and jsonb_array_length(lv_api.lv_my_context() -> 'entitlements') = 1);
select t.check('waitlist: status shows me', (lv_api.lv_waitlist_status() #>> '{me,status}') = 'admitted');

-- Fill the list to 49 admitted, then the 50th joiner is admitted and the 51st is waitlisted.
select t.as_pg();
insert into lv.accounts (id, display_name) select gen_random_uuid(), 'Filler ' || g from generate_series(1, 48) g;
insert into lv.waitlist_entries (account_id, status, position)
select a.id, 'admitted', 1 + row_number() over (order by a.display_name) from lv.accounts a where a.display_name like 'Filler %';
select t.as_kpn(2);
select t.check('waitlist: the 50th joiner is admitted', (lv_api.lv_waitlist_join() ->> 'position') = '50');
select t.check('waitlist: the list is now full', (lv_api.lv_waitlist_status() ->> 'open') = 'false');
select t.as_kpn(3);
select t.put('wl51', lv_api.lv_waitlist_join()::text);
select t.check('waitlist: the 51st joiner is waitlisted at position 1 with no grant',
  (t.get('wl51')::jsonb ->> 'status') = 'waitlisted' and (t.get('wl51')::jsonb ->> 'position') = '1'
  and not (t.get('wl51')::jsonb ? 'granted') and (lv_api.lv_my_context() ->> 'hub_credits') = '0');
select t.as_pg();
select t.check('waitlist: admission takes an advisory lock',
  t.q($$select (prosrc like '%pg_advisory_xact_lock%lv_waitlist%')::text from pg_proc where proname = 'api_waitlist_join'$$) = 'true');
select t.check('waitlist: no authorization check reads the waitlist table',
  t.q($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'lv' and p.prosrc like '%waitlist_entries%'
           and p.proname not in ('api_waitlist_status', 'api_waitlist_join', 'waitlist_me',
                                 -- 000019: the platform admin console reads it for display only, never to authorize
                                 'api_admin_overview', 'api_admin_waitlist', 'api_admin_waitlist_contact')$$) = '0');
select t.check('waitlist: one seat per account (unique constraint backstop)',
  t.raises(format($q$insert into lv.waitlist_entries (account_id, status, position) values (%L::uuid, 'admitted', 99)$q$, t.get('founder')), '23505'));

-- ===== Hub credits =======================================================================================
select t.as_kpn(3);
select t.check('credit: without a credit, creating a Hub is lv_entitlement_required with a product hint',
  t.code(lv_api.lv_hub_create('no-credit-hub', 'X')) = 'lv_entitlement_required'
  and (lv_api.lv_hub_create('no-credit-hub', 'X') #>> '{error,product}') = 'starter_hub');
select t.as_kpn(1);
select t.put('hubres', lv_api.lv_hub_create('founding-hub', 'Founding Hub')::text);
select t.put('hub', t.get('hubres')::jsonb ->> 'hub_id');
select t.check('credit: the Founding credit creates a Hub on the Starter family',
  (t.get('hubres')::jsonb #>> '{plan,family}') = 'starter' and (t.get('hubres')::jsonb #>> '{plan,product}') = 'founding'
  and (t.get('hubres')::jsonb #>> '{plan,state}') = 'active');
select t.check('credit: the credit is consumed by that Hub', (lv_api.lv_my_context() ->> 'hub_credits') = '0'
  and t.q(format($q$select (consumed_by_hub = %L::uuid)::text from lv.hub_credits where account_id = %L::uuid$q$, t.get('hub'), t.get('founder'))) = 'true');
select t.check('credit: a second Hub needs another credit', t.code(lv_api.lv_hub_create('second-hub', 'Second')) = 'lv_entitlement_required');
select t.check('context: the Hub is listed with kind and plan',
  (select (e->>'kind') = 'community' and (e #>> '{plan,family}') = 'starter'
     from jsonb_array_elements(lv_api.lv_my_context() -> 'hubs') e where e->>'slug' = 'founding-hub'));
select t.check('lv_beta_required is no longer returned', t.q($$select (count(*) = 0)::text from pg_proc
  where proname = 'api_hub_create' and prosrc like '%lv_beta_required%'$$) = 'true');

-- Members for the survey and invite tests
select t.put('invite', (lv_api.lv_invite_create(t.id('hub')) ->> 'code'));
select t.as_kpn(2); select lv_api.lv_invite_redeem(t.get('invite'));

-- ===== survey gate =======================================================================================
select t.as_kpn(1);
select t.put('s1', (lv_api.lv_campaign_create(t.id('hub'), 'Survey 1', 'survey', 'identified') ->> 'campaign_id'));
select t.put('s1q', (lv_api.lv_campaign_question_add(t.id('s1'), 1, 'rating', 'Rate') ->> 'question_id'));
select t.put('s2', (lv_api.lv_campaign_create(t.id('hub'), 'Survey 2', 'survey', 'identified') ->> 'campaign_id'));
select lv_api.lv_campaign_question_add(t.id('s2'), 1, 'rating', 'Rate');
select t.put('s3', (lv_api.lv_campaign_create(t.id('hub'), 'Survey 3', 'survey', 'identified') ->> 'campaign_id'));
select lv_api.lv_campaign_question_add(t.id('s3'), 1, 'rating', 'Rate');
select t.put('p1', (lv_api.lv_campaign_create(t.id('hub'), 'Poll', 'poll', 'identified') ->> 'campaign_id'));
select lv_api.lv_campaign_question_add(t.id('p1'), 1, 'yes_no', 'Yes?');
select t.check('survey gate: a new Hub (no participation yet) activates its first two surveys',
  t.code(lv_api.lv_campaign_activate(t.id('s1'))) = 'ok' and t.code(lv_api.lv_campaign_activate(t.id('s2'))) = 'ok');
select t.put('g3', lv_api.lv_campaign_activate(t.id('s3'))::text);
select t.check('survey gate: a third survey is blocked while two have not met the threshold',
  t.code(t.get('g3')::jsonb) = 'lv_gate_blocked' and (t.get('g3')::jsonb #> '{error,reasons}') ? 'survey_limit_reached'
  and (t.get('g3')::jsonb #>> '{error,limit}') = '2' and (t.get('g3')::jsonb #>> '{error,used}') = '2');
select t.check('survey gate: other modes are not held back by the survey limit', t.code(lv_api.lv_campaign_activate(t.id('p1'))) = 'ok');

-- Guests never count toward the threshold.
select t.as_pg();
update lv.campaigns set audience = 'members_and_guests' where id = t.id('s1');
select t.as_anon();
select lv_api.lv_guest_submit((select t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('s1')))),
  repeat('g', 40), format('[{"question_id":"%s","value":5}]', t.get('s1q'))::jsonb);
select t.as_pg();
select t.check('survey gate: a guest answer leaves the threshold unmet',
  t.q(format($q$select lv.survey_threshold_met(%L::uuid, '{"op":"gt","value":0.5}'::jsonb)::text$q$, t.get('s1'))) = 'false');
-- One of two members answers: 50% is not "more than 50%".
select t.as_kpn(2);
select lv_api.lv_submit_response(t.id('s1'), format('[{"question_id":"%s","value":4}]', t.get('s1q'))::jsonb);
select t.as_pg();
select t.check('survey gate: exactly 50% does not meet the Starter threshold (more than 50%)',
  t.q(format($q$select lv.survey_threshold_met(%L::uuid, '{"op":"gt","value":0.5}'::jsonb)::text$q$, t.get('s1'))) = 'false');
select t.check('survey gate: but 50% meets a Team-style threshold (at least 20%)',
  t.q(format($q$select lv.survey_threshold_met(%L::uuid, '{"op":"gte","value":0.2}'::jsonb)::text$q$, t.get('s1'))) = 'true');
select t.as_kpn(1);
select lv_api.lv_submit_response(t.id('s1'), format('[{"question_id":"%s","value":3}]', t.get('s1q'))::jsonb);
select t.check('survey gate: once a survey passes the threshold it frees its slot', t.code(lv_api.lv_campaign_activate(t.id('s3'))) = 'ok');
select t.as_pg();
select t.check('survey gate: an unknown or zero eligible population never counts as met',
  t.q($$select lv.survey_threshold_met(gen_random_uuid(), '{"op":"gte","value":0}'::jsonb)::text$$) = 'false');

-- ===== role limits per family ============================================================================
select t.as_kpn(1);
select lv_api.lv_role_create(t.id('hub'), 'R1', null, array['analytics.read']);
select lv_api.lv_role_create(t.id('hub'), 'R2', null, array['analytics.read']);
select lv_api.lv_role_create(t.id('hub'), 'R3', null, array['analytics.read']);
select t.put('r4', lv_api.lv_role_create(t.id('hub'), 'R4', null, array['analytics.read'])::text);
select t.check('roles: Starter allows exactly 3 custom roles', t.code(t.get('r4')::jsonb) = 'lv_limit_reached'
  and (lv_api.lv_role_list(t.id('hub')) #>> '{custom_slots,limit}') = '3');
select t.as_pg();
select t.grant_credit(t.id('teamowner'), 'team');
select t.as_kpn(4);
select t.put('teamhub', (lv_api.lv_hub_create('team-hub', 'Team Hub') ->> 'hub_id'));
select t.check('roles: a Team-family Hub has 6 custom role slots',
  (lv_api.lv_role_list(t.id('teamhub')) #>> '{custom_slots,limit}') = '6');

-- ===== expiry fails closed for premium writes only ========================================================
select t.as_kpn(1);
select t.put('d1', (lv_api.lv_campaign_create(t.id('hub'), 'Later', 'poll', 'identified') ->> 'campaign_id'));
select lv_api.lv_campaign_question_add(t.id('d1'), 1, 'yes_no', 'Yes?');
select t.as_pg();
update lv.policy set value = to_jsonb((now() - interval '31 days')::text) where key = 'billing.launched_at';
select t.as_kpn(1);
select t.check('expiry: Founding ends 30 days after billing launches',
  (select (e #>> '{plan,state}') = 'expired' from jsonb_array_elements(lv_api.lv_my_context() -> 'hubs') e where e->>'slug' = 'founding-hub'));
select t.check('expiry: activating is lv_entitlement_required', t.code(lv_api.lv_campaign_activate(t.id('d1'))) = 'lv_entitlement_required');
select t.check('expiry: scheduling is lv_entitlement_required', t.code(lv_api.lv_campaign_schedule(t.id('d1'), now() + interval '1 day')) = 'lv_entitlement_required');
select t.check('expiry: creating a role is lv_entitlement_required', t.code(lv_api.lv_role_create(t.id('hub'), 'R9', null, array['analytics.read'])) = 'lv_entitlement_required');
select t.check('expiry: creating an invitation is lv_entitlement_required', t.code(lv_api.lv_invite_create(t.id('hub'))) = 'lv_entitlement_required');
select t.check('expiry: reads still work', t.code(lv_api.lv_campaign_list(t.id('hub'))) = 'ok'
  and t.code(lv_api.lv_hub_get('founding-hub')) = 'ok' and t.code(lv_api.lv_analytics_overview(t.id('s1'))) = 'ok');
select t.check('expiry: pausing and closing still work', t.code(lv_api.lv_campaign_pause(t.id('s2'))) = 'ok'
  and t.code(lv_api.lv_campaign_close(t.id('s2'))) = 'ok');
select t.check('expiry: resuming is lv_entitlement_required', t.code(lv_api.lv_campaign_pause(t.id('p1'))) = 'ok'
  and t.code(lv_api.lv_campaign_resume(t.id('p1'))) = 'lv_entitlement_required');
select t.as_pg();
select t.check('expiry: no data was deleted', t.q(format($q$select count(*)::text from lv.submissions where hub_id = %L::uuid$q$, t.get('hub'))) = '3'
  and t.q(format($q$select count(*)::text from lv.campaigns where hub_id = %L::uuid$q$, t.get('hub'))) = '5');
update lv.policy set value = null where key = 'billing.launched_at';
select t.as_kpn(1);
select t.check('expiry: with billing not launched, Founding is open-ended again', t.code(lv_api.lv_campaign_resume(t.id('p1'))) = 'ok');

-- ===== personal space and Quick Surveys ==================================================================
select t.as_kpn(3);
select t.check('quick: the outsider has no personal space until the first Quick Survey',
  t.q(format($q$select count(*)::text from lv.hubs where owner_account_id = %L::uuid$q$, t.get('outsider'))) = '0');
select t.check('quick: access must be link or invite', t.code(lv_api.lv_quick_survey_create('X', 'public')) = 'lv_invalid_input');
select t.put('qs', lv_api.lv_quick_survey_create('Lunch poll', 'link', 'anonymous', true)::text);
select t.put('q1', t.get('qs')::jsonb #>> '{campaign,campaign_id}');
select t.check('quick: a link Quick Survey is a draft survey that accepts guests',
  (t.get('qs')::jsonb #>> '{campaign,mode}') = 'survey' and (t.get('qs')::jsonb #>> '{campaign,status}') = 'draft'
  and (t.get('qs')::jsonb #>> '{campaign,guests}') = 'true' and (t.get('qs')::jsonb #>> '{campaign,access}') = 'link');
select t.put('personal', t.q(format($q$select hub_id::text from lv.campaigns where id = %L::uuid$q$, t.get('q1'))));
select t.check('personal: it lives in a personal space with no slug',
  t.q(format($q$select kind || '|' || coalesce(slug, 'null') || '|' || visibility from lv.hubs where id = %L::uuid$q$, t.get('personal'))) = 'personal|null|private');
select t.check('personal: it is never listed as a Hub', jsonb_array_length(lv_api.lv_my_context() -> 'hubs') = 0);
select t.check('personal: one personal space per account',
  t.code(lv_api.lv_quick_survey_create('Second', 'link')) = 'ok'
  and t.q(format($q$select count(*)::text from lv.hubs where owner_account_id = %L::uuid and kind = 'personal'$q$, t.get('outsider'))) = '1');
select t.check('personal: lv_campaign_create cannot target it', t.code(lv_api.lv_campaign_create(t.id('personal'), 'X', 'poll')) = 'lv_not_available');
select t.check('personal: Hub-scoped operations answer lv_not_found (invite)', t.code(lv_api.lv_invite_create(t.id('personal'))) = 'lv_not_found');
select t.check('personal: Hub-scoped operations answer lv_not_found (members, roles, invites list)',
  t.code(lv_api.lv_member_list(t.id('personal'))) = 'lv_not_found' and t.code(lv_api.lv_role_list(t.id('personal'))) = 'lv_not_found'
  and t.code(lv_api.lv_invite_list(t.id('personal'))) = 'lv_not_found'
  and t.code(lv_api.lv_role_create(t.id('personal'), 'R', null, array['analytics.read'])) = 'lv_not_found'
  and t.code(lv_api.lv_member_leave(t.id('personal'))) = 'lv_not_found');
select t.check('personal (LC-06): the owner cannot admit, assign roles, update roles or delete roles in it',
  t.code(lv_api.lv_member_admit(t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid$q$, t.get('personal')))::uuid)) = 'lv_not_found'
  and t.code(lv_api.lv_member_role_assign(t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid$q$, t.get('personal')))::uuid,
                                         t.q(format($q$select id::text from lv.roles where hub_id = %L::uuid$q$, t.get('personal')))::uuid)) = 'lv_not_found'
  and t.code(lv_api.lv_role_update(t.q(format($q$select id::text from lv.roles where hub_id = %L::uuid$q$, t.get('personal')))::uuid, 'X')) = 'lv_not_found'
  and t.code(lv_api.lv_role_delete(t.q(format($q$select id::text from lv.roles where hub_id = %L::uuid$q$, t.get('personal')))::uuid)) = 'lv_not_found');
select t.check('personal (LC-06): campaign listing by Hub id and Hub search never show it as a Hub',
  not exists (select 1 from jsonb_array_elements(lv_api.lv_my_context() -> 'hubs') e where e->>'hub_id' = t.get('personal')));
select t.as_kpn(2);
select t.check('personal: nobody can join it', t.code(lv_api.lv_hub_join(t.id('personal'))) = 'lv_not_found');
select t.as_pg();
select t.check('personal: the database refuses a personal space with a slug',
  t.raises(format($q$update lv.hubs set slug = 'grab-me' where id = %L::uuid$q$, t.get('personal'))));
select t.check('personal: the database refuses a community Hub without a slug',
  t.raises(format($q$insert into lv.hubs (slug, display_name, owner_account_id) values (null, 'x', %L::uuid)$q$, t.get('member'))));
select t.check('personal: lv_hub_get never resolves it', t.q($$select count(*)::text from lv.hubs where kind = 'personal' and slug is not null$$) = '0');

-- question limits and kinds
select t.as_kpn(3);
select lv_api.lv_campaign_question_add(t.id('q1'), g, 'rating', 'Q' || g) from generate_series(1, 10) g;
select t.put('q11', lv_api.lv_campaign_question_add(t.id('q1'), 11, 'rating', 'Q11')::text);
select t.check('quick: the 11th question is lv_limit_reached with limit and used',
  t.code(t.get('q11')::jsonb) = 'lv_limit_reached' and (t.get('q11')::jsonb #>> '{error,limit}') = '10'
  and (t.get('q11')::jsonb #>> '{error,used}') = '10');
select t.check('quick: a Quick Survey stays a survey', t.code(lv_api.lv_campaign_update(t.id('q1'), null, 'poll')) = 'lv_invalid_input');
select t.check('quick: activation in the personal space works on the free family', t.code(lv_api.lv_campaign_activate(t.id('q1'))) = 'ok');

-- five active, the sixth is refused
select t.put('qx', (select string_agg(x, ',') from (
  select (lv_api.lv_quick_survey_create('Extra ' || g, 'link') #>> '{campaign,campaign_id}') x from generate_series(1, 5) g) s));
select lv_api.lv_campaign_question_add(c::uuid, 1, 'yes_no', 'Yes?') from unnest(string_to_array(t.get('qx'), ',')) c;
select lv_api.lv_campaign_activate(c::uuid) from unnest(string_to_array(t.get('qx'), ',')) c limit 4;
select t.put('q6', lv_api.lv_campaign_activate((string_to_array(t.get('qx'), ','))[5]::uuid)::text);
select t.check('quick: a sixth active Quick Survey is lv_limit_reached (limit 5, used 5)',
  t.code(t.get('q6')::jsonb) = 'lv_limit_reached' and (t.get('q6')::jsonb #>> '{error,limit}') = '5'
  and (t.get('q6')::jsonb #>> '{error,used}') = '5');
select t.check('quick: list and context report 5 of 5 active',
  (lv_api.lv_quick_survey_list() ->> 'active') = '5' and (lv_api.lv_quick_survey_list() ->> 'limit') = '5'
  and (lv_api.lv_my_context() #>> '{quick_surveys,active}') = '5' and jsonb_array_length(lv_api.lv_quick_survey_list() -> 'surveys') = 7);

select t.check('quick: a paused Quick Survey still holds its slot',
  t.code(lv_api.lv_campaign_pause((string_to_array(t.get('qx'), ','))[1]::uuid)) = 'ok'
  and t.code(lv_api.lv_campaign_activate((string_to_array(t.get('qx'), ','))[5]::uuid)) = 'lv_limit_reached');
select t.check('quick: an active Quick Survey can be archived in one call', t.code(lv_api.lv_campaign_archive((string_to_array(t.get('qx'), ','))[2]::uuid)) = 'ok'
  and t.q(format($q$select status from lv.campaigns where id = %L::uuid$q$, (string_to_array(t.get('qx'), ','))[2])) = 'archived');
select t.check('quick: archiving one frees the slot, so the sixth activation succeeds',
  t.code(lv_api.lv_campaign_activate((string_to_array(t.get('qx'), ','))[5]::uuid)) = 'ok');
select t.as_pg();
update lv.policy set value = '7'::jsonb where key = 'quick.create_per_hour';
select t.as_kpn(3);
select t.check('quick: creation is throttled per account per hour', t.code(lv_api.lv_quick_survey_create('One more', 'link')) = 'lv_rate_limited');
select t.as_pg();
update lv.policy set value = '20'::jsonb where key = 'quick.create_per_hour';
select t.as_kpn(3);

-- link access: any signed-in person answers; guests too
select t.put('q1code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('q1'))));
select t.as_kpn(2);
select t.check('link: a signed-in non-member resolves the code to the Campaign',
  (lv_api.lv_guest_campaign_get(t.get('q1code')) #>> '{campaign,campaign_id}') = t.get('q1')
  and (lv_api.lv_guest_campaign_get(t.get('q1code')) #>> '{hub,name}') is null);
select t.check('link: a signed-in non-member answers through lv_submit_response',
  t.code(lv_api.lv_submit_response(t.id('q1'),
    t.q(format($q$select jsonb_agg(jsonb_build_object('question_id', q.id, 'value', 4))::text from lv.campaign_questions q where q.campaign_id = %L::uuid$q$, t.get('q1')))::jsonb)) = 'ok');
select t.as_pg();
select t.check('link: answering never creates a membership in the personal space',
  t.q(format($q$select count(*)::text from lv.hub_memberships where hub_id = %L::uuid$q$, t.get('personal'))) = '1');

-- invite access
select t.as_kpn(3);
select t.put('inv_c', (lv_api.lv_quick_survey_create('Invite only', 'invite', 'anonymous', true) #>> '{campaign,campaign_id}'));
select t.check('invite: guests are never enabled on an invite-only survey',
  t.q(format($q$select audience from lv.campaigns where id = %L::uuid$q$, t.get('inv_c'))) = 'members');
select t.check('invite: an invite-only survey cannot be switched to guests',
  t.code(lv_api.lv_campaign_set_participation(t.id('inv_c'), 'members_and_guests')) = 'lv_invalid_input');
select t.put('inv_q', (lv_api.lv_campaign_question_add(t.id('inv_c'), 1, 'yes_no', 'Come?') ->> 'question_id'));
select lv_api.lv_campaign_close(t.id('q1'));
select t.check('invite: activation works', t.code(lv_api.lv_campaign_activate(t.id('inv_c'))) = 'ok');
select t.check('invite: link-access surveys do not use Campaign invites', t.code(lv_api.lv_campaign_invite_create(t.id('q1'))) in ('lv_invalid_input', 'lv_lifecycle_invalid'));
select t.put('tok', (lv_api.lv_campaign_invite_create(t.id('inv_c'), 1) #>> '{invite,token}'));
select t.check('invite: the creator lists invites with their tokens', (lv_api.lv_campaign_invite_list(t.id('inv_c')) #>> '{invites,0,token}') = t.get('tok'));
select t.put('inv_code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('inv_c'))));
select t.as_kpn(2);
select t.check('invite: an uninvited signed-in person cannot see it', t.code(lv_api.lv_campaign_get(t.id('inv_c'))) = 'lv_not_found'
  and t.code(lv_api.lv_guest_campaign_get(t.get('inv_code'))) = 'lv_not_found');
select t.check('invite: an uninvited signed-in person cannot answer',
  t.code(lv_api.lv_submit_response(t.id('inv_c'), format('[{"question_id":"%s","value":"yes"}]', t.get('inv_q'))::jsonb)) = 'lv_forbidden');
select t.check('invite: a bad token is lv_invalid_code', t.code(lv_api.lv_campaign_invite_redeem('NOPE')) = 'lv_invalid_code');
select t.put('red', lv_api.lv_campaign_invite_redeem(lower(t.get('tok')))::text);
select t.check('invite: redeeming grants eligibility for that Campaign',
  (t.get('red')::jsonb ->> 'campaign_id') = t.get('inv_c') and (t.get('red')::jsonb ->> 'join_code') = t.get('inv_code'));
select t.check('invite: the invited person sees and answers it',
  (lv_api.lv_campaign_get(t.id('inv_c')) ->> 'can_respond') = 'true'
  and t.code(lv_api.lv_submit_response(t.id('inv_c'), format('[{"question_id":"%s","value":"yes"}]', t.get('inv_q'))::jsonb)) = 'ok');
select t.as_pg();
select t.check('invite: eligibility is not a membership',
  t.q(format($q$select count(*)::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('personal'), t.get('member'))) = '0');
select t.as_kpn(1);
select t.check('invite: an exhausted invite is lv_invalid_code', t.code(lv_api.lv_campaign_invite_redeem(t.get('tok'))) = 'lv_invalid_code');
select t.as_anon();
select t.check('invite: guests never reach an invite-only survey', t.code(lv_api.lv_guest_submit(t.get('inv_code'), repeat('z', 40),
  format('[{"question_id":"%s","value":"yes"}]', t.get('inv_q'))::jsonb)) = 'lv_not_found');
select t.as_kpn(3);
select t.check('invite: revoking works by token', t.code(lv_api.lv_campaign_invite_revoke(t.get('tok'))) = 'ok');
select t.check('invite: a revoked invite lists as revoked', (lv_api.lv_campaign_invite_list(t.id('inv_c')) #>> '{invites,0,state}') = 'revoked');
select t.check('invite: participation rate counts invited people only',
  t.q(format($q$select lv.campaign_member_participation(%L::uuid)::text$q$, t.get('inv_c')))::jsonb = '{"eligible": 1, "participants": 1}'::jsonb);

-- ===== abuse reports and moderation ======================================================================
select t.as_anon();
select t.check('abuse: a signed-out visitor can report a survey', t.code(lv_api.lv_report_abuse(t.get('q1code'), 'Asks for passwords')) = 'ok');
select t.check('abuse: an unknown code answers the same and stores nothing', t.code(lv_api.lv_report_abuse('ZZZZZZ', 'x')) = 'ok'
  and t.q($$select count(*)::text from lv.abuse_reports$$) = '1');
select t.check('abuse: an empty reason is lv_invalid_input', t.code(lv_api.lv_report_abuse(t.get('q1code'), '  ')) = 'lv_invalid_input');
select t.as_pg();
update lv.policy set value = '1'::jsonb where key = 'abuse.reports_per_minute';
select t.as_anon();
select t.check('abuse: reporting is rate-limited', t.code(lv_api.lv_report_abuse(t.get('q1code'), 'again')) = 'lv_rate_limited');
select t.as_kpn(3);
select t.put('blk', (lv_api.lv_quick_survey_create('To block', 'link') #>> '{campaign,campaign_id}'));
select lv_api.lv_campaign_question_add(t.id('blk'), 1, 'yes_no', 'Password?');
select lv_api.lv_campaign_close(t.id('inv_c'));
select t.check('moderation: the survey is live', t.code(lv_api.lv_campaign_activate(t.id('blk'))) = 'ok');
select t.put('blkcode', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('blk'))));
select t.check('moderation: a non-admin cannot block', t.code(lv_api.lv_admin_campaign_block(t.id('blk'), 'x')) = 'lv_forbidden');
select t.as_pg();
select lv.grant_platform_admin(t.id('founder'), null);
select t.as_kpn(1);
select t.check('moderation: a platform admin blocks it with a reason', t.code(lv_api.lv_admin_campaign_block(t.id('blk'), 'Phishing')) = 'ok');
select t.as_anon();
select t.check('moderation: a blocked survey is hidden from guests', t.code(lv_api.lv_guest_campaign_get(t.get('blkcode'))) = 'lv_not_found');
select t.as_kpn(2);
select t.check('moderation: a blocked survey refuses responses',
  t.code(lv_api.lv_submit_response(t.id('blk'), '[]'::jsonb)) = 'lv_closed' and t.code(lv_api.lv_campaign_get(t.id('blk'))) = 'lv_not_found');
select t.as_kpn(3);
select t.check('moderation: the creator still sees it, marked blocked', (lv_api.lv_campaign_get(t.id('blk')) ->> 'blocked') = 'true');
select t.as_pg();
select t.check('moderation: nothing was deleted', t.q(format($q$select count(*)::text from lv.campaign_questions where campaign_id = %L::uuid$q$, t.get('blk'))) = '1');
select t.as_kpn(1);
select t.check('moderation: unblocking restores it', t.code(lv_api.lv_admin_campaign_unblock(t.id('blk'))) = 'ok');
select t.as_anon();
select t.check('moderation: unblocked, it is visible again', t.code(lv_api.lv_guest_campaign_get(t.get('blkcode'))) = 'ok');

-- ===== reserved slugs ====================================================================================
select t.as_pg();
select t.check('reserved: every top-level UI and launch route is reserved',
  t.q($$select count(*)::text from unnest(array['whitelist','waitlist','how-it-works','use-cases','surveys','licenses','brand','__gallery',
         'pricing','discover','billing','reservation','builder','news','studio','signin','me','join','invites','quick',
         'favicon.ico','.well-known','signup','status','support','terms','privacy','about','create','settings']) s
         where not exists (select 1 from lv.reserved_slugs r where r.slug = s)$$) = '0');
select t.check('reserved: no customer name is reserved', t.q($$select count(*)::text from lv.reserved_slugs where slug ~ 'lioncafe|mjcc|jobcorps'$$) = '0');
select t.grant_credit(t.id('member'));
select t.as_kpn(2);
select t.check('reserved: whitelist and how-it-works cannot be claimed',
  t.code(lv_api.lv_hub_create('whitelist', 'W')) = 'lv_invalid_input' and t.code(lv_api.lv_hub_create('how-it-works', 'H')) = 'lv_invalid_input');

-- ===== grants, RLS and error extras ======================================================================
select t.as_pg();
select t.check('grants: no lv_api function is executable by PUBLIC',
  t.q($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'lv_api' and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0)$$) = '0');
select t.check('grants: anon executes exactly the signed-out allow-list',
  t.q($$select coalesce(string_agg(p.proname, ',' order by p.proname), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'lv_api' and has_function_privilege('anon', p.oid, 'execute')$$)
  -- 000020 (track C) adds lv_discover_list, lv_news_get and lv_news_list (public Discover and public news).
  = 'lv_capability_catalog,lv_discover_list,lv_guest_campaign_get,lv_guest_submit,lv_hub_get,lv_hub_pages_get,lv_hub_reservation_status,lv_my_context,lv_news_get,lv_news_list,lv_plan_limits,lv_report_abuse,lv_waitlist_status');
select t.check('grants: no lv table or sequence is reachable by anon or authenticated',
  t.q($$select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'lv' and c.relkind in ('r', 'S', 'v')
           and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select')
                or has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update'))$$) = '0');
select t.check('grants: the API roles have no usage on schema lv',
  not has_schema_privilege('anon', 'lv', 'usage') and not has_schema_privilege('authenticated', 'lv', 'usage'));
select t.check('grants: the service-only functions are not executable by anon or authenticated',
  t.q($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'lv' and p.proname in ('billing_apply_event', 'retention_sweep')
           and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))$$) = '0');
select t.check('grants: service-only functions never live in lv_api',
  t.q($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'lv_api' and (p.proname like '%billing_apply%' or p.proname like '%retention%' or p.proname like '%grant_platform%')$$) = '0');
select t.as_anon();
select t.check('grants: as anon, a signed-in operation raises permission denied',
  t.raises('select lv_api.lv_quick_survey_list()', '42501') and t.raises('select lv_api.lv_waitlist_join()', '42501')
  and t.raises($$select lv_api.lv_hub_create('x-y-z', 'X')$$, '42501') and t.raises('select lv_api.lv_member_list(gen_random_uuid())', '42501'));
select t.check('grants: as anon, every lv_api function outside the allow-list is denied',
  t.q($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'lv_api' and has_function_privilege('anon', p.oid, 'execute')
           and p.proname not in ('lv_my_context', 'lv_hub_get', 'lv_guest_campaign_get', 'lv_guest_submit', 'lv_capability_catalog',
                                 'lv_plan_limits', 'lv_waitlist_status', 'lv_hub_reservation_status', 'lv_hub_pages_get', 'lv_report_abuse',
                                 'lv_discover_list', 'lv_news_get', 'lv_news_list')$$) = '0');
select t.check('grants: signed out, lv_my_context answers lv_unauthenticated as an envelope', t.code(lv_api.lv_my_context()) = 'lv_unauthenticated');
select t.check('grants: as anon, no lv table can be read', t.raises('select count(*) from lv.accounts', '42501')
  and t.raises('select count(*) from lv.entitlements', '42501'));
select t.as_kpn(2);
select t.check('grants: as authenticated, service-only functions are denied',
  t.raises($$select lv.billing_apply_event('stripe', 'evt_x', 'invoice.paid', '{}'::jsonb)$$, '42501')
  and t.raises('select lv.retention_sweep()', '42501'));
select t.check('grants: as authenticated, admin operations refuse a non-admin',
  t.code(lv_api.lv_admin_campaign_block(gen_random_uuid(), 'x')) = 'lv_forbidden'
  and t.code(lv_api.lv_beta_decide(gen_random_uuid(), true)) = 'lv_forbidden');
select t.check('grants: as authenticated, no lv table can be read', t.raises('select count(*) from lv.hub_credits', '42501'));
select t.as_pg();
select t.check('grants: no lv function is executable by anon or authenticated',
  t.q($$select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'lv' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))$$) = '0');
select t.check('rls: every lv table has row level security enabled',
  t.q($$select count(*)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'lv' and c.relkind = 'r' and not c.relrowsecurity$$) = '0');
select t.check('join codes come from the CSPRNG', t.q($$select (prosrc like '%random_bytes%')::text from pg_proc where proname = 'new_join_code'$$) = 'true');

rollback;
