-- LunchVoice v2 canonical 20: community surface and Discover (build plan track C, decisions C-01 and C-02).
--
-- Binding sources: docs/v2/BUILD_PLAN_2026-11-21.md (track C), docs/v2/LAUNCH_PLAN.md, master spec sections 5-7,
-- 9-10 and 11.3, docs/compliance/LAUNCH_COMPLIANCE_REVIEW.md. Track C owns pages, Discover and the community tables;
-- nothing here replaces a function owned by track A (Campaigns, questions, participation, invites, lv_my_context) or
-- track B (billing, checkout, reservation, waitlist, email, admin).
--
-- 1. Custom pages with content. lv.hub_pages gains `visibility` ('members' | 'public'). A public custom page is shown to
--    visitors only while the Hub itself is public; members-only pages (and their bodies) never reach a non-member.
--    Bodies are markdown-lite text: the UI renders text, headings, lists and http(s)/mailto links only, never HTML.
--    The pages functions (track C) are replaced in place with the same signatures.
-- 2. Add-on pages (Newsroom, Comments, Leaderboard, Shop) are one per Hub and gated by the entitlement map:
--    lv.plan_limits keys community.newsroom, community.comments, community.leaderboard and community.shop (booleans).
--    Decision C-02a (governing agent, founder may override): all four are part of the Starter and Team families; the
--    Team family gets more Shop items (shop.max_items 10 vs 50). Expired plans fail closed for every community write
--    (posting, commenting, ordering, managing items); reads and opting out keep working and nothing is deleted.
-- 3. Newsroom: posts by holders of the new capability community.post. Drafts, publish, pin (policy
--    community.max_pinned), delete. Members read published posts; a public Hub may mark a post public so visitors read it.
-- 4. Comments on published news posts and on the Hub's Comments page. Accepted members only (guests never post: they
--    have no account and no membership). Length (community.comment_max_length) and rate (community.comments_per_minute)
--    limits; the author deletes their own; community.moderate hides, unhides and deletes; any member reports once per
--    comment. Comments never attach to Campaigns or answers, so they can never sit on an anonymous answer.
-- 5. Leaderboard (C-01): opt-in per member (default off; opting out always works). Ranks by the number of this Hub's
--    Campaigns a member took part in, counting only Campaigns that have ended, so no ranking change can be tied to the
--    moment someone answered. Never answers, never per-Campaign timing or breakdown, guests never appear (they have no
--    participation rows), only opted-in accepted members appear. Needs the Hub's Leaderboard page.
-- 6. Shop and Hub points (C-02): optional per Hub (points off by default, lv.hub_community.points_enabled). Points per
--    Campaign live in lv.campaign_points; a BEFORE INSERT trigger on lv.participation records them on the existing
--    participation.points / reward_state columns. The participation row is the eligibility record, never linked to an
--    anonymous submission (000004), so awarding points cannot link a person to answers. Balance = recorded points minus
--    non-cancelled orders. Items have point prices and optional stock; orders are fulfilled manually by the Hub
--    (placed -> fulfilled | cancelled; cancelling refunds the points and restores stock). Points have no cash value.
--    Order email: lv.community_order_notify is a marked TODO hook for track B's lv.email_enqueue (not built here).
-- 7. Discover listing: lv_discover_list (signed out allowed) lists community Hubs whose lv.discover_applications row
--    (000016; track B's lv_admin_discover_decide sets status) is 'approved', that are public and still on the Team
--    family, with search, a Hub-chosen category from a fixed list and the genuine-member count rounded down to the
--    nearest 100. Personal spaces and Quick Surveys never appear.
-- 8. Capabilities community.post, community.moderate and community.shop (group community); the Owner role holds them.
--
-- Every Hub-scoped wrapper refuses a personal space with lv_not_found (LC-06). A private Hub answers lv_not_found to a
-- non-member; a public Hub answers lv_forbidden to a non-member for member-only community features.

begin;

-- ---------------------------------------------------------------------------------------------------------
-- Map, policies, capabilities
-- ---------------------------------------------------------------------------------------------------------
insert into lv.plan_limits (family, key, value, note) values
  ('starter', 'community.newsroom', 'true', 'C-02a: Newsroom page in the Starter family.'),
  ('starter', 'community.comments', 'true', 'C-02a: Comments page and comments on news posts.'),
  ('starter', 'community.leaderboard', 'true', 'C-01/C-02a: opt-in participation leaderboard.'),
  ('starter', 'community.shop', 'true', 'C-02/C-02a: Shop with optional Hub points (no cash value).'),
  ('starter', 'shop.max_items', '10', 'C-02a: active Shop items.'),
  ('team', 'community.newsroom', 'true', 'C-02a: Newsroom page.'),
  ('team', 'community.comments', 'true', 'C-02a: Comments.'),
  ('team', 'community.leaderboard', 'true', 'C-01/C-02a: opt-in participation leaderboard.'),
  ('team', 'community.shop', 'true', 'C-02/C-02a: Shop with optional Hub points.'),
  ('team', 'shop.max_items', '50', 'C-02a: expanded community pages: more active Shop items.');

insert into lv.policy (key, value, note) values
  ('community.comment_max_length', '1000'::jsonb, 'Longest comment, in characters.'),
  ('community.comments_per_minute', '5'::jsonb, 'Comments one member may add in one Hub per minute.'),
  ('community.posts_per_hour', '30'::jsonb, 'News posts one person may create in one Hub per hour.'),
  ('community.max_pinned', '3'::jsonb, 'Pinned news posts per Hub.'),
  ('community.reports_per_hour', '20'::jsonb, 'Comment reports one member may file per hour.'),
  ('shop.orders_per_hour', '20'::jsonb, 'Shop orders one member may place in one Hub per hour.');

insert into lv.capabilities (capability, cap_group, label) values
  ('community.post', 'community', 'Write and publish Newsroom posts'),
  ('community.moderate', 'community', 'Moderate comments'),
  ('community.shop', 'community', 'Run the Shop, set Campaign points and fulfil orders');
insert into lv.role_capabilities (role_id, capability)
select r.id, c from lv.roles r cross join unnest(array['community.post', 'community.moderate', 'community.shop']) c where r.is_owner
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------
alter table lv.hub_pages add column visibility text not null default 'members' check (visibility in ('members', 'public'));

create table lv.hub_community (
  hub_id uuid primary key references lv.hubs (id) on delete cascade,
  points_enabled boolean not null default false,
  discover_category text check (discover_category is null or discover_category in
    ('sports_fitness', 'arts_culture', 'books_learning', 'neighbourhood', 'faith', 'clubs_hobbies',
     'work_professional', 'health_wellbeing', 'environment', 'other')),
  updated_at timestamptz not null default now()
);

create table lv.news_posts (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  author_account_id uuid references lv.accounts (id) on delete set null,
  title text not null check (length(btrim(title)) between 1 and 140),
  body text not null default '' check (length(body) <= 20000),
  status text not null default 'draft' check (status in ('draft', 'published')),
  visibility text not null default 'members' check (visibility in ('members', 'public')),
  pinned boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_posts_published_time check (status <> 'published' or published_at is not null),
  constraint news_posts_pin_published check (not pinned or status = 'published')
);
create index news_posts_hub_idx on lv.news_posts (hub_id, status, published_at desc);

create table lv.comments (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  post_id uuid references lv.news_posts (id) on delete cascade,   -- NULL: the Hub's Comments page
  author_account_id uuid not null references lv.accounts (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  hidden_at timestamptz,
  hidden_by uuid references lv.accounts (id) on delete set null,
  created_at timestamptz not null default now()
);
create index comments_hub_post_idx on lv.comments (hub_id, post_id, created_at);
create index comments_author_idx on lv.comments (author_account_id, hub_id, created_at);

create table lv.comment_reports (
  comment_id uuid not null references lv.comments (id) on delete cascade,
  reporter_account_id uuid not null references lv.accounts (id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  primary key (comment_id, reporter_account_id)
);

create table lv.leaderboard_optins (
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  account_id uuid not null references lv.accounts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (hub_id, account_id)
);

create table lv.campaign_points (
  campaign_id uuid primary key references lv.campaigns (id) on delete cascade,
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  points int not null check (points between 0 and 1000),
  updated_at timestamptz not null default now()
);

create table lv.shop_items (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 1000),
  price_points int not null check (price_points between 1 and 1000000),
  stock int check (stock is null or stock >= 0),            -- NULL: no stock limit
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shop_items_hub_idx on lv.shop_items (hub_id, active);

create table lv.shop_orders (
  id uuid primary key default gen_random_uuid(),
  hub_id uuid not null references lv.hubs (id) on delete cascade,
  item_id uuid not null references lv.shop_items (id) on delete cascade,
  account_id uuid not null references lv.accounts (id) on delete cascade,
  item_name text not null,
  points int not null check (points >= 1),
  status text not null default 'placed' check (status in ('placed', 'fulfilled', 'cancelled')),
  decided_by uuid references lv.accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shop_orders_hub_idx on lv.shop_orders (hub_id, status, created_at desc);
create index shop_orders_account_idx on lv.shop_orders (account_id, hub_id);

alter table lv.hub_community enable row level security;
alter table lv.news_posts enable row level security;
alter table lv.comments enable row level security;
alter table lv.comment_reports enable row level security;
alter table lv.leaderboard_optins enable row level security;
alter table lv.campaign_points enable row level security;
alter table lv.shop_items enable row level security;
alter table lv.shop_orders enable row level security;

-- ---------------------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------------------
create function lv.discover_categories() returns jsonb
language sql immutable set search_path = ''
as $$ select '[{"key":"sports_fitness","label":"Sports and fitness"},{"key":"arts_culture","label":"Arts and culture"},
               {"key":"books_learning","label":"Books and learning"},{"key":"neighbourhood","label":"Neighbourhood"},
               {"key":"faith","label":"Faith"},{"key":"clubs_hobbies","label":"Clubs and hobbies"},
               {"key":"work_professional","label":"Work and professional"},{"key":"health_wellbeing","label":"Health and wellbeing"},
               {"key":"environment","label":"Environment"},{"key":"other","label":"Other"}]'::jsonb $$;

create function lv.addon_flag_key(p_kind text) returns text
language sql immutable set search_path = ''
as $$ select case p_kind when 'news' then 'community.newsroom' when 'comments' then 'community.comments'
                         when 'leaderboard' then 'community.leaderboard' when 'shop' then 'community.shop' end $$;

-- The plan in force includes this add-on (false when no plan is active: premium actions fail closed).
create function lv.addon_allowed(p_hub uuid, p_kind text) returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((lv.hub_limit(p_hub, lv.addon_flag_key(p_kind)))::boolean, false) $$;

-- The Hub shows this add-on page (reads follow this; writes also need lv.addon_allowed).
create function lv.addon_page_on(p_hub uuid, p_kind text) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from lv.hub_pages p where p.hub_id = p_hub and p.kind = p_kind and p.enabled) $$;

create function lv.addons_json(p_hub uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_object_agg(k, jsonb_build_object('enabled', lv.addon_page_on(p_hub, k), 'allowed', lv.addon_allowed(p_hub, k)))
    from unnest(array['news', 'comments', 'leaderboard', 'shop']) k
$$;

-- Who is reading a community Hub: 'member', 'visitor' (public Hub, not a member) or NULL (no such Hub to them).
create function lv.community_reader(p_hub uuid, p_account uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case when h.id is null or h.kind <> 'community' then null
              when p_account is not null and lv.membership_of(p_account, h.id) is not null then 'member'
              when h.visibility = 'public' then 'visitor' end
    from (select 1) one left join lv.hubs h on h.id = p_hub
$$;

-- Accepted members only. Private Hubs answer like missing ones to everybody else.
create function lv.require_member(p_hub uuid, p_account uuid, p_what text) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_reader text := lv.community_reader(p_hub, p_account);
begin
  if v_reader is null then perform lv.fail('lv_not_found', 'No such Hub.'); end if;
  if p_account is null then perform lv.fail('lv_unauthenticated', 'Sign in with KpnIdentity first.'); end if;
  if v_reader <> 'member' then perform lv.fail('lv_forbidden', p_what || ' is for members of this Hub.'); end if;
end;
$$;

create function lv.require_addon(p_hub uuid, p_kind text, p_write boolean) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not lv.addon_page_on(p_hub, p_kind) then
    perform lv.fail('lv_not_available', 'This Hub has not turned this page on.', jsonb_build_object('kind', p_kind));
  end if;
  if p_write and not lv.addon_allowed(p_hub, p_kind) then
    perform lv.fail('lv_entitlement_required', 'This Hub''s plan does not include this page right now. Everything is kept.',
                    jsonb_build_object('product', 'starter_hub', 'kind', p_kind));
  end if;
end;
$$;

create function lv.policy_int(p_key text, p_default int) returns int
language sql stable security definer set search_path = ''
as $$ select coalesce((lv.policy_json(p_key))::int, p_default) $$;

create function lv.points_live(p_hub uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select lv.hub_kind(p_hub) = 'community'
         and coalesce((select c.points_enabled from lv.hub_community c where c.hub_id = p_hub), false)
         and lv.addon_allowed(p_hub, 'shop')
$$;

create function lv.points_balance(p_hub uuid, p_account uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select (coalesce((select sum(p.points) from lv.participation p where p.hub_id = p_hub and p.account_id = p_account
                       and p.reward_state = 'recorded'), 0)
        - coalesce((select sum(o.points) from lv.shop_orders o where o.hub_id = p_hub and o.account_id = p_account
                       and o.status <> 'cancelled'), 0))::int
$$;

-- Points are recorded on the participation row (the eligibility record). For an anonymous Campaign that row has no
-- submission link (000004), so the award never links the person to their answers.
create function lv.award_participation_points() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_pts int;
begin
  select cp.points into v_pts from lv.campaign_points cp where cp.campaign_id = new.campaign_id;
  if coalesce(v_pts, 0) > 0 and lv.points_live(new.hub_id) then
    new.points := v_pts;
    new.reward_state := 'recorded';
  end if;
  return new;
end;
$$;
create trigger participation_points before insert on lv.participation
  for each row execute function lv.award_participation_points();

-- TODO(track B): when lv.email_enqueue exists, enqueue the transactional order email here ('placed' to the member,
-- 'fulfilled' / 'cancelled' to the member). Deliberately a no-op in 000020: track C builds no email.
create function lv.community_order_notify(p_order uuid, p_event text) returns void
language plpgsql volatile security definer set search_path = ''
as $$ begin null; end; $$;

-- ---------------------------------------------------------------------------------------------------------
-- Pages (replaces the 000015 bodies; same signatures)
-- ---------------------------------------------------------------------------------------------------------
create function lv.pages_json_for(p_hub uuid, p_all boolean, p_member boolean) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case when not exists (select 1 from lv.hub_pages p where p.hub_id = p_hub)
         then (select jsonb_agg(e || '{"visibility":"members"}'::jsonb) from jsonb_array_elements(lv.default_pages()) e)
         else coalesce((select jsonb_agg(jsonb_build_object('key', p.key, 'kind', p.kind, 'title', p.title, 'body', p.body,
                                                            'position', p.position, 'enabled', p.enabled,
                                                            'visibility', p.visibility)
                                         order by p.position, p.key)
                          from lv.hub_pages p join lv.hubs h on h.id = p.hub_id
                         where p.hub_id = p_hub and (p_all or p.enabled)
                           and (p_member or p.kind in ('home', 'campaigns')
                                or (h.visibility = 'public' and p.kind = 'custom' and p.visibility = 'public')
                                or (h.visibility = 'public' and p.kind = 'news'
                                    and exists (select 1 from lv.news_posts n where n.hub_id = p_hub and n.status = 'published'
                                                   and n.visibility = 'public')))), '[]'::jsonb) end
$$;

create or replace function lv.api_hub_pages_get(p_hub uuid) returns jsonb
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
  return jsonb_build_object('ok', true, 'pages', lv.pages_json_for(h.id, v_manage, v_member),
    'custom_slots', jsonb_build_object(
      'used', (select count(*) from lv.hub_pages p where p.hub_id = h.id and p.kind = 'custom'),
      'limit', (lv.hub_limit(h.id, 'pages.max_custom'))::int),
    'addons', lv.addons_json(h.id));
end;
$$;

create or replace function lv.api_hub_pages_update(p_hub uuid, p_pages jsonb) returns jsonb
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
  v_vis text;
  v_enabled boolean;
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
    v_vis := coalesce(e->>'visibility', 'members');
    if v_key is null or v_key !~ '^[a-z0-9][a-z0-9-]{0,39}$' then return lv.err('lv_invalid_input', 'A page key is 1 to 40 lowercase letters, numbers or hyphens.'); end if;
    if v_key = any(v_keys) then return lv.err('lv_invalid_input', 'Page keys must be unique.'); end if;
    if v_kind is null or v_kind not in ('home', 'campaigns', 'custom', 'shop', 'leaderboard', 'news', 'comments') then
      return lv.err('lv_invalid_input', 'Unknown page kind.');
    end if;
    if v_title is null or length(v_title) not between 1 and 80 then return lv.err('lv_invalid_input', 'A page title is 1 to 80 characters.'); end if;
    if v_body is not null and length(v_body) > 20000 then return lv.err('lv_invalid_input', 'A page body is at most 20000 characters.'); end if;
    if v_vis not in ('members', 'public') then return lv.err('lv_invalid_input', 'Page visibility is members or public.'); end if;
    if e ? 'position' and jsonb_typeof(e->'position') <> 'number' then return lv.err('lv_invalid_input', 'position is a number.'); end if;
    if e ? 'enabled' and jsonb_typeof(e->'enabled') <> 'boolean' then return lv.err('lv_invalid_input', 'enabled is true or false.'); end if;
    if v_kind <> 'custom' and exists (select 1 from jsonb_array_elements(v_rows) r where r->>'kind' = v_kind) then
      return lv.err('lv_invalid_input', 'A Hub has one ' || v_kind || ' page.');
    end if;
    v_enabled := case when v_kind in ('home', 'campaigns') then true else coalesce((e->>'enabled')::boolean, true) end;
    -- Add-on pages follow the entitlement map; turning one off is always allowed.
    if v_kind in ('shop', 'leaderboard', 'news', 'comments') and v_enabled and not lv.addon_allowed(p_hub, v_kind) then
      return lv.err_x('lv_entitlement_required', 'This plan does not include the ' || v_kind || ' page.',
                      jsonb_build_object('product', 'team_hub', 'kind', v_kind));
    end if;
    if v_kind = 'custom' then v_custom := v_custom + 1; end if;
    v_keys := v_keys || v_key;
    v_rows := v_rows || jsonb_build_object('key', v_key, 'kind', v_kind, 'title', v_title, 'body', v_body,
      'position', coalesce((e->>'position')::int, jsonb_array_length(v_rows)),
      -- The system pages are always on; only custom pages carry a visibility of their own.
      'enabled', v_enabled, 'visibility', case when v_kind = 'custom' then v_vis else 'members' end);
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
  insert into lv.hub_pages (hub_id, key, kind, title, body, position, enabled, visibility)
  select p_hub, r->>'key', r->>'kind', r->>'title', r->>'body', (r->>'position')::int, (r->>'enabled')::boolean,
         coalesce(r->>'visibility', 'members')
    from jsonb_array_elements(v_rows) r;
  perform lv.audit(v_account, p_hub, 'hub.pages_updated', p_hub::text, jsonb_build_object('pages', jsonb_array_length(v_rows), 'custom', v_custom));
  return jsonb_build_object('ok', true, 'pages', lv.pages_json_for(p_hub, true, true));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Community settings
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_community_get(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  s record;
  a record;
begin
  perform lv.require_member(p_hub, v_account, 'The community area');
  select * into s from lv.hub_community c where c.hub_id = p_hub;
  select * into a from lv.discover_applications x where x.hub_id = p_hub;
  return jsonb_build_object('ok', true,
    'settings', jsonb_build_object('points_enabled', coalesce(s.points_enabled, false), 'discover_category', s.discover_category),
    'categories', lv.discover_categories(),
    'addons', lv.addons_json(p_hub),
    'discover', jsonb_build_object('status', coalesce(a.status, 'none')),
    'can', jsonb_build_object(
      'post', lv.has_capability(v_account, p_hub, 'community.post'),
      'moderate', lv.has_capability(v_account, p_hub, 'community.moderate'),
      'shop', lv.has_capability(v_account, p_hub, 'community.shop'),
      'settings', lv.has_capability(v_account, p_hub, 'hub.settings.manage')),
    'me', jsonb_build_object(
      'leaderboard_opt_in', exists (select 1 from lv.leaderboard_optins o where o.hub_id = p_hub and o.account_id = v_account),
      'points', case when coalesce(s.points_enabled, false) then lv.points_balance(p_hub, v_account) end));
end;
$$;

create function lv.api_community_update(p_hub uuid, p_points_enabled boolean, p_discover_category text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
begin
  perform lv.require_capability(v_account, p_hub, 'hub.settings.manage');
  if p_discover_category is not null and p_discover_category <> '' and not exists (
       select 1 from jsonb_array_elements(lv.discover_categories()) c where c->>'key' = p_discover_category) then
    return lv.err('lv_invalid_input', 'Choose a category from the list.');
  end if;
  if p_points_enabled and not lv.addon_allowed(p_hub, 'shop') then
    return lv.err_x('lv_entitlement_required', 'Hub points need a plan that includes the Shop.', jsonb_build_object('product', 'starter_hub'));
  end if;
  insert into lv.hub_community (hub_id, points_enabled, discover_category)
  values (p_hub, coalesce(p_points_enabled, false), nullif(p_discover_category, ''))
  on conflict (hub_id) do update
     set points_enabled = coalesce(p_points_enabled, lv.hub_community.points_enabled),
         discover_category = case when p_discover_category is null then lv.hub_community.discover_category
                                  else nullif(p_discover_category, '') end,
         updated_at = now();
  perform lv.audit(v_account, p_hub, 'community.settings_updated', p_hub::text, jsonb_strip_nulls(jsonb_build_object(
    'points_enabled', p_points_enabled, 'discover_category', p_discover_category)));
  return lv.api_community_get(p_hub);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Newsroom
-- ---------------------------------------------------------------------------------------------------------
create function lv.post_json(p_post uuid, p_member boolean) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('post_id', n.id, 'title', n.title, 'body', n.body, 'status', n.status,
           'visibility', n.visibility, 'pinned', n.pinned, 'published_at', n.published_at, 'updated_at', n.updated_at,
           'author_name', (select a.display_name from lv.accounts a where a.id = n.author_account_id),
           'comment_count', case when p_member then (select count(*) from lv.comments c where c.post_id = n.id and c.hidden_at is null) end)
    from lv.news_posts n where n.id = p_post
$$;

create function lv.api_news_list(p_hub uuid, p_include_drafts boolean) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_reader text := lv.community_reader(p_hub, v_account);
  v_drafts boolean;
begin
  if v_reader is null then return lv.err('lv_not_found', 'No such Hub.'); end if;
  if not lv.addon_page_on(p_hub, 'news') then return lv.err_x('lv_not_available', 'This Hub has not turned the Newsroom on.', '{"kind":"news"}'::jsonb); end if;
  v_drafts := coalesce(p_include_drafts, false) and v_reader = 'member' and lv.has_capability(v_account, p_hub, 'community.post');
  return jsonb_build_object('ok', true,
    'can_post', v_reader = 'member' and lv.has_capability(v_account, p_hub, 'community.post'),
    'posts', coalesce((select jsonb_agg(lv.post_json(n.id, v_reader = 'member')
                                        order by (n.status = 'draft') desc, n.pinned desc, n.published_at desc nulls first, n.created_at desc)
                         from lv.news_posts n
                        where n.hub_id = p_hub
                          and (n.status = 'published' or v_drafts)
                          and (v_reader = 'member' or n.visibility = 'public')), '[]'::jsonb));
end;
$$;

create function lv.api_news_get(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  n record;
  v_reader text;
begin
  select * into n from lv.news_posts x where x.id = p_post;
  v_reader := lv.community_reader(n.hub_id, v_account);
  if n.id is null or v_reader is null or not lv.addon_page_on(n.hub_id, 'news')
     or (n.status = 'draft' and not (v_reader = 'member' and lv.has_capability(v_account, n.hub_id, 'community.post')))
     or (v_reader = 'visitor' and n.visibility <> 'public') then
    return lv.err('lv_not_found', 'No such post.');
  end if;
  return jsonb_build_object('ok', true, 'post', lv.post_json(n.id, v_reader = 'member'),
    'hub_id', n.hub_id,
    'can_post', v_reader = 'member' and lv.has_capability(v_account, n.hub_id, 'community.post'),
    'comments_enabled', v_reader = 'member' and n.status = 'published' and lv.addon_page_on(n.hub_id, 'comments'));
end;
$$;

create function lv.api_news_save(p_hub uuid, p_post uuid, p_title text, p_body text, p_visibility text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_title text := btrim(p_title);
  v_vis text := coalesce(p_visibility, 'members');
  v_id uuid;
  n record;
begin
  perform lv.require_member(p_hub, v_account, 'The Newsroom');
  perform lv.require_capability(v_account, p_hub, 'community.post');
  perform lv.require_addon(p_hub, 'news', true);
  if v_title is null or length(v_title) not between 1 and 140 then return lv.err('lv_invalid_input', 'A title is 1 to 140 characters.'); end if;
  if p_body is not null and length(p_body) > 20000 then return lv.err('lv_invalid_input', 'A post is at most 20000 characters.'); end if;
  if v_vis not in ('members', 'public') then return lv.err('lv_invalid_input', 'Visibility is members or public.'); end if;
  if v_vis = 'public' and (select h.visibility from lv.hubs h where h.id = p_hub) <> 'public' then
    return lv.err('lv_invalid_input', 'Only a public Hub can publish posts publicly.');
  end if;
  if p_post is null then
    if (select count(*) from lv.news_posts x where x.hub_id = p_hub and x.author_account_id = v_account
           and x.created_at > now() - interval '1 hour') >= lv.policy_int('community.posts_per_hour', 30) then
      return lv.err('lv_rate_limited', 'You have written a lot of posts in the last hour. Try again later.');
    end if;
    insert into lv.news_posts (hub_id, author_account_id, title, body, visibility)
    values (p_hub, v_account, v_title, coalesce(p_body, ''), v_vis) returning id into v_id;
    perform lv.audit(v_account, p_hub, 'news.created', v_id::text);
  else
    select * into n from lv.news_posts x where x.id = p_post and x.hub_id = p_hub for update;
    if n.id is null then return lv.err('lv_not_found', 'No such post.'); end if;
    update lv.news_posts set title = v_title, body = coalesce(p_body, body), visibility = v_vis, updated_at = now() where id = n.id;
    v_id := n.id;
    perform lv.audit(v_account, p_hub, 'news.updated', v_id::text);
  end if;
  return jsonb_build_object('ok', true, 'post', lv.post_json(v_id, true));
end;
$$;

create function lv.api_news_publish(p_post uuid, p_publish boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  n record;
begin
  select * into n from lv.news_posts x where x.id = p_post for update;
  if n.id is null then return lv.err('lv_not_found', 'No such post.'); end if;
  perform lv.require_member(n.hub_id, v_account, 'The Newsroom');
  if not lv.has_capability(v_account, n.hub_id, 'community.post') then return lv.err('lv_not_found', 'No such post.'); end if;
  perform lv.premium_guard(n.hub_id, false);
  perform lv.require_addon(n.hub_id, 'news', true);
  if coalesce(p_publish, true) then
    update lv.news_posts set status = 'published', published_at = coalesce(published_at, now()), updated_at = now() where id = n.id;
  else
    update lv.news_posts set status = 'draft', pinned = false, updated_at = now() where id = n.id;
  end if;
  perform lv.audit(v_account, n.hub_id, case when coalesce(p_publish, true) then 'news.published' else 'news.unpublished' end, n.id::text);
  return jsonb_build_object('ok', true, 'post', lv.post_json(n.id, true));
end;
$$;

create function lv.api_news_pin(p_post uuid, p_pinned boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  n record;
  v_max int := lv.policy_int('community.max_pinned', 3);
begin
  select * into n from lv.news_posts x where x.id = p_post for update;
  if n.id is null then return lv.err('lv_not_found', 'No such post.'); end if;
  perform lv.require_member(n.hub_id, v_account, 'The Newsroom');
  if not lv.has_capability(v_account, n.hub_id, 'community.post') then return lv.err('lv_not_found', 'No such post.'); end if;
  perform lv.premium_guard(n.hub_id, false);
  perform lv.require_addon(n.hub_id, 'news', true);
  if coalesce(p_pinned, true) then
    if n.status <> 'published' then return lv.err('lv_invalid_input', 'Publish the post before pinning it.'); end if;
    perform pg_advisory_xact_lock(hashtextextended('lv_news_pin:' || n.hub_id::text, 0));
    if not n.pinned and (select count(*) from lv.news_posts x where x.hub_id = n.hub_id and x.pinned) >= v_max then
      return lv.err_x('lv_limit_reached', format('A Hub can pin %s posts.', v_max),
                      jsonb_build_object('limit', v_max, 'used', v_max));
    end if;
  end if;
  update lv.news_posts set pinned = coalesce(p_pinned, true), updated_at = now() where id = n.id;
  return jsonb_build_object('ok', true, 'post', lv.post_json(n.id, true));
end;
$$;

create function lv.api_news_delete(p_post uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  n record;
begin
  select * into n from lv.news_posts x where x.id = p_post;
  if n.id is null then return lv.err('lv_not_found', 'No such post.'); end if;
  perform lv.require_member(n.hub_id, v_account, 'The Newsroom');
  -- Deleting is housekeeping: it works on an expired plan too.
  if not lv.has_capability(v_account, n.hub_id, 'community.post') then return lv.err('lv_not_found', 'No such post.'); end if;
  delete from lv.news_posts where id = n.id;
  perform lv.audit(v_account, n.hub_id, 'news.deleted', n.id::text);
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------------------------------------
create function lv.comment_target_ok(p_hub uuid, p_post uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case when p_post is null then case when lv.addon_page_on(p_hub, 'comments') then null else 'off' end
              when not exists (select 1 from lv.news_posts n where n.id = p_post and n.hub_id = p_hub and n.status = 'published') then 'missing'
              when not lv.addon_page_on(p_hub, 'news') or not lv.addon_page_on(p_hub, 'comments') then 'off' end
$$;

create function lv.api_comment_list(p_hub uuid, p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_mod boolean;
  v_t text;
begin
  perform lv.require_member(p_hub, v_account, 'Comments');
  v_t := lv.comment_target_ok(p_hub, p_post);
  if v_t = 'missing' then return lv.err('lv_not_found', 'No such post.'); end if;
  if v_t = 'off' then return lv.err_x('lv_not_available', 'This Hub has not turned comments on.', '{"kind":"comments"}'::jsonb); end if;
  v_mod := lv.has_capability(v_account, p_hub, 'community.moderate');
  return jsonb_build_object('ok', true, 'can_moderate', v_mod,
    'can_comment', lv.addon_allowed(p_hub, 'comments'),
    'max_length', lv.policy_int('community.comment_max_length', 1000),
    'comments', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                   'comment_id', c.id, 'body', c.body, 'created_at', c.created_at,
                   'author_name', a.display_name, 'mine', c.author_account_id = v_account,
                   'hidden', c.hidden_at is not null,
                   'reported_by_me', exists (select 1 from lv.comment_reports r where r.comment_id = c.id and r.reporter_account_id = v_account),
                   'report_count', case when v_mod then (select count(*) from lv.comment_reports r where r.comment_id = c.id) end))
                   order by c.created_at, c.id)
          from lv.comments c join lv.accounts a on a.id = c.author_account_id
         where c.hub_id = p_hub and c.post_id is not distinct from p_post
           and (c.hidden_at is null or v_mod)), '[]'::jsonb));
end;
$$;

create function lv.api_comment_add(p_hub uuid, p_post uuid, p_body text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_body text := btrim(p_body);
  v_max int := lv.policy_int('community.comment_max_length', 1000);
  v_t text;
  v_id uuid;
begin
  perform lv.require_member(p_hub, v_account, 'Commenting');
  v_t := lv.comment_target_ok(p_hub, p_post);
  if v_t = 'missing' then return lv.err('lv_not_found', 'No such post.'); end if;
  if v_t = 'off' then return lv.err_x('lv_not_available', 'This Hub has not turned comments on.', '{"kind":"comments"}'::jsonb); end if;
  perform lv.require_addon(p_hub, 'comments', true);
  if v_body is null or v_body = '' then return lv.err('lv_invalid_input', 'Write something first.'); end if;
  if length(v_body) > v_max then
    return lv.err_x('lv_invalid_input', format('A comment is at most %s characters.', v_max), jsonb_build_object('limit', v_max, 'used', length(v_body)));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lv_comment:' || p_hub::text || ':' || v_account::text, 0));
  if (select count(*) from lv.comments c where c.hub_id = p_hub and c.author_account_id = v_account
         and c.created_at > now() - interval '1 minute') >= lv.policy_int('community.comments_per_minute', 5) then
    return lv.err('lv_rate_limited', 'You are commenting very quickly. Wait a minute and try again.');
  end if;
  insert into lv.comments (hub_id, post_id, author_account_id, body) values (p_hub, p_post, v_account, v_body) returning id into v_id;
  return jsonb_build_object('ok', true, 'comment_id', v_id);
end;
$$;

create function lv.api_comment_delete(p_comment uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c record;
begin
  select * into c from lv.comments x where x.id = p_comment;
  if c.id is null then return lv.err('lv_not_found', 'No such comment.'); end if;
  perform lv.require_member(c.hub_id, v_account, 'Comments');
  if c.author_account_id <> v_account and not lv.has_capability(v_account, c.hub_id, 'community.moderate') then
    return lv.err('lv_forbidden', 'Only the author or a moderator can delete this comment.');
  end if;
  delete from lv.comments where id = c.id;
  if c.author_account_id <> v_account then perform lv.audit(v_account, c.hub_id, 'comment.deleted', c.id::text); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function lv.api_comment_hide(p_comment uuid, p_hidden boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c record;
begin
  select * into c from lv.comments x where x.id = p_comment;
  if c.id is null then return lv.err('lv_not_found', 'No such comment.'); end if;
  perform lv.require_member(c.hub_id, v_account, 'Comments');
  perform lv.require_capability(v_account, c.hub_id, 'community.moderate');
  update lv.comments set hidden_at = case when coalesce(p_hidden, true) then coalesce(hidden_at, now()) end,
                         hidden_by = case when coalesce(p_hidden, true) then v_account end
   where id = c.id;
  perform lv.audit(v_account, c.hub_id, case when coalesce(p_hidden, true) then 'comment.hidden' else 'comment.unhidden' end, c.id::text);
  return jsonb_build_object('ok', true, 'hidden', coalesce(p_hidden, true));
end;
$$;

create function lv.api_comment_report(p_comment uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_reason text := btrim(p_reason);
  c record;
begin
  select * into c from lv.comments x where x.id = p_comment;
  if c.id is null then return lv.err('lv_not_found', 'No such comment.'); end if;
  perform lv.require_member(c.hub_id, v_account, 'Reporting');
  if c.hidden_at is not null and not lv.has_capability(v_account, c.hub_id, 'community.moderate') then
    return lv.err('lv_not_found', 'No such comment.');
  end if;
  if c.author_account_id = v_account then return lv.err('lv_invalid_input', 'You cannot report your own comment.'); end if;
  if v_reason is null or length(v_reason) not between 1 and 500 then return lv.err('lv_invalid_input', 'Say briefly what is wrong (up to 500 characters).'); end if;
  if exists (select 1 from lv.comment_reports r where r.comment_id = c.id and r.reporter_account_id = v_account) then
    return jsonb_build_object('ok', true, 'already_reported', true);
  end if;
  if (select count(*) from lv.comment_reports r where r.reporter_account_id = v_account
         and r.created_at > now() - interval '1 hour') >= lv.policy_int('community.reports_per_hour', 20) then
    return lv.err('lv_rate_limited', 'You have sent many reports in the last hour. Try again later.');
  end if;
  insert into lv.comment_reports (comment_id, reporter_account_id, reason) values (c.id, v_account, v_reason) on conflict do nothing;
  return jsonb_build_object('ok', true, 'already_reported', false);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Leaderboard (C-01)
-- ---------------------------------------------------------------------------------------------------------
-- Campaigns that have ended: closed, archived, or past their close time. Live Campaigns never move the board.
create function lv.campaign_ended(p_status text, p_closes_at timestamptz) returns boolean
language sql stable set search_path = ''
as $$ select p_status in ('closed', 'archived') or (p_status in ('active', 'paused') and p_closes_at is not null and p_closes_at <= now()) $$;

create function lv.participation_count(p_hub uuid, p_account uuid) returns int
language sql stable security definer set search_path = ''
as $$
  select count(*)::int from lv.participation p join lv.campaigns c on c.id = p.campaign_id
   where p.hub_id = p_hub and p.account_id = p_account and lv.campaign_ended(c.status, c.closes_at)
$$;

create function lv.api_leaderboard_get(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  perform lv.require_member(p_hub, v_account, 'The leaderboard');
  perform lv.require_addon(p_hub, 'leaderboard', false);
  return jsonb_build_object('ok', true,
    'me', jsonb_build_object(
      'opted_in', exists (select 1 from lv.leaderboard_optins o where o.hub_id = p_hub and o.account_id = v_account),
      'campaigns', lv.participation_count(p_hub, v_account)),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object('rank', x.rank, 'display_name', x.display_name, 'campaigns', x.n, 'me', x.me)
                       order by x.rank, lower(x.display_name), x.me desc)
        from (select a.display_name, o.account_id = v_account as me, lv.participation_count(p_hub, o.account_id) as n,
                     dense_rank() over (order by lv.participation_count(p_hub, o.account_id) desc) as rank
                from lv.leaderboard_optins o
                join lv.hub_memberships m on m.hub_id = o.hub_id and m.account_id = o.account_id and m.status = 'accepted'
                join lv.accounts a on a.id = o.account_id
               where o.hub_id = p_hub) x), '[]'::jsonb));
end;
$$;

create function lv.api_leaderboard_opt(p_hub uuid, p_opt_in boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
begin
  perform lv.require_member(p_hub, v_account, 'The leaderboard');
  if coalesce(p_opt_in, false) then
    perform lv.require_addon(p_hub, 'leaderboard', true);
    insert into lv.leaderboard_optins (hub_id, account_id) values (p_hub, v_account) on conflict do nothing;
  else
    -- Opting out always works, with or without a plan or the page.
    delete from lv.leaderboard_optins where hub_id = p_hub and account_id = v_account;
  end if;
  return jsonb_build_object('ok', true, 'opted_in', coalesce(p_opt_in, false));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Shop and Hub points (C-02)
-- ---------------------------------------------------------------------------------------------------------
create function lv.item_json(p_item uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('item_id', i.id, 'name', i.name, 'description', i.description, 'price_points', i.price_points,
                            'stock', i.stock, 'active', i.active)
    from lv.shop_items i where i.id = p_item
$$;

create function lv.order_json(p_order uuid, p_manager boolean) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object('order_id', o.id, 'item_id', o.item_id, 'item_name', o.item_name,
           'points', o.points, 'status', o.status, 'created_at', o.created_at, 'updated_at', o.updated_at,
           'member_name', case when p_manager then (select a.display_name from lv.accounts a where a.id = o.account_id) end))
    from lv.shop_orders o where o.id = p_order
$$;

create function lv.api_shop_get(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  v_manage boolean;
  v_points boolean;
begin
  perform lv.require_member(p_hub, v_account, 'The Shop');
  perform lv.require_addon(p_hub, 'shop', false);
  v_manage := lv.has_capability(v_account, p_hub, 'community.shop');
  v_points := coalesce((select c.points_enabled from lv.hub_community c where c.hub_id = p_hub), false);
  return jsonb_build_object('ok', true,
    'points_enabled', v_points,
    'can_order', v_points and lv.addon_allowed(p_hub, 'shop'),
    'balance', lv.points_balance(p_hub, v_account),
    'can_manage', v_manage,
    'item_limit', (lv.hub_limit(p_hub, 'shop.max_items'))::int,
    'items', coalesce((select jsonb_agg(lv.item_json(i.id) order by i.active desc, i.price_points, lower(i.name))
                         from lv.shop_items i where i.hub_id = p_hub and (i.active or v_manage)), '[]'::jsonb),
    'my_orders', coalesce((select jsonb_agg(lv.order_json(o.id, false) order by o.created_at desc)
                             from lv.shop_orders o where o.hub_id = p_hub and o.account_id = v_account), '[]'::jsonb),
    'campaign_points', case when v_manage then coalesce((
        select jsonb_agg(jsonb_build_object('campaign_id', c.id, 'title', c.title, 'status', c.status,
                                            'points', coalesce(cp.points, 0)) order by c.created_at desc)
          from lv.campaigns c left join lv.campaign_points cp on cp.campaign_id = c.id
         where c.hub_id = p_hub and c.status <> 'archived'), '[]'::jsonb) end);
end;
$$;

create function lv.api_shop_item_save(p_hub uuid, p_item uuid, p_name text, p_description text, p_price_points int,
                                      p_stock int, p_active boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  v_name text := btrim(p_name);
  v_limit int;
  v_active int;
  v_id uuid;
  i record;
begin
  perform lv.require_member(p_hub, v_account, 'The Shop');
  perform lv.require_capability(v_account, p_hub, 'community.shop');
  perform lv.require_addon(p_hub, 'shop', true);
  -- With p_item NULL this selects nothing and every field of i is NULL (a new item).
  select * into i from lv.shop_items x where x.id = p_item and x.hub_id = p_hub for update;
  if p_item is not null and i.id is null then return lv.err('lv_not_found', 'No such item.'); end if;
  v_name := coalesce(v_name, i.name);
  if v_name is null or length(v_name) not between 1 and 80 then return lv.err('lv_invalid_input', 'An item name is 1 to 80 characters.'); end if;
  if p_description is not null and length(p_description) > 1000 then return lv.err('lv_invalid_input', 'A description is at most 1000 characters.'); end if;
  if coalesce(p_price_points, i.price_points) is null or coalesce(p_price_points, i.price_points) not between 1 and 1000000 then
    return lv.err('lv_invalid_input', 'A price is 1 to 1,000,000 points.');
  end if;
  -- Stock: a number limits it, NULL keeps it (or means "no limit" for a new item), -1 removes the limit.
  if p_stock is not null and p_stock < -1 then return lv.err('lv_invalid_input', 'Stock cannot be negative.'); end if;

  perform pg_advisory_xact_lock(hashtextextended('lv_shop_items:' || p_hub::text, 0));
  v_limit := (lv.hub_limit(p_hub, 'shop.max_items'))::int;
  v_active := (select count(*) from lv.shop_items x where x.hub_id = p_hub and x.active and x.id is distinct from p_item);
  if coalesce(p_active, i.active, true) and v_active >= coalesce(v_limit, 0) then
    return lv.err_x('lv_limit_reached', format('This plan allows %s active Shop items.', coalesce(v_limit, 0)),
                    jsonb_build_object('limit', coalesce(v_limit, 0), 'used', v_active));
  end if;
  if i.id is null then
    insert into lv.shop_items (hub_id, name, description, price_points, stock, active)
    values (p_hub, v_name, coalesce(p_description, ''), p_price_points, nullif(p_stock, -1), coalesce(p_active, true)) returning id into v_id;
  else
    update lv.shop_items set name = v_name, description = coalesce(p_description, description),
                             price_points = coalesce(p_price_points, price_points),
                             stock = case when p_stock = -1 then null when p_stock is null then stock else p_stock end,
                             active = coalesce(p_active, active), updated_at = now()
     where id = i.id;
    v_id := i.id;
  end if;
  perform lv.audit(v_account, p_hub, 'shop.item_saved', v_id::text);
  return jsonb_build_object('ok', true, 'item', lv.item_json(v_id));
end;
$$;

create function lv.api_shop_order_place(p_item uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  i record;
  v_balance int;
  v_id uuid;
begin
  select * into i from lv.shop_items x where x.id = p_item;
  if i.id is null then return lv.err('lv_not_found', 'No such item.'); end if;
  perform lv.require_member(i.hub_id, v_account, 'The Shop');
  perform lv.premium_guard(i.hub_id, false);
  perform lv.require_addon(i.hub_id, 'shop', true);
  if not lv.points_live(i.hub_id) then return lv.err_x('lv_not_available', 'This Hub has not turned points on.', '{"kind":"points"}'::jsonb); end if;
  -- One order at a time per member and Hub, and the item row is locked, so balance and stock stay exact.
  perform pg_advisory_xact_lock(hashtextextended('lv_points:' || i.hub_id::text || ':' || v_account::text, 0));
  select * into i from lv.shop_items x where x.id = p_item for update;
  if not i.active then return lv.err('lv_not_found', 'No such item.'); end if;
  if i.stock is not null and i.stock <= 0 then return lv.err('lv_out_of_stock', 'This item is out of stock.'); end if;
  if (select count(*) from lv.shop_orders o where o.hub_id = i.hub_id and o.account_id = v_account
         and o.created_at > now() - interval '1 hour') >= lv.policy_int('shop.orders_per_hour', 20) then
    return lv.err('lv_rate_limited', 'You have placed many orders in the last hour. Try again later.');
  end if;
  v_balance := lv.points_balance(i.hub_id, v_account);
  if v_balance < i.price_points then
    return lv.err_x('lv_insufficient_points', 'You do not have enough points for this item yet.',
                    jsonb_build_object('balance', v_balance, 'price', i.price_points));
  end if;
  if i.stock is not null then update lv.shop_items set stock = stock - 1, updated_at = now() where id = i.id; end if;
  insert into lv.shop_orders (hub_id, item_id, account_id, item_name, points)
  values (i.hub_id, i.id, v_account, i.name, i.price_points) returning id into v_id;
  perform lv.community_order_notify(v_id, 'placed');
  return jsonb_build_object('ok', true, 'order', lv.order_json(v_id, false), 'balance', v_balance - i.price_points);
end;
$$;

create function lv.api_shop_order_list(p_hub uuid, p_status text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
begin
  perform lv.require_member(p_hub, v_account, 'The Shop');
  perform lv.require_capability(v_account, p_hub, 'community.shop');
  if p_status is not null and p_status not in ('placed', 'fulfilled', 'cancelled') then
    return lv.err('lv_invalid_input', 'Status is placed, fulfilled or cancelled.');
  end if;
  return jsonb_build_object('ok', true,
    'orders', coalesce((select jsonb_agg(lv.order_json(o.id, true) order by (o.status = 'placed') desc, o.created_at desc)
                          from lv.shop_orders o where o.hub_id = p_hub and (p_status is null or o.status = p_status)), '[]'::jsonb));
end;
$$;

create function lv.api_shop_order_update(p_order uuid, p_status text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  o record;
  v_manage boolean;
begin
  select * into o from lv.shop_orders x where x.id = p_order for update;
  if o.id is null then return lv.err('lv_not_found', 'No such order.'); end if;
  perform lv.require_member(o.hub_id, v_account, 'The Shop');
  v_manage := lv.has_capability(v_account, o.hub_id, 'community.shop');
  if not v_manage and o.account_id <> v_account then return lv.err('lv_not_found', 'No such order.'); end if;
  if p_status not in ('fulfilled', 'cancelled') then return lv.err('lv_invalid_input', 'Status is fulfilled or cancelled.'); end if;
  -- A member may cancel their own open order; only the Hub marks one fulfilled.
  if p_status = 'fulfilled' and not v_manage then return lv.err('lv_forbidden', 'Only the Hub marks an order fulfilled.'); end if;
  if o.status <> 'placed' then return lv.err('lv_lifecycle_invalid', 'Only an open order can change.'); end if;
  update lv.shop_orders set status = p_status, decided_by = v_account, updated_at = now() where id = o.id;
  if p_status = 'cancelled' then
    update lv.shop_items set stock = stock + 1, updated_at = now() where id = o.item_id and stock is not null;
  end if;
  perform lv.audit(v_account, o.hub_id, 'shop.order_' || p_status, o.id::text);
  perform lv.community_order_notify(o.id, p_status);
  return jsonb_build_object('ok', true, 'order', lv.order_json(o.id, v_manage));
end;
$$;

create function lv.api_campaign_points_set(p_campaign uuid, p_points int) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c record;
begin
  select * into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null or lv.hub_kind(c.hub_id) <> 'community' then return lv.err('lv_not_found', 'No such Campaign.'); end if;
  perform lv.require_member(c.hub_id, v_account, 'Hub points');
  perform lv.require_capability(v_account, c.hub_id, 'community.shop');
  perform lv.premium_guard(c.hub_id, false);
  if not lv.addon_allowed(c.hub_id, 'shop') then
    return lv.err_x('lv_entitlement_required', 'Hub points need a plan that includes the Shop.', jsonb_build_object('product', 'starter_hub'));
  end if;
  if p_points is null or p_points not between 0 and 1000 then return lv.err('lv_invalid_input', 'Points per Campaign are 0 to 1000.'); end if;
  -- Changing the value applies to new participation only; points already recorded stay as they were.
  insert into lv.campaign_points (campaign_id, hub_id, points) values (c.id, c.hub_id, p_points)
  on conflict (campaign_id) do update set points = excluded.points, updated_at = now();
  perform lv.audit(v_account, c.hub_id, 'shop.campaign_points', c.id::text, jsonb_build_object('points', p_points));
  return jsonb_build_object('ok', true, 'campaign_id', c.id, 'points', p_points);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Discover listing
-- ---------------------------------------------------------------------------------------------------------
create function lv.api_discover_list(p_query text, p_category text, p_limit int, p_offset int) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_q text := nullif(btrim(p_query), '');
  v_limit int := least(greatest(coalesce(p_limit, 24), 1), 48);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
begin
  if v_q is not null and length(v_q) > 80 then return lv.err('lv_invalid_input', 'Search is at most 80 characters.'); end if;
  if p_category is not null and p_category <> '' and not exists (
       select 1 from jsonb_array_elements(lv.discover_categories()) c where c->>'key' = p_category) then
    return lv.err('lv_invalid_input', 'Unknown category.');
  end if;
  return jsonb_build_object('ok', true, 'categories', lv.discover_categories(),
    'hubs', coalesce((
      select jsonb_agg(jsonb_build_object('slug', x.slug, 'name', x.display_name, 'about', x.about, 'accent', x.accent,
                                          'category', x.discover_category, 'membership_mode', x.membership_mode,
                                          'members_rounded', (x.genuine / 100) * 100)
                       order by x.genuine desc, lower(x.display_name))
        from (select h.slug, h.display_name, left(h.about, 280) as about, h.accent, hc.discover_category, h.membership_mode,
                     lv.genuine_active_members(h.id) as genuine
                from lv.hubs h
                join lv.discover_applications d on d.hub_id = h.id and d.status = 'approved'
                left join lv.hub_community hc on hc.hub_id = h.id
               where h.kind = 'community' and h.visibility = 'public' and lv.hub_family(h.id) = 'team'
                 and (p_category is null or p_category = '' or hc.discover_category = p_category)
                 and (v_q is null or h.display_name ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                      or h.slug ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                      or coalesce(h.about, '') ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
               order by lv.genuine_active_members(h.id) desc, lower(h.display_name)
               limit v_limit offset v_offset) x), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- API wrappers
-- ---------------------------------------------------------------------------------------------------------
create function lv_api.lv_community_get(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_community_get(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_community_update(p_hub uuid, p_points_enabled boolean default null, p_discover_category text default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); perform lv.premium_guard(p_hub, false); return lv.api_community_update(p_hub, p_points_enabled, p_discover_category); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_news_list(p_hub uuid, p_include_drafts boolean default false) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_news_list(p_hub, p_include_drafts); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_news_get(p_post uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_news_get(p_post); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_news_save(p_hub uuid, p_title text, p_body text default null, p_visibility text default 'members',
                                    p_post uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); perform lv.premium_guard(p_hub, false); return lv.api_news_save(p_hub, p_post, p_title, p_body, p_visibility); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_news_publish(p_post uuid, p_publish boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_news_publish(p_post, p_publish); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_news_pin(p_post uuid, p_pinned boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_news_pin(p_post, p_pinned); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_news_delete(p_post uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_news_delete(p_post); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_comment_list(p_hub uuid, p_post uuid default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_comment_list(p_hub, p_post); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_comment_add(p_hub uuid, p_body text, p_post uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); perform lv.premium_guard(p_hub, false); return lv.api_comment_add(p_hub, p_post, p_body); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_comment_delete(p_comment uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_comment_delete(p_comment); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_comment_hide(p_comment uuid, p_hidden boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_comment_hide(p_comment, p_hidden); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_comment_report(p_comment uuid, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_comment_report(p_comment, p_reason); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_leaderboard_get(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_leaderboard_get(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_leaderboard_opt(p_hub uuid, p_opt_in boolean) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_leaderboard_opt(p_hub, p_opt_in); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_shop_get(p_hub uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_shop_get(p_hub); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_shop_item_save(p_hub uuid, p_name text default null, p_description text default null,
                                         p_price_points int default null, p_stock int default null, p_active boolean default null,
                                         p_item uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); perform lv.premium_guard(p_hub, false); return lv.api_shop_item_save(p_hub, p_item, p_name, p_description, p_price_points, p_stock, p_active); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_shop_order_place(p_item uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_shop_order_place(p_item); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_shop_order_list(p_hub uuid, p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin perform lv.require_community(p_hub); return lv.api_shop_order_list(p_hub, p_status); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_shop_order_update(p_order uuid, p_status text) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_shop_order_update(p_order, p_status); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_campaign_points_set(p_campaign uuid, p_points int) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$ begin return lv.api_campaign_points_set(p_campaign, p_points); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

create function lv_api.lv_discover_list(p_query text default null, p_category text default null, p_limit int default 24,
                                        p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$ begin return lv.api_discover_list(p_query, p_category, p_limit, p_offset); exception when others then return lv.api_error(sqlerrm, sqlstate); end; $$;

-- ---------------------------------------------------------------------------------------------------------
-- Grants: explicit, never PUBLIC (LC-05). Signed out: Discover and public news only.
-- ---------------------------------------------------------------------------------------------------------
do $$
declare
  r record;
  v_anon text[] := array['lv_discover_list', 'lv_news_list', 'lv_news_get'];
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'lv_api'
              and p.proname in ('lv_community_get', 'lv_community_update', 'lv_news_list', 'lv_news_get', 'lv_news_save',
                                'lv_news_publish', 'lv_news_pin', 'lv_news_delete', 'lv_comment_list', 'lv_comment_add',
                                'lv_comment_delete', 'lv_comment_hide', 'lv_comment_report', 'lv_leaderboard_get',
                                'lv_leaderboard_opt', 'lv_shop_get', 'lv_shop_item_save', 'lv_shop_order_place',
                                'lv_shop_order_list', 'lv_shop_order_update', 'lv_campaign_points_set', 'lv_discover_list') loop
    execute format('revoke all on function %s from public', r.sig);
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
    if r.proname = any(v_anon) and exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function %s to anon', r.sig);
    end if;
  end loop;
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
