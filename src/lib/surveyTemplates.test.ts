import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryBySlug, categorySlug, SURVEY_TEMPLATES, TEMPLATE_CATEGORIES, templateById, templateConfig, templateUsable } from "../config/surveyTemplates.ts";
import { questionConfigProblem } from "./lvApi.ts";
import { answerValueProblem, IDENTIFIED_ONLY, kindPlan, tierAllows } from "./questionKinds.ts";

// docs/v2/LAUNCH_PLAN.md: Free Quick Survey = 10 questions; Creator Plus 30; Creator Pro 100 (000042).
const LIMIT = { free: 10, plus: 30, pro: 100 } as const;

test("template ids are unique, URL-safe and never collide with a category address (marketing links point at them)", () => {
  const ids = SURVEY_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  for (const c of TEMPLATE_CATEGORIES) assert.ok(!ids.includes(categorySlug(c)), `${c} collides with a template`);
});

test("there are 82 templates: 45 free, 22 plus, 15 pro, in 12 categories", () => {
  assert.equal(SURVEY_TEMPLATES.length, 82);
  const by = (p: string) => SURVEY_TEMPLATES.filter((t) => t.plan === p).length;
  assert.deepEqual([by("free"), by("plus"), by("pro")], [45, 22, 15]);
  assert.equal(TEMPLATE_CATEGORIES.length, 12);
  for (const c of TEMPLATE_CATEGORIES) assert.ok(SURVEY_TEMPLATES.some((t) => t.category === c), `no template in ${c}`);
  for (const t of SURVEY_TEMPLATES) assert.ok(TEMPLATE_CATEGORIES.includes(t.category), `${t.id}: ${t.category}`);
});

test("the original twenty stay free", () => {
  for (const t of SURVEY_TEMPLATES.slice(0, 20)) assert.equal(t.plan, "free", t.id);
});

test("question counts match the plan (the numbered list in the brief)", () => {
  const want: Record<string, number> = {
    "csat-survey": 5, "nps-survey": 3, "customer-effort-score": 3, "voice-of-the-customer": 10, "employee-engagement": 20, enps: 2, "exit-survey": 8,
    "manager-feedback": 8, "feedback-360": 15, "belonging-inclusion": 12, "event-registration": 6, "conference-feedback": 10, "course-evaluation": 10,
    "alumni-survey": 12, "quick-visit-rating": 1, "community-needs": 15, "program-impact": 12, "officer-election": 3, "price-sensitivity": 6,
    "application-form": 10, "consent-form": 4, "scored-quiz": 10, "trivia-night": 15,
  };
  for (const [id, n] of Object.entries(want)) assert.equal(templateById(id)?.questions.length, n, id);
});

test("every template fits its plan's limits and the server's question rules", () => {
  for (const t of SURVEY_TEMPLATES) {
    assert.ok(t.title.trim() && t.title.length <= 120, `${t.id}: title 1-120 characters`);
    assert.ok(t.questions.length >= 1 && t.questions.length <= LIMIT[t.plan], `${t.id}: question count`);
    for (const q of t.questions) {
      assert.ok(q.prompt.trim().length > 0 && q.prompt.length <= 200, `${t.id}: prompt "${q.prompt}"`);
      assert.equal(questionConfigProblem(q.kind, templateConfig(q)), null, `${t.id}: "${q.prompt}"`);
      assert.ok(tierAllows(t.plan, kindPlan(q.kind)), `${t.id}: ${q.kind} needs ${kindPlan(q.kind)}, template is ${t.plan}`);
    }
  }
});

test("prompts are unique within a template", () => {
  for (const t of SURVEY_TEMPLATES) {
    const p = t.questions.map((q) => q.prompt.toLowerCase());
    assert.equal(new Set(p).size, p.length, t.id);
  }
});

// "No customer named" is enforced for all of src/ (templates included) by scripts/check-customer-names.mjs.

test("anonymous by default; identified templates say so on the first screen and are the only ones that collect who someone is", () => {
  const identified = SURVEY_TEMPLATES.filter((t) => t.anonymity === "identified").map((t) => t.id).sort();
  assert.deepEqual(identified, ["application-form", "consent-form", "event-registration", "event-rsvp", "feedback-360", "interest-waitlist", "volunteer-interest"]);
  for (const t of SURVEY_TEMPLATES) {
    if (t.anonymity === "identified") assert.match(t.intro, /^Identified survey/i, `${t.id}: the first line must say it is identified`);
    else assert.ok(!t.questions.some((q) => IDENTIFIED_ONLY.includes(q.kind)), `${t.id}: anonymous but asks who someone is`);
    assert.deepEqual(t.defaults?.anonymity ?? t.anonymity, t.anonymity);
  }
});

test("only a ballot changes who can answer", () => {
  assert.deepEqual(templateById("committee-vote")?.defaults, { access: "invite", anonymity: "anonymous" });
  assert.deepEqual(SURVEY_TEMPLATES.filter((t) => t.defaults?.access).map((t) => t.id), ["committee-vote", "officer-election"]);
});

test("health templates measure experience only; dietary options are choices, never allergies", () => {
  const medical = /symptom|medicat|diagnos|allerg|condition|prescription|disease|illness|injur|pain/i;
  for (const t of SURVEY_TEMPLATES.filter((x) => x.category === "Health and wellbeing" || x.id === "wellbeing-pulse")) {
    assert.match(t.intro, /experience/i, `${t.id}: says it asks about experience`);
    assert.match(t.intro, /anonymous/i);
    for (const q of t.questions) assert.ok(!medical.test(q.prompt + (q.options ?? []).join(" ")), `${t.id}: "${q.prompt}"`);
  }
  for (const t of SURVEY_TEMPLATES) for (const q of t.questions) for (const o of q.options ?? []) assert.ok(!/allerg/i.test(o), `${t.id}: option "${o}"`);
  const dietary = templateById("dietary-preferences")!;
  assert.ok(dietary.questions[0]!.options!.includes("Halal") && dietary.questions[0]!.options!.includes("Kosher") && dietary.questions[0]!.options!.includes("Vegetarian"));
});

test("a pro template with a group question promises the minimum of 5", () => {
  for (const t of SURVEY_TEMPLATES.filter((x) => x.breakdown)) {
    assert.equal(t.plan, "pro", `${t.id}: breakdowns are a Pro feature`);
    assert.match(t.intro, /at least 5 people/, t.id);
  }
  for (const id of ["voice-of-the-customer", "employee-engagement", "belonging-inclusion", "community-needs"]) assert.equal(templateById(id)?.breakdown, true, id);
});

test("templates that need unbuilt features are valid data but not usable", () => {
  assert.deepEqual(SURVEY_TEMPLATES.filter((t) => !templateUsable(t)).map((t) => t.id), ["trivia-night"]);
  assert.deepEqual(templateById("trivia-night")?.flags, ["timed", "leaderboard"]);
});

test("quiz templates mark a right answer from the options", () => {
  for (const id of ["scored-quiz", "trivia-night"]) {
    for (const q of templateById(id)!.questions) {
      const quiz = (q.config as { quiz: { correct: string[]; points: number } }).quiz;
      assert.ok(quiz.correct.length === 1 && q.options!.includes(quiz.correct[0]!), `${id}: ${q.prompt}`);
    }
  }
});

test("a template's own answers would be accepted for the kinds that check a value", () => {
  assert.equal(answerValueProblem("nps", {}, 9), null);
  assert.equal(answerValueProblem("dropdown", templateConfig(templateById("application-form")!.questions[1]!), "Option A"), null);
});

test("lookup and config shape", () => {
  assert.equal(templateById("team-pulse")?.name, "Team pulse check");
  assert.equal(templateById("nope"), null);
  assert.equal(templateById(null), null);
  assert.equal(categoryBySlug("teams-and-work"), "Teams and work");
  assert.equal(categoryBySlug("nope"), null);
  assert.deepEqual(templateConfig({ kind: "text", prompt: "x", optional: true }), { optional: true });
  assert.deepEqual(templateConfig({ kind: "single_choice", prompt: "x", options: ["a", "b"] }), { options: ["a", "b"] });
  assert.deepEqual(templateConfig({ kind: "rating", prompt: "x" }), {});
  assert.deepEqual(templateConfig({ kind: "agree_scale", prompt: "x", config: { points: 7 } }), { points: 7 });
});
