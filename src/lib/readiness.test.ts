import { test } from "node:test";
import assert from "node:assert/strict";
import { readiness } from "./readiness.ts";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const base = { title: "Route check", questions: [{ kind: "rating", prompt: "How was it?", config: {} }], start: { mode: "now" as const }, end: { mode: "none" as const }, now: NOW };
const msgs = (i: Parameters<typeof readiness>[0]) => readiness(i).map((x) => x.message);

test("a complete draft is ready", () => {
  assert.deepEqual(readiness(base), []);
});

test("title and questions are required", () => {
  assert.deepEqual(msgs({ ...base, title: " ", questions: [] }), ["Add a title.", "Add at least one question."]);
});

test("choice questions need two distinct, non-empty options", () => {
  const q = (options: string[], kind = "single_choice", extra = {}) => ({ ...base, questions: [base.questions[0], { kind, prompt: "Pick", config: { options, ...extra } }] });
  assert.deepEqual(msgs(q(["Only"])), ["Question 2 needs at least two options."]);
  assert.deepEqual(msgs(q(["A", ""])), ["Question 2 needs at least two options.", "Question 2 has an empty option."]);
  assert.deepEqual(msgs(q(["A", "a"])), ["Question 2 has the same option twice."]);
  assert.deepEqual(msgs(q(["A", "B"], "multi_choice", { max: 3 })), ["Question 2 allows more choices than it has options."]);
  assert.deepEqual(msgs(q(["A", "B"], "multi_choice", { max: 2 })), []);
});

test("schedule: end after start, and in the future", () => {
  const at = (s: string) => ({ mode: "at" as const, at: s });
  assert.deepEqual(msgs({ ...base, start: at("2026-11-10T10:00:00Z"), end: at("2026-11-09T10:00:00Z") }), ["The scheduled end time must be after the start time."]);
  assert.deepEqual(msgs({ ...base, end: at("2026-11-01T10:00:00Z") }), ["The scheduled end time must be in the future."]);
  assert.deepEqual(msgs({ ...base, start: { mode: "at", at: null } }), ["Pick a start time, or choose Immediately."]);
  assert.deepEqual(msgs({ ...base, start: at("2026-11-10T10:00:00Z"), end: at("2026-11-12T10:00:00Z") }), []);
});

test("Quick Survey question limit", () => {
  const many = Array.from({ length: 11 }, () => base.questions[0]);
  assert.deepEqual(msgs({ ...base, questions: many, questionLimit: 10 }), ["Quick Surveys have up to 10 questions. Remove 1."]);
});
