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
export type ThemeStyle = "solid" | "gradient";
/** CSS gradient angle: 180 top to bottom (vertical), 135 diagonal, 90 left to right (horizontal). */
export type GradientAngle = 90 | 135 | 180;
export type BannerStyle = "fill" | "pattern" | "logo";
export type PatternKey = "none" | "dots" | "grid" | "waves";
export interface Cosmetics { pattern: PatternKey; progress_tint: boolean; glow: boolean; logo_shadow: boolean }
export const DEFAULT_COSMETICS: Cosmetics = { pattern: "none", progress_tint: false, glow: false, logo_shadow: false };
export const ANGLES: { angle: GradientAngle; key: "vertical" | "diagonal" | "horizontal"; label: string }[] = [
  { angle: 180, key: "vertical", label: "Vertical" },
  { angle: 135, key: "diagonal", label: "Diagonal" },
  { angle: 90, key: "horizontal", label: "Horizontal" },
];

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
  /** 000048 */
  style: ThemeStyle;
  color2: string | null;
  gradient_angle: GradientAngle;
  banner_style: BannerStyle;
  cosmetics: Cosmetics;
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
  style?: ThemeStyle;
  color2?: string | null;
  gradient_angle?: GradientAngle;
  banner_style?: BannerStyle;
  cosmetics?: Cosmetics;
}

export const EMPTY_BRANDING: SurveyBranding = {
  follow_hub: false, color: null, logo_path: null, cover_path: null, welcome_headline: null, thank_you: null, button_style: "rounded", hide_footer: false,
  style: "solid", color2: null, gradient_angle: 135, banner_style: "fill", cosmetics: DEFAULT_COSMETICS,
};

/** The theme the player would get from a stored branding (the server does the same in lv_campaign_theme). */
export function resolveTheme(b: SurveyBranding, hubAccent: string | null, removeFooterAllowed: boolean): PlayerTheme {
  return {
    color: (b.follow_hub ? hubAccent ?? b.color : b.color) ?? null,
    logo_path: b.logo_path, cover_path: b.cover_path, welcome_headline: b.welcome_headline, thank_you: b.thank_you,
    button_style: b.button_style, hide_footer: b.hide_footer && removeFooterAllowed,
    style: b.style, color2: b.style === "gradient" ? b.color2 : null, gradient_angle: b.gradient_angle,
    banner_style: b.banner_style, cosmetics: b.cosmetics,
  };
}

/** The ink or white that reads best across ALL the colors text sits on (the worst color decides). */
export function onColors(fills: string[]): string {
  const worst = (text: string) => Math.min(...fills.map((f) => contrast(f, text)));
  return worst(INK) >= worst(WHITE) ? INK : WHITE;
}

export function gradientCss(c1: string, c2: string, angle: number): string {
  return `linear-gradient(${angle}deg, ${c1}, ${c2})`;
}

/** The worst contrast of the text color over a theme's hero fill(s). The save rule keeps this >= 4.5. */
export function heroContrast(color: string, color2: string | null): number {
  const fills = [color, ...(color2 ? [color2] : [])];
  const on = onColors(fills);
  return Math.min(...fills.map((f) => contrast(f, on)));
}

/**
 * CSS custom properties for the player root (`.lv-ptheme`, src/ui/player-theme.css). Only `--pt-*` names: the
 * stylesheet maps them onto the LunchVoice tokens inside the player, so no global token changes. For a gradient,
 * `--pt-hero` is the gradient and `--pt-on` is picked against BOTH ends; buttons, links and question screens use the
 * solid primary color.
 */
export function themeVars(color: string | null, opts: { color2?: string | null; angle?: number } = {}): Record<string, string> | undefined {
  const c = normalizeHex(color);
  if (!c) return undefined;
  const accent = ensureContrast(c, WHITE, AA_TEXT); // defensive: stored colors already pass
  const second = normalizeHex(opts.color2 ?? null);
  const accent2 = second ? ensureContrast(second, WHITE, AA_TEXT) : null;
  const text = ensureContrast(accent, LIGHT_PAGE, AA_TEXT);
  const accentDark = ensureContrast(accent, DARK_PAGE, AA_UI);
  const textDark = ensureContrast(accent, DARK_SURFACE, AA_TEXT);
  const fills = accent2 ? [accent, accent2] : [accent];
  return {
    "--pt-accent": accent,
    "--pt-on": onColors(fills),
    "--pt-hero": accent2 ? gradientCss(accent, accent2, opts.angle ?? 135) : accent,
    "--pt-text": text,
    "--pt-accent-dark": accentDark,
    "--pt-on-dark": onColor(accentDark),
    "--pt-text-dark": textDark,
  };
}

/** Pure HSV <-> hex, for the color picker. h 0..360, s and v 0..1. */
export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const [r, g, b] = rgb(hex).map((x) => x / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return toHex([f(5) * 255, f(3) * 255, f(1) * 255]);
}

/** Curated colors, all readable on white at 4.5:1 (unit-tested). The first group is LunchVoice's own palette. */
export const PRESET_COLORS: { hex: string; name: string }[] = [
  { hex: "#14110f", name: "LunchVoice ink" },
  { hex: "#4338ca", name: "Indigo" },
  { hex: "#1d4ed8", name: "Blue" },
  { hex: "#0e7490", name: "Cyan" },
  { hex: "#0f766e", name: "Teal" },
  { hex: "#15803d", name: "Green" },
  { hex: "#b45309", name: "Amber" },
  { hex: "#be123c", name: "Rose" },
  { hex: "#6d28d9", name: "Violet" },
  { hex: "#a21caf", name: "Fuchsia" },
  { hex: "#9a3412", name: "Rust" },
  { hex: "#334155", name: "Slate" },
];
export const GRADIENT_PRESETS: { key: string; label: string; from: string; to: string; angle: GradientAngle }[] = [
  { key: "lagoon", label: "Lagoon", from: "#0f766e", to: "#1d4ed8", angle: 135 },
  { key: "dusk", label: "Dusk", from: "#4338ca", to: "#be123c", angle: 135 },
  { key: "meadow", label: "Meadow", from: "#15803d", to: "#0e7490", angle: 180 },
  { key: "ember", label: "Ember", from: "#9a3412", to: "#be123c", angle: 135 },
  { key: "berry", label: "Berry", from: "#6d28d9", to: "#a21caf", angle: 90 },
  { key: "harbor", label: "Harbor", from: "#334155", to: "#4338ca", angle: 180 },
];

/** Recently used colors: local to this browser, newest first. */
const RECENT_KEY = "lv.brand.recent";
export function loadRecent(storage: Pick<Storage, "getItem"> | null = safeStorage()): string[] {
  try {
    const v = JSON.parse(storage?.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.map((x) => normalizeHex(String(x))).filter((x): x is string => Boolean(x)).slice(0, 8) : [];
  } catch { return []; }
}
export function pushRecent(hex: string, storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()): string[] {
  const c = normalizeHex(hex);
  const next = c ? [c, ...loadRecent(storage).filter((x) => x !== c)].slice(0, 8) : loadRecent(storage);
  try { storage?.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* private mode: recents just don't persist */ }
  return next;
}
function safeStorage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
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
  if (b.style === "gradient") {
    if (!b.color2 || (!b.color && !b.follow_hub)) return "A gradient needs two colors.";
    if (!checkBrandColor(b.color2).ok) return "The second color is too light for text on a gradient. Use the suggested darker shade.";
  }
  if (b.follow_hub && !isHubCampaign) return "Only a Hub Campaign can follow its Hub's color.";
  if ((b.welcome_headline ?? "").length > HEADLINE_MAX) return `Keep the welcome headline to ${HEADLINE_MAX} characters.`;
  if ((b.thank_you ?? "").length > THANKS_MAX) return `Keep the thank-you message to ${THANKS_MAX} characters.`;
  return null;
}
