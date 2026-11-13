import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_KINDS, answerKeys, answerValueProblem, defaultConfig, IDENTIFIED_ONLY, isKnownKind, KIND_INFO, kindConfigProblem, kindPlan, npsScore, quizPoints, tierAllows, tierOf,
} from "./questionKinds.ts";
import { questionConfigProblem } from "./lvApi.ts";

test("every kind has a label, a plan and a known default config that passes its own rules", () => {
  assert.equal(KIND_INFO.length, ALL_KINDS.length);
  assert.deepEqual(KIND_INFO.map((k) => k.plan).filter((p, i, a) => a.indexOf(p) === i), ["free", "plus", "pro"]);
  for (const k of ALL_KINDS) {
    assert.ok(isKnownKind(k));
    const cfg = defaultConfig(k);
    // Option kinds and statement kinds start empty in the editor; everything else must already be valid.
    if (!["dropdown", "ranking", "image_choice", "agree_grid", "consent"].includes(k)) assert.equal(kindConfigProblem(k, cfg), null, k);
  }
});

test("plans: free adds four kinds, plus six, pro six", () => {
  const n = (p: string) => KIND_INFO.filter((k) => k.plan === p).length;
  assert.deepEqual([n("free"), n("plus"), n("pro")], [9, 6, 6]);
  assert.equal(kindPlan("nps"), "plus");
  assert.equal(kindPlan("agree_grid"), "pro");
  assert.equal(kindPlan("face_scale"), "free");
  assert.ok(tierAllows("pro", "plus") && !tierAllows("free", "plus") && tierAllows("plus", "plus"));
  assert.equal(tierOf("starter", null), "plus");
  assert.equal(tierOf(null, "creator_pro"), "pro");
  assert.equal(tierOf("team", "creator_plus"), "pro");
  assert.equal(tierOf("free", undefined), "free");
});

test("identity kinds are exactly contact, file, consent and signature", () => {
  assert.deepEqual([...IDENTIFIED_ONLY].sort(), ["consent", "contact", "file_upload", "signature"]);
});

test("settings rules", () => {
  assert.equal(kindConfigProblem("nope", {}), "That question type does not exist.");
  assert.match(kindConfigProblem("dropdown", { options: ["a"] })!, /2 to 50/);
  assert.equal(kindConfigProblem("dropdown", { options: ["a", "b"] }), null);
  assert.match(kindConfigProblem("number", { min: 5, max: 1 })!, /minimum/);
  assert.match(kindConfigProblem("date", { min: "2026-02-30" })!, /YYYY-MM-DD/);
  assert.match(kindConfigProblem("agree_scale", { points: 6 })!, /5 or 7/);
  assert.match(kindConfigProblem("agree_scale", { points: 5, labels: ["a"] })!, /5 labels/);
  assert.match(kindConfigProblem("slider", { min: 0, max: 10, step: 3 })!, /evenly/);
  assert.match(kindConfigProblem("slider", { min: 10, max: 0 })!, /above its start/);
  assert.match(kindConfigProblem("contact", { fields: [] })!, /at least one/);
  assert.match(kindConfigProblem("file_upload", { max_mb: 50 })!, /1 to 10/);
  assert.match(kindConfigProblem("consent", { statement: " " })!, /statement/);
  assert.match(kindConfigProblem("price_ladder", { prices: [10, 5] })!, /go up/);
  assert.match(kindConfigProblem("image_choice", { options: ["a", "b"], images: ["http://x.test/a.png", "https://x.test/b.png"] })!, /https/);
  assert.match(kindConfigProblem("single_choice", { options: ["a", "b"], quiz: { correct: ["z"] } })!, /correct/);
  assert.match(kindConfigProblem("single_choice", { options: ["a", "b"], quiz: { correct: ["a", "b"] } })!, /one correct/);
  assert.equal(kindConfigProblem("single_choice", { options: ["a", "b"], quiz: { correct: ["a"], points: 3 } }), null);
});

test("lvApi.questionConfigProblem keeps the choice rule and adds the v2 kinds", () => {
  assert.equal(questionConfigProblem("single_choice", { options: ["a"] }), "A choice question needs 2 to 10 options.");
  assert.equal(questionConfigProblem("rating", {}), null);
  assert.match(questionConfigProblem("ranking", { options: ["a"] })!, /2 to 10/);
  assert.equal(questionConfigProblem("nps", {}), null);
});

test("answer rules mirror lv.check_answer_value", () => {
  assert.equal(answerValueProblem("face_scale", {}, 5), null);
  assert.ok(answerValueProblem("face_scale", {}, 6));
  assert.equal(answerValueProblem("dropdown", { options: ["a", "b"] }, "a"), null);
  assert.ok(answerValueProblem("dropdown", { options: ["a", "b"] }, "z"));
  assert.ok(answerValueProblem("number", { min: 1, max: 10, integer: true }, 4.5));
  assert.equal(answerValueProblem("number", { min: 1, max: 10, integer: true }, 4), null);
  assert.ok(answerValueProblem("date", { min: "2026-01-01" }, "2025-12-31"));
  assert.equal(answerValueProblem("nps", {}, 0), null);
  assert.ok(answerValueProblem("nps", {}, 11));
  assert.equal(answerValueProblem("agree_scale", { points: 7 }, 7), null);
  assert.ok(answerValueProblem("agree_scale", {}, 7));
  assert.equal(answerValueProblem("ranking", { options: ["a", "b"] }, ["b", "a"]), null);
  assert.ok(answerValueProblem("ranking", { options: ["a", "b"] }, ["a"]));
  assert.equal(answerValueProblem("slider", { min: 0, max: 10, step: 2 }, 4), null);
  assert.ok(answerValueProblem("slider", { min: 0, max: 10, step: 2 }, 5));
  assert.equal(answerValueProblem("contact", { fields: ["email"] }, { email: "a@b.co" }), null);
  assert.ok(answerValueProblem("contact", { fields: ["email"] }, { email: "nope" }));
  assert.equal(answerValueProblem("agree_grid", { rows: ["a", "b"] }, { a: 1, b: 5 }), null);
  assert.ok(answerValueProblem("agree_grid", { rows: ["a", "b"] }, { a: 1 }));
  assert.equal(answerValueProblem("before_after", {}, { before: 1, after: 5 }), null);
  assert.equal(answerValueProblem("consent", {}, true), null);
  assert.ok(answerValueProblem("consent", {}, false));
  assert.equal(answerValueProblem("signature", {}, "Ada Lovelace"), null);
  assert.equal(answerValueProblem("price_ladder", { prices: [5, 10] }, "none"), null);
  assert.ok(answerValueProblem("price_ladder", { prices: [5, 10] }, 7));
  assert.equal(answerValueProblem("file_upload", { max_mb: 1 }, { path: "c/a/x-a.png", name: "a.png", size: 10, type: "image/png" }), null);
  assert.ok(answerValueProblem("file_upload", { max_mb: 1 }, { path: "c/a/x-a.exe", name: "a.exe", size: 10, type: "application/x-msdownload" }));
});

test("identity answers never become chart bars; a ranking counts first choices; a grid one key per statement", () => {
  assert.deepEqual(answerKeys("contact", { name: "Ada", email: "a@b.co" }), []);
  assert.deepEqual(answerKeys("signature", "Ada Lovelace"), []);
  assert.deepEqual(answerKeys("file_upload", { path: "x", name: "n", size: 1, type: "image/png" }), []);
  assert.deepEqual(answerKeys("ranking", ["b", "a"]), ["b"]);
  assert.deepEqual(answerKeys("agree_grid", { a: 4, b: 2 }), ["a: 4", "b: 2"]);
  assert.deepEqual(answerKeys("before_after", { before: 2, after: 4 }), ["before: 2", "after: 4"]);
  assert.deepEqual(answerKeys("nps", 9), ["9"]);
  assert.deepEqual(answerKeys("multi_choice", ["a", "b"]), ["a", "b"]);
});

test("NPS = % promoters (9-10) minus % detractors (0-6); withheld cells give no score", () => {
  const cells = [{ key: "10", n: 5 }, { key: "9", n: 3 }, { key: "8", n: 4 }, { key: "3", n: 8 }];
  const r = npsScore(cells)!;
  assert.deepEqual([r.promoters, r.passives, r.detractors, r.n], [8, 4, 8, 20]);
  assert.equal(r.score, 0);
  assert.equal(npsScore([{ key: "10", n: 9 }, { key: "7", n: 1 }])!.score, 90);
  assert.equal(npsScore([{ key: "10", n: 9 }, { key: null, n: null, suppressed: true }]), null);
  assert.equal(npsScore([]), null);
});

test("quiz points: the right answer earns the points, anything else zero", () => {
  const cfg = { options: ["a", "b"], quiz: { correct: ["a"], points: 3 } };
  assert.equal(quizPoints(cfg, "a"), 3);
  assert.equal(quizPoints(cfg, "b"), 0);
  assert.equal(quizPoints({ options: ["a", "b"] }, "a"), 0);
  assert.equal(quizPoints({ options: ["a", "b", "c"], quiz: { correct: ["a", "b"] } }, ["b", "a"]), 1);
  assert.equal(quizPoints({ options: ["a", "b", "c"], quiz: { correct: ["a", "b"] } }, ["a"]), 0);
});
