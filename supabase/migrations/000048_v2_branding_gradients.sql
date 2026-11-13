-- 000048: survey branding v2: gradients and cosmetics (extends 000043; everything additive).
--
-- Kept from 000043, unchanged: the theme belongs to the survey (never the Hub, works without a Hub); the Hub's color is
-- only an optional preset or an explicit follow_hub; entitlement on save = the Hub's plan OR the saver's Creator plan;
-- a lapsed plan keeps the row and the player falls back; the table has no API grants; the player-visibility rules of
-- lv_campaign_theme (suspended Hub, blocked, draft, invite/member-only) are unchanged.
--
-- New columns on lv.campaign_branding:
--   style           'solid' | 'gradient'            (default solid: every existing row is unchanged)
--   color2          second color of a gradient      (#rrggbb; NULL for solid)
--   gradient_angle  90 horizontal | 135 diagonal | 180 vertical
--   banner_style    'fill' (the color or gradient) | 'pattern' | 'logo' (logo only, no color band)
--   cosmetics       {pattern: none|dots|grid|waves, progress_tint: bool, glow: bool}   (strictly shaped here)
-- Text on a gradient is white, so BOTH colors must reach 4.5:1 against white (checked on save). Corner style is the
-- existing button_style; the cover image and footer key from 000043 are unchanged.
-- Rollback: supabase/rollbacks/000048_v2_branding_gradients.down.sql.
begin;

alter table lv.campaign_branding
  add column style text not null default 'solid' check (style in ('solid', 'gradient')),
  add column color2 text check (color2 is null or color2 ~ '^#[0-9a-f]{6}$'),
  add column gradient_angle int not null default 135 check (gradient_angle in (90, 135, 180)),
  add column banner_style text not null default 'fill' check (banner_style in ('fill', 'pattern', 'logo')),
  add column cosmetics jsonb not null default '{"pattern":"none","progress_tint":false,"glow":false}'::jsonb
    check (jsonb_typeof(cosmetics) = 'object' and length(cosmetics::text) <= 120
           and cosmetics->>'pattern' in ('none', 'dots', 'grid', 'waves')
           and jsonb_typeof(cosmetics->'progress_tint') = 'boolean' and jsonb_typeof(cosmetics->'glow') = 'boolean'),
  add constraint campaign_branding_gradient_has_color2 check (style = 'solid' or color2 is not null);

create or replace function lv.branding_json(b lv.campaign_branding) returns jsonb
language sql immutable set search_path = ''
as $$
  select case when b.campaign_id is null then null else jsonb_build_object(
    'follow_hub', b.follow_hub, 'color', b.color, 'logo_path', b.logo_path, 'cover_path', b.cover_path,
    'welcome_headline', b.welcome_headline, 'thank_you', b.thank_you, 'button_style', b.button_style,
    'hide_footer', b.hide_footer, 'updated_at', b.updated_at,
    'style', b.style, 'color2', b.color2, 'gradient_angle', b.gradient_angle, 'banner_style', b.banner_style, 'cosmetics', b.cosmetics) end
$$;


create or replace function lv_api.lv_campaign_branding_set(p_campaign uuid, p_branding jsonb) returns jsonb
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
  v_kind text;
  v_color2 text;
  v_angle int;
  v_banner text;
  v_cos jsonb;
  v_pattern text;
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
  v_kind := coalesce(nullif(p_branding->>'style', ''), 'solid');
  v_color2 := lower(nullif(btrim(coalesce(p_branding->>'color2', '')), ''));
  v_angle := coalesce(nullif(p_branding->>'gradient_angle', '')::int, 135);
  v_banner := coalesce(nullif(p_branding->>'banner_style', ''), 'fill');
  v_pattern := coalesce(nullif(p_branding#>>'{cosmetics,pattern}', ''), case when v_banner = 'pattern' then 'dots' else 'none' end);
  v_cos := jsonb_build_object('pattern', v_pattern,
    'progress_tint', coalesce((p_branding#>>'{cosmetics,progress_tint}')::boolean, false),
    'glow', coalesce((p_branding#>>'{cosmetics,glow}')::boolean, false));

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
  if v_kind not in ('solid', 'gradient') then return lv.err('lv_invalid_input', 'The look is solid or gradient.'); end if;
  if v_angle not in (90, 135, 180) then return lv.err('lv_invalid_input', 'Pick a gradient direction from the list.'); end if;
  if v_banner not in ('fill', 'pattern', 'logo') then return lv.err('lv_invalid_input', 'The banner is a fill, a pattern or logo only.'); end if;
  if v_pattern not in ('none', 'dots', 'grid', 'waves') then return lv.err('lv_invalid_input', 'Pick a pattern from the list.'); end if;
  if v_color2 is not null and v_color2 !~ '^#[0-9a-f]{6}$' then return lv.err('lv_invalid_input', 'Pick the second color as #RRGGBB.'); end if;
  if v_kind = 'gradient' then
    if v_color2 is null or (v_color is null and not v_follow) then
      return lv.err('lv_invalid_input', 'A gradient needs two colors.');
    end if;
    -- White text must read on both ends of the gradient (the first color is already checked above).
    if lv.contrast_ratio(v_color2, '#ffffff') < 4.5 then
      return lv.err('lv_invalid_input', 'The second color is too light for text on a gradient. Pick a darker shade (4.5:1 or more).');
    end if;
  else
    v_color2 := null;
  end if;
  if length(v_head) > 120 then return lv.err('lv_invalid_input', 'Keep the welcome headline to 120 characters.'); end if;
  if length(v_thanks) > 500 then return lv.err('lv_invalid_input', 'Keep the thank-you message to 500 characters.'); end if;
  if v_style not in ('rounded', 'pill') then return lv.err('lv_invalid_input', 'Buttons are rounded or pill.'); end if;
  if v_hide and not lv.feature_allowed(c.hub_id, v_account, 'survey.remove_footer') then
    return lv.err_x('lv_entitlement_required', 'Removing the LunchVoice footer comes with Creator Pro or a Team Hub.',
                    jsonb_build_object('product', 'creator_pro', 'feature', 'survey.remove_footer'));
  end if;

  insert into lv.campaign_branding as x (campaign_id, follow_hub, color, logo_path, cover_path, welcome_headline, thank_you,
                                         button_style, hide_footer, updated_by, updated_at,
                                         style, color2, gradient_angle, banner_style, cosmetics)
  values (p_campaign, v_follow, v_color, v_logo, v_cover, v_head, v_thanks, v_style, v_hide, v_account, now(),
          v_kind, v_color2, v_angle, v_banner, v_cos)
  on conflict (campaign_id) do update
    set follow_hub = excluded.follow_hub, color = excluded.color, logo_path = excluded.logo_path, cover_path = excluded.cover_path,
        welcome_headline = excluded.welcome_headline, thank_you = excluded.thank_you, button_style = excluded.button_style,
        hide_footer = excluded.hide_footer, updated_by = excluded.updated_by, updated_at = excluded.updated_at,
        style = excluded.style, color2 = excluded.color2, gradient_angle = excluded.gradient_angle,
        banner_style = excluded.banner_style, cosmetics = excluded.cosmetics
  returning * into b;
  return jsonb_build_object('ok', true, 'branding', lv.branding_json(b));
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;


create or replace function lv_api.lv_campaign_theme(p_campaign uuid) returns jsonb
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
    'hide_footer', b.hide_footer and lv.feature_allowed(c.hub_id, b.updated_by, 'survey.remove_footer'),
    'style', b.style, 'color2', case when b.style = 'gradient' then b.color2 end, 'gradient_angle', b.gradient_angle,
    'banner_style', b.banner_style, 'cosmetics', b.cosmetics));
exception when others then return lv.api_error(sqlerrm, sqlstate);
end;
$$;


revoke all on function lv.branding_json(lv.campaign_branding), lv_api.lv_campaign_branding_set(uuid, jsonb),
  lv_api.lv_campaign_theme(uuid) from public;

commit;
