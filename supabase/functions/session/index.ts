// POST /functions/v1/session  { idToken, nonce }  ->  { ok: true, session, expiresIn }
// Exchanges a KpnIdentity ID token for a LunchVoice session. See _shared/session.ts.
import { configFromEnv, issueSession, SessionError, verifyIdToken, type SessionConfig } from "../_shared/session.ts";

const allowedOrigins = (Deno.env.get("LV_ALLOWED_ORIGINS") ?? "https://lunchvoice.com,https://www.lunchvoice.com")
  .split(",").map((v) => v.trim()).filter(Boolean);

let cached: SessionConfig | null = null;

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
    cached ??= configFromEnv((name) => Deno.env.get(name));
    const body = await req.json().catch(() => ({})) as { idToken?: unknown; nonce?: unknown };
    if (typeof body.idToken !== "string" || typeof body.nonce !== "string") {
      return reply(400, { ok: false, error: { code: "lv_invalid_token", message: "idToken and nonce are required." } }, origin);
    }
    const identity = await verifyIdToken(body.idToken, body.nonce, cached);
    const session = await issueSession(identity, cached);
    return reply(200, { ok: true, session: session.token, expiresIn: session.expiresIn }, origin);
  } catch (error) {
    if (error instanceof SessionError) {
      return reply(error.code === "lv_not_configured" ? 503 : 401, { ok: false, error: { code: error.code, message: error.message } }, origin);
    }
    return reply(500, { ok: false, error: { code: "lv_server_error", message: "Sign-in failed. Try again." } }, origin);
  }
});
