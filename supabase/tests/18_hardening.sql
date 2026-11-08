-- 18: HARDENING AND API GAPS (000018; compliance LC-10, LC-12, LC-13, NEW-05; build plan track A gaps).
select set_config('t.file', '18_hardening', false);
begin;

select t.trust_test_issuer();

-- ===== LC-12: only LunchVoice sessions are identities ====================================================
-- Exactly the claims supabase/functions/_shared/session.ts issueSession() signs (picture omitted when absent).
select t.as_claims(jsonb_build_object(
  'role', 'authenticated', 'email', 'live@example.invalid', 'email_verified', true, 'name', 'Live Session',
  'session_kind', 'lunchvoice', 'iss', t.issuer(), 'sub', t.sub(1801)::text, 'aud', 'authenticated',
  'iat', floor(extract(epoch from now()))::bigint, 'exp', floor(extract(epoch from now()))::bigint + 3600));
select t.check('LC-12: a token shaped exactly like the session function''s output signs in',
  t.code(lv_api.lv_my_context()) = 'ok'
  and t.q($$select lv.caller_identity() ->> 'subject'$$) = t.sub(1801)::text);
select t.as_claims(jsonb_build_object('role', 'authenticated', 'session_kind', 'lunchvoice', 'iss', t.issuer(),
  'sub', t.sub(1801)::text, 'aud', jsonb_build_array('authenticated')));
select t.check('LC-12: an audience array holding authenticated is accepted', t.q($$select lv.current_account_id()::text$$) is not null);
-- A raw KpnIdentity ID token (audience = the OAuth client id, nonce, no session_kind) from the trusted issuer.
select t.as_claims(jsonb_build_object('iss', t.issuer(), 'sub', t.sub(1801)::text, 'aud', 'lunchvoice-web',
  'nonce', 'nonce-that-is-long-enough-123', 'email', 'live@example.invalid', 'email_verified', true));
select t.check('LC-12: a raw KpnIdentity ID token is refused', t.q($$select lv.caller_identity()::text$$) is null
  and t.code(lv_api.lv_my_context()) = 'lv_unauthenticated');
select t.as_claims(jsonb_build_object('role', 'authenticated', 'iss', t.issuer(), 'sub', t.sub(1801)::text, 'aud', 'authenticated'));
select t.check('LC-12: a token without session_kind is refused', t.q($$select lv.caller_identity()::text$$) is null);
select t.as_claims(jsonb_build_object('role', 'authenticated', 'session_kind', 'kpnrelay', 'iss', t.issuer(), 'sub', t.sub(1801)::text, 'aud', 'authenticated'));
select t.check('LC-12: a session minted for another KpnSolute app is refused', t.q($$select lv.caller_identity()::text$$) is null);
select t.as_claims(jsonb_build_object('role', 'authenticated', 'session_kind', 'lunchvoice', 'iss', t.issuer(), 'sub', t.sub(1801)::text, 'aud', 'lunchvoice'));
select t.check('LC-12: another audience is refused', t.q($$select lv.caller_identity()::text$$) is null);
select t.as_claims(jsonb_build_object('role', 'authenticated', 'session_kind', 'lunchvoice', 'iss', t.issuer(), 'sub', t.sub(1801)::text));
select t.check('LC-12: a missing audience is refused', t.q($$select lv.caller_identity()::text$$) is null);
select t.as_claims(jsonb_build_object('role', 'authenticated', 'session_kind', 'lunchvoice', 'iss', 'https://other.invalid/auth/v1',
  'sub', t.sub(1801)::text, 'aud', 'authenticated'));
select t.check('LC-12: the issuer allow-list still applies', t.q($$select lv.caller_identity()::text$$) is null);

-- ===== LC-13: single-use ID-token exchanges ==============================================================
select t.as_pg();
select t.check('LC-13: the first exchange of a key is accepted',
  lv.session_exchange_consume(repeat('a', 64), now() + interval '10 minutes'));
select t.check('LC-13: a replayed key is refused', not lv.session_exchange_consume(repeat('a', 64), now() + interval '10 minutes'));
select t.check('LC-13: a malformed key raises', t.raises($$select lv.session_exchange_consume('not-a-hash', now())$$));
select t.check('LC-13: only service_role may record exchanges',
  has_function_privilege('service_role', 'lv.session_exchange_consume(text, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'lv.session_exchange_consume(text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'lv.session_exchange_consume(text, timestamptz)', 'execute'));
select t.check('LC-13: nothing but a hash and times is stored',
  (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'lv' and table_name = 'session_exchanges') = 'key_hash,expires_at,created_at');

-- ===== people and Hubs ===================================================================================
select t.as_kpn(1, null, true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, null, true, 'Coach'); select lv_api.lv_my_context();
select t.put('coach', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(3, null, true, 'Runner'); select lv_api.lv_my_context();
select t.put('runner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(4, null, true, 'Stranger'); select lv_api.lv_my_context();
select t.as_pg();
-- One credit at a time: credits created in one transaction share created_at, so the order would be arbitrary.
select t.grant_credit(t.id('owner'), 'team');
select t.as_kpn(1);
select t.put('team', (lv_api.lv_hub_create('track-a-team', 'Track A Team') ->> 'hub_id'));
select t.as_pg();
select t.grant_credit(t.id('owner'), 'starter');
select t.as_kpn(1);
select t.put('starter', (lv_api.lv_hub_create('track-a-starter', 'Track A Starter') ->> 'hub_id'));
select t.put('code_t', (lv_api.lv_invite_create(t.id('team')) ->> 'code'));
select t.put('code_s', (lv_api.lv_invite_create(t.id('starter')) ->> 'code'));
select t.as_kpn(2); select lv_api.lv_invite_redeem(t.get('code_t')); select lv_api.lv_invite_redeem(t.get('code_s'));
select t.as_kpn(3); select lv_api.lv_invite_redeem(t.get('code_t'));
select t.as_pg();
select t.put('m_coach', t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('team'), t.get('coach'))));
select t.put('m_runner', t.q(format($q$select id::text from lv.hub_memberships where hub_id = %L::uuid and account_id = %L::uuid$q$, t.get('team'), t.get('runner'))));
select t.as_kpn(1);
select t.put('r_coach', (lv_api.lv_role_create(t.id('team'), 'Coaches', 'star', array['campaign.manage']) #>> '{role,role_id}'));
select t.put('r_plain', (lv_api.lv_role_create(t.id('team'), 'Volunteers', 'heart', array[]::text[]) #>> '{role,role_id}'));
select t.put('r_other', (lv_api.lv_role_create(t.id('starter'), 'Elsewhere', 'star', array[]::text[]) #>> '{role,role_id}'));
select lv_api.lv_member_role_assign(t.id('m_coach'), t.id('r_coach'));

-- ===== Campaign description ==============================================================================
select t.put('c1', (lv_api.lv_campaign_create(t.id('team'), 'Season survey', 'survey', 'anonymous', '  What should we run next?  ') ->> 'campaign_id'));
select t.check('description: lv_campaign_create stores it (trimmed) and lv_campaign_get returns it',
  (lv_api.lv_campaign_get(t.id('c1')) #>> '{campaign,description}') = 'What should we run next?');
select t.check('description: lv_campaign_list returns it',
  (select e->>'description' from jsonb_array_elements(lv_api.lv_campaign_list(t.id('team')) -> 'campaigns') e where e->>'campaign_id' = t.get('c1')) = 'What should we run next?');
-- (A write and a read of a STABLE function in one statement share a snapshot, so they are separate statements.)
select t.put('u1', lv_api.lv_campaign_update(t.id('c1'), p_description => 'Pick the next race.')::text);
select t.put('u2', lv_api.lv_campaign_update(t.id('c1'), p_title => 'Season survey 2')::text);
select t.check('description: lv_campaign_update changes it and NULL leaves it',
  t.code(t.get('u1')::jsonb) = 'ok' and t.code(t.get('u2')::jsonb) = 'ok'
  and (lv_api.lv_campaign_get(t.id('c1')) #>> '{campaign,description}') = 'Pick the next race.');
select t.put('u3', lv_api.lv_campaign_update(t.id('c1'), p_description => '')::text);
select t.check('description: an empty string clears it',
  t.code(t.get('u3')::jsonb) = 'ok'
  and (lv_api.lv_campaign_get(t.id('c1')) #> '{campaign,description}') = 'null'::jsonb);
select t.check('description: more than 2000 characters is lv_invalid_input on create and update',
  t.code(lv_api.lv_campaign_create(t.id('team'), 'Long', 'poll', 'anonymous', repeat('x', 2001))) = 'lv_invalid_input'
  and t.code(lv_api.lv_campaign_update(t.id('c1'), p_description => repeat('x', 2001))) = 'lv_invalid_input');
select t.check('description: the old four-argument create still works', t.code(lv_api.lv_campaign_create(t.id('team'), 'Plain', 'poll')) = 'ok');
select lv_api.lv_campaign_update(t.id('c1'), p_description => 'Pick the next race.');

-- ===== server-side option validation =====================================================================
select t.check('options: one option is lv_invalid_input',
  t.code(lv_api.lv_campaign_question_add(t.id('c1'), 1, 'single_choice', 'Pick', '{"options":["a"]}'::jsonb)) = 'lv_invalid_input');
select t.check('options: eleven options are lv_invalid_input',
  t.code(lv_api.lv_campaign_question_add(t.id('c1'), 1, 'single_choice', 'Pick',
    (select jsonb_build_object('options', jsonb_agg('o' || g)) from generate_series(1, 11) g))) = 'lv_invalid_input');
select t.check('options: ten options are fine',
  t.code(lv_api.lv_campaign_question_add(t.id('c1'), 9, 'single_choice', 'Ten',
    (select jsonb_build_object('options', jsonb_agg('o' || g), 'optional', true) from generate_series(1, 10) g))) = 'ok');
select t.check('options: duplicates (ignoring case and spaces) are lv_invalid_input',
  t.code(lv_api.lv_campaign_question_add(t.id('c1'), 1, 'multi_choice', 'Pick', '{"options":["Tue"," tue "]}'::jsonb)) = 'lv_invalid_input');
select t.check('options: an empty option is lv_invalid_input',
  t.code(lv_api.lv_campaign_question_add(t.id('c1'), 1, 'single_choice', 'Pick', '{"options":["a","  "]}'::jsonb)) = 'lv_invalid_input');
select t.check('options: a non-text option is lv_invalid_input',
  t.code(lv_api.lv_campaign_question_add(t.id('c1'), 1, 'single_choice', 'Pick', '{"options":["a",2]}'::jsonb)) = 'lv_invalid_input');
select t.check('options: a choice question without options is lv_invalid_input',
  t.code(lv_api.lv_campaign_question_add(t.id('c1'), 1, 'single_choice', 'Pick')) = 'lv_invalid_input');
select t.check('options: max above the option count, zero or fractional is lv_invalid_input',
  t.code(lv_api.lv_campaign_question_add(t.id('c1'), 1, 'multi_choice', 'Pick', '{"options":["a","b"],"max":3}'::jsonb)) = 'lv_invalid_input'
  and t.code(lv_api.lv_campaign_question_add(t.id('c1'), 1, 'multi_choice', 'Pick', '{"options":["a","b"],"max":0}'::jsonb)) = 'lv_invalid_input'
  and t.code(lv_api.lv_campaign_question_add(t.id('c1'), 1, 'multi_choice', 'Pick', '{"options":["a","b"],"max":1.5}'::jsonb)) = 'lv_invalid_input');
select t.check('options: the error explains itself',
  (lv_api.lv_campaign_question_add(t.id('c1'), 1, 'single_choice', 'Pick', '{"options":["a","A"]}'::jsonb) #>> '{error,message}') = 'Options must all be different.');
select t.put('q_choice', (lv_api.lv_campaign_question_add(t.id('c1'), 1, 'multi_choice', 'Pick two', '{"options":["Tue","Thu","Sat"],"max":2}'::jsonb) ->> 'question_id'));
select t.check('options: a valid choice question is saved', t.get('q_choice') is not null);
select t.check('options: updating to invalid options is refused and changes nothing',
  t.code(lv_api.lv_campaign_question_update(t.id('q_choice'), p_config => '{"options":["Tue"]}'::jsonb)) = 'lv_invalid_input'
  and t.q(format($q$select jsonb_array_length(config->'options')::text from lv.campaign_questions where id = %L::uuid$q$, t.get('q_choice'))) = '3');
select t.check('options: a prompt-only update of a valid question works',
  t.code(lv_api.lv_campaign_question_update(t.id('q_choice'), p_prompt => 'Pick up to two')) = 'ok');
select t.put('q_rate', (lv_api.lv_campaign_question_add(t.id('c1'), 2, 'rating', 'How was it?') ->> 'question_id'));
select t.check('options: non-choice questions need no options', t.get('q_rate') is not null);
select t.check('options: changing a rating to a choice without options is refused',
  t.code(lv_api.lv_campaign_question_update(t.id('q_rate'), p_kind => 'single_choice')) = 'lv_invalid_input');

-- ===== Team role targeting ===============================================================================
select t.check('roles: a Starter Hub cannot target roles (lv_entitlement_required, team_hub)',
  (lv_api.lv_campaign_set_audience_roles((lv_api.lv_campaign_create(t.id('starter'), 'S', 'poll') ->> 'campaign_id')::uuid,
     array[t.id('r_other')]) #>> '{error,product}') = 'team_hub');
select t.check('roles: a role of another Hub is lv_invalid_input',
  t.code(lv_api.lv_campaign_set_audience_roles(t.id('c1'), array[t.id('r_other')])) = 'lv_invalid_input');
select t.check('roles: the manager sees the option and the Hub''s roles before choosing',
  (lv_api.lv_campaign_get(t.id('c1')) #>> '{audience,scope}') = 'all_members'
  and (lv_api.lv_campaign_get(t.id('c1')) #>> '{audience,role_targeting}') = 'true'
  and jsonb_array_length(lv_api.lv_campaign_get(t.id('c1')) #> '{audience,available_roles}') = 3);
select t.put('a1', lv_api.lv_campaign_set_audience_roles(t.id('c1'), array[t.id('r_coach')])::text);
select t.check('roles: a Team Hub targets one role',
  (t.get('a1')::jsonb #>> '{audience,scope}') = 'roles'
  and (lv_api.lv_campaign_get(t.id('c1')) #>> '{audience,roles,0,name}') = 'Coaches');
select t.check('roles: an empty list goes back to every member',
  (lv_api.lv_campaign_set_audience_roles(t.id('c1'), array[]::uuid[]) #>> '{audience,scope}') = 'all_members');
select lv_api.lv_campaign_set_audience_roles(t.id('c1'), array[t.id('r_coach')]);
select lv_api.lv_campaign_set_participation(t.id('c1'), 'members_and_guests');
select t.check('roles: the gate is open for a Team Hub', (lv_api.lv_campaign_get(t.id('c1')) #>> '{gate,ok}') = 'true');
select t.check('roles: publishing works', t.code(lv_api.lv_campaign_activate(t.id('c1'))) = 'ok');
select t.check('roles: the published version records the targeted roles and not the link token',
  t.q(format($q$select (settings -> 'audience_roles')::text from lv.campaign_versions where campaign_id = %L::uuid$q$, t.get('c1')))::jsonb
    = jsonb_build_array(t.get('r_coach'))
  and t.q(format($q$select (settings ? 'link_token')::text from lv.campaign_versions where campaign_id = %L::uuid$q$, t.get('c1'))) = 'false');
select t.check('roles: the audience is locked after publishing',
  t.code(lv_api.lv_campaign_set_audience_roles(t.id('c1'), null)) = 'lv_locked');
select t.as_kpn(3);
select t.check('roles: a member without the role does not see it',
  t.code(lv_api.lv_campaign_get(t.id('c1'))) = 'lv_not_found'
  and not exists (select 1 from jsonb_array_elements(lv_api.lv_campaign_list(t.id('team')) -> 'campaigns') e where e->>'campaign_id' = t.get('c1')));
select t.check('roles: a member without the role cannot answer',
  t.code(lv_api.lv_submit_response(t.id('c1'), format('[{"question_id":"%s","value":["Tue"]},{"question_id":"%s","value":4}]', t.get('q_choice'), t.get('q_rate'))::jsonb)) = 'lv_forbidden');
select t.as_kpn(2);
select t.check('roles: a member holding the role sees it and answers',
  (lv_api.lv_campaign_get(t.id('c1')) ->> 'can_respond') = 'true'
  and t.code(lv_api.lv_submit_response(t.id('c1'), format('[{"question_id":"%s","value":["Tue"]},{"question_id":"%s","value":4}]', t.get('q_choice'), t.get('q_rate'))::jsonb)) = 'ok');
select t.as_pg();
select t.check('roles: eligibility and the threshold count only members holding the role',
  t.q(format($q$select lv.campaign_member_participation(%L::uuid)::text$q$, t.get('c1')))::jsonb = '{"eligible": 1, "participants": 1}'::jsonb
  and t.q(format($q$select lv.survey_threshold_met(%L::uuid, '{"op":"gte","value":1}')::text$q$, t.get('c1'))) = 'true');
select t.put('c1_code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('c1'))));
select t.as_anon();
select t.check('roles: guests are unaffected',
  t.code(lv_api.lv_guest_submit(t.get('c1_code'), repeat('g', 40),
    format('[{"question_id":"%s","value":["Sat"]},{"question_id":"%s","value":5}]', t.get('q_choice'), t.get('q_rate'))::jsonb)) = 'ok');
select t.as_pg();
select t.check('roles: a guest never counts toward eligibility or participation',
  t.q(format($q$select lv.campaign_member_participation(%L::uuid)::text$q$, t.get('c1')))::jsonb = '{"eligible": 1, "participants": 1}'::jsonb);
-- A plan without role targeting (e.g. after a downgrade) and a targeted role that was deleted both block publishing.
select t.as_kpn(1);
select t.put('c2', (lv_api.lv_campaign_create(t.id('team'), 'Volunteers only', 'poll') ->> 'campaign_id'));
select lv_api.lv_campaign_question_add(t.id('c2'), 1, 'yes_no', 'Can you help?');
select lv_api.lv_campaign_set_audience_roles(t.id('c2'), array[t.id('r_plain')]);
select t.set_limit('campaigns.role_targeting', 'false');
select t.check('roles: without the plan feature the gate says role_targeting_unavailable',
  (lv_api.lv_campaign_get(t.id('c2')) #> '{gate,reasons}') ? 'role_targeting_unavailable'
  and t.code(lv_api.lv_campaign_activate(t.id('c2'))) = 'lv_gate_blocked');
select t.check('roles: clearing the audience still works without the feature',
  (lv_api.lv_campaign_set_audience_roles(t.id('c2'), null) #>> '{audience,scope}') = 'all_members');
select t.set_limit('campaigns.role_targeting', 'true');
select lv_api.lv_campaign_set_audience_roles(t.id('c2'), array[t.id('r_plain')]);
select lv_api.lv_role_delete(t.id('r_plain'));
select t.check('roles: deleting every targeted role never widens the audience (audience_empty)',
  (lv_api.lv_campaign_get(t.id('c2')) #>> '{audience,scope}') = 'roles'
  and (lv_api.lv_campaign_get(t.id('c2')) #> '{gate,reasons}') ? 'audience_empty');

-- ===== plan limits for campaign managers =================================================================
select t.as_kpn(2);
select t.check('limits: a campaign manager who is not the Owner reads limits and usage',
  t.code(lv_api.lv_hub_limits(t.id('team'))) = 'ok'
  and (lv_api.lv_hub_limits(t.id('team')) #>> '{plan,family}') = 'team'
  and (lv_api.lv_hub_limits(t.id('team')) #>> '{limits,surveys.max_active}') = '5'
  and (lv_api.lv_hub_limits(t.id('team')) #>> '{usage,active_surveys}') = '1');
select t.check('limits: no billing data (product, dates, reservation, billing state)',
  not ((lv_api.lv_hub_limits(t.id('team')) -> 'plan') ?| array['product', 'starts_at', 'ends_at', 'entitlement_id'])
  and not (lv_api.lv_hub_limits(t.id('team')) ?| array['reservation', 'billing_ready']));
select t.check('limits: billing summary stays Owner / billing.view only', t.code(lv_api.lv_billing_summary(t.id('team'))) = 'lv_forbidden');
select t.check('limits: a member without campaign.manage is lv_forbidden', t.code(lv_api.lv_hub_limits(t.id('starter'))) = 'lv_forbidden');
select t.as_kpn(4);
select t.check('limits: a non-member is lv_not_found', t.code(lv_api.lv_hub_limits(t.id('team'))) = 'lv_not_found');

-- ===== Quick Survey access while draft ===================================================================
select t.as_kpn(3);
select t.put('qs', (lv_api.lv_quick_survey_create('Picnic', 'link', 'anonymous', true) #>> '{campaign,campaign_id}'));
select t.check('access: link to invite while draft turns guests off',
  t.code(lv_api.lv_campaign_update(t.id('qs'), p_access => 'invite')) = 'ok'
  and t.q(format($q$select access || '|' || audience from lv.campaigns where id = %L::uuid$q$, t.get('qs'))) = 'invite|members');
select t.check('access: invite back to link keeps guests off until switched on',
  t.code(lv_api.lv_campaign_update(t.id('qs'), p_access => 'link')) = 'ok'
  and t.q(format($q$select access || '|' || audience from lv.campaigns where id = %L::uuid$q$, t.get('qs'))) = 'link|members'
  and t.code(lv_api.lv_campaign_set_participation(t.id('qs'), 'members_and_guests')) = 'ok');
select t.check('access: an unknown access is lv_invalid_input', t.code(lv_api.lv_campaign_update(t.id('qs'), p_access => 'public')) = 'lv_invalid_input');
select t.put('u4', lv_api.lv_campaign_update(t.id('qs'), p_description => 'Saturday?')::text);
select t.check('access: the Quick Survey list shows the description',
  t.code(t.get('u4')::jsonb) = 'ok' and (lv_api.lv_quick_survey_list() #>> '{surveys,0,description}') = 'Saturday?');
select t.as_kpn(4);
select t.check('access: someone else cannot change it', t.code(lv_api.lv_campaign_update(t.id('qs'), p_access => 'invite')) in ('lv_not_found', 'lv_forbidden'));
select t.as_kpn(1);
select t.check('access: a Hub Campaign cannot change access, and nothing else in the call is applied',
  t.code(lv_api.lv_campaign_update(t.id('c2'), p_title => 'Renamed', p_access => 'link')) = 'lv_invalid_input'
  and t.q(format($q$select title || '|' || access from lv.campaigns where id = %L::uuid$q$, t.get('c2'))) = 'Volunteers only|members');
select t.as_kpn(3);
select lv_api.lv_campaign_question_add(t.id('qs'), 1, 'single_choice', 'Which day?', '{"options":["Sat","Sun"]}'::jsonb);
select t.check('options: Quick Surveys validate options too',
  t.code(lv_api.lv_campaign_question_add(t.id('qs'), 2, 'single_choice', 'Again?', '{"options":["Sat","sat"]}'::jsonb)) = 'lv_invalid_input');
select t.check('access: publishing works', t.code(lv_api.lv_campaign_activate(t.id('qs'))) = 'ok');
select t.check('access: access is locked after publishing', t.code(lv_api.lv_campaign_update(t.id('qs'), p_access => 'invite')) = 'lv_locked');
select t.check('roles: Quick Surveys never target roles', t.code(lv_api.lv_campaign_set_audience_roles(t.id('qs'), null)) = 'lv_not_available');

-- ===== LC-10: link tokens and join-code rate limits ======================================================
select t.put('qs_code', t.q(format($q$select join_code from lv.campaigns where id = %L::uuid$q$, t.get('qs'))));
select t.put('qs_token', t.q(format($q$select link_token from lv.campaigns where id = %L::uuid$q$, t.get('qs'))));
select t.check('LC-10: every Campaign has a distinct 128-bit link token',
  t.get('qs_token') ~ '^[0-9a-f]{32}$'
  and t.q($$select (count(*) = count(distinct link_token))::text from lv.campaigns$$) = 'true'
  and t.q($$select count(*)::text from lv.campaigns where link_token is null$$) = '0');
select t.check('LC-10: the manager gets the link token; it is not the join code',
  (lv_api.lv_campaign_get(t.id('qs')) ->> 'link_token') = t.get('qs_token')
  and (lv_api.lv_quick_survey_list() #>> '{surveys,0,link_token}') = t.get('qs_token'));
select t.as_kpn(4);
select t.check('LC-10: a respondent never gets the link token',
  not (lv_api.lv_campaign_get(t.id('qs')) ? 'link_token') and not (lv_api.lv_guest_campaign_get(t.get('qs_code')) -> 'campaign' ? 'link_token'));
select t.as_anon();
select set_config('request.headers', '{"cf-connecting-ip":"203.0.113.7"}', false);
select t.check('LC-10: the link token opens the survey signed out, with its description and typed code',
  (lv_api.lv_guest_campaign_get(t.get('qs_token')) #>> '{campaign,campaign_id}') = t.get('qs')
  and (lv_api.lv_guest_campaign_get(upper(t.get('qs_token'))) #>> '{campaign,description}') = 'Saturday?'
  and (lv_api.lv_guest_campaign_get(t.get('qs_token')) ->> 'join_code') = t.get('qs_code'));
select t.check('LC-10: a guest can answer through the link token',
  t.code(lv_api.lv_guest_submit(t.get('qs_token'), repeat('t', 40),
    format('[{"question_id":"%s","value":"Sat"}]', t.q(format($q$select id::text from lv.campaign_questions where campaign_id = %L::uuid$q$, t.get('qs'))))::jsonb)) = 'ok');
select t.check('LC-10: unknown codes still answer lv_not_found', t.code(lv_api.lv_guest_campaign_get('ZZZZZ1')) = 'lv_not_found');
select lv_api.lv_guest_campaign_get('ZZZZZ' || g) from generate_series(2, 8) g;
select t.check('LC-10: a failed guest submit counts as a miss too',
  t.code(lv_api.lv_guest_submit('ZZZZZ9', repeat('t', 40), '[]'::jsonb)) = 'lv_not_found'
  and t.code(lv_api.lv_guest_campaign_get('ZZZZZA')) = 'lv_not_found');
select t.check('LC-10: after 10 misses in a minute even a valid code is lv_rate_limited',
  t.code(lv_api.lv_guest_campaign_get(t.get('qs_code'))) = 'lv_rate_limited'
  and t.code(lv_api.lv_guest_submit(t.get('qs_code'), repeat('u', 40), '[]'::jsonb)) = 'lv_rate_limited');
select t.check('LC-10: the link token is never rate limited', t.code(lv_api.lv_guest_campaign_get(t.get('qs_token'))) = 'ok');
select set_config('request.headers', '{"cf-connecting-ip":"198.51.100.9"}', false);
select t.check('LC-10: another client is not limited by the first one', t.code(lv_api.lv_guest_campaign_get(t.get('qs_code'))) = 'ok');
select t.as_pg();
select t.check('LC-10: misses store neither the code nor the IP',
  (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
    where table_schema = 'lv' and table_name = 'join_code_misses') = 'id,caller_key,signed_in,at'
  and t.q($$select count(*)::text from lv.join_code_misses where caller_key like '%203.0.113.7%' or caller_key not like 'ip:%'$$) = '0');
select t.as_kpn(4);
select t.check('LC-10: a signed-in caller has its own allowance', t.code(lv_api.lv_guest_campaign_get(t.get('qs_code'))) = 'ok');
select t.as_pg();
update lv.policy set value = '10'::jsonb where key = 'joincode.global_misses_per_minute';
select t.as_anon();
select set_config('request.headers', '{"x-forwarded-for":"192.0.2.1, 10.0.0.1"}', false);
select t.check('LC-10: the global cap stops many signed-out clients together', t.code(lv_api.lv_guest_campaign_get(t.get('qs_code'))) = 'lv_rate_limited');
select t.as_kpn(4);
select t.check('LC-10: the global cap does not lock signed-in people out', t.code(lv_api.lv_guest_campaign_get(t.get('qs_code'))) = 'ok');
select t.as_pg();
update lv.policy set value = '300'::jsonb where key = 'joincode.global_misses_per_minute';
select set_config('request.headers', '', false);

-- ===== NEW-05: Campaign invite tokens are stored hashed ==================================================
select t.as_kpn(3);
select t.put('inv', (lv_api.lv_quick_survey_create('Invite only', 'invite') #>> '{campaign,campaign_id}'));
select lv_api.lv_campaign_question_add(t.id('inv'), 1, 'yes_no', 'Come?');
select lv_api.lv_campaign_activate(t.id('inv'));
select t.put('inv_new', (lv_api.lv_campaign_invite_create(t.id('inv'), 5) ->> 'invite')::text);
select t.put('tok', t.get('inv_new')::jsonb ->> 'token');
select t.check('NEW-05: the token is shown once at creation, with its prefix',
  t.get('tok') ~ '^[0-9A-F]{24}$' and (t.get('inv_new')::jsonb ->> 'shown_once') = 'true'
  and (t.get('inv_new')::jsonb ->> 'prefix') = left(t.get('tok'), 6));
select t.check('NEW-05: the list never shows the token',
  not ((lv_api.lv_campaign_invite_list(t.id('inv')) #> '{invites,0}') ? 'token')
  and (lv_api.lv_campaign_invite_list(t.id('inv')) #>> '{invites,0,prefix}') = left(t.get('tok'), 6));
select t.as_pg();
select t.check('NEW-05: only the SHA-256 is stored; there is no token column',
  t.q(format($q$select (token_hash = lv.invite_hash(%L))::text from lv.campaign_invites where token_prefix = %L$q$, t.get('tok'), left(t.get('tok'), 6))) = 'true'
  and not exists (select 1 from information_schema.columns where table_schema = 'lv' and table_name = 'campaign_invites' and column_name = 'token'));
select t.as_kpn(4);
select t.check('NEW-05: redeeming by token works (any case)',
  (lv_api.lv_campaign_invite_redeem(lower(t.get('tok'))) ->> 'campaign_id') = t.get('inv'));
select t.check('NEW-05: a prefix alone is not a token', t.code(lv_api.lv_campaign_invite_redeem(left(t.get('tok'), 6))) = 'lv_invalid_code');
select t.as_kpn(3);
select t.put('rv', lv_api.lv_campaign_invite_revoke_by_id((t.get('inv_new')::jsonb ->> 'invite_id')::uuid)::text);
select t.check('NEW-05: revoking by id works for the manager',
  t.code(t.get('rv')::jsonb) = 'ok'
  and (lv_api.lv_campaign_invite_list(t.id('inv')) #>> '{invites,0,state}') = 'revoked');
select t.as_kpn(2);
select t.check('NEW-05: a revoked invite is lv_invalid_code', t.code(lv_api.lv_campaign_invite_redeem(t.get('tok'))) = 'lv_invalid_code');
select t.check('NEW-05: someone else cannot revoke by id',
  t.code(lv_api.lv_campaign_invite_revoke_by_id((t.get('inv_new')::jsonb ->> 'invite_id')::uuid)) = 'lv_not_found');
select t.as_kpn(3);
select t.put('tok2', (lv_api.lv_campaign_invite_create(t.id('inv')) #>> '{invite,token}'));
select t.check('NEW-05: revoking by token still works', t.code(lv_api.lv_campaign_invite_revoke(t.get('tok2'))) = 'ok');

-- ===== owner transfer acceptance =========================================================================
select t.as_kpn(1);
select t.put('o1', lv_api.lv_owner_transfer(t.id('team'), t.id('m_coach'), 'track-a-team')::text);
select t.check('owner: a transfer is a pending offer',
  t.code(t.get('o1')::jsonb) = 'ok' and (t.get('o1')::jsonb ->> 'pending') = 'true'
  and (t.get('o1')::jsonb #>> '{offer,state}') = 'pending');
select t.as_pg();
select t.check('owner: nothing moves before acceptance (owner and Owner role unchanged)',
  t.q(format($q$select (owner_account_id = %L::uuid)::text from lv.hubs where id = %L::uuid$q$, t.get('owner'), t.get('team'))) = 'true'
  and t.q(format($q$select count(*)::text from lv.membership_roles mr join lv.roles r on r.id = mr.role_id
                    where r.hub_id = %L::uuid and r.is_owner and mr.membership_id = %L::uuid$q$, t.get('team'), t.get('m_coach'))) = '0');
select t.as_kpn(1);
select t.check('owner: the Owner sees the pending offer',
  (lv_api.lv_owner_transfer_status(t.id('team')) #>> '{offer,offer_id}') = (t.get('o1')::jsonb #>> '{offer,offer_id}'));
select t.check('owner: the Owner cannot accept their own offer',
  t.code(lv_api.lv_owner_transfer_accept((t.get('o1')::jsonb #>> '{offer,offer_id}')::uuid)) = 'lv_not_found');
select t.as_kpn(3);
select t.check('owner: another member cannot accept it',
  t.code(lv_api.lv_owner_transfer_accept((t.get('o1')::jsonb #>> '{offer,offer_id}')::uuid)) = 'lv_not_found'
  and t.code(lv_api.lv_owner_transfer_status(t.id('team'))) = 'lv_forbidden');
select t.as_kpn(2);
select t.check('owner: the receiving member sees the offer in lv_my_context',
  (lv_api.lv_my_context() #>> '{owner_transfer_offers,0,offer_id}') = (t.get('o1')::jsonb #>> '{offer,offer_id}')
  and (lv_api.lv_my_context() #>> '{owner_transfer_offers,0,hub_slug}') = 'track-a-team');
select t.check('owner: declining changes nothing and closes the offer',
  (lv_api.lv_owner_transfer_decline((t.get('o1')::jsonb #>> '{offer,offer_id}')::uuid) ->> 'accepted') = 'false'
  and jsonb_array_length(lv_api.lv_my_context() -> 'owner_transfer_offers') = 0
  and t.code(lv_api.lv_owner_transfer_accept((t.get('o1')::jsonb #>> '{offer,offer_id}')::uuid)) = 'lv_lifecycle_invalid');
select t.as_kpn(1);
select t.put('o2', (lv_api.lv_owner_transfer(t.id('team'), t.id('m_coach'), 'track-a-team') #>> '{offer,offer_id}'));
select t.put('o3', (lv_api.lv_owner_transfer(t.id('team'), t.id('m_runner'), 'track-a-team') #>> '{offer,offer_id}'));
select t.check('owner: a new offer replaces the pending one',
  t.q(format($q$select status from lv.owner_transfer_offers where id = %L::uuid$q$, t.get('o2'))) = 'cancelled'
  and t.q(format($q$select count(*)::text from lv.owner_transfer_offers where hub_id = %L::uuid and status = 'pending'$q$, t.get('team'))) = '1');
select t.check('owner: the Owner cancels an offer', (lv_api.lv_owner_transfer_cancel(t.id('team')) ->> 'cancelled') = 'true');
select t.as_kpn(3);
select t.check('owner: a cancelled offer cannot be accepted', t.code(lv_api.lv_owner_transfer_accept(t.id('o3'))) = 'lv_lifecycle_invalid');
select t.as_kpn(1);
select t.put('o4', (lv_api.lv_owner_transfer(t.id('team'), t.id('m_runner'), 'track-a-team') #>> '{offer,offer_id}'));
select t.as_pg();
update lv.owner_transfer_offers set expires_at = now() - interval '1 second' where id = t.id('o4');
select t.as_kpn(3);
select t.check('owner: an expired offer cannot be accepted', t.code(lv_api.lv_owner_transfer_accept(t.id('o4'))) = 'lv_lifecycle_invalid');
select t.as_kpn(1);
select t.put('o5', (lv_api.lv_owner_transfer(t.id('team'), t.id('m_runner'), 'track-a-team') #>> '{offer,offer_id}'));
select t.as_pg();
update lv.hub_memberships set status = 'pending' where id = t.id('m_runner');
select t.as_kpn(3);
select t.check('owner: a member who is no longer accepted cannot accept', t.code(lv_api.lv_owner_transfer_accept(t.id('o5'))) = 'lv_not_accepted');
select t.as_pg();
update lv.hub_memberships set status = 'accepted' where id = t.id('m_runner');
select t.as_kpn(1);
select t.put('o6', (lv_api.lv_owner_transfer(t.id('team'), t.id('m_coach'), 'track-a-team') #>> '{offer,offer_id}'));
select t.as_kpn(2);
select t.check('owner: the receiving member accepts', (lv_api.lv_owner_transfer_accept(t.id('o6')) ->> 'accepted') = 'true');
select t.as_pg();
select t.check('owner: on acceptance the owner and the Owner role move together, exactly one Owner',
  t.q(format($q$select (owner_account_id = %L::uuid)::text from lv.hubs where id = %L::uuid$q$, t.get('coach'), t.get('team'))) = 'true'
  and t.q(format($q$select count(*)::text from lv.membership_roles mr join lv.roles r on r.id = mr.role_id where r.hub_id = %L::uuid and r.is_owner$q$, t.get('team'))) = '1'
  and t.q(format($q$select count(*)::text from lv.membership_roles mr join lv.roles r on r.id = mr.role_id
                    where r.hub_id = %L::uuid and r.is_owner and mr.membership_id = %L::uuid$q$, t.get('team'), t.get('m_coach'))) = '1');
select t.check('owner: an accepted offer cannot be used again', t.q(format($q$select status from lv.owner_transfer_offers where id = %L::uuid$q$, t.get('o6'))) = 'accepted');
select t.as_kpn(1);
select t.check('owner: the former Owner can no longer offer the Hub', t.code(lv_api.lv_owner_transfer(t.id('team'), t.id('m_runner'), 'track-a-team')) = 'lv_forbidden');
select t.as_kpn(2);
select t.check('owner: the stale offer of the former Owner is gone',
  t.code(lv_api.lv_owner_transfer_accept(t.id('o6'))) = 'lv_lifecycle_invalid');

-- ===== catalogue =========================================================================================
select t.as_pg();
-- (Later migrations may add anon functions of their own; 000018 adds none and keeps the guest entry points.)
select t.check('catalogue: 000018 adds nothing to the anon allow-list and keeps the guest entry points',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'lv_api' and has_function_privilege('anon', p.oid, 'execute')
                 and p.proname in ('lv_campaign_create', 'lv_campaign_update', 'lv_campaign_set_audience_roles',
                   'lv_campaign_invite_revoke_by_id', 'lv_hub_limits', 'lv_owner_transfer_accept', 'lv_owner_transfer_decline',
                   'lv_owner_transfer_cancel', 'lv_owner_transfer_status', 'lv_campaign_get', 'lv_campaign_list'))
  and has_function_privilege('anon', 'lv_api.lv_guest_campaign_get(text)', 'execute')
  and has_function_privilege('anon', 'lv_api.lv_guest_submit(text, text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'lv.session_exchange_consume(text, timestamptz)', 'execute'));
select t.check('catalogue: no lv or lv_api function is executable by PUBLIC',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname in ('lv', 'lv_api')
                 and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')));
select t.check('catalogue: every new lv_api function is granted to authenticated',
  (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'lv_api' and p.proname in ('lv_campaign_create', 'lv_campaign_update', 'lv_campaign_set_audience_roles',
      'lv_campaign_invite_revoke_by_id', 'lv_hub_limits', 'lv_owner_transfer_accept', 'lv_owner_transfer_decline',
      'lv_owner_transfer_cancel', 'lv_owner_transfer_status')));
select t.check('catalogue: exactly one lv_campaign_create and one lv_campaign_update (no ambiguous overloads)',
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'lv_api' and p.proname in ('lv_campaign_create', 'lv_campaign_update')) = 2);
select t.check('catalogue: every lv table has RLS',
  not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'lv' and c.relkind = 'r' and not c.relrowsecurity));
select t.check('catalogue: every definer function pins search_path',
  not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname in ('lv', 'lv_api') and p.prosecdef
                 and not coalesce(p.proconfig @> array['search_path=""'], false)));

rollback;
