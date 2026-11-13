// DEV-ONLY stand-in for survey branding (000043): lv_campaign_branding_get/_set, lv_campaign_theme and the two storage
// buckets. Mirrors the server rules closely enough to click through; the backend stays authoritative.
import type { BrandingStorage } from "./surveyBrandingApi";
import { brandingProblem, checkBrandColor, DEFAULT_COSMETICS, IMAGE_LIMITS, normalizeHex, type PatternKey, type SurveyBranding } from "./surveyTheme";

export interface BrandingCtx {
  /** The mock state object; branding rows and images are kept on it so a reset clears them too. */
  store: { branding?: Record<string, SurveyBranding & { by_creator: boolean }>; branding_files?: Record<string, string> };
  campaign(id: string): { hub_id: string; status: string; hubKind: "community" | "personal"; hubAccent: string | null; canManage: boolean } | null;
  /** lv.feature_allowed(hub, me, 'survey.branding' | 'survey.remove_footer'). */
  allowed(hubId: string, key: "survey.branding" | "survey.remove_footer"): boolean;
}

export const BRANDING_FNS = new Set(["lv_campaign_branding_get", "lv_campaign_branding_set", "lv_campaign_theme"]);
export const BRANDING_PUBLIC = new Set(["lv_campaign_theme"]);

const err = (code: string, message: string, extra: object = {}) => ({ ok: false, error: { code, message, ...extra } });
const pathOk = (campaign: string, kind: string, p: unknown) =>
  typeof p === "string" && p.startsWith(`${campaign}/${kind}-`) && /-[0-9a-f]{16,64}\.(png|jpg|webp)$/.test(p);

export function brandingHandle(ctx: BrandingCtx, fn: string, a: Record<string, unknown>, authed: boolean): unknown {
  const id = String(a.p_campaign ?? "");
  const c = ctx.campaign(id);
  const rows = (ctx.store.branding ??= {});
  if (fn === "lv_campaign_theme") {
    if (!c || ((c.status === "draft") && !(authed && c.canManage))) return { ok: true, theme: null };
    const b = rows[id];
    // The plan checked is the saver's; in the mock that is always "me".
    if (!b || !ctx.allowed(c.hub_id, "survey.branding")) return { ok: true, theme: null };
    return {
      ok: true,
      theme: {
        color: b.follow_hub ? c.hubAccent ?? b.color : b.color, logo_path: b.logo_path, cover_path: b.cover_path,
        welcome_headline: b.welcome_headline, thank_you: b.thank_you, button_style: b.button_style,
        hide_footer: b.hide_footer && ctx.allowed(c.hub_id, "survey.remove_footer"),
        style: b.style, color2: b.style === "gradient" ? b.color2 : null, gradient_angle: b.gradient_angle, banner_style: b.banner_style, cosmetics: b.cosmetics,
      },
    };
  }
  if (!authed) return err("lv_unauthenticated", "Sign in to continue");
  if (!c || !c.canManage) return err("lv_not_found", "No such Campaign.");
  if (fn === "lv_campaign_branding_get") {
    const b = rows[id];
    return {
      ok: true,
      branding: b ? strip(b) : null,
      features: { branding: ctx.allowed(c.hub_id, "survey.branding"), remove_footer: ctx.allowed(c.hub_id, "survey.remove_footer") },
      hub: { kind: c.hubKind, accent_hex: c.hubAccent },
    };
  }
  // lv_campaign_branding_set
  if (c.status === "archived") return err("lv_locked", "An archived survey can no longer be changed.");
  if (a.p_branding == null) { delete rows[id]; return { ok: true, branding: null }; }
  if (!ctx.allowed(c.hub_id, "survey.branding"))
    return err("lv_entitlement_required", "Survey branding starts with Creator Plus or a Starter Hub.", { product: "creator_plus", feature: "survey.branding" });
  const p = a.p_branding as Partial<SurveyBranding>;
  const b: SurveyBranding = {
    follow_hub: Boolean(p.follow_hub), color: normalizeHex(p.color ?? null), logo_path: p.logo_path || null, cover_path: p.cover_path || null,
    welcome_headline: p.welcome_headline?.trim() || null, thank_you: p.thank_you?.trim() || null,
    button_style: p.button_style === "pill" ? "pill" : "rounded", hide_footer: Boolean(p.hide_footer), updated_at: new Date().toISOString(),
    style: (p.style ?? "solid") as SurveyBranding["style"], color2: normalizeHex(p.color2 ?? null), gradient_angle: (p.gradient_angle ?? 135) as SurveyBranding["gradient_angle"],
    banner_style: (p.banner_style ?? "fill") as SurveyBranding["banner_style"],
    cosmetics: {
      pattern: (p.cosmetics?.pattern ?? (p.banner_style === "pattern" ? "dots" : "none")) as PatternKey,
      progress_tint: Boolean(p.cosmetics?.progress_tint ?? DEFAULT_COSMETICS.progress_tint), glow: Boolean(p.cosmetics?.glow ?? DEFAULT_COSMETICS.glow),
    },
  };
  if (!["solid", "gradient"].includes(b.style)) return err("lv_invalid_input", "The look is solid or gradient.");
  if (![90, 135, 180].includes(b.gradient_angle)) return err("lv_invalid_input", "Pick a gradient direction from the list.");
  if (!["fill", "pattern", "logo"].includes(b.banner_style)) return err("lv_invalid_input", "The banner is a fill, a pattern or logo only.");
  if (!["none", "dots", "grid", "waves"].includes(b.cosmetics.pattern)) return err("lv_invalid_input", "Pick a pattern from the list.");
  if (p.color2 && !b.color2) return err("lv_invalid_input", "Pick the second color as #RRGGBB.");
  if (b.style === "gradient") {
    if (!b.color2 || (!b.color && !b.follow_hub)) return err("lv_invalid_input", "A gradient needs two colors.");
    if (!checkBrandColor(b.color2).ok) return err("lv_invalid_input", "The second color is too light for text on a gradient. Pick a darker shade (4.5:1 or more).");
  } else b.color2 = null;
  if (p.color && !b.color) return err("lv_invalid_input", "Pick a color as #RRGGBB.");
  if (b.color && !checkBrandColor(b.color).ok) return err("lv_invalid_input", "That color is too light to read on white. Pick a darker shade (4.5:1 or more).");
  const bad = brandingProblem(b, c.hubKind === "community");
  if (bad) return err("lv_invalid_input", bad);
  if (b.logo_path && !pathOk(id, "logo", b.logo_path)) return err("lv_invalid_input", "Upload the logo again.");
  if (b.cover_path && !pathOk(id, "cover", b.cover_path)) return err("lv_invalid_input", "Upload the cover image again.");
  if (b.hide_footer && !ctx.allowed(c.hub_id, "survey.remove_footer"))
    return err("lv_entitlement_required", "Removing the LunchVoice footer comes with Creator Pro or a Team Hub.", { product: "creator_pro", feature: "survey.remove_footer" });
  rows[id] = { ...b, by_creator: true };
  return { ok: true, branding: b };
}

function strip(b: SurveyBranding & { by_creator?: boolean }): SurveyBranding {
  const { by_creator: _ignored, ...rest } = b;
  return rest;
}

/** The two buckets, with their size and type limits and the write/read rules of the storage policies. */
export function mockBrandingStorage(getCtx: () => BrandingCtx, authed: () => boolean, persist: () => void): BrandingStorage {
  const kindOf = (bucket: string) => (bucket === IMAGE_LIMITS.logo.bucket ? "logo" : bucket === IMAGE_LIMITS.cover.bucket ? "cover" : null);
  return {
    async upload(bucket, path, file, contentType) {
      const ctx = getCtx();
      const kind = kindOf(bucket);
      const campaign = path.split("/")[0] ?? "";
      const c = ctx.campaign(campaign);
      if (!kind || !pathOk(campaign, kind, path)) return { ok: false, message: "Invalid object name." };
      if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) return { ok: false, message: "mime type not supported" };
      if (file.size > IMAGE_LIMITS[kind].maxBytes) return { ok: false, message: "The object exceeded the maximum allowed size" };
      if (!authed() || !c || !c.canManage || !ctx.allowed(c.hub_id, "survey.branding")) return { ok: false, message: "new row violates row-level security policy" };
      const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
      (ctx.store.branding_files ??= {})[`${bucket}/${path}`] = data;
      persist();
      return { ok: true };
    },
    async download(bucket, path) {
      const ctx = getCtx();
      const data = ctx.store.branding_files?.[`${bucket}/${path}`];
      if (!data) return null;
      const campaign = path.split("/")[0] ?? "";
      const c = ctx.campaign(campaign);
      const b = ctx.store.branding?.[campaign];
      const referenced = b && (b.logo_path === path || b.cover_path === path);
      const readable = (authed() && c?.canManage) || (c && c.status !== "draft" && referenced && ctx.allowed(c.hub_id, "survey.branding"));
      if (!readable) return null;
      return (await fetch(data)).blob();
    },
  };
}
