-- 000027: edit a paused Campaign (founder request 2026-11-09: "when I pause surveys I should be able to edit it").
-- Pausing already stops all answering, so a paused Campaign can be adjusted safely:
--   * title, description and schedule: always, they never change what an answer means;
--   * mode, anonymity and questions: only while the Campaign has NO answers (members or guests), because changing
--     them afterwards would make existing answers meaningless or weaken the anonymity people were promised.
-- Running, ended, closed and archived Campaigns stay immutable. Nothing is deleted. The revision is unchanged: with no
-- answers there is nothing for it to protect, and the safe fields do not alter any answer.
begin;

create function lv.campaign_has_responses(p_campaign uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from lv.participation p where p.campaign_id = p_campaign)
      or exists (select 1 from lv.guest_participation g where g.campaign_id = p_campaign)
$$;
revoke all on function lv.campaign_has_responses(uuid) from public;

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
  if c.status not in ('draft', 'paused') then return lv.err('lv_locked', 'Only a draft or a paused Campaign can be edited. Running and ended Campaigns are immutable.'); end if;
  -- A paused Campaign keeps its answers meaningful: the title, description and schedule never change what an answer
  -- means, but the mode and anonymity do, so those lock as soon as anyone has answered.
  if c.status = 'paused' and lv.campaign_has_responses(c.id)
     and ((p_mode is not null and p_mode is distinct from c.mode) or (p_anonymity is not null and p_anonymity is distinct from c.anonymity)) then
    return lv.err('lv_locked', 'This Campaign already has answers, so its mode and anonymity can no longer change. You can still edit the title, description and schedule.');
  end if;
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
  if v_status is distinct from 'draft' and not (v_status = 'paused' and not lv.campaign_has_responses(v_campaign)) then
    raise exception 'lv_locked: questions cannot change once a Campaign has answers or has been closed' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on function lv.campaign_has_responses(uuid) from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on function lv.campaign_has_responses(uuid) from authenticated'; end if;
end $$;

-- lv_campaign_get tells a manager whether anyone has answered, so the Studio can say what is still editable. A wrapper
-- (the pattern 000008 and 000023 use): the existing function moves to the private schema under a new name and the
-- public one adds one field for managers. The moved function is not callable by API roles.
alter function lv_api.lv_campaign_get(uuid) set schema lv;
alter function lv.lv_campaign_get(uuid) rename to campaign_get_base;
revoke all on function lv.campaign_get_base(uuid) from public;

create function lv_api.lv_campaign_get(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
begin
  v := lv.campaign_get_base(p_campaign);
  if coalesce((v->>'ok')::boolean, false) and coalesce((v->>'can_manage')::boolean, false) then
    v := jsonb_set(v, '{campaign,has_responses}', to_jsonb(lv.campaign_has_responses(p_campaign)));
  end if;
  return v;
end;
$$;
revoke all on function lv_api.lv_campaign_get(uuid) from public;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function lv.campaign_get_base(uuid) from anon';
    execute 'revoke all on function lv_api.lv_campaign_get(uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function lv.campaign_get_base(uuid) from authenticated';
    execute 'grant execute on function lv_api.lv_campaign_get(uuid) to authenticated';
  end if;
end $$;

commit;
