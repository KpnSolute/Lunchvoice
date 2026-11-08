// /functions/v1/api/v1/...   The public LunchVoice API (Team family). docs/v2/API_AND_DISCORD_PLAN.md section 1.
//
// verify_jwt = false: callers present a Hub API key, not a Supabase JWT. The function hashes the key (SHA-256) and
// hands only the hash to lv.api_key_call, which authenticates it, checks the Team plan, suspension, the creator's
// standing, the scope and the per-key rate limit, then runs the same lv_api operation the app uses as the key's
// creator, confined to the key's Hub. Results come from the strict suppression engine; free-text lists are removed.
// The database call runs as service_role (SET LOCAL ROLE); lv stays unexposed. Never logs keys, bodies or results.
import postgres from "postgres";
import { buildArgs, FixedWindowLimiter, parseApiKey, route, sha256Hex, statusFor } from "../_shared/api.ts";

const MAX_BODY_BYTES = 64 * 1024;
const preAuth = new FixedWindowLimiter(300); // per client address per minute, before any database work
let sql: ReturnType<typeof postgres> | null = null;

function reply(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra },
  });
}
const fail = (status: number, code: string, message: string, extra: Record<string, string> = {}) =>
  reply(status, { ok: false, error: { code, message } }, extra);

Deno.serve(async (req) => {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return fail(503, "lv_not_available", "The API is not configured.");

  const client = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const wait = preAuth.hit(client);
  if (wait !== null) return fail(429, "lv_rate_limited", "Too many requests.", { "retry-after": String(wait) });

  const url = new URL(req.url);
  const r = route(req.method, url.pathname);
  if (!r.ok) {
    return r.status === 405
      ? fail(405, "lv_method", "Method not allowed.", { allow: (r.allow ?? []).join(", ") })
      : fail(404, "lv_not_found", "No such endpoint.");
  }

  const key = parseApiKey(req.headers.get("authorization"), req.headers.get("x-api-key"));
  if (!key) return fail(401, "lv_unauthenticated", "Send your Hub API key as Authorization: Bearer lvk_...", { "www-authenticate": "Bearer" });

  let body: unknown = undefined;
  if (req.method === "POST" || req.method === "PATCH") {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return fail(413, "lv_invalid_input", "The body is too large.");
    if (raw.trim()) {
      try {
        body = JSON.parse(raw);
      } catch {
        return fail(400, "lv_invalid_input", "The body is not JSON.");
      }
    }
  }
  const args = buildArgs(r.op, r.params, body);
  if (!args.ok) return fail(400, "lv_invalid_input", args.message);

  try {
    sql ??= postgres(dbUrl, { max: 2, prepare: false, idle_timeout: 20 });
    const hash = await sha256Hex(key);
    const rows = await sql.begin(async (tx) => {
      await tx.unsafe("set local role service_role");
      return await tx`select lv.api_key_call(${hash}, ${r.op}, ${tx.json(args.args as postgres.JSONValue)}) as result`;
    });
    const result = (rows[0]?.result ?? { ok: false, error: { code: "lv_server_error", message: "No result." } }) as {
      ok: boolean; error?: { code?: string; retry_after?: number };
    };
    const status = statusFor(result);
    const headers: Record<string, string> = {};
    if (status === 429 && result.error?.retry_after) headers["retry-after"] = String(result.error.retry_after);
    return reply(status, result, headers);
  } catch {
    console.error("api: request failed");
    return fail(500, "lv_server_error", "Something went wrong on our side.");
  }
});
