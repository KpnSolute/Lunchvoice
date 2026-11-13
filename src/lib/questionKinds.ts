// The question kinds (000003 core five, 000047 the v2 set): which plan each needs, what its settings must look like and
// what an answer must look like. Pure and shared by the editor, the respondent controls, the template catalog and the
// dev mock. The server is the authority: lv.kind_config_problem, lv.check_answer_value and lv.kind_allowed (000047)
// enforce the same rules, and supabase/tests/47_question_types.sql checks them.
//
// Plans (founder, "LunchVoice v2 — Survey Templates and Survey UI"):
//   free = Quick Survey;  plus = Starter Hub and Creator Plus;  pro = Team Hub and Creator Pro.

export type PlanTier = "free" | "plus" | "pro";

export const CORE_KINDS = ["rating", "single_choice", "multi_choice", "yes_no", "text"] as const;
export const NEW_FREE_KINDS = ["face_scale", "dropdown", "number", "date"] as const;
export const PLUS_KINDS = ["nps", "agree_scale", "ranking", "image_choice", "slider", "contact"] as const;
export const PRO_KINDS = ["agree_grid", "file_upload", "consent", "signature", "price_ladder", "before_after"] as const;
export const ALL_KINDS = [...CORE_KINDS, ...NEW_FREE_KINDS, ...PLUS_KINDS, ...PRO_KINDS] as const;
export type AnyKind = (typeof ALL_KINDS)[number];

/** Kinds that collect who someone is. Never on an anonymous survey (server: lv.question_kind_check). */
export const IDENTIFIED_ONLY: readonly AnyKind[] = ["contact", "file_upload", "consent", "signature"];

/** Kinds whose settings carry an options list edited like a choice question. */
export const OPTION_KINDS: readonly AnyKind[] = ["single_choice", "multi_choice", "dropdown", "ranking", "image_choice"];

export interface KindInfo {
  kind: AnyKind;
  label: string;
  plan: PlanTier;
  /** One plain line for the type picker and the template gallery. */
  hint: string;
}

export const KIND_INFO: readonly KindInfo[] = [
  { kind: "rating", label: "Rating 1–5", plan: "free", hint: "Tap one to five stars." },
  { kind: "single_choice", label: "Single choice", plan: "free", hint: "Pick one option." },
  { kind: "multi_choice", label: "Multiple choice", plan: "free", hint: "Pick any number of options." },
  { kind: "yes_no", label: "Yes / No", plan: "free", hint: "Two big buttons." },
  { kind: "text", label: "Short text", plan: "free", hint: "A few words in their own voice." },
  { kind: "face_scale", label: "Face scale", plan: "free", hint: "Five faces from unhappy to happy." },
  { kind: "dropdown", label: "Dropdown", plan: "free", hint: "One option from a longer list." },
  { kind: "number", label: "Number", plan: "free", hint: "A number, with a minimum and maximum if you like." },
  { kind: "date", label: "Date", plan: "free", hint: "A day on the calendar." },
  { kind: "nps", label: "NPS 0–10", plan: "plus", hint: "How likely to recommend. Results show the NPS score." },
  { kind: "agree_scale", label: "Agree scale", plan: "plus", hint: "Strongly disagree to strongly agree, 5 or 7 points." },
  { kind: "ranking", label: "Ranking", plan: "plus", hint: "Put options in order." },
  { kind: "image_choice", label: "Image choice", plan: "plus", hint: "Pick one picture." },
  { kind: "slider", label: "Slider", plan: "plus", hint: "Drag along a range with labelled ends." },
  { kind: "contact", label: "Contact details", plan: "plus", hint: "Name, email or phone. Identified surveys only." },
  { kind: "agree_grid", label: "Agree grid", plan: "pro", hint: "Several statements on one agree scale." },
  { kind: "file_upload", label: "File upload", plan: "pro", hint: "Attach a photo or document. Identified surveys only." },
  { kind: "consent", label: "Consent checkbox", plan: "pro", hint: "Tick to agree to a statement. Identified surveys only." },
  { kind: "signature", label: "Typed signature", plan: "pro", hint: "Type a full name to sign. Identified surveys only." },
  { kind: "price_ladder", label: "Price ladder", plan: "pro", hint: "The highest price someone would still pay." },
  { kind: "before_after", label: "Before / after", plan: "pro", hint: "The same scale for then and now." },
];

export const kindInfo = (k: string): KindInfo | undefined => KIND_INFO.find((x) => x.kind === k);
export const isKnownKind = (k: string): k is AnyKind => (ALL_KINDS as readonly string[]).includes(k);
export const kindPlan = (k: string): PlanTier => kindInfo(k)?.plan ?? "free";
export const PLAN_LABEL: Record<PlanTier, string> = { free: "Free", plus: "Plus", pro: "Pro" };
/** What unlocks a tier, in the words the pricing page uses. */
export const PLAN_UNLOCK: Record<PlanTier, string> = {
  free: "Free with any account.",
  plus: "Included with Creator Plus or a Starter Hub.",
  pro: "Included with Creator Pro or a Team Hub.",
};
/** The product an upgrade link points at (lv_entitlement_required.product). */
export const PLAN_PRODUCT: Record<PlanTier, string> = { free: "free", plus: "creator_plus", pro: "creator_pro" };
const RANK: Record<PlanTier, number> = { free: 0, plus: 1, pro: 2 };
export const tierAllows = (have: PlanTier, need: PlanTier) => RANK[have] >= RANK[need];

/** The tier a Hub family or Creator family gives (lv.plan_limits 'survey.kinds'). */
export function tierOf(family: string | null | undefined, creator?: string | null): PlanTier {
  const f = (x: string | null | undefined): PlanTier => (x === "team" || x === "creator_pro" ? "pro" : x === "starter" || x === "creator_plus" ? "plus" : "free");
  const a = f(family);
  const b = f(creator);
  return RANK[a] >= RANK[b] ? a : b;
}

export const FACE_LABELS = ["Very unhappy", "Unhappy", "Okay", "Happy", "Very happy"];
export const AGREE_5 = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];
export const AGREE_7 = ["Strongly disagree", "Disagree", "Somewhat disagree", "Neutral", "Somewhat agree", "Agree", "Strongly agree"];
export const agreeLabels = (cfg: object): string[] => {
  const c = cfg as { points?: unknown; labels?: unknown };
  const points = c.points === 7 ? 7 : 5;
  const custom = Array.isArray(c.labels) && c.labels.length === points && c.labels.every((l) => typeof l === "string" && l.trim()) ? (c.labels as string[]) : null;
  return custom ?? (points === 7 ? AGREE_7 : AGREE_5);
};
export const CONTACT_FIELDS = ["name", "email", "phone"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];
export const FILE_TYPES: Record<string, string[]> = {
  image: ["image/png", "image/jpeg", "image/webp", "image/heic"],
  pdf: ["application/pdf"],
  doc: ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"],
};
export const FILE_MAX_MB = 10;
export const DROPDOWN_MAX = 50;
export const NUMBER_BOUND = 1_000_000_000;

/** Settings a new question of this kind starts with in the editor. */
export function defaultConfig(kind: string): Record<string, unknown> {
  switch (kind) {
    case "dropdown": case "ranking": return { options: ["", ""] };
    case "image_choice": return { options: ["", ""], images: [] };
    case "number": return {};
    case "slider": return { min: 0, max: 10, step: 1, min_label: "", max_label: "" };
    case "agree_scale": return { points: 5 };
    case "agree_grid": return { points: 5, rows: ["", ""] };
    case "before_after": return { points: 5, before_label: "Before", after_label: "Now" };
    case "contact": return { fields: ["name", "email"] };
    case "file_upload": return { max_mb: 5, types: ["image", "pdf"] };
    case "consent": return { statement: "" };
    case "price_ladder": return { prices: [5, 10, 15, 20], currency: "USD" };
    default: return {};
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (s: unknown): s is string => {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const strList = (v: unknown, min: number, max: number, maxLen: number, what: string): string | null => {
  if (!Array.isArray(v) || v.length < min || v.length > max) return `${what} needs ${min} to ${max} entries.`;
  if (v.some((o) => typeof o !== "string" || !o.trim())) return `Every entry in ${what.toLowerCase()} needs text.`;
  if (v.some((o) => (o as string).length > maxLen)) return `Keep each entry to ${maxLen} characters.`;
  if (new Set(v.map((o) => (o as string).trim().toLowerCase())).size < v.length) return `${what} must all be different.`;
  return null;
};
const scaleProblem = (c: Record<string, unknown>): string | null => {
  if (c.points !== undefined && c.points !== 5 && c.points !== 7) return "An agree scale has 5 or 7 points.";
  if (c.labels !== undefined && c.labels !== null) {
    const p = c.points === 7 ? 7 : 5;
    if (!Array.isArray(c.labels) || c.labels.length !== p || c.labels.some((l) => typeof l !== "string" || !l.trim() || l.length > 40))
      return `Give all ${p} labels, up to 40 characters each.`;
  }
  return null;
};
const optLabel = (v: unknown, max = 60) => v === undefined || v === null || (typeof v === "string" && v.length <= max);

/**
 * The settings rule for the v2 kinds (lv.kind_config_problem, 000047) and for quiz settings on choice questions.
 * Returns null for the core kinds' own options rule, which lvApi.questionConfigProblem (000018) keeps.
 */
export function kindConfigProblem(kind: string, config: unknown): string | null {
  if (!isKnownKind(kind)) return "That question type does not exist.";
  const c = isObj(config) ? config : {};
  switch (kind) {
    case "single_choice": case "multi_choice": {
      const quiz = c.quiz;
      if (quiz === undefined || quiz === null) return null;
      if (!isObj(quiz)) return "Quiz settings must be an object.";
      const opts = Array.isArray(c.options) ? (c.options as string[]) : [];
      const correct = quiz.correct;
      if (!Array.isArray(correct) || correct.length < 1 || correct.some((x) => typeof x !== "string" || !opts.includes(x)))
        return "Mark at least one correct answer from the options.";
      if (kind === "single_choice" && correct.length !== 1) return "A single choice quiz question has one correct answer.";
      if (quiz.points !== undefined && (!isInt(quiz.points) || quiz.points < 1 || quiz.points > 100)) return "Points are a whole number from 1 to 100.";
      return null;
    }
    case "dropdown": return strList(c.options, 2, DROPDOWN_MAX, 200, "Options");
    case "ranking": return strList(c.options, 2, 10, 200, "Options");
    case "image_choice": {
      const bad = strList(c.options, 2, 6, 80, "Options");
      if (bad) return bad;
      const imgs = c.images;
      if (imgs === undefined || imgs === null || (Array.isArray(imgs) && imgs.length === 0)) return null;
      if (!Array.isArray(imgs) || imgs.length !== (c.options as unknown[]).length) return "Give one picture per option, or none.";
      if (imgs.some((u) => typeof u !== "string" || !/^https:\/\/[^\s"'<>]{4,490}$/.test(u))) return "Each picture needs an https:// address.";
      return null;
    }
    case "number": {
      for (const k of ["min", "max"]) if (c[k] !== undefined && c[k] !== null && (!isNum(c[k]) || Math.abs(c[k] as number) > NUMBER_BOUND)) return "Minimum and maximum must be numbers.";
      if (isNum(c.min) && isNum(c.max) && c.min > c.max) return "The minimum must not be above the maximum.";
      if (c.integer !== undefined && typeof c.integer !== "boolean") return "Whole numbers only is on or off.";
      if (!optLabel(c.unit, 20)) return "Keep the unit to 20 characters.";
      return null;
    }
    case "date": {
      for (const k of ["min", "max"]) if (c[k] !== undefined && c[k] !== null && !isIsoDate(c[k])) return "Dates are written YYYY-MM-DD.";
      if (isIsoDate(c.min) && isIsoDate(c.max) && c.min > c.max) return "The earliest date must not be after the latest.";
      return null;
    }
    case "nps": return optLabel(c.low_label) && optLabel(c.high_label) ? null : "Keep each end label to 60 characters.";
    case "agree_scale": return scaleProblem(c);
    case "agree_grid": return strList(c.rows, 2, 10, 200, "Statements") ?? scaleProblem(c);
    case "before_after": return scaleProblem(c) ?? (optLabel(c.before_label, 40) && optLabel(c.after_label, 40) ? null : "Keep each label to 40 characters.");
    case "slider": {
      const min = c.min ?? 0, max = c.max ?? 10, step = c.step ?? 1;
      if (!isNum(min) || !isNum(max) || !isNum(step) || Math.abs(min) > NUMBER_BOUND || Math.abs(max) > NUMBER_BOUND) return "A slider needs a number for its start, end and step.";
      if (min >= max) return "The slider's end must be above its start.";
      if (step <= 0 || (max - min) / step > 1000 || !Number.isInteger(Math.round(((max - min) / step) * 1e6) / 1e6)) return "The step must fit the range evenly, with at most 1000 steps.";
      if (!optLabel(c.min_label, 40) || !optLabel(c.max_label, 40)) return "Keep each end label to 40 characters.";
      return null;
    }
    case "contact": {
      const f = c.fields;
      if (!Array.isArray(f) || f.length < 1 || f.some((x) => !CONTACT_FIELDS.includes(x as ContactField)) || new Set(f).size !== f.length)
        return "Ask for at least one of name, email and phone.";
      return null;
    }
    case "file_upload": {
      if (c.max_mb !== undefined && (!isInt(c.max_mb) || c.max_mb < 1 || c.max_mb > FILE_MAX_MB)) return `The size limit is 1 to ${FILE_MAX_MB} MB.`;
      const t = c.types;
      if (t !== undefined && (!Array.isArray(t) || t.length < 1 || t.some((x) => typeof x !== "string" || !(x in FILE_TYPES)) || new Set(t).size !== t.length))
        return "Allow at least one of images, PDF and documents.";
      return null;
    }
    case "consent":
      return typeof c.statement === "string" && c.statement.trim() && c.statement.length <= 1000 ? null : "Write the statement people agree to (up to 1000 characters).";
    case "price_ladder": {
      const p = c.prices;
      if (!Array.isArray(p) || p.length < 2 || p.length > 10 || p.some((x) => !isNum(x) || x < 0 || x > NUMBER_BOUND)) return "A price ladder needs 2 to 10 prices.";
      for (let i = 1; i < p.length; i++) if ((p[i] as number) <= (p[i - 1] as number)) return "Prices must go up from lowest to highest.";
      if (c.currency !== undefined && (typeof c.currency !== "string" || !/^[A-Z]{3}$/.test(c.currency))) return "The currency is a three-letter code such as USD.";
      return null;
    }
    default: return null;
  }
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,189}\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+()\-. ]{6,20}$/;

/**
 * Is this a valid answer value for the question? Mirrors lv.check_answer_value (000047). The core kinds keep their
 * existing server rules (000017/000041), so they return null here except the rating range.
 * A missing answer (undefined / null) is the caller's business: required versus optional.
 */
export function answerValueProblem(kind: string, config: unknown, value: unknown): string | null {
  const c = isObj(config) ? config : {};
  const opts = Array.isArray(c.options) ? (c.options as string[]) : [];
  switch (kind) {
    case "face_scale": return isInt(value) && value >= 1 && value <= 5 ? null : "Pick a face.";
    case "dropdown": case "image_choice": return typeof value === "string" && opts.includes(value) ? null : "Pick one of the options.";
    case "number": {
      if (!isNum(value)) return "Type a number.";
      if (c.integer === true && !Number.isInteger(value)) return "Type a whole number.";
      if (isNum(c.min) && value < c.min) return `The lowest is ${c.min}.`;
      if (isNum(c.max) && value > c.max) return `The highest is ${c.max}.`;
      return null;
    }
    case "date": {
      if (!isIsoDate(value)) return "Pick a date.";
      if (isIsoDate(c.min) && value < c.min) return `The earliest is ${c.min}.`;
      if (isIsoDate(c.max) && value > c.max) return `The latest is ${c.max}.`;
      return null;
    }
    case "nps": return isInt(value) && value >= 0 && value <= 10 ? null : "Pick a number from 0 to 10.";
    case "agree_scale": return isInt(value) && value >= 1 && value <= (c.points === 7 ? 7 : 5) ? null : "Pick a point on the scale.";
    case "ranking": {
      if (!Array.isArray(value) || value.length !== opts.length || new Set(value).size !== value.length || value.some((v) => !opts.includes(v as string)))
        return "Put every option in order.";
      return null;
    }
    case "slider": {
      const min = isNum(c.min) ? c.min : 0, max = isNum(c.max) ? c.max : 10, step = isNum(c.step) ? c.step : 1;
      if (!isNum(value) || value < min || value > max) return "Move the slider.";
      const k = (value - min) / step;
      return Math.abs(k - Math.round(k)) < 1e-9 ? null : "Move the slider.";
    }
    case "contact": {
      const fields = Array.isArray(c.fields) ? (c.fields as string[]) : [];
      if (!isObj(value)) return "Fill in your details.";
      if (Object.keys(value).some((k) => !fields.includes(k))) return "Only the details asked for.";
      for (const f of fields) {
        const v = value[f];
        if (typeof v !== "string" || !v.trim()) return `Add your ${f}.`;
        if (f === "name" && v.length > 100) return "Keep the name to 100 characters.";
        if (f === "email" && (v.length > 254 || !EMAIL_RE.test(v))) return "That email address does not look right.";
        if (f === "phone" && !PHONE_RE.test(v)) return "That phone number does not look right.";
      }
      return null;
    }
    case "agree_grid": {
      const rows = Array.isArray(c.rows) ? (c.rows as string[]) : [];
      const p = c.points === 7 ? 7 : 5;
      if (!isObj(value) || Object.keys(value).length !== rows.length || rows.some((r) => !isInt(value[r]) || (value[r] as number) < 1 || (value[r] as number) > p))
        return "Answer every statement.";
      return null;
    }
    case "before_after": {
      const p = c.points === 7 ? 7 : 5;
      if (!isObj(value) || Object.keys(value).length !== 2 || ![value.before, value.after].every((x) => isInt(x) && x >= 1 && x <= p)) return "Answer both before and now.";
      return null;
    }
    case "file_upload": {
      if (!isObj(value) || typeof value.path !== "string" || typeof value.name !== "string" || !isInt(value.size) || typeof value.type !== "string") return "Attach a file.";
      const max = (isInt(c.max_mb) ? c.max_mb : 5) * 1024 * 1024;
      if (value.size < 1 || value.size > max) return `Files can be up to ${max / 1024 / 1024} MB.`;
      const types = (Array.isArray(c.types) ? (c.types as string[]) : ["image", "pdf"]).flatMap((t) => FILE_TYPES[t] ?? []);
      if (!types.includes(value.type)) return "That kind of file is not allowed here.";
      if (value.name.length > 200 || value.path.length > 400) return "That file name is too long.";
      return null;
    }
    case "consent": return value === true ? null : "Tick the box to agree.";
    case "signature": return typeof value === "string" && value.trim().length >= 2 && value.length <= 100 ? null : "Type your full name to sign.";
    case "price_ladder": {
      const prices = Array.isArray(c.prices) ? (c.prices as number[]) : [];
      return value === "none" || (isNum(value) && prices.includes(value)) ? null : "Pick a price, or None of these.";
    }
    case "rating": return isNum(value) && value >= 1 && value <= 5 ? null : "rating out of range";
    default: return null;
  }
}

/**
 * The keys an answer adds to its question's distribution (lv.question_cells, 000047). Identity-bearing kinds add none:
 * a name, an email, a signature or a file is never a bar in a chart.
 */
export function answerKeys(kind: string, value: unknown): string[] {
  if (value === undefined || value === null) return [];
  switch (kind) {
    case "contact": case "file_upload": case "signature": return [];
    case "ranking": return Array.isArray(value) && value.length ? [String(value[0])] : [];
    case "agree_grid": return isObj(value) ? Object.entries(value).map(([row, n]) => `${row}: ${n}`) : [];
    case "before_after": return isObj(value) ? [`before: ${value.before}`, `after: ${value.after}`] : [];
    default: return Array.isArray(value) ? value.map(String) : [String(value)];
  }
}

/** NPS = % promoters (9-10) minus % detractors (0-6), from published cells. null while any cell is withheld. */
export function npsScore(cells: { key: string | null; n: number | null; suppressed?: boolean }[]): { score: number; promoters: number; passives: number; detractors: number; n: number } | null {
  if (!cells.length || cells.some((c) => c.suppressed || c.n === null || c.key === null)) return null;
  let p = 0, pa = 0, d = 0;
  for (const c of cells) {
    const v = Number(c.key);
    if (!Number.isInteger(v) || v < 0 || v > 10) continue;
    if (v >= 9) p += c.n!; else if (v >= 7) pa += c.n!; else d += c.n!;
  }
  const n = p + pa + d;
  if (!n) return null;
  return { score: Math.round(((p - d) / n) * 100), promoters: p, passives: pa, detractors: d, n };
}

/** Points a quiz answer earns (config.quiz on a choice question). */
export function quizPoints(config: unknown, value: unknown): number {
  const c = isObj(config) ? config : {};
  const quiz = isObj(c.quiz) ? c.quiz : null;
  if (!quiz || !Array.isArray(quiz.correct)) return 0;
  const correct = new Set(quiz.correct as string[]);
  const picked = Array.isArray(value) ? (value as string[]) : typeof value === "string" ? [value] : [];
  const right = picked.length === correct.size && picked.every((x) => correct.has(x));
  return right ? (isInt(quiz.points) ? quiz.points : 1) : 0;
}
