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
      amount_subtotal: 1300, amount_total: 1404, currency: "USD", payment_status: "paid", mode: "subscription",
      metadata: { product: "starter_hub", account_id: ACCOUNT, hub_id: HUB, weeks: "3", slug: "my-hub", extra: "dropped" } } },
  });
  assert.deepEqual(mapped, {
    provider: "stripe", eventId: "evt_c", type: "checkout.session.completed",
    payload: { product: "starter_hub", account_id: ACCOUNT, hub_id: HUB, slug: "my-hub", weeks: 3, intent_id: ACCOUNT, subscription: "sub_9",
               amount_subtotal: 1300, currency: "usd", payment_status: "paid", mode: "subscription" },
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
  assert.deepEqual(mapStripeEvent({ id: "evt_s2", type: "customer.subscription.deleted",
    data: { object: { id: "sub_2", current_period_end: 1900000009, ended_at: 1800000000 } } })?.payload,
    { subscription: "sub_2", period_end: 1900000009, ended_at: 1800000000 });
});

test("charge.refunded maps the payment reference and whether the refund is full", () => {
  assert.deepEqual(mapStripeEvent({ id: "evt_r", type: "charge.refunded", data: { object: { payment_intent: "pi_1" } } })?.payload,
    { payment_ref: "pi_1" });
  assert.deepEqual(mapStripeEvent({ id: "evt_r2", type: "charge.refunded",
    data: { object: { payment_intent: "pi_2", amount: 1900, amount_refunded: 500, refunded: false } } })?.payload,
    { payment_ref: "pi_2", amount: 1900, amount_refunded: 500, refunded: false });
});

test("NEW-01: a checkout maps the confirmed amount, currency, payment status and mode", () => {
  const mapped = mapStripeEvent({ id: "evt_m", type: "checkout.session.completed",
    data: { object: { client_reference_id: ACCOUNT, amount_subtotal: 1900, currency: "usd", payment_status: "unpaid", mode: "payment",
      payment_intent: "pi_m" } } });
  assert.deepEqual(mapped?.payload, { intent_id: ACCOUNT, payment_ref: "pi_m", amount_subtotal: 1900, currency: "usd",
    payment_status: "unpaid", mode: "payment" });
});

test("NEW-01: async_payment_succeeded is handled like a completed checkout", () => {
  const mapped = mapStripeEvent({ id: "evt_a", type: "checkout.session.async_payment_succeeded",
    data: { object: { client_reference_id: ACCOUNT, amount_subtotal: 7700, currency: "usd", payment_status: "paid", mode: "payment" } } });
  assert.equal(mapped?.type, "checkout.session.async_payment_succeeded");
  assert.deepEqual(mapped?.payload, { intent_id: ACCOUNT, amount_subtotal: 7700, currency: "usd", payment_status: "paid", mode: "payment" });
});

test("NEW-01: a non-numeric amount or an oversized currency is dropped, so the database rejects the grant", () => {
  const mapped = mapStripeEvent({ id: "evt_b", type: "checkout.session.completed",
    data: { object: { client_reference_id: ACCOUNT, amount_subtotal: "1900", currency: "dollars", payment_status: "paid" } } });
  assert.deepEqual(mapped?.payload, { intent_id: ACCOUNT, payment_status: "paid" });
});

test("unknown types and malformed events are ignored", () => {
  assert.equal(mapStripeEvent({ id: "evt_x", type: "customer.created", data: { object: {} } }), null);
  assert.equal(mapStripeEvent({ type: "invoice.paid", data: { object: {} } }), null);
  assert.equal(mapStripeEvent("nope"), null);
  assert.equal(mapStripeEvent(null), null);
});

/* ---- track B: commerce ---- */
test("000019: a checkout also maps the Stripe customer (for the Customer Portal)", () => {
  const mapped = mapStripeEvent({ id: "evt_cu", type: "checkout.session.completed",
    data: { object: { client_reference_id: ACCOUNT, customer: "cus_123", subscription: { id: "sub_7" }, amount_subtotal: 1300, currency: "usd", payment_status: "paid", mode: "subscription" } } });
  assert.equal(mapped?.payload.customer, "cus_123");
  assert.equal(mapped?.payload.subscription, "sub_7");
});

test("000019: customer.subscription.updated maps cancel_at_period_end, status and period end only", () => {
  assert.deepEqual(mapStripeEvent({ id: "evt_u", type: "customer.subscription.updated",
    data: { object: { id: "sub_1", status: "active", cancel_at_period_end: true, customer: "cus_1", items: { data: [{ current_period_end: 1900000003 }] } } } })?.payload,
    { subscription: "sub_1", status: "active", cancel_at_period_end: true, period_end: 1900000003 });
});

test("000019: invoice.paid finds the payment intent under payments on newer API versions", () => {
  assert.deepEqual(mapStripeEvent({ id: "evt_ip", type: "invoice.paid",
    data: { object: { parent: { subscription_details: { subscription: "sub_3" } }, lines: { data: [{ period: { end: 1900000004 } }] },
      payments: { data: [{ payment: { payment_intent: "pi_new" } }] } } } })?.payload,
    { subscription: "sub_3", period_end: 1900000004, payment_ref: "pi_new" });
});
