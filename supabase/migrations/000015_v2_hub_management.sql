-- LunchVoice v2 canonical 15: Hub and account management (launch plan step 3).
--
--   * lv_hub_update with About text and an accent from a fixed, contrast-safe palette (exposed by lv_hub_get).
--   * lv_owner_transfer (typed slug confirmation, accepted target, the Owner role moves; 000002 invariants hold).
--   * lv_hub_delete (Owner only, typed slug, A-05). Deleting is the Owner's explicit choice; nothing else ever deletes
--     data. A tombstone (slug and deletion time only) quarantines the slug for policy 'hub.deleted_slug_cooldown_days'
--     (founder: 30 days, separate from reservation grace): nobody can claim it, and lv_hub_get on it answers the
--     neutral lv_hub_gone. A later claim always gets a new Hub id, so no prior data can ever show.
--   * Hub pages for the Builder (lv.hub_pages); custom pages count against pages.max_custom from the map.
--   * lv_profile_update and lv_account_delete (typed DELETE; founder decision): refused while the account owns a
--     community Hub. Deleted: profile, identity links, memberships and roles, Hub invitations it created and
--     redemptions, Campaign invites it created, eligibility, credits, account entitlements, the waitlist entry and
--     contact email, its personal space with its Quick Surveys, and its participation rows. Its identified
--     submissions are irreversibly unlinked (account_id NULL, time coarsened to the UTC day) and their free-text
--     answers deleted; structured answers
--     and aggregates remain. Audit rows naming the account are scrubbed. Deleting participation changes a released
--     anonymous population, so such results are withheld afterwards (000005 rule), which is the privacy-safe side.
--   * Owner transfer, Hub delete and account delete need a recent sign-in (LC-22): the session's iat must be within
--     policy 'security.reauth_seconds' (600), else lv_reauth_required.
--   * Every Hub-scoped operation here refuses a personal space with lv_not_found (LC-06).
--
-- Not built (spec section 6): the receiving member does not have to accept an ownership transfer first. The launch
-- plan contract (typed confirmation) governs; acceptance can be added without changing the signature.

begin;

insert into lv.policy (key, value, note) values
  ('security.reauth_seconds', '600'::jsonb,
   'Owner transfer, Hub delete and account delete need a session issued within this many seconds (LC-22).'),
  ('hub.deleted_slug_cooldown_days', '30'::jsonb,
   'Founder: a deleted Hub''s slug is quarantined for this many days; nobody can claim it and reads answer lv_hub_gone.');

-- ---------------------------------------------------------------------------------------------------------
-- Hub profile: About and accent
-- ---------------------------------------------------------------------------------------------------------
-- Each accent reaches at least 4.5:1 contrast with white text (WCAG AA for normal text).
create function lv.accent_palette() returns jsonb
language sql immutable set search_path = ''
as $$ select '[
  {"key":"indigo","hex":"#4338CA","label":"Indigo"},
  {"key":"blue","hex":"#1D4ED8","label":"Blue"},
  {"key":"cyan","hex":"#0E7490","label":"Cyan"},
  {"key":"teal","hex":"#0F766E","label":"Teal"},
  {"key":"green","hex":"#15803D","label":"Green"},
  {"key":"amber","hex":"#B45309","label":"Amber"},
  {"key":"rose","hex":"#BE123C","label":"Rose"},
  {"key":"violet","hex":"#6D28D9","label":"Violet"},
  {"key":"slate","hex":"#334155","label":"Slate"}
]'::jsonb $$;

alter table lv.hubs add column about text check (about is null or length(about) <= 2000);
alter table lv.hubs add column accent text check (accent is null or accent in
  ('indigo', 'blue', 'cyan', 'teal', 'green', 'amber', 'rose', 'violet', 'slate'));

-- ---------------------------------------------------------------------------------------------------------
-- Recent authentication (LC-22)
-- ---------------------------------------------------------------------------------------------------------
create function lv.require_recent_auth() returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_claims jsonb;
  v_iat numeric;
  v_max numeric := coalesce((lv.policy_json('security.reauth_seconds'))::numeric, 0);
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_iat := (v_claims->>'iat')::numeric;
  exception when others then
    v_iat := null;
  end;
  if v_iat is null or extract(epoch from now()) - v_iat > v_max then
    perform lv.fail('lv_reauth_required', 'Sign in again to confirm this action.',
                    jsonb_build_object('max_age_seconds', v_max));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Owner change and Hub deletion bypass the 000002 guards only inside these two functions, for one Hub, for
-- the current transaction (set_config(..., true)). No API role can set these settings: tables and lv are closed.
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv.check_hub_owner() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from lv.accounts a where a.id = new.owner_account_id) then
      raise exception 'lv_invalid_input: owner account does not exist' using errcode = '23503';
    end if;
  elsif new.owner_account_id is distinct from old.owner_account_id then
    if coalesce(current_setting('lv.owner_transfer', true), '') <> old.id::text then
      raise exception 'lv_owner_immutable: the Owner changes only through lv_owner_transfer' using errcode = '42501';
    end if;
    if not exists (select 1 from lv.hub_memberships m
                    where m.hub_id = new.id and m.account_id = new.owner_account_id and m.status = 'accepted') then
      raise exception 'lv_not_accepted: the new Owner must be an accepted member' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create function lv.deleting_hub(p_hub uuid) returns boolean
language sql stable set search_path = ''
as $$ select p_hub is not null and coalesce(current_setting('lv.hub_delete', true), '') = p_hub::text $$;

create or replace function lv.protect_owner_membership() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if lv.deleting_hub(coalesce(new.hub_id, old.hub_id)) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select h.owner_account_id into v_owner from lv.hubs h where h.id = coalesce(new.hub_id, old.hub_id);
  if tg_op = 'DELETE' then
    if old.account_id = v_owner and old.status = 'accepted' then
      raise exception 'lv_owner_protected: the Owner membership cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.account_id = v_owner and new.status <> 'accepted' then
    raise exception 'lv_owner_protected: the Owner membership cannot leave accepted status' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function lv.protect_owner_role() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_is_owner boolean;
  v_hub uuid;
begin
  if tg_op = 'DELETE' then
    select r.is_owner, r.hub_id into v_is_owner, v_hub from lv.roles r where r.id = old.role_id;
    if coalesce(v_is_owner, false) and not lv.deleting_hub(v_hub) then
      raise exception 'lv_owner_protected: the Owner role cannot be unassigned' using errcode = '42501';
    end if;
    return old;
  end if;
  return new;
end;
$$;

create or replace function lv.protect_owner_role_row() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.is_owner and not lv.deleting_hub(old.hub_id) then
    raise exception 'lv_owner_protected: the Owner role cannot be deleted' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.is_owner and not new.is_owner then
    raise exception 'lv_owner_protected: the Owner role cannot be demoted' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function lv.freeze_questions_after_draft() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_hub uuid;
  v_campaign uuid;
begin
  v_campaign := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
  select c.status, c.hub_id into v_status, v_hub from lv.campaigns c where c.id = v_campaign;
  if tg_op = 'DELETE' and (v_status is null or lv.deleting_hub(v_hub)) then return old; end if;
  if v_status is distinct from 'draft' then
    raise exception 'lv_locked: questions cannot change once a Campaign has been activated' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Tombstones and the claim hook
-- ---------------------------------------------------------------------------------------------------------
-- Only the slug and the time: no Hub id, owner or content survives a deletion.
create table lv.hub_tombstones (
  id bigserial primary key,
  slug text not null,
  deleted_at timestamptz not null default now()
);
create index hub_tombstones_slug_idx on lv.hub_tombstones (slug, deleted_at desc);
alter table lv.hub_tombstones enable row level security;

create function lv.slug_quarantined(p_slug text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from lv.hub_tombstones t
                  where t.slug = p_slug
                    and t.deleted_at > now() - make_interval(days => coalesce((lv.policy_json('hub.deleted_slug_cooldown_days'))::int, 0)))
$$;

create or replace function lv.slug_claim_blocked(p_slug text, p_account uuid) returns text
language sql stable security definer set search_path = ''
as $$ select case when lv.slug_quarantined(p_slug) then 'That Hub name was released recently and is not available yet.' end $$;

-- Delete one Hub and everything in it. Internal: callers check ownership and confirmation first.
create function lv.delete_hub(p_hub uuid, p_actor uuid) returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  h record;
begin
  select * into h from lv.hubs x where x.id = p_hub for update;
  if h.id is null then return; end if;
  perform set_config('lv.hub_delete', p_hub::text, true);
  -- answers -> questions is ON DELETE RESTRICT, so the answers go first.
  delete from lv.answers a using lv.submissions s where s.id = a.submission_id and s.hub_id = p_hub;
  delete from lv.hubs where id = p_hub;
  perform set_config('lv.hub_delete', '', true);
  if h.kind = 'community' then
    insert into lv.hub_tombstones (slug) values (h.slug);
  end if;
  perform lv.audit(p_actor, null, case when h.kind = 'community' then 'hub.deleted' else 'personal_space.deleted' end,
                   coalesce(h.slug, 'personal'));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Hub pages (Builder)
-- ---------------------------------------------------------------------------------------------------------
create table lv.hub_pages (
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  kind text not null check (kind in ('home', 'campaigns', 'custom', 'shop', 'leaderboard', 'news', 'comments')),
  title text not null check (length(btrim(title)) between 1 and 80),
  -- Plain text / platform blocks only; rendered by the UI as text, never as HTML or script.
  body text check (body is null or length(body) <= 20000),
  position int not null check (position >= 0),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (hub_id, key)
);
alter table lv.hub_pages enable row level security;

create function lv.default_pages() returns jsonb
language sql immutable set search_path = ''
as $$ select '[{"key":"home","kind":"home","title":"Home","body":null,"position":0,"enabled":true},
               {"key":"campaigns","kind":"campaigns","title":"Campaigns","body":null,"position":1,"enabled":true}]'::jsonb $$;

create function lv.pages_json(p_hub uuid, p_all boolean) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when not exists (select 1 from lv.hub_pages p where p.hub_id = p_hub) then lv.default_pages()
         else coalesce((select jsonb_agg(jsonb_build_object('key', p.key, 'kind', p.kind, 'title', p.title, 'body', p.body,
                                                            'position', p.position, 'enabled', p.enabled)
                                         order by p.position, p.key)
                          from lv.hub_pages p where p.hub_id = p_hub and (p_all or p.enabled)), '[]'::jsonb) end
$$;

create function lv.api_hub_pages_get(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  h record;
  v_member boolean;
  v_manage boolean;
begin
  select * into h from lv.hubs x where x.id = p_hub;
  v_member := v_account is not null and h.id is not null and lv.membership_of(v_account, h.id) is not null;
  if h.id is null or h.kind <> 'community' or (h.visibility = 'private' and not v_member) then
    return lv.err('lv_not_found', 'No such Hub.');
  end if;
  v_manage := v_member and lv.has_capability(v_account, h.id, 'hub.settings.manage');
  return jsonb_build_object('ok', true, 'pages', lv.pages_json(h.id, v_manage),
    'custom_slots', jsonb_build_object(
      'used', (select count(*) from lv.hub_pages p where p.hub_id = h.id and p.kind = 'custom'),
      'limit', (lv.hub_limit(h.id, 'pages.max_custom'))::int));
end;
$$;

create function lv.api_hub_pages_update(p_hub uuid, p_pages jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  e jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_keys text[] := '{}';
  v_custom int := 0;
  v_limit int;
  v_key text;
  v_kind text;
  v_title text;
  v_body text;
begin
  perform lv.require_capability(v_account, p_hub, 'hub.settings.manage');
  if p_pages is null or jsonb_typeof(p_pages) <> 'array' then return lv.err('lv_invalid_input', 'Pages must be an array.'); end if;
  if jsonb_array_length(p_pages) > 50 then return lv.err('lv_invalid_input', 'A Hub has at most 50 pages.'); end if;

  for e in select * from jsonb_array_elements(p_pages) loop
    if jsonb_typeof(e) <> 'object' then return lv.err('lv_invalid_input', 'Each page is an object.'); end if;
    v_key := lower(btrim(e->>'key'));
    v_kind := e->>'kind';
    v_title := btrim(e->>'title');
    v_body := e->>'body';
    if v_key is null or v_key !~ '^[a-z0-9][a-z0-9-]{0,39}$' then return lv.err('lv_invalid_input', 'A page key is 1 to 40 lowercase letters, numbers or hyphens.'); end if;
    if v_key = any(v_keys) then return lv.err('lv_invalid_input', 'Page keys must be unique.'); end if;
    if v_kind is null or v_kind not in ('home', 'campaigns', 'custom', 'shop', 'leaderboard', 'news', 'comments') then
      return lv.err('lv_invalid_input', 'Unknown page kind.');
    end if;
    if v_title is null or length(v_title) not between 1 and 80 then return lv.err('lv_invalid_input', 'A page title is 1 to 80 characters.'); end if;
    if v_body is not null and length(v_body) > 20000 then return lv.err('lv_invalid_input', 'A page body is at most 20000 characters.'); end if;
    if e ? 'position' and jsonb_typeof(e->'position') <> 'number' then return lv.err('lv_invalid_input', 'position is a number.'); end if;
    if e ? 'enabled' and jsonb_typeof(e->'enabled') <> 'boolean' then return lv.err('lv_invalid_input', 'enabled is true or false.'); end if;
    if v_kind in ('home', 'campaigns') and exists (select 1 from jsonb_array_elements(v_rows) r where r->>'kind' = v_kind) then
      return lv.err('lv_invalid_input', 'A Hub has one ' || v_kind || ' page.');
    end if;
    if v_kind = 'custom' then v_custom := v_custom + 1; end if;
    v_keys := v_keys || v_key;
    v_rows := v_rows || jsonb_build_object('key', v_key, 'kind', v_kind, 'title', v_title, 'body', v_body,
      'position', coalesce((e->>'position')::int, jsonb_array_length(v_rows)),
      -- The system pages are always on.
      'enabled', case when v_kind in ('home', 'campaigns') then true else coalesce((e->>'enabled')::boolean, true) end);
  end loop;

  -- Home and Campaigns are required system pages; they are added back if missing.
  if not exists (select 1 from jsonb_array_elements(v_rows) r where r->>'kind' = 'home') then
    if 'home' = any(v_keys) then return lv.err('lv_invalid_input', 'The key home is kept for the Home page.'); end if;
    v_rows := v_rows || (lv.default_pages()->0);
  end if;
  if not exists (select 1 from jsonb_array_elements(v_rows) r where r->>'kind' = 'campaigns') then
    if 'campaigns' = any(v_keys) then return lv.err('lv_invalid_input', 'The key campaigns is kept for the Campaigns page.'); end if;
    v_rows := v_rows || (lv.default_pages()->1);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_pages:' || p_hub::text, 0));
  v_limit := (lv.hub_limit(p_hub, 'pages.max_custom'))::int;
  if v_custom > coalesce(v_limit, 0) then
    return lv.err_x('lv_limit_reached', format('This plan allows %s custom pages.', coalesce(v_limit, 0)),
                    jsonb_build_object('limit', coalesce(v_limit, 0), 'used', v_custom));
  end if;

  delete from lv.hub_pages where hub_id = p_hub;
  insert into lv.hub_pages (hub_id, key, kind, title, body, position, enabled)
  select p_hub, r->>'key', r->>'kind', r->>'title', r->>'body', (r->>'position')::int, (r->>'enabled')::boolean
    from jsonb_array_elements(v_rows) r;
  perform lv.audit(v_account, p_hub, 'hub.pages_updated', p_hub::text, jsonb_build_object('pages', jsonb_array_length(v_rows), 'custom', v_custom));
  return jsonb_build_object('ok', true, 'pages', lv.pages_json(p_hub, true));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Hub update, owner transfer, Hub delete
-- ---------------------------------------------------------------------------------------------------------
create function lv.hub_card(p_hub uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('hub_id', h.id, 'slug', h.slug, 'name', h.display_name, 'visibility', h.visibility,
           'membership_mode', h.membership_mode, 'about', h.about, 'accent', h.accent)
    from lv.hubs h where h.id = p_hub
$$;

create function lv.api_hub_update(p_hub uuid, p_display_name text, p_visibility text, p_membership_mode text,
                                  p_about text, p_accent text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_name text := btrim(p_display_name);
begin
  perform lv.require_capability(v_account, p_hub, 'hub.settings.manage');
  if p_display_name is not null and (v_name = '' or length(v_name) > 80) then
    return lv.err('lv_invalid_input', 'A Hub name is 1 to 80 characters.');
  end if;
  if p_visibility is not null and p_visibility not in ('public', 'private') then return lv.err('lv_invalid_input', 'Visibility is public or private.'); end if;
  if p_membership_mode is not null and p_membership_mode not in ('open', 'approval', 'invite_only') then
    return lv.err('lv_invalid_input', 'Membership is open, approval or invite_only.');
  end if;
  if p_about is not null and length(p_about) > 2000 then return lv.err('lv_invalid_input', 'About is at most 2000 characters.'); end if;
  if p_accent is not null and p_accent <> '' and not exists (select 1 from jsonb_array_elements(lv.accent_palette()) a where a->>'key' = p_accent) then
    return lv.err('lv_invalid_input', 'Choose an accent from the palette.');
  end if;
  update lv.hubs
     set display_name = coalesce(v_name, display_name),
         visibility = coalesce(p_visibility, visibility),
         membership_mode = coalesce(p_membership_mode, membership_mode),
         about = case when p_about is null then about else nullif(btrim(p_about), '') end,
         accent = case when p_accent is null then accent else nullif(p_accent, '') end
   where id = p_hub;
  perform lv.audit(v_account, p_hub, 'hub.updated', p_hub::text, jsonb_strip_nulls(jsonb_build_object(
    'display_name', v_name, 'visibility', p_visibility, 'membership_mode', p_membership_mode,
    'about', case when p_about is not null then true end, 'accent', p_accent)));
  return jsonb_build_object('ok', true, 'hub', lv.hub_card(p_hub));
end;
$$;

create function lv.api_owner_transfer(p_hub uuid, p_membership uuid, p_confirm text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  h record;
  m record;
  v_role uuid;
  v_old_member uuid;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into h from lv.hubs x where x.id = p_hub for update;
  if h.id is null or lv.membership_of(v_account, h.id) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if h.owner_account_id <> v_account then return lv.err('lv_forbidden', 'Only the Owner can transfer ownership.'); end if;
  perform lv.require_recent_auth();
  if p_confirm is distinct from h.slug then
    return lv.err('lv_confirmation_mismatch', 'Type the Hub''s address name exactly to confirm.');
  end if;
  select * into m from lv.hub_memberships x where x.id = p_membership and x.hub_id = h.id for update;
  if m.id is null then return lv.err('lv_not_found', 'No such member.'); end if;
  if m.account_id = v_account then return lv.err('lv_invalid_input', 'You are already the Owner.'); end if;
  if m.status <> 'accepted' then return lv.err('lv_not_accepted', 'Only an accepted member can become the Owner.'); end if;

  select r.id into v_role from lv.roles r where r.hub_id = h.id and r.is_owner;
  v_old_member := lv.membership_of(v_account, h.id);
  perform set_config('lv.owner_transfer', h.id::text, true);
  update lv.hubs set owner_account_id = m.account_id where id = h.id;
  perform set_config('lv.owner_transfer', '', true);
  -- The Owner role moves with the ownership: the old Owner keeps a plain accepted membership.
  update lv.membership_roles set membership_id = m.id where role_id = v_role and membership_id = v_old_member;
  insert into lv.membership_roles (membership_id, role_id) values (m.id, v_role) on conflict do nothing;
  perform lv.audit(v_account, h.id, 'hub.owner_transferred', m.account_id::text,
                   jsonb_build_object('from', v_account, 'to', m.account_id));
  return jsonb_build_object('ok', true);
end;
$$;

create function lv.api_hub_delete(p_hub uuid, p_confirm text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  h record;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into h from lv.hubs x where x.id = p_hub;
  if h.id is null or lv.membership_of(v_account, h.id) is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if h.owner_account_id <> v_account then return lv.err('lv_forbidden', 'Only the Owner can delete a Hub.'); end if;
  perform lv.require_recent_auth();
  if p_confirm is distinct from h.slug then
    return lv.err('lv_confirmation_mismatch', 'Type the Hub''s address name exactly to confirm.');
  end if;
  perform lv.delete_hub(h.id, v_account);
  return jsonb_build_object('ok', true);
end;
$$;

-- lv_hub_get gains About, accent, the palette and (for members) the plan.
alter function lv_api.lv_hub_get(text) set schema lv;
alter function lv.lv_hub_get(text) rename to api_hub_get_card;

create function lv.api_hub_get(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_out jsonb := lv.api_hub_get_card(p_slug);
  v_hub uuid;
begin
  if not coalesce((v_out->>'ok')::boolean, false) then
    -- A quarantined slug answers neutrally: never the old Hub's data, never a new owner.
    if v_out #>> '{error,code}' = 'lv_not_found' and lv.slug_quarantined(lower(btrim(p_slug)))
       and not exists (select 1 from lv.hubs h where h.slug = lower(btrim(p_slug))) then
      return lv.err('lv_hub_gone', 'This Hub is no longer available.');
    end if;
    return v_out;
  end if;
  v_hub := (v_out #>> '{hub,hub_id}')::uuid;
  v_out := jsonb_set(v_out, '{hub}', (v_out->'hub') || jsonb_build_object(
             'about', (select h.about from lv.hubs h where h.id = v_hub),
             'accent', (select h.accent from lv.hubs h where h.id = v_hub)));
  v_out := v_out || jsonb_build_object('accents', lv.accent_palette());
  if v_out->'membership' <> 'null'::jsonb then
    v_out := jsonb_set(v_out, '{membership}', (v_out->'membership') || jsonb_build_object('plan', lv.hub_plan(v_hub) - 'entitlement_id'));
  end if;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Account: profile and delete (L-08 de-identify, L-12)
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_profile_update(p_display_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_name text := btrim(p_display_name);
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if v_name is null or v_name = '' or length(v_name) > 80 then return lv.err('lv_invalid_input', 'A display name is 1 to 80 characters.'); end if;
  update lv.accounts set display_name = v_name where id = v_account;
  return jsonb_build_object('ok', true, 'account', jsonb_build_object('account_id', v_account, 'display_name', v_name));
end;
$$;

create function lv.api_account_delete(p_confirm text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_personal uuid;
  v_id text;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if p_confirm is distinct from 'DELETE' then return lv.err('lv_confirmation_mismatch', 'Type DELETE to confirm.'); end if;
  if exists (select 1 from lv.hubs h where h.owner_account_id = v_account and h.kind = 'community') then
    return lv.err('lv_owner_protected', 'Transfer or delete the Hubs you own first.');
  end if;
  perform lv.require_recent_auth();
  v_id := v_account::text;

  -- The personal space and its Quick Surveys belong to this account alone.
  v_personal := lv.personal_space_of(v_account);
  if v_personal is not null then perform lv.delete_hub(v_personal, v_account); end if;

  -- Identified submissions: free text goes, structured answers stay once the link is cut irreversibly.
  delete from lv.answers a using lv.submissions s, lv.campaign_questions q
   where s.id = a.submission_id and q.id = a.question_id and s.account_id = v_account and q.kind = 'text';
  -- Unlink and coarsen: no account and no exact time remains that could join a submission back to the person.
  with gone as (
    update lv.submissions
       set account_id = null,
           created_at = date_trunc('day', created_at at time zone 'UTC') at time zone 'UTC'
     where account_id = v_account
    returning id, created_at)
  update lv.answers a set created_at = g.created_at from gone g where a.submission_id = g.id;
  -- Participation rows are deleted, so nothing that names the account can join back to a submission.
  delete from lv.participation where account_id = v_account;
  -- Invitations it created (Hub and Campaign); redemptions and eligibility cascade with the account.
  delete from lv.hub_invites where created_by = v_account;
  delete from lv.campaign_invites where created_by = v_account;
  -- Account-scoped entitlements go; hub-scoped ones stay with their Hub (account link set null by the FK).
  delete from lv.entitlements where account_id = v_account and scope = 'account';
  -- Scrub the audit trail of anything that names this account.
  update lv.audit_events set target = null where target = v_id;
  update lv.audit_events set detail = '{}'::jsonb where detail::text like '%' || v_id || '%';

  -- Cascades: identities (the (issuer, subject) is freed), memberships, roles, the waitlist row and its contact
  -- email, credits, eligibility, redemptions, beta applications.
  delete from lv.accounts where id = v_account;
  perform lv.audit(null, null, 'account.deleted', null);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- API wrappers
-- ---------------------------------------------------------------------------------------------------------
create or replace function lv_api.lv_hub_get(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_hub_get(p_slug); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_hub_update(p_hub uuid, p_display_name text default null, p_visibility text default null,
                                     p_membership_mode text default null, p_about text default null, p_accent text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_hub_update(p_hub, p_display_name, p_visibility, p_membership_mode, p_about, p_accent); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_owner_transfer(p_hub uuid, p_membership uuid, p_confirm text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_owner_transfer(p_hub, p_membership, p_confirm); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_hub_delete(p_hub uuid, p_confirm text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_hub_delete(p_hub, p_confirm); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_hub_pages_get(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_hub_pages_get(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_hub_pages_update(p_hub uuid, p_pages jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.premium_guard(p_hub, false); return lv.api_hub_pages_update(p_hub, p_pages); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_profile_update(p_display_name text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_profile_update(p_display_name); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_account_delete(p_confirm text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_account_delete(p_confirm); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- Grants: explicit, never PUBLIC (LC-05).
revoke all on function lv_api.lv_hub_get(text), lv_api.lv_hub_update(uuid, text, text, text, text, text),
  lv_api.lv_owner_transfer(uuid, uuid, text), lv_api.lv_hub_delete(uuid, text), lv_api.lv_hub_pages_get(uuid),
  lv_api.lv_hub_pages_update(uuid, jsonb), lv_api.lv_profile_update(text), lv_api.lv_account_delete(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function lv_api.lv_hub_get(text), lv_api.lv_hub_update(uuid, text, text, text, text, text),
      lv_api.lv_owner_transfer(uuid, uuid, text), lv_api.lv_hub_delete(uuid, text), lv_api.lv_hub_pages_get(uuid),
      lv_api.lv_hub_pages_update(uuid, jsonb), lv_api.lv_profile_update(text), lv_api.lv_account_delete(text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function lv_api.lv_hub_get(text), lv_api.lv_hub_pages_get(uuid) to anon';
  end if;
end $$;

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
