-- Rollback for 000046_v2_hub_public_poll: drops the signed-out poll read. Nothing else changed.
begin;
drop function if exists lv_api.lv_hub_public_poll(text);
drop function if exists lv.api_hub_public_poll(text);
commit;
