-- LunchVoice v2 canonical baseline 7: read API for the v2 frontend.
--
-- Adds the read surface the UI needs so it can use lv_api exclusively: richer lv_my_context, beta status,
-- Hub-by-slug, Campaign list/detail (respondent-safe), member list, invite list and invite preview.
-- Also completes the reserved-slug list and forbids double hyphens in slugs.
--
-- Conventions for every function added here:
--   * Reads never raise for an expected condition. They return {ok:false, error:{code, message}}.
--   * The caller comes from the verified token (lv.current_account_id()); no function trusts a supplied id.
--   * Nothing here returns another person's answers. Anonymous Campaigns expose no per-account data at all.
--   * Hubs with visibility 'private' answer lv_not_found to non-members, so their existence is not revealed.

begin;

-- ---------------------------------------------------------------------------------------------------------
-- Reserved slugs (case-insensitive: slugs are stored lowercase and lv_hub_create lowercases its input)
-- ---------------------------------------------------------------------------------------------------------
insert into lv.reserved_slugs (slug, reason) values
  ('me', 'platform route'), ('analytics', 'platform route'), ('campaigns', 'platform route'),
  ('signin', 'platform route'), ('signout', 'platform route'), ('logout', 'platform route'),
  ('callback', 'platform route'), ('oauth', 'platform route'), ('sso', 'platform route'),
  ('join', 'platform route'), ('invite', 'platform route'), ('invites', 'platform route'),
  ('waitlist', 'platform route'), ('beta', 'platform route'),
  ('assets', 'static path'), ('static', 'static path'), ('public', 'static path'),
  ('manifest', 'static path'), ('sitemap', 'static path'), ('robots', 'static path'),
  ('studio', 'planned feature'), ('hubs', 'planned feature'), ('hub', 'planned feature'),
  ('explore', 'planned feature'), ('search', 'planned feature'), ('new', 'planned feature'),
  ('create', 'planned feature'), ('settings', 'planned feature'), ('account', 'planned feature'),
  ('notifications', 'planned feature'), ('dashboard', 'planned feature'), ('campaign', 'planned feature'),
  ('survey', 'planned feature'), ('surveys', 'planned feature'), ('results', 'planned feature'),
  ('reports', 'planned feature'), ('members', 'planned feature'), ('roles', 'planned feature'),
  ('shop', 'planned feature'), ('leaderboard', 'planned feature'), ('newsroom', 'planned feature'),
  ('comments', 'planned feature'), ('pages', 'planned feature'),
  ('lunchvoice', 'brand'), ('kpnsolute', 'brand'), ('kpnidentity', 'brand'), ('kpn', 'brand'),
  ('status', 'brand'), ('docs', 'brand'), ('help', 'brand'), ('about', 'brand'), ('terms', 'brand'),
  ('privacy', 'brand'), ('blog', 'brand'), ('legal', 'brand'), ('security', 'brand'), ('contact', 'brand')
-- No customer names are ever reserved. 'lioncafe' and 'mjcc' are claimable like any other free slug.
on conflict do nothing;

-- A Hub cannot be given a reserved slug by any path, not only through lv_hub_create.
create function lv.forbid_reserved_slug() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from lv.reserved_slugs r where r.slug = lower(new.slug)) then
    raise exception 'lv_invalid_input: that Hub name is reserved' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger hubs_forbid_reserved_slug before insert or update of slug on lv.hubs
  for each row execute function lv.forbid_reserved_slug();

alter table lv.hubs add constraint hubs_slug_no_double_hyphen check (slug !~ '--');

-- ---------------------------------------------------------------------------------------------------------
-- Shared helpers (not exposed through lv_api)
-- ---------------------------------------------------------------------------------------------------------
create function lv.err(p_code text, p_message text) returns jsonb
language sql immutable set search_path = ''
as $$ select jsonb_build_object('ok', false, 'error', jsonb_build_object('code', p_code, 'message', p_message)) $$;

create function lv.capabilities_of(p_account uuid, p_hub uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(distinct rc.capability order by rc.capability), jsonb_build_array())
    from lv.hub_memberships m
    join lv.membership_roles mr on mr.membership_id = m.id
    join lv.role_capabilities rc on rc.role_id = mr.role_id
   where m.hub_id = p_hub and m.account_id = p_account and m.status = 'accepted'
$$;

create function lv.roles_of(p_account uuid, p_hub uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', r.key, 'name', r.name) order by r.name), jsonb_build_array())
    from lv.hub_memberships m
    join lv.membership_roles mr on mr.membership_id = m.id
    join lv.roles r on r.id = mr.role_id
   where m.hub_id = p_hub and m.account_id = p_account and m.status = 'accepted'
$$;

-- ---------------------------------------------------------------------------------------------------------
-- lv_my_context: now carries roles, capabilities, platform-admin and beta state (additive; old keys unchanged)
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv_api.lv_my_context() returns jsonb
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
    'is_platform_admin', lv.is_platform_admin(v_account),
    'beta_status', coalesce((select b.status from lv.beta_applications b where b.account_id = v_account), 'none'),
    'hubs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'hub_id', h.id, 'slug', h.slug, 'name', h.display_name,
               'is_owner', h.owner_account_id = v_account,
               'roles', lv.roles_of(v_account, h.id),
               'capabilities', lv.capabilities_of(v_account, h.id))
             order by h.display_name)
        from lv.hub_memberships m join lv.hubs h on h.id = m.hub_id
       where m.account_id = v_account and m.status = 'accepted'), jsonb_build_array()));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- lv_beta_status: my own application, if any. status is none|pending|approved|rejected|consumed.
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_beta_status() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  b record;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into b from lv.beta_applications x where x.account_id = v_account;
  if b.id is null then return jsonb_build_object('ok', true, 'status', 'none'); end if;
  return jsonb_build_object('ok', true, 'status', b.status, 'applied_at', b.created_at, 'decided_at', b.decided_at);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- lv_hub_get: the Hub card by slug. Members additionally get their own membership and the active-campaign count.
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_hub_get(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  h record;
  v_member uuid;
  v_out jsonb;
begin
  select * into h from lv.hubs x where x.slug = lower(btrim(p_slug));
  if h.id is not null and v_account is not null then v_member := lv.membership_of(v_account, h.id); end if;
  if h.id is null or (h.visibility = 'private' and v_member is null) then
    return lv.err('lv_not_found', 'No such Hub.');
  end if;

  v_out := jsonb_build_object('ok', true,
    'hub', jsonb_build_object('hub_id', h.id, 'slug', h.slug, 'name', h.display_name,
      'visibility', h.visibility, 'membership_mode', h.membership_mode,
      'member_count', (select count(*) from lv.hub_memberships m where m.hub_id = h.id and m.status = 'accepted')),
    'membership', null);

  if v_member is not null then
    v_out := v_out || jsonb_build_object('membership', jsonb_build_object(
      'is_owner', h.owner_account_id = v_account,
      'roles', lv.roles_of(v_account, h.id),
      'capabilities', lv.capabilities_of(v_account, h.id),
      'active_campaigns', (select count(*) from lv.campaigns c where c.hub_id = h.id and c.status = 'active')));
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- lv_campaign_list: members see active and closed Campaigns; campaign.manage also sees drafts and join codes.
-- has_responded is the caller's own participation only. No counts of other people are returned here.
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_campaign_list(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_manage boolean;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if lv.membership_of(v_account, p_hub) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  v_manage := lv.has_capability(v_account, p_hub, 'campaign.manage');

  return jsonb_build_object('ok', true, 'campaigns', coalesce((
    select jsonb_agg(jsonb_build_object(
             'campaign_id', c.id, 'title', c.title, 'mode', c.mode, 'anonymity', c.anonymity,
             'status', c.status, 'opens_at', c.opens_at, 'closes_at', c.closes_at, 'created_at', c.created_at,
             'question_count', (select count(*) from lv.campaign_questions q where q.campaign_id = c.id),
             'has_responded', exists (select 1 from lv.participation p where p.campaign_id = c.id and p.account_id = v_account),
             'join_code', case when v_manage then c.join_code else null end)
           order by c.created_at desc)
      from lv.campaigns c
     where c.hub_id = p_hub and (v_manage or c.status <> 'draft')), jsonb_build_array()));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- lv_campaign_get: respondent-safe detail. Questions and options only; never answers or other people's data.
-- Managers also get the activation gate result. can_respond tells the UI whether to show the form.
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_campaign_get(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c record;
  v_manage boolean;
  v_responded boolean;
  v_receipt uuid;
  v_open boolean;
  v_out jsonb;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null or lv.membership_of(v_account, c.hub_id) is null then
    return lv.err('lv_not_found', 'No such Campaign.');
  end if;
  v_manage := lv.has_capability(v_account, c.hub_id, 'campaign.manage');
  if c.status = 'draft' and not v_manage then return lv.err('lv_not_found', 'No such Campaign.'); end if;

  select true, p.receipt_id into v_responded, v_receipt
    from lv.participation p where p.campaign_id = c.id and p.account_id = v_account;
  v_responded := coalesce(v_responded, false);
  v_open := c.status = 'active'
            and (c.opens_at is null or c.opens_at <= now())
            and (c.closes_at is null or c.closes_at > now());

  v_out := jsonb_build_object('ok', true,
    'campaign', jsonb_build_object(
      'campaign_id', c.id, 'hub_id', c.hub_id, 'title', c.title, 'mode', c.mode, 'anonymity', c.anonymity,
      'status', c.status, 'revision', c.revision, 'opens_at', c.opens_at, 'closes_at', c.closes_at),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('question_id', q.id, 'position', q.position, 'kind', q.kind,
                                          'prompt', q.prompt, 'config', q.config) order by q.position)
        from lv.campaign_questions q where q.campaign_id = c.id), jsonb_build_array()),
    'has_responded', v_responded,
    'receipt_id', v_receipt,
    'can_respond', v_open and not v_responded,
    'can_manage', v_manage);

  if v_manage then
    v_out := v_out || jsonb_build_object('join_code', c.join_code, 'gate', lv.gate_evaluate(c.id));
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- lv_member_list: people with member-admin capability only. Returns names and roles, never email.
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_member_list(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if lv.membership_of(v_account, p_hub) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not (lv.has_capability(v_account, p_hub, 'admin.members.admit')
          or lv.has_capability(v_account, p_hub, 'admin.members.remove')
          or lv.has_capability(v_account, p_hub, 'admin.roles.manage')) then
    return lv.err('lv_forbidden', 'Listing members requires a member-admin capability.');
  end if;

  return jsonb_build_object('ok', true, 'members', coalesce((
    select jsonb_agg(jsonb_build_object(
             'membership_id', m.id, 'account_id', m.account_id, 'display_name', a.display_name,
             'status', m.status, 'accepted_at', m.accepted_at,
             'is_owner', h.owner_account_id = m.account_id,
             'roles', lv.roles_of(m.account_id, p_hub))
           order by a.display_name, m.id)
      from lv.hub_memberships m
      join lv.accounts a on a.id = m.account_id
      join lv.hubs h on h.id = m.hub_id
     where m.hub_id = p_hub and m.status in ('accepted', 'pending')), jsonb_build_array()));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- lv_invite_list: managers only. Codes are stored hashed and cannot be shown again.
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_invite_list(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if lv.membership_of(v_account, p_hub) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not lv.has_capability(v_account, p_hub, 'admin.members.admit') then
    return lv.err('lv_forbidden', 'Listing invitations requires admin.members.admit.');
  end if;

  return jsonb_build_object('ok', true, 'invites', coalesce((
    select jsonb_agg(jsonb_build_object(
             'invite_id', i.id, 'max_uses', i.max_uses, 'uses', i.uses, 'expires_at', i.expires_at,
             'revoked_at', i.revoked_at, 'created_at', i.created_at,
             'state', case when i.revoked_at is not null then 'revoked'
                           when i.expires_at is not null and i.expires_at <= now() then 'expired'
                           when i.max_uses is not null and i.uses >= i.max_uses then 'exhausted'
                           else 'active' end)
           order by i.created_at desc)
      from lv.hub_invites i where i.hub_id = p_hub), jsonb_build_array()));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- lv_invite_preview: what a code would join, without redeeming it. Requires sign-in (limits guessing) and
-- answers every invalid case identically, exactly like lv_invite_redeem.
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_invite_preview(p_code text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_inv record;
  h record;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into v_inv from lv.hub_invites i where i.code_hash = lv.invite_hash(coalesce(p_code, ''));
  if v_inv.id is null
     or v_inv.revoked_at is not null
     or (v_inv.expires_at is not null and v_inv.expires_at <= now())
     or (v_inv.max_uses is not null and v_inv.uses >= v_inv.max_uses) then
    return lv.err('lv_invalid_code', 'That invitation is not valid.');
  end if;
  select * into h from lv.hubs x where x.id = v_inv.hub_id;
  return jsonb_build_object('ok', true,
    'hub', jsonb_build_object('hub_id', h.id, 'slug', h.slug, 'name', h.display_name),
    'already_member', lv.membership_of(v_account, h.id) is not null);
end;
$$;

-- Only lv_api is reachable; new functions there are executable, helpers in lv are not.
grant execute on all functions in schema lv_api to public;
revoke all on all functions in schema lv from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all functions in schema lv from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all functions in schema lv from authenticated';
  end if;
end $$;

commit;
