// F6 (audit 2026-11-12): a visitor builds a Quick Survey before signing in. The draft lives in this browser only
// (localStorage) until they press Publish and sign in; then src/pages/SurveyDraft.tsx creates it on the server.
// Nothing is sent anywhere while it is only a draft.
import { questionConfigProblem, type Anonymity, type QuestionKind, type SurveyAccess } from "./lvApi";

export const DRAFT_KEY = "lv-survey-draft-v1";
export const MAX_DRAFT_QUESTIONS = 10;

export interface DraftQuestion {
  kind: QuestionKind;
  prompt: string;
  /** Choice questions only, one entry per option. */
  options?: string[];
  max?: number;
  optional?: boolean;
}

export interface SurveyDraft {
  title: string;
  access: SurveyAccess;
  anonymity: Anonymity;
  guests: boolean;
  questions: DraftQuestion[];
}

export const emptyDraft = (): SurveyDraft => ({ title: "", access: "link", anonymity: "anonymous", guests: true, questions: [] });

const isChoice = (k: QuestionKind) => k === "single_choice" || k === "multi_choice";
const KINDS: QuestionKind[] = ["rating", "single_choice", "multi_choice", "yes_no", "text"];

/** The config the API stores for one draft question (same shape as templateConfig). */
export function draftConfig(q: DraftQuestion): { options?: string[]; max?: number; optional?: true } {
  return {
    ...(isChoice(q.kind) ? { options: (q.options ?? []).map((o) => o.trim()).filter(Boolean) } : {}),
    ...(q.kind === "multi_choice" && q.max ? { max: q.max } : {}),
    ...(q.optional ? { optional: true as const } : {}),
  };
}

/** Why this draft cannot be published yet, in plain words, or null. The same rules the editor and the API apply. */
export function draftProblem(d: SurveyDraft): string | null {
  if (!d.title.trim()) return "Add a title.";
  if (d.questions.length === 0) return "Add at least one question.";
  if (d.questions.length > MAX_DRAFT_QUESTIONS) return `A Quick Survey has up to ${MAX_DRAFT_QUESTIONS} questions.`;
  for (const [i, q] of d.questions.entries()) {
    if (!q.prompt.trim()) return `Question ${i + 1} needs its text.`;
    const p = questionConfigProblem(q.kind, draftConfig(q));
    if (p) return `Question ${i + 1}: ${p}`;
  }
  return null;
}

/** Reads and validates a stored draft; anything malformed is treated as no draft. */
export function parseDraft(raw: string | null): SurveyDraft | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<SurveyDraft> | null;
    if (!o || typeof o !== "object" || typeof o.title !== "string" || !Array.isArray(o.questions)) return null;
    const questions: DraftQuestion[] = [];
    for (const q of o.questions.slice(0, MAX_DRAFT_QUESTIONS)) {
      if (!q || typeof q.prompt !== "string" || !KINDS.includes(q.kind)) return null;
      questions.push({
        kind: q.kind,
        prompt: q.prompt.slice(0, 500),
        ...(Array.isArray(q.options) ? { options: q.options.filter((x): x is string => typeof x === "string").slice(0, 10) } : {}),
        ...(typeof q.max === "number" ? { max: q.max } : {}),
        ...(q.optional ? { optional: true } : {}),
      });
    }
    return {
      title: o.title.slice(0, 120),
      access: o.access === "invite" ? "invite" : "link",
      anonymity: o.anonymity === "identified" ? "identified" : "anonymous",
      guests: o.guests !== false,
      questions,
    };
  } catch {
    return null;
  }
}

export function loadSurveyDraft(): SurveyDraft | null {
  try { return parseDraft(localStorage.getItem(DRAFT_KEY)); } catch { return null; }
}
export function saveSurveyDraft(d: SurveyDraft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* private window: the draft still works on screen */ }
}
export function clearSurveyDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
}
