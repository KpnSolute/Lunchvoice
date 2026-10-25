-- LunchVoice v2 canonical baseline 6/6: platform functions -- Hub creation, invitations, beta access.
--
-- Replaces prototype 20261024000900 (REDESIGN) and 20261024001000 (KEEP). This file also defines the
-- lv_api surface, because a fresh install must expose something callable or it is not an installation.
--
-- Deliberately NOT ported: waitlist (four undecided policy questions), Owner transfer (undecided reauth),
-- guest participation (D-03), legacy bridge (removed by directive S-7).

begin;

-- ---------------------------------------------------------------------------------------------------------
-- Reserved slugs and platform admins
-- ---------------------------------------------------------------------------------------------------------
create table lv.reserved_slugs (
  slug text primary key,
  reason text not null
);
insert into lv.reserved_slugs (slug, reason) values
  ('admin', 'platform route'),
  ('api', 'platform route'),
  ('app', 'platform route'),
  ('auth', 'platform route'),
  ('billing', 'platform route'),
  ('discover', 'platform route'),
  ('discovery', 'platform route'),
  ('login', 'platform route'),
  ('pricing', 'platform route'),
  ('signup', 'platform route'),
  ('support', 'platform route'),
  ('www', 'platform route')
on conflict do nothing;

create table lv.platform_admins (
  account_id uuid primary key references lv.accounts (id) on delete cascade,
  granted_by uuid references lv.accounts (id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table lv.platform_admin_events (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  account_id uuid,
  action text not null check (action in ('granted', 'revoked'))
);

create function lv.is_platform_admin(p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from lv.platform_admins a
                  where a.account_id = p_account and a.revoked_at is null)
$$;

-- Operator-only: the first registered person is never made an administrator by signing up.
create function lv.grant_platform_admin(p_account uuid, p_actor uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  insert into lv.platform_admins (account_id, granted_by) values (p_account, p_actor)
  on conflict (account_id) do update set revoked_at = null, granted_by = excluded.granted_by, granted_at = now();
  insert into lv.platform_admin_events (account_id, action) values (p_account, 'granted');
  perform lv.audit(p_actor, null, 'platform_admin.granted', p_account::text);
end;
$$;

create function lv.revoke_platform_admin(p_account uuid, p_actor uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update lv.platform_admins set revoked_at = now() where account_id = p_account and revoked_at is null;
  insert into lv.platform_admin_events (account_id, action) values (p_account, 'revoked');
  perform lv.audit(p_actor, null, 'platform_admin.revoked', p_account::text);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Beta applications
-- ---------------------------------------------------------------------------------------------------------
create table lv.beta_applications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references lv.accounts (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'consumed')),
  note text,
  decided_by uuid references lv.accounts (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  constraint beta_applications_one_pending unique (account_id)
);
create index beta_applications_status_idx on lv.beta_applications (status, created_at);

create table lv.beta_application_events (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  application_id uuid references lv.beta_applications (id) on delete cascade,
  action text not null,
  actor uuid,
  detail jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------------------------------------
-- Hub invitations (ported from prototype 20261024001000; security posture unchanged)
-- ---------------------------------------------------------------------------------------------------------
create table lv.hub_invites (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  code_hash text not null,            -- only the hash is stored; the code is shown once
  created_by uuid references lv.accounts (id) on delete set null,
  max_uses int check (max_uses is null or max_uses > 0),
  uses int not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint hub_invites_hash_key unique (code_hash),
  constraint hub_invites_uses_sane check (uses >= 0 and (max_uses is null or uses <= max_uses))
);
create index hub_invites_hub_idx on lv.hub_invites (hub_id);

create table lv.hub_invite_redemptions (
  invite_id uuid not null references lv.hub_invites (id) on delete cascade,
  account_id uuid not null references lv.accounts (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (invite_id, account_id)
);

create function lv.invite_hash(p_code text) returns text
language plpgsql stable set search_path = ''
as $$
declare
  v_schema text;
  v_out text;
begin
  select n.nspname into v_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pgcrypto';
  if v_schema is null then raise exception 'lv_server_error: pgcrypto is not installed'; end if;
  execute format('select encode(%I.digest($1, ''sha256''), ''hex'')', v_schema) into v_out using upper(btrim(p_code));
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- API surface. Every function derives the caller from the verified token; none trusts a supplied id.
-- ---------------------------------------------------------------------------------------------------------

create function lv_api.lv_my_context() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_ci jsonb := lv.caller_identity();
begin
  if v_account is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_unauthenticated', 'message', 'Sign in with KpnIdentity first.'));
  end if;
  return jsonb_build_object('ok', true, 'account_id', v_account,
    'display_name', (select a.display_name from lv.accounts a where a.id = v_account),
    'email_verified', (select i.email_verified_at is not null from lv.account_identities i
                        where i.identity_issuer = v_ci->>'issuer' and i.identity_subject = v_ci->>'subject'),
    'hubs', coalesce((
      select jsonb_agg(jsonb_build_object('hub_id', h.id, 'slug', h.slug, 'name', h.display_name, 'is_owner', h.owner_account_id = v_account))
        from lv.hub_memberships m join lv.hubs h on h.id = m.hub_id
       where m.account_id = v_account and m.status = 'accepted'), jsonb_build_array()));
end;
$$;

create function lv_api.lv_hub_create(p_slug text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_slug text := lower(btrim(p_slug));
  v_app uuid;
  v_hub uuid;
  v_member uuid;
begin
  if v_account is null then
    raise exception 'lv_unauthenticated: sign in first' using errcode = '42501';
  end if;
  if exists (select 1 from lv.reserved_slugs r where r.slug = v_slug) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_invalid_input', 'message', 'That name is reserved.'));
  end if;

  -- Beta gate: an approved application is required to create a Hub. Fails closed when no application exists.
  select id into v_app from lv.beta_applications b
   where b.account_id = v_account and b.status = 'approved';
  if v_app is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_beta_required', 'message', 'Hub creation requires an approved beta application.'));
  end if;

  insert into lv.hubs (slug, display_name, owner_account_id) values (v_slug, btrim(p_name), v_account) returning id into v_hub;
  insert into lv.hub_memberships (hub_id, account_id, status, accepted_at)
  values (v_hub, v_account, 'accepted', now()) returning id into v_member;
  perform lv.owner_bootstrap_roles(v_hub, v_account);

  update lv.beta_applications set status = 'consumed', decided_at = now() where id = v_app;

  return jsonb_build_object('ok', true, 'hub_id', v_hub, 'slug', v_slug);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_conflict', 'message', 'That Hub name is taken.'));
end;
$$;

create function lv_api.lv_beta_apply(p_note text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_ci jsonb;
  v_id uuid;
begin
  if v_account is null then raise exception 'lv_unauthenticated: sign in first' using errcode = '42501'; end if;
  v_ci := lv.caller_identity();
  -- A verified contact address is required; an unverified email cannot be the contact for a beta decision.
  if not coalesce((v_ci->>'email_verified')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_unverified_email', 'message', 'Verify your email with KpnIdentity first.'));
  end if;
  insert into lv.beta_applications (account_id, note) values (v_account, p_note)
  on conflict (account_id) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_conflict', 'message', 'You already have an application.'));
  end if;
  return jsonb_build_object('ok', true, 'application_id', v_id);
end;
$$;

create function lv_api.lv_beta_decide(p_application uuid, p_approve boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_owner uuid;
begin
  if v_account is null then raise exception 'lv_unauthenticated: sign in first' using errcode = '42501'; end if;
  if not lv.is_platform_admin(v_account) then
    raise exception 'lv_forbidden: platform review requires an administrator' using errcode = '42501';
  end if;
  select account_id into v_owner from lv.beta_applications where id = p_application;
  if v_owner is null then raise exception 'lv_not_found: no such application' using errcode = '23503'; end if;
  if v_owner = v_account then
    raise exception 'lv_forbidden: nobody can decide their own application' using errcode = '42501';
  end if;
  -- Repeating the same decision changes nothing.
  update lv.beta_applications
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = v_account, decided_at = now()
   where id = p_application and status = 'pending';
  return jsonb_build_object('ok', true);
end;
$$;

create function lv_api.lv_invite_create(p_hub uuid, p_max_uses int default null, p_expires_at timestamptz default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_code text;
  v_id uuid;
begin
  perform lv.require_capability(v_account, p_hub, 'admin.members.admit');
  -- 80 random bits of a 32-character unambiguous alphabet, shown exactly once.
  v_code := upper(encode(lv.random_bytes(16), 'hex'));
  insert into lv.hub_invites (hub_id, code_hash, created_by, max_uses, expires_at)
  values (p_hub, lv.invite_hash(v_code), v_account, p_max_uses, p_expires_at)
  returning id into v_id;
  perform lv.audit(v_account, p_hub, 'invite.created', v_id::text);
  return jsonb_build_object('ok', true, 'invite_id', v_id, 'code', v_code, 'shown_once', true);
end;
$$;

create function lv_api.lv_invite_redeem(p_code text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_inv record;
  v_member uuid;
begin
  if v_account is null then raise exception 'lv_unauthenticated: sign in first' using errcode = '42501'; end if;

  select * into v_inv from lv.hub_invites i
   where i.code_hash = lv.invite_hash(p_code) for update;

  -- Unknown, revoked, expired and exhausted all answer identically.
  if v_inv.id is null
     or v_inv.revoked_at is not null
     or (v_inv.expires_at is not null and v_inv.expires_at <= now())
     or (v_inv.max_uses is not null and v_inv.uses >= v_inv.max_uses) then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'lv_invalid_code', 'message', 'That invitation is not valid.'));
  end if;

  select id into v_member from lv.hub_memberships m
   where m.hub_id = v_inv.hub_id and m.account_id = v_account and m.status = 'accepted';

  if v_member is not null then
    -- An existing member consumes no use and gains nothing.
    return jsonb_build_object('ok', true, 'hub_id', v_inv.hub_id, 'already_member', true);
  end if;

  insert into lv.hub_memberships (hub_id, account_id, status, accepted_at)
  values (v_inv.hub_id, v_account, 'accepted', now());
  insert into lv.hub_invite_redemptions (invite_id, account_id) values (v_inv.id, v_account);
  update lv.hub_invites set uses = uses + 1 where id = v_inv.id;

  -- Redeeming never grants a role and never confers Owner.
  perform lv.audit(v_account, v_inv.hub_id, 'invite.redeemed', v_inv.id::text);
  return jsonb_build_object('ok', true, 'hub_id', v_inv.hub_id, 'already_member', false);
end;
$$;

create function lv_api.lv_invite_revoke(p_invite uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_hub uuid;
begin
  select hub_id into v_hub from lv.hub_invites where id = p_invite;
  if v_hub is null then raise exception 'lv_not_found: no such invitation' using errcode = '23503'; end if;
  perform lv.require_capability(v_account, v_hub, 'admin.members.admit');
  update lv.hub_invites set revoked_at = coalesce(revoked_at, now()) where id = p_invite;
  return jsonb_build_object('ok', true);
end;
$$;

create function lv_api.lv_campaign_create(p_hub uuid, p_title text, p_mode text, p_anonymity text default 'anonymous')
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_id uuid;
begin
  perform lv.require_capability(v_account, p_hub, 'campaign.manage');
  insert into lv.campaigns (hub_id, title, mode, anonymity, created_by)
  values (p_hub, btrim(p_title), p_mode, p_anonymity, v_account)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'campaign_id', v_id);
end;
$$;

create function lv_api.lv_campaign_question_add(p_campaign uuid, p_position int, p_kind text, p_prompt text, p_config jsonb default '{}'::jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_hub uuid;
  v_id uuid;
begin
  select hub_id into v_hub from lv.campaigns where id = p_campaign;
  if v_hub is null then raise exception 'lv_not_found: no such Campaign' using errcode = '23503'; end if;
  perform lv.require_capability(v_account, v_hub, 'campaign.manage');
  insert into lv.campaign_questions (campaign_id, position, kind, prompt, config)
  values (p_campaign, p_position, p_kind, btrim(p_prompt), coalesce(p_config, '{}'::jsonb))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'question_id', v_id);
end;
$$;

create function lv_api.lv_campaign_activate(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_hub uuid;
begin
  select hub_id into v_hub from lv.campaigns where id = p_campaign;
  if v_hub is null then raise exception 'lv_not_found: no such Campaign' using errcode = '23503'; end if;
  perform lv.require_capability(v_account, v_hub, 'campaign.manage');
  perform lv.activate_campaign(p_campaign);
  return jsonb_build_object('ok', true);
end;
$$;

create function lv_api.lv_campaign_close(p_campaign uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_hub uuid;
begin
  select hub_id into v_hub from lv.campaigns where id = p_campaign;
  if v_hub is null then raise exception 'lv_not_found: no such Campaign' using errcode = '23503'; end if;
  perform lv.require_capability(v_account, v_hub, 'campaign.manage');
  update lv.campaigns set status = 'closed', closed_at = coalesce(closed_at, now())
   where id = p_campaign and status = 'active';
  return jsonb_build_object('ok', true);
end;
$$;

create function lv_api.lv_submit_response(p_campaign uuid, p_answers jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  return lv.submit_response(p_campaign, p_answers);
end;
$$;

create function lv_api.lv_analytics_query(p_campaign uuid, p_metric text, p_question uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  return lv.analytics_query(p_campaign, p_metric, p_question);
end;
$$;

-- API exposure: only lv_api is reachable, and only these functions are executable.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant usage on schema lv_api to anon, authenticated';
  end if;
end $$;
grant usage on schema lv_api to public;
grant execute on all functions in schema lv_api to public;

commit;
