// Publish readiness for the Campaign Studio and Quick Surveys. Pure and display-only: the backend re-validates on
// publish (lv_campaign_activate / lv_campaign_schedule) and its answer always wins. Messages are exact so people
// know what to fix; the section tells the Studio where to send them.

export type StudioSection = "details" | "questions" | "audience" | "schedule" | "review";

export interface ReadinessIssue {
  key: string;
  message: string;
  section: StudioSection;
}

export interface ReadinessQuestion {
  kind: string;
  prompt: string;
  config: { options?: string[]; max?: number; optional?: boolean } & Record<string, unknown>;
}

export interface ReadinessInput {
  title: string;
  questions: ReadinessQuestion[];
  /** "now" = publish immediately; otherwise the chosen start (ISO) or null if none picked yet. */
  start: { mode: "now" } | { mode: "at"; at: string | null };
  end: { mode: "none" } | { mode: "at"; at: string | null };
  /** Quick Surveys: the question limit from lv_my_context; null when not applicable. */
  questionLimit?: number | null;
  /** Server gate reasons (lv_campaign_get gate) already described for people. */
  gateMessages?: { key: string; message: string }[];
  /** 000041: the first broken section rule (src/lib/sections.ts rulesProblem), or null. */
  sectionProblem?: string | null;
  now?: number;
}

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 10;
export const isChoice = (kind: string) => kind === "single_choice" || kind === "multi_choice";

export function readiness(input: ReadinessInput): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const now = input.now ?? Date.now();
  if (!input.title.trim()) issues.push({ key: "title", message: "Add a title.", section: "details" });
  if (input.questions.length === 0) issues.push({ key: "questions", message: "Add at least one question.", section: "questions" });
  if (typeof input.questionLimit === "number" && input.questions.length > input.questionLimit) {
    const extra = input.questions.length - input.questionLimit;
    issues.push({ key: "too-many", message: `Quick Surveys have up to ${input.questionLimit} questions. Remove ${extra}.`, section: "questions" });
  }

  input.questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.prompt.trim()) issues.push({ key: `q${n}-prompt`, message: `Question ${n} needs a question text.`, section: "questions" });
    if (!isChoice(q.kind)) return;
    const raw = q.config.options ?? [];
    const options = raw.map((o) => o.trim());
    const filled = options.filter(Boolean);
    if (filled.length < MIN_OPTIONS) issues.push({ key: `q${n}-options`, message: `Question ${n} needs at least two options.`, section: "questions" });
    if (options.some((o) => !o)) issues.push({ key: `q${n}-empty`, message: `Question ${n} has an empty option.`, section: "questions" });
    if (filled.length > MAX_OPTIONS) issues.push({ key: `q${n}-many`, message: `Question ${n} has more than ${MAX_OPTIONS} options.`, section: "questions" });
    const seen = new Set<string>();
    if (filled.some((o) => { const k = o.toLowerCase(); if (seen.has(k)) return true; seen.add(k); return false; }))
      issues.push({ key: `q${n}-dupe`, message: `Question ${n} has the same option twice.`, section: "questions" });
    if (q.kind === "multi_choice" && typeof q.config.max === "number" && q.config.max > filled.length && filled.length >= MIN_OPTIONS)
      issues.push({ key: `q${n}-max`, message: `Question ${n} allows more choices than it has options.`, section: "questions" });
  });

  if (input.sectionProblem) issues.push({ key: "sections", message: input.sectionProblem, section: "questions" });

  const startAt = input.start.mode === "at" ? input.start.at : null;
  const endAt = input.end.mode === "at" ? input.end.at : null;
  if (input.start.mode === "at" && !startAt) issues.push({ key: "start", message: "Pick a start time, or choose Immediately.", section: "schedule" });
  if (input.end.mode === "at" && !endAt) issues.push({ key: "end", message: "Pick an end time, or choose No end.", section: "schedule" });
  if (endAt) {
    const end = new Date(endAt).getTime();
    const start = startAt ? new Date(startAt).getTime() : now;
    if (startAt && end <= start) issues.push({ key: "window", message: "The scheduled end time must be after the start time.", section: "schedule" });
    else if (end <= now) issues.push({ key: "end-past", message: "The scheduled end time must be in the future.", section: "schedule" });
  }

  for (const g of input.gateMessages ?? []) issues.push({ key: `gate-${g.key}`, message: g.message, section: "review" });
  return issues;
}
