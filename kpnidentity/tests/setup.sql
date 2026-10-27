-- Harness for a THROWAWAY local Postgres (never a real Supabase project). Stubs the Supabase roles, the
-- extensions schema and the slice of auth.users that KpnIdentity reads.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists extensions;
grant usage on schema extensions to public;
create schema if not exists auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create schema if not exists t;
grant usage on schema t to public;
create or replace function t.check(p_name text, p_ok boolean) returns void
language plpgsql as $$
begin
  raise notice 'LVCHECK|%|%|%', case when coalesce(p_ok, false) then 'PASS' else 'FAIL' end,
    current_setting('t.file', true), p_name;
end $$;

-- True when the statement raises (optionally with a specific SQLSTATE).
create or replace function t.raises(p_sql text, p_sqlstate text default null) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return p_sqlstate is null or sqlstate = p_sqlstate;
end $$;

create or replace function t.q(p_sql text) returns text language plpgsql as $$
declare r text;
begin execute p_sql into r; return r; end $$;
