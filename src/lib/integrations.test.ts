import { test } from "node:test";
import assert from "node:assert/strict";
import { API_SCOPE_ORDER, integrationsApi, maskedKey, SCOPE_LABELS, webhookUrlProblem } from "./integrationsApi.ts";
import { integrationsHandle, type IntegrationsCtx } from "./mockIntegrations.ts";
import { slugProblem } from "./reservedSlugs.ts";

test("every scope has a label and the order matches the backend scope set", () => {
  assert.deepEqual(API_SCOPE_ORDER, ["campaigns:read", "campaigns:write", "invites:write", "results:read", "webhooks:manage"]);
  for (const s of API_SCOPE_ORDER) assert.ok(SCOPE_LABELS[s].length > 0);
});

test("keys are shown masked from their prefix only", () => {
  assert.equal(maskedKey("lvk_0123456789ab"), "lvk_0123456789ab_••••••••");
});

test("webhook URL hints mirror the backend rule", () => {
  assert.equal(webhookUrlProblem("https://hooks.northside-running.org/lv"), null);
  for (const u of ["http://hooks.northside-running.org", "https://10.0.0.1/x", "https://localhost/x", "https://db.internal/x", "nope"]) {
    assert.notEqual(webhookUrlProblem(u), null, u);
  }
});

test("the client calls the documented lv_api functions with p_ arguments", async () => {
  const calls: [string, unknown][] = [];
  const c = integrationsApi(async (fn, args) => { calls.push([fn, args]); return { ok: true } as never; });
  await c.apiKeyCreate("hub-1", "Sync", ["campaigns:read"]);
  await c.discordLinkConfirm("ABC", "2026-11-08", true);
  await c.webhookUpdate("wh-1", { enabled: false });
  assert.deepEqual(calls, [
    ["lv_api_key_create", { p_hub: "hub-1", p_name: "Sync", p_scopes: ["campaigns:read"] }],
    ["lv_discord_link_confirm", { p_code: "ABC", p_consent_version: "2026-11-08", p_role_facts: true }],
    ["lv_webhook_update", { p_endpoint: "wh-1", p_events: null, p_enabled: false }],
  ]);
});

const ctx = (family: "starter" | "team"): IntegrationsCtx => ({
  s: { n: 0, hubs: [{ hub_id: "h1", slug: "northside-running", name: "Northside Running Club", kind: "community", members: [{ account_id: "mock-account", is_owner: true, status: "accepted" }] }] },
  family: () => family,
});

test("mock: keys are Team only and the secret appears once", () => {
  const starter = ctx("starter");
  assert.equal((integrationsHandle(starter, "lv_api_key_create", { p_hub: "h1", p_name: "x", p_scopes: ["campaigns:read"] }) as { error: { code: string } }).error.code, "lv_entitlement_required");
  const team = ctx("team");
  const r = integrationsHandle(team, "lv_api_key_create", { p_hub: "h1", p_name: "Sync", p_scopes: ["results:read"] }) as { secret: string; key: { prefix: string } };
  assert.match(r.secret, /^lvk_[0-9a-f]{12}_[0-9a-f]{48}$/);
  const list = JSON.stringify(integrationsHandle(team, "lv_api_keys_list", { p_hub: "h1" }));
  assert.ok(list.includes(r.key.prefix));
  assert.ok(!list.includes(r.secret));
});

test("mock: a Discord link code works once", () => {
  const c = ctx("starter");
  const code = "A".repeat(20);
  assert.equal((integrationsHandle(c, "lv_discord_link_confirm", { p_code: code, p_consent_version: "2026-11-08", p_role_facts: false }) as { ok: boolean }).ok, true);
  assert.equal((integrationsHandle(c, "lv_discord_code_preview", { p_code: code }) as { error: { code: string } }).error.code, "lv_invalid_code");
});

test("the new routes can never be claimed as Hub addresses", () => {
  for (const s of ["developers", "connect", "webhooks"]) assert.equal(slugProblem(s), "reserved");
});
