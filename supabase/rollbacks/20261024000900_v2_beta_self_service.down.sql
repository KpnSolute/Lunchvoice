-- Rollback of 20261024000900_v2_beta_self_service. Removes the beta application data and functions.
-- Hubs and grants already created through lv_hub_create are real product data and are NOT deleted here.
begin;
drop function if exists public.lv_hub_create(text, text, text, text);
drop function if exists public.lv_beta_decide(uuid, text, text);
drop function if exists public.lv_beta_applications_list(text);
drop function if exists public.lv_beta_my_application();
drop function if exists public.lv_beta_apply(text);
drop function if exists lv_private.application_json(lv_private.beta_applications, boolean);
drop function if exists lv_private.beta_cap();
drop function if exists lv_private.beta_terms();
drop table if exists lv_private.beta_application_events;
drop table if exists lv_private.beta_applications;
delete from lv_private.entitlement_grants where source = 'beta';
alter table lv_private.entitlement_grants drop constraint if exists entitlement_grants_source_check;
alter table lv_private.entitlement_grants add constraint entitlement_grants_source_check
  check (source in ('subscription', 'seasonal', 'manual', 'synthetic'));
delete from lv_private.policy where key in ('beta.cap', 'beta.terms', 'slug.reserved');
commit;
