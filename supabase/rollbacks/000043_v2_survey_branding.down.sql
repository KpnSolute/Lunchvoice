-- Rollback for 000043_v2_survey_branding. Removes the branding API, table, helpers and storage policies.
-- Refuses (raises) while any survey has a saved theme or a stored image: a rollback never deletes customer content.
-- Export or clear lv.campaign_branding and empty the two buckets first (Storage API, not SQL) if you really mean it.
begin;
do $$
declare
  v_objects boolean := false;
begin
  if exists (select 1 from lv.campaign_branding) then
    raise exception 'Surveys have saved themes; resolve them before rolling back 000043.';
  end if;
  if to_regclass('storage.objects') is not null then
    execute $q$select exists (select 1 from storage.objects where bucket_id in ('survey-logos', 'survey-covers'))$q$ into v_objects;
  end if;
  if v_objects then
    raise exception 'Branding images are stored; empty the survey-logos and survey-covers buckets before rolling back 000043.';
  end if;
end $$;

do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists lv_survey_branding_read on storage.objects';
    execute 'drop policy if exists lv_survey_branding_insert on storage.objects';
    execute 'drop policy if exists lv_survey_branding_update on storage.objects';
    execute 'drop policy if exists lv_survey_branding_delete on storage.objects';
  end if;
  if to_regclass('storage.buckets') is not null then
    execute $q$delete from storage.buckets where id in ('survey-logos', 'survey-covers')$q$;
  end if;
end $$;

drop function lv_api.lv_campaign_theme(uuid);
drop function lv_api.lv_campaign_branding_set(uuid, jsonb);
drop function lv_api.lv_campaign_branding_get(uuid);
drop function lv.branding_json(lv.campaign_branding);
drop schema lv_storage cascade;
drop function lv.branding_path_ok(uuid, text, text);
drop function lv.hub_accent_hex(uuid);
drop function lv.contrast_ratio(text, text);
drop function lv.hex_luminance(text);
drop table lv.campaign_branding;
delete from lv.plan_limits where key = 'survey.remove_footer';
commit;
