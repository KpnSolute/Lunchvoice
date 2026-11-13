import { test } from "node:test";
import assert from "node:assert/strict";
import { barsFor, cloudSize, justAnswered, shortLink, wordCloud } from "./present.ts";
import type { Cell } from "./lvApi.ts";

const cell = (key: string | null, n: number | null, suppressed = false): Cell => ({ key, n, suppressed, reason: suppressed ? "below_min_cohort" : null });

test("choice bars show every option, with counts and percent that add up", () => {
  const r = barsFor({ kind: "single_choice", config: { options: ["Reds", "Blues", "Greens"] } }, [cell("Reds", 3), cell("Blues", 1)], false);
  assert.deepEqual(r.bars.map((b) => [b.label, b.n, b.pct]), [["Reds", 3, 75], ["Blues", 1, 25], ["Greens", 0, 0]]);
  assert.equal(r.total, 4);
});

test("a withheld cell is never turned into zero, and no percent is guessed", () => {
  const r = barsFor({ kind: "single_choice", config: { options: ["A", "B"] } }, [cell("A", 6), cell(null, null, true)], false);
  assert.equal(r.total, null);
  assert.deepEqual(r.bars.map((b) => [b.key, b.n, b.pct]), [["A", 6, null], ["B", null, null]]);
});

test("a withheld question has no numbers at all", () => {
  const r = barsFor({ kind: "yes_no", config: {} }, [], true);
  assert.deepEqual(r.bars.map((b) => b.n), [null, null]);
  assert.equal(r.total, null);
});

test("ratings show a bar per score and the average", () => {
  const r = barsFor({ kind: "rating", config: {} }, [cell("5", 2), cell("3", 2)], false);
  assert.equal(r.bars.length, 5);
  assert.equal(r.average, 4);
  assert.equal(r.bars[0]!.n, 0);
});

test("no answers yet is zero only when nothing is withheld", () => {
  const r = barsFor({ kind: "yes_no", config: {} }, [], false);
  assert.deepEqual(r.bars.map((b) => [b.label, b.n, b.pct]), [["Yes", 0, 0], ["No", 0, 0]]);
});

test("word cloud drops stop words, counts case-insensitively, most frequent first", () => {
  const w = wordCloud(["The pizza was great", "Great PIZZA!", "pizza and salad"]);
  assert.deepEqual(w.slice(0, 2), [{ word: "pizza", n: 3 }, { word: "great", n: 2 }]);
  assert.ok(!w.some((x) => x.word === "the" || x.word === "and"));
});

test("cloud sizes stay inside the range", () => {
  assert.equal(cloudSize(1, 5), 1.1);
  assert.equal(cloudSize(5, 5), 3.4);
  assert.equal(cloudSize(1, 1), 2.25);
});

test("just answered lists the newest distinct names", () => {
  assert.equal(justAnswered(["Ana", null, "Jordan", "Ana", "Sam", "Lee"]), "Ana, Jordan and Sam");
  assert.equal(justAnswered([null]), "");
  assert.equal(justAnswered(["Ana"]), "Ana");
});

test("short link", () => assert.equal(shortLink("lunchvoice.com", "AB12CD"), "lunchvoice.com/c/AB12CD"));
