// POST /functions/v1/email-dispatch   (cron or an operator -> LunchVoice -> Resend)
//
// Service role only: the bearer must be SUPABASE_SERVICE_ROLE_KEY (or the optional EMAIL_DISPATCH_SECRET), compared
// in constant time; everyone else gets 401. Queues reservation reminders, then sends due outbox mail through Resend
// when RESEND_API_KEY is set; otherwise it leaves every message queued. Never logs addresses, payloads or secrets.
// Schedule with pg_cron + pg_net (see docs/backend/PRODUCTION_RESET_RUNBOOK.md, "Enabling Stripe and email").
import postgres from "postgres";
import { dispatchAuthorized, dispatchOnce, type DispatchDb, type OutboxMessage } from "../_shared/email/dispatch.ts";

let sql: ReturnType<typeof postgres> | null = null;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

function database(url: string): DispatchDb {
  sql ??= postgres(url, { max: 1, prepare: false, idle_timeout: 20 });
  const asService = async <T>(run: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> =>
    (await sql!.begin(async (tx) => {
      await tx.unsafe("set local role service_role");
      return await run(tx);
    })) as T;
  return {
    async reservationSweep() { await asService((tx) => tx`select lv.email_reservation_sweep()`); },
    async claim(limit) {
      const rows = await asService((tx) => tx`select lv.email_claim(${limit}) as r`);
      return ((rows[0]?.r as { messages?: OutboxMessage[] } | undefined)?.messages ?? []);
    },
    async mark(id, result, error, providerId) {
      await asService((tx) => tx`select lv.email_mark(${id}::uuid, ${result}, ${error ?? null}, ${providerId ?? null})`);
    },
    async retention() {
      const rows = await asService((tx) => tx`select lv.email_retention_sweep() as r`);
      const r = (rows[0]?.r ?? {}) as { deleted?: number; queued?: number };
      return { deleted: r.deleted ?? 0, queued: r.queued ?? 0 };
    },
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { ok: false, error: { code: "lv_method", message: "Use POST." } });
  const env = (n: string) => Deno.env.get(n);
  if (!dispatchAuthorized(req.headers.get("authorization"), env, req.headers.get("apikey"))) {
    return reply(401, { ok: false, error: { code: "lv_unauthenticated", message: "Service role only." } });
  }
  const dbUrl = env("SUPABASE_DB_URL");
  if (!dbUrl) return reply(503, { ok: false, error: { code: "lv_not_configured", message: "The database is not configured." } });
  try {
    return reply(200, await dispatchOnce({ env, fetch, db: database(dbUrl) }));
  } catch {
    console.error("email-dispatch: run failed");
    return reply(500, { ok: false, error: { code: "lv_server_error", message: "Dispatch failed; queued mail is kept." } });
  }
});
