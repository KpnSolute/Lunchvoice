// Hub accent colours. The backend stores the accent as a palette KEY (lv.hubs.accent, 000015) and lv_hub_get returns
// the palette as objects ({ key, label, hex }) at the top level (`accents`). lv_hub_update(p_accent) accepts a key,
// or '' to clear. Every accent is contrast-safe with white text (000015: at least 4.5:1).
//
// ACCENTS mirrors lv.accent_palette() so places that only receive the key (Discover cards) can still paint it. The
// palette from lv_hub_get stays the source of truth where it is available.

export interface AccentOption {
  key: string;
  label: string;
  hex: string;
}

export const ACCENTS: AccentOption[] = [
  { key: "indigo", hex: "#4338CA", label: "Indigo" },
  { key: "blue", hex: "#1D4ED8", label: "Blue" },
  { key: "cyan", hex: "#0E7490", label: "Cyan" },
  { key: "teal", hex: "#0F766E", label: "Teal" },
  { key: "green", hex: "#15803D", label: "Green" },
  { key: "amber", hex: "#B45309", label: "Amber" },
  { key: "rose", hex: "#BE123C", label: "Rose" },
  { key: "violet", hex: "#6D28D9", label: "Violet" },
  { key: "slate", hex: "#334155", label: "Slate" },
];

const HEX = /^#[0-9a-f]{6}$/i;

/** Accept the palette in any shape the API has used (objects, or legacy hex strings) and return objects. */
export function normalizePalette(raw: unknown): AccentOption[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x): AccentOption[] => {
    if (x && typeof x === "object" && typeof (x as AccentOption).hex === "string" && typeof (x as AccentOption).key === "string") {
      const o = x as AccentOption;
      return HEX.test(o.hex) ? [{ key: o.key, hex: o.hex, label: o.label || o.key }] : [];
    }
    if (typeof x === "string" && HEX.test(x)) return [{ key: x, hex: x, label: x }];
    return [];
  });
}

/** The colour for an accent key (or a legacy hex value); null when the Hub has none. */
export function accentHex(value: string | null | undefined, palette: AccentOption[] = ACCENTS): string | null {
  if (!value) return null;
  if (HEX.test(value)) return value;
  return (palette.find((p) => p.key === value) ?? ACCENTS.find((p) => p.key === value))?.hex ?? null;
}

/** Ink or white text on an accent, whichever has more contrast (WCAG relative luminance). */
export function onAccent(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? "#14110f" : "#ffffff";
}

/** CSS custom properties that scope a Hub's accent to its own pages (never LunchVoice chrome). */
export function accentVars(hex: string | null): Record<string, string> | undefined {
  if (!hex) return undefined;
  return { "--hub-accent": hex, "--hub-on-accent": onAccent(hex) };
}
