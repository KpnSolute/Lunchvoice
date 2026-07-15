import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type MjccStaffIdentity = {
  mjcc_user_id: string;
  username: string;
  email: string;
  display_name: string;
  mjcc_role: string;
  tenant_slug: string;
};

export async function hasLionCafeAccess(v1admin: SupabaseClient, role: string): Promise<boolean> {
  const { data: scope, error: scopeError } = await v1admin
    .from("permission_scopes")
    .select("key")
    .eq("key", "lioncafe")
    .eq("active", true)
    .maybeSingle();
  if (scopeError || !scope) return false;

  const { data: grant, error: grantError } = await v1admin
    .from("role_permissions")
    .select("scope_key")
    .eq("role", role)
    .eq("scope_key", "lioncafe")
    .eq("allowed", true)
    .maybeSingle();
  return !grantError && !!grant;
}
async function findAuthUserIdByEmail(v2admin: SupabaseClient, email: string): Promise<string | undefined> {
  for (let page = 1; page <= 20; page++) {
    const { data: list } = await v2admin.auth.admin.listUsers({ page, perPage: 100 });
    const found = list.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (list.users.length < 100) break;
  }
  return undefined;
}

export async function provisionLunchvoiceStaff(
  v2admin: SupabaseClient,
  identity: MjccStaffIdentity,
): Promise<{ token_hash: string; name: string }> {
  const { data: org, error: orgError } = await v2admin
    .from("orgs")
    .select("id")
    .ilike("slug", identity.tenant_slug)
    .maybeSingle();
  if (orgError || !org) throw new Error("Unknown Lunchvoice organization");

  const { data: existingProfile } = await v2admin
    .from("profiles")
    .select("id,email")
    .ilike("mjcc_username", identity.username)
    .maybeSingle();

  const loginEmail = String(existingProfile?.email || identity.email).trim().toLowerCase();
  if (!loginEmail || !loginEmail.includes("@")) throw new Error("MJCC profile email is invalid");

  let userId: string | undefined = existingProfile?.id;
  if (!userId) {
    const created = await v2admin.auth.admin.createUser({
      email: loginEmail,
      email_confirm: true,
      app_metadata: {
        staff: true,
        mjcc_user_id: identity.mjcc_user_id,
        mjcc_role: identity.mjcc_role,
      },
    });
    if (created.data.user) {
      userId = created.data.user.id;
    } else if (/already|registered|exists/i.test(created.error?.message ?? "")) {
      userId = await findAuthUserIdByEmail(v2admin, loginEmail);
    } else {
      throw new Error("Could not provision Lunchvoice staff account");
    }
  }
  if (!userId) throw new Error("Could not resolve Lunchvoice staff account");

  const { error: profileError } = await v2admin.from("profiles").upsert({
    id: userId,
    email: loginEmail,
    display_name: identity.display_name || identity.username,
    role: "admin",
    is_staff: true,
    mjcc_username: identity.username,
    org_id: org.id,
  });
  if (profileError) throw new Error("Could not update Lunchvoice staff profile");

  const { data: link, error: linkError } = await v2admin.auth.admin.generateLink({
    type: "magiclink",
    email: loginEmail,
  });
  if (linkError || !link.properties?.hashed_token) throw new Error("Could not create Lunchvoice session");

  return {
    token_hash: link.properties.hashed_token,
    name: identity.display_name || identity.username,
  };
}
