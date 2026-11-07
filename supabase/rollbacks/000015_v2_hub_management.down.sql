-- Rollback for 000015_v2_hub_management. Restores the 000002/000003/000014 guard and hook bodies (captured with
-- pg_get_functiondef), moves lv_hub_get back, and drops pages, released slugs and the management API.

drop function if exists lv_api.lv_hub_update(uuid, text, text, text, text, text);
drop function if exists lv_api.lv_owner_transfer(uuid, uuid, text);
drop function if exists lv_api.lv_hub_delete(uuid, text);
drop function if exists lv_api.lv_hub_pages_get(uuid);
drop function if exists lv_api.lv_hub_pages_update(uuid, jsonb);
drop function if exists lv_api.lv_profile_update(text);
drop function if exists lv_api.lv_account_delete(text);
drop function if exists lv_api.lv_hub_get(text);
drop function if exists lv.api_hub_get(text);
alter function lv.api_hub_get_card(text) rename to lv_hub_get;
alter function lv.lv_hub_get(text) set schema lv_api;
grant execute on function lv_api.lv_hub_get(text) to authenticated, anon;

drop function if exists lv.api_account_delete(text);
drop function if exists lv.api_profile_update(text);
drop function if exists lv.api_hub_delete(uuid, text);
drop function if exists lv.api_owner_transfer(uuid, uuid, text);
drop function if exists lv.api_hub_update(uuid, text, text, text, text, text);
drop function if exists lv.hub_card(uuid);
drop function if exists lv.api_hub_pages_update(uuid, jsonb);
drop function if exists lv.api_hub_pages_get(uuid);
drop function if exists lv.pages_json(uuid, boolean);
drop function if exists lv.default_pages();
drop function if exists lv.delete_hub(uuid, uuid);
drop function if exists lv.require_recent_auth();
drop function if exists lv.accent_palette();

CREATE OR REPLACE FUNCTION lv.check_hub_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from lv.accounts a where a.id = new.owner_account_id
    ) then
      raise exception 'lv_invalid_input: owner account does not exist' using errcode = '23503';
    end if;
  elsif new.owner_account_id is distinct from old.owner_account_id then
    raise exception 'lv_owner_immutable: the Owner cannot be changed directly; see Owner transfer (not yet built)' using errcode = '42501';
  end if;
  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.protect_owner_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_owner uuid;
begin
  select h.owner_account_id into v_owner from lv.hubs h where h.id = coalesce(new.hub_id, old.hub_id);
  if tg_op = 'DELETE' then
    if old.account_id = v_owner and old.status = 'accepted' then
      raise exception 'lv_owner_protected: the Owner membership cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.account_id = v_owner and new.status <> 'accepted' then
    raise exception 'lv_owner_protected: the Owner membership cannot leave accepted status' using errcode = '42501';
  end if;
  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.protect_owner_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_is_owner boolean;
begin
  if tg_op = 'DELETE' then
    select r.is_owner into v_is_owner from lv.roles r where r.id = old.role_id;
    if coalesce(v_is_owner, false) then
      raise exception 'lv_owner_protected: the Owner role cannot be unassigned' using errcode = '42501';
    end if;
    return old;
  end if;
  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.protect_owner_role_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'DELETE' and old.is_owner then
    raise exception 'lv_owner_protected: the Owner role cannot be deleted' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.is_owner and not new.is_owner then
    raise exception 'lv_owner_protected: the Owner role cannot be demoted' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$

;

CREATE OR REPLACE FUNCTION lv.freeze_questions_after_draft()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

;

CREATE OR REPLACE FUNCTION lv.slug_claim_blocked(p_slug text, p_account uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select null::text $function$

;

drop function if exists lv.deleting_hub(uuid);
drop table if exists lv.hub_pages;
drop table if exists lv.hub_tombstones;
drop function if exists lv.slug_quarantined(text);


alter table lv.hubs drop column if exists accent;
alter table lv.hubs drop column if exists about;
delete from lv.policy where key in ('security.reauth_seconds', 'hub.deleted_slug_cooldown_days');
