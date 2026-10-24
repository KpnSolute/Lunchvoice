-- After rolling back ONLY migration 3: migrations 1 and 2 must work exactly as before.
select t.check('campaign tables are gone', to_regclass('lv_private.campaigns') is null and to_regclass('lv_private.campaign_participation') is null and to_regclass('lv_private.campaign_activations') is null);
select t.check('campaign RPCs are gone', not exists (select 1 from pg_proc where proname in ('lv_campaign_create', 'lv_campaign_activate', 'lv_entitlements', 'lv_gate_status')));
select t.check('gate and quota policy keys are gone, role policy keys remain', t.q($$select count(*) from lv_private.policy where key like 'gate.%' or key like 'quota.%'$$) = '0'
  and t.q($$select count(*) from lv_private.policy where key like 'owner_transfer.%'$$) = '2');
select t.check('roles, assignments and grants survive', t.q('select count(*) from lv_private.roles') = '1' and t.q('select count(*) from lv_private.role_assignments') = '1');
select t.check('role capabilities still work (migration 2)', lv_private.has_capability(t.org_a(), t.u(3), 'admin.members.admit'));
begin;
select t.as_user(t.u(2));
select t.check('role slots still work with the restored migration-2 slot state', public.lv_role_list(t.org_a())->'data'->'slots' = '{"used":1,"limit":3}'::jsonb);
select t.check('creating a role still works', t.code(public.lv_role_create(t.org_a(), 'Another', null, '{}')) = 'ok');
select t.as_pg();
select t.check('legacy data unchanged', t.legacy_fingerprint() = (select fp from t.snapshot where name = 'pre'));
commit;
