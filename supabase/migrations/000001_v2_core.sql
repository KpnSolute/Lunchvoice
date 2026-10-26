-- LunchVoice v2 canonical baseline 1/6: core identity, Hubs and memberships.
--
-- FRESH INSTALL. This file assumes a BLANK database and requires no legacy table. It is the canonical
-- replacement for prototype migrations 20261024000100, 20261024000800 and 20261024001100 (see
-- docs/backend/V2_MIGRATION_CLASSIFICATION.md). It deliberately does NOT create:
--   * public.orgs / public.profiles as parents of anything (v1 concepts; see S-4/S-5/S-6),
--   * a profiles mirror trigger (v1 signups must never create v2 accounts),
--   * any auth_user_id-keyed identity (S-2: identity is (issuer, subject) only),
--   * the 'urn:lunchvoice:legacy-auth-user' synthetic issuer.
--
-- Identity authority: KpnIdentity (Google -> KpnIdentity -> LunchVoice). This database trusts only a verified
-- token's `iss` and `sub`, allow-listed in lv.policy('identity.trusted_issuers'). Unset = nobody is signed in.
-- Contract: docs/v2/IDENTITY_CONTRACT.md.

begin;

-- pgcrypto provides digest()/gen_random_bytes(). Create it in `extensions` when that schema exists (hosted
-- Supabase convention) and fall back to the default schema on a bare Postgres, so the same file installs on
-- both. lv.digest_safe() below then resolves it without a schema-qualified name that could be wrong on either.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    create extension if not exists pgcrypto with schema extensions;
  else
    create extension if not exists pgcrypto;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Schemas. Tables are never exposed; the API is an explicit set of functions in lv_api.
-- ---------------------------------------------------------------------------------------------------------
create schema if not exists lv;          -- tables (never exposed to the Data API)
create schema if not exists lv_api;      -- the entire public surface: lv_* functions
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on schema lv from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on schema lv from authenticated; end if;
  revoke all on schema lv from public;
end $$;

-- ---------------------------------------------------------------------------------------------------------
-- Policy values. Undecided values are NULL and every reader fails CLOSED on NULL.
-- ---------------------------------------------------------------------------------------------------------
create table lv.policy (
  key text primary key,
  value jsonb,
  note text not null
);

insert into lv.policy (key, value, note) values
  ('identity.trusted_issuers', null,
   'JSON array of KpnIdentity issuer URLs accepted as a signed-in person. NULL means nobody is signed in. Set only after the real issuer and JWKS are verified (D-01).'),
  ('hub.min_slug_length', '3'::jsonb, 'Shortest allowed Hub slug.'),
  ('hub.max_slug_length', '40'::jsonb, 'Longest allowed Hub slug.');

create function lv.policy_json(p_key text) returns jsonb
language sql stable security definer set search_path = ''
as $$ select value from lv.policy where key = p_key $$;

-- ---------------------------------------------------------------------------------------------------------
-- Accounts and external identities
-- ---------------------------------------------------------------------------------------------------------
create table lv.accounts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) > 0),
  created_at timestamptz not null default now()
);

-- One row per external identity. THE identity key is (identity_issuer, identity_subject) and nothing else.
-- email/display_name/picture here are cached attributes from the verified token, never keys.
create table lv.account_identities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references lv.accounts (id) on delete cascade,
  identity_issuer text not null check (length(btrim(identity_issuer)) > 0),
  identity_subject text not null check (length(btrim(identity_subject)) > 0),
  email text,
  email_verified_at timestamptz,
  display_name text,
  picture_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_identities_issuer_subject_key unique (identity_issuer, identity_subject)
);
create index account_identities_account_idx on lv.account_identities (account_id);

-- Email is explicitly NOT unique: two identities may share an email and stay two accounts (S-2, contract §4.3).
-- A lookup helper exists only for display/contact, never for linking.
comment on column lv.account_identities.email is
  'Cached contact attribute from the verified KpnIdentity token. NEVER an identity key and never used for linking.';

-- ---------------------------------------------------------------------------------------------------------
-- Hubs. Independent identity: hubs.id is its own uuid and does NOT reference any legacy table (S-6).
-- ---------------------------------------------------------------------------------------------------------
create table lv.hubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  display_name text not null check (length(btrim(display_name)) > 0),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  membership_mode text not null default 'invite_only' check (membership_mode in ('open', 'approval', 'invite_only')),
  owner_account_id uuid not null references lv.accounts (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint hubs_slug_key unique (slug),
  constraint hubs_slug_format check (slug = lower(slug) and slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])$'),
  constraint hubs_slug_length check (length(slug) between 3 and 40)
);

-- Memberships. Only 'accepted' counts as a member; the Owner is always an accepted member.
create table lv.hub_memberships (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  account_id uuid not null references lv.accounts (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'removed', 'suspended')),
  accepted_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint hub_memberships_hub_account_key unique (hub_id, account_id),
  -- accepted_at records WHEN they were accepted; it is historical, so it stays set after removal.
  constraint hub_memberships_accepted_has_time check (status <> 'accepted' or accepted_at is not null)
);
create index hub_memberships_account_idx on lv.hub_memberships (account_id);
create index hub_memberships_hub_status_idx on lv.hub_memberships (hub_id, status);

-- Removed members cannot rejoin; the row stays as the record that they were removed.
create function lv.forbid_rejoin() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.status = 'removed' and new.status is distinct from 'removed' then
    raise exception 'lv_forbidden: a removed member cannot be readmitted' using errcode = '42501';
  end if;
  if new.status = 'accepted' and old.status <> 'accepted' then new.accepted_at := now(); end if;
  if new.status = 'removed' then new.removed_at := coalesce(new.removed_at, now()); end if;
  return new;
end;
$$;
create trigger hub_memberships_status_guard before update on lv.hub_memberships
  for each row execute function lv.forbid_rejoin();

-- ---------------------------------------------------------------------------------------------------------
-- Audit. Product events only; identity events belong to KpnIdentity.
-- ---------------------------------------------------------------------------------------------------------
create table lv.audit_events (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor_account_id uuid references lv.accounts (id) on delete set null,
  hub_id uuid references lv.hubs (id) on delete set null,
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb
);
create index audit_events_hub_idx on lv.audit_events (hub_id, occurred_at desc);

create function lv.audit(p_actor uuid, p_hub uuid, p_action text, p_target text, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = ''
as $$
  insert into lv.audit_events (actor_account_id, hub_id, action, target, detail)
  values (p_actor, p_hub, p_action, p_target, coalesce(p_detail, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Token verification. This is the ONLY place a person is derived from a request.
-- ---------------------------------------------------------------------------------------------------------
create function lv.caller_identity() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_claims jsonb;
  v_trusted jsonb;
  v_iss text;
  v_sub text;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return null;
  end;
  if v_claims is null or jsonb_typeof(v_claims) <> 'object' then return null; end if;

  v_iss := nullif(btrim(v_claims->>'iss'), '');
  v_sub := nullif(btrim(v_claims->>'sub'), '');
  -- A UUID subject is required today (IDENTITY_CONTRACT §2). Non-UUID subjects are refused, not coerced.
  if v_iss is null or v_sub is null then return null; end if;
  if v_sub !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return null; end if;

  v_trusted := lv.policy_json('identity.trusted_issuers');
  if v_trusted is null or jsonb_typeof(v_trusted) <> 'array' then return null; end if;
  if not (v_trusted ? v_iss) then return null; end if;

  return jsonb_build_object(
    'issuer', v_iss,
    'subject', lower(v_sub),
    'email', nullif(btrim(v_claims->>'email'), ''),
    'name', nullif(btrim(v_claims->>'name'), ''),
    'picture', nullif(btrim(v_claims->>'picture'), ''),
    'email_verified', coalesce(v_claims->>'email_verified', 'false') = 'true'
  );
end;
$$;

-- Resolve (issuer, subject) to an account id. Never creates. NULL when not signed in or never seen before.
create function lv.current_account_id() returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ci jsonb := lv.caller_identity();
  v_acc uuid;
begin
  if v_ci is null then return null; end if;
  select i.account_id into v_acc
    from lv.account_identities i
   where i.identity_issuer = v_ci->>'issuer' and i.identity_subject = v_ci->>'subject';
  return v_acc;
end;
$$;

-- Create-on-first-sign-in. Exactly one account per (issuer, subject), even under concurrency, because the
-- advisory lock serialises the read-then-insert (prototype 20261024000800/1100 behaviour, preserved).
create function lv.ensure_account() returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_ci jsonb := lv.caller_identity();
  v_acc uuid;
  v_name text;
begin
  if v_ci is null then return null; end if;

  select i.account_id into v_acc
    from lv.account_identities i
   where i.identity_issuer = v_ci->>'issuer' and i.identity_subject = v_ci->>'subject';
  if v_acc is not null then
    -- Refresh cached attributes. This never changes who the person is.
    update lv.account_identities i
       set email = coalesce(v_ci->>'email', i.email),
           display_name = coalesce(v_ci->>'name', i.display_name),
           picture_url = coalesce(v_ci->>'picture', i.picture_url),
           email_verified_at = case when (v_ci->>'email_verified')::boolean
                                    then coalesce(i.email_verified_at, now()) else i.email_verified_at end,
           updated_at = now()
     where i.identity_issuer = v_ci->>'issuer' and i.identity_subject = v_ci->>'subject';
    return v_acc;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_account:' || (v_ci->>'issuer') || '|' || (v_ci->>'subject'), 0));

  select i.account_id into v_acc
    from lv.account_identities i
   where i.identity_issuer = v_ci->>'issuer' and i.identity_subject = v_ci->>'subject';
  if v_acc is not null then return v_acc; end if;

  v_name := coalesce(nullif(btrim(v_ci->>'name'), ''),
                     nullif(btrim(split_part(coalesce(v_ci->>'email', ''), '@', 1)), ''),
                     'Member');

  insert into lv.accounts (display_name) values (left(v_name, 80)) returning id into v_acc;
  insert into lv.account_identities
    (account_id, identity_issuer, identity_subject, email, email_verified_at, display_name, picture_url)
  values
    (v_acc, v_ci->>'issuer', v_ci->>'subject', v_ci->>'email',
     case when (v_ci->>'email_verified')::boolean then now() end,
     nullif(btrim(v_ci->>'name'), ''), v_ci->>'picture');

  perform lv.audit(v_acc, null, 'account.created', v_acc::text,
                   jsonb_build_object('issuer', v_ci->>'issuer'));
  return v_acc;
end;
$$;

-- Resolve a pgcrypto function without hard-coding a schema: hosted Supabase installs pgcrypto in
-- `extensions`, a bare Postgres in `public`. Both must work from the same migration file.
create function lv.pgcrypto_schema() returns text
language sql stable set search_path = ''
as $$
  select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pgcrypto'
$$;

create function lv.random_bytes(p_len int) returns bytea
language plpgsql volatile set search_path = ''
as $$
declare
  v_schema text := lv.pgcrypto_schema();
  v_out bytea;
begin
  if v_schema is null then raise exception 'lv_server_error: pgcrypto is not installed'; end if;
  execute format('select %I.gen_random_bytes($1)', v_schema) into v_out using p_len;
  return v_out;
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
