-- LunchVoice v2 foundation 10/N: Hub invitation codes (Discord-style links).
--
-- DEPENDS ON migrations 1-9. NOT APPLIED TO PRODUCTION. Creates no invitation and sets no policy.
--
-- An invitation is a bearer secret that admits whoever redeems it, so:
--   * the secret is shown ONCE at creation; the database keeps only its SHA-256 hash and the last four characters as a hint
--     (the hint identifies an invitation in a list and cannot be used to guess it);
--   * the code carries 80 random bits; a wrong guess, an unknown code, an expired, revoked or used-up code all answer the SAME
--     lv_not_found, so a caller cannot tell which;
--   * expiry, a use limit and revocation are the creator's choices. No default or ceiling is invented here: an invitation
--     with neither expiry nor limit works until it is revoked;
--   * redeeming admits the person as an ACCEPTED member (the invitation is the Hub's decision to admit), never above that: no
--     role, no capability, never Owner. A suspended or removed person is not readmitted by a code;
--   * a use is counted under the invitation's row lock, so a limit of N admits exactly N people however many redeem at once;
--     a person who is already a member does not consume a use, and redeeming twice is harmless;
--   * previewing shows only the Hub's name and address to someone who holds a valid code, so they can see where they are
--     going before they register. The code survives registration because the client keeps it; the database holds no state
--     for a visitor who has no account.
-- Managing invitations needs the existing capability admin.members.admit (the Owner always has it).

begin;

create table lv_private.hub_invites (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv_private.hubs (id) on delete restrict,
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  code_hint text not null check (length(code_hint) = 4),
  created_by uuid not null references lv_private.accounts (id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses int check (max_uses is null or max_uses between 1 and 100000),
  uses int not null default 0 check (uses >= 0),
  note text check (note is null or length(note) <= 200),
  revoked_at timestamptz,
  revoked_by uuid references lv_private.accounts (id) on delete restrict,
  check (max_uses is null or uses <= max_uses),
  check ((revoked_at is null) = (revoked_by is null)),
  check (expires_at is null or expires_at > created_at)
);
create index hub_invites_hub_idx on lv_private.hub_invites (hub_id, created_at desc);

create table lv_private.hub_invite_redemptions (
  invite_id uuid not null references lv_private.hub_invites (id) on delete restrict,
  account_id uuid not null references lv_private.accounts (id) on delete restrict,
  hub_id uuid not null,
  at timestamptz not null default now(),
  primary key (invite_id, account_id)
);
alter table lv_private.hub_invites enable row level security;
alter table lv_private.hub_invite_redemptions enable row level security;

create function lv_private.invite_status(i lv_private.hub_invites) returns text
language sql stable set search_path = ''
as $$
  select case
    when i.revoked_at is not null then 'revoked'
    when i.expires_at is not null and i.expires_at <= now() then 'expired'
    when i.max_uses is not null and i.uses >= i.max_uses then 'exhausted'
    else 'active' end
$$;

create function lv_private.invite_hash(p_code text) returns text
language sql immutable set search_path = ''
as $$ select encode(sha256(convert_to(lower(btrim(p_code)), 'UTF8')), 'hex') $$;

create function lv_private.invite_json(i lv_private.hub_invites) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', i.id, 'hub_id', i.hub_id, 'code_hint', i.code_hint, 'status', lv_private.invite_status(i),
    'created_at', i.created_at, 'expires_at', i.expires_at, 'max_uses', i.max_uses, 'uses', i.uses, 'note', i.note,
    'created_by_name', (select a.display_name from lv_private.accounts a where a.id = i.created_by))
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Manage
-- ---------------------------------------------------------------------------------------------------------
create function public.lv_invite_create(hub_id uuid, max_uses int default null, expires_at timestamptz default null, note text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_caller uuid; v_code text; v_note text := lv_private.clean_text(note, 200); i lv_private.hub_invites;
begin
  v_caller := lv_private.current_account_id();
  if v_caller is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null then return lv_private.fail('lv_invalid_input', 'hub_id is required.'); end if;
  if not exists (select 1 from lv_private.hubs h where h.id = lv_invite_create.hub_id) then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  if not lv_private.has_capability(hub_id, v_caller, 'admin.members.admit') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  if (max_uses is not null and (max_uses < 1 or max_uses > 100000))
     or (expires_at is not null and expires_at <= now())
     or (note is not null and v_note is null) then
    return lv_private.fail('lv_invalid_input', 'Check the invitation settings.');
  end if;
  v_code := substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 20);
  insert into lv_private.hub_invites (hub_id, code_hash, code_hint, created_by, expires_at, max_uses, note)
  values (hub_id, lv_private.invite_hash(v_code), right(v_code, 4), v_caller, lv_invite_create.expires_at, max_uses, v_note)
  returning * into i;
  return lv_private.ok(lv_private.invite_json(i) || jsonb_build_object('code', v_code));
end;
$$;

create function public.lv_invite_list(hub_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_caller uuid;
begin
  v_caller := lv_private.current_account_id();
  if v_caller is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if hub_id is null then return lv_private.fail('lv_invalid_input', 'hub_id is required.'); end if;
  if not exists (select 1 from lv_private.hubs h where h.id = lv_invite_list.hub_id) then return lv_private.fail('lv_not_found', 'Not found.'); end if;
  if not lv_private.has_capability(hub_id, v_caller, 'admin.members.admit') then
    return lv_private.fail('lv_forbidden', 'You do not have permission to do that.');
  end if;
  return lv_private.ok(jsonb_build_object('invites', coalesce((
    select jsonb_agg(lv_private.invite_json(x) order by x.created_at desc, x.id) from lv_private.hub_invites x where x.hub_id = lv_invite_list.hub_id), '[]'::jsonb)));
end;
$$;

create function public.lv_invite_revoke(invite_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare v_caller uuid; i lv_private.hub_invites;
begin
  v_caller := lv_private.current_account_id();
  if v_caller is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if invite_id is null then return lv_private.fail('lv_invalid_input', 'invite_id is required.'); end if;
  select * into i from lv_private.hub_invites x where x.id = lv_invite_revoke.invite_id for update;
  -- The same answer for "no such invitation" and "not yours to manage", so ids cannot be probed across Hubs.
  if not found or not lv_private.has_capability(i.hub_id, v_caller, 'admin.members.admit') then
    return lv_private.fail('lv_not_found', 'Not found.');
  end if;
  if i.revoked_at is null then
    update lv_private.hub_invites x set revoked_at = now(), revoked_by = v_caller where x.id = i.id returning * into i;
  end if;
  return lv_private.ok(lv_private.invite_json(i));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Use: preview (anyone holding a code) and redeem (signed in)
-- ---------------------------------------------------------------------------------------------------------
create function public.lv_invite_preview(code text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare i lv_private.hub_invites;
begin
  if code is null or length(btrim(code)) < 8 or length(code) > 64 then return lv_private.fail('lv_not_found', 'This invitation is not valid.'); end if;
  select * into i from lv_private.hub_invites x where x.code_hash = lv_private.invite_hash(code);
  if not found or lv_private.invite_status(i) <> 'active' then return lv_private.fail('lv_not_found', 'This invitation is not valid.'); end if;
  return lv_private.ok(jsonb_build_object('hub_slug', lower(lv_private.hub_slug(i.hub_id)), 'hub_name', lv_private.hub_name(i.hub_id)));
end;
$$;

create function public.lv_invite_redeem(code text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_acc uuid; i lv_private.hub_invites; v_status text; v_id uuid;
begin
  if auth.uid() is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  if code is null or length(btrim(code)) < 8 or length(code) > 64 then return lv_private.fail('lv_not_found', 'This invitation is not valid.'); end if;
  v_acc := lv_private.ensure_account();
  if v_acc is null then return lv_private.fail('lv_unauthenticated', 'Sign in to continue.'); end if;
  select x.id into v_id from lv_private.hub_invites x where x.code_hash = lv_private.invite_hash(code);
  if v_id is null then return lv_private.fail('lv_not_found', 'This invitation is not valid.'); end if;
  -- One use at a time per invitation: the limit is checked and consumed under this lock.
  select * into i from lv_private.hub_invites x where x.id = v_id for update;
  v_status := lv_private.membership_status(i.hub_id, v_acc);
  if v_status = 'accepted' then
    return lv_private.ok(jsonb_build_object('hub_id', i.hub_id, 'hub_slug', lower(lv_private.hub_slug(i.hub_id)), 'hub_name', lv_private.hub_name(i.hub_id),
      'status', 'accepted', 'already_member', true));
  end if;
  if lv_private.invite_status(i) <> 'active' then return lv_private.fail('lv_not_found', 'This invitation is not valid.'); end if;
  if v_status in ('suspended', 'removed') then return lv_private.fail('lv_forbidden', 'You cannot join this Hub.'); end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_join:' || i.hub_id::text || v_acc::text, 0));
  insert into lv_private.hub_memberships (hub_id, account_id, status, joined_at)
  values (i.hub_id, v_acc, 'accepted', now())
  on conflict on constraint hub_memberships_pkey do update set status = 'accepted', joined_at = now();
  update lv_private.hub_invites x set uses = x.uses + 1 where x.id = i.id;
  insert into lv_private.hub_invite_redemptions (invite_id, account_id, hub_id) values (i.id, v_acc, i.hub_id) on conflict do nothing;
  return lv_private.ok(jsonb_build_object('hub_id', i.hub_id, 'hub_slug', lower(lv_private.hub_slug(i.hub_id)), 'hub_name', lv_private.hub_name(i.hub_id),
    'status', 'accepted', 'already_member', false));
end;
$$;

revoke all on all tables in schema lv_private from public, anon, authenticated;
revoke all on all functions in schema lv_private from public, anon, authenticated;
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('lv_invite_create', 'lv_invite_list', 'lv_invite_revoke', 'lv_invite_preview', 'lv_invite_redeem')
  loop
    execute format('revoke all on function %s from public', f.sig);
    if f.proname = 'lv_invite_preview' then
      execute format('grant execute on function %s to anon, authenticated, service_role', f.sig);
    else
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end;
$$;

commit;
