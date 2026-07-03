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

// Staff (MJCCv1 sudo) sign in via an edge function that verifies their MJCCv1 credentials
// server-side, then returns a MJCCv2 admin session which we install on this client.
export async function staffLogin(email: string, password: string, orgSlug: string): Promise<void> {
  const res = await fetch(`${url}/functions/v1/staff-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ email, password, org: orgSlug }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Staff login failed");
  const { error } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (error) throw error;
}

export async function verifyStaffAccess(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return false;
  const res = await fetch(`${url}/functions/v1/staff-status`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${token}` },
  });
  if (res.status === 403 || res.status === 401) return false;
  if (!res.ok) return false;
  const body = await res.json();
  return body.staff !== false;
}
