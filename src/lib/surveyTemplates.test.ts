import { test } from "node:test";
import assert from "node:assert/strict";
import { SURVEY_TEMPLATES, TEMPLATE_CATEGORIES, templateById, templateConfig } from "../config/surveyTemplates.ts";
import { questionConfigProblem } from "./lvApi.ts";

const QUICK_SURVEY_QUESTION_LIMIT = 10; // docs/v2/LAUNCH_PLAN.md: Free Quick Survey = 10 questions

test("template ids are unique and URL-safe (marketing links point at them)", () => {
  const ids = SURVEY_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
});

test("every template fits the Quick Survey limits and the server's question rules", () => {
  for (const t of SURVEY_TEMPLATES) {
    assert.ok(t.title.trim() && t.title.length <= 120, `${t.id}: title 1-120 characters`);
    assert.ok(t.questions.length >= 1 && t.questions.length <= QUICK_SURVEY_QUESTION_LIMIT, `${t.id}: question count`);
    for (const q of t.questions) {
      assert.ok(q.prompt.trim().length > 0 && q.prompt.length <= 500, `${t.id}: prompt "${q.prompt}"`);
      assert.equal(questionConfigProblem(q.kind, templateConfig(q)), null, `${t.id}: "${q.prompt}"`);
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

test("only a ballot changes who can answer; identified defaults are limited to templates that need to know who replied", () => {
  assert.deepEqual(templateById("committee-vote")?.defaults, { access: "invite", anonymity: "anonymous" });
  const withAccess = SURVEY_TEMPLATES.filter((t) => t.defaults?.access).map((t) => t.id);
  assert.deepEqual(withAccess, ["committee-vote"]);
  const identified = SURVEY_TEMPLATES.filter((t) => t.defaults?.anonymity === "identified").map((t) => t.id).sort();
  assert.deepEqual(identified, ["event-rsvp", "volunteer-interest"]);
});

test("every template has a known category and every category is used", () => {
  for (const t of SURVEY_TEMPLATES) assert.ok(TEMPLATE_CATEGORIES.includes(t.category), `${t.id}: ${t.category}`);
  for (const c of TEMPLATE_CATEGORIES) assert.ok(SURVEY_TEMPLATES.some((t) => t.category === c), `no template in ${c}`);
});

test("there are twenty free templates", () => {
  assert.equal(SURVEY_TEMPLATES.length, 20);
});

test("lookup and config shape", () => {
  assert.equal(templateById("team-pulse")?.name, "Team pulse check");
  assert.equal(templateById("nope"), null);
  assert.equal(templateById(null), null);
  assert.deepEqual(templateConfig({ kind: "text", prompt: "x", optional: true }), { optional: true });
  assert.deepEqual(templateConfig({ kind: "single_choice", prompt: "x", options: ["a", "b"] }), { options: ["a", "b"] });
  assert.deepEqual(templateConfig({ kind: "rating", prompt: "x" }), {});
});
