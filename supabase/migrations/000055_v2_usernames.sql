-- 000055: unique usernames (@handles) chosen at sign-up, separate from the free display name (spec E11).
--
-- Founder, 2026-11-14: a person who signs up with Google or Discord must pick a username for LunchVoice instead of
-- inheriting the provider's name; the username is unique and is how people are mentioned and found (@kpn).
--
--   * lv.accounts.handle: 3 to 20 characters, lowercase a-z, digits and underscore, starts with a letter, no double
--     underscore, never an "@". Stored lowercase, so the unique index is case-insensitive. Null until chosen.
--   * lv.reserved_handles: platform words nobody may take. No customer, Hub or person is reserved.
--   * lv.handle_history: an old handle is held for handle.hold_days after a change, so nobody can impersonate it.
--   * A change is allowed once every handle.change_days; the first claim is free.
--   * RPCs: lv_handle_get, lv_handle_check (rate limited, signed in only, answers only "available" plus suggestions),
--     lv_handle_set (race-safe). The display name keeps using lv_profile_update.
-- An email is never a handle and a handle is never an identity key: identity stays (issuer, subject).
-- Rollback: supabase/rollbacks/000055_v2_usernames.down.sql.
begin;

alter table lv.accounts
  add column handle text,
  add column handle_changed_at timestamptz;

alter table lv.accounts
  add constraint accounts_handle_format
  check (handle is null or (handle ~ '^[a-z][a-z0-9_]{2,19}$' and position('__' in handle) = 0));
create unique index accounts_handle_key on lv.accounts (handle) where handle is not null;

create table lv.reserved_handles (
  handle text primary key check (handle ~ '^[a-z][a-z0-9_]{2,19}$')
);
insert into lv.reserved_handles (handle) values
  ('admin'), ('administrator'), ('staff'), ('support'), ('help'), ('lunchvoice'), ('kpnsolute'), ('moderator'),
  ('mod'), ('system'), ('everyone'), ('here'), ('owner'), ('official'), ('root'), ('security'), ('billing'),
  ('abuse'), ('postmaster'), ('noreply'), ('team'), ('lvbot'), ('discord'), ('api'), ('www'), ('null'),
  ('undefined'), ('anonymous'), ('guest'), ('nobody');

create table lv.handle_history (
  id bigint generated always as identity primary key,
  handle text not null,
  account_id uuid not null references lv.accounts (id) on delete cascade,
  released_at timestamptz not null default now(),
  held_until timestamptz not null
);
create index handle_history_handle_idx on lv.handle_history (handle, held_until);

-- Checks are rate limited per account; rows are pruned as they age.
create table lv.handle_check_log (
  account_id uuid not null references lv.accounts (id) on delete cascade,
  at timestamptz not null default now()
);
create index handle_check_log_idx on lv.handle_check_log (account_id, at);

alter table lv.reserved_handles enable row level security;
alter table lv.handle_history enable row level security;
alter table lv.handle_check_log enable row level security;

insert into lv.policy (key, value, note) values
  ('handle.change_days', '30'::jsonb, 'A username can be changed once every this many days (the first claim is free).'),
  ('handle.hold_days', '14'::jsonb, 'A released username is held for this many days so nobody can take it to impersonate.'),
  ('handle.checks_per_minute', '30'::jsonb, 'Username availability checks allowed per account per minute.')
on conflict (key) do nothing;

-- Why a handle cannot be used by p_account, or null when it can. Input must already be lowercased and trimmed.
create function lv.handle_problem(p_handle text, p_account uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_handle is null or length(p_handle) < 3 or length(p_handle) > 20 then return 'length'; end if;
  if p_handle !~ '^[a-z][a-z0-9_]{2,19}$' or position('__' in p_handle) > 0 then return 'format'; end if;
  if exists (select 1 from lv.reserved_handles r where r.handle = p_handle) then return 'reserved'; end if;
  if exists (select 1 from lv.accounts a where a.handle = p_handle and a.id <> p_account) then return 'taken'; end if;
  if exists (select 1 from lv.handle_history h
              where h.handle = p_handle and h.held_until > now() and h.account_id <> p_account) then return 'held'; end if;
  return null;
end;
$$;

create function lv.api_handle_get() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_row record;
  v_days int := coalesce((lv.policy_json('handle.change_days'))::int, 30);
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in first.'); end if;
  select a.handle, a.display_name, a.handle_changed_at into v_row from lv.accounts a where a.id = v_account;
  return jsonb_build_object('ok', true, 'handle', v_row.handle, 'display_name', v_row.display_name,
    'can_change_at', case when v_row.handle is not null and v_row.handle_changed_at is not null
                          then v_row.handle_changed_at + make_interval(days => v_days) end);
end;
$$;

create function lv.api_handle_check(p_handle text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_handle text := lower(btrim(coalesce(p_handle, '')));
  v_problem text;
  v_recent int;
  v_base text;
  v_suggestions jsonb := '[]'::jsonb;
  v_try text;
  i int;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in first.'); end if;
  delete from lv.handle_check_log where account_id = v_account and at < now() - interval '10 minutes';
  select count(*) into v_recent from lv.handle_check_log where account_id = v_account and at > now() - interval '1 minute';
  if v_recent >= coalesce((lv.policy_json('handle.checks_per_minute'))::int, 30) then
    return lv.err('lv_rate_limited', 'Too many checks. Wait a moment and try again.');
  end if;
  insert into lv.handle_check_log (account_id) values (v_account);

  v_problem := lv.handle_problem(v_handle, v_account);
  if v_problem is null then
    return jsonb_build_object('ok', true, 'available', true, 'handle', v_handle);
  end if;

  -- Suggestions: the cleaned input (or "member") with a short number, only ones that are free.
  v_base := regexp_replace(v_handle, '[^a-z0-9_]', '', 'g');
  v_base := regexp_replace(v_base, '_+', '_', 'g');
  v_base := regexp_replace(v_base, '^[^a-z]+', '');
  if length(v_base) < 3 then v_base := 'member'; end if;
  v_base := left(v_base, 16);
  for i in 1..8 loop
    v_try := v_base || (10 + floor(random() * 990))::int::text;
    if lv.handle_problem(v_try, v_account) is null and not (v_suggestions ? v_try) then
      v_suggestions := v_suggestions || to_jsonb(v_try);
    end if;
    exit when jsonb_array_length(v_suggestions) >= 3;
  end loop;
  return jsonb_build_object('ok', true, 'available', false, 'reason', v_problem, 'suggestions', v_suggestions);
end;
$$;

create function lv.api_handle_set(p_handle text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_handle text := lower(btrim(coalesce(p_handle, '')));
  v_old text;
  v_changed timestamptz;
  v_change_days int := coalesce((lv.policy_json('handle.change_days'))::int, 30);
  v_hold_days int := coalesce((lv.policy_json('handle.hold_days'))::int, 14);
  v_problem text;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in first.'); end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_handle:' || v_handle, 0));
  select a.handle, a.handle_changed_at into v_old, v_changed from lv.accounts a where a.id = v_account for update;
  if v_old = v_handle then
    return jsonb_build_object('ok', true, 'handle', v_handle);
  end if;
  if v_old is not null and v_changed is not null and v_changed + make_interval(days => v_change_days) > now() then
    return lv.err_x('lv_rate_limited', 'You can change your username once every ' || v_change_days || ' days.',
                    jsonb_build_object('can_change_at', v_changed + make_interval(days => v_change_days)));
  end if;
  v_problem := lv.handle_problem(v_handle, v_account);
  if v_problem is not null then
    return case v_problem
      when 'length' then lv.err('lv_invalid_input', 'A username is 3 to 20 characters.')
      when 'format' then lv.err('lv_invalid_input', 'Use lowercase letters, numbers and underscores, starting with a letter.')
      when 'reserved' then lv.err('lv_invalid_input', 'That username is not available.')
      else lv.err('lv_conflict', 'That username is taken.')
    end;
  end if;
  if v_old is not null then
    insert into lv.handle_history (handle, account_id, held_until)
    values (v_old, v_account, now() + make_interval(days => v_hold_days));
  end if;
  begin
    update lv.accounts set handle = v_handle,
           handle_changed_at = case when v_old is null then null else now() end
     where id = v_account;
  exception when unique_violation then
    return lv.err('lv_conflict', 'That username is taken.');
  end;
  perform lv.audit(v_account, null, 'account.handle_set', v_account::text,
                   jsonb_build_object('replaced', v_old is not null));
  return jsonb_build_object('ok', true, 'handle', v_handle);
end;
$$;

create function lv_api.lv_handle_get() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_handle_get(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_handle_check(p_handle text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_handle_check(p_handle); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_handle_set(p_handle text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_handle_set(p_handle); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

revoke all on function lv.handle_problem(text, uuid), lv.api_handle_get(), lv.api_handle_check(text), lv.api_handle_set(text) from public;
revoke all on function lv_api.lv_handle_get(), lv_api.lv_handle_check(text), lv_api.lv_handle_set(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function lv_api.lv_handle_get(), lv_api.lv_handle_check(text), lv_api.lv_handle_set(text) to authenticated';
  end if;
end $$;

-- Find an existing LunchVoice account for the person's verified email, so a new sign-in method (a new Discord, Google or
-- email identity) can offer to link to it instead of silently creating a second account. Founder, 2026-11-14: "look for an
-- email associated with this account and ask if you want to link, then confirm the password". This function only LOOKS (it
-- returns a hint: display name and username, never an email or an id); the link itself needs proof of the old sign-in
-- (spec A9) and is a separate step. Lookups use the new index on the lowercased identity email.
create index account_identities_email_idx on lv.account_identities (lower(email)) where email is not null;

create function lv.api_link_candidates() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in first.'); end if;
  return jsonb_build_object('ok', true, 'candidates', coalesce((
    select jsonb_agg(jsonb_build_object('display_name', a.display_name, 'handle', a.handle, 'created_at', a.created_at)
                     order by a.created_at)
      from (select distinct o.account_id
              from lv.account_identities mine
              join lv.account_identities o on lower(o.email) = lower(mine.email) and o.account_id <> v_account
             where mine.account_id = v_account and mine.email is not null and mine.email_verified_at is not null) c
      join lv.accounts a on a.id = c.account_id), '[]'::jsonb));
end;
$$;

create function lv_api.lv_link_candidates() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_link_candidates(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
revoke all on function lv.api_link_candidates(), lv_api.lv_link_candidates() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function lv_api.lv_link_candidates() to authenticated';
  end if;
end $$;

commit;
