-- Rollback for 000027_v2_edit_paused_campaign: only a draft can be edited again (000011 / 000003 behaviour).
begin;
create or replace function lv.api_campaign_update(p_campaign uuid, p_title text, p_mode text, p_anonymity text,
                                       p_opens_at timestamptz, p_closes_at timestamptz, p_clear_schedule boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c lv.campaigns;
  v_opens timestamptz;
  v_closes timestamptz;
  v_bad text;
begin
  c := lv.managed_campaign(p_campaign, v_account);
  if c.status <> 'draft' then return lv.err('lv_locked', 'Only a draft can be edited. Published versions are immutable.'); end if;
  if p_title is not null and btrim(p_title) = '' then return lv.err('lv_invalid_input', 'A Campaign needs a title.'); end if;

  v_opens := case when coalesce(p_clear_schedule, false) then null else coalesce(p_opens_at, c.opens_at) end;
  v_closes := case when coalesce(p_clear_schedule, false) then null else coalesce(p_closes_at, c.closes_at) end;
  v_bad := lv.validate_window(v_opens, v_closes);
  if v_bad is not null then return lv.err('lv_invalid_input', v_bad); end if;

  update lv.campaigns
     set title = coalesce(btrim(p_title), title),
         mode = coalesce(p_mode, mode),
         anonymity = coalesce(p_anonymity, anonymity),
         opens_at = v_opens,
         closes_at = v_closes
   where id = c.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function lv.freeze_questions_after_draft() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_campaign uuid;
begin
  v_campaign := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
  select c.status into v_status from lv.campaigns c where c.id = v_campaign;
  if v_status is distinct from 'draft' then
    raise exception 'lv_locked: questions cannot change once a Campaign has been activated' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop function if exists lv_api.lv_campaign_get(uuid);
alter function lv.campaign_get_base(uuid) rename to lv_campaign_get;
alter function lv.lv_campaign_get(uuid) set schema lv_api;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function lv_api.lv_campaign_get(uuid) to authenticated';
  end if;
end $$;

drop function if exists lv.campaign_has_responses(uuid);
commit;
