-- Rollback for 000012_v2_participation_modes. Guest submissions are deleted with their answers, because the
-- 000004 model has no place for an answer without a member.
drop function if exists lv_api.lv_guest_submit(text, text, jsonb);
drop function if exists lv_api.lv_guest_campaign_get(text);
drop function if exists lv_api.lv_campaign_set_participation(uuid, text, int, boolean);
drop function if exists lv.api_guest_submit(text, text, jsonb);
drop function if exists lv.api_guest_campaign_get(text);
drop function if exists lv.api_campaign_set_participation(uuid, text, int, boolean);
drop function if exists lv.guest_campaign(text);
drop function if exists lv.sha256_hex(text);
drop table if exists lv.guest_participation;
delete from lv.submissions where is_guest;
alter table lv.submissions drop column if exists is_guest;
delete from lv.policy where key = 'participation.guest_rate_per_minute';
alter table lv.campaigns drop column if exists guest_limit;
update lv.campaigns set audience = 'members' where audience <> 'members';
alter table lv.campaigns drop constraint if exists campaigns_audience_check;
alter table lv.campaigns add constraint campaigns_audience_check check (audience in ('members'));
