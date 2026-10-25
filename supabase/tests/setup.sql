set check_function_bodies = off;

-- Test harness for a THROWAWAY local Postgres (never a real Supabase project). Stubs the Supabase roles and
-- defines assertion helpers in schema `t`. Ported from the prototype harness (see
-- docs/backend/V2_MIGRATION_CLASSIFICATION.md) with the legacy-table fingerprint helpers removed: the
-- canonical baseline has no legacy tables to protect, because there are none.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

-- Our tables are never exposed to the API, so the Data API roles need no table access at all. Granting
-- schema usage only lets the tests attempt calls and observe the refusal, which is the point.
grant usage on schema public to anon, authenticated, service_role;

create schema if not exists t;
grant usage on schema t to public;
create table if not exists t.results (n serial primary key, file text, name text, ok boolean, detail text);
grant all on t.results to public;
grant usage on all sequences in schema t to public;

create or replace function t.check(p_name text, p_ok boolean, p_detail text default null) returns void
language plpgsql as $$
begin
  insert into t.results (file, name, ok, detail)
  values (current_setting('t.file', true), p_name, coalesce(p_ok, false), p_detail);
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

-- Envelope helpers: API functions return {ok, ...} or {ok:false, error:{code,...}}.
create or replace function t.code(j jsonb) returns text language sql immutable
as $$ select case when (j->>'ok')::boolean then 'ok' else j->'error'->>'code' end $$;

-- The test issuer. A simulated KpnIdentity issuer: correctly SHAPED tokens, not real ones
-- (IDENTITY_CONTRACT §7). Nothing here proves KpnIdentity's own issuance or Google's round trip.
create or replace function t.issuer() returns text language sql immutable
as $$ select 'https://kpn.test.invalid/auth/v1' $$;

-- A UUID subject per test person number.
create or replace function t.sub(n int) returns uuid language sql immutable
as $$ select ('00000000-0000-4000-8c00-' || lpad(n::text, 12, '0'))::uuid $$;

-- Sign in as person n with a correctly shaped token. Mirrors what PostgREST would present after verifying a
-- KpnIdentity ID token. This ONLY fabricates the claim; it is not a real OAuth round trip.
create or replace function t.as_kpn(
  p_n int,
  p_email text default null,
  p_verified boolean default true,
  p_name text default null,
  p_issuer text default null
) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', t.sub(p_n)::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', t.sub(p_n)::text,
    'iss', coalesce(p_issuer, t.issuer()),
    'aud', 'lunchvoice',
    'role', 'authenticated',
    'email', coalesce(p_email, 'person' || p_n || '@example.invalid'),
    'email_verified', coalesce(p_verified, true),
    'name', coalesce(p_name, 'Person ' || p_n))::text, false);
  set role authenticated;
end $$;

-- A token with arbitrary claims, for the negative cases.
create or replace function t.as_claims(p_claims jsonb) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', coalesce(p_claims->>'sub', ''), false);
  perform set_config('request.jwt.claims', p_claims::text, false);
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

-- Scratch values that survive role switches inside one test transaction.
create table if not exists t.vars (k text primary key, v text);
grant all on t.vars to public;
create or replace function t.put(p_k text, p_v text) returns void language sql
as $$ insert into t.vars values (p_k, p_v) on conflict (k) do update set v = excluded.v $$;
create or replace function t.get(p_k text) returns text language sql stable as $$ select v from t.vars where k = p_k $$;
create or replace function t.id(p_k text) returns uuid language sql stable as $$ select v::uuid from t.vars where k = p_k $$;

-- Read one value with the harness owner's privileges, callable under any role.
create or replace function t.q(p_sql text) returns text language plpgsql security definer as $$
declare
  v text;
begin
  execute p_sql into v;
  return v;
exception when no_data_found then
  return null;
end $$;

-- Allow-list the test issuer. The baseline FAILS CLOSED until this is set, which test 01 proves first.
-- SECURITY DEFINER: the test role is deliberately unprivileged, so it cannot update lv.policy itself.
create or replace function t.trust_test_issuer() returns void language plpgsql security definer as $$
begin
  update lv.policy
     set value = jsonb_build_array(t.issuer())
   where key = 'identity.trusted_issuers';
end $$;

-- Submit as the signed-in caller with two answers (a rating and a text). Lives here because creating a
-- function needs schema privileges the restricted API role does not have.
create or replace function t.submit(p_campaign uuid, p_q1 uuid, p_v1 jsonb, p_q2 uuid, p_text text)
returns jsonb language sql as $$
  select lv_api.lv_submit_response(p_campaign,
    jsonb_build_array(jsonb_build_object('question_id', p_q1, 'value', p_v1),
                      jsonb_build_object('question_id', p_q2, 'value', to_jsonb(p_text))))
$$;
grant execute on function t.submit(uuid, uuid, jsonb, uuid, text) to public;
