import type { Question } from "./lvApi";
import { sectionsOf } from "./sections";

// Pure helpers for the Creator studio rail.

/** Where a question lands (index in the same ordered list) when moved to the end of a section; null when it is already there or cannot move. */
export function moveToSectionTarget(qs: Question[], from: number, sectionIndex: number): number | null {
  const sections = sectionsOf(qs);
  const s = sections[sectionIndex];
  const q = qs[from];
  if (!s || !q || q.config.section) return null; // a question that starts a section is managed in the Section panel
  const end = s.start + s.questions.length - 1; // index of the section's last question
  const to = from <= end ? end : end + 1;
  return to === from ? null : to;
}

/** Sections a question can be moved into: every section but the one it is already last in, never for a section-start question. */
export function moveTargets(qs: Question[], from: number): { index: number; title: string; to: number }[] {
  const out: { index: number; title: string; to: number }[] = [];
  sectionsOf(qs).forEach((s, i) => {
    const to = moveToSectionTarget(qs, from, i);
    if (to !== null) out.push({ index: i, title: s.title || (i === 0 ? "Start" : `Section ${i + 1}`), to });
  });
  return out;
}

/** The config a duplicate keeps: what the question asks, not where it sits (no section start, no rules). */
export function duplicateConfig(q: Pick<Question, "config">): Question["config"] {
  const { section: _s, show_if: _w, jumps: _j, ...rest } = q.config;
  return rest;
}

export const duplicatePrompt = (prompt: string): string => {
  const copy = `${prompt} (copy)`;
  return copy.length > 200 ? prompt.slice(0, 193) + " (copy)" : copy;
};
