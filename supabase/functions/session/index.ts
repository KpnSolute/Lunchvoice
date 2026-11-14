// POST /functions/v1/session  { idToken, nonce }  ->  { ok: true, session, expiresIn }
// Exchanges a KpnIdentity ID token for a LunchVoice session. See _shared/session.ts.
//
// LC-13: every ID token is exchanged at most once. With SUPABASE_DB_URL (set automatically for deployed Edge
// Functions) the single-use record is lv.session_exchange_consume (000018), called as service_role like the
// billing webhook. Until 000018 is applied (undefined function), or without a database URL, the function falls back
// to an in-memory record per instance, so deploying it before the migration never breaks sign-in.
import postgres from "postgres";
import { configFromEnv, issueSession, memoryReplayGuard, SessionError, verifyIdToken, verifySupabaseToken, type ReplayGuard, type SessionConfig } from "../_shared/session.ts";

const allowedOrigins = (Deno.env.get("LV_ALLOWED_ORIGINS") ?? "https://lunchvoice.com,https://www.lunchvoice.com")
  .split(",").map((v) => v.trim()).filter(Boolean);

let cached: SessionConfig | null = null;
let sql: ReturnType<typeof postgres> | null = null;
const memory = memoryReplayGuard();

const replayGuard: ReplayGuard = {
  async consume(keyHash, expiresAt) {
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) return memory.consume(keyHash, expiresAt);
    try {
      sql ??= postgres(dbUrl, { max: 1, prepare: false, idle_timeout: 20 });
      const rows = await sql.begin(async (tx) => {
        await tx.unsafe("set local role service_role");
        return await tx`select lv.session_exchange_consume(${keyHash}, ${expiresAt.toISOString()}::timestamptz) as fresh`;
      });
      return rows[0]?.fresh === true;
    } catch (error) {
      // 42883: lv.session_exchange_consume does not exist yet (000018 not applied). Anything else fails closed.
      if ((error as { code?: string })?.code === "42883") {
        console.warn("session: 000018 not applied; using the in-memory replay record");
        return memory.consume(keyHash, expiresAt);
      }
      throw error;
    }
  },
};

function cors(origin: string | null): Record<string, string> {
  const allow = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? "";
  return {
    "access-control-allow-origin": allow,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization, apikey, x-client-info",
    "vary": "origin",
  };
}

function reply(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "content-type": "application/json", "cache-control": "no-store" } });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return reply(405, { ok: false, error: { code: "lv_method", message: "Use POST." } }, origin);
  try {
    cached ??= { ...configFromEnv((name) => Deno.env.get(name)), replayGuard };
    const body = await req.json().catch(() => ({})) as { idToken?: unknown; nonce?: unknown; accessToken?: unknown; kind?: unknown };
    let identity;
    if (body.kind === "supabase") {
      // A7: LunchVoice's own sign-in. Off unless LV_OWN_AUTH is set (verifySupabaseToken answers lv_not_configured).
      if (typeof body.accessToken !== "string") {
        return reply(400, { ok: false, error: { code: "lv_invalid_token", message: "accessToken is required." } }, origin);
      }
      identity = await verifySupabaseToken(body.accessToken, cached);
    } else {
      if (typeof body.idToken !== "string" || typeof body.nonce !== "string") {
        return reply(400, { ok: false, error: { code: "lv_invalid_token", message: "idToken and nonce are required." } }, origin);
      }
      identity = await verifyIdToken(body.idToken, body.nonce, cached);
    }
    const session = await issueSession(identity, cached);
    return reply(200, { ok: true, session: session.token, expiresIn: session.expiresIn }, origin);
  } catch (error) {
    if (error instanceof SessionError) {
      return reply(error.code === "lv_not_configured" ? 503 : 401, { ok: false, error: { code: error.code, message: error.message } }, origin);
    }
    return reply(500, { ok: false, error: { code: "lv_server_error", message: "Sign-in failed. Try again." } }, origin);
  }
});
