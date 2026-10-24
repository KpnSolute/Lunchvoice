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

-- Creates a draft Campaign with one question, regardless of the caller's role (test fixtures only).
create or replace function t.draft(p_hub uuid, p_title text) returns uuid language plpgsql security definer as $$
declare v uuid;
begin
  insert into lv_private.campaigns (hub_id, title, join_code) values (p_hub, p_title, lv_private.new_join_code()) returning id into v;
  insert into lv_private.campaign_questions (campaign_id, position, type, prompt) values (v, 1, 'rating', 'Q1');
  return v;
end $$;
create or replace function t.q1() returns jsonb language sql immutable as $$
  select '[{"type":"rating","prompt":"How was it?","required":true},{"type":"single_choice","prompt":"Pick","options":["A","B"]}]'::jsonb $$;

-- Shared participation fixtures (moved from 11_participation.sql).
-- A published Campaign with seven questions (ids stored as <label>.q1 .. q7). anonymous per argument.
create function t.pubcamp(p_label text, p_hub uuid, p_anon boolean, p_publish boolean default true) returns uuid language plpgsql security definer as $$
declare v uuid; n int; qid uuid; r jsonb;
begin
  insert into lv_private.campaigns (hub_id, title, join_code, anonymous) values (p_hub, p_label, lv_private.new_join_code(), p_anon) returning id into v;
  for n in 1..7 loop
    qid := gen_random_uuid();
    perform t.put(p_label || '.q' || n, qid::text);
    insert into lv_private.campaign_questions (id, campaign_id, position, type, prompt, required, options, scale_min, scale_max)
    values (qid, v, n,
      (array['rating','single_choice','multi_choice','yes_no','text','ranking','slider'])[n],
      'Question ' || n, n in (1, 2),
      case n when 2 then '["A","B","C"]'::jsonb when 3 then '["x","y","z"]'::jsonb when 6 then '["r1","r2","r3"]'::jsonb else '[]'::jsonb end,
      case n when 7 then 0 else 1 end, case n when 7 then 10 else 5 end);
  end loop;
  perform t.put(p_label || '.id', v::text);
  if p_publish then
    r := lv_private.activate_campaign(v, (select owner_account_id from lv_private.hubs where id = p_hub), gen_random_uuid(), 'manual');
    if not (r->>'ok')::boolean then raise exception 'fixture activation failed: %', r; end if;
  end if;
  return v;
end $$;
create function t.a(p_label text, p_n int, p_value jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('question_id', t.get(p_label || '.q' || p_n), 'value', p_value) $$;
create function t.good(p_label text) returns jsonb language sql stable as $$
  select jsonb_build_array(t.a(p_label, 1, '4'), t.a(p_label, 2, '"B"'), t.a(p_label, 3, '["x","z"]'), t.a(p_label, 4, 'true'),
    t.a(p_label, 5, '"fine"'), t.a(p_label, 6, '["r2","r1","r3"]'), t.a(p_label, 7, '7')) $$;


-- p_n new accepted members, each submitting rating 3 and the given single-choice option, for each entry of p_counts
-- ({"A": 7, "B": 4}). Optional guests (needs guest_access = link) each use their own grant.
create or replace function t.fill(p_label text, p_hub uuid, p_counts jsonb, p_guests int default 0) returns void language plpgsql security definer as $$
declare
  v_camp uuid := t.id(p_label || '.id'); k text; n int; i int; acc uuid; r jsonb; g uuid;
begin
  for k, n in select key, value::int from jsonb_each_text(p_counts) loop
    for i in 1..n loop
      acc := gen_random_uuid();
      insert into lv_private.accounts (id, display_name) values (acc, 'Fill ' || left(acc::text, 8));
      insert into lv_private.hub_memberships (hub_id, account_id, status, source, joined_at) values (p_hub, acc, 'accepted', 'v2', now());
      r := lv_private.submit_core(v_camp, acc, null, jsonb_build_array(t.a(p_label, 1, '3'), t.a(p_label, 2, to_jsonb(k))), gen_random_uuid());
      if not (r->>'ok')::boolean then raise exception 'fill failed: %', r; end if;
    end loop;
  end loop;
  for i in 1..p_guests loop
    g := gen_random_uuid();
    insert into lv_private.campaign_guest_grants (id, campaign_id, token_hash) values (g, v_camp, 'h-' || g::text);
    r := lv_private.submit_guest(g, jsonb_build_array(t.a(p_label, 1, '3'), t.a(p_label, 2, '"A"')), gen_random_uuid());
    if not (r->>'ok')::boolean then raise exception 'guest fill failed: %', r; end if;
  end loop;
end $$;
create or replace function t.finish(p_label text) returns void language sql security definer as $$
  update lv_private.campaigns set state = 'closed', closed_at = now() where id = t.id(p_label || '.id') $$;
