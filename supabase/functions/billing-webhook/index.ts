// POST /functions/v1/billing-webhook   (Stripe -> LunchVoice)
//
// Fails closed: 503 while STRIPE_WEBHOOK_SECRET (or the database URL) is unset. Verifies Stripe-Signature over the
// raw body before parsing anything, maps only the handled event types (others get 200 and are ignored), and applies
// the event through lv.billing_apply_event, which is idempotent on (provider, event_id). The database call runs
// as the service_role (SET LOCAL ROLE), the only role allowed to execute that function; lv stays unexposed.
// Never logs secrets, signatures or payloads.
import postgres from "postgres";
import { mapStripeEvent, verifyStripeSignature } from "../_shared/billing.ts";

const MAX_BODY_BYTES = 256 * 1024;
let sql: ReturnType<typeof postgres> | null = null;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { ok: false, error: { code: "lv_method", message: "Use POST." } });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!secret || !dbUrl) {
    return reply(503, { ok: false, error: { code: "lv_billing_unavailable", message: "Billing is not configured." } });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return reply(413, { ok: false, error: { code: "lv_invalid_input", message: "Too large." } });

  const verified = await verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret);
  if (!verified.ok) return reply(400, { ok: false, error: { code: "lv_invalid_signature", message: "Signature check failed." } });

  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return reply(400, { ok: false, error: { code: "lv_invalid_input", message: "Body is not JSON." } });
  }

  const mapped = mapStripeEvent(event);
  if (!mapped) return reply(200, { ok: true, ignored: true });

  try {
    sql ??= postgres(dbUrl, { max: 1, prepare: false, idle_timeout: 20 });
    const rows = await sql.begin(async (tx) => {
      await tx.unsafe("set local role service_role");
      return await tx`select lv.billing_apply_event(${mapped.provider}, ${mapped.eventId}, ${mapped.type}, ${tx.json(mapped.payload)}) as result`;
    });
    const result = (rows[0]?.result ?? {}) as { outcome?: string; duplicate?: boolean };
    // 2xx for applied, ignored, rejected and duplicates: Stripe must not retry a decided event.
    return reply(200, { ok: true, outcome: result.outcome ?? null, duplicate: result.duplicate ?? false });
  } catch {
    console.error("billing-webhook: database apply failed");
    // 500 lets Stripe retry; the event log makes the retry safe.
    return reply(500, { ok: false, error: { code: "lv_server_error", message: "Could not record the event." } });
  }
});
