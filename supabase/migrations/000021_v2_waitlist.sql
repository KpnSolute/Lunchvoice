-- LunchVoice v2 canonical 21: public waitlist (signed-out, email only).
--
-- v2 launches in waitlist mode first. A signed-out visitor can join with an email address; no account, no KpnIdentity
-- sign-in. Ported from prototype 20261024000600 (the waitlist half), adapted to the canonical lv schema and the
-- 000008 error envelope. Hub settings are not part of this migration.
--
-- WHAT IS STORED, plainly:
--   * lv.waitlist holds the email address (lower case), an optional intended Hub name, the version of the consent wording
--     shown and a deletion date. It is personal data. It links to no account, Hub or Campaign, no API function reads it
--     back, and the table is unreachable to anon and authenticated.
--   * lv.waitlist_attempts (the throttle ledger) holds only SALTED HASHES of the address and of the caller's origin, never
--     the raw address or IP. Hashing does not make it anonymous; rows older than 7 days are deleted by the purge function.
--
-- The answer never reveals whether an address was already on the list (no enumeration), and a throttle answer depends only
-- on the caller's own recent activity, never on what other people submitted.
--
-- THE LIST STAYS CLOSED until the founder decides FOUR things (policy keys, all NULL here, so everything fails closed):
--   waitlist.open, waitlist.consent_version (the approved privacy wording, a short identifier), waitlist.retention and
--   waitlist.removal. Engineering does not invent consent wording, retention or a removal channel. The throttle limits
--   below (5 per address per day from one origin, 30 per origin per hour) are PROVISIONAL engineering defaults.
-- The caller's origin is trusted only if waitlist.trusted_ip names a header and a proxy-hop count the real edge has been
-- verified to set; otherwise all callers share one origin bucket (so a flood can use up the shared hourly limit). That
-- policy MUST be verified against the live edge and set before a real launch.

begin;

insert into lv.policy (key, value, note) values
  ('waitlist.open', null,
   'Whether the public waitlist accepts sign-ups. JSON true or false. Undecided: NULL makes the waitlist answer lv_policy_undecided; false answers closed. true is honoured only when the three keys below are also set.'),
  ('waitlist.consent_version', null,
   'Identifier of the founder-approved consent/privacy wording shown beside the form, a JSON string up to 64 characters. Stored with each sign-up. No wording is invented by engineering.'),
  ('waitlist.retention', null,
   'How long a sign-up is kept. {"days": 1..3650}. Sets each row''s deletion date; the purge function deletes expired rows.'),
  ('waitlist.removal', null,
   'How a person asks to be removed, shown to them. {"channel": "text up to 200 characters"}. The operator function remove_waitlist_entry performs a removal.'),
  ('waitlist.trusted_ip', null,
   'Where the caller''s network address comes from. {"header": "x-forwarded-for"|"x-real-ip"|"cf-connecting-ip", "hops_from_right": 1..5}. Verify against the real edge before use. NULL puts every caller in one shared bucket.');

-- Per-install salt so stored hashes cannot be reversed by hashing the address space.
create table lv.secrets (key text primary key, value text not null);
insert into lv.secrets (key, value) values ('waitlist_salt', gen_random_uuid()::text || gen_random_uuid()::text);

create table lv.waitlist (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique check (length(email_normalized) between 3 and 254),
  intended_hub_name text check (intended_hub_name is null or length(intended_hub_name) <= 80),
  consent_version text not null,
  delete_after timestamptz not null,
  created_at timestamptz not null default now()
);
create index waitlist_delete_after_idx on lv.waitlist (delete_after);

create table lv.waitlist_attempts (
  id bigint generated always as identity primary key,
  email_hash text not null,
  origin_hash text not null,
  at timestamptz not null default now()
);
create index waitlist_attempts_pair_idx on lv.waitlist_attempts (email_hash, origin_hash, at);
create index waitlist_attempts_origin_idx on lv.waitlist_attempts (origin_hash, at);

alter table lv.secrets enable row level security;
alter table lv.waitlist enable row level security;
alter table lv.waitlist_attempts enable row level security;

-- Origin of the caller: a salted hash of the trusted network address, or the shared bucket 'unknown'. Only the entry
-- the configured proxies appended is used (counted from the right), so values a browser prepends are ignored.
create function lv.waitlist_origin(p_salt text) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_pol jsonb; v_headers json; v_hdr text; v_val text; v_parts text[]; v_hops int; v_ip text;
begin
  select p.value into v_pol from lv.policy p where p.key = 'waitlist.trusted_ip';
  if v_pol is null or jsonb_typeof(v_pol) <> 'object'
     or (v_pol->>'header') not in ('x-forwarded-for', 'x-real-ip', 'cf-connecting-ip')
     or (v_pol->>'hops_from_right') !~ '^[1-5]$' then
    return 'unknown';
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return 'unknown';
  end;
  v_hdr := v_pol->>'header';
  v_hops := (v_pol->>'hops_from_right')::int;
  v_val := v_headers->>v_hdr;
  if v_val is null then return 'unknown'; end if;
  select array_agg(btrim(x) order by ord) into v_parts from unnest(string_to_array(v_val, ',')) with ordinality as t(x, ord);
  if v_parts is null or cardinality(v_parts) < v_hops then return 'unknown'; end if;
  v_ip := nullif(v_parts[cardinality(v_parts) - v_hops + 1], '');
  if v_ip is null or length(v_ip) > 64 then return 'unknown'; end if;
  return encode(sha256(convert_to(p_salt || ':o:' || v_ip, 'UTF8')), 'hex');
end;
$$;

-- The founder decisions still missing before the list may open.
create function lv.waitlist_policy_missing() returns text[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb; m text[] := '{}';
begin
  select p.value into v from lv.policy p where p.key = 'waitlist.open';
  if v is null or jsonb_typeof(v) <> 'boolean' then m := m || 'waitlist.open'::text; end if;
  select p.value into v from lv.policy p where p.key = 'waitlist.consent_version';
  if v is null or jsonb_typeof(v) <> 'string' or length(btrim(v #>> '{}')) not between 1 and 64 then m := m || 'waitlist.consent_version'::text; end if;
  select p.value into v from lv.policy p where p.key = 'waitlist.retention';
  if v is null or jsonb_typeof(v) <> 'object' or (v->>'days') !~ '^[1-9][0-9]{0,3}$' or (v->>'days')::int > 3650 then m := m || 'waitlist.retention'::text; end if;
  select p.value into v from lv.policy p where p.key = 'waitlist.removal';
  if v is null or jsonb_typeof(v) <> 'object' or jsonb_typeof(v->'channel') <> 'string' or length(btrim(v->>'channel')) not between 1 and 200 then m := m || 'waitlist.removal'::text; end if;
  return m;
end;
$$;

create function lv.api_waitlist_status() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_open jsonb; v_missing text[];
begin
  select p.value into v_open from lv.policy p where p.key = 'waitlist.open';
  if jsonb_typeof(v_open) = 'boolean' and not (v_open #>> '{}')::boolean then
    return jsonb_build_object('ok', true, 'status', 'closed');
  end if;
  v_missing := lv.waitlist_policy_missing();
  if cardinality(v_missing) > 0 then
    return jsonb_build_object('ok', true, 'status', 'pending');
  end if;
  return jsonb_build_object('ok', true, 'status', 'open',
    'consent_version', (select p.value #>> '{}' from lv.policy p where p.key = 'waitlist.consent_version'),
    'retention_days', (select (p.value->>'days')::int from lv.policy p where p.key = 'waitlist.retention'),
    'removal_channel', (select p.value->>'channel' from lv.policy p where p.key = 'waitlist.removal'));
end;
$$;

create function lv.api_waitlist_join(p_email text, p_intended_hub_name text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_open jsonb; v_missing text[]; v_email text; v_name text; v_email_hash text; v_origin text; v_salt text;
  v_n_pair int; v_n_origin int; v_oldest timestamptz; v_days int; v_consent text;
begin
  select p.value into v_open from lv.policy p where p.key = 'waitlist.open';
  -- A deliberately closed list answers closed without needing the other decisions.
  if jsonb_typeof(v_open) = 'boolean' and not (v_open #>> '{}')::boolean then
    return jsonb_build_object('ok', true, 'status', 'closed');
  end if;
  v_missing := lv.waitlist_policy_missing();
  if cardinality(v_missing) > 0 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'lv_policy_undecided', 'message', 'The waitlist is not open yet.', 'missing', to_jsonb(v_missing)));
  end if;

  v_email := lower(btrim(p_email));
  if v_email is null or length(v_email) > 254 or v_email ~ '[[:cntrl:][:space:]]' or v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    return lv.err('lv_invalid_input', 'Enter a valid email address.');
  end if;
  v_name := case when p_intended_hub_name is null then null
                 when p_intended_hub_name ~ '[[:cntrl:]]' then null
                 when length(btrim(p_intended_hub_name)) between 1 and 80 then btrim(p_intended_hub_name)
                 else null end;
  if p_intended_hub_name is not null and v_name is null then
    return lv.err('lv_invalid_input', 'Check the Hub name.');
  end if;

  -- Throttle (PROVISIONAL): 5 attempts per address per day from the same origin, 30 per origin per hour. Both count the
  -- caller's own attempts only, whether or not the address was already listed.
  select s.value into v_salt from lv.secrets s where s.key = 'waitlist_salt';
  v_email_hash := encode(sha256(convert_to(v_salt || ':e:' || v_email, 'UTF8')), 'hex');
  v_origin := lv.waitlist_origin(v_salt);

  perform pg_advisory_xact_lock(hashtextextended('lv_waitlist:' || v_origin, 0));
  select count(*), min(a.at) into v_n_pair, v_oldest from lv.waitlist_attempts a
   where a.email_hash = v_email_hash and a.origin_hash = v_origin and a.at > now() - interval '1 day';
  if v_n_pair >= 5 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'lv_rate_limited', 'message', 'Too many attempts. Try again later.',
      'retry_after_seconds', greatest(60, ceil(extract(epoch from (v_oldest + interval '1 day' - now())))::int)));
  end if;
  select count(*), min(a.at) into v_n_origin, v_oldest from lv.waitlist_attempts a
   where a.origin_hash = v_origin and a.at > now() - interval '1 hour';
  if v_n_origin >= 30 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object(
      'code', 'lv_rate_limited', 'message', 'Too many attempts. Try again later.',
      'retry_after_seconds', greatest(60, ceil(extract(epoch from (v_oldest + interval '1 hour' - now())))::int)));
  end if;
  insert into lv.waitlist_attempts (email_hash, origin_hash) values (v_email_hash, v_origin);

  select (p.value->>'days')::int into v_days from lv.policy p where p.key = 'waitlist.retention';
  select p.value #>> '{}' into v_consent from lv.policy p where p.key = 'waitlist.consent_version';
  -- A repeat sign-up is silently idempotent (first details kept) and answers exactly like a new one.
  insert into lv.waitlist (email_normalized, intended_hub_name, consent_version, delete_after)
  values (v_email, v_name, v_consent, now() + make_interval(days => v_days))
  on conflict (email_normalized) do nothing;
  return jsonb_build_object('ok', true, 'status', 'queued');
end;
$$;

-- Operator functions (never exposed): retention and removal.
create function lv.purge_expired_waitlist() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  n_rows int; n_att int;
begin
  delete from lv.waitlist w where w.delete_after <= now();
  get diagnostics n_rows = row_count;
  delete from lv.waitlist_attempts a where a.at < now() - interval '7 days';
  get diagnostics n_att = row_count;
  return jsonb_build_object('waitlist_rows_deleted', n_rows, 'throttle_rows_deleted', n_att);
end;
$$;

-- Removal request: deletes the entry and every throttle record for that address.
create function lv.remove_waitlist_entry(p_email text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email)); v_salt text; n_rows int; n_att int;
begin
  select s.value into v_salt from lv.secrets s where s.key = 'waitlist_salt';
  delete from lv.waitlist w where w.email_normalized = v_email;
  get diagnostics n_rows = row_count;
  delete from lv.waitlist_attempts a where a.email_hash = encode(sha256(convert_to(v_salt || ':e:' || v_email, 'UTF8')), 'hex');
  get diagnostics n_att = row_count;
  return jsonb_build_object('waitlist_rows_deleted', n_rows, 'throttle_rows_deleted', n_att);
end;
$$;

-- API wrappers: expected failures are envelopes (see 000008).
create function lv_api.lv_waitlist_status() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_waitlist_status(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_waitlist_join(p_email text, p_intended_hub_name text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_waitlist_join(p_email, p_intended_hub_name); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

grant execute on all functions in schema lv_api to public;
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
