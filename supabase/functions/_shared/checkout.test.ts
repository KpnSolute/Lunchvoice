import { strict as assert } from "node:assert";
import { test } from "node:test";
import { handleCheckoutRequest, type CheckoutDb } from "./checkout.ts";
import { checkoutSessionParams, lineItemsFor, safeReturnPath, statusForCode, type SessionContext } from "./stripe.ts";

const INTENT = "11111111-2222-4333-8444-555555555555";
const ACCOUNT = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const TOKEN = "eyJhbGciOiJFUzI1NiJ9.session-token.signature";
const ENV: Record<string, string> = {
  STRIPE_SECRET_KEY: "sk_test_not_a_real_key",
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_ANON_KEY: "anon-key-placeholder-value",
};

const ctx = (over: Partial<SessionContext> = {}): SessionContext => ({
  intent_id: INTENT, product: "starter_hub", interval: "month", mode: "subscription", weeks: null, first_period_weeks: null,
  amount_cents: 1300, account_id: ACCOUNT, hub_id: null, hub_slug: null, slug: null, completed: false,
  prices: { price: "price_Starter1" }, customer_id: null, ...over,
});

/* ---------------------------------------------------------------- pure helpers */

test("stripe: a Hub plan is one subscription line item", () => {
  assert.deepEqual(lineItemsFor(ctx()), [{ price: "price_Starter1", quantity: 1 }]);
});

test("stripe: a Campaign plan is the first period plus extra weeks (quantity = weeks - first period)", () => {
  const c = ctx({ product: "campaign_plus", interval: "weeks", mode: "payment", weeks: 5, first_period_weeks: 2, prices: { first: "price_First", extra_week: "price_Week" } });
  assert.deepEqual(lineItemsFor(c), [{ price: "price_First", quantity: 1 }, { price: "price_Week", quantity: 3 }]);
  assert.deepEqual(lineItemsFor({ ...c, weeks: 2 }), [{ price: "price_First", quantity: 1 }]);
  assert.throws(() => lineItemsFor({ ...c, weeks: 1 }));
  assert.throws(() => lineItemsFor({ ...c, prices: { first: "price_First" } }));
});

test("stripe: session params turn on Stripe Tax, carry the intent and never a price amount", () => {
  const f = checkoutSessionParams(ctx(), { appOrigin: "https://lunchvoice.com/", returnPath: "/northside/billing", customerId: "cus_1" });
  assert.equal(f["automatic_tax[enabled]"], "true");
  assert.equal(f.mode, "subscription");
  assert.equal(f.client_reference_id, INTENT);
  assert.equal(f["metadata[intent_id]"], INTENT);
  assert.equal(f["subscription_data[metadata][intent_id]"], INTENT);
  assert.equal(f.customer, "cus_1");
  assert.equal(f["customer_update[address]"], "auto");
  assert.equal(f.success_url, "https://lunchvoice.com/northside/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}");
  assert.equal(f.cancel_url, "https://lunchvoice.com/northside/billing?checkout=cancelled");
  assert.equal(Object.keys(f).some((k) => /amount|allow_promotion_codes|discounts/.test(k)), false);
  const pay = checkoutSessionParams(ctx({ product: "hub_reservation", interval: "year", mode: "payment", prices: { price: "price_Res" } }),
    { appOrigin: "https://lunchvoice.com", returnPath: "/reserve?slug=my-name", customerId: "cus_1" });
  assert.equal(pay["payment_intent_data[metadata][intent_id]"], INTENT);
  assert.equal(pay.success_url, "https://lunchvoice.com/reserve?slug=my-name&checkout=success&session_id={CHECKOUT_SESSION_ID}");
});

test("stripe: return paths stay on this site", () => {
  for (const bad of ["https://evil.test/x", "//evil.test", "/a/../../b", "javascript:alert(1)", "/\\evil", 42, null, "/" + "a".repeat(300)]) {
    assert.equal(safeReturnPath(bad), "/me");
  }
  assert.equal(safeReturnPath("/my-hub/billing"), "/my-hub/billing");
});

test("stripe: database error codes map to HTTP statuses", () => {
  assert.equal(statusForCode("lv_billing_unavailable"), 503);
  assert.equal(statusForCode("lv_unauthenticated"), 401);
  assert.equal(statusForCode("lv_conflict"), 409);
  assert.equal(statusForCode("lv_rate_limited"), 429);
  assert.equal(statusForCode("lv_invalid_input"), 400);
});

/* ---------------------------------------------------------------- the request handler, with a mock fetch */

interface Call { url: string; init: RequestInit }
function harness(opts: { env?: Record<string, string | undefined>; rpc?: Record<string, unknown>; context?: SessionContext | null; db?: boolean; stripeFails?: boolean } = {}) {
  const calls: Call[] = [];
  const stored: { customer?: [string, string]; session?: [string, string] } = {};
  const env = { ...ENV, ...(opts.env ?? {}) };
  const fetcher = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (url.includes("/rest/v1/rpc/")) {
      const fn = url.split("/").pop()!;
      return reply(200, opts.rpc?.[fn] ?? { ok: false, error: { code: "lv_server_error", message: "no mock" } });
    }
    if (opts.stripeFails) return reply(500, { error: { type: "api_error", message: "secret detail from stripe" } });
    if (url.endsWith("/v1/customers")) return reply(200, { id: "cus_New1" });
    if (url.endsWith("/v1/checkout/sessions")) return reply(200, { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    if (url.endsWith("/v1/billing_portal/sessions")) return reply(200, { url: "https://billing.stripe.com/p/session/x" });
    return reply(404, {});
  }) as typeof fetch;
  const db: CheckoutDb = {
    sessionContext: async () => (opts.context === undefined ? ctx() : opts.context),
    setCustomer: async (a, c) => { stored.customer = [a, c]; return c; },
    attachSession: async (i, s) => { stored.session = [i, s]; },
    customerOf: async () => "cus_Existing",
  };
  const run = (body: unknown, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) =>
    handleCheckoutRequest(new Request("https://fn.test/checkout", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }),
      { env: (n) => env[n], fetch: fetcher, db: opts.db === false ? null : db });
  return { run, calls, stored };
}

const started = { lv_checkout_start: { ok: true, intent_id: INTENT, amount_cents: 1300, checkout: "session", mode: "subscription" } };

test("checkout: without STRIPE_SECRET_KEY it fails closed with 503 lv_billing_unavailable and calls nobody", async () => {
  const h = harness({ env: { STRIPE_SECRET_KEY: undefined }, rpc: started });
  const res = await h.run({ action: "checkout", product: "starter_hub" });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, "lv_billing_unavailable");
  assert.equal(h.calls.length, 0);
});

test("checkout: without the database connection it fails closed", async () => {
  const res = await harness({ db: false, rpc: started }).run({ action: "checkout", product: "starter_hub" });
  assert.equal(res.status, 503);
});

test("checkout: a missing or anon bearer is lv_unauthenticated", async () => {
  const h = harness({ rpc: started });
  assert.equal((await h.run({ action: "checkout", product: "starter_hub" }, {})).status, 401);
  assert.equal((await h.run({ action: "checkout", product: "starter_hub" }, { authorization: `Bearer ${ENV.SUPABASE_ANON_KEY}` })).status, 401);
  assert.equal(h.calls.length, 0);
});

test("checkout: the database decides first; its refusal is passed through with the right status", async () => {
  const h = harness({ rpc: { lv_checkout_start: { ok: false, error: { code: "lv_billing_unavailable", message: "Paid plans are not on sale yet." } } } });
  const res = await h.run({ action: "checkout", product: "team_hub" });
  assert.equal(res.status, 503);
  assert.equal(h.calls.some((c) => c.url.includes("stripe.com")), false);
});

test("checkout: the caller's own token goes to lv_checkout_start, then a customer and a session are created", async () => {
  const h = harness({ rpc: started });
  const res = await h.run({ action: "checkout", product: "starter_hub", hub: null, return_path: "/me" });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body, { ok: true, url: "https://checkout.stripe.com/c/pay/cs_test_1", intent_id: INTENT });
  const rpc = h.calls[0];
  assert.match(rpc.url, /\/rest\/v1\/rpc\/lv_checkout_start$/);
  assert.equal((rpc.init.headers as Record<string, string>).authorization, `Bearer ${TOKEN}`);
  assert.equal((rpc.init.headers as Record<string, string>)["content-profile"], "lv_api");
  const customer = h.calls.find((c) => c.url.endsWith("/v1/customers"))!;
  assert.equal((customer.init.headers as Record<string, string>).authorization, `Bearer ${ENV.STRIPE_SECRET_KEY}`);
  assert.equal((customer.init.headers as Record<string, string>)["idempotency-key"], `lv-customer-${ACCOUNT}`);
  const session = h.calls.find((c) => c.url.endsWith("/v1/checkout/sessions"))!;
  const form = new URLSearchParams(String(session.init.body));
  assert.equal(form.get("automatic_tax[enabled]"), "true");
  assert.equal(form.get("client_reference_id"), INTENT);
  assert.equal(form.get("customer"), "cus_New1");
  assert.equal(form.get("line_items[0][price]"), "price_Starter1");
  assert.equal((session.init.headers as Record<string, string>)["idempotency-key"], `lv-intent-${INTENT}`);
  assert.deepEqual(h.stored, { customer: [ACCOUNT, "cus_New1"], session: [INTENT, "cs_test_1"] });
});

test("checkout: an existing Stripe customer is reused", async () => {
  const h = harness({ rpc: started, context: ctx({ customer_id: "cus_Old" }) });
  await h.run({ action: "checkout", product: "starter_hub" });
  assert.equal(h.calls.some((c) => c.url.endsWith("/v1/customers")), false);
  assert.equal(new URLSearchParams(String(h.calls.find((c) => c.url.endsWith("/v1/checkout/sessions"))!.init.body)).get("customer"), "cus_Old");
});

test("checkout: unset price IDs fail closed even after the intent exists", async () => {
  const res = await harness({ rpc: started, context: ctx({ prices: null }) }).run({ action: "checkout", product: "starter_hub" });
  assert.equal(res.status, 503);
});

test("checkout: a provider failure says nothing was charged and never echoes Stripe's text", async () => {
  const res = await harness({ rpc: started, stripeFails: true }).run({ action: "checkout", product: "starter_hub" });
  const text = await res.text();
  assert.equal(res.status, 502);
  assert.equal(text.includes("secret detail"), false);
  assert.match(text, /Nothing was charged/);
});

test("checkout: an unknown product or action is refused before any call", async () => {
  const h = harness({ rpc: started });
  assert.equal((await h.run({ action: "checkout", product: "founding" })).status, 400);
  assert.equal((await h.run({ action: "steal" })).status, 400);
  assert.equal(h.calls.length, 0);
});

test("portal: the caller's own customer gets a Customer Portal session", async () => {
  const h = harness({ rpc: { lv_billing_portal_check: { ok: true, account_id: ACCOUNT } } });
  const res = await h.run({ action: "portal", return_path: "/my-hub/billing" });
  assert.deepEqual(await res.json(), { ok: true, url: "https://billing.stripe.com/p/session/x" });
  const form = new URLSearchParams(String(h.calls.find((c) => c.url.endsWith("/v1/billing_portal/sessions"))!.init.body));
  assert.equal(form.get("customer"), "cus_Existing");
  assert.equal(form.get("return_url"), "https://lunchvoice.com/my-hub/billing");
});

test("portal: nothing to manage is a 404 and no Stripe call", async () => {
  const h = harness({ rpc: { lv_billing_portal_check: { ok: false, error: { code: "lv_not_found", message: "none" } } } });
  assert.equal((await h.run({ action: "portal" })).status, 404);
  assert.equal(h.calls.some((c) => c.url.includes("stripe.com")), false);
});

test("checkout: CORS answers only the allowed origins", async () => {
  const h = harness();
  const res = await handleCheckoutRequest(new Request("https://fn.test/checkout", { method: "OPTIONS", headers: { origin: "https://evil.test" } }),
    { env: (n) => ENV[n], fetch: fetch, db: null });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "https://lunchvoice.com");
  assert.ok(h);
});
