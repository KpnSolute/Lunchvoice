// Linked Questions (000042): question-level "show only if", skip to / end survey, answer piping and random order.
// The server (lv.validate_answers, lv.logic_rules_problem) is the authority; this file mirrors it exactly so the
// player walks the same path, the builder explains broken rules before publishing, and the dev mock agrees.
//
// The walk (same as lv.logic_walk_obj): questions in position order. A section rule (000041) covers every question
// to the next section start. A question is shown when it is not skipped over, the survey has not ended, its section
// rule is met and its own show_if is met. Rules only read answers to questions already shown (hidden answers never
// count). After a shown, answered question, a matching jump skips forward to its target or ends the survey.
import type { LogicCondition, LogicJump, LogicRule, Question, QuestionConfig, SectionRule } from "./lvApi";

export type Answers = Record<string, unknown>;

const byPosition = (qs: Question[]) => [...qs].sort((a, b) => a.position - b.position);

export const isEmptyAnswer = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** Answer keys a rule or jump can match: options for choice kinds, "true"/"false" for yes/no, null otherwise.
 *  Mirrors lv.kind_options; new kinds with discrete options plug in here and there. */
export function answerKeys(q: Pick<Question, "kind" | "config"> | undefined): string[] | null {
  if (!q) return null;
  if (q.kind === "yes_no") return ["true", "false"];
  if (q.kind === "single_choice" || q.kind === "multi_choice" || Array.isArray(q.config?.options) && !["rating", "text"].includes(q.kind)) return (q.config.options as string[] | undefined) ?? [];
  return null;
}
/** Kinds whose single answer can drive a jump (lv.kind_allows_jumps). */
export const allowsJumps = (kind: string) => kind === "single_choice" || kind === "yes_no";
export const isRatingKind = (kind: string) => kind === "rating";
export const ratingRange = (q: Pick<Question, "config"> | undefined): [number, number] => {
  const c = q?.config as { min?: unknown; max?: unknown } | undefined;
  return [typeof c?.min === "number" ? c.min : 1, typeof c?.max === "number" ? c.max : 5];
};
export const keyLabel = (q: Pick<Question, "kind"> | undefined, k: string) => (q?.kind === "yes_no" ? (k === "true" ? "Yes" : k === "false" ? "No" : k) : k);

/** lv.answer_matches: does an answer hit any of these keys? Arrays (multi choice) match on any element. */
export function answerMatches(v: unknown, anyOf: string[]): boolean {
  if (isEmptyAnswer(v)) return false;
  if (Array.isArray(v)) return v.some((x) => anyOf.includes(String(x)));
  return anyOf.includes(String(v));
}

/** lv.condition_met. An unanswered (or hidden) source never meets a condition, "is none of" included. */
export function conditionMet(c: LogicCondition, answers: Answers): boolean {
  const v = answers[c.question_id];
  if (isEmptyAnswer(v)) return false;
  switch (c.op) {
    case "any_of": return answerMatches(v, c.values ?? []);
    case "none_of": return !answerMatches(v, c.values ?? []);
    case "at_least": return typeof v === "number" && v >= (c.min ?? Infinity);
    case "at_most": return typeof v === "number" && v <= (c.max ?? -Infinity);
    case "between": return typeof v === "number" && v >= (c.min ?? Infinity) && v <= (c.max ?? -Infinity);
    default: return false;
  }
}

export function logicRuleMet(rule: LogicRule | null | undefined, answers: Answers): boolean {
  if (!rule || !rule.conditions?.length) return true;
  return rule.match === "any" ? rule.conditions.some((c) => conditionMet(c, answers)) : rule.conditions.every((c) => conditionMet(c, answers));
}

const sectionRuleMet = (r: SectionRule | null | undefined, eff: Answers) => !r || answerMatches(eff[r.question_id], r.any_of);

export interface Walk { visible: Question[]; ended: boolean; /** answers to shown questions only: what gets sent */ answers: Answers }

/** The path one person takes, given their answers. Mirrors lv.logic_walk_obj. */
export function walk(questions: Question[], answers: Answers): Walk {
  const eff: Answers = {};
  const visible: Question[] = [];
  const qs = byPosition(questions);
  let sec: SectionRule | null = null;
  let skipTo: number | null = null;
  let ended = false;
  for (const q of qs) {
    if (q.config?.section) sec = q.config.section.show_if ?? null;
    if (ended) continue;
    if (skipTo !== null && q.position < skipTo) continue;
    skipTo = null;
    if (!sectionRuleMet(sec, eff) || !logicRuleMet(q.config?.show_if, eff)) continue;
    visible.push(q);
    const v = answers[q.question_id];
    if (isEmptyAnswer(v)) continue;
    eff[q.question_id] = v;
    if (Array.isArray(v)) continue;
    const j = (q.config?.jumps ?? []).find((x) => x.when === String(v));
    if (!j) continue;
    if (j.to === "end") ended = true;
    else {
      const t = qs.find((x) => x.question_id === j.to);
      if (t && t.position > q.position) skipTo = t.position;
    }
  }
  return { visible, ended, answers: eff };
}

export const usesLogic = (questions: Question[]) =>
  questions.some((q) => !!q.config?.show_if || (q.config?.jumps?.length ?? 0) > 0 || !!q.config?.shuffle || !!q.config?.section?.shuffle || pipeRefs(q).length > 0);

/* ------------------------------------------------------------------ piping */

const PIPE = /\{\{q:([0-9a-zA-Z-]+)(?:\|([^}]*))?\}\}/g;
export const PIPE_FALLBACK = "your earlier answer";

export function pipeToken(questionId: string, fallback?: string) {
  return `{{q:${questionId}${fallback ? `|${fallback.replace(/[{}|]/g, "")}` : ""}}}`;
}
/** Question ids piped into a question's prompt or options. */
export function pipeRefs(q: Pick<Question, "prompt" | "config">): string[] {
  const texts = [q.prompt, ...((q.config?.options as string[] | undefined) ?? [])];
  return [...new Set(texts.flatMap((t) => [...String(t ?? "").matchAll(PIPE)].map((m) => m[1]!)))];
}
function answerText(q: Question | undefined, v: unknown): string {
  if (Array.isArray(v)) return v.map(String).join(", ");
  if (q?.kind === "yes_no") return v === true ? "Yes" : v === false ? "No" : String(v);
  return String(v);
}
/** Replaces {{q:id}} with this person's earlier answer, or the fallback (visible, never blank). Display only:
 *  piped text is never sent or stored. */
export function pipe(text: string, questions: Question[], answers: Answers): string {
  return text.replace(PIPE, (_m, id: string, fb?: string) => {
    const v = answers[id];
    return isEmptyAnswer(v) ? (fb?.trim() || PIPE_FALLBACK) : answerText(questions.find((q) => q.question_id === id), v);
  });
}
/** For the builder: shows {{q:id}} as “[Q3]”. */
export function pipeLabel(text: string, questions: Question[]): string {
  const n = numbering(questions);
  return text.replace(PIPE, (_m, id: string) => `[Q${n.get(id) ?? "?"}]`);
}

/* ------------------------------------------------------------------ random order */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** A stable shuffle: the same seed always gives the same order, so Back and reloads never reorder. */
export function seededShuffle<T>(items: T[], seed: string, key: (t: T) => string): T[] {
  return [...items].map((t) => [hash(`${seed}:${key(t)}`), t] as const).sort((a, b) => a[0] - b[0]).map(([, t]) => t);
}
export function displayOptions(q: Question, seed: string): string[] {
  const opts = (q.config?.options as string[] | undefined) ?? [];
  if (!q.config?.shuffle || opts.length < 2) return opts;
  const fixed = q.config.keep_last ? opts.slice(-1) : [];
  return [...seededShuffle(q.config.keep_last ? opts.slice(0, -1) : opts, `${seed}:${q.question_id}`, (o) => o), ...fixed];
}
/** Sections (with their questions) in order; a section marked shuffle shows its questions in a stable random order. */
export function displayOrder(visible: Question[], all: Question[], seed: string): Question[] {
  const secOf = sectionIndex(all);
  const out: Question[] = [];
  let i = 0;
  while (i < visible.length) {
    const s = secOf.get(visible[i]!.question_id);
    let j = i;
    while (j < visible.length && secOf.get(visible[j]!.question_id) === s) j++;
    const group = visible.slice(i, j);
    const start = byPosition(all).find((q) => secOf.get(q.question_id) === s && q.config?.section);
    out.push(...(start?.config?.section?.shuffle ? seededShuffle(group, `${seed}:sec:${s}`, (q) => q.question_id) : group));
    i = j;
  }
  return out;
}
/** Section number per question (0 = before the first section). */
export function sectionIndex(questions: Question[]): Map<string, number> {
  const m = new Map<string, number>();
  let s = 0;
  for (const q of byPosition(questions)) { if (q.config?.section) s++; m.set(q.question_id, s); }
  return m;
}

/* ------------------------------------------------------------------ builder: words, checks, paths */

export function numbering(questions: Question[]): Map<string, number> {
  return new Map(byPosition(questions).map((q, i) => [q.question_id, i + 1]));
}

function list(xs: string[], word: string) {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${word} ${xs[xs.length - 1]}`;
}

/** Compact words for one condition, e.g. “Q1: Corporate, Leadership” or “Q3 is 4 or more”. */
export function describeCondition(c: LogicCondition, questions: Question[]): string {
  const t = questions.find((q) => q.question_id === c.question_id);
  const n = numbering(questions).get(c.question_id);
  const ref = t ? `Q${n}` : "a removed question";
  const vals = (c.values ?? []).map((v) => keyLabel(t, v));
  switch (c.op) {
    case "any_of": return `${ref}: ${vals.join(", ")}`;
    case "none_of": return `${ref}: not ${list(vals, "or")}`;
    case "at_least": return `${ref} is ${c.min} or more`;
    case "at_most": return `${ref} is ${c.max} or less`;
    case "between": return `${ref} is ${c.min} to ${c.max}`;
    default: return ref;
  }
}
/** The tag on a question card: “Shown if Q1: Corporate, Leadership”. */
export function describeLogicRule(rule: LogicRule, questions: Question[]): string {
  return `Shown if ${rule.conditions.map((c) => describeCondition(c, questions)).join(rule.match === "any" ? " or " : " and ")}`;
}
export function describeJump(j: LogicJump, q: Question, questions: Question[]): string {
  const n = numbering(questions);
  return `${keyLabel(q, j.when)} → ${j.to === "end" ? "end of survey" : `Q${n.get(j.to) ?? "?"}`}`;
}

/** The checks publishing makes on the server (lv.logic_rules_problem), in plain sentences. Null when fine. */
export function logicProblem(questions: Question[]): string | null {
  const qs = byPosition(questions);
  const n = numbering(qs);
  const sec = sectionIndex(qs);
  const shuffled = new Set(qs.filter((q) => q.config?.section?.shuffle).map((q) => sec.get(q.question_id)));
  const firstOf = new Map<number, string>();
  for (const q of qs) { const s = sec.get(q.question_id)!; if (!firstOf.has(s)) firstOf.set(s, q.question_id); }
  for (const q of qs) {
    const name = `Question ${n.get(q.question_id)}`;
    const mySec = sec.get(q.question_id)!;
    const back = (id: string, what: string): string | null => {
      const t = qs.find((x) => x.question_id === id);
      if (!t) return `${name} ${what} a question that no longer exists.`;
      if (t.position >= q.position) return `${name} ${what} a later question. Logic can only look back.`;
      if (shuffled.has(mySec) && sec.get(id) === mySec) return `${name} ${what} a question in the same random-order section. Turn off random order or move one of them.`;
      return null;
    };
    const rule = q.config?.show_if;
    if (rule) {
      if (!rule.conditions?.length) return `${name} has a “show only if” rule with no conditions.`;
      for (const c of rule.conditions) {
        const bad = back(c.question_id, "depends on");
        if (bad) return bad;
        const t = qs.find((x) => x.question_id === c.question_id)!;
        if (c.op === "any_of" || c.op === "none_of") {
          const keys = answerKeys(t);
          if (!keys) return `${name} depends on a question people cannot pick an answer for.`;
          if (!c.values?.length) return `${name}: pick at least one answer for its rule.`;
          if (c.values.some((v) => !keys.includes(v))) return `${name} matches an answer that is not an option any more.`;
        } else {
          if (!isRatingKind(t.kind)) return `${name} compares a number on a question that is not a rating.`;
          const [lo, hi] = ratingRange(t);
          const vs = [c.op !== "at_most" ? c.min : undefined, c.op !== "at_least" ? c.max : undefined].filter((x) => x !== undefined) as number[];
          if (vs.some((x) => !Number.isInteger(x) || x < lo || x > hi)) return `${name} compares with a rating outside ${lo} to ${hi}.`;
          if (c.op === "between" && (c.min ?? 0) > (c.max ?? 0)) return `${name}: the lower rating must not be above the higher one.`;
        }
      }
    }
    const jumps = q.config?.jumps ?? [];
    if (jumps.length) {
      if (!allowsJumps(q.kind)) return `${name} can only skip on a single-choice or yes/no answer.`;
      if (shuffled.has(mySec)) return `${name} is in a random-order section, which cannot have skip logic inside it.`;
      const keys = answerKeys(q) ?? [];
      for (const j of jumps) {
        if (!keys.includes(j.when)) return `${name} skips on an answer that is not an option any more.`;
        if (j.to === "end") continue;
        return `${name} can only end the survey on an answer for now.`; // skip-to ships in a later release
      }
    }
    for (const id of pipeRefs(q)) { const bad = back(id, "pipes in an answer from"); if (bad) return bad; }
    if (q.config?.keep_last && !q.config?.shuffle) return `${name} keeps the last option fixed but does not shuffle options.`;
  }
  return null;
}

/** Every distinct way through the survey (bounded), for the path preview and the welcome screen. */
export function pathLengths(questions: Question[], cap = 4000): { min: number; max: number; paths: number; exact: boolean } {
  const qs = byPosition(questions);
  const drivers = new Set<string>();
  for (const q of qs) {
    q.config?.show_if?.conditions?.forEach((c) => drivers.add(c.question_id));
    if (q.config?.section?.show_if) drivers.add(q.config.section.show_if.question_id);
    if (q.config?.jumps?.length) drivers.add(q.question_id);
  }
  const choices = (q: Question): unknown[] => {
    const out: unknown[] = [];
    if (q.kind === "yes_no") out.push(true, false);
    else if (q.kind === "multi_choice") { const o = q.config.options ?? []; out.push(...o.map((x) => [x]), o); }
    else if (isRatingKind(q.kind)) { const [lo, hi] = ratingRange(q); for (let i = lo; i <= hi; i++) out.push(i); }
    else out.push(...(answerKeys(q) ?? ["x"]));
    if (q.config?.optional) out.push(undefined);
    return out;
  };
  let min = Infinity, max = 0, paths = 0, exact = true;
  const lengths = new Set<string>();
  const go = (answers: Answers) => {
    if (paths >= cap) { exact = false; return; }
    const w = walk(qs, answers);
    const next = w.visible.find((q) => drivers.has(q.question_id) && !(q.question_id in answers));
    if (!next) {
      const key = w.visible.map((q) => q.question_id).join(",");
      if (!lengths.has(key)) { lengths.add(key); paths++; }
      min = Math.min(min, w.visible.length); max = Math.max(max, w.visible.length);
      return;
    }
    for (const v of choices(next)) go({ ...answers, [next.question_id]: v });
  };
  go({});
  return { min: min === Infinity ? 0 : min, max, paths, exact };
}

/** A copy of a config without the logic keys (used when a question kind changes and its logic no longer fits). */
export function withoutLogic(c: QuestionConfig): QuestionConfig {
  const { show_if: _s, jumps: _j, shuffle: _sh, keep_last: _k, ...rest } = c;
  return rest;
}
