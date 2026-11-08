// Outbound webhooks (docs/v2/API_AND_DISCORD_PLAN.md section 1): signing, URL guard and the dispatcher loop used by
// the `webhook-dispatch` Edge Function. Dependency-injected so Node tests drive it with a fake database and fetch.
//
// Signature: header `LunchVoice-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`, the same
// shape as Stripe's, so receivers can reuse familiar verification code. Bodies are never logged or stored after
// delivery; the delivery log keeps only status codes and timings (lv.webhook_mark).
import { parseSignatureHeader, timingSafeEqualHex } from "./billing.ts";

export const SIGNATURE_HEADER = "LunchVoice-Signature";
export const WEBHOOK_TOLERANCE_SECONDS = 300;
export const DELIVERY_TIMEOUT_MS = 10_000;

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The `LunchVoice-Signature` header value for a raw body. */
export async function signWebhook(secret: string, rawBody: string, timestamp: number): Promise<string> {
  return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${rawBody}`)}`;
}

/** Receiver-side verification (documented on /developers): constant-time, with a replay window. */
export async function verifyWebhookSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | undefined,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  toleranceSeconds: number = WEBHOOK_TOLERANCE_SECONDS,
): Promise<boolean> {
  if (!secret) return false;
  const parsed = parseSignatureHeader(header);
  if (!parsed || Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) return false;
  const expected = await hmacHex(secret, `${parsed.timestamp}.${rawBody}`);
  let match = false;
  for (const sig of parsed.signatures) match = timingSafeEqualHex(expected, sig) || match;
  return match;
}

/** Mirrors lv.webhook_url_problem: https, a public host name, no IP literal or internal suffix. */
export function webhookUrlAllowed(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || /^[0-9.]+$/.test(host) || host.startsWith("[")) return false;
  if (/(^|\.)(localhost|local|internal|localdomain|lan|home|arpa|test|invalid|example)$/.test(host)) return false;
  if (/(^|\.)supabase\.(co|in|net)$/.test(host)) return false;
  return true;
}

export interface WebhookDelivery {
  id: string;
  url: string;
  secret: string;
  event: string;
  body: Record<string, unknown>;
  attempts: number;
}

export interface WebhookDb {
  sweep(): Promise<void>;
  claim(limit: number): Promise<WebhookDelivery[]>;
  mark(id: string, result: "delivered" | "retry" | "failed", statusCode: number | null, durationMs: number, error: string | null): Promise<void>;
}

export interface DeliveryOutcome {
  result: "delivered" | "retry" | "failed";
  status: number | null;
  error: string | null;
}

/** Classify a receiver's answer: 2xx delivered; 408, 409, 425, 429 and 5xx retried; other statuses failed. */
export function classifyStatus(status: number): DeliveryOutcome["result"] {
  if (status >= 200 && status < 300) return "delivered";
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) return "retry";
  return "failed";
}

export async function deliverOnce(fetcher: typeof fetch, d: WebhookDelivery, nowSeconds: number): Promise<DeliveryOutcome> {
  if (!webhookUrlAllowed(d.url)) return { result: "failed", status: null, error: "url not allowed" };
  const raw = JSON.stringify(d.body);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const res = await fetcher(d.url, {
      method: "POST",
      redirect: "manual", // a redirect could point at an internal address
      signal: ctl.signal,
      headers: {
        "content-type": "application/json",
        "user-agent": "LunchVoice-Webhooks/1",
        "LunchVoice-Event": d.event,
        "LunchVoice-Delivery": d.id,
        [SIGNATURE_HEADER]: await signWebhook(d.secret, raw, nowSeconds),
      },
      body: raw,
    });
    await res.body?.cancel().catch(() => {});
    const result = classifyStatus(res.status);
    return { result, status: res.status, error: result === "delivered" ? null : `http ${res.status}` };
  } catch {
    return { result: "retry", status: null, error: ctl.signal.aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

export interface WebhookDispatchResult {
  ok: true;
  claimed: number;
  delivered: number;
  retried: number;
  failed: number;
}

export async function dispatchWebhooks(deps: { db: WebhookDb; fetch: typeof fetch; now?: () => number }, limit = 50): Promise<WebhookDispatchResult> {
  const now = deps.now ?? (() => Date.now());
  await deps.db.sweep();
  const batch = await deps.db.claim(limit);
  const out: WebhookDispatchResult = { ok: true, claimed: batch.length, delivered: 0, retried: 0, failed: 0 };
  for (const d of batch) {
    const started = now();
    const r = await deliverOnce(deps.fetch, d, Math.floor(started / 1000));
    await deps.db.mark(d.id, r.result, r.status, Math.max(0, Math.round(now() - started)), r.error);
    if (r.result === "delivered") out.delivered++;
    else if (r.result === "retry") out.retried++;
    else out.failed++;
  }
  return out;
}
