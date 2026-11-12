// The email dispatcher (build plan B-02): claims due outbox rows, renders them and sends them through Resend.
// Provider-agnostic at the edges: without RESEND_API_KEY it claims nothing and leaves every message queued.
// Dependencies are injected so Node tests can drive it with a mock fetch and a fake database.
import { serviceSecrets } from "../keys.ts";
import { renderEmail } from "./templates.ts";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const DEFAULT_FROM = "LunchVoice <no-reply@lunchvoice.com>";

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
export async function sendViaResend(fetcher: typeof fetch, apiKey: string, from: string, m: OutboxMessage, rendered: { subject: string; text: string; html: string }): Promise<SendOutcome> {
  try {
    const res = await fetcher(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "idempotency-key": `lv-outbox-${m.id}` },
      body: JSON.stringify({ from, to: [m.to], subject: rendered.subject, text: rendered.text, html: rendered.html }),
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
    const out = await sendViaResend(deps.fetch, key, from, m, rendered);
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

/**
 * Only a service-level caller may run the dispatchers: a Supabase secret key (SUPABASE_SECRET_KEYS, which replaces the
 * retiring service-role key), the legacy SUPABASE_SERVICE_ROLE_KEY while it is enabled, or the optional
 * EMAIL_DISPATCH_SECRET. Read from `Authorization: Bearer` or, as Supabase recommends for API keys, `apikey`.
 */
export function dispatchAuthorized(authorization: string | null, env: (name: string) => string | undefined, apikey?: string | null): boolean {
  const candidates = [/^Bearer (.+)$/.exec(authorization ?? "")?.[1] ?? "", apikey ?? ""].filter(Boolean);
  const allowed = [...serviceSecrets(env), env("EMAIL_DISPATCH_SECRET") ?? ""].filter(Boolean);
  return candidates.some((t) => allowed.some((a) => sameSecret(t, a)));
}
