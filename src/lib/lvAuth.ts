// LunchVoice's own sign-in (ADR_LUNCHVOICE_OWN_SIGN_IN, spec A6 and A7): Supabase Auth in the Lunchvoice project with
// Google, Discord and email. Off unless the build sets VITE_LV_AUTH=1, so nothing changes until the founder switches it on.
//
// Flow: the browser signs in with Supabase Auth (PKCE for Google and Discord), forces a fresh access token, and posts it
// to the `session` Edge Function with { kind: "supabase" }. The function verifies it with the issuer and returns the
// LunchVoice session, exactly as for KpnIdentity. No password, provider token or email is stored by LunchVoice code.
import { safeReturnTo } from "./kpnIdentity";

export type OwnProvider = "google" | "discord";

export interface OwnAuthConfig {
  supabaseUrl: string;
  anonKey: string;
  sessionUrl: string;
  /** Origin used to build redirect URLs (https://lunchvoice.com, https://create.lunchvoice.com, ...). */
  origin: string;
}

export interface OwnSession {
  token: string;
  name: string;
  expiresAt: number;
  /** The LunchVoice session's subject (the Auth user id). A renewal must return the same one. */
  sub: string;
}

/** The slice of the supabase-js auth client this module uses. Tests pass a fake. */
export interface AuthClientLike {
  auth: {
    signInWithOAuth(args: { provider: OwnProvider; options: { redirectTo: string; skipBrowserRedirect: boolean; scopes?: string } }): Promise<{ data: { url?: string | null } | null; error: AuthErrorLike | null }>;
    signInWithPassword(args: { email: string; password: string }): Promise<{ data: unknown; error: AuthErrorLike | null }>;
    signUp(args: { email: string; password: string; options: { emailRedirectTo: string } }): Promise<{ data: { session?: unknown } | null; error: AuthErrorLike | null }>;
    resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{ data: unknown; error: AuthErrorLike | null }>;
    exchangeCodeForSession(code: string): Promise<{ data: unknown; error: AuthErrorLike | null }>;
    updateUser(attributes: { password: string }): Promise<{ data: unknown; error: AuthErrorLike | null }>;
    refreshSession(): Promise<{ data: { session: { access_token: string } | null } | null; error: AuthErrorLike | null }>;
    /** Always called with scope "local": ending this device's session must never sign the person out elsewhere. */
    signOut(options?: { scope: "local" | "global" | "others" }): Promise<{ error: AuthErrorLike | null }>;
  };
}

export interface AuthErrorLike {
  message?: string;
  status?: number;
  code?: string;
}

export class OwnSignInError extends Error {}

const PENDING = "lv.own.pending";
/** Matches the Auth project setting (spec A6, ADR section 4): at least 12 characters. */
export const MIN_PASSWORD = 12;

/** Null unless the build enables it (VITE_LV_AUTH=1) and the public project settings exist. */
export function readOwnAuthConfig(env: Record<string, string | undefined>, origin: string): OwnAuthConfig | null {
  if (env.VITE_LV_AUTH !== "1") return null;
  const supabaseUrl = env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
  const anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;
  return { supabaseUrl, anonKey, sessionUrl: `${supabaseUrl}/functions/v1/session`, origin };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailProblem(email: string): string | null {
  return EMAIL.test(email.trim()) && email.length <= 254 ? null : "Enter a valid email address.";
}

/** Client-side hints only; the project's own password policy is the authority. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > 128) return "Use at most 128 characters.";
  if (/^(.)\1+$/.test(password)) return "Choose a password that is not one repeated character.";
  return null;
}

/** Neutral messages: never say whether an account exists (spec A6). */
export function friendlyError(error: AuthErrorLike | null | undefined, fallback = "Sign-in did not work. Try again."): string {
  if (!error) return fallback;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (error.status === 429 || text.includes("rate limit") || text.includes("over_")) return "Too many attempts. Wait a minute and try again.";
  if (text.includes("email_not_confirmed") || text.includes("not confirmed")) return "Confirm your email first. Check your inbox for the link.";
  if (text.includes("invalid login") || text.includes("invalid_credentials") || text.includes("invalid credentials")) return "Email or password is incorrect.";
  if (text.includes("weak_password") || text.includes("password")) return "That password is not allowed. Use a longer one that you have not used elsewhere.";
  if (text.includes("captcha")) return "We could not check that you are a person. Reload and try again.";
  return fallback;
}

function redirectUrl(config: OwnAuthConfig): string {
  return `${config.origin}/auth/callback?own=1`;
}

function remember(returnTo: string, storage: Storage) {
  storage.setItem(PENDING, JSON.stringify({ returnTo: safeReturnTo(returnTo) }));
}

/** Start a Google or Discord sign-in: returns the provider URL to navigate to. */
export async function startOAuth(client: AuthClientLike, config: OwnAuthConfig, provider: OwnProvider, returnTo: string, storage: Storage = sessionStorage): Promise<string> {
  remember(returnTo, storage);
  const { data, error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: redirectUrl(config), skipBrowserRedirect: true, scopes: provider === "discord" ? "identify email" : undefined },
  });
  if (error || !data?.url) throw new OwnSignInError(friendlyError(error, "That sign-in could not start. Try again."));
  return data.url;
}

/** Email and password. Resolves when the browser holds a Supabase session; call exchangeSession next. */
export async function signInWithEmail(client: AuthClientLike, email: string, password: string): Promise<void> {
  const bad = emailProblem(email);
  if (bad) throw new OwnSignInError(bad);
  if (!password) throw new OwnSignInError("Enter your password.");
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new OwnSignInError(friendlyError(error, "Email or password is incorrect."));
}

/** Create an account. `confirmationNeeded` is true when the project requires the email to be confirmed first. */
export async function signUpWithEmail(client: AuthClientLike, config: OwnAuthConfig, email: string, password: string, returnTo = "/me", storage: Storage = sessionStorage): Promise<{ confirmationNeeded: boolean }> {
  const badEmail = emailProblem(email);
  if (badEmail) throw new OwnSignInError(badEmail);
  const badPassword = passwordProblem(password);
  if (badPassword) throw new OwnSignInError(badPassword);
  remember(returnTo, storage);
  const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectUrl(config) } });
  if (error) throw new OwnSignInError(friendlyError(error, "We could not create that account. Try again."));
  return { confirmationNeeded: !data?.session };
}

/** Always resolves the same way, so the result never reveals whether an address has an account. */
export async function sendPasswordReset(client: AuthClientLike, config: OwnAuthConfig, email: string): Promise<void> {
  const bad = emailProblem(email);
  if (bad) throw new OwnSignInError(bad);
  await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${config.origin}/signin?reset=1` }).catch(() => undefined);
}

/** The password-reset email link returns to /signin?reset=1&code=...: trade the code for a short recovery session. */
export async function acceptRecoveryCode(client: AuthClientLike, search: string): Promise<void> {
  const code = new URLSearchParams(search).get("code");
  if (!code) throw new OwnSignInError("This reset link is not valid. Ask for a new one.");
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw new OwnSignInError("This reset link has expired. Ask for a new one.");
}

/** Set the new password during recovery (the recovery session from acceptRecoveryCode must be active). */
export async function setNewPassword(client: AuthClientLike, password: string): Promise<void> {
  const bad = passwordProblem(password);
  if (bad) throw new OwnSignInError(bad);
  const { error } = await client.auth.updateUser({ password });
  if (error) throw new OwnSignInError(friendlyError(error, "We could not change the password. Ask for a new reset link."));
}

function claimsOf(token: string): { name?: string; email?: string; sub?: string } {
  try {
    return JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { name?: string; email?: string; sub?: string };
  } catch {
    return {};
  }
}

/** Force a fresh access token (the server only accepts a young, unused one) and exchange it for a LunchVoice session. */
export async function exchangeSession(client: AuthClientLike, config: OwnAuthConfig, fetcher: typeof fetch = fetch): Promise<OwnSession> {
  const { data, error } = await client.auth.refreshSession();
  const accessToken = data?.session?.access_token;
  if (error || !accessToken) throw new OwnSignInError("Your sign-in could not be completed. Start again.");
  const res = await fetcher(config.sessionUrl, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: config.anonKey },
    body: JSON.stringify({ kind: "supabase", accessToken }),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; session?: string; expiresIn?: number; error?: { message?: string } };
  if (!res.ok || !body.ok || !body.session) throw new OwnSignInError(body.error?.message ?? "LunchVoice could not start your session.");
  const claims = claimsOf(body.session);
  // The name never falls back to an email (audit HB1): a missing name shows as "You".
  const named = claims.name && !claims.name.includes("@") ? claims.name : "You";
  if (!claims.sub) throw new OwnSignInError("LunchVoice could not start your session.");
  return { token: body.session, name: named, expiresAt: Date.now() + (body.expiresIn ?? 3600) * 1000, sub: claims.sub };
}

/** /auth/callback?own=1&code=...: finish a Google or Discord sign-in, or an email confirmation link. */
export async function completeOwnCallback(client: AuthClientLike, config: OwnAuthConfig, search: string, storage: Storage = sessionStorage, fetcher: typeof fetch = fetch): Promise<{ session: OwnSession; returnTo: string }> {
  const params = new URLSearchParams(search);
  const raw = storage.getItem(PENDING);
  storage.removeItem(PENDING);
  if (params.get("error") || params.get("error_description")) throw new OwnSignInError("Sign-in was cancelled or refused. Try again.");
  const code = params.get("code");
  if (!code) throw new OwnSignInError("This sign-in could not be verified. Start again.");
  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw new OwnSignInError("This sign-in has expired. Start again.");
  const session = await exchangeSession(client, config, fetcher);
  let returnTo = "/me";
  try {
    returnTo = safeReturnTo((JSON.parse(raw ?? "{}") as { returnTo?: string }).returnTo);
  } catch {
    /* corrupt pending record: go to the default */
  }
  return { session, returnTo };
}
