// Survey templates: the starting points for a Quick Survey and the public gallery at /templates. The data lives in
// src/config/templates.json (one file, also read by scripts/seo-prerender.mjs for the sitemap and page metadata), so the
// builder's "Start from a template", the gallery and the search pages can never disagree.
//
// Rules (enforced by src/lib/surveyTemplates.test.ts): anonymous unless the template needs to know who answered, and
// then its intro opens with "Identified survey"; health templates ask about experience only; dietary options are
// choices, never allergies; a template only uses question types its plan includes and fits that plan's question limit;
// a Pro template with a group question promises the minimum of 5; generic wording, no customer named.
import type { Anonymity, QuestionKind, SurveyAccess } from "../lib/lvApi";
import type { PlanTier } from "../lib/questionKinds";
import data from "./templates.json";

export const TEMPLATE_CATEGORIES = [
  "Customers", "Teams and work", "Events", "Education", "Dining", "Community",
  "Clubs and groups", "Product and research", "Health and wellbeing", "Forms", "Fun", "Decisions",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** The URL piece for a category: /templates/teams-and-work. */
export const categorySlug = (c: string) => c.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const categoryBySlug = (s: string | undefined): TemplateCategory | null => TEMPLATE_CATEGORIES.find((c) => categorySlug(c) === s) ?? null;

export interface TemplateQuestion {
  kind: QuestionKind;
  prompt: string;
  /** Choice options (single_choice / multi_choice / dropdown / ranking / image_choice). */
  options?: string[];
  /** Most choices a person may pick on a multi_choice question (config.max). */
  max?: number;
  /** Free-text and similar questions people may skip. Stored as config.optional. */
  optional?: boolean;
  /** Settings for the v2 kinds (points, rows, fields, quiz...). Stored in the question's config. */
  config?: Record<string, unknown>;
}

/** Features a template needs that are not built yet. Such a template is listed and previewed but "Use" is hidden. */
export type TemplateFlag = "timed" | "leaderboard";

export interface SurveyTemplate {
  /** URL-safe id: /surveys/new?template=<id> and /templates/<id>. Never rename a published id: marketing links point at it. */
  id: string;
  category: TemplateCategory;
  /** free = any account, plus = Creator Plus or Starter Hub, pro = Creator Pro or Team Hub. */
  plan: PlanTier;
  name: string;
  /** One line shown on the card. */
  blurb: string;
  /** Suggested survey title; the creator can change it. */
  title: string;
  /** Shown on the first screen of the template page. Identified templates say so here. */
  intro: string;
  anonymity: Anonymity;
  /** Pro templates with a group question: the results promise the minimum of 5 people per group. */
  breakdown: boolean;
  flags: TemplateFlag[];
  questions: TemplateQuestion[];
  /** Settings the picker applies with the template (the creator can still change them). Omitted = leave as they are. */
  defaults?: { access?: SurveyAccess; anonymity?: Anonymity };
}

interface Raw {
  slug: string; category: string; plan: string; name: string; blurb: string; title: string; intro: string; anonymity: string;
  access?: string; breakdown?: boolean; flags?: string[]; questions: TemplateQuestion[];
}

export const SURVEY_TEMPLATES: readonly SurveyTemplate[] = (data.templates as unknown as Raw[]).map((r) => ({
  id: r.slug,
  category: r.category as TemplateCategory,
  plan: r.plan as PlanTier,
  name: r.name,
  blurb: r.blurb,
  title: r.title,
  intro: r.intro,
  anonymity: r.anonymity as Anonymity,
  breakdown: Boolean(r.breakdown),
  flags: (r.flags ?? []) as TemplateFlag[],
  questions: r.questions,
  ...(r.access ? { defaults: { access: r.access as SurveyAccess, anonymity: r.anonymity as Anonymity } } : r.anonymity === "identified" ? { defaults: { anonymity: "identified" as Anonymity } } : {}),
}));

export const templateById = (id: string | null | undefined): SurveyTemplate | null =>
  SURVEY_TEMPLATES.find((t) => t.id === id) ?? null;

/** Can this template be used today? (Flagged ones need features that are not built yet.) */
export const templateUsable = (t: SurveyTemplate) => t.flags.length === 0;

/** The question config the API stores for one template question. */
export function templateConfig(q: TemplateQuestion): Record<string, unknown> {
  return {
    ...(q.options ? { options: q.options } : {}),
    ...(q.max ? { max: q.max } : {}),
    ...(q.config ?? {}),
    ...(q.optional ? { optional: true as const } : {}),
  };
}
