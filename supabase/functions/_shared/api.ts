// Pure helpers for the public LunchVoice API Edge Function `api` (docs/v2/API_AND_DISCORD_PLAN.md section 1).
//
// Dependency-free so they run in Deno (the function) and in Node tests. The database is the authority: it checks the
// key, the Team plan, suspension, the creator's standing, the scope and the rate limit (lv.api_key_call). These
// helpers only route the request, parse the key, shape the arguments and map error codes to HTTP statuses. A scope
// check here is a fast early answer, never the only one.

export const API_SCOPES = ["campaigns:read", "campaigns:write", "invites:write", "results:read", "webhooks:manage"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export type ApiOp =
  | "hub.get"
  | "campaigns.list"
  | "campaigns.get"
  | "campaigns.create"
  | "campaigns.update"
  | "campaigns.questions.add"
  | "campaigns.schedule"
  | "campaigns.publish"
  | "campaigns.close"
  | "campaigns.invites.create"
  | "invites.create"
  | "results.get"
  | "webhooks.list"
  | "webhooks.create"
  | "webhooks.update"
  | "webhooks.delete";

/** Mirrors lv.api_op_scope. */
export const OP_SCOPES: Record<ApiOp, ApiScope> = {
  "hub.get": "campaigns:read",
  "campaigns.list": "campaigns:read",
  "campaigns.get": "campaigns:read",
  "campaigns.create": "campaigns:write",
  "campaigns.update": "campaigns:write",
  "campaigns.questions.add": "campaigns:write",
  "campaigns.schedule": "campaigns:write",
  "campaigns.publish": "campaigns:write",
  "campaigns.close": "campaigns:write",
  "campaigns.invites.create": "invites:write",
  "invites.create": "invites:write",
  "results.get": "results:read",
  "webhooks.list": "webhooks:manage",
  "webhooks.create": "webhooks:manage",
  "webhooks.update": "webhooks:manage",
  "webhooks.delete": "webhooks:manage",
};

export function hasScope(scopes: readonly string[], op: ApiOp): boolean {
  return scopes.includes(OP_SCOPES[op]);
}

/* ------------------------------------------------------------------ keys */

export const API_KEY_PATTERN = /^lvk_[0-9a-f]{12}_[0-9a-f]{48}$/;

/** The presented key from `Authorization: Bearer lvk_...` or `X-Api-Key: lvk_...`; null when absent or malformed. */
export function parseApiKey(authorization: string | null | undefined, xApiKey?: string | null): string | null {
  const bearer = /^Bearer\s+(\S+)$/i.exec((authorization ?? "").trim())?.[1];
  const candidate = (bearer ?? xApiKey ?? "").trim();
  return API_KEY_PATTERN.test(candidate) ? candidate : null;
}

/** The prefix shown in Hub settings (`lvk_` + 12 hex), safe to log. */
export function keyPrefix(key: string): string {
  return key.slice(0, 16);
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ routing */

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

interface RouteDef {
  pattern: RegExp;
  param?: "campaign_id" | "endpoint_id";
  methods: Partial<Record<string, ApiOp>>;
}

const ROUTES: RouteDef[] = [
  { pattern: /^\/v1\/hub$/, methods: { GET: "hub.get" } },
  { pattern: /^\/v1\/campaigns$/, methods: { GET: "campaigns.list", POST: "campaigns.create" } },
  { pattern: new RegExp(`^/v1/campaigns/(${UUID})$`), param: "campaign_id", methods: { GET: "campaigns.get", PATCH: "campaigns.update" } },
  { pattern: new RegExp(`^/v1/campaigns/(${UUID})/questions$`), param: "campaign_id", methods: { POST: "campaigns.questions.add" } },
  { pattern: new RegExp(`^/v1/campaigns/(${UUID})/schedule$`), param: "campaign_id", methods: { POST: "campaigns.schedule" } },
  { pattern: new RegExp(`^/v1/campaigns/(${UUID})/publish$`), param: "campaign_id", methods: { POST: "campaigns.publish" } },
  { pattern: new RegExp(`^/v1/campaigns/(${UUID})/close$`), param: "campaign_id", methods: { POST: "campaigns.close" } },
  { pattern: new RegExp(`^/v1/campaigns/(${UUID})/invites$`), param: "campaign_id", methods: { POST: "campaigns.invites.create" } },
  { pattern: new RegExp(`^/v1/campaigns/(${UUID})/results$`), param: "campaign_id", methods: { GET: "results.get" } },
  { pattern: /^\/v1\/invites$/, methods: { POST: "invites.create" } },
  { pattern: /^\/v1\/webhooks$/, methods: { GET: "webhooks.list", POST: "webhooks.create" } },
  { pattern: new RegExp(`^/v1/webhooks/(${UUID})$`), param: "endpoint_id", methods: { PATCH: "webhooks.update", DELETE: "webhooks.delete" } },
];

export type RouteResult =
  | { ok: true; op: ApiOp; params: Record<string, string> }
  | { ok: false; status: 404 | 405; allow?: string[] };

/** Strip the function mount (`/functions/v1/api` or `/api`) and match a `/v1/...` route. */
export function route(method: string, pathname: string): RouteResult {
  const at = pathname.lastIndexOf("/v1/");
  const path = (at >= 0 ? pathname.slice(at) : pathname.endsWith("/v1") ? "/v1" : pathname).replace(/\/+$/, "");
  for (const r of ROUTES) {
    const m = r.pattern.exec(path);
    if (!m) continue;
    const op = r.methods[method.toUpperCase()];
    if (!op) return { ok: false, status: 405, allow: Object.keys(r.methods) };
    return { ok: true, op, params: r.param ? { [r.param]: m[1].toLowerCase() } : {} };
  }
  return { ok: false, status: 404 };
}

/* ------------------------------------------------------------------ arguments */

type FieldType = "string" | "int" | "bool" | "object" | "string[]" | "timestamp";
const FIELDS: Partial<Record<ApiOp, Record<string, FieldType>>> = {
  "campaigns.create": { title: "string", mode: "string", anonymity: "string", description: "string" },
  "campaigns.update": { title: "string", description: "string" },
  "campaigns.questions.add": { position: "int", kind: "string", prompt: "string", config: "object" },
  "campaigns.schedule": { opens_at: "timestamp", closes_at: "timestamp" },
  "campaigns.invites.create": { max_uses: "int", expires_at: "timestamp" },
  "invites.create": { max_uses: "int", expires_at: "timestamp" },
  "webhooks.create": { url: "string", events: "string[]" },
  "webhooks.update": { events: "string[]", enabled: "bool" },
};
const REQUIRED: Partial<Record<ApiOp, string[]>> = {
  "campaigns.create": ["title"],
  "campaigns.questions.add": ["position", "kind", "prompt"],
  "webhooks.create": ["url"],
};

function typeOk(t: FieldType, v: unknown): boolean {
  switch (t) {
    case "string": return typeof v === "string" && v.length <= 5000;
    case "int": return typeof v === "number" && Number.isInteger(v) && Math.abs(v) < 2 ** 31;
    case "bool": return typeof v === "boolean";
    case "object": return typeof v === "object" && v !== null && !Array.isArray(v);
    case "string[]": return Array.isArray(v) && v.length <= 10 && v.every((x) => typeof x === "string" && x.length <= 100);
    case "timestamp": return typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v));
  }
}

export type ArgsResult = { ok: true; args: Record<string, unknown> } | { ok: false; message: string };

/** Validate a JSON body against the operation's fields; unknown fields are refused, so typos never pass silently. */
export function buildArgs(op: ApiOp, params: Record<string, string>, body: unknown): ArgsResult {
  const fields = FIELDS[op] ?? {};
  const args: Record<string, unknown> = { ...params };
  if (body !== undefined && body !== null) {
    if (typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "The body must be a JSON object." };
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      const t = fields[k];
      if (!t) return { ok: false, message: `Unknown field: ${k}.` };
      if (v === null) continue;
      if (!typeOk(t, v)) return { ok: false, message: `Field ${k} has the wrong type.` };
      args[k] = v;
    }
  }
  for (const k of REQUIRED[op] ?? []) if (args[k] === undefined) return { ok: false, message: `Field ${k} is required.` };
  return { ok: true, args };
}

/* ------------------------------------------------------------------ HTTP mapping */

export function statusFor(result: unknown): number {
  const r = result as { ok?: boolean; error?: { code?: string } } | null;
  if (r?.ok) return 200;
  switch (r?.error?.code) {
    case "lv_unauthenticated": return 401;
    case "lv_entitlement_required": return 402;
    case "lv_forbidden": case "lv_not_available": return 403;
    case "lv_not_found": return 404;
    case "lv_conflict": case "lv_limit_reached": case "lv_gate_blocked": case "lv_lifecycle_invalid":
    case "lv_policy_undecided": case "lv_locked": case "lv_closed": return 409;
    case "lv_rate_limited": return 429;
    case "lv_server_error": return 500;
    default: return 400;
  }
}

/* ------------------------------------------------------------------ pre-auth flood brake */

/**
 * In-memory fixed-window limiter, used before the database to blunt floods of bad keys from one address. The
 * authoritative per-key limit lives in the database (lv.integration_rate_hit); this one is per isolate and best effort.
 */
export class FixedWindowLimiter {
  private windows = new Map<string, { start: number; n: number }>();
  constructor(private limit: number, private windowMs = 60_000, private maxKeys = 10_000) {}

  /** Seconds to wait when over the limit, otherwise null. */
  hit(key: string, nowMs: number = Date.now()): number | null {
    const start = Math.floor(nowMs / this.windowMs) * this.windowMs;
    const w = this.windows.get(key);
    if (!w || w.start !== start) {
      if (this.windows.size >= this.maxKeys) this.windows.clear();
      this.windows.set(key, { start, n: 1 });
      return this.limit >= 1 ? null : Math.ceil((start + this.windowMs - nowMs) / 1000);
    }
    w.n += 1;
    return w.n > this.limit ? Math.max(1, Math.ceil((start + this.windowMs - nowMs) / 1000)) : null;
  }
}
