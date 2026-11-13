// Survey branding (000043): color contrast, the player's scoped CSS variables, and image checks. Pure functions,
// shared by the builder (SurveyBranding.tsx), the player hook-in (Player.tsx) and the dev mock.
//
// The rule (DESIGN.md "tenant branding is constrained", WCAG AA): a survey color must reach 4.5:1 against white, so it
// works as text on white and as a button with white text. lv_campaign_branding_set refuses anything lighter; the
// builder offers the nearest darker shade instead. Dark mode derives lighter variants here, at render time, so the
// same stored color stays readable on dark surfaces. High contrast keeps LunchVoice's own colors (player-theme.css).

export const WHITE = "#ffffff";
export const INK = "#14110f";
/** Light page and dark surfaces the player paints on (src/ui/tokens.css). */
const LIGHT_PAGE = "#eeedea";
const DARK_PAGE = "#17140f";
const DARK_SURFACE = "#221e19";
export const AA_TEXT = 4.5;
export const AA_UI = 3;

const HEX = /^#?([0-9a-f]{6})$/i;

export function normalizeHex(v: string | null | undefined): string | null {
  const m = HEX.exec((v ?? "").trim());
  return m ? `#${m[1]!.toLowerCase()}` : null;
}

function rgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? INK;
  return [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16)) as [number, number, number];
}
const toHex = (c: number[]) => `#${c.map((x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0")).join("")}`;

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Mix `hex` toward `target` by t (0..1). */
export function mix(hex: string, target: string, t: number): string {
  const a = rgb(hex);
  const b = rgb(target);
  return toHex(a.map((v, i) => v + (b[i]! - v) * t));
}

/**
 * The closest shade of `hex` that reaches `ratio` against `bg`, moving toward black (light backgrounds) or white (dark
 * backgrounds). Returns `hex` itself when it already passes.
 */
export function ensureContrast(hex: string, bg: string, ratio: number): string {
  const base = normalizeHex(hex) ?? INK;
  if (contrast(base, bg) >= ratio) return base;
  const toward = luminance(bg) > 0.4 ? "#000000" : WHITE;
  for (let i = 1; i <= 100; i++) {
    const c = mix(base, toward, i / 100);
    if (contrast(c, bg) >= ratio) return c;
  }
  return toward;
}

/** Ink or white on a fill, whichever reads better. */
export function onColor(fill: string): string {
  return contrast(fill, INK) >= contrast(fill, WHITE) ? INK : WHITE;
}

export interface ColorCheck { ok: boolean; ratio: number; suggestion: string | null }
/** The save rule: 4.5:1 against white. A failing color comes with the nearest passing shade. */
export function checkBrandColor(hex: string): ColorCheck {
  const c = normalizeHex(hex);
  if (!c) return { ok: false, ratio: 0, suggestion: null };
  const ratio = contrast(c, WHITE);
  return ratio >= AA_TEXT ? { ok: true, ratio, suggestion: null } : { ok: false, ratio, suggestion: ensureContrast(c, WHITE, AA_TEXT) };
}

/* ------------------------------------------------------------------ the theme */

export type ButtonStyle = "rounded" | "pill";

/** What lv_campaign_branding_get/_set store (the survey's own theme). */
export interface SurveyBranding {
  follow_hub: boolean;
  color: string | null;
  logo_path: string | null;
  cover_path: string | null;
  welcome_headline: string | null;
  thank_you: string | null;
  button_style: ButtonStyle;
  hide_footer: boolean;
  updated_at?: string;
}

/** What lv_campaign_theme gives the player (color already resolved; null = LunchVoice styling). */
export interface PlayerTheme {
  color: string | null;
  logo_path: string | null;
  cover_path: string | null;
  welcome_headline: string | null;
  thank_you: string | null;
  button_style: ButtonStyle;
  hide_footer: boolean;
}

export const EMPTY_BRANDING: SurveyBranding = {
  follow_hub: false, color: null, logo_path: null, cover_path: null, welcome_headline: null, thank_you: null, button_style: "rounded", hide_footer: false,
};

/** The theme the player would get from a stored branding (the server does the same in lv_campaign_theme). */
export function resolveTheme(b: SurveyBranding, hubAccent: string | null, removeFooterAllowed: boolean): PlayerTheme {
  return {
    color: (b.follow_hub ? hubAccent ?? b.color : b.color) ?? null,
    logo_path: b.logo_path, cover_path: b.cover_path, welcome_headline: b.welcome_headline, thank_you: b.thank_you,
    button_style: b.button_style, hide_footer: b.hide_footer && removeFooterAllowed,
  };
}

/**
 * CSS custom properties for the player root (`.lv-ptheme`, src/ui/player-theme.css). Only `--pt-*` names: the
 * stylesheet maps them onto the LunchVoice tokens inside the player, so no global token changes.
 */
export function themeVars(color: string | null): Record<string, string> | undefined {
  const c = normalizeHex(color);
  if (!c) return undefined;
  const accent = ensureContrast(c, WHITE, AA_TEXT); // defensive: stored colors already pass
  const text = ensureContrast(accent, LIGHT_PAGE, AA_TEXT);
  const accentDark = ensureContrast(accent, DARK_PAGE, AA_UI);
  const textDark = ensureContrast(accent, DARK_SURFACE, AA_TEXT);
  return {
    "--pt-accent": accent,
    "--pt-on": onColor(accent),
    "--pt-text": text,
    "--pt-accent-dark": accentDark,
    "--pt-on-dark": onColor(accentDark),
    "--pt-text-dark": textDark,
  };
}

/* ------------------------------------------------------------------ images */

export type ImageKind = "logo" | "cover";
export const IMAGE_LIMITS: Record<ImageKind, { bucket: string; maxBytes: number; label: string }> = {
  logo: { bucket: "survey-logos", maxBytes: 1024 * 1024, label: "1 MB" },
  cover: { bucket: "survey-covers", maxBytes: 3 * 1024 * 1024, label: "3 MB" },
};
const TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** The image type from its first bytes (never the file name or the browser's guess). SVG is never accepted. */
export function sniffImage(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return "image/webp";
  return null;
}

/** A reason the file cannot be used, or null. */
export function imageProblem(kind: ImageKind, size: number, sniffed: string | null): string | null {
  if (!sniffed) return "Use a PNG, JPG or WebP image. SVG and other files are not accepted.";
  if (size > IMAGE_LIMITS[kind].maxBytes) return `Keep the ${kind === "logo" ? "logo" : "cover image"} under ${IMAGE_LIMITS[kind].label}.`;
  return null;
}

/** "<campaign>/<kind>-<hex>.<ext>": the only object names the storage policies accept (lv.branding_path_ok). */
export function imagePath(campaignId: string, kind: ImageKind, type: string, random: () => string = randomHex): string {
  return `${campaignId}/${kind}-${random()}.${TYPES[type] ?? "png"}`;
}
const randomHex = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

export const HEADLINE_MAX = 120;
export const THANKS_MAX = 500;

/** The problems lv_campaign_branding_set would answer, checked before sending. */
export function brandingProblem(b: SurveyBranding, isHubCampaign: boolean): string | null {
  if (b.color && !checkBrandColor(b.color).ok) return "That color is too light to read on white. Use the suggested darker shade.";
  if (b.follow_hub && !isHubCampaign) return "Only a Hub Campaign can follow its Hub's color.";
  if ((b.welcome_headline ?? "").length > HEADLINE_MAX) return `Keep the welcome headline to ${HEADLINE_MAX} characters.`;
  if ((b.thank_you ?? "").length > THANKS_MAX) return `Keep the thank-you message to ${THANKS_MAX} characters.`;
  return null;
}
