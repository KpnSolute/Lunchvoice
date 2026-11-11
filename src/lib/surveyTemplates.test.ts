import { test } from "node:test";
import assert from "node:assert/strict";
import { SURVEY_TEMPLATES, templateById, templateConfig } from "../config/surveyTemplates.ts";
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

test("lookup and config shape", () => {
  assert.equal(templateById("team-pulse")?.name, "Team pulse check");
  assert.equal(templateById("nope"), null);
  assert.equal(templateById(null), null);
  assert.deepEqual(templateConfig({ kind: "text", prompt: "x", optional: true }), { optional: true });
  assert.deepEqual(templateConfig({ kind: "single_choice", prompt: "x", options: ["a", "b"] }), { options: ["a", "b"] });
  assert.deepEqual(templateConfig({ kind: "rating", prompt: "x" }), {});
});
