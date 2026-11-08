// Stripe REST helpers for the `checkout` Edge Function (build plan B-01). Pure and dependency-free: they run in Deno
// and in Node tests (fetch is injected). Nothing here logs, and the secret key is only ever an argument.
//
// Amounts never come from here. The database records the intent (lv_checkout_start) and prices it from lv.products;
// this file only turns an intent into Checkout Session parameters, using the Stripe price IDs the founder stored in
// policy 'billing.stripe_prices'. The webhook rejects any session whose subtotal differs from the intent (NEW-01).

export const STRIPE_API = "https://api.stripe.com";
export const DEFAULT_APP_ORIGIN = "https://lunchvoice.com";

/** What lv.checkout_session_context returns for an intent. */
export interface SessionContext {
  intent_id: string;
  product: "starter_hub" | "team_hub" | "campaign_starter" | "campaign_plus" | "hub_reservation" | string;
  interval: "month" | "weeks" | "year" | string;
  mode: "subscription" | "payment";
  weeks: number | null;
  first_period_weeks: number | null;
  amount_cents: number;
  account_id: string | null;
  hub_id: string | null;
  hub_slug: string | null;
  slug: string | null;
  completed: boolean;
  prices: { price?: string; first?: string; extra_week?: string } | null;
  customer_id: string | null;
}

export class StripeError extends Error {
  constructor(public readonly status: number, public readonly type: string | undefined) {
    super(`stripe request failed (${status}${type ? `, ${type}` : ""})`);
  }
}

export class CheckoutConfigError extends Error {}

const PRICE = /^price_[A-Za-z0-9]{1,250}$/;

/** A same-origin path to come back to after Checkout, or the fallback. Never another origin. */
export function safeReturnPath(path: unknown, fallback = "/me"): string {
  if (typeof path !== "string" || path.length > 200) return fallback;
  if (!/^\/(?!\/)[A-Za-z0-9\-._~/]*(\?[A-Za-z0-9\-._~=&%]*)?$/.test(path)) return fallback;
  if (path.includes("..") || path.includes("\\")) return fallback;
  return path;
}

/** Append query parameters to a path that may already carry some. */
function withQuery(path: string, extra: string): string {
  return path + (path.includes("?") ? "&" : "?") + extra;
}

/** The line items that make the Stripe subtotal equal the intent's amount. */
export function lineItemsFor(ctx: SessionContext): { price: string; quantity: number }[] {
  const p = ctx.prices;
  if (!p) throw new CheckoutConfigError("no prices for this product");
  if (ctx.interval === "weeks") {
    const first = ctx.first_period_weeks ?? 0;
    const weeks = ctx.weeks ?? 0;
    if (!p.first || !p.extra_week || !PRICE.test(p.first) || !PRICE.test(p.extra_week)) throw new CheckoutConfigError("campaign prices incomplete");
    if (first < 1 || weeks < first || weeks > 104) throw new CheckoutConfigError("weeks out of range");
    const items = [{ price: p.first, quantity: 1 }];
    if (weeks > first) items.push({ price: p.extra_week, quantity: weeks - first });
    return items;
  }
  if (!p.price || !PRICE.test(p.price)) throw new CheckoutConfigError("price missing");
  return [{ price: p.price, quantity: 1 }];
}

/** Form fields for POST /v1/checkout/sessions. */
export function checkoutSessionParams(ctx: SessionContext, opts: { appOrigin: string; returnPath: string; customerId: string }): Record<string, string> {
  const items = lineItemsFor(ctx);
  const origin = opts.appOrigin.replace(/\/+$/, "");
  const back = safeReturnPath(opts.returnPath);
  const f: Record<string, string> = {
    mode: ctx.mode,
    customer: opts.customerId,
    client_reference_id: ctx.intent_id,
    "metadata[intent_id]": ctx.intent_id,
    "metadata[product]": ctx.product,
    "automatic_tax[enabled]": "true",
    // Stripe Tax needs the customer's address; Checkout collects it and saves it to the customer.
    "customer_update[address]": "auto",
    "customer_update[name]": "auto",
    billing_address_collection: "required",
    success_url: origin + withQuery(back, "checkout=success&session_id={CHECKOUT_SESSION_ID}"),
    cancel_url: origin + withQuery(back, "checkout=cancelled"),
  };
  items.forEach((it, i) => {
    f[`line_items[${i}][price]`] = it.price;
    f[`line_items[${i}][quantity]`] = String(it.quantity);
  });
  if (ctx.mode === "subscription") f["subscription_data[metadata][intent_id]"] = ctx.intent_id;
  else f["payment_intent_data[metadata][intent_id]"] = ctx.intent_id;
  return f;
}

/** One authenticated form POST to the Stripe API. Never returns Stripe's error message to callers. */
export async function stripePost(
  fetcher: typeof fetch,
  secretKey: string,
  path: string,
  fields: Record<string, string>,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${secretKey}`,
    "content-type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const res = await fetcher(`${STRIPE_API}${path}`, { method: "POST", headers, body: new URLSearchParams(fields).toString() });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = body.error as { type?: string } | undefined;
    throw new StripeError(res.status, err?.type);
  }
  return body;
}

export async function createCustomer(fetcher: typeof fetch, key: string, accountId: string): Promise<string> {
  // No email or name: Checkout collects what Stripe needs. The account id lets support find the customer.
  const body = await stripePost(fetcher, key, "/v1/customers", { "metadata[lv_account]": accountId }, `lv-customer-${accountId}`);
  const id = body.id;
  if (typeof id !== "string" || !/^cus_[A-Za-z0-9]+$/.test(id)) throw new StripeError(502, "bad_customer");
  return id;
}

export async function createCheckoutSession(fetcher: typeof fetch, key: string, fields: Record<string, string>, intentId: string) {
  const body = await stripePost(fetcher, key, "/v1/checkout/sessions", fields, `lv-intent-${intentId}`);
  if (typeof body.url !== "string" || !body.url.startsWith("https://") || typeof body.id !== "string") throw new StripeError(502, "bad_session");
  return { id: body.id, url: body.url };
}

export async function createPortalSession(fetcher: typeof fetch, key: string, customerId: string, returnUrl: string) {
  const body = await stripePost(fetcher, key, "/v1/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
  if (typeof body.url !== "string" || !body.url.startsWith("https://")) throw new StripeError(502, "bad_portal");
  return { url: body.url };
}

/** HTTP status for an lv_ error code coming back from the database. */
export function statusForCode(code: string | undefined): number {
  switch (code) {
    case "lv_unauthenticated": return 401;
    case "lv_forbidden": return 403;
    case "lv_not_found": return 404;
    case "lv_conflict": case "lv_price_unset": return 409;
    case "lv_rate_limited": return 429;
    case "lv_billing_unavailable": return 503;
    default: return 400;
  }
}
