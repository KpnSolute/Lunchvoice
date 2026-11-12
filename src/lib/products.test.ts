import { test } from "node:test";
import assert from "node:assert/strict";
import { PRODUCTS, productBySlug, productPlanRows } from "../config/products";
import { PLANS } from "../config/pricing";

test("the six founder-approved products, each complete", () => {
  assert.deepEqual(PRODUCTS.map((p) => p.slug), ["hubs", "feedback", "campaigns", "discord", "developers", "privacy"]);
  for (const p of PRODUCTS) {
    assert.ok(p.title.length <= 60, `${p.slug}: title fits a search result`);
    assert.ok(p.description.length <= 160, `${p.slug}: description fits a search result`);
    assert.ok(p.audience.length >= 3 && p.points.length === 4, p.slug);
    for (const r of p.related) assert.ok(productBySlug(r), `${p.slug}: related ${r} exists`);
    for (const id of p.plans) assert.ok(PLANS.some((x) => x.id === id), `${p.slug}: plan ${id} exists`);
    for (const r of p.planRows) assert.ok(Boolean(r.key) !== Boolean(r.cells), `${p.slug}: "${r.label}" is either a map key or fixed cells`);
  }
});

test("plan rows come from the entitlement map and are never guessed", () => {
  const hubs = productBySlug("hubs")!;
  const none = productPlanRows(hubs, null);
  assert.ok(none.every((r) => !hubs.planRows.find((x) => x.label === r.label)?.key), "without a map only fixed rows show");
  const rows = productPlanRows(hubs, { free: {}, starter: { "roles.max_custom": 3, "community.newsroom": true }, team: { "roles.max_custom": 6, "community.newsroom": true, "discover.min_members": 700 } });
  assert.deepEqual(rows.find((r) => r.label === "Custom roles")?.cells, [false, "3", "6"]);
  assert.deepEqual(rows.find((r) => r.label === "Newsroom")?.cells, [false, true, true]);
  assert.deepEqual(rows.find((r) => r.label.startsWith("Apply for Discover"))?.cells, [false, false, "700"]);
  assert.equal(rows.find((r) => r.label === "Shop items"), undefined, "a key the map lacks is left out");
});

test("nothing planned is sold as available", () => {
  const text = JSON.stringify(PRODUCTS).toLowerCase();
  for (const word of ["elections?", "hub pulse", "missions?", "recaps?", "ai", "trends?", "achievements?"]) assert.ok(!new RegExp(`\\b${word}\\b`).test(text), word);
});
