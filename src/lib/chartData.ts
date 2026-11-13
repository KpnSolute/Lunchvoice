// Pure helpers between the results API and the Lv chart components. They never total, average or fill in a number the
// server did not give: withheld stays null, and a finding is only worded from released counts.
import type { Cell, QuestionKind, TrendPoint } from "./lvApi";

export interface Datum { key: string; label: string; n: number | null; suppressed: boolean }

export function answerLabel(kind: string, key: string): string {
  if (kind === "yes_no") return key === "true" ? "Yes" : key === "false" ? "No" : key;
  if (kind === "rating") return `${key} ★`;
  return key;
}

/** API cells to chart data. The merged withheld bucket keeps its place as a withheld datum. */
export function toData(kind: string, cells: Cell[]): Datum[] {
  return cells.map((c, i) => ({
    key: c.key ?? `withheld-${i}`,
    label: c.suppressed || c.key === null ? "Other answers" : answerLabel(kind, c.key),
    n: c.suppressed ? null : c.n,
    suppressed: c.suppressed || c.key === null,
  }));
}

const released = (d: Datum[]) => d.filter((x) => !x.suppressed && x.n !== null).sort((a, b) => (b.n ?? 0) - (a.n ?? 0));

/** A title that states the finding, from released counts only. Falls back to the question when nothing can be said. */
export function findingTitle(kind: string, prompt: string, data: Datum[], mean: number | null = null): string {
  if (data.some((d) => d.suppressed)) return `${prompt}`;
  const r = released(data);
  if (r.length === 0) return prompt;
  if (kind === "rating") return mean === null ? prompt : `${prompt} Average ${mean.toFixed(1)} out of 5`;
  if (kind === "yes_no") {
    const yes = r.find((x) => x.key === "true")?.n ?? 0;
    const no = r.find((x) => x.key === "false")?.n ?? 0;
    return yes === no ? `${prompt} Yes and no are level` : `${prompt} ${yes > no ? "More said yes" : "More said no"}`;
  }
  const [a, b] = r;
  if (!a) return prompt;
  if (!b || (a.n ?? 0) > (b.n ?? 0)) return `${prompt} “${a.label}” leads`;
  return `${prompt} “${a.label}” and “${b.label}” are level`;
}

export function dataTable(caption: string, kind: string, data: Datum[]) {
  return {
    caption,
    headers: ["Answer", "Responses"],
    rows: data.map((d) => [d.suppressed ? "Other answers" : answerLabel(kind, d.key), d.suppressed || d.n === null ? "Withheld" : d.n] as (string | number)[]),
  };
}

export const TIME_BUCKET: Record<string, string> = { lt_1m: "Under 1 minute", "1_3m": "1 to 3 minutes", "3_10m": "3 to 10 minutes", gt_10m: "Over 10 minutes" };
export const DEVICE_LABEL: Record<string, string> = { mobile: "Phone", tablet: "Tablet", desktop: "Computer", unknown: "Not recorded" };
export const SOURCE_LABEL: Record<string, string> = { link: "Link", qr: "QR code", code: "Join code", discord: "Discord", unknown: "Not recorded" };

export function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/* ------------------------------------------------------------------ Trends */

export interface Change { text: string; direction: "up" | "down" | "flat" | "none" }

/** Change from the previous released run to this one. Never across a withheld run; never zero for withheld. */
export function trendChange(kind: QuestionKind | string, points: TrendPoint[], i: number, focus = "true"): Change {
  const cur = points[i];
  if (!cur || cur.state !== "released") return { text: cur?.state === "withheld" ? "Withheld" : "No data", direction: "none" };
  let prev: TrendPoint | undefined;
  for (let j = i - 1; j >= 0; j--) { if (points[j]!.state === "released") { prev = points[j]; break; } else if (points[j]!.state === "withheld") break; }
  if (!prev) return { text: "First run to compare", direction: "none" };
  if (kind === "rating") {
    const d = Math.round(((cur.mean ?? 0) - (prev.mean ?? 0)) * 100) / 100;
    return d === 0 ? { text: "No change", direction: "flat" } : { text: `${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(2)} stars`, direction: d > 0 ? "up" : "down" };
  }
  const a = cur.options?.find((o) => o.key === focus)?.share;
  const b = prev.options?.find((o) => o.key === focus)?.share;
  if (a == null || b == null) return { text: "Share not shown while any answer is withheld", direction: "none" };
  const d = Math.round((a - b) * 100);
  return d === 0 ? { text: "No change", direction: "flat" } : { text: `${d > 0 ? "+" : "−"}${Math.abs(d)} points`, direction: d > 0 ? "up" : "down" };
}

/** The option a choice question's change is measured on: yes for yes/no, else the leading released option of the latest run. */
export function focusOption(kind: string, points: TrendPoint[]): string | null {
  if (kind === "yes_no") return "true";
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i]!;
    if (p.state === "released" && !p.any_withheld && p.options?.length) {
      return [...p.options].sort((x, y) => (y.n ?? 0) - (x.n ?? 0))[0]!.key;
    }
  }
  return null;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}
