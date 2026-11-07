import { strict as assert } from "node:assert";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { mapStripeEvent, parseSignatureHeader, timingSafeEqualHex, verifyStripeSignature } from "./billing.ts";

const SECRET = "whsec_test_not_a_real_secret";
const BODY = JSON.stringify({ id: "evt_1", type: "invoice.paid", data: { object: { subscription: "sub_1" } } });
const NOW = 1_800_000_000;
const sign = (t: number, body = BODY, secret = SECRET) => createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");

test("a correct signature verifies", async () => {
  assert.deepEqual(await verifyStripeSignature(BODY, `t=${NOW},v1=${sign(NOW)}`, SECRET, NOW), { ok: true });
});

test("any one of several v1 signatures may match (secret rotation)", async () => {
  const header = `t=${NOW},v1=${"0".repeat(64)},v1=${sign(NOW)},v0=ignored`;
  assert.deepEqual(await verifyStripeSignature(BODY, header, SECRET, NOW), { ok: true });
});

test("a wrong signature, a tampered body or another secret fail", async () => {
  assert.deepEqual(await verifyStripeSignature(BODY, `t=${NOW},v1=${"a".repeat(64)}`, SECRET, NOW), { ok: false, reason: "mismatch" });
  assert.deepEqual(await verifyStripeSignature(BODY + " ", `t=${NOW},v1=${sign(NOW)}`, SECRET, NOW), { ok: false, reason: "mismatch" });
  assert.deepEqual(await verifyStripeSignature(BODY, `t=${NOW},v1=${sign(NOW, BODY, "whsec_other")}`, SECRET, NOW), { ok: false, reason: "mismatch" });
});

test("a stale or future timestamp beyond 300 s fails, even with a valid signature (replay)", async () => {
  assert.deepEqual(await verifyStripeSignature(BODY, `t=${NOW - 301},v1=${sign(NOW - 301)}`, SECRET, NOW), { ok: false, reason: "stale" });
  assert.deepEqual(await verifyStripeSignature(BODY, `t=${NOW + 301},v1=${sign(NOW + 301)}`, SECRET, NOW), { ok: false, reason: "stale" });
  assert.deepEqual(await verifyStripeSignature(BODY, `t=${NOW - 300},v1=${sign(NOW - 300)}`, SECRET, NOW), { ok: true });
});

test("an unset secret fails closed", async () => {
  assert.deepEqual(await verifyStripeSignature(BODY, `t=${NOW},v1=${sign(NOW)}`, undefined, NOW), { ok: false, reason: "no_secret" });
  assert.deepEqual(await verifyStripeSignature(BODY, `t=${NOW},v1=${sign(NOW)}`, "", NOW), { ok: false, reason: "no_secret" });
});

test("missing or malformed headers fail", async () => {
  for (const header of [null, undefined, "", "t=abc,v1=xyz", `v1=${sign(NOW)}`, `t=${NOW}`, `t=${NOW},v1=short`]) {
    assert.deepEqual(await verifyStripeSignature(BODY, header, SECRET, NOW), { ok: false, reason: "malformed" });
  }
  assert.equal(parseSignatureHeader("x".repeat(5000)), null);
});

test("timing-safe comparison", () => {
  assert.equal(timingSafeEqualHex("abcd", "abcd"), true);
  assert.equal(timingSafeEqualHex("abcd", "abce"), false);
  assert.equal(timingSafeEqualHex("abcd", "abc"), false);
});

const ACCOUNT = "11111111-2222-4333-8444-555555555555";
const HUB = "66666666-7777-4888-8999-aaaaaaaaaaaa";

test("checkout.session.completed maps the intent and metadata only", () => {
  const mapped = mapStripeEvent({
    id: "evt_c", type: "checkout.session.completed",
    data: { object: { client_reference_id: ACCOUNT, subscription: "sub_9", payment_intent: null, customer_email: "pat@example.com",
      metadata: { product: "starter_hub", account_id: ACCOUNT, hub_id: HUB, weeks: "3", slug: "my-hub", extra: "dropped" } } },
  });
  assert.deepEqual(mapped, {
    provider: "stripe", eventId: "evt_c", type: "checkout.session.completed",
    payload: { product: "starter_hub", account_id: ACCOUNT, hub_id: HUB, slug: "my-hub", weeks: 3, intent_id: ACCOUNT, subscription: "sub_9" },
  });
  assert.equal(JSON.stringify(mapped).includes("pat@example.com"), false);
});

test("bad metadata values are dropped, not passed through", () => {
  const mapped = mapStripeEvent({ id: "evt_d", type: "checkout.session.completed",
    data: { object: { metadata: { account_id: "not-a-uuid", slug: "Bad Slug!", weeks: "many" } } } });
  assert.deepEqual(mapped?.payload, {});
});

test("invoice.paid maps the subscription and period end", () => {
  assert.deepEqual(mapStripeEvent({ id: "evt_i", type: "invoice.paid",
    data: { object: { subscription: "sub_1", lines: { data: [{ period: { end: 1900000000 } }] } } } })?.payload,
    { subscription: "sub_1", period_end: 1900000000 });
  assert.deepEqual(mapStripeEvent({ id: "evt_j", type: "invoice.paid",
    data: { object: { parent: { subscription_details: { subscription: "sub_2" } }, period_end: 1900000001 } } })?.payload,
    { subscription: "sub_2", period_end: 1900000001 });
});

test("customer.subscription.deleted keeps access to the period end", () => {
  assert.deepEqual(mapStripeEvent({ id: "evt_s", type: "customer.subscription.deleted",
    data: { object: { id: "sub_1", items: { data: [{ current_period_end: 1900000002 }] } } } })?.payload,
    { subscription: "sub_1", period_end: 1900000002 });
});

test("charge.refunded maps the payment reference", () => {
  assert.deepEqual(mapStripeEvent({ id: "evt_r", type: "charge.refunded", data: { object: { payment_intent: "pi_1" } } })?.payload,
    { payment_ref: "pi_1" });
});

test("unknown types and malformed events are ignored", () => {
  assert.equal(mapStripeEvent({ id: "evt_x", type: "customer.created", data: { object: {} } }), null);
  assert.equal(mapStripeEvent({ type: "invoice.paid", data: { object: {} } }), null);
  assert.equal(mapStripeEvent("nope"), null);
  assert.equal(mapStripeEvent(null), null);
});
