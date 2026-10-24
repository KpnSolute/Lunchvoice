-- 09: Campaign lifecycle and activation: permission, entitlement, quota, lifecycle, idempotency, expiry, scheduled
-- activation, reopening, cross-Hub access, preserved responses. ALL policy values and grants here are SYNTHETIC test
-- inputs, not production policy.
select set_config('t.file', '09_campaigns', false);
begin;

select lv_private.backfill_org_hub(t.org_a(), t.u(2));
select lv_private.backfill_org_hub(t.org_b(), t.u(11));
-- Roles by direct SQL: Surveyor (draft+activate+close) -> u3, Drafter (draft only) -> u4.
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (t.org_a(), 'starter', 'synthetic');
insert into lv_private.roles (hub_id, name) values (t.org_a(), 'Surveyor'), (t.org_a(), 'Drafter');
insert into lv_private.role_capabilities select r.id, c from lv_private.roles r, unnest(array['community.campaign.draft', 'community.campaign.activate', 'community.campaign.close']) c where r.name = 'Surveyor';
insert into lv_private.role_capabilities select r.id, 'community.campaign.draft' from lv_private.roles r where r.name = 'Drafter';
insert into lv_private.role_assignments (hub_id, account_id, role_id) select t.org_a(), t.u(3), r.id from lv_private.roles r where r.name = 'Surveyor';
insert into lv_private.role_assignments (hub_id, account_id, role_id) select t.org_a(), t.u(4), r.id from lv_private.roles r where r.name = 'Drafter';
-- Hub B: a different Owner and its own Surveyor (u41).
insert into auth.users (id, email, raw_user_meta_data) values (t.u(41), 'b.surveyor@example.invalid', jsonb_build_object('display_name', 'B Surveyor', 'org_id', t.org_b()));
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (t.org_b(), 'starter', 'synthetic');

-- ---- fail closed while policy is undecided
select t.put('c1', t.draft(t.org_a(), 'Survey one')::text);
select t.as_user(t.u(3));
select t.check('policy undecided: activation names the missing policy and does nothing',
  public.lv_campaign_activate(t.id('c1'), gen_random_uuid())->'error'->'details'->'missing' = '["quota.consuming_states"]'::jsonb);
select t.check('...the Campaign is still a draft', t.q(format('select state from lv_private.campaigns where id = %L', t.id('c1'))) = 'draft');
select t.check('status shows the blocker instead of guessing', public.lv_campaign_activation_status(t.id('c1'))->'data'->>'can_activate' = 'false'
  and public.lv_campaign_activation_status(t.id('c1'))->'data'->'blockers'->0->>'code' = 'lv_policy_undecided');
select t.as_pg();

-- Synthetic policy for these tests only. Gate disabled here (needs 100 other surveys) to isolate quota behaviour.
update lv_private.policy set value = '["active"]'::jsonb where key = 'quota.consuming_states';
update lv_private.policy set value = '{"window_days": 30}'::jsonb where key = 'gate.measurement';
update lv_private.policy set value = '{"sources": ["v2","legacy_backfill","legacy_signup","legacy_repair"]}'::jsonb where key = 'gate.eligible_population';
update lv_private.policy set value = '{"min_other_active_surveys": 100}'::jsonb where key = 'gate.applies_to';
update lv_private.policy set value = '{"zero_members": "unmet"}'::jsonb where key = 'gate.bootstrap';

-- ---- entitlements shape
select t.as_user(t.u(3));
select t.check('Starter limits: roles 3, pages 3, active 15, surveys 2',
  public.lv_entitlements(t.org_a())->'data'->'limits'->'active_total'->>'limit' = '15'
  and public.lv_entitlements(t.org_a())->'data'->'limits'->'active_survey'->>'limit' = '2'
  and public.lv_entitlements(t.org_a())->'data'->'limits'->'pages'->>'limit' = '3'
  and public.lv_entitlements(t.org_a())->'data'->'limits'->'roles'->>'limit' = '3');
select t.check('Starter: nothing undecided', public.lv_entitlements(t.org_a())->'data'->'undecided' = '[]'::jsonb);
select t.as_user(t.u(5));
select t.check('a plain member cannot read entitlements', t.code(public.lv_entitlements(t.org_a())) = 'lv_forbidden');
select t.as_user(t.u(11));
select t.check('another Hub''s Owner cannot read them', t.code(public.lv_entitlements(t.org_a())) = 'lv_forbidden');
select t.as_anon();
select t.check('anon: unauthenticated', t.code(public.lv_entitlements(t.org_a())) = 'lv_unauthenticated');
select t.as_pg();

-- Team: pages and active_total stay NULL (never unlimited); the survey cap is 5.
insert into public.orgs (id, slug, name) values ('00000000-0000-4000-8001-0000000000d4', 'synthetic-team', 'Synthetic Team Hub');
insert into auth.users (id, email, raw_user_meta_data) values (t.u(51), 'team.owner@example.invalid', '{"display_name":"Team Owner","org_id":"00000000-0000-4000-8001-0000000000d4"}');
select lv_private.backfill_org_hub('00000000-0000-4000-8001-0000000000d4', t.u(51));
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values ('00000000-0000-4000-8001-0000000000d4', 'team', 'synthetic');
select t.as_user(t.u(51));
select t.check('Team: pages and active_total limits are null, not unlimited',
  public.lv_entitlements('00000000-0000-4000-8001-0000000000d4')->'data'->'limits'->'pages'->'limit' = 'null'::jsonb
  and public.lv_entitlements('00000000-0000-4000-8001-0000000000d4')->'data'->'limits'->'active_total'->'limit' = 'null'::jsonb);
select t.check('Team: survey cap 5 and roles 6', public.lv_entitlements('00000000-0000-4000-8001-0000000000d4')->'data'->'limits'->'active_survey'->>'limit' = '5'
  and public.lv_entitlements('00000000-0000-4000-8001-0000000000d4')->'data'->'limits'->'roles'->>'limit' = '6');
select t.check('Team: the undecided limits are named', public.lv_entitlements('00000000-0000-4000-8001-0000000000d4')->'data'->'undecided' = '["pages","active_total"]'::jsonb);
select t.put('tc', t.draft('00000000-0000-4000-8001-0000000000d4', 'Team survey')::text);
select t.check('Team: activation fails closed because the active-Campaign total is undecided (never unlimited)',
  public.lv_campaign_activate(t.id('tc'), gen_random_uuid())->'error'->'details' = '{"reason":"limit_undecided","limits":["active_total"]}'::jsonb);
select t.as_pg();

-- A beta / manual grant is not a paid tier: no limits are defined, so nothing activates.
insert into public.orgs (id, slug, name) values ('00000000-0000-4000-8001-0000000000e5', 'synthetic-beta', 'Synthetic Beta Hub');
insert into auth.users (id, email, raw_user_meta_data) values (t.u(52), 'beta.owner@example.invalid', '{"display_name":"Beta Owner","org_id":"00000000-0000-4000-8001-0000000000e5"}');
select lv_private.backfill_org_hub('00000000-0000-4000-8001-0000000000e5', t.u(52));
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values ('00000000-0000-4000-8001-0000000000e5', 'manual', 'manual');
select t.put('bc', t.draft('00000000-0000-4000-8001-0000000000e5', 'Beta survey')::text);
select t.as_user(t.u(52));
select t.check('beta/manual grant: no free paid tier (limits undecided)', public.lv_campaign_activate(t.id('bc'), gen_random_uuid())->'error'->'details'->>'reason' = 'limit_undecided');
select t.check('...and every limit is null', public.lv_entitlements('00000000-0000-4000-8001-0000000000e5')->'data'->'limits'->'active_survey'->'limit' = 'null'::jsonb);
select t.as_pg();
-- A Hub with no grant at all.
insert into public.orgs (id, slug, name) values ('00000000-0000-4000-8001-0000000000f6', 'synthetic-nogrant', 'Synthetic No Grant Hub');
insert into auth.users (id, email, raw_user_meta_data) values (t.u(53), 'nogrant.owner@example.invalid', '{"display_name":"No Grant Owner","org_id":"00000000-0000-4000-8001-0000000000f6"}');
select lv_private.backfill_org_hub('00000000-0000-4000-8001-0000000000f6', t.u(53));
select t.put('nc', t.draft('00000000-0000-4000-8001-0000000000f6', 'No grant survey')::text);
select t.as_user(t.u(53));
select t.check('no grant: lv_entitlement_missing', t.code(public.lv_campaign_activate(t.id('nc'), gen_random_uuid())) = 'lv_entitlement_missing');
select t.check('no grant: entitlements say so (no plan, no grants)', public.lv_entitlements('00000000-0000-4000-8001-0000000000f6')->'data'->>'plan_code' is null and public.lv_entitlements('00000000-0000-4000-8001-0000000000f6')->'data'->'grants' = '[]'::jsonb);

-- ---- creating and editing drafts
select t.as_user(t.u(5));
select t.check('a plain member cannot create', t.code(public.lv_campaign_create(t.org_a(), 'survey', 'Nope')) = 'lv_forbidden');
select t.as_user(t.u(11));
select t.check('another Hub''s Owner cannot create here', t.code(public.lv_campaign_create(t.org_a(), 'survey', 'Nope')) = 'lv_forbidden');
select t.as_anon();
select t.check('anon cannot create', t.code(public.lv_campaign_create(t.org_a(), 'survey', 'Nope')) = 'lv_unauthenticated');
select t.as_user(t.u(4));
select t.put('c2', public.lv_campaign_create(t.org_a(), 'survey', '  Winter test (synthetic)  ')->'data'->>'id');
select t.check('a drafter creates a draft with a trimmed title and a 6-character join code',
  t.q(format('select title || to_char(length(join_code), ''FM9'') || state from lv_private.campaigns where id = %L', t.id('c2'))) = 'Winter test (synthetic)6draft');
select t.check('non-survey modes are policy-pending (D-08)', public.lv_campaign_create(t.org_a(), 'election', 'x')->'error'->'details'->>'decision' = 'D-08');
select t.check('guest links are policy-pending (D-03)', public.lv_campaign_create(t.org_a(), 'survey', 'x', false, 'link')->'error'->'details'->>'decision' = 'D-03');
select t.check('empty title is invalid_input', t.code(public.lv_campaign_create(t.org_a(), 'survey', '  ')) = 'lv_invalid_input');
select t.check('closing before opening is invalid_input', t.code(public.lv_campaign_create(t.org_a(), 'survey', 'x', false, 'off', now() + interval '2 days', now() + interval '1 day')) = 'lv_invalid_input');
select t.check('update: questions are stored and the revision increments',
  public.lv_campaign_update(t.id('c2'), null, true, t.q1())->'data'->>'anonymous' = 'true'
  and t.q(format('select question_revision::text || (select count(*) from lv_private.campaign_questions where campaign_id = %L) from lv_private.campaigns where id = %L', t.id('c2'), t.id('c2'))) = '22');
select t.check('update: invalid question is invalid_input with its number', public.lv_campaign_update(t.id('c2'), null, null, '[{"type":"single_choice","prompt":"x","options":["only one"]}]'::jsonb)->'error'->'details' = '{"question":1}'::jsonb);
select t.check('update: unknown question type is invalid_input', t.code(public.lv_campaign_update(t.id('c2'), null, null, '[{"type":"hologram","prompt":"x"}]'::jsonb)) = 'lv_invalid_input');
select t.check('update: a non-numeric scale is invalid_input (not a database error)', t.code(public.lv_campaign_update(t.id('c2'), null, null, '[{"type":"rating","prompt":"x","scale_min":"abc"}]'::jsonb)) = 'lv_invalid_input');
select t.check('the drafter cannot schedule, activate or close', t.code(public.lv_campaign_schedule(t.id('c2'), now() + interval '1 day')) = 'lv_forbidden'
  and t.code(public.lv_campaign_activate(t.id('c2'), gen_random_uuid())) = 'lv_forbidden' and t.code(public.lv_campaign_close(t.id('c2'))) = 'lv_forbidden');
select t.check('the drafter sees the draft questions', jsonb_array_length(public.lv_campaign_questions(t.id('c2'))->'data'->'questions') = 2);
select t.check('list shows drafts to a drafter', jsonb_array_length(public.lv_campaign_list(t.org_a(), 'draft')->'data'->'campaigns') = 2);
select t.as_user(t.u(5));
select t.check('a plain member cannot see drafts or questions of a draft', t.code(public.lv_campaign_get(t.id('c2'))) = 'lv_forbidden'
  and t.code(public.lv_campaign_questions(t.id('c2'))) = 'lv_lifecycle_invalid');
select t.as_pg();

-- ---- activation: permission, cross-Hub, quota, idempotency
select t.put('k1', gen_random_uuid()::text);
select t.as_user(t.u(41));
select t.check('a plain member of Hub B cannot activate in Hub A', t.code(public.lv_campaign_activate(t.id('c2'), gen_random_uuid())) = 'lv_forbidden');
select t.as_user(t.u(11));
select t.check('another Hub''s Owner cannot activate', t.code(public.lv_campaign_activate(t.id('c1'), gen_random_uuid())) = 'lv_forbidden');
select t.check('...nor read its status', t.code(public.lv_campaign_activation_status(t.id('c1'))) = 'lv_forbidden');
select t.as_user(t.u(3));
select t.check('unknown Campaign is not_found', t.code(public.lv_campaign_activate(gen_random_uuid(), gen_random_uuid())) = 'lv_not_found');
select t.check('status says it can activate', public.lv_campaign_activation_status(t.id('c1'))->'data'->>'can_activate' = 'true');
select t.check('the Surveyor activates survey 1', public.lv_campaign_activate(t.id('c1'), t.id('k1'))->'data'->>'state' = 'active');
select t.put('act1', public.lv_campaign_activate(t.id('c1'), t.id('k1'))->'data'->>'activated_at');
select t.check('retry with the same key replays the first result', public.lv_campaign_activate(t.id('c1'), t.id('k1'))->'data'->>'replay' = 'true'
  and public.lv_campaign_activate(t.id('c1'), t.id('k1'))->'data'->>'activated_at' = t.get('act1'));
select t.check('a retry does not restart the clock', t.q(format('select count(*) from lv_private.campaigns where id = %L and activated_at = (select (result->>''activated_at'')::timestamptz from lv_private.campaign_activations where campaign_id = %L and idempotency_key = %L)', t.id('c1'), t.id('c1'), t.id('k1'))) = '1');
select t.check('a NEW key on an already active Campaign is lifecycle_invalid (stale state)', public.lv_campaign_activate(t.id('c1'), gen_random_uuid())->'error'->'details'->>'reason' = 'already_active');
select t.as_user(t.u(2));
select t.check('another actor cannot reuse the key', t.code(public.lv_campaign_activate(t.id('c1'), t.id('k1'))) = 'lv_conflict');
select t.as_pg();
select t.check('exactly one activation record', t.q(format('select count(*) from lv_private.campaign_activations where campaign_id = %L', t.id('c1'))) = '1');

-- second survey fine; third blocked by the SURVEY limit (2), not the total
select t.as_pg();
select t.put('c3', t.draft(t.org_a(), 'Survey three')::text);
select t.put('c4', t.draft(t.org_a(), 'Survey four')::text);
select t.as_user(t.u(3));
select t.check('survey 2 activates', t.code(public.lv_campaign_activate(t.id('c3'), gen_random_uuid())) = 'ok');
select t.check('survey 3 is blocked by the survey limit with limit_name active_survey',
  public.lv_campaign_activate(t.id('c4'), gen_random_uuid())->'error'->'details' = '{"limit_name":"active_survey","limit":2,"used":2}'::jsonb);
select t.check('...the status agrees', public.lv_campaign_activation_status(t.id('c4'))->'data'->'blockers'->0->'details'->>'limit_name' = 'active_survey'
  and public.lv_campaign_activation_status(t.id('c4'))->'data'->'quota'->'active_survey' = '{"used":2,"limit":2}'::jsonb);
select t.as_pg();

-- active_total (15) is enforced separately: free the surveys, fill 14 other active Campaigns by SQL.
update lv_private.campaigns set state = 'closed' where id in (t.id('c1'), t.id('c3'));
insert into lv_private.campaigns (hub_id, mode, state, title, join_code, activated_at)
  select t.org_a(), 'poll', 'active', 'Other ' || n, lv_private.new_join_code(), now() from generate_series(1, 14) n;
select t.as_user(t.u(3));
select t.check('14 other active + survey 4 = 15: allowed', t.code(public.lv_campaign_activate(t.id('c4'), gen_random_uuid())) = 'ok');
select t.check('the 16th active Campaign is blocked by the TOTAL limit (survey limit not reached)',
  public.lv_campaign_activate(t.id('c3'), gen_random_uuid())->'error'->'details' = '{"limit_name":"active_total","limit":15,"used":15}'::jsonb);
select t.as_pg();
delete from lv_private.campaigns where title like 'Other %';

-- ---- close, reopen, stale state, preserved responses
select t.as_pg();
select t.put('act1db', t.q(format('select activated_at::text from lv_private.campaigns where id = %L', t.id('c1'))));
insert into lv_private.campaign_participation (campaign_id, hub_id, account_id) select t.id('c1'), t.org_a(), t.u(n) from generate_series(3, 5) n;
select t.as_user(t.u(4));
select t.check('a drafter cannot close', t.code(public.lv_campaign_close(t.id('c4'))) = 'lv_forbidden');
select t.as_user(t.u(3));
select t.check('closing a draft is lifecycle_invalid', t.code(public.lv_campaign_close(t.id('c2'))) = 'lv_lifecycle_invalid');
select t.check('close an active Campaign', public.lv_campaign_close(t.id('c4'))->'data'->>'state' = 'closed');
select t.check('closing again is idempotent', public.lv_campaign_close(t.id('c4'))->'data'->>'state' = 'closed');
select t.check('reopen c1 (closed) with a new key: same enforcement path', public.lv_campaign_activate(t.id('c1'), gen_random_uuid())->'data'->>'state' = 'active');
select t.as_pg();
select t.check('reopen kept the original activation time', t.q(format('select activated_at::text from lv_private.campaigns where id = %L', t.id('c1'))) = t.get('act1db'));
select t.check('...and counted the reopening', t.q(format('select reopened_count from lv_private.campaigns where id = %L', t.id('c1'))) = '1');
select t.check('historical responses survived close and reopen', t.q(format('select count(*) from lv_private.campaign_participation where campaign_id = %L', t.id('c1'))) = '3');
select t.check('reopen is recorded as a reopen activation', t.q(format('select count(*) from lv_private.campaign_activations where campaign_id = %L and via = ''reopen''', t.id('c1'))) = '1');
select t.as_pg();
select t.put('c5', t.draft(t.org_a(), 'Survey five')::text);
select t.as_user(t.u(3));
select t.check('with c1 reopened (1 of 2), c5 takes the last survey slot', t.code(public.lv_campaign_activate(t.id('c5'), gen_random_uuid())) = 'ok');
select t.check('c4 (closed) cannot reopen: both survey slots are taken again', public.lv_campaign_activate(t.id('c4'), gen_random_uuid())->'error'->'details'->>'limit_name' = 'active_survey');

-- ---- expiry frees slots and cannot be reopened
select t.as_pg();
update lv_private.campaigns set closes_at = now() - interval '1 minute', opens_at = now() - interval '1 day' where id = t.id('c5');
select t.as_user(t.u(3));
select t.check('a Campaign past its closing time reads as expired', public.lv_campaign_list(t.org_a(), 'expired')->'data'->'campaigns' @> jsonb_build_array(jsonb_build_object('id', t.id('c5'), 'state', 'expired')));
select t.check('...and no longer holds a slot: c4 can reopen', public.lv_campaign_activate(t.id('c4'), gen_random_uuid())->'data'->>'state' = 'active');
select t.check('an expired Campaign cannot be activated or reopened', public.lv_campaign_activate(t.id('c5'), gen_random_uuid())->'error'->'details'->>'reason' = 'expired');
select t.as_pg();
insert into lv_private.campaign_participation (campaign_id, hub_id, account_id) values (t.id('c5'), t.org_a(), t.u(3));
select t.check('the expiry job persists the state', lv_private.expire_due_campaigns() >= 0 and t.q(format('select state from lv_private.campaigns where id = %L', t.id('c5'))) = 'expired');
select t.check('responses of the expired Campaign are still there', t.q(format('select count(*) from lv_private.campaign_participation where campaign_id = %L', t.id('c5'))) = '1');

-- ---- scheduling and scheduled activation (same enforcement path)
select t.as_pg();
select t.put('s1', t.draft(t.org_a(), 'Scheduled one')::text);
select t.put('s2', t.draft(t.org_a(), 'Scheduled two')::text);
select t.as_user(t.u(4));
select t.check('a drafter cannot schedule', t.code(public.lv_campaign_schedule(t.id('s1'), now() + interval '1 hour')) = 'lv_forbidden');
select t.as_user(t.u(3));
select t.check('schedule validates the times', t.code(public.lv_campaign_schedule(t.id('s1'), now() + interval '2 hours', now() + interval '1 hour')) = 'lv_invalid_input'
  and t.code(public.lv_campaign_schedule(t.id('s1'), now() - interval '1 hour', now() - interval '30 minutes')) = 'lv_invalid_input');
select t.check('schedule a draft', public.lv_campaign_schedule(t.id('s1'), now() + interval '1 hour', now() + interval '2 days')->'data'->>'state' = 'scheduled');
select t.check('a scheduled Campaign cannot be edited', public.lv_campaign_update(t.id('s1'), 'x')->'error'->'details'->>'reason' = 'not_a_draft');
select t.check('an active one cannot be scheduled', t.code(public.lv_campaign_schedule(t.id('c1'), now() + interval '1 hour')) = 'lv_lifecycle_invalid');
select t.as_pg();
update lv_private.campaigns set opens_at = now() - interval '1 minute' where id = t.id('s1');
-- slots: c1 and c4 are the two active surveys -> the runner must be blocked by quota and leave s1 scheduled
select t.check('scheduled activation is blocked by the quota like a manual one', (lv_private.run_scheduled_activations()->>'blocked')::int = 1
  and t.q(format('select state || last_activation_error from lv_private.campaigns where id = %L', t.id('s1'))) = 'scheduledlv_quota_exceeded');
update lv_private.campaigns set state = 'closed' where id = t.id('c4');
select t.check('once a slot is free the runner activates it', (lv_private.run_scheduled_activations()->>'activated')::int = 1
  and t.q(format('select state from lv_private.campaigns where id = %L', t.id('s1'))) = 'active');
select t.check('...recorded as a scheduled activation by the scheduler', t.q(format('select via from lv_private.campaign_activations where campaign_id = %L', t.id('s1'))) = 'scheduled');
select t.check('running the job again changes nothing', (lv_private.run_scheduled_activations()->>'activated')::int = 0);
-- scheduler loses the capability
select t.as_user(t.u(3));
select t.check('schedule s2', t.code(public.lv_campaign_schedule(t.id('s2'), now() + interval '1 hour')) = 'ok');
select t.as_pg();
update lv_private.campaigns set opens_at = now() - interval '1 minute' where id = t.id('s2');
update lv_private.campaigns set state = 'closed' where id = t.id('c1');
delete from lv_private.role_assignments where account_id = t.u(3);
select t.check('a scheduler who lost the capability cannot activate by schedule', (lv_private.run_scheduled_activations()->>'blocked')::int = 1
  and t.q(format('select last_activation_error from lv_private.campaigns where id = %L', t.id('s2'))) = 'scheduler_lost_permission'
  and t.q(format('select state from lv_private.campaigns where id = %L', t.id('s2'))) = 'scheduled');
-- A scheduled Campaign whose closing time passed never opens
update lv_private.campaigns set closes_at = now() - interval '1 second', opens_at = now() - interval '1 hour' where id = t.id('s2');
select t.check('a scheduled Campaign whose window has passed becomes expired, never active', (lv_private.run_scheduled_activations()->>'activated')::int = 0
  and t.q(format('select state from lv_private.campaigns where id = %L', t.id('s2'))) = 'expired');

-- ---- consuming-states policy is a knob, not a rule
update lv_private.policy set value = '["active","scheduled"]'::jsonb where key = 'quota.consuming_states';
update lv_private.campaigns set state = 'closed' where id in (t.id('s1'), t.id('c4'));
select t.put('s3', t.draft(t.org_a(), 'Scheduled three')::text);
select t.put('s4', t.draft(t.org_a(), 'Scheduled four')::text);
select t.put('s5', t.draft(t.org_a(), 'Scheduled five')::text);
insert into lv_private.role_assignments (hub_id, account_id, role_id) select t.org_a(), t.u(3), r.id from lv_private.roles r where r.name = 'Surveyor';
select t.as_user(t.u(3));
select t.check('schedule two surveys', t.code(public.lv_campaign_schedule(t.id('s3'), now() + interval '1 day')) = 'ok' and t.code(public.lv_campaign_schedule(t.id('s4'), now() + interval '1 day')) = 'ok');
select t.check('with scheduled Campaigns consuming slots, a third survey is blocked', public.lv_campaign_activate(t.id('s5'), gen_random_uuid())->'error'->'details'->>'limit_name' = 'active_survey');
select t.as_pg();
update lv_private.policy set value = '["active"]'::jsonb where key = 'quota.consuming_states';
select t.as_user(t.u(3));
select t.check('with only active ones consuming slots, the same activation succeeds', t.code(public.lv_campaign_activate(t.id('s5'), gen_random_uuid())) = 'ok');
select t.as_pg();
update lv_private.policy set value = '["closed"]'::jsonb where key = 'quota.consuming_states';
select t.as_user(t.u(3));
select t.check('an invalid policy value is treated as undecided (fail closed)', public.lv_campaign_activate(t.id('s3'), gen_random_uuid())->'error'->'details'->'missing' = '["quota.consuming_states"]'::jsonb);
select t.as_pg();
update lv_private.policy set value = '["active"]'::jsonb where key = 'quota.consuming_states';

-- ---- validation / no questions / direct API denial / Hub integrity
select t.as_pg();
select t.put('nq', t.q($$insert into lv_private.campaigns (hub_id, title, join_code) values (t.org_a(), 'Empty', lv_private.new_join_code()) returning id$$));
select t.as_user(t.u(3));
select t.check('a draft with no questions cannot activate', public.lv_campaign_activate(t.id('nq'), gen_random_uuid())->'error'->'details'->>'reason' = 'no_questions');
select t.check('direct: campaigns are unreadable to the API roles', t.raises('select * from lv_private.campaigns', '42501'));
select t.check('direct: participation cannot be forged', t.raises($$insert into lv_private.campaign_participation (campaign_id, hub_id, account_id) values (t.id('c1'), t.org_a(), t.u(3))$$, '42501'));
select t.check('direct: activation records are unreadable', t.raises('select * from lv_private.campaign_activations', '42501'));
select t.check('direct: the activation function is not callable', t.raises($$select lv_private.activate_campaign(t.id('c1'), t.u(3), gen_random_uuid(), 'manual')$$, '42501'));
select t.check('direct: operator jobs are not callable', t.raises('select lv_private.run_scheduled_activations()', '42501'));
select t.as_pg();
select t.check('participation must match the Campaign''s Hub', t.raises($$insert into lv_private.campaign_participation (campaign_id, hub_id, account_id) values (t.id('c1'), t.org_b(), t.u(11))$$, '23503'));
select t.check('a participant row needs exactly one of account or guest', t.raises($$insert into lv_private.campaign_participation (campaign_id, hub_id) values (t.id('c1'), t.org_a())$$, '23514'));

-- ---- status always agrees with activation
select t.as_pg();
select t.put('p1', t.draft(t.org_a(), 'Parity')::text);
update lv_private.policy set value = null where key = 'quota.consuming_states';
select t.as_user(t.u(3));
select t.check('parity (policy pending): status and activation name the same code',
  public.lv_campaign_activation_status(t.id('p1'))->'data'->'blockers'->0->>'code' = public.lv_campaign_activate(t.id('p1'), gen_random_uuid())->'error'->>'code');
select t.as_pg();
update lv_private.policy set value = '["active"]'::jsonb where key = 'quota.consuming_states';
update lv_private.campaigns set state = 'closed' where state = 'active' and mode = 'survey';
insert into lv_private.campaigns (hub_id, state, title, join_code, activated_at) select t.org_a(), 'active', 'Fill ' || n, lv_private.new_join_code(), now() from generate_series(1, 2) n;
select t.as_user(t.u(3));
select t.check('parity (quota full): status and activation name the same code and limit',
  public.lv_campaign_activation_status(t.id('p1'))->'data'->'blockers'->0->'details' = public.lv_campaign_activate(t.id('p1'), gen_random_uuid())->'error'->'details');

rollback;
