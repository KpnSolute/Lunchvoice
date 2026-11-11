-- Rollback for 000035_v2_billing_controls: the public plan limits lose the billing block and the staff calls go away. The two
-- policy values stay as they are (billing stays on or off exactly as left).
begin;
create or replace function lv_api.lv_plan_limits() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_plan_limits(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
drop function if exists lv_api.lv_admin_billing_set(text, timestamptz, text);
drop function if exists lv_api.lv_admin_billing_status();
drop function if exists lv.api_admin_billing_set(text, timestamptz, text);
drop function if exists lv.api_admin_billing_status();
drop function if exists lv.billing_status_json();
drop function if exists lv.billing_price_gaps();
commit;
