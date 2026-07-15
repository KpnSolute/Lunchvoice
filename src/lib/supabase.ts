import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/db";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in."
  );
}

// Sessions persist in localStorage and auto-refresh, so a student verifies an
// OTP code once per device — they are only asked again after logging out.
export const supabase = createClient<Database>(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export type LoginStartKind = "staff" | "student_returning" | "student_new";
export const MJCC_STAFF_SSO_URL = "https://mjcc.kpncompute.com/?launch=lioncafe";

export async function beginLogin(identifier: string, orgSlug: string): Promise<LoginStartKind> {
  const res = await fetch(`${url}/functions/v1/login-start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ identifier, org: orgSlug }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Login check failed");
  return body.kind;
}

export type StaffAccessStatus = "valid" | "revoked" | "unavailable";

export async function verifyStaffAccess(): Promise<StaffAccessStatus> {
  try {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) return "unavailable";
    const res = await fetch(`${url}/functions/v1/staff-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 403 || (res.ok && body.staff === false)) return "revoked";
    if (!res.ok) return "unavailable";
    return "valid";
  } catch (error) {
    console.warn("staff_status_unavailable", error);
    return "unavailable";
  }
}

export async function staffSso(code: string, orgSlug: string): Promise<void> {
  const res = await fetch(`${url}/functions/v1/staff-sso`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ code, org: orgSlug }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "MJCC sign-in failed");
  const { error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: body.token_hash,
  });
  if (error) throw error;
}
