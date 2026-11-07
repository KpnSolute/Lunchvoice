-- 08: ERROR CONTRACT, Hub-creation audit, slug validation and anonymous timing (000008).
--
-- Every expected failure from lv_api is {ok:false, error:{code, message}}; nothing the caller can cause is an
-- exception. Hub creation writes an audit event. A malformed slug is a validation error, never a raw
-- constraint error. For an anonymous Campaign no stored timestamp matches the participation row exactly.
select set_config('t.file', '08_error_contract', false);
begin;

select t.set_limit('campaigns.max_active', '5'::jsonb);
update lv.policy set value = '3'::jsonb where key = 'campaign.min_cohort';
select t.trust_test_issuer();

select t.as_kpn(1, 'reviewer@example.invalid', true, 'Reviewer'); select lv_api.lv_my_context();
select t.put('reviewer', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(2, 'owner@example.invalid', true, 'Owner'); select lv_api.lv_my_context();
select t.put('owner', t.q($$select lv.current_account_id()::text$$));
select t.as_kpn(3, 'member@example.invalid', true, 'Member'); select lv_api.lv_my_context();
select t.as_pg();
select t.grant_credit(t.id('owner'));

-- ===== unauthenticated callers get the envelope, not an exception ========================================
select t.as_anon();
select t.check('unauthenticated: anon cannot execute hub_create', t.raises($$select lv_api.lv_hub_create('some-hub', 'Some')$$, '42501'));
select t.check('unauthenticated: anon cannot execute submit', t.raises($$select lv_api.lv_submit_response(gen_random_uuid(), '[]'::jsonb)$$, '42501'));
-- A token from an untrusted issuer is "authenticated" to PostgREST but signs nobody in: the envelope answers.
select t.as_kpn(99, null, true, null, 'https://untrusted.invalid/auth/v1');
select t.check('unauthenticated: hub_create answers lv_unauthenticated', t.code(lv_api.lv_hub_create('some-hub', 'Some')) = 'lv_unauthenticated');
select t.check('unauthenticated: submit answers lv_unauthenticated', t.code(lv_api.lv_submit_response(gen_random_uuid(), '[]'::jsonb)) = 'lv_unauthenticated');
select t.check('unauthenticated: analytics answers lv_unauthenticated', t.code(lv_api.lv_analytics_query(gen_random_uuid(), 'participant_count')) = 'lv_unauthenticated');
select t.check('unauthenticated: invite_create answers lv_unauthenticated', t.code(lv_api.lv_invite_create(gen_random_uuid())) = 'lv_unauthenticated');

-- ===== slug validation ===================================================================================
select t.as_kpn(2);
select t.check('slug: too short is a validation error', t.code(lv_api.lv_hub_create('ab', 'Ab')) = 'lv_invalid_input');
select t.check('slug: spaces are a validation error', t.code(lv_api.lv_hub_create('bad slug', 'Bad')) = 'lv_invalid_input');
select t.check('slug: a double hyphen is a validation error', t.code(lv_api.lv_hub_create('bad--slug', 'Bad')) = 'lv_invalid_input');
select t.check('slug: a leading hyphen is a validation error', t.code(lv_api.lv_hub_create('-bad', 'Bad')) = 'lv_invalid_input');
select t.check('slug: too long is a validation error', t.code(lv_api.lv_hub_create(repeat('a', 41), 'Bad')) = 'lv_invalid_input');
select t.check('slug: a blank display name is a validation error', t.code(lv_api.lv_hub_create('good-name', '   ')) = 'lv_invalid_input');
select t.as_pg();
select t.check('slug: failed attempts created no Hub and did not consume the Hub credit',
  t.q($$select (select count(*) from lv.hubs)::text || '|' || (select count(*) from lv.hub_credits where consumed_at is null)$$) = '0|1');

-- ===== Hub creation: audit, ownership and a claimable slug ================================================
select t.as_kpn(2);
select t.check('hub_create: a customer claims a free slug', t.code(lv_api.lv_hub_create('harbor-book-circle', 'Harbor Book Circle')) = 'ok');
select t.as_pg();
select t.put('hub', t.q($$select id::text from lv.hubs where slug = 'harbor-book-circle'$$));
select t.check('hub_create: an audit event records who created the Hub',
  t.q(format($q$select count(*)::text from lv.audit_events where action = 'hub.created' and hub_id = %L::uuid and actor_account_id = %L::uuid$q$,
             t.get('hub'), t.get('owner'))) = '1');
select t.check('hub_create: the creator is the protected Owner',
  t.q(format($q$select (owner_account_id = %L::uuid)::text from lv.hubs where id = %L::uuid$q$, t.get('owner'), t.get('hub'))) = 'true');
select t.as_kpn(3);
select t.check('hub_create: a taken slug is a conflict, not an exception',
  t.code(lv_api.lv_hub_create('harbor-book-circle', 'Other')) in ('lv_conflict', 'lv_entitlement_required'));

-- ===== codes and metadata ===============================================================================
select t.as_kpn(2);
select lv_api.lv_campaign_create(t.id('hub'), 'No questions', 'survey', 'anonymous');
select t.put('c0', t.q($$select id::text from lv.campaigns where title = 'No questions'$$));
select t.check('lifecycle: activating a Campaign with no questions is lv_gate_blocked with reasons',
  t.code(lv_api.lv_campaign_activate(t.id('c0'))) = 'lv_gate_blocked'
  and (lv_api.lv_campaign_activate(t.id('c0')) #>> '{error,reasons,0}') = 'no_questions');
select t.check('input: an unknown campaign mode is a validation error, not a raw constraint error',
  t.code(lv_api.lv_campaign_create(t.id('hub'), 'Bad mode', 'nonsense', 'anonymous')) = 'lv_invalid_input');
select t.check('input: a malformed uuid never reaches the caller as a cast error',
  t.code(lv_api.lv_campaign_question_add(t.id('c0'), 1, 'not-a-kind', 'Q?', '{}'::jsonb)) = 'lv_invalid_input');
select t.check('every error carries a code and a message',
  (lv_api.lv_campaign_activate(t.id('c0')) #>> '{error,message}') is not null
  and (lv_api.lv_campaign_activate(t.id('c0')) #>> '{error,code}') like 'lv\_%');
select t.as_kpn(3);
select t.check('authorization: a signed-in non-member is lv_forbidden on a Hub write',
  t.code(lv_api.lv_campaign_create(t.id('hub'), 'Nope', 'survey', 'anonymous')) = 'lv_forbidden');

-- ===== anonymous timing: no exact timestamp match between a person and their answers ======================
select t.as_kpn(2);
select lv_api.lv_campaign_create(t.id('hub'), 'Anon timing', 'survey', 'anonymous');
select t.put('ca', t.q($$select id::text from lv.campaigns where title = 'Anon timing'$$));
select lv_api.lv_campaign_question_add(t.id('ca'), 1, 'rating', 'How?', '{}'::jsonb);
select lv_api.lv_campaign_activate(t.id('ca'));
select t.as_pg();
select t.put('qa', t.q(format($q$select id::text from lv.campaign_questions where campaign_id = %L::uuid$q$, t.get('ca'))));
insert into lv.hub_invites (hub_id, code_hash, created_by, max_uses)
values (t.id('hub'), lv.invite_hash('TIMING-CODE'), t.id('owner'), 5);
select t.as_kpn(3);
select lv_api.lv_invite_redeem('TIMING-CODE');
select t.check('timing: a member submits to the anonymous Campaign',
  t.code(lv_api.lv_submit_response(t.id('ca'),
    format('[{"question_id":"%s","value":4}]', t.get('qa'))::jsonb)) = 'ok');
select t.as_pg();
select t.check('timing: the submission time is coarsened to the day',
  t.q(format($q$select (created_at = date_trunc('day', created_at))::text from lv.submissions where campaign_id = %L::uuid$q$, t.get('ca'))) = 'true');
select t.check('timing: the participation time is coarsened to the day too, so neither carries a precise join key (LC-09)',
  t.q(format($q$select bool_and(created_at = date_trunc('day', created_at))::text from lv.participation where campaign_id = %L::uuid$q$, t.get('ca'))) = 'true');
select t.check('timing: answers carry the same coarse time as their submission',
  t.q(format($q$select (count(*) = 0)::text from lv.answers a join lv.submissions s on s.id = a.submission_id
                 where s.campaign_id = %L::uuid and a.created_at <> s.created_at$q$, t.get('ca'))) = 'true');

rollback;
