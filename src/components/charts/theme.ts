// Chart colours are existing --lv-* tokens only (no new colour): grey first, LunchVoice amber as the single accent.
// SVG attributes accept var(), so light, dark and high-contrast follow the page theme with no JavaScript.
export const CHART = {
  grey: "var(--lv-subtle)",
  greyLight: "var(--lv-line)",
  accent: "var(--lv-accent)",
  accentDeep: "var(--lv-accent-deep)",
  text: "var(--lv-text)",
  muted: "var(--lv-muted)",
  surface: "var(--lv-surface)",
} as const;

export const NUMBER_FONT = "var(--lv-font-mono)";
export const UI_FONT = "var(--lv-font-ui)";

/** Recharts animates by default; people who ask for reduced motion get a still chart. */
export function chartAnimates(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
