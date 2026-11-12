-- 000036: Hub identity for the About panel (founder direction 2026-11-11, evening): who is here now, topic tags, Hub badges
-- and the connected Discord server shown on the Hub.
--
-- Only NEW objects: no existing function is replaced, so this file cannot overwrite another track's work.
--
-- 1. Presence ("who's here"). A member's browser pings while a Hub page is open; lv.hub_presence keeps one row per member
--    and Hub with the last time seen. "Here now" is anyone seen within presence.window_seconds (default 300). Visitors of a
--    public Hub see the count only; members also see names. A person can turn their own dot off (lv.presence_prefs); a hidden
--    person is neither named nor counted. Presence is recorded from Hub pages only, never from the survey player, and it is
--    never joined to participation or answers, so it cannot place a person at the moment an anonymous answer arrived.
--    Guests have no account and never appear.
-- 2. Topic tags. Up to hub.max_tags (5) short lowercase labels a Hub manager chooses (hub.settings.manage). Public text on
--    a public Hub; a private Hub's tags reach members only (the About call answers lv_not_found to everyone else).
-- 3. Badges. lv.badges is the LunchVoice catalog: each badge has a symbol the app draws and one meaning. 'earned' badges
--    are computed from facts (ran a Campaign, member milestones, Discord shown, Founding plan); 'awarded' badges are given by
--    LunchVoice staff (audited) and can never be self-assigned. A Hub shows at most hub.max_badges (5): awarded first.
--    No customer is named anywhere: a badge is data on a Hub row, given through the same staff call for every Hub.
-- 4. Discord server card. A manager may show one connected server on the Hub (lv.discord_connections.show_on_hub) with an
--    optional invite code. Server name, member count and online count are refreshed by the `discord` Edge Function with the
--    bot token (lv.discord_stats_due / lv.discord_stats_set, service role only). A server LunchVoice staff turned off is
--    never shown. Counts are Discord's own approximate totals; no Discord user is ever listed.
begin;

insert into lv.policy (key, value, note) values
  ('presence.window_seconds', '300'::jsonb, 'A member counts as here now when seen within this many seconds.'),
  ('presence.names_max', '24'::jsonb, 'Most names returned in a Hub''s here-now list.'),
  ('hub.max_tags', '5'::jsonb, 'Topic tags per Hub.'),
  ('hub.max_badges', '5'::jsonb, 'Badges shown per Hub.'),
  ('discord.stats_refresh_seconds', '600'::jsonb, 'How old a shown Discord server''s counts may get before they are refreshed.');

-- ---------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------
create table lv.hub_tags (
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  tag text not null check (length(tag) between 2 and 24 and tag ~ '^[a-z0-9]+([ -][a-z0-9]+)*$'),
  position smallint not null check (position between 1 and 20),
  primary key (hub_id, tag)
);
create index hub_tags_tag_idx on lv.hub_tags (tag);
alter table lv.hub_tags enable row level security;

create table lv.badges (
  key text primary key check (key ~ '^[a-z][a-z_]{1,30}$'),
  label text not null check (length(label) between 2 and 40),
  meaning text not null check (length(meaning) between 4 and 160),
  symbol text not null check (symbol ~ '^[a-z][a-z-]{1,30}$'),      -- the name of a symbol LunchVoice draws
  kind text not null check (kind in ('awarded', 'earned')),
  position smallint not null unique
);
alter table lv.badges enable row level security;

insert into lv.badges (key, label, meaning, symbol, kind, position) values
  ('official', 'Official', 'Run by the LunchVoice team.', 'official', 'awarded', 10),
  ('verified', 'Verified', 'LunchVoice confirmed who runs this Hub.', 'verified', 'awarded', 20),
  ('partner', 'Partner', 'Works with LunchVoice.', 'partner', 'awarded', 30),
  ('trailblazer', 'Trailblazer', 'Helped test LunchVoice before launch.', 'trailblazer', 'awarded', 40),
  ('founding', 'Founding Hub', 'One of the first Hubs on LunchVoice.', 'founding', 'earned', 50),
  ('first_voice', 'First voice', 'Has asked its community a question.', 'first-voice', 'earned', 60),
  ('gathering', 'Gathering', '25 or more members.', 'gathering', 'earned', 70),
  ('full_house', 'Full house', '100 or more members.', 'full-house', 'earned', 80),
  ('on_discord', 'On Discord', 'Shows its connected Discord server.', 'on-discord', 'earned', 90);

create table lv.hub_badges (
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  badge_key text not null references lv.badges (key) on delete cascade,
  awarded_by uuid references lv.accounts (id) on delete set null,
  awarded_at timestamptz not null default now(),
  primary key (hub_id, badge_key)
);
alter table lv.hub_badges enable row level security;

create table lv.hub_presence (
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  account_id uuid not null references lv.accounts (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (hub_id, account_id)
);
create index hub_presence_recent_idx on lv.hub_presence (hub_id, last_seen_at desc);
alter table lv.hub_presence enable row level security;

create table lv.presence_prefs (
  account_id uuid primary key references lv.accounts (id) on delete cascade,
  visible boolean not null,
  updated_at timestamptz not null default now()
);
alter table lv.presence_prefs enable row level security;

alter table lv.discord_connections
  add column show_on_hub boolean not null default false,
  add column invite_code text check (invite_code is null or invite_code ~ '^[A-Za-z0-9-]{2,32}$');
create unique index discord_connections_one_shown on lv.discord_connections (hub_id) where show_on_hub;

alter table lv.discord_guilds
  add column member_count int check (member_count is null or member_count >= 0),
  add column online_count int check (online_count is null or online_count >= 0),
  add column stats_at timestamptz;

-- ---------------------------------------------------------------------------------------------------------
-- Read helpers (never exposed; every caller has already decided what the reader may see)
-- ---------------------------------------------------------------------------------------------------------
create function lv.presence_visible(p_account uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select p.visible from lv.presence_prefs p where p.account_id = p_account), true) $$;

create function lv.hub_tags_json(p_hub uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$ select coalesce((select jsonb_agg(t.tag order by t.position, t.tag) from lv.hub_tags t where t.hub_id = p_hub), '[]'::jsonb) $$;

create function lv.hub_discord_shown(p_hub uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select d.id from lv.discord_connections d join lv.discord_guilds g on g.guild_id = d.guild_id
   where d.hub_id = p_hub and d.show_on_hub and g.disabled_at is null
$$;

-- Which earned badges a Hub holds right now. Computed, never stored, so a badge goes when its fact stops being true.
create function lv.hub_earned_badges(p_hub uuid) returns text[]
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_members int;
  v_out text[] := '{}';
begin
  select count(*) into v_members from lv.hub_memberships m where m.hub_id = p_hub and m.status = 'accepted';
  if (lv.hub_plan(p_hub) ->> 'product') = 'founding' then v_out := v_out || 'founding'; end if;
  if exists (select 1 from lv.campaigns c where c.hub_id = p_hub and c.status in ('active', 'closed')) then v_out := v_out || 'first_voice'; end if;
  if v_members >= 100 then v_out := v_out || 'full_house';
  elsif v_members >= 25 then v_out := v_out || 'gathering';
  end if;
  if lv.hub_discord_shown(p_hub) is not null then v_out := v_out || 'on_discord'; end if;
  return v_out;
end;
$$;

create function lv.hub_badges_json(p_hub uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', x.key, 'label', x.label, 'meaning', x.meaning, 'symbol', x.symbol, 'kind', x.kind)
                            order by x.position), '[]'::jsonb)
    from (select b.* from lv.badges b
           where (b.kind = 'awarded' and exists (select 1 from lv.hub_badges hb where hb.hub_id = p_hub and hb.badge_key = b.key))
              or (b.kind = 'earned' and b.key = any (lv.hub_earned_badges(p_hub)))
           order by b.position
           limit greatest(lv.policy_int('hub.max_badges', 5), 0)) x
$$;

-- Here now. Names only when p_names (the reader is an accepted member); hidden people are neither named nor counted.
create function lv.hub_presence_json(p_hub uuid, p_names boolean) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(secs => greatest(lv.policy_int('presence.window_seconds', 300), 30));
  v_count int;
  v_people jsonb;
begin
  select count(*) into v_count
    from lv.hub_presence p join lv.hub_memberships m on m.hub_id = p.hub_id and m.account_id = p.account_id and m.status = 'accepted'
   where p.hub_id = p_hub and p.last_seen_at >= v_since and lv.presence_visible(p.account_id) and not lv.account_suspended(p.account_id);
  if not coalesce(p_names, false) then return jsonb_build_object('here_now', v_count); end if;
  select coalesce(jsonb_agg(jsonb_build_object('membership_id', x.id, 'display_name', x.display_name) order by x.last_seen_at desc), '[]'::jsonb) into v_people
    from (select m.id, a.display_name, p.last_seen_at
            from lv.hub_presence p join lv.hub_memberships m on m.hub_id = p.hub_id and m.account_id = p.account_id and m.status = 'accepted'
            join lv.accounts a on a.id = p.account_id
           where p.hub_id = p_hub and p.last_seen_at >= v_since and lv.presence_visible(p.account_id) and not lv.account_suspended(p.account_id)
           order by p.last_seen_at desc
           limit greatest(lv.policy_int('presence.names_max', 24), 0)) x;
  return jsonb_build_object('here_now', v_count, 'people', v_people);
end;
$$;

create function lv.hub_discord_json(p_hub uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('server_name', coalesce(g.guild_name, 'Discord server'),
           'invite_url', case when d.invite_code is not null then 'https://discord.gg/' || d.invite_code end,
           'member_count', g.member_count, 'online_count', g.online_count, 'counted_at', g.stats_at)
    from lv.discord_connections d join lv.discord_guilds g on g.guild_id = d.guild_id
   where d.id = lv.hub_discord_shown(p_hub)
$$;

-- ---------------------------------------------------------------------------------------------------------
-- API: About (signed out allowed; the Hub's own visibility rules decide, through lv.api_hub_get)
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_hub_about(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_out jsonb := lv.api_hub_get(p_slug);
  v_hub uuid;
  v_member boolean;
  h lv.hubs;
begin
  if not coalesce((v_out ->> 'ok')::boolean, false) then return v_out; end if;
  v_hub := (v_out #>> '{hub,hub_id}')::uuid;
  select * into h from lv.hubs x where x.id = v_hub;
  if h.kind <> 'community' then return lv.err('lv_not_found', 'No Hub lives at that address.'); end if;
  -- A suspended Hub shows nothing to anyone but its Owner (the Hub page says so; this call stays neutral).
  if lv.hub_suspended(v_hub) and h.owner_account_id is distinct from lv.current_account_id() then
    return lv.err('lv_not_found', 'No Hub lives at that address.');
  end if;
  v_member := (v_out -> 'membership') is not null and (v_out -> 'membership') <> 'null'::jsonb;
  return jsonb_build_object('ok', true, 'about', jsonb_build_object(
    'hub_id', v_hub, 'slug', h.slug, 'name', h.display_name, 'about', h.about, 'created_at', h.created_at,
    'member_count', (select count(*) from lv.hub_memberships m where m.hub_id = v_hub and m.status = 'accepted'),
    'tags', lv.hub_tags_json(v_hub),
    'badges', lv.hub_badges_json(v_hub),
    'presence', lv.hub_presence_json(v_hub, v_member),
    'discord', lv.hub_discord_json(v_hub)));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- API: presence
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_hub_presence_ping(p_hub uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if p_hub is null or lv.hub_kind(p_hub) is distinct from 'community'
     or not exists (select 1 from lv.hub_memberships m where m.hub_id = p_hub and m.account_id = v_account and m.status = 'accepted') then
    return lv.err('lv_not_found', 'No such Hub.');
  end if;
  if lv.hub_suspended(p_hub) or lv.account_suspended(v_account) then
    return jsonb_build_object('ok', true, 'visible', lv.presence_visible(v_account), 'presence', jsonb_build_object('here_now', 0, 'people', '[]'::jsonb));
  end if;
  -- One write per member per 30 seconds at most, however often the page asks.
  insert into lv.hub_presence (hub_id, account_id, last_seen_at) values (p_hub, v_account, now())
  on conflict (hub_id, account_id) do update set last_seen_at = excluded.last_seen_at
    where lv.hub_presence.last_seen_at < now() - interval '30 seconds';
  return jsonb_build_object('ok', true, 'visible', lv.presence_visible(v_account), 'presence', lv.hub_presence_json(p_hub, true));
end;
$$;

create function lv.api_presence_pref_get() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  return jsonb_build_object('ok', true, 'visible', lv.presence_visible(v_account));
end;
$$;

create function lv.api_presence_pref_set(p_visible boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if p_visible is null then return lv.err('lv_invalid_input', 'Choose on or off.'); end if;
  insert into lv.presence_prefs (account_id, visible) values (v_account, p_visible)
  on conflict (account_id) do update set visible = excluded.visible, updated_at = now();
  -- Turning it off takes effect now, not when the window runs out.
  if not p_visible then delete from lv.hub_presence where account_id = v_account; end if;
  return jsonb_build_object('ok', true, 'visible', p_visible);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- API: tags
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_hub_tags_set(p_hub uuid, p_tags text[]) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_max int := greatest(lv.policy_int('hub.max_tags', 5), 0);
  v_clean text[] := '{}';
  v_tag text;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if p_hub is null or lv.membership_of(v_account, p_hub) is null or lv.hub_kind(p_hub) is distinct from 'community' then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not (lv.is_owner(v_account, p_hub) or lv.has_capability(v_account, p_hub, 'hub.settings.manage')) then
    return lv.err('lv_forbidden', 'Changing tags requires hub.settings.manage.');
  end if;
  if lv.hub_suspended(p_hub) then return lv.err('lv_forbidden', 'This Hub is suspended.'); end if;
  foreach v_tag in array coalesce(p_tags, '{}') loop
    v_tag := btrim(regexp_replace(lower(coalesce(v_tag, '')), '\s+', ' ', 'g'));
    if v_tag = '' then continue; end if;
    if length(v_tag) < 2 or length(v_tag) > 24 or v_tag !~ '^[a-z0-9]+([ -][a-z0-9]+)*$' then
      return lv.err('lv_invalid_input', 'A tag is 2 to 24 letters or numbers; spaces and hyphens are fine between words.');
    end if;
    if not (v_tag = any (v_clean)) then v_clean := v_clean || v_tag; end if;
  end loop;
  if coalesce(array_length(v_clean, 1), 0) > v_max then
    return lv.err('lv_invalid_input', format('A Hub can have up to %s tags.', v_max));
  end if;
  delete from lv.hub_tags where hub_id = p_hub;
  insert into lv.hub_tags (hub_id, tag, position) select p_hub, t.tag, t.ord::smallint from unnest(v_clean) with ordinality t(tag, ord);
  perform lv.audit(v_account, p_hub, 'hub.tags_set', null, jsonb_build_object('count', coalesce(array_length(v_clean, 1), 0)));
  return jsonb_build_object('ok', true, 'tags', lv.hub_tags_json(p_hub), 'max_tags', v_max);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- API: the Discord server card (managers)
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_hub_discord_cards(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if p_hub is null or lv.membership_of(v_account, p_hub) is null or lv.hub_kind(p_hub) is distinct from 'community' then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not (lv.is_owner(v_account, p_hub) or lv.has_capability(v_account, p_hub, 'hub.settings.manage')) then
    return lv.err('lv_forbidden', 'Managing Discord requires hub.settings.manage.');
  end if;
  return jsonb_build_object('ok', true, 'cards', coalesce((
    select jsonb_agg(jsonb_build_object('connection_id', d.id, 'show_on_hub', d.show_on_hub,
             'invite_url', case when d.invite_code is not null then 'https://discord.gg/' || d.invite_code end,
             'member_count', g.member_count, 'online_count', g.online_count, 'counted_at', g.stats_at) order by d.confirmed_at)
      from lv.discord_connections d join lv.discord_guilds g on g.guild_id = d.guild_id where d.hub_id = p_hub), '[]'::jsonb));
end;
$$;

-- p_show NULL keeps the current choice. p_invite NULL keeps the current invite; '' clears it.
create function lv.api_hub_discord_card_set(p_connection uuid, p_show boolean, p_invite text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  d lv.discord_connections;
  v_code text;
  v_set_invite boolean := p_invite is not null;
begin
  if v_account is null then return lv.err('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  select * into d from lv.discord_connections x where x.id = p_connection for update;
  if d.id is null or lv.membership_of(v_account, d.hub_id) is null then return lv.err('lv_not_found', 'No such connection.'); end if;
  if not (lv.is_owner(v_account, d.hub_id) or lv.has_capability(v_account, d.hub_id, 'hub.settings.manage')) then
    return lv.err('lv_forbidden', 'Managing Discord requires hub.settings.manage.');
  end if;
  if v_set_invite and btrim(p_invite) <> '' then
    v_code := substring(btrim(p_invite) from '^(?:https?://)?(?:www\.)?(?:discord\.gg/|discord\.com/invite/|discordapp\.com/invite/)?([A-Za-z0-9-]{2,32})/?$');
    if v_code is null then return lv.err('lv_invalid_input', 'Paste a Discord invite link, like https://discord.gg/abc123.'); end if;
  end if;
  if coalesce(p_show, false) and exists (select 1 from lv.discord_guilds g where g.guild_id = d.guild_id and g.disabled_at is not null) then
    return lv.err('lv_forbidden', 'LunchVoice turned this server off, so it can''t be shown.');
  end if;
  if coalesce(p_show, false) then
    update lv.discord_connections set show_on_hub = false where hub_id = d.hub_id and id <> d.id and show_on_hub;
  end if;
  update lv.discord_connections
     set show_on_hub = coalesce(p_show, show_on_hub),
         invite_code = case when v_set_invite then v_code else invite_code end
   where id = d.id;
  perform lv.audit(v_account, d.hub_id, 'discord.card_set', d.id::text, jsonb_build_object('show', coalesce(p_show, d.show_on_hub)));
  return jsonb_build_object('ok', true, 'show_on_hub', coalesce(p_show, d.show_on_hub),
           'invite_url', case when (case when v_set_invite then v_code else d.invite_code end) is not null
                              then 'https://discord.gg/' || (case when v_set_invite then v_code else d.invite_code end) end);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Staff: awarded badges
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_admin_hub_badges(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  h lv.hubs;
begin
  if v_denied is not null then return v_denied; end if;
  select * into h from lv.hubs x where x.slug = lower(btrim(coalesce(p_slug, ''))) and x.kind = 'community';
  if h.id is null then return lv.err('lv_not_found', 'No Hub lives at that address.'); end if;
  return jsonb_build_object('ok', true, 'hub', jsonb_build_object('hub_id', h.id, 'slug', h.slug, 'name', h.display_name),
    'max_badges', greatest(lv.policy_int('hub.max_badges', 5), 0),
    'shown', lv.hub_badges_json(h.id),
    'badges', (select jsonb_agg(jsonb_build_object('key', b.key, 'label', b.label, 'meaning', b.meaning, 'symbol', b.symbol, 'kind', b.kind,
                 'held', case when b.kind = 'awarded' then exists (select 1 from lv.hub_badges hb where hb.hub_id = h.id and hb.badge_key = b.key)
                              else b.key = any (lv.hub_earned_badges(h.id)) end) order by b.position)
                 from lv.badges b));
end;
$$;

create function lv.api_admin_hub_badge_set(p_hub uuid, p_badge text, p_on boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_denied jsonb := lv.admin_denied();
  v_actor uuid := lv.current_account_id();
  b lv.badges;
begin
  if v_denied is not null then return v_denied; end if;
  if p_on is null then return lv.err('lv_invalid_input', 'Choose on or off.'); end if;
  if p_hub is null or lv.hub_kind(p_hub) is distinct from 'community' then return lv.err('lv_not_found', 'No such Hub.'); end if;
  select * into b from lv.badges x where x.key = p_badge;
  if b.key is null then return lv.err('lv_not_found', 'No such badge.'); end if;
  if b.kind <> 'awarded' then return lv.err('lv_invalid_input', 'That badge is earned, not awarded.'); end if;
  if p_on then
    if not exists (select 1 from lv.hub_badges hb where hb.hub_id = p_hub and hb.badge_key = b.key)
       and (select count(*) from lv.hub_badges hb where hb.hub_id = p_hub) >= greatest(lv.policy_int('hub.max_badges', 5), 0) then
      return lv.err('lv_invalid_input', 'This Hub already holds the most badges a Hub can show.');
    end if;
    insert into lv.hub_badges (hub_id, badge_key, awarded_by) values (p_hub, b.key, v_actor) on conflict do nothing;
  else
    delete from lv.hub_badges where hub_id = p_hub and badge_key = b.key;
  end if;
  perform lv.audit(v_actor, p_hub, case when p_on then 'badge.awarded' else 'badge.removed' end, b.key);
  return jsonb_build_object('ok', true, 'shown', lv.hub_badges_json(p_hub));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Service role: Discord server counts (called by the `discord` Edge Function's dispatch run)
-- ---------------------------------------------------------------------------------------------------------
create function lv.discord_stats_due(p_limit int) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('guilds', coalesce((
    select jsonb_agg(x.guild_id) from (
      select g.guild_id from lv.discord_guilds g
       where g.disabled_at is null
         and exists (select 1 from lv.discord_connections d where d.guild_id = g.guild_id and d.show_on_hub)
         and (g.stats_at is null or g.stats_at < now() - make_interval(secs => greatest(lv.policy_int('discord.stats_refresh_seconds', 600), 60)))
       order by g.stats_at nulls first
       limit least(greatest(coalesce(p_limit, 5), 0), 25)) x), '[]'::jsonb))
$$;

create function lv.discord_stats_set(p_guild text, p_name text, p_members int, p_online int) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update lv.discord_guilds
     set guild_name = coalesce(nullif(left(btrim(coalesce(p_name, '')), 100), ''), guild_name),
         member_count = case when p_members >= 0 then p_members else member_count end,
         online_count = case when p_online >= 0 then p_online else online_count end,
         stats_at = now()
   where guild_id = p_guild;
  return jsonb_build_object('ok', found);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- API wrappers
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_hub_about(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_hub_about(p_slug); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_hub_presence_ping(p_hub uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_hub_presence_ping(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_presence_pref_get() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_presence_pref_get(); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_presence_pref_set(p_visible boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_presence_pref_set(p_visible); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_hub_tags_set(p_hub uuid, p_tags text[]) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_hub_tags_set(p_hub, p_tags); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_hub_discord_cards(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_hub_discord_cards(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_hub_discord_card_set(p_connection uuid, p_show boolean default null, p_invite text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_hub_discord_card_set(p_connection, p_show, p_invite); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_hub_badges(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_admin_hub_badges(p_slug); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;
create function lv_api.lv_admin_hub_badge_set(p_hub uuid, p_badge text, p_on boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_admin_hub_badge_set(p_hub, p_badge, p_on); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- ---------------------------------------------------------------------------------------------------------
-- Grants: nothing in lv reaches an API role; lv_hub_about is the one signed-out call; the rest need a session.
-- ---------------------------------------------------------------------------------------------------------
revoke all on lv.hub_tags, lv.badges, lv.hub_badges, lv.hub_presence, lv.presence_prefs from public;
do $$
declare
  r record;
begin
  for r in select p.oid::regprocedure as sig, n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'lv' and p.proname in ('presence_visible', 'hub_tags_json', 'hub_discord_shown', 'hub_earned_badges', 'hub_badges_json',
                     'hub_presence_json', 'hub_discord_json', 'api_hub_about', 'api_hub_presence_ping', 'api_presence_pref_get', 'api_presence_pref_set',
                     'api_hub_tags_set', 'api_hub_discord_cards', 'api_hub_discord_card_set', 'api_admin_hub_badges', 'api_admin_hub_badge_set',
                     'discord_stats_due', 'discord_stats_set'))
               or (n.nspname = 'lv_api' and p.proname in ('lv_hub_about', 'lv_hub_presence_ping', 'lv_presence_pref_get', 'lv_presence_pref_set',
                     'lv_hub_tags_set', 'lv_hub_discord_cards', 'lv_hub_discord_card_set', 'lv_admin_hub_badges', 'lv_admin_hub_badge_set')) loop
    execute format('revoke all on function %s from public', r.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke all on function %s from anon', r.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', r.sig);
      if r.nspname = 'lv_api' then execute format('grant execute on function %s to authenticated', r.sig); end if;
    end if;
    if r.nspname = 'lv_api' and r.proname = 'lv_hub_about' and exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function %s to anon', r.sig);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on lv.hub_tags, lv.badges, lv.hub_badges, lv.hub_presence, lv.presence_prefs from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on lv.hub_tags, lv.badges, lv.hub_badges, lv.hub_presence, lv.presence_prefs from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function lv.discord_stats_due(int), lv.discord_stats_set(text, text, int, int) to service_role';
  end if;
end $$;

commit;
