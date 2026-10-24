-- LunchVoice v2 foundation 1/N: accounts, Hubs and memberships.
--
-- ADDITIVE. Creates the private schema `lv_private` and public RPCs `lv_*`; changes no existing table,
-- policy, grant or function. It does add one AFTER INSERT trigger on public.profiles that mirrors new legacy
-- users into the v2 tables; that trigger can never fail a signup (errors become warnings).
--
-- NOT APPLIED TO PRODUCTION. The legacy org -> Hub backfill is a separate, explicitly authorized operation:
-- lv_private.backfill_org_hub(org_id, owner_account_id). The Owner is a required input and is never inferred.
--
-- Contract: contract/ (operations lv_my_context, lv_hub_public, lv_join_hub, lv_decide_join, lv_leave_hub,
-- lv_remove_member, lv_suspend_member, lv_member_count, lv_members_list). Capabilities and roles arrive in the
-- next migration; until then only the Owner may admit, remove, suspend or list members.
--
-- Provisional, not founder-approved: Hub defaults (private, invite_only), "reject deletes the pending
-- application", "removed members cannot rejoin", invite codes (not implemented). See contract notes.

create schema if not exists lv_private;
revoke all on schema lv_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Tables (all in lv_private: never exposed through the Data API; RLS enabled as defence in depth)
-- ---------------------------------------------------------------------------------------------------------

create table lv_private.accounts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) > 0),
  created_at timestamptz not null default now()
);

-- One row per sign-in identity. Accounts are linked to identities explicitly; they are never merged by email.
create table lv_private.account_identities (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  account_id uuid not null references lv_private.accounts (id) on delete restrict,
  provider text not null default 'legacy',
  created_at timestamptz not null default now()
);
create index account_identities_account_idx on lv_private.account_identities (account_id);

-- A Hub extends an existing organization: hubs.id IS orgs.id, so ids, slugs and deep links are preserved and a
-- legacy organization can never produce a duplicate Hub.
create table lv_private.hubs (
  id uuid primary key references public.orgs (id) on delete restrict,
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  membership_mode text not null default 'invite_only' check (membership_mode in ('open', 'approval', 'invite_only')),
  owner_account_id uuid references lv_private.accounts (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table lv_private.hub_memberships (
  hub_id uuid not null references lv_private.hubs (id) on delete restrict,
  account_id uuid not null references lv_private.accounts (id) on delete restrict,
  status text not null check (status in ('accepted', 'pending', 'invited', 'suspended', 'left', 'removed')),
  source text not null default 'v2' check (source in ('v2', 'legacy_backfill', 'legacy_signup')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hub_id, account_id)
);
create index hub_memberships_status_idx on lv_private.hub_memberships (hub_id, status);
create index hub_memberships_account_idx on lv_private.hub_memberships (account_id);

-- Append-only audit trail written by trigger, whichever path changed the membership.
create table lv_private.hub_membership_events (
  id bigint generated always as identity primary key,
  hub_id uuid not null,
  account_id uuid not null,
  actor_account_id uuid,
  event text not null check (event in ('insert', 'update', 'delete')),
  from_status text,
  to_status text,
  at timestamptz not null default now()
);

alter table lv_private.accounts enable row level security;
alter table lv_private.account_identities enable row level security;
alter table lv_private.hubs enable row level security;
alter table lv_private.hub_memberships enable row level security;
alter table lv_private.hub_membership_events enable row level security;
revoke all on all tables in schema lv_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Internal helpers (lv_private; not callable through the API)
-- ---------------------------------------------------------------------------------------------------------

create function lv_private.request_id() returns text
language sql volatile set search_path = ''
as $$ select 'req_' || substr(md5(random()::text || clock_timestamp()::text), 1, 16) $$;

create function lv_private.ok(p_data jsonb) returns jsonb
language sql volatile set search_path = ''
as $$ select jsonb_build_object('ok', true, 'data', p_data, 'request_id', lv_private.request_id()) $$;

create function lv_private.fail(p_code text, p_message text, p_details jsonb default null) returns jsonb
language sql volatile set search_path = ''
as $$
  select jsonb_build_object(
    'ok', false,
    'error', case when p_details is null then jsonb_build_object('code', p_code, 'message', p_message)
                  else jsonb_build_object('code', p_code, 'message', p_message, 'details', p_details) end,
    'request_id', lv_private.request_id())
$$;

-- Account of the signed-in identity, without creating one.
create function lv_private.current_account_id() returns uuid
language sql stable security definer set search_path = ''
as $$ select i.account_id from lv_private.account_identities i where i.auth_user_id = auth.uid() $$;

-- Account of the signed-in identity, creating it on first use. The account id is the auth user id when free, so
-- legacy users keep their existing id. Never matches or merges on email.
create function lv_private.ensure_account() returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_acc uuid;
  v_name text;
begin
  if v_uid is null then return null; end if;
  select i.account_id into v_acc from lv_private.account_identities i where i.auth_user_id = v_uid;
  if v_acc is not null then return v_acc; end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_account:' || v_uid::text, 0));
  select i.account_id into v_acc from lv_private.account_identities i where i.auth_user_id = v_uid;
  if v_acc is not null then return v_acc; end if;

  select coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(split_part(p.email, '@', 1)), ''))
    into v_name from public.profiles p where p.id = v_uid;
  v_name := coalesce(v_name, 'Member');

  if exists (select 1 from lv_private.accounts a where a.id = v_uid) then
    insert into lv_private.accounts (display_name) values (v_name) returning id into v_acc;
  else
    insert into lv_private.accounts (id, display_name) values (v_uid, v_name) returning id into v_acc;
  end if;
  insert into lv_private.account_identities (auth_user_id, account_id, provider) values (v_uid, v_acc, 'supabase_auth');
  return v_acc;
end;
$$;

create function lv_private.membership_status(p_hub uuid, p_account uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select m.status from lv_private.hub_memberships m where m.hub_id = p_hub and m.account_id = p_account
$$;

create function lv_private.is_owner(p_hub uuid, p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from lv_private.hubs h
    join lv_private.hub_memberships m on m.hub_id = h.id and m.account_id = h.owner_account_id and m.status = 'accepted'
    where h.id = p_hub and h.owner_account_id = p_account)
$$;

-- Server-side capability check. Roles do not exist yet: only the Owner holds any capability.
-- The roles migration replaces this body; callers do not change.
create function lv_private.has_capability(p_hub uuid, p_account uuid, p_capability text) returns boolean
language sql stable security definer set search_path = ''
as $$ select p_account is not null and lv_private.is_owner(p_hub, p_account) $$;

-- ---------------------------------------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------------------------------------

-- The Owner's membership cannot be removed, downgraded or re-keyed except by the (future) transfer flow,
-- which sets lv.owner_transfer = 'on' for its own transaction.
create function lv_private.protect_owner_membership() returns trigger
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
create trigger hub_memberships_protect_owner before update or delete on lv_private.hub_memberships
  for each row execute function lv_private.protect_owner_membership();

create function lv_private.protect_hub_owner() returns trigger
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
create trigger hubs_protect_owner before insert or update on lv_private.hubs
  for each row execute function lv_private.protect_hub_owner();

create function lv_private.log_membership_event() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := lv_private.current_account_id();
begin
  if tg_op = 'INSERT' then
    insert into lv_private.hub_membership_events (hub_id, account_id, actor_account_id, event, to_status)
    values (new.hub_id, new.account_id, v_actor, 'insert', new.status);
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      insert into lv_private.hub_membership_events (hub_id, account_id, actor_account_id, event, from_status, to_status)
      values (new.hub_id, new.account_id, v_actor, 'update', old.status, new.status);
    end if;
  else
    insert into lv_private.hub_membership_events (hub_id, account_id, actor_account_id, event, from_status)
    values (old.hub_id, old.account_id, v_actor, 'delete', old.status);
  end if;
  return null;
end;
$$;
create trigger hub_memberships_audit after insert or update or delete on lv_private.hub_memberships
  for each row execute function lv_private.log_membership_event();

create function lv_private.touch_membership() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;
create trigger hub_memberships_touch before update on lv_private.hub_memberships
  for each row execute function lv_private.touch_membership();

-- Mirrors a newly created legacy profile into the v2 tables (account with the same id, identity, and an
-- accepted membership when its organization already is a Hub). Never blocks signup.
create function lv_private.sync_profile() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text;
begin
  begin
    v_name := coalesce(nullif(btrim(new.display_name), ''), nullif(btrim(split_part(new.email, '@', 1)), ''), 'Member');
    insert into lv_private.accounts (id, display_name) values (new.id, v_name) on conflict (id) do nothing;
    insert into lv_private.account_identities (auth_user_id, account_id, provider)
      values (new.id, new.id, 'legacy') on conflict (auth_user_id) do nothing;
    if exists (select 1 from lv_private.hubs h where h.id = new.org_id) then
      insert into lv_private.hub_memberships (hub_id, account_id, status, source, joined_at)
      select new.org_id, i.account_id, 'accepted', 'legacy_signup', now()
      from lv_private.account_identities i where i.auth_user_id = new.id
      on conflict (hub_id, account_id) do nothing;
    end if;
  exception when others then
    raise warning 'lv sync_profile skipped for profile %: % (%)', new.id, sqlerrm, sqlstate;
  end;
  return null;
end;
$$;
create trigger profiles_sync_v2 after insert on public.profiles
  for each row execute function lv_private.sync_profile();

-- ---------------------------------------------------------------------------------------------------------
-- Operator functions (lv_private; run by a migration operator via SQL, not exposed to the API)
-- ---------------------------------------------------------------------------------------------------------

-- Turns an existing organization into a Hub, repeatably. One transaction: an interruption leaves nothing
-- behind and a retry is safe. Preserves orgs.id/slug and every profile/points/history row (nothing legacy is
-- written). Never overwrites an existing membership status (so suspensions and removals survive a re-run) and
-- never changes an existing Owner. The Owner is a REQUIRED input: it is not inferred from email, title, role
-- or "first admin", and it must be a legacy member of the same organization.
create function lv_private.backfill_org_hub(p_org_id uuid, p_owner_account_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_accounts int; v_identities int; v_members int; v_hub_created boolean := false;
  v_existing_owner uuid; v_profiles int;
begin
  if p_org_id is null then raise exception 'p_org_id is required'; end if;
  if p_owner_account_id is null then
    raise exception 'p_owner_account_id is required: the authoritative Owner mapping must be supplied explicitly';
  end if;
  if not exists (select 1 from public.orgs o where o.id = p_org_id) then
    raise exception 'organization % does not exist', p_org_id;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_backfill:' || p_org_id::text, 0));

  select count(*) into v_profiles from public.profiles p where p.org_id = p_org_id;

  with ins as (
    insert into lv_private.accounts (id, display_name)
    select p.id, coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(split_part(p.email, '@', 1)), ''), 'Member')
    from public.profiles p
    where p.org_id = p_org_id
      and not exists (select 1 from lv_private.account_identities i where i.auth_user_id = p.id)
      and not exists (select 1 from lv_private.accounts a where a.id = p.id)
    returning 1)
  select count(*) into v_accounts from ins;

  with ins as (
    insert into lv_private.account_identities (auth_user_id, account_id, provider)
    select p.id, p.id, 'legacy'
    from public.profiles p
    where p.org_id = p_org_id
      and exists (select 1 from lv_private.accounts a where a.id = p.id)
      and not exists (select 1 from lv_private.account_identities i where i.auth_user_id = p.id)
    returning 1)
  select count(*) into v_identities from ins;

  -- The Owner must already be a legacy member of this organization.
  if not exists (
    select 1 from lv_private.account_identities i
    join public.profiles p on p.id = i.auth_user_id
    where i.account_id = p_owner_account_id and p.org_id = p_org_id) then
    raise exception 'owner account % is not a legacy member of organization %', p_owner_account_id, p_org_id;
  end if;

  with ins as (
    insert into lv_private.hubs (id) values (p_org_id) on conflict (id) do nothing returning 1)
  select count(*) > 0 into v_hub_created from ins;

  with ins as (
    insert into lv_private.hub_memberships (hub_id, account_id, status, source, joined_at)
    select p_org_id, i.account_id, 'accepted', 'legacy_backfill', p.created_at
    from public.profiles p
    join lv_private.account_identities i on i.auth_user_id = p.id
    where p.org_id = p_org_id
    on conflict (hub_id, account_id) do nothing
    returning 1)
  select count(*) into v_members from ins;

  select h.owner_account_id into v_existing_owner from lv_private.hubs h where h.id = p_org_id;
  if v_existing_owner is not null and v_existing_owner <> p_owner_account_id then
    raise exception 'Hub % already has a different Owner; the backfill never changes an Owner', p_org_id;
  end if;
  if v_existing_owner is null then
    if lv_private.membership_status(p_org_id, p_owner_account_id) is distinct from 'accepted' then
      raise exception 'owner account % is not an accepted member of Hub %', p_owner_account_id, p_org_id;
    end if;
    update lv_private.hubs h set owner_account_id = p_owner_account_id where h.id = p_org_id;
  end if;

  return jsonb_build_object(
    'org_id', p_org_id, 'hub_created', v_hub_created, 'profiles_in_org', v_profiles,
    'accounts_created', v_accounts, 'identities_created', v_identities, 'memberships_created', v_members,
    'owner_account_id', p_owner_account_id);
end;
$$;

-- Read-only reconciliation: what exists on each side, and every gap.
create function lv_private.reconcile_org_hub(p_org_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'org_id', p_org_id,
    'org_exists', exists (select 1 from public.orgs o where o.id = p_org_id),
    'hub_exists', exists (select 1 from lv_private.hubs h where h.id = p_org_id),
    'owner_account_id', (select h.owner_account_id from lv_private.hubs h where h.id = p_org_id),
    'profiles_in_org', (select count(*) from public.profiles p where p.org_id = p_org_id),
    'profiles_without_account', (select count(*) from public.profiles p where p.org_id = p_org_id
        and not exists (select 1 from lv_private.account_identities i where i.auth_user_id = p.id)),
    'profiles_without_membership', (select count(*) from public.profiles p where p.org_id = p_org_id
        and not exists (select 1 from lv_private.account_identities i
                        join lv_private.hub_memberships m on m.account_id = i.account_id and m.hub_id = p_org_id
                        where i.auth_user_id = p.id)),
    'memberships_by_status', coalesce((select jsonb_object_agg(s.status, s.n) from (
        select m.status, count(*) as n from lv_private.hub_memberships m where m.hub_id = p_org_id group by m.status) s), '{}'::jsonb),
    'v2_native_members', (select count(*) from lv_private.hub_memberships m where m.hub_id = p_org_id and m.source = 'v2'),
    'legacy_points_total', (select coalesce(sum(p.points), 0) from public.profiles p where p.org_id = p_org_id)
  )
$$;

revoke all on all functions in schema lv_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Public RPCs (PostgREST: POST /rest/v1/rpc/lv_*). Argument names are the contract's request keys.
-- All return the envelope { ok, data, request_id } | { ok:false, error, request_id } with HTTP 200.
-- ---------------------------------------------------------------------------------------------------------

create function public.lv_my_context() returns jsonb
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

create function public.lv_hub_public(slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record; v_acc uuid := lv_private.current_account_id(); v_status text; v_viewer text; v_count bigint;
begin
  if slug is null or length(slug) < 2 or length(slug) > 40 then
    return lv_private.fail('lv_invalid_input', 'Check the Hub address.');
  end if;
  select h.id, h.visibility, h.membership_mode, o.name, o.slug into r
  from lv_private.hubs h join public.orgs o on o.id = h.id
  where lower(o.slug) = lower(lv_hub_public.slug);
  if not found then return lv_private.fail('lv_not_found', 'Not found.'); end if;

  v_status := case when v_acc is null then null else lv_private.membership_status(r.id, v_acc) end;
  v_viewer := case when v_status in ('accepted', 'pending', 'invited', 'suspended') then v_status else 'none' end;
  select count(*) into v_count from lv_private.hub_memberships m where m.hub_id = r.id and m.status = 'accepted';

  return lv_private.ok(jsonb_build_object(
    'hub_id', r.id, 'slug', lower(r.slug), 'name', r.name,
    'visibility', r.visibility, 'membership_mode', r.membership_mode,
    'member_count', case when r.visibility = 'public' or v_viewer = 'accepted' then to_jsonb(v_count) else 'null'::jsonb end,
    'viewer', jsonb_build_object('status', v_viewer,
      'can_join', (v_viewer = 'none' and r.membership_mode <> 'invite_only') or v_viewer = 'invited')));
end;
$$;

create function public.lv_member_count(hub_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record; v_acc uuid := lv_private.current_account_id(); v_count bigint;
begin
  select h.id, h.visibility into r from lv_private.hubs h where h.id = lv_member_count.hub_id;
  -- A private Hub looks identical to a missing one to everybody who is not an accepted member.
  if not found or (r.visibility = 'private' and lv_private.membership_status(r.id, v_acc) is distinct from 'accepted') then
    return lv_private.fail('lv_not_found', 'Not found.');
  end if;
  select count(*) into v_count from lv_private.hub_memberships m where m.hub_id = r.id and m.status = 'accepted';
  return lv_private.ok(jsonb_build_object('hub_id', r.id, 'member_count', v_count));
end;
$$;

create function public.lv_join_hub(hub_id uuid, invite_code text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r record; v_acc uuid; v_status text; v_new text;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null then return lv_private.fail('lv_invalid_input', 'hub_id is required.'); end if;
  select h.id, h.membership_mode into r from lv_private.hubs h where h.id = lv_join_hub.hub_id;
  if not found then return lv_private.fail('lv_not_found', 'Not found.'); end if;

  v_acc := lv_private.ensure_account();
  perform pg_advisory_xact_lock(hashtextextended('lv_join:' || r.id::text || v_acc::text, 0));
  v_status := lv_private.membership_status(r.id, v_acc);

  if v_status in ('accepted', 'pending') then
    return lv_private.ok(jsonb_build_object('status', v_status));
  elsif v_status in ('suspended', 'removed') then
    return lv_private.fail('lv_forbidden', 'You cannot join this Hub.');
  elsif v_status = 'invited' then
    v_new := 'accepted';
  elsif r.membership_mode = 'open' then
    v_new := 'accepted';
  elsif r.membership_mode = 'approval' then
    v_new := 'pending';
  else
    -- invite_only without an invitation. Invite codes are not implemented yet (provisional).
    return lv_private.fail('lv_forbidden', 'This Hub is invite only.');
  end if;

  insert into lv_private.hub_memberships (hub_id, account_id, status, joined_at)
  values (r.id, v_acc, v_new, case when v_new = 'accepted' then now() end)
  on conflict on constraint hub_memberships_pkey do update
    set status = excluded.status,
        joined_at = case when excluded.status = 'accepted' then now() else lv_private.hub_memberships.joined_at end;
  return lv_private.ok(jsonb_build_object('status', v_new));
end;
$$;

create function public.lv_decide_join(hub_id uuid, account_id uuid, decision text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_status text;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null or account_id is null or decision is null or decision not in ('accept', 'reject') then
    return lv_private.fail('lv_invalid_input', 'Check the request.');
  end if;
  v_caller := lv_private.current_account_id();
  if not exists (select 1 from lv_private.hubs h where h.id = lv_decide_join.hub_id)
     or not lv_private.has_capability(hub_id, v_caller, 'admin.members.admit') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_join:' || hub_id::text || account_id::text, 0));
  v_status := lv_private.membership_status(hub_id, account_id);
  if v_status is null then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  if v_status <> 'pending' then
    return lv_private.fail('lv_conflict', 'That application is no longer pending.', jsonb_build_object('status', v_status));
  end if;
  if decision = 'accept' then
    update lv_private.hub_memberships m set status = 'accepted', joined_at = now()
    where m.hub_id = lv_decide_join.hub_id and m.account_id = lv_decide_join.account_id;
    return lv_private.ok(jsonb_build_object('hub_id', hub_id, 'account_id', account_id, 'status', 'accepted'));
  end if;
  -- Provisional: a rejected application is deleted (the audit trail keeps the event) so the person may re-apply.
  delete from lv_private.hub_memberships m where m.hub_id = lv_decide_join.hub_id and m.account_id = lv_decide_join.account_id;
  return lv_private.ok(jsonb_build_object('hub_id', hub_id, 'account_id', account_id, 'status', 'removed'));
end;
$$;

create function public.lv_leave_hub(hub_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_status text;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  v_caller := lv_private.current_account_id();
  v_status := case when v_caller is null then null else lv_private.membership_status(hub_id, v_caller) end;
  if v_status is null or v_status in ('left', 'removed') then
    return lv_private.fail('lv_not_member', 'You are not a member of this Hub.');
  end if;
  if lv_private.is_owner(hub_id, v_caller) then
    return lv_private.fail('lv_forbidden', 'The Owner must transfer ownership before leaving.');
  end if;
  if v_status = 'suspended' then
    return lv_private.fail('lv_forbidden', 'A suspended membership cannot be left.');
  end if;
  update lv_private.hub_memberships m set status = 'left'
  where m.hub_id = lv_leave_hub.hub_id and m.account_id = v_caller;
  return lv_private.ok(jsonb_build_object('hub_id', hub_id, 'account_id', v_caller, 'status', 'left'));
end;
$$;

create function public.lv_remove_member(hub_id uuid, account_id uuid) returns jsonb
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

create function public.lv_suspend_member(hub_id uuid, account_id uuid) returns jsonb
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

create function public.lv_members_list(hub_id uuid) returns jsonb
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

-- Every lv_* RPC checks the caller itself and answers with an envelope, so anon may execute them.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'lv_my_context', 'lv_hub_public', 'lv_member_count', 'lv_join_hub', 'lv_decide_join',
      'lv_leave_hub', 'lv_remove_member', 'lv_suspend_member', 'lv_members_list')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
  end loop;
end;
$$;
