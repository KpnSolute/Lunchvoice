// login-start: classifies a login identifier and starts student OTP delivery.
// Staff usernames are checked against MJCCv1 sudo profiles; student emails are
// checked against MJCCv2 profiles so the UI can distinguish returning/new users.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("APP_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const devOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const STAFF_DOMAIN = "@mjc-cafeteria.com";
const attempts = new Map<string, { count: number; resetAt: number }>();

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

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function cleanUsername(value: string): string | null {
  const username = value.trim();
  return /^[a-z0-9._-]{2,80}$/i.test(username) ? username : null;
}

function rateLimit(req: Request, identifier: string): Response | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  const key = `${ip}:${identifier.toLowerCase()}`;
  const now = Date.now();
  for (const [k, v] of attempts) {
    if (v.resetAt < now) attempts.delete(k);
  }
  const cur = attempts.get(key);
  if (!cur || cur.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + 10 * 60_000 });
    return null;
  }
  cur.count += 1;
  if (cur.count > 8) return json(req, { error: "Too many attempts. Try again later." }, 429);
  return null;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
    if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

    let identifier = "";
    try {
      ({ identifier } = await req.json());
    } catch {
      return json(req, { error: "Invalid body" }, 400);
    }

    identifier = String(identifier ?? "").trim();
    if (!identifier) return json(req, { error: "Email or staff username required" }, 400);
    const limited = rateLimit(req, identifier);
    if (limited) return limited;

    const V1_URL = required("MJCCV1_URL");
    const V1_SERVICE = required("MJCCV1_SERVICE_ROLE_KEY");
    const V2_URL = Deno.env.get("MJCCV2_URL") ?? required("SUPABASE_URL");
    const V2_SERVICE = Deno.env.get("MJCCV2_SERVICE_ROLE_KEY") ?? required("SUPABASE_SERVICE_ROLE_KEY");
    const V2_ANON = Deno.env.get("MJCCV2_ANON_KEY") ?? required("SUPABASE_ANON_KEY");

    if (!isEmail(identifier)) {
      const username = cleanUsername(identifier);
      if (!username) return json(req, { error: "Enter a valid student email or staff username." }, 400);

      const v1admin = createClient(V1_URL, V1_SERVICE, { auth: { persistSession: false } });
      const { data: staffProfile, error: staffErr } = await v1admin
        .from("user_profiles")
        .select("id, role, active")
        .ilike("username", username)
        .maybeSingle();

      if (staffErr) {
        console.error("login_start_staff_lookup_failed", staffErr.message);
        return json(req, { error: "Could not reach MJCCv1 staff lookup." }, 502);
      }
      if (!staffProfile || staffProfile.active === false || staffProfile.role !== "sudo") {
        return json(req, { error: "Staff username not found." }, 404);
      }
      return json(req, { kind: "staff" });
    }

    const email = identifier.toLowerCase();
    if (email.endsWith(STAFF_DOMAIN)) {
      return json(req, { error: "Staff should enter their MJCC username, not email." }, 400);
    }

    const v2admin = createClient(V2_URL, V2_SERVICE, { auth: { persistSession: false } });
    const { data: existingProfile, error: profileErr } = await v2admin
      .from("profiles")
      .select("id, is_staff")
      .ilike("email", email)
      .maybeSingle();

    if (profileErr) {
      console.error("login_start_student_lookup_failed", profileErr.message);
      return json(req, { error: "Could not reach student lookup." }, 502);
    }
    if (existingProfile?.is_staff) {
      return json(req, { error: "Staff should enter their MJCC username, not email." }, 400);
    }

    const auth = createClient(V2_URL, V2_ANON, { auth: { persistSession: false } });
    const kind = existingProfile ? "student_returning" : "student_new";
    const { error } = await auth.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: !existingProfile },
    });
    if (error) {
      console.error("login_start_student_otp_failed", error.message);
      return json(req, { error: "Could not send verification code." }, 502);
    }

    return json(req, { kind });
  } catch (e) {
    console.error("login_start_unhandled", e instanceof Error ? e.message : e);
    return json(req, { error: "Login is temporarily unavailable." }, 500);
  }
});
