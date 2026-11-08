import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { API_SCOPES, buildArgs, FixedWindowLimiter, hasScope, keyPrefix, OP_SCOPES, parseApiKey, route, sha256Hex, statusFor } from "./api.ts";

const KEY = "lvk_0123456789ab_" + "c".repeat(48);
const ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";

test("key parsing: Bearer or X-Api-Key, exact format only", () => {
  assert.equal(parseApiKey(`Bearer ${KEY}`), KEY);
  assert.equal(parseApiKey(`bearer   ${KEY}`), KEY);
  assert.equal(parseApiKey(null, KEY), KEY);
  for (const bad of ["", "Bearer", `Basic ${KEY}`, `Bearer ${KEY}x`, "Bearer lvk_short_abc", `Bearer ${KEY.toUpperCase()}`]) {
    assert.equal(parseApiKey(bad), null, bad);
  }
  assert.equal(keyPrefix(KEY), "lvk_0123456789ab");
});

test("key hashing matches SHA-256 hex (what lv.sha256_hex stores)", async () => {
  assert.equal(await sha256Hex(KEY), createHash("sha256").update(KEY).digest("hex"));
});

test("routing: every documented route and its operation", () => {
  const cases: [string, string, string, Record<string, string>][] = [
    ["GET", "/api/v1/hub", "hub.get", {}],
    ["GET", "/functions/v1/api/v1/campaigns", "campaigns.list", {}],
    ["POST", "/api/v1/campaigns/", "campaigns.create", {}],
    ["GET", `/api/v1/campaigns/${ID}`, "campaigns.get", { campaign_id: ID }],
    ["PATCH", `/api/v1/campaigns/${ID}`, "campaigns.update", { campaign_id: ID }],
    ["POST", `/api/v1/campaigns/${ID}/questions`, "campaigns.questions.add", { campaign_id: ID }],
    ["POST", `/api/v1/campaigns/${ID}/schedule`, "campaigns.schedule", { campaign_id: ID }],
    ["POST", `/api/v1/campaigns/${ID}/publish`, "campaigns.publish", { campaign_id: ID }],
    ["POST", `/api/v1/campaigns/${ID}/close`, "campaigns.close", { campaign_id: ID }],
    ["POST", `/api/v1/campaigns/${ID}/invites`, "campaigns.invites.create", { campaign_id: ID }],
    ["GET", `/api/v1/campaigns/${ID.toUpperCase()}/results`, "results.get", { campaign_id: ID }],
    ["POST", "/api/v1/invites", "invites.create", {}],
    ["GET", "/api/v1/webhooks", "webhooks.list", {}],
    ["POST", "/api/v1/webhooks", "webhooks.create", {}],
    ["PATCH", `/api/v1/webhooks/${ID}`, "webhooks.update", { endpoint_id: ID }],
    ["DELETE", `/api/v1/webhooks/${ID}`, "webhooks.delete", { endpoint_id: ID }],
  ];
  for (const [m, p, op, params] of cases) assert.deepEqual(route(m, p), { ok: true, op, params }, `${m} ${p}`);
});

test("routing: unknown paths are 404, wrong methods 405 with Allow", () => {
  assert.deepEqual(route("GET", "/api/v1/nope"), { ok: false, status: 404 });
  assert.deepEqual(route("GET", "/api/v1/campaigns/not-a-uuid"), { ok: false, status: 404 });
  assert.deepEqual(route("GET", "/api/v2/campaigns"), { ok: false, status: 404 });
  const r = route("DELETE", "/api/v1/campaigns");
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 405);
  assert.deepEqual(!r.ok && r.allow, ["GET", "POST"]);
});

test("scope checks: every operation needs exactly one known scope", () => {
  for (const scope of Object.values(OP_SCOPES)) assert.ok((API_SCOPES as readonly string[]).includes(scope));
  assert.equal(hasScope(["campaigns:read"], "campaigns.list"), true);
  assert.equal(hasScope(["campaigns:read"], "campaigns.publish"), false);
  assert.equal(hasScope(["campaigns:write"], "results.get"), false);
  assert.equal(hasScope(["results:read"], "results.get"), true);
  assert.equal(hasScope([], "hub.get"), false);
});

test("arguments: typed fields, required fields, unknown fields refused", () => {
  assert.deepEqual(buildArgs("campaigns.create", {}, { title: "Long run", mode: "poll" }), { ok: true, args: { title: "Long run", mode: "poll" } });
  assert.equal(buildArgs("campaigns.create", {}, {}).ok, false);
  assert.equal(buildArgs("campaigns.create", {}, { title: "x", hub_id: "other" }).ok, false);
  assert.equal(buildArgs("campaigns.questions.add", { campaign_id: ID }, { position: "1", kind: "rating", prompt: "?" }).ok, false);
  assert.deepEqual(buildArgs("campaigns.schedule", { campaign_id: ID }, { closes_at: "2026-12-01T00:00:00Z" }),
    { ok: true, args: { campaign_id: ID, closes_at: "2026-12-01T00:00:00Z" } });
  assert.equal(buildArgs("campaigns.schedule", { campaign_id: ID }, { closes_at: "soon" }).ok, false);
  assert.equal(buildArgs("campaigns.list", {}, []).ok, false);
  // The path parameter cannot be overridden from the body.
  assert.equal(buildArgs("campaigns.publish", { campaign_id: ID }, { campaign_id: "other" }).ok, false);
});

test("HTTP status mapping", () => {
  assert.equal(statusFor({ ok: true }), 200);
  const s = (code: string) => statusFor({ ok: false, error: { code } });
  assert.equal(s("lv_unauthenticated"), 401);
  assert.equal(s("lv_entitlement_required"), 402);
  assert.equal(s("lv_forbidden"), 403);
  assert.equal(s("lv_not_found"), 404);
  assert.equal(s("lv_gate_blocked"), 409);
  assert.equal(s("lv_rate_limited"), 429);
  assert.equal(s("lv_invalid_input"), 400);
  assert.equal(s("lv_server_error"), 500);
});

test("rate limiting: fixed window per key, resets each window", () => {
  const lim = new FixedWindowLimiter(2, 60_000);
  const t0 = 1_800_000_000_000;
  assert.equal(lim.hit("a", t0), null);
  assert.equal(lim.hit("a", t0 + 1), null);
  const wait = lim.hit("a", t0 + 2);
  assert.ok(wait !== null && wait >= 1 && wait <= 60);
  assert.equal(lim.hit("b", t0 + 3), null, "keys are independent");
  assert.equal(lim.hit("a", t0 + 60_000), null, "a new window starts fresh");
});
