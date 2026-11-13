import type { Cell, Question } from "./lvApi";

// Helpers for Present mode (live results on a big screen). Pure, so they are unit tested.
// Withheld is never zero: a cell that is suppressed keeps `n: null` and is never turned into a number here.

export const POLL_MS = 4000;

export interface Bar { key: string; label: string; n: number | null; pct: number | null }

/** One bar per answer. Percent only when nothing is withheld, because a share of a hidden total would be a guess. */
export function barsFor(q: Pick<Question, "kind" | "config">, cells: Cell[], withheld: boolean): { bars: Bar[]; total: number | null; average: number | null } {
  const anySuppressed = withheld || cells.some((c) => c.suppressed || c.n === null);
  const byKey = new Map<string, number>();
  for (const c of cells) if (!c.suppressed && c.n !== null && c.key !== null) byKey.set(c.key, (byKey.get(c.key) ?? 0) + c.n);
  const keys: { key: string; label: string }[] =
    q.kind === "yes_no" ? [{ key: "true", label: "Yes" }, { key: "false", label: "No" }]
    : q.kind === "rating" ? [1, 2, 3, 4, 5].map((n) => ({ key: String(n), label: `${n} ★` }))
    : (q.config.options ?? []).map((o) => ({ key: o, label: o }));
  // An answer that was released but is no longer an option (an old revision) still shows.
  for (const k of byKey.keys()) if (!keys.some((x) => x.key === k)) keys.push({ key: k, label: k });
  const total = anySuppressed ? null : [...byKey.values()].reduce((s, n) => s + n, 0);
  const bars: Bar[] = keys.map(({ key, label }) => {
    const n = anySuppressed && !byKey.has(key) ? null : byKey.get(key) ?? 0;
    return { key, label, n, pct: total && n !== null ? Math.round((n / total) * 100) : total === 0 ? 0 : null };
  });
  let average: number | null = null;
  if (q.kind === "rating" && total) average = Math.round((bars.reduce((s, b) => s + Number(b.key) * (b.n ?? 0), 0) / total) * 10) / 10;
  return { bars, total, average };
}

const STOP = new Set("a an and are as at be but by for from has have he her his i in is it its me my of on or our she so that the their them they this to was we were what when which who will with you your".split(" "));

/** Words for a cloud: lower-cased, no stop words or one-letter words, most frequent first, capped. */
export function wordCloud(texts: string[], max = 40): { word: string; n: number }[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    for (const w of t.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []) {
      if (w.length < 2 || STOP.has(w)) continue;
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }
  return [...counts].map(([word, n]) => ({ word, n })).sort((a, b) => b.n - a.n || a.word.localeCompare(b.word)).slice(0, max);
}

/** Scale a word's frequency to a font size between min and max (rem). */
export function cloudSize(n: number, top: number, min = 1.1, max = 3.4): number {
  if (top <= 1) return (min + max) / 2;
  return Math.round((min + ((max - min) * (n - 1)) / (top - 1)) * 100) / 100;
}

/** "Ana, Jordan and Sam" from the newest names; at most `max`, no repeats, blanks dropped. */
export function justAnswered(names: (string | null)[], max = 3): string {
  const seen: string[] = [];
  for (const n of names) if (n && !seen.includes(n)) seen.push(n);
  const list = seen.slice(0, max);
  return list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** The short link people can type. */
export function shortLink(host: string, joinCode: string): string {
  return `${host}/c/${joinCode}`;
}
