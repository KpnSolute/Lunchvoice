-- Rollback for 20261024000300_v2_entitlements_campaign_lifecycle.sql. NOT a migration: never applied automatically.
-- Run deliberately, in one transaction, BEFORE rolling back migrations 2 and 1 if they must go too.
--
-- Effect: removes Campaigns, questions, participation records and activation records (export lv_private.campaigns,
-- campaign_questions, campaign_participation first if any of it matters: participation rows are the history the gate
-- reads), the five gate/quota policy keys, and every function this migration created; restores the migration-2 role
-- slot state. Entitlement grants and roles are untouched. No legacy table is touched.

begin;

drop function if exists public.lv_entitlements(uuid);
drop function if exists public.lv_gate_status(uuid, text);
drop function if exists public.lv_campaign_create(uuid, text, text, boolean, text, timestamptz, timestamptz);
drop function if exists public.lv_campaign_list(uuid, text);
drop function if exists public.lv_campaign_get(uuid);
drop function if exists public.lv_campaign_update(uuid, text, boolean, jsonb);
drop function if exists public.lv_campaign_questions(uuid);
drop function if exists public.lv_campaign_schedule(uuid, timestamptz, timestamptz);
drop function if exists public.lv_campaign_activate(uuid, uuid);
drop function if exists public.lv_campaign_close(uuid);
drop function if exists public.lv_campaign_activation_status(uuid);

drop table if exists lv_private.campaign_activations;
drop table if exists lv_private.campaign_participation;
drop table if exists lv_private.campaign_questions;
drop table if exists lv_private.campaigns;

delete from lv_private.policy where key in ('quota.consuming_states', 'gate.measurement', 'gate.eligible_population', 'gate.applies_to', 'gate.bootstrap');

create or replace function lv_private.role_slot_state(p_hub uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'used', (select count(*) from lv_private.roles r where r.hub_id = p_hub),
    'limit', (select max(case g.plan_code when 'starter' then 3 when 'team' then 6 end)
              from lv_private.entitlement_grants g
              where g.hub_id = p_hub and g.valid_from <= now() and (g.valid_to is null or g.valid_to > now())),
    'has_grant', exists (select 1 from lv_private.entitlement_grants g
              where g.hub_id = p_hub and g.valid_from <= now() and (g.valid_to is null or g.valid_to > now())))
$$;

drop function if exists lv_private.touch_campaign();
drop function if exists lv_private.check_participation();
drop function if exists lv_private.plan_limit(text, text);
drop function if exists lv_private.entitlement_summary(uuid);
drop function if exists lv_private.policy_ok(text);
drop function if exists lv_private.campaign_effective_state(text, timestamptz);
drop function if exists lv_private.active_count(uuid, text);
drop function if exists lv_private.consumed_count(uuid, text, uuid);
drop function if exists lv_private.gate_evaluate(uuid, uuid);
drop function if exists lv_private.activation_checks(uuid);
drop function if exists lv_private.activate_campaign(uuid, uuid, uuid, text);
drop function if exists lv_private.campaign_json(uuid);
drop function if exists lv_private.new_join_code();
drop function if exists lv_private.any_capability(uuid, uuid, text[]);
drop function if exists lv_private.expire_due_campaigns();
drop function if exists lv_private.run_scheduled_activations(int);

commit;
