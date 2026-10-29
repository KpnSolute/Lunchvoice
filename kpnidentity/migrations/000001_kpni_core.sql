-- KpnIdentity schema v1 (docs/v2/KPNIDENTITY_SCHEMA_V1.md). Identity, authentication and OAuth clients only:
-- nothing here may know about Hubs, roles, memberships, plans, campaigns or participation.
-- Reads auth.* and never alters its shape. Applies to the KpnIdentity Supabase project, not to LunchVoice.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists kpni;
revoke all on schema kpni from public;
-- Anything added to this schema later is closed to everyone but the owner until it is granted on purpose.
alter default privileges in schema kpni revoke all on tables from public, anon, authenticated;
alter default privileges in schema kpni revoke all on sequences from public, anon, authenticated;
alter default privileges in schema kpni revoke execute on functions from public, anon, authenticated;
-- PostgreSQL grants EXECUTE on new functions to PUBLIC through a built-in default that a schema-scoped statement
-- cannot remove, so the revoke below is global for the migration role. This project holds identity data only.
alter default privileges revoke execute on functions from public;

-- ---------------------------------------------------------------------------------------------------------
-- kpni.profiles: one row per person, keyed by the Supabase auth user id.
-- `subject` is the stable `sub`. Supabase puts auth.users.id in the token's `sub`, so the two are the same
-- value by constraint: LunchVoice keys on the token's `sub` and it can never disagree with this table.
-- ---------------------------------------------------------------------------------------------------------
create table kpni.profiles (
  auth_user_id   uuid primary key references auth.users (id) on delete cascade,
  subject        uuid not null unique,
  constraint subject_is_auth_user_id check (subject = auth_user_id),
  display_name   text,
  picture_url    text,
  email          extensions.citext,
  email_verified boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- The subject is the identity key LunchVoice relies on: it is never regenerated or reassigned.
create function kpni.profiles_freeze_subject() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.subject is distinct from old.subject then
    raise exception 'kpni.profiles.subject is immutable' using errcode = '42501';
  end if;
  if new.auth_user_id is distinct from old.auth_user_id then
    raise exception 'kpni.profiles.auth_user_id is immutable' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_freeze_subject before update on kpni.profiles
  for each row execute function kpni.profiles_freeze_subject();

-- ---------------------------------------------------------------------------------------------------------
-- kpni.security_events: append-only. `subject` is deliberately not a foreign key so history survives deletion.
-- ---------------------------------------------------------------------------------------------------------
create table kpni.security_events (
  id          bigserial primary key,
  occurred_at timestamptz not null default now(),
  -- Only events this schema can truthfully write. sign_in / sign_in_failed are not listed: nothing in the
  -- database observes them (they live in auth.audit_log_entries), so they are added when something writes them.
  event       text not null check (event in ('account_created', 'email_changed', 'client_created')),
  subject     uuid,
  detail      jsonb not null default '{}'::jsonb,
  ip          text,
  user_agent  text
);
comment on column kpni.security_events.ip is 'Personal data. Retention: purge ip and user_agent after 90 days (see kpnidentity/README.md).';
comment on column kpni.security_events.user_agent is 'Personal data. Retention: purge after 90 days (see kpnidentity/README.md).';

create function kpni.security_events_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'kpni.security_events is append-only' using errcode = '42501';
end $$;

create trigger security_events_no_update before update or delete on kpni.security_events
  for each row execute function kpni.security_events_append_only();
create trigger security_events_no_truncate before truncate on kpni.security_events
  for each statement execute function kpni.security_events_append_only();

-- ---------------------------------------------------------------------------------------------------------
-- OAuth clients and exact-match redirect URIs
-- ---------------------------------------------------------------------------------------------------------
create table kpni.oauth_clients (
  client_id          text primary key check (client_id ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  client_name        text not null,
  client_secret_hash text,
  is_confidential    boolean not null default true,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  -- A confidential client always has a hashed secret; a public client never does.
  constraint secret_matches_confidentiality check (is_confidential = (client_secret_hash is not null)),
  -- bcrypt output only: a plaintext secret cannot satisfy this.
  constraint secret_is_hashed check (client_secret_hash is null or client_secret_hash ~ '^\$2[aby]\$\d\d\$.{53}$')
);

create table kpni.oauth_redirect_uris (
  client_id  text not null references kpni.oauth_clients (client_id) on delete cascade,
  uri        text not null,
  created_at timestamptz not null default now(),
  primary key (client_id, uri),
  -- Exact match only: no wildcards, no fragments, https (http only for loopback development hosts).
  constraint redirect_uri_shape check (
    uri !~ '[*?#\s]'
    and (uri ~ '^https://[a-z0-9.-]+(:\d+)?(/[^*?#\s]*)?$'
         or uri ~ '^http://(localhost|127\.0\.0\.1)(:\d+)?(/[^*?#\s]*)?$')
  )
);

-- ---------------------------------------------------------------------------------------------------------
-- Functions (security definer; the Data API roles get no table access at all)
-- ---------------------------------------------------------------------------------------------------------
create function kpni.create_client(
  p_client_id text, p_client_name text, p_secret text, p_redirect_uris text[]
) returns void
language plpgsql security definer set search_path = '' as $$
declare u text;
begin
  insert into kpni.oauth_clients (client_id, client_name, client_secret_hash, is_confidential)
  values (p_client_id, p_client_name,
          case when p_secret is null then null else extensions.crypt(p_secret, extensions.gen_salt('bf', 10)) end,
          p_secret is not null);
  foreach u in array coalesce(p_redirect_uris, '{}') loop
    insert into kpni.oauth_redirect_uris (client_id, uri) values (p_client_id, u);
  end loop;
  insert into kpni.security_events (event, detail) values ('client_created', jsonb_build_object('client_id', p_client_id));
end $$;

create function kpni.verify_client_secret(p_client_id text, p_secret text) returns boolean
language sql security definer stable set search_path = '' as $$
  select coalesce((
    select c.is_active and c.client_secret_hash is not null
           and c.client_secret_hash = extensions.crypt(p_secret, c.client_secret_hash)
    from kpni.oauth_clients c where c.client_id = p_client_id), false)
$$;

-- A flow may start only for an active client and an exactly registered redirect URI.
create function kpni.client_can_authorize(p_client_id text, p_redirect_uri text) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from kpni.oauth_clients c
    join kpni.oauth_redirect_uris r on r.client_id = c.client_id
    where c.client_id = p_client_id and c.is_active and r.uri = p_redirect_uri)
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Profile lifecycle follows auth.users
-- ---------------------------------------------------------------------------------------------------------
create function kpni.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- email_verified comes only from GoTrue's own email_confirmed_at. user_metadata is user-editable and is
  -- never trusted for this.
  insert into kpni.profiles (auth_user_id, subject, display_name, picture_url, email, email_verified)
  values (new.id, new.id,
          new.raw_user_meta_data ->> 'name',
          new.raw_user_meta_data ->> 'picture',
          new.email,
          new.email_confirmed_at is not null);
  insert into kpni.security_events (event, subject) values ('account_created', new.id);
  return new;
end $$;

-- Keeps the cached email and verification state in step with auth.users (confirm-after-signup, email change).
create function kpni.on_auth_user_updated() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update kpni.profiles
     set email = new.email, email_verified = (new.email_confirmed_at is not null)
   where auth_user_id = new.id;
  if old.email is distinct from new.email then
    insert into kpni.security_events (event, subject) values ('email_changed', new.id);
  end if;
  return new;
end $$;

create trigger kpni_on_auth_user_created after insert on auth.users
  for each row execute function kpni.on_auth_user_created();
create trigger kpni_on_auth_user_updated after update of email, email_confirmed_at on auth.users
  for each row when (old.email is distinct from new.email
                     or old.email_confirmed_at is distinct from new.email_confirmed_at)
  execute function kpni.on_auth_user_updated();

-- ---------------------------------------------------------------------------------------------------------
-- Privilege posture: none of this is exposed through the Data API.
-- ---------------------------------------------------------------------------------------------------------
alter table kpni.profiles enable row level security;
alter table kpni.security_events enable row level security;
alter table kpni.oauth_clients enable row level security;
alter table kpni.oauth_redirect_uris enable row level security;

revoke all on all tables in schema kpni from public, anon, authenticated;
revoke all on all sequences in schema kpni from public, anon, authenticated;
revoke all on all functions in schema kpni from public, anon, authenticated;
grant usage on schema kpni to service_role;
grant select, insert, update on all tables in schema kpni to service_role;
grant usage on all sequences in schema kpni to service_role;
grant execute on all functions in schema kpni to service_role;
