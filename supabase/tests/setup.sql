set check_function_bodies = off; -- helpers reference legacy tables that are created later
-- Test harness for a THROWAWAY local Postgres (never a real Supabase project). Stubs the Supabase roles, the
-- auth schema and auth.uid(), then defines assertion helpers in schema `t`.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema if not exists t;
grant usage on schema t to public;
create table if not exists t.results (n serial primary key, file text, name text, ok boolean, detail text);
grant all on t.results to public;
grant usage on all sequences in schema t to public;

create or replace function t.check(p_name text, p_ok boolean, p_detail text default null) returns void
language plpgsql as $$
begin
  insert into t.results (file, name, ok, detail) values (current_setting('t.file', true), p_name, coalesce(p_ok, false), p_detail);
  raise notice 'LVCHECK|%|%|%', case when coalesce(p_ok, false) then 'PASS' else 'FAIL' end, current_setting('t.file', true), p_name;
end $$;

-- Runs a statement and reports whether it raised (optionally a specific SQLSTATE) under the CURRENT role.
create or replace function t.raises(p_sql text, p_sqlstate text default null) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return p_sqlstate is null or sqlstate = p_sqlstate;
end $$;

-- Envelope helpers.
create or replace function t.code(j jsonb) returns text language sql immutable
as $$ select case when (j->>'ok')::boolean then 'ok' else j->'error'->>'code' end $$;

create or replace function t.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', p_uid::text, false);
  perform set_config('request.jwt.claims', '', false);
  set role authenticated;
end $$;

-- Signed-in user whose access token carries a given authentication method at a given age (seconds ago).
-- This only fabricates the CLAIM; it does not prove the real Google/central-identity reauthentication flow.
create or replace function t.as_user_authed(p_uid uuid, p_method text, p_age_seconds int) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', p_uid::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'amr', jsonb_build_array(
    jsonb_build_object('method', p_method, 'timestamp', extract(epoch from now())::bigint - p_age_seconds)))::text, false);
  set role authenticated;
end $$;

create or replace function t.as_anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  set role anon;
end $$;

create or replace function t.as_pg() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
end $$;

-- Fingerprint of every legacy table the migration must not touch.
create or replace function t.legacy_fingerprint() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'orgs', (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from public.orgs o),
    'profiles', (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from public.profiles p),
    'sessions', (select md5(coalesce(string_agg(s::text, '|' order by s.id), '')) from public.sessions s),
    'responses', (select md5(coalesce(string_agg(r::text, '|' order by r.id), '')) from public.responses r),
    'orders', (select md5(coalesce(string_agg(o::text, '|' order by o.id), '')) from public.orders o),
    'store_items', (select md5(coalesce(string_agg(i::text, '|' order by i.id), '')) from public.store_items i),
    'points_total', (select coalesce(sum(points), 0) from public.profiles))
$$;

create table if not exists t.snapshot (name text primary key, fp jsonb);
grant all on t.snapshot to public;

-- Synthetic identities: t.u(1) admin, 2 chosen owner, 3..6 students, 11 user of org B. Extra ids (21+) are created by tests.
create or replace function t.u(n int) returns uuid language sql immutable
as $$ select ('00000000-0000-4000-8002-' || lpad(n::text, 12, '0'))::uuid $$;
create or replace function t.org_a() returns uuid language sql stable
as $$ select id from public.orgs where slug = 'LionCafe' $$;
create or replace function t.org_b() returns uuid language sql immutable
as $$ select '00000000-0000-4000-8001-0000000000b2'::uuid $$;

-- Scratch values that survive role switches inside one test transaction.
create table if not exists t.vars (k text primary key, v text);
grant all on t.vars to public;
create or replace function t.put(p_k text, p_v text) returns void language sql
as $$ insert into t.vars values (p_k, p_v) on conflict (k) do update set v = excluded.v $$;
create or replace function t.get(p_k text) returns text language sql stable as $$ select v from t.vars where k = p_k $$;
create or replace function t.id(p_k text) returns uuid language sql stable as $$ select v::uuid from t.vars where k = p_k $$;

-- Reads a single value with the harness owner's privileges, callable under any role (for assertions about private tables).
create or replace function t.q(p_sql text) returns text language plpgsql security definer as $$
declare r text;
begin
  execute p_sql into r;
  return r;
end $$;
