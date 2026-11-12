// Brand facts shared by the build and the checks: the tagline, the platform sizes, and the colour specification, which
// is computed from src/ui/tokens.css so the document cannot drift from the product.

/** The tagline (founder decision, 2026-11-12): logos, social, video, link previews and search results. */
export const TAGLINE = "Make every voice count.";
/**
 * The home page headline rotates per device between the tagline and a second approved line (founder decision,
 * 2026-11-12, later the same day). The second line is for the home page headline only. Source: src/lib/heroLine.ts.
 */
export const HOME_LINES = [TAGLINE, "Every voice has a story. Hear it."];
export const SITE = "lunchvoice.com";
/** Lines that must never appear in a current asset. */
export const RETIRED_LINES = ["SMART FEEDBACK", "BETTER CAFETERIAS"];

/**
 * Platform sizes and safe areas, checked on 2026-11-12 against current platform guidance (see
 * brand/lv-package/documentation/SOCIAL_SPECS.md for the sources). Platforms change these: recheck before a campaign.
 */
export const SOCIAL = [
  { id: "instagram-profile", w: 1080, h: 1080, kind: "avatar", note: "Shown as a circle; the symbol sits well inside it." },
  { id: "instagram-square", w: 1080, h: 1080, layout: "stack", safe: { x: 135, y: 0, w: 810, h: 1080 }, safeLabel: "Profile grid crop (3:4)" },
  { id: "instagram-portrait", w: 1080, h: 1350, layout: "stack", safe: { x: 34, y: 0, w: 1012, h: 1350 }, safeLabel: "Profile grid crop (3:4)" },
  { id: "instagram-reel", w: 1080, h: 1920, layout: "centre", safe: { x: 60, y: 250, w: 900, h: 1420 }, safeLabel: "Clear of the app's buttons and captions" },
  { id: "youtube-shorts", w: 1080, h: 1920, layout: "centre", safe: { x: 60, y: 250, w: 900, h: 1420 }, safeLabel: "Clear of the app's buttons and captions" },
  { id: "youtube-thumbnail", w: 1280, h: 720, layout: "stack", safe: { x: 0, y: 0, w: 1280, h: 620 }, safeLabel: "Above the duration badge" },
  { id: "youtube-banner", w: 2560, h: 1440, layout: "strip", safe: { x: 507, y: 508, w: 1546, h: 423 }, safeLabel: "Visible on every device (1546 x 423)" },
  { id: "linkedin-banner", w: 1128, h: 191, layout: "strip", safe: { x: 250, y: 0, w: 858, h: 191 }, safeLabel: "Clear of the page logo" },
  { id: "facebook-cover", w: 851, h: 315, layout: "stack", safe: { x: 105, y: 0, w: 640, h: 315 }, safeLabel: "Visible on phones (640 wide)" },
  { id: "presentation", w: 1920, h: 1080, layout: "stack" },
];

/* ------------------------------------------------------------------ colour maths */

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
}
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
}
const lum = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG 2 contrast ratio, rounded down to one decimal so a ratio is never overstated. */
export function contrast(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return Math.floor(((hi + 0.05) / (lo + 0.05)) * 10) / 10;
}

/** Colour tokens per theme, read from tokens.css (only plain hex values; shadows and mixes are not colours). */
export function readThemes(css) {
  const block = (sel) => {
    const at = css.indexOf(sel);
    const open = css.indexOf("{", at);
    const close = css.indexOf("\n}", open);
    const out = {};
    for (const m of css.slice(open, close).matchAll(/--lv-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[m[1]] = m[2].toUpperCase();
    return out;
  };
  return { light: block(":root,\n[data-theme='light']"), dark: block("[data-theme='dark'] {"), hc: block("[data-theme='hc'] {") };
}

const ROLES = [
  ["accent", "Amber", "The one strong colour: the primary button, fills, icons, the logo's bubble and smile. Never body text on a light surface."],
  ["accent-deep", "Deep amber", "Hover and pressed amber, selected outlines, small icons that need more weight."],
  ["accent-light", "Light amber", "Amber on dark surfaces where more lift is needed; focus ring in the dark theme."],
  ["accent-text", "Amber text", "Amber-coloured text and links. Use this, not Amber, whenever amber has to be read."],
  ["text", "Ink (text)", "Text, the logo's letters, ink bands and the header on the home page."],
  ["on-primary", "Bone", "Text and the logo's letters on ink."],
  ["page", "Page", "The page background."],
  ["surface", "Surface", "Cards, fields, menus."],
  ["surface2", "Surface 2", "A second, quieter surface."],
  ["well", "Well", "Inset areas: icon tiles, code, tracks."],
  ["muted", "Muted text", "Supporting text."],
  ["subtle", "Subtle text", "Captions, placeholders, the least important text that still has to be read."],
  ["line", "Line", "Hairline borders and dividers. Not for text."],
  ["success", "Success", "Success fills and icons."],
  ["success-ink", "Success text", "Success text and ticks."],
  ["danger", "Danger", "Destructive buttons and error fills."],
  ["danger-ink", "Danger text", "Error text."],
  ["focus", "Focus", "The focus ring."],
];

const fmt = (hex) => { const rgb = hexToRgb(hex); const [h, s, l] = rgbToHsl(rgb); return `\`${hex}\` | ${rgb.join(", ")} | ${h}, ${s}%, ${l}%`; };
const verdict = (r) => (r >= 7 ? "AAA" : r >= 4.5 ? "AA" : r >= 3 ? "AA large text and icons only" : "Fails for text");

export function colorSpecMarkdown(css) {
  const t = readThemes(css);
  const L = t.light, D = t.dark, H = t.hc;
  const brand = [
    ["Amber", L.accent, "Ink", "Accent. Fills, the primary button, the logo's bubble and smile."],
    ["Ink", L.text, "Bone or white", "Anchor. Text, the logo's letters, dark bands."],
    ["Bone", L["on-primary"], "Ink", "Text and logo letters on ink; a warm light background in marketing."],
    ["Page", L.page, "Ink", "The neutral page background."],
    ["White", L.surface, "Ink", "Cards and surfaces; the dots in the logo's bubble."],
  ];
  const pairs = [
    ["Ink on Page", L.text, L.page], ["Ink on White", L.text, L.surface], ["Ink on Bone", L.text, L["on-primary"]], ["Ink on Amber", L.text, L.accent],
    ["Bone on Ink", L["on-primary"], L.text], ["White on Ink", "#FFFFFF", L.text], ["Amber on Ink", L.accent, L.text], ["Light amber on Ink", L["accent-light"], L.text],
    ["Amber on White", L.accent, L.surface], ["Amber on Page", L.accent, L.page], ["White on Amber", "#FFFFFF", L.accent],
    ["Amber text on White", L["accent-text"], L.surface], ["Amber text on Page", L["accent-text"], L.page],
    ["Muted text on Page", L.muted, L.page], ["Subtle text on Page", L.subtle, L.page], ["Subtle text on White", L.subtle, L.surface],
    ["Success text on White", L["success-ink"], L.surface], ["Danger text on White", L["danger-ink"], L.surface], ["White on Danger", "#FFFFFF", L.danger],
    ["Dark theme: text on page", D.text, D.page], ["Dark theme: muted on page", D.muted, D.page], ["Dark theme: subtle on surface", D.subtle, D.surface], ["Dark theme: amber text on page", D["accent-text"], D.page],
    ["Dark theme: ink on amber", D["on-accent"], D.accent],
  ];
  const lines = [];
  lines.push("# LunchVoice colour specification", "",
    "Generated by `npm run brand:build` from `src/ui/tokens.css`, which is the source of truth. Do not edit this file by hand, and do not introduce a colour that is not in it.", "",
    "Contrast ratios are WCAG 2 ratios, rounded down. Text needs 4.5:1 (3:1 for text of 24px and up, or 19px bold and up, and for icons and control outlines).", "",
    "## Brand colours", "", "| Name | HEX | RGB | HSL | Put on it | Use |", "| --- | --- | --- | --- | --- | --- |");
  for (const [n, hex, fg, use] of brand) lines.push(`| ${n} | ${fmt(hex)} | ${fg} | ${use} |`);
  lines.push("", "How they work together: ink anchors the identity, bone and the neutral page keep it calm, and amber is the accent. On any one screen or graphic, amber marks the single most important thing. It is never used for ordinary text on a light background: on white it measures " + contrast(L.accent, L.surface) + ":1.", "",
    "## Application tokens, by theme", "", "The product reads these names (`--lv-<token>`), never raw hex values. Light is the default; dark and high contrast redefine the same names.", "",
    "| Token | Role | Light | Dark | High contrast | Use |", "| --- | --- | --- | --- | --- | --- |");
  for (const [k, name, use] of ROLES) lines.push(`| \`--lv-${k}\` | ${name} | \`${L[k] ?? "—"}\` | \`${D[k] ?? "—"}\` | \`${H[k] ?? "—"}\` | ${use} |`);
  lines.push("", "Light theme values in full:", "", "| Token | HEX | RGB | HSL |", "| --- | --- | --- | --- |");
  for (const [k] of ROLES) if (L[k]) lines.push(`| \`--lv-${k}\` | ${fmt(L[k])} |`);
  lines.push("", "## Measured contrast", "", "| Combination | Foreground | Background | Ratio | Result |", "| --- | --- | --- | --- | --- |");
  for (const [n, fg, bg] of pairs) { const r = contrast(fg, bg); lines.push(`| ${n} | \`${fg}\` | \`${bg}\` | ${r}:1 | ${verdict(r)} |`); }
  lines.push("", "What this means in practice:", "",
    "- Amber on a light background fails for text and for thin icons. Use Amber text (`--lv-accent-text`) when amber has to be read, or put the amber on ink.",
    "- White text on amber fails. Text on amber is always ink.",
    "- The logo's amber bubble and smile are large filled shapes, not text, and are paired with ink or bone letters that carry the contrast.", "",
    "## Charts and data", "", "The product has no separate chart palette. Charts use ink (or bone in the dark theme) for bars, amber for the highlighted value, the well colour for tracks, and a striped ink and well pattern, never a colour alone, for a withheld result. A second data series should be told apart by pattern or label before a new colour is proposed.", "",
    "## Warning", "", "There is no warning colour token. Warning notices use the accent (amber) with ink text. Inside a Hub the accent becomes the Hub's own colour, so a warning there takes the Hub's colour: a known issue recorded for a founder decision, not something to patch with a new colour.", "",
    "## Changing a colour", "", "A new colour, or a new value for an existing one, needs founder approval (`docs/frontend/design-system/DESIGN_EXTENSIONS.md`). Nothing in this kit changed a value.", "");
  return lines.join("\n");
}
