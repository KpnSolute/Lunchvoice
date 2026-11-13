// Sections and "show only if" rules (000041). The server (lv.validate_answers) is the authority; this mirrors it so
// the player shows the right questions and the builder can explain a broken rule before publishing.
import type { Question, SectionRule } from "./lvApi";
import { logicProblem, pathLengths, walk } from "./logic";

export interface SectionView { start: number; title: string; description: string | null; rule: SectionRule | null; questions: Question[] }

const sorted = (qs: Question[]) => [...qs].sort((a, b) => a.position - b.position);

/** Splits questions into sections. Questions before the first section form an untitled leading section. */
export function sectionsOf(questions: Question[]): SectionView[] {
  const out: SectionView[] = [];
  sorted(questions).forEach((q, i) => {
    const s = q.config?.section;
    if (s || out.length === 0) {
      out.push({ start: i, title: s?.title ?? "", description: s?.description ?? null, rule: s?.show_if ?? null, questions: [] });
    }
    out[out.length - 1]!.questions.push(q);
  });
  return out;
}

export function ruleMet(rule: SectionRule | null | undefined, answers: Record<string, unknown>): boolean {
  if (!rule) return true;
  const v = answers[rule.question_id];
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v)) return v.some((x) => rule.any_of.includes(String(x)));
  return rule.any_of.includes(String(v));
}

/** The questions this person sees, in order, given the answers so far. Rules only look back, so earlier answers decide. */
// 000042: the full Linked Questions walk (sections, question rules, skips, end survey) lives in logic.ts.
export function visibleQuestions(questions: Question[], answers: Record<string, unknown>): Question[] {
  return walk(questions, answers).visible;
}

export function hasSections(questions: Question[]): boolean {
  return questions.some((q) => !!q.config?.section);
}

/** The same checks publishing makes on the server. Returns a plain sentence, or null. */
export function rulesProblem(questions: Question[]): string | null {
  const qs = sorted(questions);
  for (const q of qs) {
    const s = q.config?.section;
    if (!s?.show_if) continue;
    const t = qs.find((x) => x.question_id === s.show_if!.question_id);
    if (!t) return `Section “${s.title}” depends on a question that no longer exists.`;
    if (t.position >= q.position) return `Section “${s.title}” depends on a later question. Rules can only look back.`;
    if (!["single_choice", "multi_choice", "yes_no"].includes(t.kind)) return `Section “${s.title}” depends on a question people cannot pick an answer for.`;
    const allowed = t.kind === "yes_no" ? ["true", "false"] : (t.config.options ?? []);
    if (s.show_if.any_of.length === 0) return `Section “${s.title}” needs at least one answer to match.`;
    if (s.show_if.any_of.some((m) => !allowed.includes(m))) return `Section “${s.title}” matches an answer that is not an option any more.`;
  }
  return logicProblem(questions); // 000042
}

/** Plain words for a rule, e.g. “Shown when ‘What is your role?’ is Staff or Manager”. */
export function describeRule(rule: SectionRule, questions: Question[]): string {
  const t = questions.find((x) => x.question_id === rule.question_id);
  const label = (m: string) => (t?.kind === "yes_no" ? (m === "true" ? "Yes" : "No") : m);
  const order = t?.kind === "yes_no" ? ["true", "false"] : (t?.config.options ?? []);
  const names = [...rule.any_of].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(label);
  const list = names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return t ? `Shown when “${t.prompt}” is ${list}` : "Shown when a removed question matches";
}

/** How many questions one person answers at most (000042: every path through sections, rules and skips). */
export function longestPath(questions: Question[]): number {
  return pathLengths(questions).max;
}
