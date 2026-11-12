// Request handling for the `checkout` Edge Function, with every dependency injected so Node tests can drive it.
//
// POST { action: "checkout", product, hub?, weeks?, slug?, return_path? }  -> { ok, url, intent_id }
// POST { action: "portal", return_path? }                                -> { ok, url }
//
// Who the caller is, and what they may buy, is decided by the database: the function forwards the caller's own
// LunchVoice session token to PostgREST (lv_checkout_start / lv_billing_portal_check). Only after that succeeds does
// it use the service role to read the intent's context and store the Stripe customer. It fails closed with 503
// lv_billing_unavailable while STRIPE_SECRET_KEY, the database or the price IDs are missing.
import { isApiKey, publishableKey } from "./keys.ts";
import {
  CheckoutConfigError,
  checkoutSessionParams,
  createCheckoutSession,
  createCustomer,
  createPortalSession,
  DEFAULT_APP_ORIGIN,
  safeReturnPath,
  statusForCode,
  type SessionContext,
} from "./stripe.ts";

export interface CheckoutDb {
  sessionContext(intentId: string): Promise<SessionContext | null>;
  setCustomer(accountId: string, customerId: string): Promise<string>;
  attachSession(intentId: string, sessionId: string): Promise<void>;
  customerOf(accountId: string): Promise<string | null>;
}

export interface CheckoutDeps {
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
  /** null when the service-role database connection is not configured. */
  db: CheckoutDb | null;
}

type Envelope = { ok: boolean; error?: { code?: string; message?: string }; [k: string]: unknown };

const PRODUCTS = new Set(["starter_hub", "team_hub", "campaign_starter", "campaign_plus", "hub_reservation"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const allow = origin && allowed.includes(origin) ? origin : allowed[0] ?? "";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
    vary: "origin",
  };
}

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
}
const fail = (status: number, code: string, message: string, cors: Record<string, string>) => json(status, { ok: false, error: { code, message } }, cors);
const unavailable = (cors: Record<string, string>) => fail(503, "lv_billing_unavailable", "Paid plans are not on sale yet. Nothing was charged.", cors);

/** Call an lv_api function as the caller (their own token), through PostgREST. */
async function rpcAsCaller(deps: CheckoutDeps, token: string, fn: string, args: Record<string, unknown>): Promise<Envelope> {
  const url = deps.env("SUPABASE_URL")!.replace(/\/+$/, "");
  const res = await deps.fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: publishableKey(deps.env)!,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "content-profile": "lv_api",
      "accept-profile": "lv_api",
    },
    body: JSON.stringify(args),
  });
  if (res.status === 401 || res.status === 403) return { ok: false, error: { code: "lv_unauthenticated", message: "Sign in to continue." } };
  const body = (await res.json().catch(() => null)) as Envelope | null;
  if (!res.ok || !body || typeof body.ok !== "boolean") return { ok: false, error: { code: "lv_server_error", message: "Could not start checkout." } };
  return body;
}

export async function handleCheckoutRequest(req: Request, deps: CheckoutDeps): Promise<Response> {
  const allowed = (deps.env("LV_ALLOWED_ORIGINS") ?? "https://lunchvoice.com,https://www.lunchvoice.com").split(",").map((v) => v.trim()).filter(Boolean);
  const cors = corsHeaders(req.headers.get("origin"), allowed);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return fail(405, "lv_method", "Use POST.", cors);

  const key = deps.env("STRIPE_SECRET_KEY");
  if (!key || !deps.env("SUPABASE_URL") || !publishableKey(deps.env) || !deps.db) return unavailable(cors);

  const auth = req.headers.get("authorization") ?? "";
  const token = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(auth)?.[1];
  if (!token || isApiKey(token, deps.env)) return fail(401, "lv_unauthenticated", "Sign in to continue.", cors);

  const raw = await req.text();
  if (raw.length > 4096) return fail(413, "lv_invalid_input", "Too large.", cors);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return fail(400, "lv_invalid_input", "Body is not JSON.", cors);
  }
  const origin = (deps.env("LV_APP_ORIGIN") ?? DEFAULT_APP_ORIGIN).replace(/\/+$/, "");
  const returnPath = safeReturnPath(body.return_path);

  try {
    if (body.action === "portal") {
      const check = await rpcAsCaller(deps, token, "lv_billing_portal_check", {});
      if (!check.ok) return json(statusForCode(check.error?.code), { ok: false, error: check.error }, cors);
      const account = typeof check.account_id === "string" ? check.account_id : null;
      const customer = account ? await deps.db.customerOf(account) : null;
      if (!customer) return fail(404, "lv_not_found", "There is no subscription to manage on this account.", cors);
      const portal = await createPortalSession(deps.fetch, key, customer, origin + returnPath);
      return json(200, { ok: true, url: portal.url }, cors);
    }

    if (body.action !== "checkout") return fail(400, "lv_invalid_input", "Unknown action.", cors);
    const product = typeof body.product === "string" && PRODUCTS.has(body.product) ? body.product : null;
    if (!product) return fail(400, "lv_invalid_input", "That product cannot be bought.", cors);
    const hub = typeof body.hub === "string" && UUID.test(body.hub) ? body.hub : null;
    const weeks = typeof body.weeks === "number" && Number.isInteger(body.weeks) ? body.weeks : null;
    const slug = typeof body.slug === "string" && body.slug.length <= 40 ? body.slug : null;

    const started = await rpcAsCaller(deps, token, "lv_checkout_start", { p_product: product, p_hub: hub, p_weeks: weeks, p_slug: slug });
    if (!started.ok) return json(statusForCode(started.error?.code), { ok: false, error: started.error }, cors);
    const intentId = typeof started.intent_id === "string" ? started.intent_id : null;
    if (!intentId) return fail(500, "lv_server_error", "Could not start checkout.", cors);
    // A legacy Payment Link (billing.payment_links) is already a complete URL.
    if (started.checkout === "link" && typeof started.checkout_url === "string") return json(200, { ok: true, url: started.checkout_url, intent_id: intentId }, cors);

    const ctx = await deps.db.sessionContext(intentId);
    if (!ctx || !ctx.account_id || ctx.completed) return fail(409, "lv_conflict", "That checkout can no longer be used.", cors);
    if (!ctx.prices) return unavailable(cors);

    let customer = ctx.customer_id;
    if (!customer) customer = await deps.db.setCustomer(ctx.account_id, await createCustomer(deps.fetch, key, ctx.account_id));
    const fields = checkoutSessionParams(ctx, { appOrigin: origin, returnPath, customerId: customer });
    const session = await createCheckoutSession(deps.fetch, key, fields, intentId);
    await deps.db.attachSession(intentId, session.id);
    return json(200, { ok: true, url: session.url, intent_id: intentId }, cors);
  } catch (e) {
    if (e instanceof CheckoutConfigError) return unavailable(cors);
    // Stripe or database fault: nothing was charged. Never echo provider text.
    return fail(502, "lv_billing_unavailable", "The payment provider could not be reached. Nothing was charged; try again.", cors);
  }
}
