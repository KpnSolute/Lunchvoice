import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { provisionLunchvoiceStaff, type MjccStaffIdentity } from "../_shared/staffAccess.ts";

const allowedOrigins = (Deno.env.get("APP_ORIGINS") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const fixedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://interact-3npi.onrender.com",
];

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const wildcardTenant = (() => {
    try {
      const url = new URL(origin);
      return url.protocol === "https:" &&
        (url.hostname === "lunchvoice.com" ||
          url.hostname === "www.lunchvoice.com" ||
          url.hostname.endsWith(".lunchvoice.com"));
    } catch {
      return false;
    }
  })();
  const allowList = [...new Set([...allowedOrigins, ...fixedOrigins])];
  const allowOrigin = !origin || allowList.includes(origin) || wildcardTenant
    ? origin || allowList[0]
    : allowList[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Headers": "apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function bridgeSecret(): Promise<string> {
  const dedicated = Deno.env.get("LUNCHVOICE_SSO_SECRET")?.trim();
  if (dedicated && dedicated.length >= 32) return dedicated;
  const source = required("MJCCV1_SERVICE_ROLE_KEY");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(source),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode("lunchvoice-sso-bridge-v1"),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
    if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => null);
    const code = String(body?.code ?? "").trim();
    const org = String(body?.org ?? "").trim();
    if (code.length < 32 || code.length > 200 || !org) {
      return json(req, { error: "Invalid SSO request" }, 400);
    }

    const apiBase = (Deno.env.get("KPNCOMPUTE_API_BASE") ?? "https://mjcc-managements.onrender.com").replace(/\/$/, "");
    const exchange = await fetch(`${apiBase}/api/auth/lunchvoice-sso/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Lunchvoice-Sso-Secret": await bridgeSecret(),
      },
      body: JSON.stringify({ code }),
    });
    const identity = await exchange.json().catch(() => ({})) as Partial<MjccStaffIdentity> & { detail?: string };
    if (!exchange.ok) {
      return json(req, { error: identity.detail || "MJCC sign-in could not be confirmed" }, exchange.status);
    }
    if (!identity.tenant_slug || identity.tenant_slug.toLowerCase() !== org.toLowerCase()) {
      return json(req, { error: "SSO organization mismatch" }, 403);
    }

    const v2admin = createClient(
      Deno.env.get("MJCCV2_URL") ?? required("SUPABASE_URL"),
      Deno.env.get("MJCCV2_SERVICE_ROLE_KEY") ?? required("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );
    const session = await provisionLunchvoiceStaff(v2admin, identity as MjccStaffIdentity);
    return json(req, session);
  } catch (error) {
    console.error("staff_sso_unhandled", error instanceof Error ? error.message : error);
    return json(req, { error: "MJCC single sign-on is temporarily unavailable." }, 500);
  }
});
