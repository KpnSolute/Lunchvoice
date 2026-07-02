// staff-status: revalidates a persisted MJCCv2 staff session against MJCCv1 sudo.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("APP_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const devOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowList = allowedOrigins.length ? allowedOrigins : devOrigins;
  const allowOrigin = !origin || allowList.includes(origin) ? origin || allowList[0] : allowList[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function cleanUsername(value: string): string | null {
  const username = value.trim();
  return /^[a-z0-9._-]{2,80}$/i.test(username) ? username : null;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
    if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json(req, { error: "Missing session" }, 401);

    const V1_URL = required("MJCCV1_URL");
    const V1_SERVICE = required("MJCCV1_SERVICE_ROLE_KEY");
    const V2_URL = Deno.env.get("MJCCV2_URL") ?? required("SUPABASE_URL");
    const V2_SERVICE = Deno.env.get("MJCCV2_SERVICE_ROLE_KEY") ?? required("SUPABASE_SERVICE_ROLE_KEY");

    const v2 = createClient(V2_URL, V2_SERVICE, { auth: { persistSession: false } });
    const { data: userRes, error: userErr } = await v2.auth.getUser(token);
    if (userErr || !userRes.user) return json(req, { error: "Invalid session" }, 401);

    const { data: localProfile } = await v2
      .from("profiles")
      .select("id, email, is_staff, mjcc_username")
      .eq("id", userRes.user.id)
      .single();
    if (!localProfile?.is_staff || !localProfile.mjcc_username) {
      return json(req, { ok: true, staff: false });
    }
    const username = cleanUsername(localProfile.mjcc_username);
    if (!username) {
      await v2.from("profiles").update({ role: "student", is_staff: false }).eq("id", userRes.user.id);
      return json(req, { error: "Staff access revoked" }, 403);
    }

    const v1admin = createClient(V1_URL, V1_SERVICE, { auth: { persistSession: false } });
    const { data: v1Profile } = await v1admin
      .from("user_profiles")
      .select("role, active")
      .ilike("username", username)
      .single();

    const valid = !!v1Profile && v1Profile.active !== false && v1Profile.role === "sudo";
    if (!valid) {
      await v2.from("profiles").update({ role: "student", is_staff: false }).eq("id", userRes.user.id);
      return json(req, { error: "Staff access revoked" }, 403);
    }

    return json(req, { ok: true, staff: true });
  } catch (_e) {
    return json(req, { error: "Staff status check is temporarily unavailable." }, 500);
  }
});
