-- LunchVoice v2 canonical 10: custom roles, membership lifecycle and invitations (roadmap slice 7).
--
-- Adds the role and member management API on top of the authorization model from 000002:
--   * a capability catalogue with groups, so roles can be built from discrete toggles or whole groups,
--   * custom roles with a name and an icon, counted against a per-Hub slot limit (the Owner role never counts),
--   * assigning and unassigning roles, joining, leaving, admitting, rejecting and removing members.
--
-- Rules enforced here, server-side:
--   * No escalation: nobody can grant, edit, delete or assign a role carrying a capability they do not hold,
--     and nobody can remove a member who holds a capability the remover lacks.
--   * The Owner role and the Owner membership stay protected (000002 triggers still apply).
--   * The custom-role limit is read from lv.custom_role_limit(). Until entitlements exist (roadmap slice 9) it
--     reads policy 'roles.max_custom_per_hub', which is NULL on a fresh install, so creating a custom role fails
--     closed. Slice 9 replaces that function body with the entitlement lookup (Starter family 3, Team family 6).
--   * Leaving is not removal: a member who left may join again; a removed member may not (000001 trigger).
--
-- Not here: ownership transfer (roadmap slice 6, owned by the backend thread; needs strong reauthentication).

begin;

-- ---------------------------------------------------------------------------------------------------------
-- Capability catalogue
-- ---------------------------------------------------------------------------------------------------------
create table lv.capabilities (
  capability text primary key,
  cap_group text not null check (cap_group ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  constraint capabilities_format check (capability ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);
insert into lv.capabilities (capability, cap_group, label) values
  ('hub.settings.manage', 'hub', 'Manage Hub settings'),
  ('admin.members.admit', 'members', 'Admit members and manage invitations'),
  ('admin.members.remove', 'members', 'Remove members'),
  ('admin.roles.manage', 'roles', 'Manage roles'),
  ('campaign.manage', 'campaigns', 'Create and run Campaigns'),
  ('analytics.read', 'analytics', 'Read analytics');

-- ---------------------------------------------------------------------------------------------------------
-- Roles: icon, case-insensitive unique names, slot limit
-- ---------------------------------------------------------------------------------------------------------
alter table lv.roles add column icon text;
alter table lv.roles add constraint roles_icon_format check (icon is null or icon ~ '^[a-z0-9][a-z0-9-]{0,39}$');
alter table lv.roles add constraint roles_name_length check (length(btrim(name)) <= 40);
create unique index roles_hub_name_idx on lv.roles (hub_id, lower(btrim(name)));

insert into lv.policy (key, value, note) values
  ('roles.max_custom_per_hub', null,
   'Custom role slots per Hub until entitlements exist. NULL means creating a custom role is refused (fail closed). Replaced by the entitlement map in roadmap slice 9.');

create function lv.custom_role_limit(p_hub uuid) returns int
language sql stable security definer set search_path = ''
as $$ select (lv.policy_json('roles.max_custom_per_hub'))::int $$;

-- ---------------------------------------------------------------------------------------------------------
-- Membership: a member may leave and later rejoin; removal stays permanent
-- ---------------------------------------------------------------------------------------------------------
alter table lv.hub_memberships drop constraint hub_memberships_status_check;
alter table lv.hub_memberships add constraint hub_memberships_status_check
  check (status in ('pending', 'accepted', 'left', 'removed', 'suspended'));
alter table lv.hub_memberships add column left_at timestamptz;

create function lv.stamp_left() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status = 'left' and old.status <> 'left' then new.left_at := now(); end if;
  if new.status <> 'left' and old.status = 'left' then new.left_at := null; end if;
  return new;
end;
$$;
create trigger hub_memberships_stamp_left before update of status on lv.hub_memberships
  for each row execute function lv.stamp_left();

-- ---------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------
create function lv.role_caps(p_role uuid) returns text[]
language sql stable security definer set search_path = ''
as $$ select coalesce(array_agg(rc.capability order by rc.capability), '{}'::text[]) from lv.role_capabilities rc where rc.role_id = p_role $$;

-- True when the account holds every listed capability in the Hub. An empty list is always held.
create function lv.holds_all(p_account uuid, p_hub uuid, p_caps text[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1 from unnest(coalesce(p_caps, '{}'::text[])) c
     where not lv.has_capability(p_account, p_hub, c))
$$;

-- Every capability an account holds in a Hub, as an array.
create function lv.caps_held(p_account uuid, p_hub uuid) returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct rc.capability), '{}'::text[])
    from lv.hub_memberships m
    join lv.membership_roles mr on mr.membership_id = m.id
    join lv.role_capabilities rc on rc.role_id = mr.role_id
   where m.hub_id = p_hub and m.account_id = p_account and m.status = 'accepted'
$$;

-- Resolve discrete capabilities plus whole groups into one validated set. Returns NULL and sets p_bad when
-- something is unknown, so the caller can answer lv_invalid_input with the offending name.
create function lv.resolve_caps(p_caps text[], p_groups text[], out o_caps text[], out o_bad text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  select string_agg(x, ', ') into o_bad
    from unnest(coalesce(p_caps, '{}'::text[])) x
   where not exists (select 1 from lv.capabilities c where c.capability = x);
  if o_bad is not null then o_bad := 'unknown capability: ' || o_bad; return; end if;

  select string_agg(g, ', ') into o_bad
    from unnest(coalesce(p_groups, '{}'::text[])) g
   where not exists (select 1 from lv.capabilities c where c.cap_group = g);
  if o_bad is not null then o_bad := 'unknown capability group: ' || o_bad; return; end if;

  select coalesce(array_agg(distinct x order by x), '{}'::text[]) into o_caps from (
    select unnest(coalesce(p_caps, '{}'::text[])) x
    union
    select c.capability from lv.capabilities c where c.cap_group = any(coalesce(p_groups, '{}'::text[]))
  ) s;
end;
$$;

create function lv.role_json(p_role uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('role_id', r.id, 'key', r.key, 'name', r.name, 'icon', r.icon,
           'is_owner', r.is_owner, 'is_system', r.is_system,
           'capabilities', to_jsonb(lv.role_caps(r.id)),
           'member_count', (select count(*) from lv.membership_roles mr where mr.role_id = r.id))
    from lv.roles r where r.id = p_role
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Bodies (internal). Wrappers in lv_api map exceptions to the 000008 envelope.
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_capability_catalog() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'groups', coalesce(jsonb_agg(g order by g->>'group'), '[]'::jsonb))
    from (
      select jsonb_build_object('group', c.cap_group,
               'capabilities', jsonb_agg(jsonb_build_object('capability', c.capability, 'label', c.label) order by c.capability)) g
        from lv.capabilities c group by c.cap_group
    ) s
$$;

create function lv.api_role_list(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if lv.membership_of(v_account, p_hub) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not lv.has_capability(v_account, p_hub, 'admin.roles.manage') then
    return lv.err('lv_forbidden', 'Listing roles requires admin.roles.manage.');
  end if;
  return jsonb_build_object('ok', true,
    'roles', coalesce((select jsonb_agg(lv.role_json(r.id) order by r.is_owner desc, lower(r.name))
                         from lv.roles r where r.hub_id = p_hub), '[]'::jsonb),
    'custom_slots', jsonb_build_object(
      'used', (select count(*) from lv.roles r where r.hub_id = p_hub and not r.is_owner and not r.is_system),
      'limit', lv.custom_role_limit(p_hub)));
end;
$$;

create function lv.api_role_create(p_hub uuid, p_name text, p_icon text, p_capabilities text[], p_groups text[])
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_name text := btrim(p_name);
  v_caps text[];
  v_bad text;
  v_limit int;
  v_used int;
  v_role uuid;
begin
  perform lv.require_capability(v_account, p_hub, 'admin.roles.manage');
  if v_name is null or v_name = '' or length(v_name) > 40 then
    return lv.err('lv_invalid_input', 'A role name is 1 to 40 characters.');
  end if;
  select o_caps, o_bad into v_caps, v_bad from lv.resolve_caps(p_capabilities, p_groups);
  if v_bad is not null then return lv.err('lv_invalid_input', v_bad); end if;
  if not lv.holds_all(v_account, p_hub, v_caps) then
    return lv.err('lv_forbidden', 'You cannot grant a capability you do not hold.');
  end if;

  -- Serialise slot accounting per Hub so two creations cannot both take the last slot.
  perform pg_advisory_xact_lock(hashtextextended('lv_roles:' || p_hub::text, 0));
  v_limit := lv.custom_role_limit(p_hub);
  if v_limit is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_policy_undecided',
      'message', 'Custom roles are not available until the role limit is set.',
      'missing', jsonb_build_array('roles.max_custom_per_hub')));
  end if;
  select count(*) into v_used from lv.roles r where r.hub_id = p_hub and not r.is_owner and not r.is_system;
  if v_used >= v_limit then
    return lv.err('lv_limit_reached', format('This Hub already uses all %s custom role slots.', v_limit));
  end if;

  insert into lv.roles (hub_id, key, name, icon)
  values (p_hub, 'r_' || substr(md5(gen_random_uuid()::text), 1, 12), v_name, nullif(btrim(p_icon), ''))
  returning id into v_role;
  insert into lv.role_capabilities (role_id, capability) select v_role, unnest(v_caps);

  perform lv.audit(v_account, p_hub, 'role.created', v_role::text, jsonb_build_object('capabilities', to_jsonb(v_caps)));
  return jsonb_build_object('ok', true, 'role', lv.role_json(v_role));
exception
  when unique_violation then
    return lv.err('lv_conflict', 'A role with that name already exists in this Hub.');
end;
$$;

-- NULL arguments leave a field unchanged. An empty icon clears it. Capabilities change only when either
-- p_capabilities or p_groups is given, and then the role holds exactly the resolved set.
create function lv.api_role_update(p_role uuid, p_name text, p_icon text, p_capabilities text[], p_groups text[])
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  r record;
  v_old text[];
  v_caps text[];
  v_bad text;
  v_name text := btrim(p_name);
begin
  select * into r from lv.roles x where x.id = p_role for update;
  if r.id is null then return lv.err('lv_not_found', 'No such role.'); end if;
  perform lv.require_capability(v_account, r.hub_id, 'admin.roles.manage');
  if r.is_owner or r.is_system then return lv.err('lv_owner_protected', 'The Owner role cannot be edited.'); end if;

  v_old := lv.role_caps(r.id);
  if not lv.holds_all(v_account, r.hub_id, v_old) then
    return lv.err('lv_forbidden', 'You cannot edit a role that carries a capability you do not hold.');
  end if;
  if p_name is not null and (v_name = '' or length(v_name) > 40) then
    return lv.err('lv_invalid_input', 'A role name is 1 to 40 characters.');
  end if;

  if p_capabilities is not null or p_groups is not null then
    select o_caps, o_bad into v_caps, v_bad from lv.resolve_caps(p_capabilities, p_groups);
    if v_bad is not null then return lv.err('lv_invalid_input', v_bad); end if;
    if not lv.holds_all(v_account, r.hub_id, v_caps) then
      return lv.err('lv_forbidden', 'You cannot grant a capability you do not hold.');
    end if;
    delete from lv.role_capabilities where role_id = r.id and capability <> all(v_caps);
    insert into lv.role_capabilities (role_id, capability) select r.id, unnest(v_caps) on conflict do nothing;
  end if;

  update lv.roles
     set name = coalesce(v_name, name),
         icon = case when p_icon is null then icon else nullif(btrim(p_icon), '') end
   where id = r.id;

  perform lv.audit(v_account, r.hub_id, 'role.updated', r.id::text,
                   jsonb_build_object('before', to_jsonb(v_old), 'after', to_jsonb(lv.role_caps(r.id))));
  return jsonb_build_object('ok', true, 'role', lv.role_json(r.id));
exception
  when unique_violation then
    return lv.err('lv_conflict', 'A role with that name already exists in this Hub.');
end;
$$;

create function lv.api_role_delete(p_role uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  r record;
begin
  select * into r from lv.roles x where x.id = p_role for update;
  if r.id is null then return lv.err('lv_not_found', 'No such role.'); end if;
  perform lv.require_capability(v_account, r.hub_id, 'admin.roles.manage');
  if r.is_owner or r.is_system then return lv.err('lv_owner_protected', 'The Owner role cannot be deleted.'); end if;
  if not lv.holds_all(v_account, r.hub_id, lv.role_caps(r.id)) then
    return lv.err('lv_forbidden', 'You cannot delete a role that carries a capability you do not hold.');
  end if;
  delete from lv.roles where id = r.id;
  perform lv.audit(v_account, r.hub_id, 'role.deleted', r.id::text, jsonb_build_object('name', r.name));
  return jsonb_build_object('ok', true);
end;
$$;

create function lv.api_member_role_assign(p_membership uuid, p_role uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  m record;
  r record;
begin
  select * into m from lv.hub_memberships x where x.id = p_membership;
  select * into r from lv.roles x where x.id = p_role;
  if m.id is null or r.id is null or m.hub_id <> r.hub_id then return lv.err('lv_not_found', 'No such member or role.'); end if;
  perform lv.require_capability(v_account, m.hub_id, 'admin.roles.manage');
  if r.is_owner or r.is_system then return lv.err('lv_owner_protected', 'The Owner role cannot be assigned.'); end if;
  if not lv.holds_all(v_account, m.hub_id, lv.role_caps(r.id)) then
    return lv.err('lv_forbidden', 'You cannot assign a role that carries a capability you do not hold.');
  end if;
  if m.status <> 'accepted' then return lv.err('lv_not_accepted', 'Only an accepted member can hold a role.'); end if;
  insert into lv.membership_roles (membership_id, role_id) values (m.id, r.id) on conflict do nothing;
  perform lv.audit(v_account, m.hub_id, 'role.assigned', m.id::text, jsonb_build_object('role_id', r.id));
  return jsonb_build_object('ok', true, 'roles', lv.roles_of(m.account_id, m.hub_id));
end;
$$;

create function lv.api_member_role_unassign(p_membership uuid, p_role uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  m record;
  r record;
begin
  select * into m from lv.hub_memberships x where x.id = p_membership;
  select * into r from lv.roles x where x.id = p_role;
  if m.id is null or r.id is null or m.hub_id <> r.hub_id then return lv.err('lv_not_found', 'No such member or role.'); end if;
  perform lv.require_capability(v_account, m.hub_id, 'admin.roles.manage');
  if r.is_owner or r.is_system then return lv.err('lv_owner_protected', 'The Owner role cannot be unassigned.'); end if;
  if not lv.holds_all(v_account, m.hub_id, lv.role_caps(r.id)) then
    return lv.err('lv_forbidden', 'You cannot unassign a role that carries a capability you do not hold.');
  end if;
  delete from lv.membership_roles where membership_id = m.id and role_id = r.id;
  perform lv.audit(v_account, m.hub_id, 'role.unassigned', m.id::text, jsonb_build_object('role_id', r.id));
  return jsonb_build_object('ok', true, 'roles', lv.roles_of(m.account_id, m.hub_id));
end;
$$;

-- Join a Hub directly. Open Hubs admit at once, approval Hubs create a pending request, invite-only (and any
-- other mode, such as a future 'closed') refuse. A private Hub is invisible here: use an invitation.
create function lv.api_hub_join(p_hub uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  h record;
  m record;
  v_status text;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into h from lv.hubs x where x.id = p_hub;
  select * into m from lv.hub_memberships x where x.hub_id = p_hub and x.account_id = v_account for update;

  if h.id is null or (h.visibility = 'private' and coalesce(m.status, '') not in ('accepted', 'pending')) then
    return lv.err('lv_not_found', 'No such Hub.');
  end if;
  if m.status in ('accepted', 'pending') then
    return jsonb_build_object('ok', true, 'status', m.status, 'already_member', m.status = 'accepted');
  end if;
  if m.status in ('removed', 'suspended') then
    return lv.err('lv_forbidden', 'You cannot join this Hub.');
  end if;

  v_status := case h.membership_mode when 'open' then 'accepted' when 'approval' then 'pending' end;
  if v_status is null then return lv.err('lv_forbidden', 'This Hub can only be joined with an invitation.'); end if;

  insert into lv.hub_memberships (hub_id, account_id, status, accepted_at)
  values (p_hub, v_account, v_status, case when v_status = 'accepted' then now() end)
  on conflict (hub_id, account_id) do update set status = excluded.status;

  perform lv.audit(v_account, p_hub, case when v_status = 'accepted' then 'member.joined' else 'member.requested' end, v_account::text);
  return jsonb_build_object('ok', true, 'status', v_status, 'already_member', false);
end;
$$;

create function lv.api_member_leave(p_hub uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  m record;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into m from lv.hub_memberships x where x.hub_id = p_hub and x.account_id = v_account for update;
  if m.id is null or m.status not in ('accepted', 'pending') then return lv.err('lv_not_found', 'You are not a member of this Hub.'); end if;
  if lv.is_owner(v_account, p_hub) then return lv.err('lv_owner_protected', 'The Owner cannot leave their own Hub.'); end if;
  update lv.hub_memberships set status = 'left' where id = m.id;
  perform lv.audit(v_account, p_hub, 'member.left', v_account::text);
  return jsonb_build_object('ok', true);
end;
$$;

create function lv.api_member_admit(p_membership uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  m record;
begin
  select * into m from lv.hub_memberships x where x.id = p_membership for update;
  if m.id is null then return lv.err('lv_not_found', 'No such member.'); end if;
  perform lv.require_capability(v_account, m.hub_id, 'admin.members.admit');
  if m.status <> 'pending' then return lv.err('lv_lifecycle_invalid', 'Only a pending request can be admitted.'); end if;
  update lv.hub_memberships set status = 'accepted' where id = m.id;
  perform lv.audit(v_account, m.hub_id, 'member.admitted', m.account_id::text);
  return jsonb_build_object('ok', true);
end;
$$;

-- Declining a request deletes it, so the person may ask again later. It is not a removal.
create function lv.api_member_reject(p_membership uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  m record;
begin
  select * into m from lv.hub_memberships x where x.id = p_membership for update;
  if m.id is null then return lv.err('lv_not_found', 'No such member.'); end if;
  perform lv.require_capability(v_account, m.hub_id, 'admin.members.admit');
  if m.status <> 'pending' then return lv.err('lv_lifecycle_invalid', 'Only a pending request can be declined.'); end if;
  delete from lv.hub_memberships where id = m.id;
  perform lv.audit(v_account, m.hub_id, 'member.declined', m.account_id::text);
  return jsonb_build_object('ok', true);
end;
$$;

-- Removal is permanent (000001 forbids readmission). A remover must hold every capability the member holds.
create function lv.api_member_remove(p_membership uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  m record;
begin
  select * into m from lv.hub_memberships x where x.id = p_membership for update;
  if m.id is null or m.status not in ('accepted', 'pending') then return lv.err('lv_not_found', 'No such member.'); end if;
  perform lv.require_capability(v_account, m.hub_id, 'admin.members.remove');
  if lv.is_owner(m.account_id, m.hub_id) then return lv.err('lv_owner_protected', 'The Owner cannot be removed.'); end if;
  if m.account_id = v_account then return lv.err('lv_invalid_input', 'To leave a Hub, use leave instead of remove.'); end if;
  if not lv.holds_all(v_account, m.hub_id, lv.caps_held(m.account_id, m.hub_id)) then
    return lv.err('lv_forbidden', 'You cannot remove a member who holds a capability you do not hold.');
  end if;
  update lv.hub_memberships set status = 'removed' where id = m.id;
  perform lv.audit(v_account, m.hub_id, 'member.removed', m.account_id::text);
  return jsonb_build_object('ok', true);
end;
$$;

-- Invitation redemption now also re-admits someone who left, and turns a pending request into membership.
-- A removed person is still refused (the 000001 trigger raises lv_forbidden, mapped by the wrapper).
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

  -- Unknown, revoked, expired and exhausted all answer identically.
  if v_inv.id is null
     or v_inv.revoked_at is not null
     or (v_inv.expires_at is not null and v_inv.expires_at <= now())
     or (v_inv.max_uses is not null and v_inv.uses >= v_inv.max_uses) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_invalid_code', 'message', 'That invitation is not valid.'));
  end if;

  select id into v_member from lv.hub_memberships m
   where m.hub_id = v_inv.hub_id and m.account_id = v_account and m.status = 'accepted';

  if v_member is not null then
    -- An existing member consumes no use and gains nothing.
    return jsonb_build_object('ok', true, 'hub_id', v_inv.hub_id, 'already_member', true);
  end if;

  insert into lv.hub_memberships (hub_id, account_id, status, accepted_at)
  values (v_inv.hub_id, v_account, 'accepted', now())
  on conflict (hub_id, account_id) do update set status = 'accepted';
  insert into lv.hub_invite_redemptions (invite_id, account_id) values (v_inv.id, v_account)
  on conflict do nothing;
  update lv.hub_invites set uses = uses + 1 where id = v_inv.id;

  -- Redeeming never grants a role and never confers Owner.
  perform lv.audit(v_account, v_inv.hub_id, 'invite.redeemed', v_inv.id::text);
  return jsonb_build_object('ok', true, 'hub_id', v_inv.hub_id, 'already_member', false);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- API wrappers
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_capability_catalog() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_capability_catalog(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_role_list(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_role_list(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_role_create(p_hub uuid, p_name text, p_icon text default null,
                                      p_capabilities text[] default null, p_groups text[] default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_role_create(p_hub, p_name, p_icon, p_capabilities, p_groups); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_role_update(p_role uuid, p_name text default null, p_icon text default null,
                                      p_capabilities text[] default null, p_groups text[] default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_role_update(p_role, p_name, p_icon, p_capabilities, p_groups); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_role_delete(p_role uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_role_delete(p_role); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_member_role_assign(p_membership uuid, p_role uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_member_role_assign(p_membership, p_role); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_member_role_unassign(p_membership uuid, p_role uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_member_role_unassign(p_membership, p_role); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_hub_join(p_hub uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_hub_join(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_member_leave(p_hub uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_member_leave(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_member_admit(p_membership uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_member_admit(p_membership); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_member_reject(p_membership uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_member_reject(p_membership); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_member_remove(p_membership uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_member_remove(p_membership); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

revoke all on all tables in schema lv from public;
grant execute on all functions in schema lv_api to public;
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
