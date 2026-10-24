-- Rollback for 20261024000200_v2_roles_capabilities_owner_transfer.sql. NOT a migration: never applied automatically.
-- Run deliberately, in one transaction, BEFORE rolling back migration 1 if both must go.
--
-- Effect: removes roles, assignments, capabilities, policy settings, entitlement grants (synthetic or real: export
-- them first if they matter), Owner-transfer offers, and every object migration 2 created; restores the migration-1
-- definitions of the functions it replaced. Hub ownership is NOT reverted: whoever is Owner stays Owner. No legacy
-- table is touched.

begin;

drop function if exists public.lv_capability_catalog();
drop function if exists public.lv_role_list(uuid);
drop function if exists public.lv_role_create(uuid, text, text, text[]);
drop function if exists public.lv_role_update(uuid, text, text, text[]);
drop function if exists public.lv_role_delete(uuid);
drop function if exists public.lv_role_assign(uuid, uuid);
drop function if exists public.lv_role_unassign(uuid, uuid);
drop function if exists public.lv_role_set_capability(uuid, text, boolean);
drop function if exists public.lv_role_set_group(uuid, text, boolean);
drop function if exists public.lv_owner_transfer_start(uuid, uuid);
drop function if exists public.lv_owner_transfer_accept(uuid);
drop function if exists public.lv_owner_transfer_cancel(uuid);

drop trigger if exists hub_memberships_drop_assignments on lv_private.hub_memberships;
drop trigger if exists role_assignments_no_owner on lv_private.role_assignments;
drop trigger if exists roles_enforce_slots on lv_private.roles;
drop trigger if exists roles_touch on lv_private.roles;

drop table if exists lv_private.owner_transfer_offers;
drop table if exists lv_private.owner_change_tokens;
drop table if exists lv_private.role_assignments;
drop table if exists lv_private.role_capabilities;
drop table if exists lv_private.roles;
drop table if exists lv_private.entitlement_grants;
drop table if exists lv_private.policy;
drop table if exists lv_private.capabilities;

-- Migration-1 definitions restored (the session flag lv.owner_transfer is honoured again by the triggers).
create or replace function lv_private.has_capability(p_hub uuid, p_account uuid, p_capability text) returns boolean
language sql stable security definer set search_path = ''
as $$ select p_account is not null and lv_private.is_owner(p_hub, p_account) $$;

create or replace function public.lv_my_context() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_acc uuid; v_name text; v_mem jsonb; v_pen jsonb;
begin
  if auth.uid() is null then
    return lv_private.fail('lv_unauthenticated', 'Sign in to continue.');
  end if;
  v_acc := lv_private.ensure_account();
  select a.display_name into v_name from lv_private.accounts a where a.id = v_acc;

  select coalesce(jsonb_agg(jsonb_build_object(
      'hub_id', h.id, 'slug', lower(o.slug), 'name', o.name, 'status', 'accepted',
      'roles', '[]'::jsonb, 'capabilities', '[]'::jsonb, 'is_owner', h.owner_account_id = m.account_id)
      order by o.name, h.id), '[]'::jsonb)
    into v_mem
  from lv_private.hub_memberships m
  join lv_private.hubs h on h.id = m.hub_id
  join public.orgs o on o.id = h.id
  where m.account_id = v_acc and m.status = 'accepted';

  select coalesce(jsonb_agg(jsonb_build_object(
      'hub_id', h.id, 'slug', lower(o.slug), 'name', o.name, 'status', m.status)
      order by o.name, h.id), '[]'::jsonb)
    into v_pen
  from lv_private.hub_memberships m
  join lv_private.hubs h on h.id = m.hub_id
  join public.orgs o on o.id = h.id
  where m.account_id = v_acc and m.status in ('pending', 'invited');

  return lv_private.ok(jsonb_build_object(
    'account', jsonb_build_object('id', v_acc, 'display_name', v_name),
    'memberships', v_mem, 'pending', v_pen));
end;
$$;

create or replace function public.lv_members_list(hub_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_caller uuid;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(hub_id, v_caller, 'admin.members.admit') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  return lv_private.ok(jsonb_build_object('hub_id', hub_id, 'members', coalesce((
    select jsonb_agg(jsonb_build_object(
        'account_id', m.account_id, 'display_name', a.display_name, 'status', m.status,
        'roles', '[]'::jsonb, 'joined_at', m.joined_at) order by a.display_name, m.account_id)
    from lv_private.hub_memberships m join lv_private.accounts a on a.id = m.account_id
    where m.hub_id = lv_members_list.hub_id and m.status in ('accepted', 'pending', 'invited', 'suspended')), '[]'::jsonb)));
end;
$$;

create or replace function public.lv_remove_member(hub_id uuid, account_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_status text;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(hub_id, v_caller, 'admin.members.remove') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  v_status := lv_private.membership_status(hub_id, account_id);
  if v_status is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  if lv_private.is_owner(hub_id, account_id) then
    return lv_private.fail('lv_forbidden', 'The Owner cannot be removed.');
  end if;
  update lv_private.hub_memberships m set status = 'removed'
  where m.hub_id = lv_remove_member.hub_id and m.account_id = lv_remove_member.account_id;
  return lv_private.ok(jsonb_build_object('hub_id', hub_id, 'account_id', account_id, 'status', 'removed'));
end;
$$;

create or replace function public.lv_suspend_member(hub_id uuid, account_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_status text;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(hub_id, v_caller, 'admin.members.suspend') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  v_status := lv_private.membership_status(hub_id, account_id);
  if v_status is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  if lv_private.is_owner(hub_id, account_id) then
    return lv_private.fail('lv_forbidden', 'The Owner cannot be suspended.');
  end if;
  if v_status not in ('accepted', 'suspended') then
    return lv_private.fail('lv_conflict', 'Only an accepted member can be suspended.', jsonb_build_object('status', v_status));
  end if;
  update lv_private.hub_memberships m set status = 'suspended'
  where m.hub_id = lv_suspend_member.hub_id and m.account_id = lv_suspend_member.account_id;
  return lv_private.ok(jsonb_build_object('hub_id', hub_id, 'account_id', account_id, 'status', 'suspended'));
end;
$$;

create or replace function lv_private.protect_owner_membership() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if current_setting('lv.owner_transfer', true) is not distinct from 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if exists (select 1 from lv_private.hubs h where h.id = old.hub_id and h.owner_account_id = old.account_id) then
    if tg_op = 'DELETE' or new.status <> 'accepted' or new.hub_id <> old.hub_id or new.account_id <> old.account_id then
      raise exception 'lv_owner_protected: the Owner membership cannot be removed or changed' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function lv_private.protect_hub_owner() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_account_id is not null then
      raise exception 'lv_owner_protected: set the Owner after the Hub has an accepted membership for it' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.id <> old.id then raise exception 'lv_hub_id_immutable' using errcode = '42501'; end if;
  if new.owner_account_id is distinct from old.owner_account_id then
    if old.owner_account_id is not null and current_setting('lv.owner_transfer', true) is distinct from 'on' then
      raise exception 'lv_owner_protected: the Owner can only change through ownership transfer' using errcode = '42501';
    end if;
    if new.owner_account_id is not null and not exists (
      select 1 from lv_private.hub_memberships m
      where m.hub_id = new.id and m.account_id = new.owner_account_id and m.status = 'accepted') then
      raise exception 'lv_owner_protected: the Owner must be an accepted member' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop function if exists lv_private.owner_change_authorized();
drop function if exists lv_private.drop_assignments_when_not_accepted();
drop function if exists lv_private.no_owner_role_assignment();
drop function if exists lv_private.role_slot_state(uuid);
drop function if exists lv_private.enforce_role_slots();
drop function if exists lv_private.touch_role();
drop function if exists lv_private.held_capabilities(uuid, uuid);
drop function if exists lv_private.holds_all_of_role(uuid, uuid, uuid);
drop function if exists lv_private.outranks(uuid, uuid, uuid);
drop function if exists lv_private.ungrantable(text[]);
drop function if exists lv_private.missing_capabilities(uuid, uuid, text[]);
drop function if exists lv_private.role_json(uuid);
drop function if exists lv_private.reauth_state();

commit;
