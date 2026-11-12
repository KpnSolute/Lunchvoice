import test from "node:test";
import assert from "node:assert/strict";
import { BADGES, hubBadges } from "../config/badges";

test("a Hub shows only the badges its data earns", () => {
  assert.deepEqual(hubBadges({}), []);
  assert.deepEqual(hubBadges({ plan: { family: "starter", product: "starter_hub", state: "active" } }), []);
  assert.deepEqual(hubBadges({ plan: { family: "starter", product: "founding", state: "active" } }), ["founding"]);
  assert.deepEqual(hubBadges({ plan: { family: "team", product: "team_hub", state: "active" } }), ["team"]);
  assert.deepEqual(hubBadges({ plan: { family: "team", product: "team_hub", state: "expired" } }), [], "an ended plan earns nothing");
  assert.deepEqual(hubBadges({ listed: true, plan: { family: "team", product: "team_hub", state: "active" } }), ["discover", "team"]);
});

test("every badge says what it means in words", () => {
  for (const [k, b] of Object.entries(BADGES)) {
    assert.ok(b.label.length > 2 && b.meaning.length > 20, k);
    assert.match(b.meaning, /\.$/, `${k} meaning is a sentence`);
  }
});
