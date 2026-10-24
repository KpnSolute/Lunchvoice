-- 10: the participation gate: fail-closed policy, exact comparisons (Starter 2R > M, Team 5R >= M), guests and
-- duplicates cannot inflate, eligibility, window, bootstrap, applicability, cross-Hub, activation integration.
-- Every policy value below is SYNTHETIC and illustrative; none of it is approved production policy.
select set_config('t.file', '10_gate', false);
begin;

-- Fixture builders (rolled back with the test).
create function t.mk_hub(p_i int, p_members int, p_plan text) returns uuid language plpgsql security definer as $$
declare
  v_org uuid := ('00000000-0000-4000-8001-' || lpad(to_hex(4096 + p_i), 12, '0'))::uuid;
  v_owner uuid := t.u(60 + p_i);
  v_acc uuid;
  n int;
begin
  insert into public.orgs (id, slug, name) values (v_org, 'gate-hub-' || p_i, 'Gate Hub ' || p_i);
  insert into auth.users (id, email, raw_user_meta_data)
    values (v_owner, 'gate.owner' || p_i || '@example.invalid', jsonb_build_object('display_name', 'Gate Owner ' || p_i, 'org_id', v_org));
  perform lv_private.backfill_org_hub(v_org, v_owner);
  for n in 2..p_members loop
    v_acc := gen_random_uuid();
    insert into lv_private.accounts (id, display_name) values (v_acc, 'Member ' || p_i || '-' || n);
    insert into lv_private.hub_memberships (hub_id, account_id, status, source, joined_at) values (v_org, v_acc, 'accepted', 'v2', now());
  end loop;
  if p_plan is not null then
    insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (v_org, p_plan, 'synthetic');
  end if;
  return v_org;
end $$;

create function t.mk_campaign(p_hub uuid, p_state text default 'closed', p_questions boolean default false) returns uuid language plpgsql security definer as $$
declare v uuid;
begin
  insert into lv_private.campaigns (hub_id, title, state, join_code, activated_at) values (p_hub, 'Fixture', p_state, lv_private.new_join_code(), now()) returning id into v;
  if p_questions then insert into lv_private.campaign_questions (campaign_id, position, type, prompt) values (v, 1, 'rating', 'Q'); end if;
  return v;
end $$;

-- Exactly p_r distinct accepted members of the Hub have responded (in campaign p_c), created p_age ago.
create function t.responders(p_hub uuid, p_c uuid, p_r int, p_age interval default '0') returns void language plpgsql security definer as $$
begin
  delete from lv_private.campaign_participation where hub_id = p_hub;
  insert into lv_private.campaign_participation (campaign_id, hub_id, account_id, created_at)
    select p_c, p_hub, m.account_id, now() - p_age from lv_private.hub_memberships m
    where m.hub_id = p_hub and m.status = 'accepted' order by m.account_id limit p_r;
end $$;

create function t.gate(p_hub uuid) returns jsonb language plpgsql security definer as $$
begin return lv_private.gate_evaluate(p_hub, null); end $$;

-- ---- policy absent: fail closed, naming exactly what is missing
select t.put('h1', t.mk_hub(1, 100, 'starter')::text);
select t.as_user(t.u(61));
select t.check('no policy: gate status is policy-pending and lists every missing key',
  public.lv_gate_status(t.id('h1'))->'error'->'details'->'missing' = '["gate.measurement","gate.eligible_population","gate.applies_to","quota.consuming_states"]'::jsonb);
select t.check('...the code is lv_policy_undecided', t.code(public.lv_gate_status(t.id('h1'))) = 'lv_policy_undecided');
select t.as_pg();
update lv_private.policy set value = '{"window_days": 0}'::jsonb where key = 'gate.measurement';
update lv_private.policy set value = '{"sources": ["nonsense"]}'::jsonb where key = 'gate.eligible_population';
update lv_private.policy set value = '{"min_other_active_surveys": -1}'::jsonb where key = 'gate.applies_to';
update lv_private.policy set value = '["closed"]'::jsonb where key = 'quota.consuming_states';
update lv_private.policy set value = '{"zero_members": "maybe"}'::jsonb where key = 'gate.bootstrap';
select t.as_user(t.u(61));
select t.check('invalid policy values count as undecided (still all four missing)', jsonb_array_length(public.lv_gate_status(t.id('h1'))->'error'->'details'->'missing') = 4);
select t.as_pg();

update lv_private.policy set value = '{"window_days": 30}'::jsonb where key = 'gate.measurement';
select t.as_user(t.u(61));
select t.check('one decided key leaves the others missing', public.lv_gate_status(t.id('h1'))->'error'->'details'->'missing' = '["gate.eligible_population","gate.applies_to","quota.consuming_states"]'::jsonb);
select t.as_pg();
update lv_private.policy set value = '{"sources": ["v2","legacy_backfill","legacy_signup","legacy_repair"]}'::jsonb where key = 'gate.eligible_population';
update lv_private.policy set value = '{"min_other_active_surveys": 0}'::jsonb where key = 'gate.applies_to';
update lv_private.policy set value = '["active"]'::jsonb where key = 'quota.consuming_states';
update lv_private.policy set value = '{"zero_members": "unmet"}'::jsonb where key = 'gate.bootstrap';

-- ---- permissions and entitlement
select t.as_anon();
select t.check('anon: unauthenticated', t.code(public.lv_gate_status(t.id('h1'))) = 'lv_unauthenticated');
select t.put('h2', t.mk_hub(2, 5, 'starter')::text);
select t.as_user(t.u(62));
select t.check('another Hub''s Owner cannot read this Hub''s gate', t.code(public.lv_gate_status(t.id('h1'))) = 'lv_forbidden');
select t.check('a poll gate is policy-pending (D-08)', public.lv_gate_status(t.id('h2'), 'poll')->'error'->'details'->>'decision' = 'D-08');
select t.as_pg();
select t.put('h0', t.mk_hub(3, 3, null)::text);
select t.as_user(t.u(63));
select t.check('no grant: lv_entitlement_missing', t.code(public.lv_gate_status(t.id('h0'))) = 'lv_entitlement_missing');
select t.as_pg();
insert into lv_private.entitlement_grants (hub_id, plan_code, source) values (t.id('h0'), 'manual', 'manual');
select t.as_user(t.u(63));
select t.check('manual/beta grant: the comparison rule for the plan is undecided (no free paid tier)',
  public.lv_gate_status(t.id('h0'))->'error'->'details'->'missing' = '["gate.rule_for_plan"]'::jsonb);
select t.as_pg();

-- ---- Starter: strictly more than 50% (2R > M) with M = 100
select t.put('c1', t.mk_campaign(t.id('h1'))::text);
select t.check('M is 100', (t.gate(t.id('h1'))->>'denominator')::int = 100);
select t.responders(t.id('h1'), t.id('c1'), 50);
select t.check('Starter: exactly 50 of 100 is NOT enough', (t.gate(t.id('h1'))->>'met')::boolean = false and (t.gate(t.id('h1'))->>'numerator')::int = 50);
select t.responders(t.id('h1'), t.id('c1'), 51);
select t.check('Starter: 51 of 100 is enough', (t.gate(t.id('h1'))->>'met')::boolean);
select t.responders(t.id('h1'), t.id('c1'), 0);
select t.check('Starter: 0 of 100 is not enough', not (t.gate(t.id('h1'))->>'met')::boolean);
select t.responders(t.id('h1'), t.id('c1'), 100);
select t.check('Starter: 100 of 100 is enough', (t.gate(t.id('h1'))->>'met')::boolean);

-- small populations, exact (no rounding): M = 3 and M = 2
select t.put('h3', t.mk_hub(4, 3, 'starter')::text);
select t.put('c3', t.mk_campaign(t.id('h3'))::text);
select t.responders(t.id('h3'), t.id('c3'), 1);
select t.check('Starter M=3: 1 responder (33%) is not enough', not (t.gate(t.id('h3'))->>'met')::boolean);
select t.responders(t.id('h3'), t.id('c3'), 2);
select t.check('Starter M=3: 2 responders (66%) is enough', (t.gate(t.id('h3'))->>'met')::boolean);
select t.put('h4', t.mk_hub(5, 2, 'starter')::text);
select t.put('c4', t.mk_campaign(t.id('h4'))::text);
select t.responders(t.id('h4'), t.id('c4'), 1);
select t.check('Starter M=2: 1 responder is exactly 50%, not enough', not (t.gate(t.id('h4'))->>'met')::boolean);

-- ---- Team: at least 20% (5R >= M)
select t.put('h5', t.mk_hub(6, 100, 'team')::text);
select t.put('c5', t.mk_campaign(t.id('h5'))::text);
select t.responders(t.id('h5'), t.id('c5'), 19);
select t.check('Team M=100: 19 is below 20%', not (t.gate(t.id('h5'))->>'met')::boolean and t.gate(t.id('h5'))->>'plan' = 'team');
select t.responders(t.id('h5'), t.id('c5'), 20);
select t.check('Team M=100: exactly 20 meets 20%', (t.gate(t.id('h5'))->>'met')::boolean);
select t.put('h6', t.mk_hub(7, 3, 'team')::text);
select t.put('c6', t.mk_campaign(t.id('h6'))::text);
select t.responders(t.id('h6'), t.id('c6'), 0);
select t.check('Team M=3: 0 responders is not enough', not (t.gate(t.id('h6'))->>'met')::boolean);
select t.responders(t.id('h6'), t.id('c6'), 1);
select t.check('Team M=3: 1 responder (33%) is enough', (t.gate(t.id('h6'))->>'met')::boolean);
select t.put('h7', t.mk_hub(8, 7, 'team')::text);
select t.put('c7', t.mk_campaign(t.id('h7'))::text);
select t.responders(t.id('h7'), t.id('c7'), 1);
select t.check('Team M=7: 1 responder is 14.3%, not enough; no rounding up', not (t.gate(t.id('h7'))->>'met')::boolean);
select t.responders(t.id('h7'), t.id('c7'), 2);
select t.check('Team M=7: 2 responders is 28.6%, enough', (t.gate(t.id('h7'))->>'met')::boolean);

-- ---- guests and duplicates cannot inflate
select t.responders(t.id('h1'), t.id('c1'), 50);
insert into lv_private.campaign_participation (campaign_id, hub_id, guest_ref) select t.id('c1'), t.id('h1'), 'guest-' || n from generate_series(1, 300) n;
select t.check('300 guest responses do not move the numerator', (t.gate(t.id('h1'))->>'numerator')::int = 50 and not (t.gate(t.id('h1'))->>'met')::boolean);
select t.put('c1b', t.mk_campaign(t.id('h1'))::text);
select t.put('c1c', t.mk_campaign(t.id('h1'))::text);
insert into lv_private.campaign_participation (campaign_id, hub_id, account_id)
  select c, t.id('h1'), m.account_id from (values (t.id('c1b')), (t.id('c1c'))) v(c),
  lateral (select account_id from lv_private.hub_memberships where hub_id = t.id('h1') and status = 'accepted' order by account_id limit 50) m;
select t.check('the same 50 people answering three Campaigns count once', (t.gate(t.id('h1'))->>'numerator')::int = 50);
select t.check('the database refuses a second response row for the same person and Campaign',
  t.raises(format($$insert into lv_private.campaign_participation (campaign_id, hub_id, account_id) select %L, %L, account_id from lv_private.campaign_participation where campaign_id = %L limit 1$$, t.id('c1'), t.id('h1'), t.id('c1')), '23505'));
select t.check('the database refuses a second guest row for the same reference',
  t.raises(format($$insert into lv_private.campaign_participation (campaign_id, hub_id, guest_ref) values (%L, %L, 'guest-1')$$, t.id('c1'), t.id('h1')), '23505'));

-- ---- eligibility: only currently eligible accepted members count (numerator and denominator)
select t.responders(t.id('h1'), t.id('c1'), 51);
update lv_private.hub_memberships set status = 'suspended' where hub_id = t.id('h1') and account_id = (select account_id from lv_private.campaign_participation where campaign_id = t.id('c1') order by account_id desc limit 1);
select t.check('a responder who is later suspended stops counting (and leaves the denominator)', (t.gate(t.id('h1'))->>'numerator')::int = 50 and (t.gate(t.id('h1'))->>'denominator')::int = 99);
select t.check('...so 50 of 99 now meets Starter''s strict majority', (t.gate(t.id('h1'))->>'met')::boolean);
update lv_private.hub_memberships set status = 'accepted' where hub_id = t.id('h1');
-- a responder from ANOTHER Hub never counts here
insert into lv_private.campaign_participation (campaign_id, hub_id, account_id) select t.id('c5'), t.id('h5'), m.account_id from lv_private.hub_memberships m where m.hub_id = t.id('h1') and m.status = 'accepted' limit 10 on conflict do nothing;
select t.responders(t.id('h1'), t.id('c1'), 40);
select t.check('participation recorded for another Hub does not count', (t.gate(t.id('h1'))->>'numerator')::int = 40);
select t.check('cross-Hub: Hub 5''s gate is not affected by Hub 1', (t.gate(t.id('h5'))->>'denominator')::int = 100);

-- ---- measurement window
select t.responders(t.id('h1'), t.id('c1'), 60, interval '29 days');
select t.check('responses 29 days old are inside a 30-day window', (t.gate(t.id('h1'))->>'numerator')::int = 60);
select t.responders(t.id('h1'), t.id('c1'), 60, interval '31 days');
select t.check('responses 31 days old are outside it', (t.gate(t.id('h1'))->>'numerator')::int = 0);

-- ---- eligible population and bootstrap (M = 0)
select t.responders(t.id('h1'), t.id('c1'), 0);
update lv_private.policy set value = '{"sources": ["legacy_repair"]}'::jsonb where key = 'gate.eligible_population';
select t.check('no eligible members: M = 0 and the bootstrap policy decides (unmet)', (t.gate(t.id('h1'))->>'denominator')::int = 0 and not (t.gate(t.id('h1'))->>'met')::boolean);
update lv_private.policy set value = '{"zero_members": "met"}'::jsonb where key = 'gate.bootstrap';
select t.check('...the other illustrative bootstrap value flips it', (t.gate(t.id('h1'))->>'met')::boolean);
update lv_private.policy set value = null where key = 'gate.bootstrap';
select t.check('...and an undecided bootstrap fails closed', t.gate(t.id('h1')) = '{"missing":["gate.bootstrap"]}'::jsonb);
update lv_private.policy set value = '{"zero_members": "unmet"}'::jsonb where key = 'gate.bootstrap';
update lv_private.policy set value = '{"sources": ["legacy_backfill"]}'::jsonb where key = 'gate.eligible_population';
select t.check('legacy_backfill-only population: just the Owner (1)', (t.gate(t.id('h1'))->>'denominator')::int = 1);
update lv_private.policy set value = '{"sources": ["v2"]}'::jsonb where key = 'gate.eligible_population';
select t.check('v2-only population: the 99 other members', (t.gate(t.id('h1'))->>'denominator')::int = 99);
update lv_private.policy set value = '{"sources": ["v2","legacy_backfill","legacy_signup","legacy_repair"]}'::jsonb where key = 'gate.eligible_population';

-- ---- gate status as the UI sees it, and the policy version
select t.responders(t.id('h1'), t.id('c1'), 51);
select t.as_user(t.u(61));
select t.check('status: numerator, denominator and met are server-derived', public.lv_gate_status(t.id('h1'))->'data'->>'numerator' = '51'
  and public.lv_gate_status(t.id('h1'))->'data'->>'denominator' = '100' and public.lv_gate_status(t.id('h1'))->'data'->>'met' = 'true');
select t.put('v1', public.lv_gate_status(t.id('h1'))->'data'->>'policy_version');
select t.as_pg();
update lv_private.policy set value = '{"window_days": 45}'::jsonb where key = 'gate.measurement';
select t.as_user(t.u(61));
select t.check('the policy version changes when the policy changes', public.lv_gate_status(t.id('h1'))->'data'->>'policy_version' <> t.get('v1'));
select t.check('...and says it is provisional', public.lv_gate_status(t.id('h1'))->'data'->>'policy_version' like 'provisional-%');
select t.as_pg();
update lv_private.policy set value = '{"window_days": 30}'::jsonb where key = 'gate.measurement';

-- ---- applicability and activation integration (Starter: 2 survey slots; the gate applies from the 2nd survey)
update lv_private.policy set value = '{"min_other_active_surveys": 1}'::jsonb where key = 'gate.applies_to';
select t.put('h8', t.mk_hub(9, 10, 'starter')::text);
select t.put('sa', t.mk_campaign(t.id('h8'), 'draft', true)::text);
select t.put('sb', t.mk_campaign(t.id('h8'), 'draft', true)::text);
select t.put('sc', t.mk_campaign(t.id('h8'), 'closed')::text);
select t.as_user(t.u(69));
select t.check('the FIRST survey needs no participation (gate does not apply)', public.lv_gate_status(t.id('h8'))->'data'->>'met' = 'true'
  and public.lv_gate_status(t.id('h8'))->'data'->>'next_action' like 'No participation requirement%');
select t.check('first survey activates with zero participation', t.code(public.lv_campaign_activate(t.id('sa'), gen_random_uuid())) = 'ok');
select t.check('the SECOND survey is blocked by the gate, with exact numbers', public.lv_campaign_activate(t.id('sb'), gen_random_uuid())->'error'->'details' = '{"numerator":0,"denominator":10,"plan":"starter"}'::jsonb);
select t.check('status shows the same blocker and the gate state', public.lv_campaign_activation_status(t.id('sb'))->'data'->'blockers'->0->>'code' = 'lv_gate_unmet'
  and public.lv_campaign_activation_status(t.id('sb'))->'data'->'gate'->>'met' = 'false'
  and public.lv_campaign_activation_status(t.id('sb'))->'data'->'gate'->>'numerator' = '0');
select t.as_pg();
select t.responders(t.id('h8'), t.id('sc'), 5);
select t.as_user(t.u(69));
select t.check('5 of 10 is still not a strict majority', t.code(public.lv_campaign_activate(t.id('sb'), gen_random_uuid())) = 'lv_gate_unmet');
select t.as_pg();
select t.responders(t.id('h8'), t.id('sc'), 6);
select t.as_user(t.u(69));
select t.check('6 of 10 passes: the second survey activates', t.code(public.lv_campaign_activate(t.id('sb'), gen_random_uuid())) = 'ok');
select t.as_pg();

-- gate pending policy blocks activation with a clear result, and does not partially activate
update lv_private.policy set value = null where key = 'gate.measurement';
select t.put('sd', t.mk_campaign(t.id('h8'), 'draft', true)::text);
update lv_private.campaigns set state = 'closed' where id = t.id('sb');
select t.as_user(t.u(69));
select t.check('policy pending: activation says which policy is missing', public.lv_campaign_activate(t.id('sd'), gen_random_uuid())->'error'->'details'->'missing' = '["gate.measurement"]'::jsonb);
select t.as_pg();
select t.check('...and the Campaign did not change', t.q(format('select state from lv_private.campaigns where id = %L', t.id('sd'))) = 'draft');
update lv_private.policy set value = '{"window_days": 30}'::jsonb where key = 'gate.measurement';

rollback;
