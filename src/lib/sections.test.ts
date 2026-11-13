import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Question } from "./lvApi";
import { describeRule, longestPath, rulesProblem, sectionsOf, visibleQuestions } from "./sections";

const role: Question = { question_id: "q1", position: 1, kind: "single_choice", prompt: "What is your role?", config: { options: ["Staff", "Manager", "Corporate"] } };
const day: Question = { question_id: "q2", position: 2, kind: "rating", prompt: "How easy?", config: { section: { title: "Your day", show_if: { question_id: "q1", any_of: ["Staff", "Manager"] } } } };
const day2: Question = { question_id: "q3", position: 3, kind: "text", prompt: "What was slow?", config: {} };
const corp: Question = { question_id: "q4", position: 4, kind: "text", prompt: "Which reports?", config: { section: { title: "Across centers", show_if: { question_id: "q1", any_of: ["Corporate"] } } } };
const last: Question = { question_id: "q5", position: 5, kind: "text", prompt: "Anything else?", config: { section: { title: "Last word" } } };
const all = [corp, role, day2, last, day];

test("sections group questions from one section start to the next", () => {
  assert.deepEqual(sectionsOf(all).map((s) => [s.title, s.questions.map((q) => q.question_id)]),
    [["", ["q1"]], ["Your day", ["q2", "q3"]], ["Across centers", ["q4"]], ["Last word", ["q5"]]]);
});

test("each person sees their own block; before answering, conditional sections stay hidden", () => {
  assert.deepEqual(visibleQuestions(all, {}).map((q) => q.question_id), ["q1", "q5"]);
  assert.deepEqual(visibleQuestions(all, { q1: "Staff" }).map((q) => q.question_id), ["q1", "q2", "q3", "q5"]);
  assert.deepEqual(visibleQuestions(all, { q1: "Corporate" }).map((q) => q.question_id), ["q1", "q4", "q5"]);
  assert.deepEqual(visibleQuestions(all, { q1: ["Corporate"] }).map((q) => q.question_id), ["q1", "q4", "q5"]);
});

test("publish checks match the server", () => {
  assert.equal(rulesProblem(all), null);
  assert.match(rulesProblem([role, { ...day, config: { section: { title: "Your day", show_if: { question_id: "q1", any_of: ["Intern"] } } } }])!, /not an option/);
  assert.match(rulesProblem([{ ...role, position: 9 }, day])!, /later question/);
  assert.match(rulesProblem([day])!, /no longer exists/);
});

test("rules read as a sentence", () => {
  assert.equal(describeRule(day.config.section!.show_if!, all), "Shown when “What is your role?” is Staff or Manager");
});

test("the welcome screen counts the longest path, not every question", () => {
  assert.equal(longestPath(all), 4);
});
