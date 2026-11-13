-- 000043: survey branding (paid feature `survey.branding`, entitlement rows already live from 000041).
--
-- Founder direction (2026-11-13, binding):
--   * The theme belongs to the SURVEY, never to the Hub. A standalone Quick Survey (personal space, no Hub) gets the
--     full branding; its entitlement comes from the creator's own Creator plan. A Hub Campaign may use the Hub's color
--     as a one-click starting point, or explicitly choose to FOLLOW the Hub's color (follow_hub). Without that toggle,
--     a later change to the Hub's color never changes a survey that has its own theme.
--   * Entitlement on save: lv.feature_allowed(hub, caller, 'survey.branding') = the Hub's plan OR the caller's
--     Creator plan. Removing the "Powered by LunchVoice" footer is a separate key, 'survey.remove_footer', for
--     team and creator_pro only.
--   * A lapsed plan keeps the stored theme (nothing is deleted) but lv_campaign_theme answers theme = null, so the
--     player falls back to LunchVoice styling. The plan checked is the one of the person who last saved the theme.
--   * Branding never touches anonymity, questions or answers: it is a separate table read by a separate function.
--
-- 1. lv.campaign_branding: one row per Campaign/Quick Survey. RLS on, no grants: access only through lv_api.
-- 2. Colors must reach 4.5:1 against white (text on white and white text on the color); the editor adjusts.
-- 3. Images live in two Supabase Storage buckets, size and type limited by the bucket itself:
--      survey-logos  (1 MB, png/jpeg/webp)   survey-covers (3 MB, png/jpeg/webp). SVG is not accepted.
--    Object names are "<campaign uuid>/<logo|cover>-<16..64 hex>.<png|jpg|webp>". Policies on storage.objects call
--    lv_storage.* helpers (a schema that is not exposed through the Data API):
--      write  = campaign.manage on the Campaign's Hub (the owner of a personal space has it) AND survey.branding;
--      read   = the same managers, or anyone once the Campaign is published (not draft, not blocked), the object is
--               the one the saved theme points at, and the saver's plan still allows branding.
--    The bucket DDL runs only where the storage schema exists (Supabase), so the plain-Postgres test chain still runs.
-- 4. lv_api.lv_campaign_branding_get / _set (managers), lv_api.lv_campaign_theme (anyone, for the player).
-- Rollback: supabase/rollbacks/000043_v2_survey_branding.down.sql.
begin;

-- ---------------------------------------------------------------- entitlement key
insert into lv.plan_limits (family, key, value, note) values
  ('team', 'survey.remove_footer', 'true', 'Survey branding without the LunchVoice footer: Team Hub.'),
  ('creator_pro', 'survey.remove_footer', 'true', 'Survey branding without the LunchVoice footer: Creator Pro ("your own theme with no LunchVoice footer").');

-- ---------------------------------------------------------------- 1. the table
create table lv.campaign_branding (
  campaign_id uuid primary key references lv.campaigns (id) on delete cascade,
  follow_hub boolean not null default false,
  color text check (color is null or color ~ '^#[0-9a-f]{6}$'),
  logo_path text check (logo_path is null or length(logo_path) <= 200),
  cover_path text check (cover_path is null or length(cover_path) <= 200),
  welcome_headline text check (welcome_headline is null or length(welcome_headline) between 1 and 120),
  thank_you text check (thank_you is null or length(thank_you) between 1 and 500),
  button_style text not null default 'rounded' check (button_style in ('rounded', 'pill')),
  hide_footer boolean not null default false,
  updated_by uuid references lv.accounts (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table lv.campaign_branding enable row level security;
revoke all on lv.campaign_branding from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on lv.campaign_branding from anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'revoke all on lv.campaign_branding from authenticated'; end if;
end $$;

-- ---------------------------------------------------------------- 2. contrast (WCAG 2.x relative luminance)
create function lv.hex_luminance(p_hex text) returns numeric
language plpgsql immutable set search_path = ''
as $$
declare
  v numeric[] := array[]::numeric[];
  c numeric;
  i int;
begin
  if p_hex is null or p_hex !~* '^#[0-9a-f]{6}$' then return null; end if;
  for i in 0..2 loop
    c := ('x' || lpad(substr(p_hex, 2 + i * 2, 2), 8, '0'))::bit(32)::int / 255.0;
    v := v || case when c <= 0.03928 then c / 12.92 else power((c + 0.055) / 1.055, 2.4) end;
  end loop;
  return 0.2126 * v[1] + 0.7152 * v[2] + 0.0722 * v[3];
end;
$$;

create function lv.contrast_ratio(p_a text, p_b text) returns numeric
language sql immutable set search_path = ''
as $$
  select (greatest(lv.hex_luminance(p_a), lv.hex_luminance(p_b)) + 0.05)
       / (least(lv.hex_luminance(p_a), lv.hex_luminance(p_b)) + 0.05)
$$;

-- The Hub's accent as a hex color, or NULL (personal space, or no accent picked).
create function lv.hub_accent_hex(p_hub uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select lower(a->>'hex') from lv.hubs h, jsonb_array_elements(lv.accent_palette()) a
   where h.id = p_hub and h.kind = 'community' and a->>'key' = h.accent
$$;

-- An object name that belongs to this Campaign and this kind of image.
create function lv.branding_path_ok(p_campaign uuid, p_kind text, p_path text) returns boolean
language sql immutable set search_path = ''
as $$
  select p_path is not null
     and p_path ~ ('^' || p_campaign::text || '/' || p_kind || '-[0-9a-f]{16,64}\.(png|jpg|webp)$')
$$;

-- ---------------------------------------------------------------- 3. storage helpers
create schema lv_storage;
revoke all on schema lv_storage from public;

-- The Campaign an object belongs to (its first folder), when the name has the expected shape for the bucket.
create function lv_storage.branding_campaign(p_bucket text, p_name text) returns uuid
language plpgsql immutable set search_path = ''
as $$
declare
  v_kind text := case p_bucket when 'survey-logos' then 'logo' when 'survey-covers' then 'cover' end;
  v_id text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v_kind is null or v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  if not lv.branding_path_ok(v_id::uuid, v_kind, p_name) then return null; end if;
  return v_id::uuid;
end;
$$;

create function lv_storage.branding_writable(p_bucket text, p_name text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_campaign uuid := lv_storage.branding_campaign(p_bucket, p_name);
  v_hub uuid;
  v_account uuid := lv.current_account_id();
begin
  if v_campaign is null or v_account is null then return false; end if;
  select c.hub_id into v_hub from lv.campaigns c where c.id = v_campaign;
  if v_hub is null then return false; end if;
  return lv.has_capability(v_account, v_hub, 'campaign.manage')
     and lv.feature_allowed(v_hub, v_account, 'survey.branding');
end;
$$;

create function lv_storage.branding_readable(p_bucket text, p_name text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_campaign uuid := lv_storage.branding_campaign(p_bucket, p_name);
  c record;
  b lv.campaign_branding;
  v_account uuid := lv.current_account_id();
begin
  if v_campaign is null then return false; end if;
  select x.hub_id, x.status, x.blocked_at, x.access into c from lv.campaigns x where x.id = v_campaign;
  if c.hub_id is null then return false; end if;
  if v_account is not null and lv.has_capability(v_account, c.hub_id, 'campaign.manage') then return true; end if;
  if c.status = 'draft' or c.blocked_at is not null then return false; end if;
  -- Same visibility as the player: never for a suspended Hub; only link-open Campaigns or people who may take part.
  if lv.hub_suspended(c.hub_id) then return false; end if;
  if not (c.access = 'link' or lv.can_participate(v_campaign, v_account)) then return false; end if;
  select * into b from lv.campaign_branding x where x.campaign_id = v_campaign;
  if b.campaign_id is null then return false; end if;
  if not ((p_bucket = 'survey-logos' and b.logo_path = p_name) or (p_bucket = 'survey-covers' and b.cover_path = p_name)) then
    return false;
  end if;
  return lv.feature_allowed(c.hub_id, b.updated_by, 'survey.branding');
end;
$$;

revoke all on function lv_storage.branding_campaign(text, text), lv_storage.branding_writable(text, text),
  lv_storage.branding_readable(text, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant usage on schema lv_storage to anon';
    execute 'grant execute on function lv_storage.branding_readable(text, text) to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant usage on schema lv_storage to authenticated';
    execute 'grant execute on function lv_storage.branding_readable(text, text), lv_storage.branding_writable(text, text) to authenticated';
  end if;
end $$;

-- Buckets and policies: only where Supabase Storage exists.
do $$ begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice '000043: no storage schema here; buckets and storage policies skipped';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('survey-logos', 'survey-logos', false, 1048576, array['image/png', 'image/jpeg', 'image/webp']),
    ('survey-covers', 'survey-covers', false, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$create policy lv_survey_branding_read on storage.objects for select to anon, authenticated
    using (bucket_id in ('survey-logos', 'survey-covers') and lv_storage.branding_readable(bucket_id, name))$p$;
  execute $p$create policy lv_survey_branding_insert on storage.objects for insert to authenticated
    with check (bucket_id in ('survey-logos', 'survey-covers') and lv_storage.branding_writable(bucket_id, name))$p$;
  execute $p$create policy lv_survey_branding_update on storage.objects for update to authenticated
    using (bucket_id in ('survey-logos', 'survey-covers') and lv_storage.branding_writable(bucket_id, name))
    with check (bucket_id in ('survey-logos', 'survey-covers') and lv_storage.branding_writable(bucket_id, name))$p$;
  execute $p$create policy lv_survey_branding_delete on storage.objects for delete to authenticated
    using (bucket_id in ('survey-logos', 'survey-covers') and lv_storage.branding_writable(bucket_id, name))$p$;
end $$;

-- ---------------------------------------------------------------- 4. API
create function lv.branding_json(b lv.campaign_branding) returns jsonb
language sql immutable set search_path = ''
as $$
  select case when b.campaign_id is null then null else jsonb_build_object(
    'follow_hub', b.follow_hub, 'color', b.color, 'logo_path', b.logo_path, 'cover_path', b.cover_path,
    'welcome_headline', b.welcome_headline, 'thank_you', b.thank_you, 'button_style', b.button_style,
    'hide_footer', b.hide_footer, 'updated_at', b.updated_at) end
$$;

-- Managers: the stored theme (kept even after a plan lapses), what this person may use, and the Hub's color.
create function lv_api.lv_campaign_branding_get(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c record;
  b lv.campaign_branding;
begin
  select x.id, x.hub_id, h.kind into c from lv.campaigns x join lv.hubs h on h.id = x.hub_id where x.id = p_campaign;
  if c.id is null or not lv.has_capability(v_account, c.hub_id, 'campaign.manage') then
    return lv.err('lv_not_found', 'No such Campaign.');
  end if;
  select * into b from lv.campaign_branding x where x.campaign_id = p_campaign;
  return jsonb_build_object('ok', true,
    'branding', lv.branding_json(b),
    'features', jsonb_build_object(
      'branding', lv.feature_allowed(c.hub_id, v_account, 'survey.branding'),
      'remove_footer', lv.feature_allowed(c.hub_id, v_account, 'survey.remove_footer')),
    'hub', jsonb_build_object('kind', c.kind, 'accent_hex', lv.hub_accent_hex(c.hub_id)));
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- Save (p_branding object) or reset (p_branding NULL). Every field is replaced, so the editor always sends all of them.
create function lv_api.lv_campaign_branding_set(p_campaign uuid, p_branding jsonb) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_account uuid := lv.ensure_account();
  c record;
  v_color text;
  v_logo text;
  v_cover text;
  v_head text;
  v_thanks text;
  v_style text;
  v_follow boolean;
  v_hide boolean;
  b lv.campaign_branding;
begin
  select x.id, x.hub_id, x.status, h.kind into c from lv.campaigns x join lv.hubs h on h.id = x.hub_id where x.id = p_campaign;
  if c.id is null or not lv.has_capability(v_account, c.hub_id, 'campaign.manage') then
    return lv.err('lv_not_found', 'No such Campaign.');
  end if;
  if c.status = 'archived' then return lv.err('lv_locked', 'An archived survey can no longer be changed.'); end if;

  -- Reset is always allowed: it only removes the theme.
  if p_branding is null or p_branding = 'null'::jsonb then
    delete from lv.campaign_branding where campaign_id = p_campaign;
    return jsonb_build_object('ok', true, 'branding', null);
  end if;
  if jsonb_typeof(p_branding) <> 'object' then return lv.err('lv_invalid_input', 'Branding must be an object.'); end if;

  if not lv.feature_allowed(c.hub_id, v_account, 'survey.branding') then
    return lv.err_x('lv_entitlement_required', 'Survey branding starts with Creator Plus or a Starter Hub.',
                    jsonb_build_object('product', 'creator_plus', 'feature', 'survey.branding'));
  end if;

  v_follow := coalesce((p_branding->>'follow_hub')::boolean, false);
  v_hide := coalesce((p_branding->>'hide_footer')::boolean, false);
  v_color := lower(nullif(btrim(coalesce(p_branding->>'color', '')), ''));
  v_logo := nullif(p_branding->>'logo_path', '');
  v_cover := nullif(p_branding->>'cover_path', '');
  v_head := nullif(btrim(coalesce(p_branding->>'welcome_headline', '')), '');
  v_thanks := nullif(btrim(coalesce(p_branding->>'thank_you', '')), '');
  v_style := coalesce(nullif(p_branding->>'button_style', ''), 'rounded');

  if v_follow and c.kind <> 'community' then
    return lv.err('lv_invalid_input', 'Only a Hub Campaign can follow its Hub''s color.');
  end if;
  if v_color is not null and v_color !~ '^#[0-9a-f]{6}$' then
    return lv.err('lv_invalid_input', 'Pick a color as #RRGGBB.');
  end if;
  if v_color is not null and lv.contrast_ratio(v_color, '#ffffff') < 4.5 then
    return lv.err('lv_invalid_input', 'That color is too light to read on white. Pick a darker shade (4.5:1 or more).');
  end if;
  if v_logo is not null and not lv.branding_path_ok(p_campaign, 'logo', v_logo) then
    return lv.err('lv_invalid_input', 'Upload the logo again.');
  end if;
  if v_cover is not null and not lv.branding_path_ok(p_campaign, 'cover', v_cover) then
    return lv.err('lv_invalid_input', 'Upload the cover image again.');
  end if;
  if length(v_head) > 120 then return lv.err('lv_invalid_input', 'Keep the welcome headline to 120 characters.'); end if;
  if length(v_thanks) > 500 then return lv.err('lv_invalid_input', 'Keep the thank-you message to 500 characters.'); end if;
  if v_style not in ('rounded', 'pill') then return lv.err('lv_invalid_input', 'Buttons are rounded or pill.'); end if;
  if v_hide and not lv.feature_allowed(c.hub_id, v_account, 'survey.remove_footer') then
    return lv.err_x('lv_entitlement_required', 'Removing the LunchVoice footer comes with Creator Pro or a Team Hub.',
                    jsonb_build_object('product', 'creator_pro', 'feature', 'survey.remove_footer'));
  end if;

  insert into lv.campaign_branding as x (campaign_id, follow_hub, color, logo_path, cover_path, welcome_headline, thank_you,
                                         button_style, hide_footer, updated_by, updated_at)
  values (p_campaign, v_follow, v_color, v_logo, v_cover, v_head, v_thanks, v_style, v_hide, v_account, now())
  on conflict (campaign_id) do update
    set follow_hub = excluded.follow_hub, color = excluded.color, logo_path = excluded.logo_path, cover_path = excluded.cover_path,
        welcome_headline = excluded.welcome_headline, thank_you = excluded.thank_you, button_style = excluded.button_style,
        hide_footer = excluded.hide_footer, updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into b;
  return jsonb_build_object('ok', true, 'branding', lv.branding_json(b));
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- The player: the theme to apply, or theme = null for LunchVoice styling. Published Campaigns for anyone (the id is
-- an unguessable UUID the player already holds); drafts only for their managers (the builder's preview).
create function lv_api.lv_campaign_theme(p_campaign uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_account uuid := lv.current_account_id();
  c record;
  b lv.campaign_branding;
  v_color text;
begin
  select x.id, x.hub_id, x.status, x.blocked_at, x.access into c from lv.campaigns x where x.id = p_campaign;
  if c.id is null then return jsonb_build_object('ok', true, 'theme', null); end if;
  -- Managers always see their own theme. Everyone else gets the same visibility as the player: published, not
  -- blocked, Hub not suspended, and the Campaign is link-open or this person may take part (member/invited).
  if not (v_account is not null and lv.has_capability(v_account, c.hub_id, 'campaign.manage')) then
    if c.status = 'draft' or c.blocked_at is not null or lv.hub_suspended(c.hub_id)
       or not (c.access = 'link' or lv.can_participate(c.id, v_account)) then
      return jsonb_build_object('ok', true, 'theme', null);
    end if;
  end if;
  select * into b from lv.campaign_branding x where x.campaign_id = p_campaign;
  if b.campaign_id is null or not lv.feature_allowed(c.hub_id, b.updated_by, 'survey.branding') then
    return jsonb_build_object('ok', true, 'theme', null);
  end if;
  v_color := case when b.follow_hub then coalesce(lv.hub_accent_hex(c.hub_id), b.color) else b.color end;
  return jsonb_build_object('ok', true, 'theme', jsonb_build_object(
    'color', v_color, 'logo_path', b.logo_path, 'cover_path', b.cover_path,
    'welcome_headline', b.welcome_headline, 'thank_you', b.thank_you, 'button_style', b.button_style,
    'hide_footer', b.hide_footer and lv.feature_allowed(c.hub_id, b.updated_by, 'survey.remove_footer')));
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;

-- ---------------------------------------------------------------- grants (never PUBLIC)
revoke all on function lv.hex_luminance(text), lv.contrast_ratio(text, text), lv.hub_accent_hex(uuid),
  lv.branding_path_ok(uuid, text, text), lv.branding_json(lv.campaign_branding) from public;
revoke all on function lv_api.lv_campaign_branding_get(uuid), lv_api.lv_campaign_branding_set(uuid, jsonb),
  lv_api.lv_campaign_theme(uuid) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function lv_api.lv_campaign_branding_get(uuid), lv_api.lv_campaign_branding_set(uuid, jsonb), lv_api.lv_campaign_theme(uuid) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function lv_api.lv_campaign_theme(uuid) to anon';
  end if;
end $$;

commit;
