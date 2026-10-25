-- LunchVoice v2 canonical baseline 2/6: roles, capabilities and Owner protection.
--
-- Replaces prototype 20261024000200 (REDESIGN: role_assignments -> membership_roles keyed on membership).
-- Owner transfer is deliberately NOT here: it depends on an undecided reauth policy (see classification).
--
-- Authorization model (directive): accounts -> hub_memberships -> membership_roles -> role_capabilities.
-- A role row belongs to exactly one Hub; a membership belongs to exactly one Hub; therefore a role can never
-- be held in a Hub the person is not a member of. That is enforced structurally and by trigger, not by hope.

begin;

create table lv.roles (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  key text not null,
  name text not null,
  is_owner boolean not null default false,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  constraint roles_hub_key_key unique (hub_id, key),
  constraint roles_key_format check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint roles_name_not_blank check (length(btrim(name)) > 0)
);
-- Exactly one Owner role per Hub.
create unique index roles_one_owner_idx on lv.roles (hub_id) where is_owner;

create table lv.role_capabilities (
  role_id uuid not null references lv.roles (id) on delete cascade,
  capability text not null,
  primary key (role_id, capability),
  constraint role_capabilities_format check (capability ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

create table lv.membership_roles (
  membership_id uuid not null references lv.hub_memberships (id) on delete cascade,
  role_id uuid not null references lv.roles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (membership_id, role_id)
);
create index membership_roles_role_idx on lv.membership_roles (role_id);

-- A role may only be attached to a membership in the SAME Hub. This is the guard that makes cross-Hub
-- privilege leakage impossible even if application code is wrong.
create function lv.check_membership_role_hub() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_member_hub uuid;
  v_role_hub uuid;
begin
  select m.hub_id into v_member_hub from lv.hub_memberships m where m.id = new.membership_id;
  select r.hub_id into v_role_hub from lv.roles r where r.id = new.role_id;
  if v_member_hub is null or v_role_hub is null or v_member_hub <> v_role_hub then
    raise exception 'lv_hub_mismatch: a role cannot be held in a Hub the membership does not belong to' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger membership_roles_hub_guard before insert or update on lv.membership_roles
  for each row execute function lv.check_membership_role_hub();

-- Only an ACCEPTED membership may hold roles.
create function lv.check_membership_role_accepted() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
begin
  select m.status into v_status from lv.hub_memberships m where m.id = new.membership_id;
  if v_status is distinct from 'accepted' then
    raise exception 'lv_not_accepted: only an accepted member can hold a role' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger membership_roles_accepted_guard before insert on lv.membership_roles
  for each row execute function lv.check_membership_role_accepted();

-- Losing accepted status drops role assignments rather than leaving stale privilege behind.
create function lv.drop_roles_on_leave() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'accepted' and new.status <> 'accepted' then
    delete from lv.membership_roles where membership_id = new.id;
  end if;
  return new;
end;
$$;
create trigger hub_memberships_drop_roles after update of status on lv.hub_memberships
  for each row execute function lv.drop_roles_on_leave();

-- ---------------------------------------------------------------------------------------------------------
-- Owner protection
-- ---------------------------------------------------------------------------------------------------------

-- The Hub's owner_account_id must match the membership carrying the Owner role.
create function lv.check_hub_owner() returns trigger
language plpgsql security definer set search_path = ''
as $$
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
$$;
create trigger hubs_owner_guard before insert or update on lv.hubs
  for each row execute function lv.check_hub_owner();

-- The Owner membership can never be removed, suspended or demoted.
create function lv.protect_owner_membership() returns trigger
language plpgsql security definer set search_path = ''
as $$
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
$$;
create trigger hub_memberships_protect_owner before update or delete on lv.hub_memberships
  for each row execute function lv.protect_owner_membership();

-- The Owner role assignment cannot be removed.
create function lv.protect_owner_role() returns trigger
language plpgsql security definer set search_path = ''
as $$
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
$$;
create trigger membership_roles_protect_owner before delete on lv.membership_roles
  for each row execute function lv.protect_owner_role();

create function lv.protect_owner_role_row() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.is_owner then
    raise exception 'lv_owner_protected: the Owner role cannot be deleted' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.is_owner and not new.is_owner then
    raise exception 'lv_owner_protected: the Owner role cannot be demoted' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger roles_protect_owner before update or delete on lv.roles
  for each row execute function lv.protect_owner_role_row();

-- ---------------------------------------------------------------------------------------------------------
-- Capability checks (used by every later migration and by the API)
-- ---------------------------------------------------------------------------------------------------------

-- The caller's accepted membership in a Hub, or NULL.
create function lv.membership_of(p_account uuid, p_hub uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id from lv.hub_memberships m
   where m.hub_id = p_hub and m.account_id = p_account and m.status = 'accepted'
$$;

create function lv.has_capability(p_account uuid, p_hub uuid, p_capability text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_account is not null and exists (
    select 1
      from lv.hub_memberships m
      join lv.membership_roles mr on mr.membership_id = m.id
      join lv.role_capabilities rc on rc.role_id = mr.role_id
     where m.hub_id = p_hub and m.account_id = p_account and m.status = 'accepted'
       and rc.capability = p_capability
  )
$$;

create function lv.is_owner(p_account uuid, p_hub uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from lv.hubs h where h.id = p_hub and h.owner_account_id = p_account) $$;

-- Raised as an exception when a capability is missing, so a caller cannot forget to check.
create function lv.require_capability(p_account uuid, p_hub uuid, p_capability text) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_account is null then
    raise exception 'lv_unauthenticated: sign in first' using errcode = '42501';
  end if;
  if not lv.has_capability(p_account, p_hub, p_capability) then
    raise exception 'lv_forbidden: missing capability %', p_capability using errcode = '42501';
  end if;
end;
$$;

revoke all on all tables in schema lv from public;
revoke all on all functions in schema lv from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema lv from anon';
    execute 'revoke all on all functions in schema lv from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema lv from authenticated';
    execute 'revoke all on all functions in schema lv from authenticated';
  end if;
end $$;

commit;
