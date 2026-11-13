import test from "node:test";
import assert from "node:assert/strict";
import { dataTable, findingTitle, focusOption, toData, trendChange } from "./chartData.ts";
import type { TrendPoint } from "./lvApi.ts";

const cells = [
  { key: "Hall", n: 12, suppressed: false, reason: null },
  { key: "Desk", n: 7, suppressed: false, reason: null },
];

test("a finding leads with the top answer, from released counts", () => {
  assert.match(findingTitle("single_choice", "Where do you eat?", toData("single_choice", cells)), /“Hall” leads/);
});

test("a withheld cell removes the finding: the title is just the question", () => {
  const withheld = [...cells, { key: null, n: null, suppressed: true, reason: "below_min_cohort" as const }];
  assert.equal(findingTitle("single_choice", "Where do you eat?", toData("single_choice", withheld)), "Where do you eat?");
});

test("yes/no wording follows the counts", () => {
  const yn = toData("yes_no", [{ key: "true", n: 9, suppressed: false, reason: null }, { key: "false", n: 6, suppressed: false, reason: null }]);
  assert.match(findingTitle("yes_no", "Again?", yn), /More said yes/);
});

test("the data table shows Withheld, never 0", () => {
  const t = dataTable("c", "single_choice", toData("single_choice", [{ key: null, n: null, suppressed: true, reason: null }]));
  assert.equal(t.rows[0]![1], "Withheld");
});

const pt = (state: TrendPoint["state"], extra: Partial<TrendPoint> = {}): TrendPoint => ({ campaign_id: "c", question_id: "q", state, ...extra });

test("rating change is the difference of the released means", () => {
  const points = [pt("released", { mean: 3.5 }), pt("released", { mean: 4.1 })];
  assert.equal(trendChange("rating", points, 1).text, "+0.60 stars");
  assert.equal(trendChange("rating", points, 0).direction, "none");
});

test("change is never computed across a withheld run", () => {
  const points = [pt("released", { mean: 3 }), pt("withheld"), pt("released", { mean: 4 })];
  assert.equal(trendChange("rating", points, 1).text, "Withheld");
  assert.equal(trendChange("rating", points, 2).direction, "none");
});

test("choice change uses the shares the server gave, and says when it has none", () => {
  const a = pt("released", { options: [{ key: "true", n: 5, suppressed: false, share: 0.5 }] });
  const b = pt("released", { options: [{ key: "true", n: 7, suppressed: false, share: 0.7 }] });
  assert.equal(trendChange("yes_no", [a, b], 1).text, "+20 points");
  const c = pt("released", { any_withheld: true, options: [{ key: "true", n: 7, suppressed: false, share: null }] });
  assert.equal(trendChange("yes_no", [a, c], 1).direction, "none");
});

test("focus option is yes for yes/no and the latest leader otherwise", () => {
  assert.equal(focusOption("yes_no", []), "true");
  const p = pt("released", { options: [{ key: "A", n: 2, suppressed: false, share: 0.2 }, { key: "B", n: 8, suppressed: false, share: 0.8 }] });
  assert.equal(focusOption("single_choice", [p]), "B");
});
