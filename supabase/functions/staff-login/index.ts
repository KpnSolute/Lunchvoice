// staff-login: authenticates a staff member against the MJCCv1 project, confirms they
// are role='sudo' there, then provisions/returns a MJCCv2 admin session for them.
//
// The MJCCv1 verification uses MJCCv1's service role (a secret the client never sees),
// so a student cannot forge admin access — they'd need the sudo user's real MJCCv1
// password, and their MJCCv1 role must be 'sudo' live at login time.
//
// Required secrets (supabase secrets set ...):
//   MJCCV1_URL              e.g. https://mgvyylvmkxhhataavqjz.supabase.co
//   MJCCV1_ANON_KEY         MJCCv1 anon/publishable key (for password grant)
//   MJCCV1_SERVICE_ROLE_KEY MJCCv1 service_role key (to read user_profiles.role)
//   MJCCV2_URL              this project's URL (auto-available as SUPABASE_URL)
//   MJCCV2_SERVICE_ROLE_KEY this project's service_role (auto: SUPABASE_SERVICE_ROLE_KEY)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let email = "", password = "";
  try {
    ({ email, password } = await req.json());
  } catch {
    return json({ error: "Invalid body" }, 400);
  }
  if (!email || !password) return json({ error: "Email and password required" }, 400);

  const V1_URL = Deno.env.get("MJCCV1_URL")!;
  const V1_ANON = Deno.env.get("MJCCV1_ANON_KEY")!;
  const V1_SERVICE = Deno.env.get("MJCCV1_SERVICE_ROLE_KEY")!;
  const V2_URL = Deno.env.get("MJCCV2_URL") ?? Deno.env.get("SUPABASE_URL")!;
  const V2_SERVICE = Deno.env.get("MJCCV2_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // 1) Verify staff credentials against MJCCv1.
  const v1 = createClient(V1_URL, V1_ANON, { auth: { persistSession: false } });
  const { data: signIn, error: signErr } = await v1.auth.signInWithPassword({ email, password });
  if (signErr || !signIn.user) return json({ error: "Invalid staff credentials" }, 401);

  // 2) Confirm role='sudo' in MJCCv1 (service role bypasses RLS).
  const v1admin = createClient(V1_URL, V1_SERVICE, { auth: { persistSession: false } });
  const { data: profile } = await v1admin
    .from("user_profiles")
    .select("role, username, display_name, last_name, active")
    .eq("id", signIn.user.id)
    .single();

  if (!profile || profile.active === false || profile.role !== "sudo") {
    return json({ error: "This account does not have sudo access." }, 403);
  }

  // 3) Provision an admin profile in MJCCv2 and mint a session for this email.
  const v2 = createClient(V2_URL, V2_SERVICE, { auth: { persistSession: false } });

  // Ensure an auth user exists for this email in MJCCv2.
  let userId: string | undefined;
  const created = await v2.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { staff: true, username: profile.username },
  });
  if (created.data.user) {
    userId = created.data.user.id;
  } else {
    // Already exists — find them.
    const { data: list } = await v2.auth.admin.listUsers();
    userId = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
  }
  if (!userId) return json({ error: "Could not provision staff account" }, 500);

  const fullName = [profile.display_name, profile.last_name].filter(Boolean).join(" ").trim() || profile.username;
  await v2.from("profiles").upsert({
    id: userId,
    email,
    display_name: fullName,
    role: "admin",
    is_staff: true,
    mjcc_username: profile.username,
  });

  // 4) Generate a magic link, then verify the OTP server-side to obtain a real session.
  const { data: link, error: linkErr } = await v2.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link.properties) return json({ error: "Could not create session" }, 500);

  const { data: session, error: verifyErr } = await v2.auth.verifyOtp({
    type: "magiclink",
    email,
    token_hash: link.properties.hashed_token,
  });
  if (verifyErr || !session.session) return json({ error: "Could not create session" }, 500);

  return json({
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    name: fullName,
  });
});
