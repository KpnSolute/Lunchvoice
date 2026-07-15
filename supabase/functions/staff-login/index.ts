// staff-login: legacy rollback path that authenticates against MJCCv1 and
// confirms the live LionCafe role-scope grant.
// then provisions/returns a MJCCv2 admin session.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { hasLionCafeAccess } from "../_shared/staffAccess.ts";

const allowedOrigins = (Deno.env.get("APP_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const devOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
const attempts = new Map<string, { count: number; resetAt: number }>();

function corsFor(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowList = [...new Set([...allowedOrigins, ...devOrigins])];
  const wildcardTenant = (() => {
    try {
      const url = new URL(origin);
      return url.protocol === "https:" && (url.hostname === "lunchvoice.com" || url.hostname === "www.lunchvoice.com" || url.hostname.endsWith(".lunchvoice.com"));
    } catch {
      return false;
    }
  })();
  const allowOrigin = !origin || allowList.includes(origin) || wildcardTenant ? origin || allowList[0] : allowList[0];
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

function rateLimit(req: Request, login: string): Response | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  const key = `${ip}:${login.toLowerCase()}`;
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

function cleanUsername(value: string): string | null {
  const username = value.trim();
  return /^[a-z0-9._-]{2,80}$/i.test(username) ? username : null;
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
    if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

    let email = "";
    let password = "";
    let orgSlug = "";
    try {
      ({ email, password, org: orgSlug } = await req.json());
    } catch {
      return json(req, { error: "Invalid body" }, 400);
    }
    if (!email || !password) return json(req, { error: "Username/email and password required" }, 400);
    orgSlug = String(orgSlug ?? "").trim();
    if (!orgSlug) return json(req, { error: "Organization slug required" }, 400);
    const limited = rateLimit(req, email);
    if (limited) return limited;

    const V1_URL = required("MJCCV1_URL");
    const V1_ANON = required("MJCCV1_ANON_KEY");
    const V1_SERVICE = required("MJCCV1_SERVICE_ROLE_KEY");
    const V2_URL = Deno.env.get("MJCCV2_URL") ?? required("SUPABASE_URL");
    const V2_SERVICE = Deno.env.get("MJCCV2_SERVICE_ROLE_KEY") ?? required("SUPABASE_SERVICE_ROLE_KEY");

    // Resolve org
    const v2admin = createClient(V2_URL, V2_SERVICE, { auth: { persistSession: false } });
    const { data: org } = await v2admin
      .from("orgs")
      .select("id, auth_provider")
      .ilike("slug", orgSlug)
      .maybeSingle();
    if (!org) return json(req, { error: "Unknown organization." }, 404);

    // Only mjcc_v1_sudo orgs supported today
    if (org.auth_provider !== "mjcc_v1_sudo") {
      return json(req, { error: "Staff login not yet configured for this organization." }, 501);
    }

    const v1admin = createClient(V1_URL, V1_SERVICE, { auth: { persistSession: false } });

    let loginEmail = email.trim();
    if (!loginEmail.includes("@")) {
      const username = cleanUsername(loginEmail);
      if (!username) return json(req, { error: "Invalid staff credentials" }, 401);
      const { data: byName, error: byNameErr } = await v1admin
        .from("user_profiles")
        .select("id")
        .ilike("username", username)
        .maybeSingle();
      if (byNameErr) {
        console.error("staff_v1_username_lookup_failed", byNameErr.message);
        return json(req, { error: "Could not reach MJCCv1 profile lookup." }, 502);
      }
      if (!byName) return json(req, { error: "Invalid staff credentials" }, 401);
      const { data: authUser, error: authUserErr } = await v1admin.auth.admin.getUserById(byName.id);
      if (authUserErr) {
        console.error("staff_v1_auth_user_lookup_failed", authUserErr.message);
        return json(req, { error: "Could not fetch MJCCv1 auth user." }, 502);
      }
      if (!authUser.user?.email) return json(req, { error: "Invalid staff credentials" }, 401);
      loginEmail = authUser.user.email;
    }

    const v1 = createClient(V1_URL, V1_ANON, { auth: { persistSession: false } });
    const { data: signIn, error: signErr } = await v1.auth.signInWithPassword({ email: loginEmail, password });
    if (signErr || !signIn.user) return json(req, { error: "Invalid staff credentials" }, 401);

    const { data: profile, error: profileErr } = await v1admin
      .from("user_profiles")
      .select("role, username, display_name, last_name, active")
      .eq("id", signIn.user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("staff_v1_profile_confirm_failed", profileErr.message);
      return json(req, { error: "Could not confirm MJCCv1 sudo profile." }, 502);
    }

    if (!profile || profile.active === false || !await hasLionCafeAccess(v1admin, profile.role)) {
      return json(req, { error: "This account does not have LionCafe access." }, 403);
    }

    let userId: string | undefined;
    const created = await v2admin.auth.admin.createUser({
      email: loginEmail,
      email_confirm: true,
      user_metadata: { staff: true, username: profile.username, org_id: org.id },
    });
    if (created.data.user) {
      userId = created.data.user.id;
    } else {
      const existingId = /already|registered|exists/i.test(created.error?.message ?? "") ? undefined : null;
      if (existingId === null) return json(req, { error: "Could not provision staff account" }, 500);
      for (let page = 1; page <= 20 && !userId; page++) {
        const { data: list } = await v2admin.auth.admin.listUsers({ page, perPage: 100 });
        userId = list.users.find((u) => u.email?.toLowerCase() === loginEmail.toLowerCase())?.id;
        if (list.users.length < 100) break;
      }
    }
    if (!userId) return json(req, { error: "Could not provision staff account" }, 500);

    const fullName = [profile.display_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.username;
    await v2admin.from("profiles").upsert({
      id: userId,
      email: loginEmail,
      display_name: fullName,
      role: "admin",
      is_staff: true,
      mjcc_username: profile.username,
      org_id: org.id,
    });

    const { data: link, error: linkErr } = await v2admin.auth.admin.generateLink({ type: "magiclink", email: loginEmail });
    if (linkErr || !link.properties) {
      console.error("staff_v2_generate_link_failed", linkErr?.message ?? "missing link properties");
      return json(req, { error: "Could not create session" }, 500);
    }

    const { data: session, error: verifyErr } = await v2admin.auth.verifyOtp({
      type: "magiclink",
      token_hash: link.properties.hashed_token,
    });
    if (verifyErr || !session.session) {
      console.error("staff_v2_verify_link_failed", verifyErr?.message ?? "missing session");
      return json(req, { error: "Could not create session" }, 500);
    }

    return json(req, {
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
      name: fullName,
    });
  } catch (e) {
    console.error("staff_login_unhandled", e instanceof Error ? e.message : e);
    return json(req, { error: "Staff login is temporarily unavailable." }, 500);
  }
});
