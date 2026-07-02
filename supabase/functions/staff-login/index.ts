// staff-login: authenticates a staff member against MJCCv1, confirms role='sudo',
// then provisions/returns a MJCCv2 admin session.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigins = (Deno.env.get("APP_ORIGINS") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const devOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];
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
    try {
      ({ email, password } = await req.json());
    } catch {
      return json(req, { error: "Invalid body" }, 400);
    }
    if (!email || !password) return json(req, { error: "Username/email and password required" }, 400);
    const limited = rateLimit(req, email);
    if (limited) return limited;

    const V1_URL = required("MJCCV1_URL");
    const V1_ANON = required("MJCCV1_ANON_KEY");
    const V1_SERVICE = required("MJCCV1_SERVICE_ROLE_KEY");
    const V2_URL = Deno.env.get("MJCCV2_URL") ?? required("SUPABASE_URL");
    const V2_SERVICE = Deno.env.get("MJCCV2_SERVICE_ROLE_KEY") ?? required("SUPABASE_SERVICE_ROLE_KEY");

  const v1admin = createClient(V1_URL, V1_SERVICE, { auth: { persistSession: false } });

  let loginEmail = email.trim();
  if (!loginEmail.includes("@")) {
    const username = cleanUsername(loginEmail);
    if (!username) return json(req, { error: "Invalid staff credentials" }, 401);
    const { data: byName } = await v1admin
      .from("user_profiles")
      .select("id")
      .ilike("username", username)
      .single();
    if (!byName) return json(req, { error: "Invalid staff credentials" }, 401);
    const { data: authUser } = await v1admin.auth.admin.getUserById(byName.id);
    if (!authUser.user?.email) return json(req, { error: "Invalid staff credentials" }, 401);
    loginEmail = authUser.user.email;
  }

  const v1 = createClient(V1_URL, V1_ANON, { auth: { persistSession: false } });
  const { data: signIn, error: signErr } = await v1.auth.signInWithPassword({ email: loginEmail, password });
  if (signErr || !signIn.user) return json(req, { error: "Invalid staff credentials" }, 401);

  const { data: profile } = await v1admin
    .from("user_profiles")
    .select("role, username, display_name, last_name, active")
    .eq("id", signIn.user.id)
    .single();

  if (!profile || profile.active === false || profile.role !== "sudo") {
    return json(req, { error: "This account does not have sudo access." }, 403);
  }

  const v2 = createClient(V2_URL, V2_SERVICE, { auth: { persistSession: false } });

  let userId: string | undefined;
  const created = await v2.auth.admin.createUser({
    email: loginEmail,
    email_confirm: true,
    user_metadata: { staff: true, username: profile.username },
  });
  if (created.data.user) {
    userId = created.data.user.id;
  } else {
    const existingId = /already|registered|exists/i.test(created.error?.message ?? "") ? undefined : null;
    if (existingId === null) return json(req, { error: "Could not provision staff account" }, 500);
    for (let page = 1; page <= 20 && !userId; page++) {
      const { data: list } = await v2.auth.admin.listUsers({ page, perPage: 100 });
      userId = list.users.find((u) => u.email?.toLowerCase() === loginEmail.toLowerCase())?.id;
      if (list.users.length < 100) break;
    }
  }
  if (!userId) return json(req, { error: "Could not provision staff account" }, 500);

  const fullName = [profile.display_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.username;
  await v2.from("profiles").upsert({
    id: userId,
    email: loginEmail,
    display_name: fullName,
    role: "admin",
    is_staff: true,
    mjcc_username: profile.username,
  });

  const { data: link, error: linkErr } = await v2.auth.admin.generateLink({ type: "magiclink", email: loginEmail });
  if (linkErr || !link.properties) return json(req, { error: "Could not create session" }, 500);

  const { data: session, error: verifyErr } = await v2.auth.verifyOtp({
    type: "magiclink",
    email: loginEmail,
    token_hash: link.properties.hashed_token,
  });
  if (verifyErr || !session.session) return json(req, { error: "Could not create session" }, 500);

  return json(req, {
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    name: fullName,
  });
  } catch (_e) {
    return json(req, { error: "Staff login is temporarily unavailable." }, 500);
  }
});
