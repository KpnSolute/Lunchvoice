import assert from "node:assert/strict";
import { test } from "node:test";
import { draftConfig, draftProblem, emptyDraft, parseDraft } from "./surveyDraft";

const ok = () => ({ ...emptyDraft(), title: "Lunch", questions: [{ kind: "rating" as const, prompt: "How was it?" }] });

test("an empty draft is not publishable and says why", () => {
  assert.equal(draftProblem(emptyDraft()), "Add a title.");
  assert.equal(draftProblem({ ...emptyDraft(), title: "x" }), "Add at least one question.");
});

test("a complete draft is publishable", () => assert.equal(draftProblem(ok()), null));

test("choice questions need 2 to 10 different options", () => {
  const d = { ...ok(), questions: [{ kind: "single_choice" as const, prompt: "Pick", options: ["A"] }] };
  assert.match(draftProblem(d) ?? "", /Question 1: A choice question needs 2 to 10 options/);
  d.questions[0]!.options = ["A", "a"];
  assert.match(draftProblem(d) ?? "", /different/);
  d.questions[0]!.options = ["A", "B"];
  assert.equal(draftProblem(d), null);
});

test("more than 10 questions is refused", () => {
  const q = { kind: "yes_no" as const, prompt: "Ok?" };
  assert.match(draftProblem({ ...ok(), questions: Array.from({ length: 11 }, () => q) }) ?? "", /up to 10/);
});

test("draftConfig keeps options only for choice questions and drops blanks", () => {
  assert.deepEqual(draftConfig({ kind: "text", prompt: "x", options: ["a"], optional: true }), { optional: true });
  assert.deepEqual(draftConfig({ kind: "multi_choice", prompt: "x", options: [" a ", "", "b"], max: 2 }), { options: ["a", "b"], max: 2 });
});

test("parseDraft round-trips and rejects junk", () => {
  const d = ok();
  assert.deepEqual(parseDraft(JSON.stringify(d)), d);
  assert.equal(parseDraft("not json"), null);
  assert.equal(parseDraft(null), null);
  assert.equal(parseDraft(JSON.stringify({ title: "x", questions: [{ kind: "nope", prompt: "p" }] })), null);
});
