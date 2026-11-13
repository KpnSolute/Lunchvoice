-- Rollback for 000045_v2_survey_delete: drops lv_quick_survey_delete and restores the 000027 trigger body.
-- Surveys already deleted stay deleted; a rollback cannot bring them back.
begin;
drop function if exists lv_api.lv_quick_survey_delete(uuid);
drop function if exists lv.api_quick_survey_delete(uuid);

create or replace function lv.freeze_questions_after_draft() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_campaign uuid;
begin
  v_campaign := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
  select c.status into v_status from lv.campaigns c where c.id = v_campaign;
  if v_status is distinct from 'draft' and not (v_status = 'paused' and not lv.campaign_has_responses(v_campaign)) then
    raise exception 'lv_locked: questions cannot change once a Campaign has answers or has been closed' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
commit;
