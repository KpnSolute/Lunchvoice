import test from "node:test";
import assert from "node:assert/strict";
import { CREATOR_PLANS, PLANS, capabilityRows } from "../config/pricing.ts";

// 000053: live results and individual responses are stated on Creator Plus and up, and never on the waiting plans.
test("live results copy sits on Creator Plus, Team Hub and Campaign Plus only", () => {
  const live = "Live results and individual responses";
  assert.ok(CREATOR_PLANS.find((p) => p.id === "creator_plus")!.features.includes(live));
  assert.ok(PLANS.find((p) => p.id === "team")!.features.includes(live));
  assert.ok(PLANS.find((p) => p.id === "campaign_plus")!.features.includes(live));
  for (const id of ["free", "starter", "campaign_starter"]) assert.ok(!PLANS.find((p) => p.id === id)!.features.includes(live), id);
  const row = capabilityRows().find((r) => r.label === "Results")!;
  assert.deepEqual(row.cells.map((c) => c === live), [false, false, true, false, true]);
});
