-- Rollback for 000050: removes the signed-in code lookup. The player falls back to the guest flow.
begin;
drop function if exists lv_api.lv_campaign_by_code(text);
commit;
