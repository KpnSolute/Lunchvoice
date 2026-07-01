import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/db";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in."
  );
}

export const supabase = createClient<Database>(url, key);

// Staff (MJCCv1 sudo) sign in via an edge function that verifies their MJCCv1 credentials
// server-side, then returns a MJCCv2 admin session which we install on this client.
export async function staffLogin(email: string, password: string): Promise<void> {
  const res = await fetch(`${url}/functions/v1/staff-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Staff login failed");
  const { error } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  if (error) throw error;
}
