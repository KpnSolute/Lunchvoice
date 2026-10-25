-- LunchVoice v2 foundation 8/N: identity-first corrections (central KpnSolute identity, no automatic legacy membership).
--
-- DEPENDS ON migrations 1-7. NOT APPLIED TO PRODUCTION. These migrations have never been applied anywhere, so this one corrects the
-- design before it ships rather than carrying legacy assumptions into a fresh install:
--   * A person is a CENTRAL identity identified by (issuer, subject) from a verified token, not by a Supabase-local auth user. The
--     issuers a database accepts are an explicit allow-list (policy identity.trusted_issuers, UNSET = nobody is signed in). A token
--     from any other issuer, or a browser-supplied account id, is never accepted. One identity maps to exactly one product account;
--     repeat sign-ins and concurrent first sign-ins create one account. Accounts are never linked by email or display name.
--     Assumption to be confirmed against the real provider: the verified token carries `iss`, `sub` (a UUID), and optionally
--     `email`, `email_verified` and `name`.
--   * Signing up never grants membership. The profile-signup mirror trigger is removed from the product (the function stays as an
--     operator-only legacy tool).
--   * A Hub no longer depends on a legacy organization row: it has its own slug and display name, so private Hubs are not listed by the
--     legacy organizations table. Legacy Hubs created by the backfill keep using their organization's slug and name.
--   * A platform administrator (a company-level reviewer, distinct from any Hub Owner) is provisioned only by an audited operator
--     function. The first registered person is never an administrator.

-- ---------------------------------------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------------------------------------
insert into lv_private.policy (key, value, note) values
  ('identity.trusted_issuers', null,
   'JSON array of token issuers this database accepts as a signed-in person, for example the central KpnSolute auth issuer. Undecided: NULL means no token is accepted (nobody can use lv_* operations that need a person). Each subject must be a UUID. Set only after the real issuer and signing keys are verified (D-01).');

alter table lv_private.account_identities drop constraint if exists account_identities_pkey;
alter table lv_private.account_identities drop constraint if exists account_identities_auth_user_id_fkey;
alter table lv_private.account_identities add column id uuid not null default gen_random_uuid();
alter table lv_private.account_identities add primary key (id);
alter table lv_private.account_identities alter column auth_user_id drop not null;
alter table lv_private.account_identities add column issuer text;
alter table lv_private.account_identities add column subject text;
alter table lv_private.account_identities add column email_verified_at timestamptz;
update lv_private.account_identities set issuer = 'urn:lunchvoice:legacy-auth-user', subject = auth_user_id::text where issuer is null and auth_user_id is not null;
alter table lv_private.account_identities alter column issuer set not null;
alter table lv_private.account_identities alter column subject set not null;
create unique index account_identities_issuer_subject_idx on lv_private.account_identities (issuer, subject);
alter table lv_private.account_identities add constraint account_identities_auth_user_id_key unique (auth_user_id);   -- NULLs (central identities) are allowed many times

-- Operator paths that still create identities from a legacy auth user id (backfill, repair) get their issuer and subject filled in.
create function lv_private.fill_identity_columns() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.issuer is null and new.auth_user_id is not null then
    new.issuer := 'urn:lunchvoice:legacy-auth-user';
    new.subject := new.auth_user_id::text;
  end if;
  return new;
end;
$$;
create trigger account_identities_fill before insert on lv_private.account_identities for each row execute function lv_private.fill_identity_columns();

-- The verified person behind the request, or NULL. Reads only claims PostgREST has already verified against the project's keys, and
-- only for an allow-listed issuer with a UUID subject.
create function lv_private.caller_identity() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_claims jsonb; v_trusted jsonb; v_iss text; v_sub text;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return null;
  end;
  if v_claims is null or jsonb_typeof(v_claims) <> 'object' then return null; end if;
  v_iss := v_claims->>'iss';
  v_sub := v_claims->>'sub';
  if v_iss is null or v_sub is null or v_sub !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return null; end if;
  select p.value into v_trusted from lv_private.policy p where p.key = 'identity.trusted_issuers';
  if v_trusted is null or jsonb_typeof(v_trusted) <> 'array' or not (v_trusted ? v_iss) then return null; end if;
  return jsonb_build_object('issuer', v_iss, 'subject', lower(v_sub),
    'email', nullif(btrim(v_claims->>'email'), ''), 'name', nullif(btrim(v_claims->>'name'), ''),
    'email_verified', coalesce(v_claims->>'email_verified', 'false') = 'true');
end;
$$;

create or replace function lv_private.current_account_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select i.account_id from lv_private.account_identities i
  where lv_private.caller_identity() is not null
    and i.issuer = lv_private.caller_identity()->>'issuer' and i.subject = lv_private.caller_identity()->>'subject'
$$;

-- The caller's account, created on first sign-in. Never matches on email or name. The new account takes the subject as its id when that
-- is free (stable and deterministic), otherwise a random id.
create or replace function lv_private.ensure_account() returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_ci jsonb := lv_private.caller_identity();
  v_acc uuid; v_name text; v_id uuid;
begin
  if v_ci is null then return null; end if;
  select i.account_id into v_acc from lv_private.account_identities i where i.issuer = v_ci->>'issuer' and i.subject = v_ci->>'subject';
  if v_acc is not null then
    if (v_ci->>'email_verified')::boolean then
      update lv_private.account_identities i set email_verified_at = coalesce(i.email_verified_at, now()) where i.issuer = v_ci->>'issuer' and i.subject = v_ci->>'subject';
    end if;
    return v_acc;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_account:' || (v_ci->>'issuer') || '|' || (v_ci->>'subject'), 0));
  select i.account_id into v_acc from lv_private.account_identities i where i.issuer = v_ci->>'issuer' and i.subject = v_ci->>'subject';
  if v_acc is not null then return v_acc; end if;

  v_name := coalesce(nullif(btrim(v_ci->>'name'), ''), nullif(btrim(split_part(coalesce(v_ci->>'email', ''), '@', 1)), ''), 'Member');
  v_id := (v_ci->>'subject')::uuid;
  if exists (select 1 from lv_private.accounts a where a.id = v_id) then v_id := gen_random_uuid(); end if;
  insert into lv_private.accounts (id, display_name) values (v_id, left(v_name, 80)) returning id into v_acc;
  insert into lv_private.account_identities (account_id, issuer, subject, provider, auth_user_id, email_verified_at)
  values (v_acc, v_ci->>'issuer', v_ci->>'subject', 'central',
          case when v_ci->>'issuer' = 'urn:lunchvoice:legacy-auth-user' then (v_ci->>'subject')::uuid end,
          case when (v_ci->>'email_verified')::boolean then now() end);
  return v_acc;
end;
$$;

-- Signing up creates no membership and no v2 row of any kind.
drop trigger if exists profiles_sync_v2 on public.profiles;

-- ---------------------------------------------------------------------------------------------------------
-- Hubs own their address and name
-- ---------------------------------------------------------------------------------------------------------
alter table lv_private.hubs drop constraint if exists hubs_id_fkey;
alter table lv_private.hubs add column slug text check (slug is null or slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' and length(slug) between 2 and 40);
create unique index hubs_slug_idx on lv_private.hubs (lower(slug)) where slug is not null;

create function lv_private.hub_slug(p_hub uuid) returns text
language sql stable security definer set search_path = ''
as $$ select coalesce(h.slug, o.slug) from lv_private.hubs h left join public.orgs o on o.id = h.id where h.id = p_hub $$;

create function lv_private.hub_name(p_hub uuid) returns text
language sql stable security definer set search_path = ''
as $$ select coalesce(h.display_name, o.name) from lv_private.hubs h left join public.orgs o on o.id = h.id where h.id = p_hub $$;

-- Platform administration: company-level reviewers (for beta approval). Not a Hub role, not inferred from anything, and not
-- grantable through the API.
create table lv_private.platform_admins (
  account_id uuid primary key references lv_private.accounts (id) on delete restrict,
  granted_by text not null,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table lv_private.platform_admins enable row level security;

create table lv_private.platform_admin_events (
  id bigint generated always as identity primary key,
  account_id uuid not null,
  event text not null check (event in ('granted', 'revoked')),
  by_operator text not null,
  reason text not null,
  at timestamptz not null default now()
);
alter table lv_private.platform_admin_events enable row level security;

create function lv_private.is_platform_admin(p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select p_account is not null and exists (select 1 from lv_private.platform_admins a where a.account_id = p_account and a.revoked_at is null) $$;

create function lv_private.grant_platform_admin(p_account uuid, p_operator text, p_reason text) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if p_operator is null or length(btrim(p_operator)) < 2 then raise exception 'the operator must be named'; end if;
  if not exists (select 1 from lv_private.accounts a where a.id = p_account) then raise exception 'unknown account %', p_account; end if;
  insert into lv_private.platform_admins (account_id, granted_by, reason) values (p_account, p_operator, p_reason)
  on conflict (account_id) do update set revoked_at = null, granted_by = excluded.granted_by, reason = excluded.reason, granted_at = now();
  insert into lv_private.platform_admin_events (account_id, event, by_operator, reason) values (p_account, 'granted', p_operator, p_reason);
end;
$$;

create function lv_private.revoke_platform_admin(p_account uuid, p_operator text, p_reason text) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update lv_private.platform_admins a set revoked_at = now() where a.account_id = p_account and a.revoked_at is null;
  insert into lv_private.platform_admin_events (account_id, event, by_operator, reason) values (p_account, 'revoked', p_operator, p_reason);
end;
$$;

-- RPCs that showed a Hub's name or address now read them from the Hub itself.
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
  if v_acc is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  select a.display_name into v_name from lv_private.accounts a where a.id = v_acc;

  select coalesce(jsonb_agg(jsonb_build_object(
      'hub_id', h.id, 'slug', lower(lv_private.hub_slug(h.id)), 'name', lv_private.hub_name(h.id), 'status', 'accepted',
      'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'icon', r.icon) order by r.name, r.id)
                         from lv_private.role_assignments ra join lv_private.roles r on r.id = ra.role_id
                         where ra.hub_id = h.id and ra.account_id = m.account_id), '[]'::jsonb),
      'capabilities', to_jsonb(lv_private.held_capabilities(h.id, m.account_id)),
      'is_owner', h.owner_account_id = m.account_id)
      order by lv_private.hub_name(h.id), h.id), '[]'::jsonb)
    into v_mem
  from lv_private.hub_memberships m
  join lv_private.hubs h on h.id = m.hub_id
  where m.account_id = v_acc and m.status = 'accepted';

  select coalesce(jsonb_agg(jsonb_build_object(
      'hub_id', h.id, 'slug', lower(lv_private.hub_slug(h.id)), 'name', lv_private.hub_name(h.id), 'status', m.status)
      order by lv_private.hub_name(h.id), h.id), '[]'::jsonb)
    into v_pen
  from lv_private.hub_memberships m
  join lv_private.hubs h on h.id = m.hub_id
  where m.account_id = v_acc and m.status in ('pending', 'invited');

  return lv_private.ok(jsonb_build_object(
    'account', jsonb_build_object('id', v_acc, 'display_name', v_name),
    'memberships', v_mem, 'pending', v_pen));
end;
$$;

create or replace function public.lv_hub_public(slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record; v_acc uuid := lv_private.current_account_id(); v_status text; v_viewer text; v_count bigint;
begin
  if slug is null or length(slug) < 2 or length(slug) > 40 then
    return lv_private.fail('lv_invalid_input', 'Check the Hub address.');
  end if;
  select h.id, h.visibility, h.membership_mode, lv_private.hub_name(h.id) as name, lv_private.hub_slug(h.id) as slug into r
  from lv_private.hubs h
  where lower(lv_private.hub_slug(h.id)) = lower(lv_hub_public.slug);
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

create or replace function public.lv_hub_settings_update(hub_id uuid, name text default null, visibility text default null, membership_mode text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_name text := lv_private.clean_text(name, 80); h record; v_changes jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null then return lv_private.fail('lv_invalid_input', 'hub_id is required.'); end if;
  if not exists (select 1 from lv_private.hubs x where x.id = lv_hub_settings_update.hub_id) then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  v_caller := lv_private.current_account_id();
  if not lv_private.has_capability(hub_id, v_caller, 'admin.settings.edit') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  if (name is null and visibility is null and membership_mode is null)
     or (name is not null and v_name is null)
     or (visibility is not null and visibility not in ('public', 'private'))
     or (membership_mode is not null and membership_mode not in ('open', 'approval', 'invite_only')) then
    return lv_private.fail('lv_invalid_input', 'Check the settings.');
  end if;
  perform 1 from lv_private.hubs x where x.id = lv_hub_settings_update.hub_id for update;
  select x.display_name, x.visibility, x.membership_mode into h from lv_private.hubs x where x.id = lv_hub_settings_update.hub_id;
  if v_name is not null and v_name is distinct from h.display_name then v_changes := v_changes || jsonb_build_object('name', jsonb_build_object('from', h.display_name, 'to', v_name)); end if;
  if visibility is not null and visibility <> h.visibility then v_changes := v_changes || jsonb_build_object('visibility', jsonb_build_object('from', h.visibility, 'to', visibility)); end if;
  if membership_mode is not null and membership_mode <> h.membership_mode then v_changes := v_changes || jsonb_build_object('membership_mode', jsonb_build_object('from', h.membership_mode, 'to', membership_mode)); end if;
  if v_changes <> '{}'::jsonb then
    update lv_private.hubs x set display_name = coalesce(v_name, x.display_name),
      visibility = coalesce(lv_hub_settings_update.visibility, x.visibility),
      membership_mode = coalesce(lv_hub_settings_update.membership_mode, x.membership_mode)
    where x.id = lv_hub_settings_update.hub_id;
    insert into lv_private.hub_settings_events (hub_id, actor_account_id, changes) values (hub_id, v_caller, v_changes);
  end if;
  return lv_private.ok((select jsonb_build_object('hub_id', x.id, 'name', lv_private.hub_name(x.id), 'visibility', x.visibility, 'membership_mode', x.membership_mode)
                        from lv_private.hubs x where x.id = lv_hub_settings_update.hub_id));
end;
$$;

create or replace function public.lv_campaign_resolve(code text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record; v_caller uuid := lv_private.current_account_id();
begin
  if code is null or length(btrim(code)) < 1 or length(code) > 64 then return lv_private.fail('lv_invalid_input', 'Enter a code.'); end if;
  select c.id, c.title, c.anonymous, c.state, c.closes_at, h.id as hub_id, h.visibility, lv_private.hub_slug(h.id) as slug into r
  from lv_private.campaigns c join lv_private.hubs h on h.id = c.hub_id
  where c.join_code = upper(btrim(code)) and c.state in ('active', 'closed', 'expired');
  if not found or (r.visibility = 'private' and (v_caller is null or lv_private.membership_status(r.hub_id, v_caller) is distinct from 'accepted')) then
    return lv_private.fail('lv_not_found', 'No Campaign matches that code.');
  end if;
  return lv_private.ok(jsonb_build_object('campaign_id', r.id, 'hub_id', r.hub_id, 'hub_slug', lower(r.slug), 'title', r.title,
    'state', lv_private.campaign_effective_state(r.state, r.closes_at), 'anonymous', r.anonymous, 'requires_account', true));
end;
$$;

create or replace function public.lv_join_hub(hub_id uuid, invite_code text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  r record; v_acc uuid; v_status text; v_new text;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null then return lv_private.fail('lv_invalid_input', 'hub_id is required.'); end if;
  -- Code redemption does not exist yet. A supplied code is refused loudly instead of being ignored, so a caller
  -- never believes a code worked. Account-bound invitations (status 'invited') are a different mechanism and
  -- are accepted by calling this function WITHOUT a code. Checked before any lookup or write: no side effects.
  if invite_code is not null and btrim(invite_code) <> '' then
    return lv_private.fail('lv_policy_undecided', 'Invite codes are not supported yet.',
      jsonb_build_object('reason', 'invite_code_unsupported'));
  end if;
  select h.id, h.membership_mode into r from lv_private.hubs h where h.id = lv_join_hub.hub_id;
  if not found then return lv_private.fail('lv_not_found', 'Not found.'); end if;

  v_acc := lv_private.ensure_account();
  if v_acc is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
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

revoke all on all tables in schema lv_private from public, anon, authenticated;
revoke all on all functions in schema lv_private from public, anon, authenticated;
