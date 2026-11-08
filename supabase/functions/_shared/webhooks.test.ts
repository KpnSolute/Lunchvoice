import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { classifyStatus, dispatchWebhooks, signWebhook, verifyWebhookSignature, webhookUrlAllowed, type WebhookDelivery } from "./webhooks.ts";

const SECRET = "lvwh_" + "1".repeat(48);
const BODY = JSON.stringify({ id: "e1", type: "campaign.published", data: { campaign_id: "c1" } });
const NOW = 1_800_000_000;

test("the signature is HMAC-SHA256 over `t.body` in the t=,v1= format", async () => {
  const header = await signWebhook(SECRET, BODY, NOW);
  assert.equal(header, `t=${NOW},v1=${createHmac("sha256", SECRET).update(`${NOW}.${BODY}`).digest("hex")}`);
});

test("receiver verification accepts a fresh correct signature and rejects tampering, other secrets and replays", async () => {
  const header = await signWebhook(SECRET, BODY, NOW);
  assert.equal(await verifyWebhookSignature(BODY, header, SECRET, NOW), true);
  assert.equal(await verifyWebhookSignature(BODY + " ", header, SECRET, NOW), false);
  assert.equal(await verifyWebhookSignature(BODY, header, "lvwh_" + "2".repeat(48), NOW), false);
  assert.equal(await verifyWebhookSignature(BODY, header, SECRET, NOW + 301), false);
  assert.equal(await verifyWebhookSignature(BODY, header, undefined, NOW), false);
  assert.equal(await verifyWebhookSignature(BODY, "garbage", SECRET, NOW), false);
});

test("URL guard: https and public host names only", () => {
  assert.equal(webhookUrlAllowed("https://hooks.northside-running.org/lv"), true);
  for (const u of ["http://hooks.northside-running.org/lv", "https://10.0.0.1/x", "https://localhost/x", "https://db.internal/x",
                   "https://[::1]/x", "https://user:pw@hooks.northside-running.org/", "https://abc.supabase.co/functions", "not a url"]) {
    assert.equal(webhookUrlAllowed(u), false, u);
  }
});

test("status classification", () => {
  assert.equal(classifyStatus(200), "delivered");
  assert.equal(classifyStatus(204), "delivered");
  assert.equal(classifyStatus(429), "retry");
  assert.equal(classifyStatus(503), "retry");
  assert.equal(classifyStatus(301), "failed");
  assert.equal(classifyStatus(404), "failed");
});

test("dispatcher signs each delivery, never follows redirects, and marks outcomes", async () => {
  const deliveries: WebhookDelivery[] = [
    { id: "d1", url: "https://hooks.northside-running.org/ok", secret: SECRET, event: "campaign.published", body: { id: "e1" }, attempts: 1 },
    { id: "d2", url: "https://hooks.northside-running.org/down", secret: SECRET, event: "campaign.closed", body: { id: "e2" }, attempts: 1 },
    { id: "d3", url: "https://10.0.0.1/evil", secret: SECRET, event: "campaign.closed", body: { id: "e3" }, attempts: 1 },
  ];
  const marks: [string, string, number | null][] = [];
  const seen: RequestInit[] = [];
  let swept = 0;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    seen.push(init);
    const headers = init.headers as Record<string, string>;
    assert.equal(await verifyWebhookSignature(String(init.body), headers["LunchVoice-Signature"], SECRET, NOW), true);
    return new Response("", { status: String(url).endsWith("/ok") ? 200 : 503 });
  }) as unknown as typeof fetch;
  const r = await dispatchWebhooks({
    fetch: fakeFetch,
    now: () => NOW * 1000,
    db: {
      async sweep() { swept++; },
      async claim() { return deliveries; },
      async mark(id, result, status) { marks.push([id, result, status]); },
    },
  });
  assert.equal(swept, 1);
  assert.deepEqual(r, { ok: true, claimed: 3, delivered: 1, retried: 1, failed: 1 });
  assert.deepEqual(marks, [["d1", "delivered", 200], ["d2", "retry", 503], ["d3", "failed", null]]);
  assert.equal(seen.length, 2, "the internal address is never fetched");
  assert.ok(seen.every((i) => i.redirect === "manual"));
});
