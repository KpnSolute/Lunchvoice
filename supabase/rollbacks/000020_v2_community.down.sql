-- Rollback for 000020_v2_community. Drops the community API, tables, helpers, map rows, policies and capabilities,
-- and restores the 000015 bodies of lv.api_hub_pages_get and lv.api_hub_pages_update (verbatim).
begin;

drop function if exists lv_api.lv_community_get(uuid);
drop function if exists lv_api.lv_community_update(uuid, boolean, text);
drop function if exists lv_api.lv_news_list(uuid, boolean);
drop function if exists lv_api.lv_news_get(uuid);
drop function if exists lv_api.lv_news_save(uuid, text, text, text, uuid);
drop function if exists lv_api.lv_news_publish(uuid, boolean);
drop function if exists lv_api.lv_news_pin(uuid, boolean);
drop function if exists lv_api.lv_news_delete(uuid);
drop function if exists lv_api.lv_comment_list(uuid, uuid);
drop function if exists lv_api.lv_comment_add(uuid, text, uuid);
drop function if exists lv_api.lv_comment_delete(uuid);
drop function if exists lv_api.lv_comment_hide(uuid, boolean);
drop function if exists lv_api.lv_comment_report(uuid, text);
drop function if exists lv_api.lv_leaderboard_get(uuid);
drop function if exists lv_api.lv_leaderboard_opt(uuid, boolean);
drop function if exists lv_api.lv_shop_get(uuid);
drop function if exists lv_api.lv_shop_item_save(uuid, text, text, int, int, boolean, uuid);
drop function if exists lv_api.lv_shop_order_place(uuid);
drop function if exists lv_api.lv_shop_order_list(uuid, text);
drop function if exists lv_api.lv_shop_order_update(uuid, text);
drop function if exists lv_api.lv_campaign_points_set(uuid, int);
drop function if exists lv_api.lv_discover_list(text, text, int, int);

drop function if exists lv.api_community_get(uuid);
drop function if exists lv.api_community_update(uuid, boolean, text);
drop function if exists lv.api_news_list(uuid, boolean);
drop function if exists lv.api_news_get(uuid);
drop function if exists lv.api_news_save(uuid, uuid, text, text, text);
drop function if exists lv.api_news_publish(uuid, boolean);
drop function if exists lv.api_news_pin(uuid, boolean);
drop function if exists lv.api_news_delete(uuid);
drop function if exists lv.api_comment_list(uuid, uuid);
drop function if exists lv.api_comment_add(uuid, uuid, text);
drop function if exists lv.api_comment_delete(uuid);
drop function if exists lv.api_comment_hide(uuid, boolean);
drop function if exists lv.api_comment_report(uuid, text);
drop function if exists lv.api_leaderboard_get(uuid);
drop function if exists lv.api_leaderboard_opt(uuid, boolean);
drop function if exists lv.api_shop_get(uuid);
drop function if exists lv.api_shop_item_save(uuid, uuid, text, text, int, int, boolean);
drop function if exists lv.api_shop_order_place(uuid);
drop function if exists lv.api_shop_order_list(uuid, text);
drop function if exists lv.api_shop_order_update(uuid, text);
drop function if exists lv.api_campaign_points_set(uuid, int);
drop function if exists lv.api_discover_list(text, text, int, int);

drop trigger if exists participation_points on lv.participation;
drop function if exists lv.award_participation_points();

drop table if exists lv.shop_orders;
drop table if exists lv.shop_items;
drop table if exists lv.campaign_points;
drop table if exists lv.leaderboard_optins;
drop table if exists lv.comment_reports;
drop table if exists lv.comments;
drop table if exists lv.news_posts;
drop table if exists lv.hub_community;

-- 000015 bodies, restored verbatim.
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
  return jsonb_build_object('ok', true, 'pages', lv.pages_json(h.id, v_manage),
    'custom_slots', jsonb_build_object(
      'used', (select count(*) from lv.hub_pages p where p.hub_id = h.id and p.kind = 'custom'),
      'limit', (lv.hub_limit(h.id, 'pages.max_custom'))::int));
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

drop function if exists lv.pages_json_for(uuid, boolean, boolean);
drop function if exists lv.order_json(uuid, boolean);
drop function if exists lv.item_json(uuid);
drop function if exists lv.post_json(uuid, boolean);
drop function if exists lv.comment_target_ok(uuid, uuid);
drop function if exists lv.participation_count(uuid, uuid);
drop function if exists lv.campaign_ended(text, timestamptz);
drop function if exists lv.community_order_notify(uuid, text);
drop function if exists lv.points_balance(uuid, uuid);
drop function if exists lv.points_live(uuid);
drop function if exists lv.policy_int(text, int);
drop function if exists lv.require_addon(uuid, text, boolean);
drop function if exists lv.require_member(uuid, uuid, text);
drop function if exists lv.community_reader(uuid, uuid);
drop function if exists lv.addons_json(uuid);
drop function if exists lv.addon_page_on(uuid, text);
drop function if exists lv.addon_allowed(uuid, text);
drop function if exists lv.addon_flag_key(text);
drop function if exists lv.discover_categories();

alter table lv.hub_pages drop column if exists visibility;

-- Points recorded by the community trigger stay on lv.participation (the columns predate 000020); nothing is deleted.
delete from lv.role_capabilities where capability in ('community.post', 'community.moderate', 'community.shop');
delete from lv.capabilities where capability in ('community.post', 'community.moderate', 'community.shop');
delete from lv.policy where key in ('community.comment_max_length', 'community.comments_per_minute', 'community.posts_per_hour',
                                    'community.max_pinned', 'community.reports_per_hour', 'shop.orders_per_hour');
delete from lv.plan_limits where key in ('community.newsroom', 'community.comments', 'community.leaderboard', 'community.shop',
                                         'shop.max_items');

commit;
