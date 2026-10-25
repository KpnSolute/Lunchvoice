-- LunchVoice v2 foundation 6/N: public waitlist and Hub settings.
--
-- DEPENDS ON migrations 1-5. NOT APPLIED TO PRODUCTION. Sets no policy value and creates no grant.
--
-- Waitlist (F-01, F-03): a public, anonymous-callable queue. WHAT IS STORED, plainly:
--   * lv_private.waitlist holds the email address (normalized to lower case), an optional intended Hub name, the version
--     of the consent wording shown and a deletion date. It is personal data. The table has no API grant, no operation reads
--     it back, and it links to no account, Hub or Campaign.
--   * lv_private.waitlist_attempts (the throttle ledger) holds only SALTED HASHES of the address and of the caller's origin,
--     never the raw address or IP. Hashing does not make it anonymous; it is deleted after 7 days.
--   The answer never reveals whether an address was already on the list (no enumeration), and a throttle answer depends only
--   on the CALLER's own recent activity, never on what other people submitted. The list stays CLOSED until the founder
--   decides FOUR things: waitlist.open, waitlist.consent_version (the approved wording), waitlist.retention and
--   waitlist.removal. The throttle limits below are PROVISIONAL TEST VALUES, not approved. The caller's origin is trusted only
--   if waitlist.trusted_ip names a header and a proxy-hop count that the real edge has been verified to set; otherwise all
--   callers share one origin bucket. A value supplied by the browser is never trusted by itself.
--
-- Hub settings (F-44): rename, visibility and membership mode, gated by admin.settings.edit. The slug is never changed
-- here (D-09). The Hub's v2 display name is separate from the legacy organization name, which this migration never edits.
--
-- Provisional (contract P-36..P-40): the rate limits, the generic duplicate answer, consent/legal copy and email
-- retention are not founder decisions.

insert into lv_private.policy (key, value, note) values
  ('waitlist.open', null,
   'Whether the public waitlist accepts sign-ups. JSON true or false. Undecided (D-07): NULL makes lv_waitlist_join answer lv_policy_undecided; false answers status closed. true is honoured only when the three keys below are also set.'),
  ('waitlist.consent_version', null,
   'Identifier of the founder-approved consent/privacy wording shown beside the form, a JSON string up to 64 characters. Undecided (D-07/legal): stored with each sign-up. No wording is invented by engineering.'),
  ('waitlist.retention', null,
   'How long a sign-up is kept. {"days": 1..3650}. Undecided (D-10): sets each row''s deletion date; the purge job deletes expired rows.'),
  ('waitlist.removal', null,
   'How a person asks to be removed, shown to them. {"channel": "text up to 200 characters"}. Undecided (D-10). The operator function remove_waitlist_entry performs a removal.'),
  ('waitlist.trusted_ip', null,
   'Where the caller''s network address comes from. {"header": "x-forwarded-for"|"x-real-ip"|"cf-connecting-ip", "hops_from_right": 1..5}: the value hops_from_right entries from the right of that header, as set by YOUR trusted proxies. Must be verified against the real edge before use. Undecided: NULL puts every caller in one shared bucket (no per-network identity is trusted).');

-- Per-install salt so stored IP hashes cannot be reversed by hashing the IPv4 space.
create table lv_private.secrets (key text primary key, value text not null);
insert into lv_private.secrets (key, value) values ('waitlist_ip_salt', gen_random_uuid()::text || gen_random_uuid()::text);

create table lv_private.waitlist (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique check (length(email_normalized) between 3 and 254),
  intended_hub_name text check (intended_hub_name is null or length(intended_hub_name) <= 80),
  consent_version text not null,
  delete_after timestamptz not null,
  created_at timestamptz not null default now()
);
create index waitlist_delete_after_idx on lv_private.waitlist (delete_after);

-- Throttle ledger: HASHES only, never the address or the IP. Rows older than 7 days can be deleted by an operator.
create table lv_private.waitlist_attempts (
  id bigint generated always as identity primary key,
  email_hash text not null,
  origin_hash text not null,
  at timestamptz not null default now()
);
create index waitlist_attempts_pair_idx on lv_private.waitlist_attempts (email_hash, origin_hash, at);
create index waitlist_attempts_origin_idx on lv_private.waitlist_attempts (origin_hash, at);

alter table lv_private.hubs add column display_name text check (display_name is null or length(btrim(display_name)) between 1 and 80);

create table lv_private.hub_settings_events (
  id bigint generated always as identity primary key,
  hub_id uuid not null references lv_private.hubs (id) on delete restrict,
  actor_account_id uuid references lv_private.accounts (id),
  changes jsonb not null,
  at timestamptz not null default now()
);

alter table lv_private.secrets enable row level security;
alter table lv_private.waitlist enable row level security;
alter table lv_private.waitlist_attempts enable row level security;
alter table lv_private.hub_settings_events enable row level security;

-- The Hub's name as shown by v2 operations: its own display name if set, else the legacy organization name.
create or replace function public.lv_hub_public(slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  r record; v_acc uuid := lv_private.current_account_id(); v_status text; v_viewer text; v_count bigint;
begin
  if slug is null or length(slug) < 2 or length(slug) > 40 then
    return lv_private.fail('lv_invalid_input', 'Check the Hub address.');
  end if;
  select h.id, h.visibility, h.membership_mode, coalesce(h.display_name, o.name) as name, o.slug into r
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
      'hub_id', h.id, 'slug', lower(o.slug), 'name', coalesce(h.display_name, o.name), 'status', 'accepted',
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
      'hub_id', h.id, 'slug', lower(o.slug), 'name', coalesce(h.display_name, o.name), 'status', m.status)
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

create function lv_private.clean_text(p_text text, p_max int) returns text
language sql immutable set search_path = ''
as $$
  select case when p_text is null then null
              when p_text ~ '[[:cntrl:]]' then null
              when length(btrim(p_text)) = 0 or length(btrim(p_text)) > p_max then null
              else btrim(p_text) end
$$;

revoke all on all tables in schema lv_private from public, anon, authenticated;
revoke all on all functions in schema lv_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------------------------------------
-- Origin of the caller: a salted hash of the trusted network address, or the single shared bucket 'unknown'. Only the
-- entry the configured proxies appended is used (counted from the right), so values a browser prepends are ignored.
create function lv_private.waitlist_origin(p_salt text) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_pol jsonb; v_headers json; v_hdr text; v_val text; v_parts text[]; v_hops int; v_ip text;
begin
  select p.value into v_pol from lv_private.policy p where p.key = 'waitlist.trusted_ip';
  if v_pol is null or jsonb_typeof(v_pol) <> 'object' or (v_pol->>'header') not in ('x-forwarded-for', 'x-real-ip', 'cf-connecting-ip')
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

-- Everything that must be decided before the real list opens; returns the missing keys.
create function lv_private.waitlist_policy_missing() returns text[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb; m text[] := '{}';
begin
  select p.value into v from lv_private.policy p where p.key = 'waitlist.open';
  if v is null or jsonb_typeof(v) <> 'boolean' then m := m || 'waitlist.open'::text; end if;
  select p.value into v from lv_private.policy p where p.key = 'waitlist.consent_version';
  if v is null or jsonb_typeof(v) <> 'string' or length(btrim(v #>> '{}')) not between 1 and 64 then m := m || 'waitlist.consent_version'::text; end if;
  select p.value into v from lv_private.policy p where p.key = 'waitlist.retention';
  if v is null or jsonb_typeof(v) <> 'object' or (v->>'days') !~ '^[1-9][0-9]{0,3}$' or (v->>'days')::int > 3650 then m := m || 'waitlist.retention'::text; end if;
  select p.value into v from lv_private.policy p where p.key = 'waitlist.removal';
  if v is null or jsonb_typeof(v) <> 'object' or jsonb_typeof(v->'channel') <> 'string' or length(btrim(v->>'channel')) not between 1 and 200 then m := m || 'waitlist.removal'::text; end if;
  return m;
end;
$$;

create function public.lv_waitlist_join(email text, intended_hub_name text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_open jsonb; v_missing text[]; v_email text; v_name text; v_email_hash text; v_origin text; v_salt text;
  v_n_pair int; v_n_origin int; v_oldest timestamptz; v_days int; v_consent text;
begin
  select p.value into v_open from lv_private.policy p where p.key = 'waitlist.open';
  -- A deliberately closed list answers closed without needing the other decisions.
  if jsonb_typeof(v_open) = 'boolean' and not (v_open #>> '{}')::boolean then
    return lv_private.ok(jsonb_build_object('status', 'closed'));
  end if;
  v_missing := lv_private.waitlist_policy_missing();
  if cardinality(v_missing) > 0 then
    return lv_private.fail('lv_policy_undecided', 'The waitlist is not open yet.', jsonb_build_object('reason', 'policy_pending', 'missing', to_jsonb(v_missing)));
  end if;

  v_email := lower(btrim(email));
  if v_email is null or length(v_email) > 254 or v_email ~ '[[:cntrl:][:space:]]' or v_email !~ '^[^@]+@[^@]+\.[^@]+$' then
    return lv_private.fail('lv_invalid_input', 'Enter a valid email address.');
  end if;
  v_name := lv_private.clean_text(intended_hub_name, 80);
  if intended_hub_name is not null and v_name is null then
    return lv_private.fail('lv_invalid_input', 'Check the Hub name.');
  end if;

  -- Throttle (PROVISIONAL, unapproved): 5 attempts per address per day FROM THE SAME ORIGIN, and 30 per origin per hour.
  -- Both count the caller's own attempts only, whether or not the address was already listed, so what a caller sees can
  -- never depend on what anyone else submitted.
  select s.value into v_salt from lv_private.secrets s where s.key = 'waitlist_ip_salt';
  v_email_hash := encode(sha256(convert_to(v_salt || ':e:' || v_email, 'UTF8')), 'hex');
  v_origin := lv_private.waitlist_origin(v_salt);

  perform pg_advisory_xact_lock(hashtextextended('lv_waitlist:' || v_origin, 0));
  select count(*), min(a.at) into v_n_pair, v_oldest from lv_private.waitlist_attempts a
  where a.email_hash = v_email_hash and a.origin_hash = v_origin and a.at > now() - interval '1 day';
  if v_n_pair >= 5 then
    return lv_private.fail('lv_rate_limited', 'Too many attempts. Try again later.',
      jsonb_build_object('retry_after_seconds', greatest(60, ceil(extract(epoch from (v_oldest + interval '1 day' - now())))::int)));
  end if;
  select count(*), min(a.at) into v_n_origin, v_oldest from lv_private.waitlist_attempts a where a.origin_hash = v_origin and a.at > now() - interval '1 hour';
  if v_n_origin >= 30 then
    return lv_private.fail('lv_rate_limited', 'Too many attempts. Try again later.',
      jsonb_build_object('retry_after_seconds', greatest(60, ceil(extract(epoch from (v_oldest + interval '1 hour' - now())))::int)));
  end if;
  insert into lv_private.waitlist_attempts (email_hash, origin_hash) values (v_email_hash, v_origin);

  select (p.value->>'days')::int into v_days from lv_private.policy p where p.key = 'waitlist.retention';
  select p.value #>> '{}' into v_consent from lv_private.policy p where p.key = 'waitlist.consent_version';
  -- A repeat sign-up is silently idempotent (first details kept) and answers exactly like a new one.
  insert into lv_private.waitlist (email_normalized, intended_hub_name, consent_version, delete_after)
  values (v_email, v_name, v_consent, now() + make_interval(days => v_days))
  on conflict (email_normalized) do nothing;
  return lv_private.ok(jsonb_build_object('status', 'queued'));
end;
$$;

-- Operator functions (not exposed): retention and removal. Both are no-ops until a real list exists.
create function lv_private.purge_expired_waitlist() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  n_rows int; n_att int;
begin
  delete from lv_private.waitlist w where w.delete_after <= now();
  get diagnostics n_rows = row_count;
  delete from lv_private.waitlist_attempts a where a.at < now() - interval '7 days';
  get diagnostics n_att = row_count;
  return jsonb_build_object('waitlist_rows_deleted', n_rows, 'throttle_rows_deleted', n_att);
end;
$$;

-- Removal request: deletes the entry and every throttle record for that address.
create function lv_private.remove_waitlist_entry(p_email text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email)); v_salt text; n_rows int; n_att int;
begin
  select s.value into v_salt from lv_private.secrets s where s.key = 'waitlist_ip_salt';
  delete from lv_private.waitlist w where w.email_normalized = v_email;
  get diagnostics n_rows = row_count;
  delete from lv_private.waitlist_attempts a where a.email_hash = encode(sha256(convert_to(v_salt || ':e:' || v_email, 'UTF8')), 'hex');
  get diagnostics n_att = row_count;
  return jsonb_build_object('waitlist_rows_deleted', n_rows, 'throttle_rows_deleted', n_att);
end;
$$;

revoke all on all functions in schema lv_private from public, anon, authenticated;

create function public.lv_hub_settings_update(hub_id uuid, name text default null, visibility text default null, membership_mode text default null) returns jsonb
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
  return lv_private.ok((select jsonb_build_object('hub_id', x.id, 'name', coalesce(x.display_name, o.name), 'visibility', x.visibility, 'membership_mode', x.membership_mode)
                        from lv_private.hubs x join public.orgs o on o.id = x.id where x.id = lv_hub_settings_update.hub_id));
end;
$$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('lv_waitlist_join', 'lv_hub_settings_update', 'lv_hub_public', 'lv_my_context')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
  end loop;
end;
$$;
