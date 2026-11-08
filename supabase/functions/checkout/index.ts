// POST /functions/v1/checkout   (browser -> LunchVoice -> Stripe)
//
// Creates Stripe Checkout Sessions and Customer Portal sessions server-side. See _shared/checkout.ts for the
// request contract. The caller is authenticated by the database (their session token goes to PostgREST); the
// service role is used only for the narrow lv.checkout_* / lv.billing_customer_* functions, over SET LOCAL ROLE.
// Fails closed (503 lv_billing_unavailable) while STRIPE_SECRET_KEY or SUPABASE_DB_URL is unset. Never logs
// secrets, tokens or provider payloads.
import postgres from "postgres";
import { handleCheckoutRequest, type CheckoutDb } from "../_shared/checkout.ts";
import type { SessionContext } from "../_shared/stripe.ts";

let sql: ReturnType<typeof postgres> | null = null;

function database(): CheckoutDb | null {
  const url = Deno.env.get("SUPABASE_DB_URL");
  if (!url) return null;
  sql ??= postgres(url, { max: 1, prepare: false, idle_timeout: 20 });
  const asService = async <T>(run: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> =>
    (await sql!.begin(async (tx) => {
      await tx.unsafe("set local role service_role");
      return await run(tx);
    })) as T;
  return {
    async sessionContext(intentId) {
      const rows = await asService((tx) => tx`select lv.checkout_session_context(${intentId}::uuid) as r`);
      const r = rows[0]?.r as (SessionContext & { ok: boolean }) | undefined;
      return r?.ok ? r : null;
    },
    async setCustomer(accountId, customerId) {
      const rows = await asService((tx) => tx`select lv.billing_customer_set(${accountId}::uuid, ${customerId}) as r`);
      const r = rows[0]?.r as { ok: boolean; customer_id?: string } | undefined;
      if (!r?.ok || !r.customer_id) throw new Error("customer not stored");
      return r.customer_id;
    },
    async attachSession(intentId, sessionId) {
      await asService((tx) => tx`select lv.checkout_intent_attach(${intentId}::uuid, ${sessionId})`);
    },
    async customerOf(accountId) {
      const rows = await asService((tx) => tx`select lv.billing_customer_of(${accountId}::uuid) as r`);
      return (rows[0]?.r as string | null) ?? null;
    },
  };
}

Deno.serve((req) => handleCheckoutRequest(req, { env: (n) => Deno.env.get(n), fetch, db: database() }));
