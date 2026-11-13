import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Question } from "./lvApi";
import { conditionMet, describeLogicRule, logicProblem, pathLengths, walk } from "./logic";
import { rulesProblem, visibleQuestions } from "./sections";
import { centerSurvey } from "./fixtures/centerSurvey";

const ids = (qs: Question[]) => qs.map((q) => Number(q.question_id.slice(1)));
const S = centerSurvey();

test("Centers: staff path follows Q2 and Q6, skips the leadership block", () => {
  assert.deepEqual(ids(visibleQuestions(S, { q1: "Lead", q2: ["Guides"], q6: false })), [1, 2, 3, 5, 6, 8, 9, 10, 11, 21]);
  assert.deepEqual(ids(visibleQuestions(S, { q1: "Manager", q2: ["Guides", "Guest food request"], q6: true })), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 21]);
});

test("Centers: leaders see Q12 to Q19; Q16 needs Q15 = Yes; Q20 only for Corporate", () => {
  assert.deepEqual(ids(visibleQuestions(S, { q1: "Department head", q15: false })), [1, 12, 13, 14, 15, 17, 18, 19, 21]);
  assert.deepEqual(ids(visibleQuestions(S, { q1: "Corporate", q15: true })), [1, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
});

test("Centers: hidden answers never count, and the walk returns only answers to shown questions", () => {
  // Switched from staff to Corporate: the staff answers stay in memory (Back never loses them) but are not sent.
  const w = walk(S, { q1: "Corporate", q2: ["Guides"], q3: 4, q6: true, q7: "x", q15: true, q16: "Ohio" });
  assert.deepEqual(Object.keys(w.answers).sort(), ["q1", "q15", "q16"]);
});

test("Centers: path lengths are 9 to 12 questions and the survey publishes", () => {
  const p = pathLengths(S);
  assert.equal(p.min, 9);
  assert.equal(p.max, 12);
  assert.ok(p.exact);
  assert.equal(rulesProblem(S), null);
});

test("conditions: any of, none of, ratings, unanswered never matches", () => {
  assert.ok(conditionMet({ question_id: "a", op: "any_of", values: ["x"] }, { a: ["y", "x"] }));
  assert.ok(conditionMet({ question_id: "a", op: "none_of", values: ["x"] }, { a: "y" }));
  assert.ok(!conditionMet({ question_id: "a", op: "none_of", values: ["x"] }, {}));
  assert.ok(conditionMet({ question_id: "a", op: "at_least", min: 4 }, { a: 4 }));
  assert.ok(!conditionMet({ question_id: "a", op: "at_most", max: 2 }, { a: 3 }));
  assert.ok(conditionMet({ question_id: "a", op: "between", min: 2, max: 3 }, { a: 2 }));
  assert.ok(conditionMet({ question_id: "a", op: "any_of", values: ["true"] }, { a: true }));
});

test("ALL and ANY", () => {
  const all = { match: "all" as const, conditions: [{ question_id: "a", op: "any_of" as const, values: ["x"] }, { question_id: "b", op: "at_least" as const, min: 3 }] };
  const qs: Question[] = [
    { question_id: "a", position: 1, kind: "single_choice", prompt: "A", config: { options: ["x", "y"] } },
    { question_id: "b", position: 2, kind: "rating", prompt: "B", config: {} },
    { question_id: "c", position: 3, kind: "text", prompt: "C", config: { show_if: all } },
  ];
  assert.deepEqual(visibleQuestions(qs, { a: "x", b: 2 }).map((q) => q.question_id), ["a", "b"]);
  qs[2]!.config.show_if = { ...all, match: "any" };
  assert.deepEqual(visibleQuestions(qs, { a: "x", b: 2 }).map((q) => q.question_id), ["a", "b", "c"]);
  assert.equal(describeLogicRule(all, qs), "Shown if Q1: x and Q2 is 3 or more");
});

test("end survey stops the path", () => {
  const qs = centerSurvey();
  qs[5]!.config = { show_if: qs[5]!.config.show_if, jumps: [{ when: "false", to: "end" }] };
  assert.deepEqual(ids(visibleQuestions(qs, { q1: "Lead", q2: ["Menu planner"], q6: false })), [1, 2, 5, 6]);
  assert.deepEqual(ids(visibleQuestions(qs, { q1: "Lead", q2: ["Menu planner"], q6: true })), [1, 2, 5, 6, 7, 8, 9, 10, 11, 21]);
  assert.equal(logicProblem(qs), null);
});

test("publish checks: look back only, options exist, rating comparisons, end only", () => {
  const bad = (mut: (qs: Question[]) => void) => { const qs = centerSurvey(); mut(qs); return logicProblem(qs); };
  assert.match(bad((qs) => { qs[2]!.config.show_if!.conditions[0]!.question_id = "q5"; })!, /later question/);
  assert.match(bad((qs) => { qs[2]!.config.show_if!.conditions[0]!.question_id = "q99"; })!, /no longer exists/);
  assert.match(bad((qs) => { qs[2]!.config.show_if!.conditions[0]!.values = ["Gone"]; })!, /not an option/);
  assert.match(bad((qs) => { qs[0]!.config.jumps = [{ when: "Gone", to: "end" }]; })!, /not an option/);
  assert.match(bad((qs) => { qs[0]!.config.jumps = [{ when: "Lead", to: "q5" }]; })!, /end the survey/);
  assert.match(bad((qs) => { qs[1]!.config.jumps = [{ when: "Guides", to: "end" }]; })!, /single-choice or yes\/no/);
  assert.match(bad((qs) => { qs[2]!.config.show_if = { match: "all", conditions: [{ question_id: "q1", op: "at_least", min: 3 }] }; })!, /not a rating/);
});
