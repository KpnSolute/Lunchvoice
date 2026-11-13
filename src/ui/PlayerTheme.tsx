import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useIdentity } from "../identity/IdentityProvider";
import { themeVars, type PlayerTheme } from "../lib/surveyTheme";
import type { LvApi } from "../lib/lvApi";
import "./player-theme.css";

/**
 * Survey branding in the player (000043). The Player calls usePlayerTheme once and spreads `frameProps` on its root;
 * everything else is optional decoration (BrandMedia on the start card, the logo and message on the thank-you screen).
 * No theme (free plan, lapsed plan, high contrast or none saved) leaves the player exactly as before.
 */
export interface ThemeState {
  theme: PlayerTheme | null;
  logoUrl: string | null;
  coverUrl: string | null;
  /** Spread `attrs` on the player root: data-buttons, data-pt-banner, data-pt-pattern, data-pt-glow, data-pt-progress. */
  frameProps: { className: string; style?: CSSProperties; attrs: Record<string, string> };
  hideFooter: boolean;
}

export const NO_THEME: ThemeState = { theme: null, logoUrl: null, coverUrl: null, frameProps: { className: "", attrs: {} }, hideFooter: false };

export function themeState(theme: PlayerTheme | null, logoUrl: string | null, coverUrl: string | null): ThemeState {
  const vars = theme ? themeVars(theme.color, { color2: theme.style === "gradient" ? theme.color2 : null, angle: theme.gradient_angle }) : undefined;
  if (!theme) return NO_THEME;
  return {
    theme,
    logoUrl,
    coverUrl,
    frameProps: {
      className: vars ? " lv-ptheme" : "",
      style: vars as CSSProperties | undefined,
      attrs: {
        "data-buttons": theme.button_style,
        "data-pt-banner": theme.banner_style ?? "fill",
        "data-pt-pattern": theme.banner_style === "pattern" ? theme.cosmetics?.pattern ?? "dots" : "none",
        "data-pt-glow": theme.cosmetics?.glow ? "on" : "off",
        "data-pt-progress": theme.cosmetics?.progress_tint ? "on" : "off",
        "data-pt-logo-shadow": theme.cosmetics?.logo_shadow ? "on" : "off",
      },
    },
    hideFooter: theme.hide_footer,
  };
}

/** Loads the survey's theme (lv_campaign_theme) and its images as blob: URLs. */
export function usePlayerTheme(campaignId: string | null | undefined): ThemeState {
  const { api } = useIdentity();
  const [theme, setTheme] = useState<PlayerTheme | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setTheme(null);
    if (!campaignId) return;
    api.campaignTheme(campaignId).then((r) => { if (live && r.ok) setTheme(r.theme); });
    return () => { live = false; };
  }, [api, campaignId]);

  useBlobUrl(api, "logo", theme?.logo_path ?? null, setLogoUrl);
  useBlobUrl(api, "cover", theme?.cover_path ?? null, setCoverUrl);
  return themeState(theme, logoUrl, coverUrl);
}

export function useBlobUrl(api: LvApi, kind: "logo" | "cover", path: string | null, set: (u: string | null) => void) {
  useEffect(() => {
    let live = true;
    let url: string | null = null;
    set(null);
    if (!path) return;
    api.brandingImageUrl(kind, path).then((u) => { url = u; if (live) set(u); else if (u) URL.revokeObjectURL(u); });
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [api, kind, path, set]);
}

/** Cover and logo at the top of the start card. Decorative: the survey title stays the heading. */
export function BrandMedia({ t, cover = true }: { t: ThemeState; cover?: boolean }) {
  if (!t.theme) return null;
  return (
    <>
      {cover && t.coverUrl && <img className="lv-pt-cover" src={t.coverUrl} alt="" data-testid="brand-cover" />}
      {t.logoUrl && <img className="lv-pt-logo" src={t.logoUrl} alt="Logo" data-testid="brand-logo" />}
    </>
  );
}

/** The thank-you screen's logo (the screen itself is the banner: color, gradient or pattern; logo-only keeps LunchVoice ink). */
export function BrandBanner({ t }: { t: ThemeState }) {
  if (!t.theme || !t.logoUrl) return null;
  return <img className="lv-pt-logo lv-pt-logo-only" src={t.logoUrl} alt="Logo" data-testid="brand-logo" />;
}
