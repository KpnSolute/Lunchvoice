// Supabase API keys, old and new. The legacy JWT keys (SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) are being retired
// (Supabase: deprecated by the end of 2026, valid until disabled in Settings > API Keys). Their replacements are
// publishable keys (sb_publishable_...) and secret keys (sb_secret_...). These helpers accept both, so the functions
// keep working through the switch and after the legacy keys are disabled.
//
// Rules (Supabase API keys guide): keys travel in the `apikey` header, never as `Authorization: Bearer`; a key is
// never proof of who the caller is.

type Env = (name: string) => string | undefined;

/** Values of a JSON dictionary env var such as SUPABASE_SECRET_KEYS ({ "default": "sb_secret_..." }). */
function dictValues(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) return Object.values(v as Record<string, unknown>).filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch { /* not JSON: ignore */ }
  return [];
}

/**
 * The key a function sends as `apikey` when it calls the Data API on a user's behalf. In order: LV_PUBLISHABLE_KEY (a
 * secret the founder sets; custom secrets may not start with SUPABASE_), the runtime's SUPABASE_PUBLISHABLE_KEYS if the
 * platform provides it, then the legacy SUPABASE_ANON_KEY.
 */
export function publishableKey(env: Env): string | undefined {
  return env("LV_PUBLISHABLE_KEY") || dictValues(env("SUPABASE_PUBLISHABLE_KEYS"))[0] || env("SUPABASE_ANON_KEY") || undefined;
}

/** Every service-level secret the runtime knows: new secret keys plus the legacy service-role key. */
export function serviceSecrets(env: Env): string[] {
  return [...dictValues(env("SUPABASE_SECRET_KEYS")), env("SUPABASE_SERVICE_ROLE_KEY") ?? ""].filter(Boolean);
}

/** True for any Supabase API key (new format or one of ours): such a value never identifies a signed-in person. */
export function isApiKey(token: string, env: Env): boolean {
  if (/^sb_(publishable|secret)_/.test(token)) return true;
  const known = [env("LV_PUBLISHABLE_KEY"), env("SUPABASE_ANON_KEY"), ...dictValues(env("SUPABASE_PUBLISHABLE_KEYS"))].filter(Boolean);
  return known.includes(token);
}
