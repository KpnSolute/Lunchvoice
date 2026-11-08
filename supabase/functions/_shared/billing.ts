// Stripe webhook helpers for the `billing-webhook` Edge Function (LAUNCH_PLAN A-03, compliance LC-19).
//
// Pure and dependency-free so they run in Deno (the function) and in Node tests. Nothing here logs, and nothing
// here sees a secret except as an argument. The database decides what an event grants
// (lv.billing_apply_event, service role only); this file only proves the event came from Stripe and reduces it
// to the few fields the database needs.

export const SIGNATURE_TOLERANCE_SECONDS = 300;

export interface ParsedSignature {
  timestamp: number;
  signatures: string[];
}

/** Parse `Stripe-Signature: t=1700000000,v1=hex,v1=hex,v0=...`. Returns null when malformed. */
export function parseSignatureHeader(header: string | null | undefined): ParsedSignature | null {
  if (!header || header.length > 4096) return null;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t" && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    else if (key === "v1" && /^[0-9a-f]{64}$/i.test(value)) signatures.push(value.toLowerCase());
  }
  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

/** Constant-time comparison of two equal-length lowercase hex strings. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type VerifyResult = { ok: true } | { ok: false; reason: "no_secret" | "malformed" | "stale" | "mismatch" };

/**
 * Verify a Stripe signature over the RAW request body: HMAC-SHA256 of `${t}.${rawBody}` with the endpoint secret,
 * compared in constant time against every v1 value, with a timestamp tolerance (default 300 s, both directions).
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = SIGNATURE_TOLERANCE_SECONDS,
): Promise<VerifyResult> {
  if (!secret) return { ok: false, reason: "no_secret" };
  const parsed = parseSignatureHeader(header);
  if (!parsed) return { ok: false, reason: "malformed" };
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) return { ok: false, reason: "stale" };
  const expected = await hmacSha256Hex(secret, `${parsed.timestamp}.${rawBody}`);
  let match = false;
  for (const sig of parsed.signatures) match = timingSafeEqualHex(expected, sig) || match;
  return match ? { ok: true } : { ok: false, reason: "mismatch" };
}

/** The event types LunchVoice acts on. Every other type is acknowledged and ignored. */
export const HANDLED_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "invoice.paid",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "charge.refunded",
] as const;
export type HandledType = (typeof HANDLED_TYPES)[number];

/** What lv.billing_apply_event receives. Only these keys ever leave the function. */
export interface BillingPayload {
  intent_id?: string;
  product?: string;
  account_id?: string;
  hub_id?: string;
  slug?: string;
  weeks?: number;
  subscription?: string;
  payment_ref?: string;
  period_end?: number;
  /** Checkout: what Stripe confirmed. The database grants only when these match the intent (NEW-01). */
  amount_subtotal?: number;
  currency?: string;
  payment_status?: string;
  mode?: string;
  /** Subscription deleted: when it actually ended (an immediate cancellation). */
  ended_at?: number;
  /** Checkout: the Stripe customer (000019 remembers it for the Customer Portal). */
  customer?: string;
  /** Subscription updated: display state only (000019); access never shortens on it. */
  status?: string;
  cancel_at_period_end?: boolean;
  /** Charge refunded: full or partial (NEW-02). */
  amount?: number;
  amount_refunded?: number;
  refunded?: boolean;
}

export interface MappedEvent {
  provider: "stripe";
  eventId: string;
  type: HandledType;
  payload: BillingPayload;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 255): string | undefined => (typeof v === "string" && v.length > 0 && v.length <= max ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : undefined);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string | undefined => { const s = str(v, 36); return s && UUID.test(s) ? s.toLowerCase() : undefined; };
const idOf = (v: unknown): string | undefined => str(v) ?? (isObj(v) ? str(v.id) : undefined);

function metadataFields(meta: unknown): BillingPayload {
  if (!isObj(meta)) return {};
  const weeks = typeof meta.weeks === "string" && /^\d{1,3}$/.test(meta.weeks) ? Number(meta.weeks) : num(meta.weeks);
  const slug = str(meta.slug, 40);
  return {
    product: str(meta.product, 40),
    account_id: uuid(meta.account_id),
    hub_id: uuid(meta.hub_id),
    slug: slug && /^[a-z0-9-]{3,40}$/.test(slug) ? slug : undefined,
    weeks,
  };
}

function compact(p: BillingPayload): BillingPayload {
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as BillingPayload;
}

/** Reduce a verified Stripe event to the database payload, or null for a type LunchVoice does not handle. */
export function mapStripeEvent(event: unknown): MappedEvent | null {
  if (!isObj(event)) return null;
  const eventId = str(event.id);
  const type = str(event.type);
  const object = isObj(event.data) && isObj(event.data.object) ? event.data.object : null;
  if (!eventId || !type || !object || !(HANDLED_TYPES as readonly string[]).includes(type)) return null;

  let payload: BillingPayload;
  switch (type as HandledType) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      payload = {
        ...metadataFields(object.metadata),
        intent_id: uuid(object.client_reference_id),
        subscription: idOf(object.subscription),
        payment_ref: idOf(object.payment_intent),
        amount_subtotal: num(object.amount_subtotal),
        currency: str(object.currency, 3)?.toLowerCase(),
        payment_status: str(object.payment_status, 40),
        mode: str(object.mode, 40),
        customer: idOf(object.customer),
      };
      break;
    case "invoice.paid": {
      const parent = isObj(object.parent) && isObj(object.parent.subscription_details) ? object.parent.subscription_details : null;
      const lines = isObj(object.lines) && Array.isArray(object.lines.data) ? object.lines.data : [];
      const firstPeriod = isObj(lines[0]) && isObj(lines[0].period) ? lines[0].period : null;
      // Newer API versions list payments under `payments` instead of `payment_intent`.
      const payments = isObj(object.payments) && Array.isArray(object.payments.data) ? object.payments.data : [];
      const firstPayment = isObj(payments[0]) && isObj(payments[0].payment) ? payments[0].payment : null;
      payload = {
        subscription: idOf(object.subscription) ?? (parent ? idOf(parent.subscription) : undefined),
        period_end: num(firstPeriod?.end) ?? num(object.period_end),
        payment_ref: idOf(object.payment_intent) ?? (firstPayment ? idOf(firstPayment.payment_intent) : undefined),
      };
      break;
    }
    case "customer.subscription.updated": {
      const items = isObj(object.items) && Array.isArray(object.items.data) ? object.items.data : [];
      payload = {
        subscription: idOf(object.id),
        status: str(object.status, 40),
        cancel_at_period_end: typeof object.cancel_at_period_end === "boolean" ? object.cancel_at_period_end : undefined,
        period_end: num(object.current_period_end) ?? (isObj(items[0]) ? num(items[0].current_period_end) : undefined),
      };
      break;
    }
    case "customer.subscription.deleted": {
      const items = isObj(object.items) && Array.isArray(object.items.data) ? object.items.data : [];
      payload = {
        subscription: idOf(object.id),
        period_end: num(object.current_period_end) ?? (isObj(items[0]) ? num(items[0].current_period_end) : undefined),
        ended_at: num(object.ended_at),
      };
      break;
    }
    case "charge.refunded":
      payload = {
        payment_ref: idOf(object.payment_intent),
        amount: num(object.amount),
        amount_refunded: num(object.amount_refunded),
        refunded: typeof object.refunded === "boolean" ? object.refunded : undefined,
      };
      break;
  }
  return { provider: "stripe", eventId, type: type as HandledType, payload: compact(payload) };
}
