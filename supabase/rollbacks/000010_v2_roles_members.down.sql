-- Rollback for 000010_v2_roles_members. Restores the 000006 lv.api_invite_redeem body (as renamed by 000008).
-- Members who left become removed, the nearest 000001 state; custom roles are kept, without their icons.
drop function if exists lv_api.lv_member_remove(uuid);
drop function if exists lv_api.lv_member_reject(uuid);
drop function if exists lv_api.lv_member_admit(uuid);
drop function if exists lv_api.lv_member_leave(uuid);
drop function if exists lv_api.lv_hub_join(uuid);
drop function if exists lv_api.lv_member_role_unassign(uuid, uuid);
drop function if exists lv_api.lv_member_role_assign(uuid, uuid);
drop function if exists lv_api.lv_role_delete(uuid);
drop function if exists lv_api.lv_role_update(uuid, text, text, text[], text[]);
drop function if exists lv_api.lv_role_create(uuid, text, text, text[], text[]);
drop function if exists lv_api.lv_role_list(uuid);
drop function if exists lv_api.lv_capability_catalog();
drop function if exists lv.api_member_remove(uuid);
drop function if exists lv.api_member_reject(uuid);
drop function if exists lv.api_member_admit(uuid);
drop function if exists lv.api_member_leave(uuid);
drop function if exists lv.api_hub_join(uuid);
drop function if exists lv.api_member_role_unassign(uuid, uuid);
drop function if exists lv.api_member_role_assign(uuid, uuid);
drop function if exists lv.api_role_delete(uuid);
drop function if exists lv.api_role_update(uuid, text, text, text[], text[]);
drop function if exists lv.api_role_create(uuid, text, text, text[], text[]);
drop function if exists lv.api_role_list(uuid);
drop function if exists lv.api_capability_catalog();

create or replace function lv.api_invite_redeem(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_inv record;
  v_member uuid;
begin
  if v_account is null then raise exception 'lv_unauthenticated: sign in first' using errcode = '42501'; end if;

  select * into v_inv from lv.hub_invites i
   where i.code_hash = lv.invite_hash(p_code) for update;

  if v_inv.id is null
     or v_inv.revoked_at is not null
     or (v_inv.expires_at is not null and v_inv.expires_at <= now())
     or (v_inv.max_uses is not null and v_inv.uses >= v_inv.max_uses) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_invalid_code', 'message', 'That invitation is not valid.'));
  end if;

  select id into v_member from lv.hub_memberships m
   where m.hub_id = v_inv.hub_id and m.account_id = v_account and m.status = 'accepted';

  if v_member is not null then
    return jsonb_build_object('ok', true, 'hub_id', v_inv.hub_id, 'already_member', true);
  end if;

  insert into lv.hub_memberships (hub_id, account_id, status, accepted_at)
  values (v_inv.hub_id, v_account, 'accepted', now());
  insert into lv.hub_invite_redemptions (invite_id, account_id) values (v_inv.id, v_account);
  update lv.hub_invites set uses = uses + 1 where id = v_inv.id;

  perform lv.audit(v_account, v_inv.hub_id, 'invite.redeemed', v_inv.id::text);
  return jsonb_build_object('ok', true, 'hub_id', v_inv.hub_id, 'already_member', false);
end;
$$;

drop function if exists lv.role_json(uuid);
drop function if exists lv.resolve_caps(text[], text[]);
drop function if exists lv.caps_held(uuid, uuid);
drop function if exists lv.holds_all(uuid, uuid, text[]);
drop function if exists lv.role_caps(uuid);

drop trigger if exists hub_memberships_stamp_left on lv.hub_memberships;
drop function if exists lv.stamp_left();
update lv.hub_memberships set status = 'removed' where status = 'left';
alter table lv.hub_memberships drop column if exists left_at;
alter table lv.hub_memberships drop constraint if exists hub_memberships_status_check;
alter table lv.hub_memberships add constraint hub_memberships_status_check
  check (status in ('pending', 'accepted', 'removed', 'suspended'));

drop function if exists lv.custom_role_limit(uuid);
delete from lv.policy where key = 'roles.max_custom_per_hub';
drop index if exists lv.roles_hub_name_idx;
alter table lv.roles drop constraint if exists roles_name_length;
alter table lv.roles drop constraint if exists roles_icon_format;
alter table lv.roles drop column if exists icon;
drop table if exists lv.capabilities;
