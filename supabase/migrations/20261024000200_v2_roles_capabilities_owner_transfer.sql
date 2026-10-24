-- LunchVoice v2 foundation 2/N: custom roles, capabilities, Owner transfer.
--
-- DEPENDS ON 20261024000100_v2_identity_hubs_memberships.sql (PR #11). NOT APPLIED TO PRODUCTION.
-- Additive except that it REPLACES (create or replace) these migration-1 functions: lv_private.has_capability,
-- lv_private.protect_owner_membership, lv_private.protect_hub_owner, public.lv_my_context, public.lv_members_list,
-- public.lv_remove_member, public.lv_suspend_member. Its rollback restores the migration-1 definitions.
-- It creates no entitlement grant: role-slot limits read lv_private.entitlement_grants, which is EMPTY after this
-- migration. A Hub with no grant cannot create custom roles (lv_entitlement_missing) until a real grant exists.
--
-- Provisional (see contract P-07..P-12, not approved production policy): the delegation rules below, the capability
-- vocabulary (D-02), and the Owner-transfer reauthentication and offer-expiry settings, which are deliberately
-- UNSET (NULL) so Owner transfer fails closed with lv_policy_undecided until the founder decides them.

-- ---------------------------------------------------------------------------------------------------------
-- Capability catalog (proposed vocabulary, D-02). Owner-only operations are NOT in it and cannot be added:
-- the id check rejects anything under `hub.`.
-- ---------------------------------------------------------------------------------------------------------

create table lv_private.capabilities (
  id text primary key check (id ~ '^[a-z]+(\.[a-z_]+){2}$' and id !~ '^hub\.'),
  category text not null check (category in ('administration', 'structure', 'community')),
  sort int not null unique
);
insert into lv_private.capabilities (id, category, sort) values
  ('admin.settings.edit', 'administration', 1),
  ('admin.members.admit', 'administration', 2),
  ('admin.members.remove', 'administration', 3),
  ('admin.members.suspend', 'administration', 4),
  ('admin.directory.visibility', 'administration', 5),
  ('admin.roles.manage', 'administration', 6),
  ('admin.billing.view', 'administration', 7),
  ('admin.billing.manage', 'administration', 8),
  ('admin.slug.renew', 'administration', 9),
  ('admin.discovery.apply', 'administration', 10),
  ('structure.branding.edit', 'structure', 11),
  ('structure.navigation.edit', 'structure', 12),
  ('structure.pages.edit', 'structure', 13),
  ('structure.pages.publish', 'structure', 14),
  ('structure.pages.audience', 'structure', 15),
  ('structure.currency.edit', 'structure', 16),
  ('community.campaign.draft', 'community', 17),
  ('community.campaign.activate', 'community', 18),
  ('community.campaign.close', 'community', 19),
  ('community.campaign.audience', 'community', 20),
  ('community.comments.moderate', 'community', 21),
  ('community.analytics.view', 'community', 22),
  ('community.analytics.export', 'community', 23),
  ('community.analytics.publish', 'community', 24),
  ('community.shop.manage', 'community', 25),
  ('community.newsroom.manage', 'community', 26),
  ('community.leaderboard.manage', 'community', 27);

-- Policy settings. NULL means UNDECIDED (never a default). Nothing here is set by the migration.
create table lv_private.policy (
  key text primary key,
  value jsonb,
  note text not null
);
insert into lv_private.policy (key, value, note) values
  ('owner_transfer.reauth', null,
   'Reauthentication required for Owner transfer. Expected shape {"max_age_seconds": int, "methods": [text]?} checked against the amr claim of the access token. Undecided (D-01/D-02): NULL makes Owner transfer fail closed.'),
  ('owner_transfer.offer_ttl_seconds', null,
   'How long a transfer offer stays open, as a JSON number. Undecided: NULL makes Owner transfer fail closed.');

-- Entitlement grants (read here only for role slots). The migration inserts NONE; tests insert synthetic ones.
create table lv_private.entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv_private.hubs (id) on delete restrict,
  plan_code text not null check (plan_code in ('starter', 'team', 'campaign_starter', 'campaign_plus', 'manual')),
  source text not null check (source in ('subscription', 'seasonal', 'manual', 'synthetic')),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from)
);
create index entitlement_grants_hub_idx on lv_private.entitlement_grants (hub_id);

-- ---------------------------------------------------------------------------------------------------------
-- Roles. A role belongs to exactly one Hub; an assignment can only join a role and a member of the SAME Hub
-- (composite foreign keys), so cross-Hub assignment is impossible even for a direct SQL writer.
-- ---------------------------------------------------------------------------------------------------------

create table lv_private.roles (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv_private.hubs (id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 40),
  icon text check (icon is null or length(icon) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, hub_id)
);
create unique index roles_hub_name_idx on lv_private.roles (hub_id, lower(btrim(name)));

create table lv_private.role_capabilities (
  role_id uuid not null references lv_private.roles (id) on delete cascade,
  capability_id text not null references lv_private.capabilities (id),
  primary key (role_id, capability_id)
);

create table lv_private.role_assignments (
  hub_id uuid not null,
  account_id uuid not null,
  role_id uuid not null,
  assigned_by uuid references lv_private.accounts (id),
  created_at timestamptz not null default now(),
  primary key (account_id, role_id),
  foreign key (role_id, hub_id) references lv_private.roles (id, hub_id) on delete cascade,
  foreign key (hub_id, account_id) references lv_private.hub_memberships (hub_id, account_id) on delete cascade
);
create index role_assignments_role_idx on lv_private.role_assignments (role_id);
create index role_assignments_member_idx on lv_private.role_assignments (hub_id, account_id);

create table lv_private.owner_transfer_offers (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv_private.hubs (id) on delete restrict,
  from_account_id uuid not null references lv_private.accounts (id),
  to_account_id uuid not null references lv_private.accounts (id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled', 'expired', 'superseded')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  decided_at timestamptz,
  decided_by uuid references lv_private.accounts (id),
  check (from_account_id <> to_account_id)
);
-- At most one open offer per Hub, enforced by the database.
create unique index owner_transfer_one_pending_idx on lv_private.owner_transfer_offers (hub_id) where status = 'pending';

-- Short-lived authorization for the ownership swap. A row exists only while lv_owner_transfer_accept runs; the
-- triggers below accept an Owner change only if the session carries the matching random token. Setting a GUC alone
-- (even as the database owner) is not enough.
create table lv_private.owner_change_tokens (token text primary key);

alter table lv_private.capabilities enable row level security;
alter table lv_private.policy enable row level security;
alter table lv_private.entitlement_grants enable row level security;
alter table lv_private.roles enable row level security;
alter table lv_private.role_capabilities enable row level security;
alter table lv_private.role_assignments enable row level security;
alter table lv_private.owner_transfer_offers enable row level security;
alter table lv_private.owner_change_tokens enable row level security;
revoke all on all tables in schema lv_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------

create function lv_private.owner_change_authorized() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from lv_private.owner_change_tokens t where t.token = current_setting('lv.owner_change_token', true))
$$;

-- Replaces the migration-1 triggers: the old session flag is gone, the token is required.
create or replace function lv_private.protect_owner_membership() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if lv_private.owner_change_authorized() then
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
    if old.owner_account_id is not null and not lv_private.owner_change_authorized() then
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

-- Role authority follows membership: leaving the accepted state drops every role assignment, so a person who is
-- suspended, removed or leaves cannot come back holding old roles.
create function lv_private.drop_assignments_when_not_accepted() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status <> 'accepted' then
    delete from lv_private.role_assignments ra where ra.hub_id = new.hub_id and ra.account_id = new.account_id;
  end if;
  return null;
end;
$$;
create trigger hub_memberships_drop_assignments after update of status on lv_private.hub_memberships
  for each row when (old.status = 'accepted' and new.status <> 'accepted')
  execute function lv_private.drop_assignments_when_not_accepted();

-- Roles cannot be assigned to the Owner: Owner authority is not role based.
create function lv_private.no_owner_role_assignment() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from lv_private.hubs h where h.id = new.hub_id and h.owner_account_id = new.account_id) then
    raise exception 'lv_owner_protected: the Owner holds authority directly, not through roles' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger role_assignments_no_owner before insert on lv_private.role_assignments
  for each row execute function lv_private.no_owner_role_assignment();

-- Slot state for a Hub. Limits come ONLY from active entitlement grants: Starter 3, Team 6 (confirmed numbers).
-- Plans whose role allowance is undecided contribute nothing. The Owner does not consume a slot (it is not a role).
create function lv_private.role_slot_state(p_hub uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'used', (select count(*) from lv_private.roles r where r.hub_id = p_hub),
    'limit', (select max(case g.plan_code when 'starter' then 3 when 'team' then 6 end)
              from lv_private.entitlement_grants g
              where g.hub_id = p_hub and g.valid_from <= now() and (g.valid_to is null or g.valid_to > now())),
    'has_grant', exists (select 1 from lv_private.entitlement_grants g
              where g.hub_id = p_hub and g.valid_from <= now() and (g.valid_to is null or g.valid_to > now())))
$$;

-- Backstop for any writer: the slot limit is enforced by the database under a Hub-level lock.
create function lv_private.enforce_role_slots() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_state jsonb;
begin
  perform 1 from lv_private.hubs h where h.id = new.hub_id for update;
  v_state := lv_private.role_slot_state(new.hub_id);
  if v_state->'limit' = 'null'::jsonb or (v_state->>'used')::int >= (v_state->>'limit')::int then
    raise exception 'lv_quota_exceeded: no free custom role slot' using errcode = '53400';
  end if;
  return new;
end;
$$;
create trigger roles_enforce_slots before insert on lv_private.roles
  for each row execute function lv_private.enforce_role_slots();

create function lv_private.touch_role() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;
create trigger roles_touch before update on lv_private.roles for each row execute function lv_private.touch_role();

-- Capabilities held by an account in a Hub: the Owner holds every delegable capability; others hold the union of
-- their roles' capabilities, and only while accepted. Computed on every call, so revocation is immediate.
create or replace function lv_private.has_capability(p_hub uuid, p_account uuid, p_capability text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_account is not null and (
    lv_private.is_owner(p_hub, p_account)
    or exists (
      select 1
      from lv_private.hub_memberships m
      join lv_private.role_assignments ra on ra.hub_id = m.hub_id and ra.account_id = m.account_id
      join lv_private.role_capabilities rc on rc.role_id = ra.role_id
      where m.hub_id = p_hub and m.account_id = p_account and m.status = 'accepted' and rc.capability_id = p_capability))
$$;

create function lv_private.held_capabilities(p_hub uuid, p_account uuid) returns text[]
language sql stable security definer set search_path = ''
as $$
  select case
    when lv_private.is_owner(p_hub, p_account) then (select coalesce(array_agg(c.id order by c.sort), '{}') from lv_private.capabilities c)
    else coalesce((
      select array_agg(distinct rc.capability_id order by rc.capability_id)
      from lv_private.hub_memberships m
      join lv_private.role_assignments ra on ra.hub_id = m.hub_id and ra.account_id = m.account_id
      join lv_private.role_capabilities rc on rc.role_id = ra.role_id
      where m.hub_id = p_hub and m.account_id = p_account and m.status = 'accepted'), '{}')
  end
$$;

-- Authority over a role: the caller must hold every capability the role carries (the Owner always does).
-- Provisional delegation rule P-07: it stops a role manager from editing, assigning, unassigning or deleting a role
-- that is more powerful than they are.
create function lv_private.holds_all_of_role(p_hub uuid, p_account uuid, p_role uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (
    select 1 from lv_private.role_capabilities rc
    where rc.role_id = p_role and not lv_private.has_capability(p_hub, p_account, rc.capability_id))
$$;

-- Provisional rule P-09: a non-Owner may only remove or suspend a member whose authority is within their own.
create function lv_private.outranks(p_hub uuid, p_caller uuid, p_target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select lv_private.is_owner(p_hub, p_caller) or not exists (
    select 1 from unnest(lv_private.held_capabilities(p_hub, p_target)) c where not lv_private.has_capability(p_hub, p_caller, c))
$$;

-- Capability ids in p that are not grantable (unknown, or Owner-only such as hub.delete / hub.transfer_ownership).
create function lv_private.ungrantable(p text[]) returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(x order by x), '{}') from (select distinct unnest(p) as x) s
  where x is null or not exists (select 1 from lv_private.capabilities c where c.id = x)
$$;

create function lv_private.missing_capabilities(p_hub uuid, p_account uuid, p text[]) returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(x order by x), '{}') from (select distinct unnest(p) as x) s
  where not lv_private.has_capability(p_hub, p_account, x)
$$;

create function lv_private.role_json(p_role uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'hub_id', r.hub_id, 'name', r.name, 'icon', r.icon,
    'capabilities', coalesce((select jsonb_agg(rc.capability_id order by rc.capability_id) from lv_private.role_capabilities rc where rc.role_id = r.id), '[]'::jsonb),
    'assigned_count', (select count(*) from lv_private.role_assignments ra where ra.role_id = r.id))
  from lv_private.roles r where r.id = p_role
$$;

-- 'ok' | 'undecided' (policy unset: fail closed) | 'required' (no sufficiently fresh authentication in the token).
-- This reads the amr claim of the Supabase access token. It does NOT perform or prove reauthentication: whether
-- Google or the central identity actually forces a fresh sign-in, and whether their tokens carry a trustworthy amr
-- timestamp, is a separate integration (D-01) that no database test can establish.
create function lv_private.reauth_state() returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_policy jsonb; v_claims jsonb; v_ts bigint; v_max int; v_methods jsonb;
begin
  select p.value into v_policy from lv_private.policy p where p.key = 'owner_transfer.reauth';
  if v_policy is null or jsonb_typeof(v_policy) <> 'object' or (v_policy->>'max_age_seconds') !~ '^[0-9]+$' then
    return 'undecided';
  end if;
  v_max := (v_policy->>'max_age_seconds')::int;
  v_methods := v_policy->'methods';
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;
  select max((a->>'timestamp')::bigint) into v_ts
  from jsonb_array_elements(case when jsonb_typeof(v_claims->'amr') = 'array' then v_claims->'amr' else '[]'::jsonb end) a
  where (a->>'timestamp') ~ '^[0-9]+$'
    and (v_methods is null or jsonb_typeof(v_methods) <> 'array' or jsonb_array_length(v_methods) = 0
         or (a->>'method') in (select jsonb_array_elements_text(v_methods)));
  if v_ts is null then return 'required'; end if;
  if extract(epoch from now())::bigint - v_ts > v_max then return 'required'; end if;
  return 'ok';
end;
$$;

revoke all on all functions in schema lv_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------------------------------------

create function public.lv_capability_catalog() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  return lv_private.ok(jsonb_build_object(
    'capabilities', (select jsonb_agg(jsonb_build_object('id', c.id, 'category', c.category, 'delegable', true) order by c.sort) from lv_private.capabilities c),
    'owner_only', jsonb_build_array('hub.delete', 'hub.transfer_ownership')));
end;
$$;

create function public.lv_role_list(hub_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_caller uuid; v_state jsonb;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null then return lv_private.fail('lv_invalid_input', 'hub_id is required.'); end if;
  if not exists (select 1 from lv_private.hubs h where h.id = lv_role_list.hub_id) then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(hub_id, v_caller, 'admin.roles.manage') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  v_state := lv_private.role_slot_state(hub_id);
  return lv_private.ok(jsonb_build_object(
    'hub_id', hub_id,
    'roles', coalesce((select jsonb_agg(lv_private.role_json(r.id) order by r.name, r.id) from lv_private.roles r where r.hub_id = lv_role_list.hub_id), '[]'::jsonb),
    'slots', jsonb_build_object('used', v_state->'used', 'limit', v_state->'limit')));
end;
$$;

create function public.lv_role_create(hub_id uuid, name text, icon text default null, capabilities text[] default '{}') returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_state jsonb; v_role uuid; v_bad text[]; v_name text := btrim(name);
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null then return lv_private.fail('lv_invalid_input', 'hub_id is required.'); end if;
  if not exists (select 1 from lv_private.hubs h where h.id = lv_role_create.hub_id) then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(hub_id, v_caller, 'admin.roles.manage') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  if v_name is null or length(v_name) < 1 or length(v_name) > 40 or (icon is not null and length(icon) > 64) then
    return lv_private.fail('lv_invalid_input', 'Check the role name and icon.');
  end if;
  capabilities := coalesce(capabilities, '{}');
  v_bad := lv_private.ungrantable(capabilities);
  if cardinality(v_bad) > 0 then
    return lv_private.fail('lv_invalid_input', 'Some capabilities cannot be granted.', jsonb_build_object('ungrantable', to_jsonb(v_bad)));
  end if;
  v_bad := lv_private.missing_capabilities(hub_id, v_caller, capabilities);
  if cardinality(v_bad) > 0 then
    return lv_private.fail('lv_forbidden', 'You cannot grant authority you do not hold.',
      jsonb_build_object('reason', 'cannot_grant_unheld_capability', 'missing', to_jsonb(v_bad)));
  end if;

  -- Slot check under a Hub-level lock so concurrent creations of the last slot serialize.
  perform 1 from lv_private.hubs h where h.id = lv_role_create.hub_id for update;
  v_state := lv_private.role_slot_state(hub_id);
  if not (v_state->>'has_grant')::boolean then
    return lv_private.fail('lv_entitlement_missing', 'This Hub has no plan that includes custom roles.');
  end if;
  if v_state->'limit' = 'null'::jsonb then
    return lv_private.fail('lv_policy_undecided', 'The custom role allowance for this plan is not set yet.');
  end if;
  if (v_state->>'used')::int >= (v_state->>'limit')::int then
    return lv_private.fail('lv_quota_exceeded', 'All custom role slots are in use.', jsonb_build_object('limit', v_state->'limit', 'used', v_state->'used'));
  end if;
  if exists (select 1 from lv_private.roles r where r.hub_id = lv_role_create.hub_id and lower(btrim(r.name)) = lower(v_name)) then
    return lv_private.fail('lv_conflict', 'A role with that name already exists.');
  end if;

  insert into lv_private.roles (hub_id, name, icon) values (hub_id, v_name, icon) returning id into v_role;
  insert into lv_private.role_capabilities (role_id, capability_id) select v_role, c from (select distinct unnest(capabilities) as c) s;
  return lv_private.ok(lv_private.role_json(v_role));
end;
$$;

create function public.lv_role_update(role_id uuid, name text default null, icon text default null, capabilities text[] default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_hub uuid; v_bad text[]; v_name text := btrim(name);
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  select r.hub_id into v_hub from lv_private.roles r where r.id = lv_role_update.role_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(v_hub, v_caller, 'admin.roles.manage') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_role:' || role_id::text, 0));
  if not lv_private.holds_all_of_role(v_hub, v_caller, role_id) then
    return lv_private.fail('lv_forbidden', 'That role carries authority you do not hold.', jsonb_build_object('reason', 'role_exceeds_your_authority'));
  end if;
  if (name is not null and (length(v_name) < 1 or length(v_name) > 40)) or (icon is not null and length(icon) > 64) then
    return lv_private.fail('lv_invalid_input', 'Check the role name and icon.');
  end if;
  if capabilities is not null then
    v_bad := lv_private.ungrantable(capabilities);
    if cardinality(v_bad) > 0 then
      return lv_private.fail('lv_invalid_input', 'Some capabilities cannot be granted.', jsonb_build_object('ungrantable', to_jsonb(v_bad)));
    end if;
    v_bad := lv_private.missing_capabilities(v_hub, v_caller, capabilities);
    if cardinality(v_bad) > 0 then
      return lv_private.fail('lv_forbidden', 'You cannot grant authority you do not hold.',
        jsonb_build_object('reason', 'cannot_grant_unheld_capability', 'missing', to_jsonb(v_bad)));
    end if;
  end if;
  if name is not null and exists (select 1 from lv_private.roles r where r.hub_id = v_hub and r.id <> lv_role_update.role_id and lower(btrim(r.name)) = lower(v_name)) then
    return lv_private.fail('lv_conflict', 'A role with that name already exists.');
  end if;

  -- icon: NULL leaves it unchanged; an empty string clears it.
  update lv_private.roles r set
    name = coalesce(v_name, r.name),
    icon = case when lv_role_update.icon is null then r.icon when lv_role_update.icon = '' then null else lv_role_update.icon end
  where r.id = lv_role_update.role_id;
  if capabilities is not null then
    delete from lv_private.role_capabilities rc where rc.role_id = lv_role_update.role_id;
    insert into lv_private.role_capabilities (role_id, capability_id) select lv_role_update.role_id, c from (select distinct unnest(capabilities) as c) s;
  end if;
  return lv_private.ok(lv_private.role_json(role_id));
end;
$$;

create function public.lv_role_delete(role_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_hub uuid;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  select r.hub_id into v_hub from lv_private.roles r where r.id = lv_role_delete.role_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(v_hub, v_caller, 'admin.roles.manage') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_role:' || role_id::text, 0));
  if not lv_private.holds_all_of_role(v_hub, v_caller, role_id) then
    return lv_private.fail('lv_forbidden', 'That role carries authority you do not hold.', jsonb_build_object('reason', 'role_exceeds_your_authority'));
  end if;
  delete from lv_private.roles r where r.id = lv_role_delete.role_id;
  return lv_private.ok(jsonb_build_object('done', true));
end;
$$;

create function public.lv_role_assign(role_id uuid, account_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_hub uuid; v_status text;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if account_id is null then return lv_private.fail('lv_invalid_input', 'account_id is required.'); end if;
  select r.hub_id into v_hub from lv_private.roles r where r.id = lv_role_assign.role_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(v_hub, v_caller, 'admin.roles.manage') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  if not lv_private.holds_all_of_role(v_hub, v_caller, role_id) then
    return lv_private.fail('lv_forbidden', 'You cannot grant authority you do not hold.',
      jsonb_build_object('reason', 'role_exceeds_your_authority'));
  end if;
  if lv_private.is_owner(v_hub, account_id) then
    return lv_private.fail('lv_forbidden', 'The Owner holds authority directly, not through roles.');
  end if;
  -- Lock the membership row so a concurrent suspend/remove cannot interleave with the grant.
  select m.status into v_status from lv_private.hub_memberships m
  where m.hub_id = v_hub and m.account_id = lv_role_assign.account_id for update;
  if v_status is distinct from 'accepted' then
    return lv_private.fail('lv_not_member', 'That person is not an accepted member of this Hub.');
  end if;
  insert into lv_private.role_assignments (hub_id, account_id, role_id, assigned_by)
  values (v_hub, account_id, role_id, v_caller)
  on conflict on constraint role_assignments_pkey do nothing;
  return lv_private.ok(jsonb_build_object('hub_id', v_hub, 'account_id', account_id, 'status', 'accepted'));
end;
$$;

create function public.lv_role_unassign(role_id uuid, account_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_hub uuid;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if account_id is null then return lv_private.fail('lv_invalid_input', 'account_id is required.'); end if;
  select r.hub_id into v_hub from lv_private.roles r where r.id = lv_role_unassign.role_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(v_hub, v_caller, 'admin.roles.manage') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  if not lv_private.holds_all_of_role(v_hub, v_caller, role_id) then
    return lv_private.fail('lv_forbidden', 'That role carries authority you do not hold.', jsonb_build_object('reason', 'role_exceeds_your_authority'));
  end if;
  delete from lv_private.role_assignments ra where ra.role_id = lv_role_unassign.role_id and ra.account_id = lv_role_unassign.account_id;
  if not found then return lv_private.fail('lv_not_found', 'That person does not hold this role.'); end if;
  return lv_private.ok(jsonb_build_object('hub_id', v_hub, 'account_id', account_id, 'status', 'accepted'));
end;
$$;

create function public.lv_role_set_capability(role_id uuid, capability text, enabled boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_hub uuid;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if capability is null or enabled is null then return lv_private.fail('lv_invalid_input', 'Check the request.'); end if;
  select r.hub_id into v_hub from lv_private.roles r where r.id = lv_role_set_capability.role_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(v_hub, v_caller, 'admin.roles.manage') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  if cardinality(lv_private.ungrantable(array[capability])) > 0 then
    return lv_private.fail('lv_invalid_input', 'That capability cannot be granted.', jsonb_build_object('ungrantable', to_jsonb(array[capability])));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_role:' || role_id::text, 0));
  if not lv_private.holds_all_of_role(v_hub, v_caller, role_id) then
    return lv_private.fail('lv_forbidden', 'That role carries authority you do not hold.', jsonb_build_object('reason', 'role_exceeds_your_authority'));
  end if;
  if enabled then
    if not lv_private.has_capability(v_hub, v_caller, capability) then
      return lv_private.fail('lv_forbidden', 'You cannot grant authority you do not hold.',
        jsonb_build_object('reason', 'cannot_grant_unheld_capability', 'missing', to_jsonb(array[capability])));
    end if;
    insert into lv_private.role_capabilities (role_id, capability_id) values (role_id, capability)
    on conflict on constraint role_capabilities_pkey do nothing;
  else
    delete from lv_private.role_capabilities rc where rc.role_id = lv_role_set_capability.role_id and rc.capability_id = lv_role_set_capability.capability;
  end if;
  return lv_private.ok(lv_private.role_json(role_id));
end;
$$;

create function public.lv_role_set_group(role_id uuid, category text, enabled boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_hub uuid; v_missing text[];
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if category is null or enabled is null or category not in ('administration', 'structure', 'community') then
    return lv_private.fail('lv_invalid_input', 'Check the request.');
  end if;
  select r.hub_id into v_hub from lv_private.roles r where r.id = lv_role_set_group.role_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(v_hub, v_caller, 'admin.roles.manage') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_role:' || role_id::text, 0));
  if not lv_private.holds_all_of_role(v_hub, v_caller, role_id) then
    return lv_private.fail('lv_forbidden', 'That role carries authority you do not hold.', jsonb_build_object('reason', 'role_exceeds_your_authority'));
  end if;
  if enabled then
    -- Provisional rule P-08: enabling a whole category needs every capability in it; no partial grant.
    select coalesce(array_agg(c.id order by c.sort), '{}') into v_missing
    from lv_private.capabilities c where c.category = lv_role_set_group.category and not lv_private.has_capability(v_hub, v_caller, c.id);
    if cardinality(v_missing) > 0 then
      return lv_private.fail('lv_forbidden', 'You cannot grant authority you do not hold.',
        jsonb_build_object('reason', 'cannot_grant_unheld_capability', 'missing', to_jsonb(v_missing)));
    end if;
    insert into lv_private.role_capabilities (role_id, capability_id)
    select role_id, c.id from lv_private.capabilities c where c.category = lv_role_set_group.category
    on conflict on constraint role_capabilities_pkey do nothing;
  else
    delete from lv_private.role_capabilities rc
    where rc.role_id = lv_role_set_group.role_id
      and rc.capability_id in (select c.id from lv_private.capabilities c where c.category = lv_role_set_group.category);
  end if;
  return lv_private.ok(lv_private.role_json(role_id));
end;
$$;

-- ---- Owner transfer -----------------------------------------------------------------------------------

create function public.lv_owner_transfer_start(hub_id uuid, to_account_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_ttl jsonb; v_reauth text; v_offer uuid; v_expires timestamptz; v_pending record;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null or to_account_id is null then return lv_private.fail('lv_invalid_input', 'Check the request.'); end if;
  if not exists (select 1 from lv_private.hubs h where h.id = lv_owner_transfer_start.hub_id) then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.is_owner(hub_id, v_caller) then
    return lv_private.fail('lv_forbidden', 'Only the Owner can transfer ownership.');
  end if;

  select p.value into v_ttl from lv_private.policy p where p.key = 'owner_transfer.offer_ttl_seconds';
  v_reauth := lv_private.reauth_state();
  if v_reauth = 'undecided' or v_ttl is null or jsonb_typeof(v_ttl) <> 'number' then
    return lv_private.fail('lv_policy_undecided', 'Ownership transfer is not available until its policy is set.',
      jsonb_build_object('missing', jsonb_build_array('owner_transfer.reauth', 'owner_transfer.offer_ttl_seconds')));
  end if;
  if v_reauth = 'required' then
    return lv_private.fail('lv_forbidden', 'Sign in again to confirm this change.', jsonb_build_object('reason', 'reauthentication_required'));
  end if;

  if to_account_id = v_caller then return lv_private.fail('lv_conflict', 'You already own this Hub.'); end if;
  if lv_private.membership_status(hub_id, to_account_id) is distinct from 'accepted' then
    return lv_private.fail('lv_not_member', 'The recipient must be an accepted member of this Hub.');
  end if;

  perform 1 from lv_private.hubs h where h.id = lv_owner_transfer_start.hub_id for update;
  select o.id, o.expires_at into v_pending from lv_private.owner_transfer_offers o
  where o.hub_id = lv_owner_transfer_start.hub_id and o.status = 'pending';
  if found then
    if v_pending.expires_at > now() then
      return lv_private.fail('lv_conflict', 'An ownership offer is already open for this Hub.');
    end if;
    update lv_private.owner_transfer_offers o set status = 'expired', decided_at = now() where o.id = v_pending.id;
  end if;

  v_expires := now() + make_interval(secs => (v_ttl #>> '{}')::numeric);
  insert into lv_private.owner_transfer_offers (hub_id, from_account_id, to_account_id, expires_at)
  values (hub_id, v_caller, to_account_id, v_expires) returning id into v_offer;
  return lv_private.ok(jsonb_build_object('offer_id', v_offer, 'hub_id', hub_id, 'to_account_id', to_account_id, 'expires_at', v_expires));
end;
$$;

create function public.lv_owner_transfer_accept(offer_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; o record; v_hub uuid; v_token text; v_reauth text;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if offer_id is null then return lv_private.fail('lv_invalid_input', 'offer_id is required.'); end if;
  select t.hub_id into v_hub from lv_private.owner_transfer_offers t where t.id = lv_owner_transfer_accept.offer_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();

  -- Everything below runs under the Hub row lock: accept, cancel, start and expiry for one Hub are serialized.
  perform 1 from lv_private.hubs h where h.id = v_hub for update;
  select * into o from lv_private.owner_transfer_offers t where t.id = lv_owner_transfer_accept.offer_id;
  if o.to_account_id is distinct from v_caller then
    return lv_private.fail('lv_forbidden', 'This offer is not addressed to you.');
  end if;

  if o.status = 'accepted' then
    -- Replay by the same recipient: same result, no second swap.
    return lv_private.ok(jsonb_build_object('hub_id', o.hub_id, 'owner_account_id', (select h.owner_account_id from lv_private.hubs h where h.id = o.hub_id)));
  end if;
  if o.status <> 'pending' then
    return lv_private.fail('lv_lifecycle_invalid', 'This offer is no longer open.', jsonb_build_object('status', o.status));
  end if;
  if o.expires_at <= now() then
    update lv_private.owner_transfer_offers t set status = 'expired', decided_at = now() where t.id = o.id;
    return lv_private.fail('lv_lifecycle_invalid', 'This offer has expired.', jsonb_build_object('status', 'expired'));
  end if;
  if (select h.owner_account_id from lv_private.hubs h where h.id = o.hub_id) is distinct from o.from_account_id then
    update lv_private.owner_transfer_offers t set status = 'superseded', decided_at = now() where t.id = o.id;
    return lv_private.fail('lv_lifecycle_invalid', 'The Owner has changed since this offer was made.', jsonb_build_object('status', 'superseded'));
  end if;
  if lv_private.membership_status(o.hub_id, v_caller) is distinct from 'accepted' then
    return lv_private.fail('lv_not_member', 'You are no longer an accepted member of this Hub.');
  end if;
  v_reauth := lv_private.reauth_state();
  if v_reauth = 'undecided' then
    return lv_private.fail('lv_policy_undecided', 'Ownership transfer is not available until its policy is set.');
  end if;
  if v_reauth = 'required' then
    return lv_private.fail('lv_forbidden', 'Sign in again to confirm this change.', jsonb_build_object('reason', 'reauthentication_required'));
  end if;

  -- The swap. A single UPDATE of hubs.owner_account_id means there is always exactly one Owner.
  v_token := gen_random_uuid()::text;
  insert into lv_private.owner_change_tokens (token) values (v_token);
  perform set_config('lv.owner_change_token', v_token, true);
  update lv_private.hubs h set owner_account_id = v_caller where h.id = o.hub_id;
  delete from lv_private.owner_change_tokens t where t.token = v_token;
  perform set_config('lv.owner_change_token', '', true);

  -- The new Owner's authority is direct; the previous Owner becomes an ordinary accepted member with no roles.
  delete from lv_private.role_assignments ra where ra.hub_id = o.hub_id and ra.account_id = v_caller;
  update lv_private.owner_transfer_offers t set status = 'accepted', decided_at = now(), decided_by = v_caller where t.id = o.id;
  return lv_private.ok(jsonb_build_object('hub_id', o.hub_id, 'owner_account_id', v_caller));
end;
$$;

create function public.lv_owner_transfer_cancel(offer_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; o record; v_hub uuid;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if offer_id is null then return lv_private.fail('lv_invalid_input', 'offer_id is required.'); end if;
  select t.hub_id into v_hub from lv_private.owner_transfer_offers t where t.id = lv_owner_transfer_cancel.offer_id;
  if v_hub is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  perform 1 from lv_private.hubs h where h.id = v_hub for update;
  select * into o from lv_private.owner_transfer_offers t where t.id = lv_owner_transfer_cancel.offer_id;
  -- The Owner withdraws; the recipient declines.
  if v_caller is distinct from o.from_account_id and v_caller is distinct from o.to_account_id then
    return lv_private.fail('lv_forbidden', 'You cannot cancel this offer.');
  end if;
  if o.status <> 'pending' then
    return lv_private.fail('lv_lifecycle_invalid', 'This offer is no longer open.', jsonb_build_object('status', o.status));
  end if;
  update lv_private.owner_transfer_offers t set status = 'cancelled', decided_at = now(), decided_by = v_caller where t.id = o.id;
  return lv_private.ok(jsonb_build_object('done', true));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Migration-1 RPCs that now reflect roles. Same signatures; create or replace.
-- ---------------------------------------------------------------------------------------------------------

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
      'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'icon', r.icon) order by r.name, r.id)
                         from lv_private.role_assignments ra join lv_private.roles r on r.id = ra.role_id
                         where ra.hub_id = h.id and ra.account_id = m.account_id), '[]'::jsonb),
      'capabilities', to_jsonb(lv_private.held_capabilities(h.id, m.account_id)),
      'is_owner', h.owner_account_id = m.account_id)
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
        'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'icon', r.icon) order by r.name, r.id)
                           from lv_private.role_assignments ra join lv_private.roles r on r.id = ra.role_id
                           where ra.hub_id = m.hub_id and ra.account_id = m.account_id), '[]'::jsonb),
        'joined_at', m.joined_at) order by a.display_name, m.account_id)
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
  if not lv_private.outranks(hub_id, v_caller, account_id) then
    return lv_private.fail('lv_forbidden', 'That member holds authority you do not.', jsonb_build_object('reason', 'target_exceeds_your_authority'));
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
  if not lv_private.outranks(hub_id, v_caller, account_id) then
    return lv_private.fail('lv_forbidden', 'That member holds authority you do not.', jsonb_build_object('reason', 'target_exceeds_your_authority'));
  end if;
  if v_status not in ('accepted', 'suspended') then
    return lv_private.fail('lv_conflict', 'Only an accepted member can be suspended.', jsonb_build_object('status', v_status));
  end if;
  update lv_private.hub_memberships m set status = 'suspended'
  where m.hub_id = lv_suspend_member.hub_id and m.account_id = lv_suspend_member.account_id;
  return lv_private.ok(jsonb_build_object('hub_id', hub_id, 'account_id', account_id, 'status', 'suspended'));
end;
$$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'lv_capability_catalog', 'lv_role_list', 'lv_role_create', 'lv_role_update', 'lv_role_delete',
      'lv_role_assign', 'lv_role_unassign', 'lv_role_set_capability', 'lv_role_set_group',
      'lv_owner_transfer_start', 'lv_owner_transfer_accept', 'lv_owner_transfer_cancel',
      'lv_my_context', 'lv_members_list', 'lv_remove_member', 'lv_suspend_member')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
  end loop;
end;
$$;
