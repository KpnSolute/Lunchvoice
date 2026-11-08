// Browser half of KpnIdentity sign-in (IDENTITY_CONTRACT.md §3): OAuth 2.1
// authorization code + PKCE (S256) against KpnIdentity, then the `session`
// Edge Function turns the verified ID token into a LunchVoice session.
// Only the code verifier, state and nonce touch sessionStorage, and only
// for the length of one redirect. No token is ever put in a URL.

export interface KpnIdentityConfig {
  issuer: string;
  clientId: string;
  authorizeUrl: string;
  tokenUrl: string;
  sessionUrl: string;
  anonKey: string;
  redirectUri: string;
}

export interface PendingSignIn {
  verifier: string;
  state: string;
  nonce: string;
  returnTo: string;
}

export interface SignedInSession {
  token: string;
  name: string;
  expiresAt: number;
}

const PENDING = "lv.signin.pending";

export function readConfig(env: Record<string, string | undefined>, origin: string): KpnIdentityConfig | null {
  const issuer = env.VITE_KPNIDENTITY_ISSUER?.replace(/\/+$/, "");
  const clientId = env.VITE_KPNIDENTITY_CLIENT_ID;
  const supabaseUrl = env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!issuer || !clientId || !supabaseUrl || !anonKey) return null;
  return {
    issuer,
    clientId,
    // Supabase's OAuth 2.1 server lives under the issuer (…/auth/v1/oauth/*).
    authorizeUrl: env.VITE_KPNIDENTITY_AUTHORIZE_URL ?? `${issuer}/oauth/authorize`,
    tokenUrl: env.VITE_KPNIDENTITY_TOKEN_URL ?? `${issuer}/oauth/token`,
    sessionUrl: `${supabaseUrl}/functions/v1/session`,
    anonKey,
    redirectUri: `${origin}/auth/callback`,
  };
}

export function randomString(bytes = 32): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return base64Url(data);
}

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function base64Url(data: Uint8Array): string {
  let text = "";
  for (const byte of data) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Only same-site app paths may be returned to after sign-in (LC-14). react-router 6.x has no fix for the backslash
 * open redirect (GHSA-wrjc-x8rr-h8h6; fixed only in 7.18), so every navigation target from storage or history state
 * passes through here. Refused: absolute URLs, protocol-relative `//`, any backslash, control or whitespace
 * characters, percent-encoded slashes, backslashes or controls, and `.`/`..` segments. Allowed: `/segment/...`
 * with URL-safe characters, an optional query and fragment.
 */
const SAFE_PATH = /^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@-]+(?:\/[A-Za-z0-9._~!$&'()*+,;=:@-]+)*\/?)?(?:\?[A-Za-z0-9._~!$&'()*+,;=:@/?%-]*)?(?:#[A-Za-z0-9._~!$&'()*+,;=:@/?%-]*)?$/;
export function safeReturnTo(path: string | undefined | null): string {
  if (typeof path !== "string" || path.length === 0 || path.length > 2048) return "/me";
  if (path.startsWith("//") || /[\\\u0000-\u001f\u007f\s]/.test(path)) return "/me";
  if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(path)) return "/me";
  const pathname = path.split(/[?#]/, 1)[0]!;
  if (pathname.split("/").some((seg) => seg === "." || seg === "..")) return "/me";
  return SAFE_PATH.test(path) ? path : "/me";
}

export async function authorizeUrl(config: KpnIdentityConfig, pending: PendingSignIn): Promise<string> {
  const url = new URL(config.authorizeUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "openid email profile",
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: await codeChallenge(pending.verifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export async function startSignIn(config: KpnIdentityConfig, returnTo: string, storage: Storage = sessionStorage): Promise<string> {
  const pending: PendingSignIn = { verifier: randomString(48), state: randomString(), nonce: randomString(), returnTo: safeReturnTo(returnTo) };
  storage.setItem(PENDING, JSON.stringify(pending));
  return authorizeUrl(config, pending);
}

export class SignInError extends Error {}

/** Finish the redirect: check state, exchange the code (PKCE), then exchange the ID token for a LunchVoice session. */
export async function completeSignIn(
  config: KpnIdentityConfig,
  search: string,
  storage: Storage = sessionStorage,
  fetcher: typeof fetch = fetch,
): Promise<{ session: SignedInSession; returnTo: string }> {
  const params = new URLSearchParams(search);
  const raw = storage.getItem(PENDING);
  storage.removeItem(PENDING);
  if (params.get("error")) throw new SignInError(params.get("error_description") ?? "Sign-in was cancelled.");
  if (!raw) throw new SignInError("This sign-in has expired. Start again.");
  const pending = JSON.parse(raw) as PendingSignIn;
  const code = params.get("code");
  if (!code || params.get("state") !== pending.state) throw new SignInError("This sign-in could not be verified. Start again.");

  const tokenResponse = await fetcher(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri, client_id: config.clientId, code_verifier: pending.verifier }),
  });
  const tokens = (await tokenResponse.json().catch(() => ({}))) as { id_token?: string };
  if (!tokenResponse.ok || !tokens.id_token) throw new SignInError("KpnIdentity did not complete the sign-in.");

  const sessionResponse = await fetcher(config.sessionUrl, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: config.anonKey, authorization: `Bearer ${config.anonKey}` },
    body: JSON.stringify({ idToken: tokens.id_token, nonce: pending.nonce }),
  });
  const body = (await sessionResponse.json().catch(() => ({}))) as { ok?: boolean; session?: string; expiresIn?: number; error?: { message?: string } };
  if (!sessionResponse.ok || !body.ok || !body.session) throw new SignInError(body.error?.message ?? "LunchVoice could not start your session.");

  const claims = JSON.parse(atob(body.session.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { name?: string; email?: string };
  return {
    session: { token: body.session, name: claims.name ?? claims.email?.split("@")[0] ?? "You", expiresAt: Date.now() + (body.expiresIn ?? 3600) * 1000 },
    // Storage can be tampered with between the redirect and the callback: check again.
    returnTo: safeReturnTo(pending.returnTo),
  };
}
