-- Rollback for 000011_v2_campaign_lifecycle. Restores the 000006 lv.api_campaign_close body (as renamed by
-- 000008). Paused Campaigns go back to active and archived ones to closed, the nearest 000003 states.
drop function if exists lv_api.lv_campaign_versions(uuid);
drop function if exists lv_api.lv_campaign_archive(uuid);
drop function if exists lv_api.lv_campaign_resume(uuid);
drop function if exists lv_api.lv_campaign_pause(uuid);
drop function if exists lv_api.lv_campaign_schedule(uuid, timestamptz, timestamptz);
drop function if exists lv_api.lv_campaign_question_remove(uuid);
drop function if exists lv_api.lv_campaign_question_update(uuid, int, text, text, jsonb);
drop function if exists lv_api.lv_campaign_update(uuid, text, text, text, timestamptz, timestamptz, boolean);
drop function if exists lv.api_campaign_versions(uuid);
drop function if exists lv.api_campaign_archive(uuid);
drop function if exists lv.api_campaign_resume(uuid);
drop function if exists lv.api_campaign_pause(uuid);
drop function if exists lv.api_campaign_schedule(uuid, timestamptz, timestamptz);
drop function if exists lv.api_campaign_question_remove(uuid);
drop function if exists lv.api_campaign_question_update(uuid, int, text, text, jsonb);
drop function if exists lv.api_campaign_update(uuid, text, text, text, timestamptz, timestamptz, boolean);

create or replace function lv.api_campaign_close(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_hub uuid;
begin
  select hub_id into v_hub from lv.campaigns where id = p_campaign;
  if v_hub is null then raise exception 'lv_not_found: no such Campaign' using errcode = '23503'; end if;
  perform lv.require_capability(v_account, v_hub, 'campaign.manage');
  update lv.campaigns set status = 'closed', closed_at = coalesce(closed_at, now())
   where id = p_campaign and status = 'active';
  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists lv.validate_window(timestamptz, timestamptz);
drop function if exists lv.managed_campaign(uuid, uuid);
drop trigger if exists campaigns_snapshot_version on lv.campaigns;
drop function if exists lv.snapshot_published_version();
drop table if exists lv.campaign_versions;
drop function if exists lv.forbid_version_update();
drop function if exists lv.campaign_phase(text, timestamptz, timestamptz);

update lv.campaigns set status = 'active' where status = 'paused';
update lv.campaigns set status = 'closed' where status = 'archived';
alter table lv.campaigns drop column if exists archived_at;
alter table lv.campaigns drop column if exists paused_at;
alter table lv.campaigns drop constraint if exists campaigns_status_check;
alter table lv.campaigns add constraint campaigns_status_check check (status in ('draft', 'active', 'closed'));
