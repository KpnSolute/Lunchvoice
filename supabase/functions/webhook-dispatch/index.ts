// POST /functions/v1/webhook-dispatch   (cron or an operator -> LunchVoice -> customer webhook endpoints)
//
// Service role only: the bearer must be SUPABASE_SERVICE_ROLE_KEY (or the optional EMAIL_DISPATCH_SECRET), compared in
// constant time; everyone else gets 401. Sweeps time-closed Campaigns, claims due deliveries (only Hubs that still have
// the Team-family API; others stay queued = paused), signs each body with its endpoint secret (LunchVoice-Signature:
// t=..,v1=..) and records outcome and timing only. Never logs URLs, secrets or bodies.
import postgres from "postgres";
import { dispatchAuthorized } from "../_shared/email/dispatch.ts";
import { dispatchWebhooks, type WebhookDb, type WebhookDelivery } from "../_shared/webhooks.ts";

let sql: ReturnType<typeof postgres> | null = null;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

function database(url: string): WebhookDb {
  sql ??= postgres(url, { max: 1, prepare: false, idle_timeout: 20 });
  const asService = async <T>(run: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> =>
    (await sql!.begin(async (tx) => {
      await tx.unsafe("set local role service_role");
      return await run(tx);
    })) as T;
  return {
    async sweep() { await asService((tx) => tx`select lv.webhook_sweep()`); },
    async claim(limit) {
      const rows = await asService((tx) => tx`select lv.webhook_claim(${limit}) as r`);
      return ((rows[0]?.r as { deliveries?: WebhookDelivery[] } | undefined)?.deliveries ?? []);
    },
    async mark(id, result, statusCode, durationMs, error) {
      await asService((tx) => tx`select lv.webhook_mark(${id}::uuid, ${result}, ${statusCode}, ${durationMs}, ${error})`);
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { ok: false, error: { code: "lv_method", message: "Use POST." } });
  const env = (n: string) => Deno.env.get(n);
  if (!dispatchAuthorized(req.headers.get("authorization"), env)) {
    return reply(401, { ok: false, error: { code: "lv_unauthenticated", message: "Service role only." } });
  }
  const dbUrl = env("SUPABASE_DB_URL");
  if (!dbUrl) return reply(503, { ok: false, error: { code: "lv_not_configured", message: "The database is not configured." } });
  try {
    return reply(200, await dispatchWebhooks({ db: database(dbUrl), fetch }));
  } catch {
    console.error("webhook-dispatch: run failed");
    return reply(500, { ok: false, error: { code: "lv_server_error", message: "Dispatch failed; queued deliveries are kept." } });
  }
});
