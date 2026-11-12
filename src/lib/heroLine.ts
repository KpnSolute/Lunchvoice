// The home page headline is one of two approved lines (founder decision, 2026-11-12). Each device is given one at
// random on its first visit and keeps it, so returning visitors always see the same line and the two can be compared.
// "Make every voice count." is the brand tagline used everywhere else; "Every voice has a story." is a home-page line.
export interface HeroLine {
  id: "count" | "story";
  /** The words before the amber part. */
  lead: string;
  /** The amber part. */
  accent: string;
}

export const HERO_LINES: readonly HeroLine[] = [
  { id: "count", lead: "Make every voice", accent: "count." },
  { id: "story", lead: "Every voice has a story.", accent: "Hear it." },
];

export const HERO_LINE_KEY = "lv.heroLine";

type Store = Pick<Storage, "getItem" | "setItem">;

/**
 * The line for this device. Reads the saved choice; if there is none (or it is not a current line), picks one at random
 * and saves it. Storage can be missing or throw (private modes, blocked cookies): then a line is picked for this visit
 * only, and the page still works.
 */
export function heroLineFor(store: Store | null | undefined, random: () => number = Math.random): HeroLine {
  try {
    const saved = store?.getItem(HERO_LINE_KEY);
    const found = HERO_LINES.find((l) => l.id === saved);
    if (found) return found;
  } catch { /* storage unavailable */ }
  const pick = HERO_LINES[Math.min(HERO_LINES.length - 1, Math.floor(random() * HERO_LINES.length))];
  try { store?.setItem(HERO_LINE_KEY, pick.id); } catch { /* storage unavailable */ }
  return pick;
}

/** The browser's localStorage, or null where reading it throws. */
export function deviceStore(): Store | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}
