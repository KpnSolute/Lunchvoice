// The email dispatcher (build plan B-02): claims due outbox rows, renders them and sends them through Resend.
// Provider-agnostic at the edges: without RESEND_API_KEY it claims nothing and leaves every message queued.
// Dependencies are injected so Node tests can drive it with a mock fetch and a fake database.
import { renderEmail } from "./templates.ts";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
// Service mail (verification, plan and credit notices, invites) comes from hello@; a person who replies reaches the
// founder's inbox at admin@ (founder, 2026-11-11). EMAIL_FROM and EMAIL_REPLY_TO override both.
export const DEFAULT_FROM = "LunchVoice <hello@lunchvoice.com>";
export const DEFAULT_REPLY_TO = "admin@lunchvoice.com";

export interface OutboxMessage {
  id: string;
  template: string;
  to: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export interface DispatchDb {
  reservationSweep(): Promise<void>;
  claim(limit: number): Promise<OutboxMessage[]>;
  mark(id: string, result: "sent" | "retry" | "failed", error?: string | null, providerId?: string | null): Promise<void>;
  retention(): Promise<{ deleted: number; queued: number }>;
}

export interface DispatchDeps {
  env: (name: string) => string | undefined;
  fetch: typeof fetch;
  db: DispatchDb;
}

export interface DispatchResult {
  ok: true;
  provider: "resend" | "none";
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  queued: number;
}

export type SendOutcome = { result: "sent"; providerId: string | null } | { result: "retry" | "failed"; error: string };

/** One message through the Resend API. 429 and 5xx are transient; other 4xx are permanent. */
export async function sendViaResend(fetcher: typeof fetch, apiKey: string, from: string, m: OutboxMessage, rendered: { subject: string; text: string; html: string }, replyTo?: string): Promise<SendOutcome> {
  try {
    const res = await fetcher(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "idempotency-key": `lv-outbox-${m.id}` },
      body: JSON.stringify({ from, to: [m.to], subject: rendered.subject, text: rendered.text, html: rendered.html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as { id?: unknown };
      return { result: "sent", providerId: typeof body.id === "string" ? body.id.slice(0, 200) : null };
    }
    const transient = res.status === 429 || res.status >= 500;
    return { result: transient ? "retry" : "failed", error: `resend ${res.status}` };
  } catch {
    return { result: "retry", error: "network" };
  }
}

export async function dispatchOnce(deps: DispatchDeps, limit = 25): Promise<DispatchResult> {
  const key = deps.env("RESEND_API_KEY");
  // Reminders are queued either way, so nothing is lost while no provider is configured.
  await deps.db.reservationSweep();
  if (!key) {
    const { queued } = await deps.db.retention();
    return { ok: true, provider: "none", claimed: 0, sent: 0, retried: 0, failed: 0, queued };
  }
  const from = deps.env("EMAIL_FROM") || DEFAULT_FROM;
  const replyTo = deps.env("EMAIL_REPLY_TO") || DEFAULT_REPLY_TO;
  const origin = deps.env("LV_APP_ORIGIN") || "https://lunchvoice.com";
  const batch = await deps.db.claim(limit);
  let sent = 0, retried = 0, failed = 0;
  for (const m of batch) {
    const rendered = renderEmail(m.template, m.payload ?? {}, origin);
    if (!rendered) {
      await deps.db.mark(m.id, "failed", "template_payload_invalid");
      failed++;
      continue;
    }
    const out = await sendViaResend(deps.fetch, key, from, m, rendered, replyTo);
    if (out.result === "sent") { await deps.db.mark(m.id, "sent", null, out.providerId); sent++; }
    else if (out.result === "retry") { await deps.db.mark(m.id, "retry", out.error); retried++; }
    else { await deps.db.mark(m.id, "failed", out.error); failed++; }
  }
  const { queued } = await deps.db.retention();
  return { ok: true, provider: "resend", claimed: batch.length, sent, retried, failed, queued };
}

/** Constant-time comparison for the caller's bearer against the service-role key. */
export function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Only the service role (or the optional EMAIL_DISPATCH_SECRET) may run the dispatcher. */
export function dispatchAuthorized(authorization: string | null, env: (name: string) => string | undefined): boolean {
  const token = /^Bearer (.+)$/.exec(authorization ?? "")?.[1] ?? "";
  const service = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const extra = env("EMAIL_DISPATCH_SECRET") ?? "";
  return sameSecret(token, service) || sameSecret(token, extra);
}
