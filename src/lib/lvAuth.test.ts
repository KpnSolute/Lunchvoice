import { strict as assert } from "node:assert";
import { test } from "node:test";
import { acceptRecoveryCode, completeOwnCallback, emailProblem, setNewPassword, exchangeSession, friendlyError, passwordProblem, readOwnAuthConfig, sendPasswordReset, signInWithEmail, signUpWithEmail, startOAuth, addPassword, listMethods, removeMethod, startLink, OwnSignInError, type AuthClientLike, type OwnAuthConfig } from "./lvAuth.ts";

const config: OwnAuthConfig = { supabaseUrl: "https://ref.supabase.co", anonKey: "sb_publishable_x", sessionUrl: "https://ref.supabase.co/functions/v1/session", origin: "https://lunchvoice.com", email: true };

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } } as Storage;
}

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "ES256" })}.${b64(claims)}.sig`;
}

function fakeClient(overrides: Partial<AuthClientLike["auth"]> = {}) {
  const calls: { fn: string; args: unknown[] }[] = [];
  const rec = <T,>(fn: string, value: T) => async (...args: unknown[]) => { calls.push({ fn, args }); return value; };
  const client: AuthClientLike = {
    auth: {
      signInWithOAuth: rec("oauth", { data: { url: "https://ref.supabase.co/auth/v1/authorize?provider=x" }, error: null }) as never,
      signInWithPassword: rec("password", { data: {}, error: null }) as never,
      signUp: rec("signup", { data: { session: null }, error: null }) as never,
      resetPasswordForEmail: rec("reset", { data: {}, error: null }) as never,
      exchangeCodeForSession: rec("code", { data: {}, error: null }) as never,
      updateUser: rec("update", { data: {}, error: null }) as never,
      refreshSession: rec("refresh", { data: { session: { access_token: "access.token.value" } }, error: null }) as never,
      signOut: rec("signout", { error: null }) as never,
      getUserIdentities: rec("identities", { data: { identities: [
        { identity_id: "i2", id: "u", user_id: "u", provider: "discord", created_at: "2026-11-14T17:55:00Z" },
        { identity_id: "i1", id: "u", user_id: "u", provider: "google", created_at: "2026-11-14T10:00:00Z" },
      ] }, error: null }) as never,
      linkIdentity: rec("link", { data: { url: "https://ref.supabase.co/auth/v1/authorize?provider=discord" }, error: null }) as never,
      unlinkIdentity: rec("unlink", { data: {}, error: null }) as never,
      ...overrides,
    },
  };
  return { client, calls };
}

let lastBody: unknown = null;
const okFetch = (session: string) =>
  (async (_url: string, init?: { body?: string }) => {
    lastBody = JSON.parse(init?.body ?? "{}");
    return new Response(JSON.stringify({ ok: true, session, expiresIn: 3600 }), { status: 200 });
  }) as unknown as typeof fetch;

test("A7: own sign-in is off unless the build sets VITE_LV_AUTH=1 and the project settings exist", () => {
  const env = { VITE_SUPABASE_URL: "https://ref.supabase.co/", VITE_SUPABASE_PUBLISHABLE_KEY: "k" };
  assert.equal(readOwnAuthConfig(env, "https://lunchvoice.com"), null);
  assert.equal(readOwnAuthConfig({ ...env, VITE_LV_AUTH: "0" }, "https://lunchvoice.com"), null);
  assert.equal(readOwnAuthConfig({ VITE_LV_AUTH: "1" }, "https://lunchvoice.com"), null);
  const on = readOwnAuthConfig({ ...env, VITE_LV_AUTH: "1" }, "https://lunchvoice.com");
  assert.equal(on?.sessionUrl, "https://ref.supabase.co/functions/v1/session");
  assert.equal(on?.origin, "https://lunchvoice.com");
});

test("A7: beta mode is on only for a browser that opened /signin?own=1, and the email forms can be hidden", () => {
  const env = { VITE_LV_AUTH: "beta", VITE_SUPABASE_URL: "https://ref.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "k" };
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  assert.equal(readOwnAuthConfig(env, "https://lunchvoice.com", "", storage), null);
  assert.equal(readOwnAuthConfig(env, "https://lunchvoice.com", "?own=0", storage), null);
  assert.ok(readOwnAuthConfig(env, "https://lunchvoice.com", "?own=1", storage));
  assert.ok(readOwnAuthConfig(env, "https://lunchvoice.com", "", storage), "remembered for the next page load");
  assert.equal(readOwnAuthConfig(env, "https://lunchvoice.com", "?own=1", undefined), null, "no storage, no beta");
  assert.equal(readOwnAuthConfig({ ...env, VITE_LV_AUTH: "1" }, "https://lunchvoice.com")?.email, true);
  assert.equal(readOwnAuthConfig({ ...env, VITE_LV_AUTH: "1", VITE_LV_AUTH_EMAIL: "0" }, "https://lunchvoice.com")?.email, false);
});

test("A7: email and password hints", () => {
  assert.equal(emailProblem("pat@example.com"), null);
  assert.ok(emailProblem("pat@"));
  assert.ok(emailProblem("not an email"));
  assert.equal(passwordProblem("a-long-enough-pass"), null);
  assert.ok(passwordProblem("short"));
  assert.ok(passwordProblem("a".repeat(12)));
  assert.ok(passwordProblem("x".repeat(129)));
});

test("A7: error messages are neutral and never say whether an account exists", () => {
  assert.equal(friendlyError({ message: "Invalid login credentials" }), "Email or password is incorrect.");
  assert.equal(friendlyError({ code: "invalid_credentials" }), "Email or password is incorrect.");
  assert.match(friendlyError({ code: "email_not_confirmed" }), /Confirm your email/);
  assert.match(friendlyError({ status: 429 }), /Too many attempts/);
  assert.doesNotMatch(friendlyError({ message: "User not found" }), /not found|exist|registered/i);
  assert.equal(friendlyError(null, "fallback"), "fallback");
});

test("A7: Google and Discord start a PKCE redirect, remember only a safe return path, and ask Discord for identify and email", async () => {
  const { client, calls } = fakeClient();
  const storage = memoryStorage();
  const url = await startOAuth(client, config, "discord", "/surveys/new", storage);
  assert.match(url, /^https:\/\/ref\.supabase\.co\/auth\/v1\/authorize/);
  const args = calls[0]!.args[0] as { provider: string; options: { redirectTo: string; skipBrowserRedirect: boolean; scopes?: string } };
  assert.equal(args.provider, "discord");
  assert.equal(args.options.scopes, "identify email");
  assert.equal(args.options.redirectTo, "https://lunchvoice.com/auth/callback?own=1");
  assert.equal(args.options.skipBrowserRedirect, true);
  assert.deepEqual(JSON.parse(storage.getItem("lv.own.pending")!), { returnTo: "/surveys/new" });
  await startOAuth(client, config, "google", "//evil.example/steal", storage);
  assert.deepEqual(JSON.parse(storage.getItem("lv.own.pending")!), { returnTo: "/me" });
  assert.equal((calls[1]!.args[0] as { options: { scopes?: string } }).options.scopes, undefined);
});

test("A7: a provider that cannot start is a friendly error, not a stack trace", async () => {
  const { client } = fakeClient({ signInWithOAuth: async () => ({ data: null, error: { message: "provider is not enabled" } }) });
  await assert.rejects(startOAuth(client, config, "google", "/me", memoryStorage()), (e: unknown) => e instanceof OwnSignInError && /could not start/.test(e.message));
});

test("A7: email sign-in validates first and maps failures to the neutral message", async () => {
  const { client, calls } = fakeClient({ signInWithPassword: async () => ({ data: null, error: { message: "Invalid login credentials", status: 400 } }) });
  await assert.rejects(signInWithEmail(client, "nope", "x"), /valid email/);
  await assert.rejects(signInWithEmail(client, "pat@example.com", ""), /Enter your password/);
  await assert.rejects(signInWithEmail(client, " pat@example.com ", "wrong-password-1"), (e: unknown) => e instanceof OwnSignInError && e.message === "Email or password is incorrect.");
  assert.equal(calls.length, 0);
});

test("A7: sign-up enforces the password rule, trims the email and reports whether confirmation is needed", async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(signUpWithEmail(client, config, "pat@example.com", "short", "/me", memoryStorage()), /at least 12/);
  const result = await signUpWithEmail(client, config, " pat@example.com ", "a-long-enough-pass", "/me", memoryStorage());
  assert.equal(result.confirmationNeeded, true);
  const args = calls.find((c) => c.fn === "signup")!.args[0] as { email: string; options: { emailRedirectTo: string } };
  assert.equal(args.email, "pat@example.com");
  assert.equal(args.options.emailRedirectTo, "https://lunchvoice.com/auth/callback?own=1");
  const instant = fakeClient({ signUp: async () => ({ data: { session: { x: 1 } }, error: null }) });
  assert.equal((await signUpWithEmail(instant.client, config, "pat@example.com", "a-long-enough-pass", "/me", memoryStorage())).confirmationNeeded, false);
});

test("A7: a password reset never reveals whether the address has an account", async () => {
  const failing = fakeClient({ resetPasswordForEmail: async () => { throw new Error("User not found"); } });
  await sendPasswordReset(failing.client, config, "ghost@example.com");
  const { client, calls } = fakeClient();
  await sendPasswordReset(client, config, "pat@example.com");
  assert.equal((calls[0]!.args[1] as { redirectTo: string }).redirectTo, "https://lunchvoice.com/signin?reset=1");
  await assert.rejects(sendPasswordReset(client, config, "bad"), /valid email/);
});

test("A7: the reset link needs a code, trades it, and the new password follows the same rule as sign-up", async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(acceptRecoveryCode(client, "?reset=1"), /not valid/);
  await acceptRecoveryCode(client, "?reset=1&code=abc");
  assert.equal(calls.at(-1)!.fn, "code");
  const expired = fakeClient({ exchangeCodeForSession: async () => ({ data: null, error: { message: "expired" } }) });
  await assert.rejects(acceptRecoveryCode(expired.client, "?code=abc"), /expired/);
  await assert.rejects(setNewPassword(client, "short"), /at least 12/);
  await setNewPassword(client, "a-long-enough-pass");
  assert.equal(calls.at(-1)!.fn, "update");
  const failing = fakeClient({ updateUser: async () => ({ data: null, error: { message: "New password should be different from the old password." } }) });
  await assert.rejects(setNewPassword(failing.client, "a-long-enough-pass"), OwnSignInError);
});

test("A7: the exchange forces a fresh token, posts it with kind supabase and returns a session whose name is never an email", async () => {
  const { client, calls } = fakeClient();
  const s = await exchangeSession(client, config, okFetch(jwt({ sub: "user-1", name: "Pat", email: "pat@example.com" })));
  assert.equal(calls[0]!.fn, "refresh");
  assert.deepEqual(lastBody, { kind: "supabase", accessToken: "access.token.value" });
  assert.equal(s.name, "Pat");
  assert.equal(s.sub, "user-1");
  assert.ok(s.expiresAt > Date.now());
  assert.equal((await exchangeSession(client, config, okFetch(jwt({ sub: "user-1", name: "pat@example.com" })))).name, "You");
  assert.equal((await exchangeSession(client, config, okFetch(jwt({ sub: "user-1" })))).name, "You");
});

test("A7: a session without a subject is refused, so a renewal can always be matched to the same person", async () => {
  const { client } = fakeClient();
  await assert.rejects(exchangeSession(client, config, okFetch(jwt({ name: "Pat" }))), /could not start your session/);
});

test("A7: the exchange fails with a clear message when refresh fails or the server refuses", async () => {
  const broken = fakeClient({ refreshSession: async () => ({ data: { session: null }, error: { message: "refresh token not found" } }) });
  await assert.rejects(exchangeSession(broken.client, config, okFetch("x")), /could not be completed/);
  const { client } = fakeClient();
  const refused = (async () => new Response(JSON.stringify({ ok: false, error: { message: "This sign-in was already used. Start again." } }), { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(exchangeSession(client, config, refused), /already used/);
  const down = (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch;
  await assert.rejects(exchangeSession(client, config, down), /could not start your session/);
});

test("A7: the callback exchanges the code, then the session, and returns where the person was going", async () => {
  const { client, calls } = fakeClient();
  const storage = memoryStorage();
  storage.setItem("lv.own.pending", JSON.stringify({ returnTo: "/surveys" }));
  const done = await completeOwnCallback(client, config, "?own=1&code=abc123", storage, okFetch(jwt({ sub: "user-1", name: "Pat" })));
  assert.equal(done.returnTo, "/surveys");
  assert.equal(done.session.name, "Pat");
  assert.deepEqual(calls.map((c) => c.fn), ["code", "refresh"]);
  assert.equal(storage.getItem("lv.own.pending"), null);
});

test("A7: the callback refuses provider errors, a missing code, a bad code, and an unsafe stored return path", async () => {
  const { client } = fakeClient();
  await assert.rejects(completeOwnCallback(client, config, "?own=1&error=access_denied&error_description=No", memoryStorage()), /cancelled or refused/);
  await assert.rejects(completeOwnCallback(client, config, "?own=1", memoryStorage()), /could not be verified/);
  const badCode = fakeClient({ exchangeCodeForSession: async () => ({ data: null, error: { message: "invalid grant" } }) });
  await assert.rejects(completeOwnCallback(badCode.client, config, "?own=1&code=x", memoryStorage()), /expired/);
  const storage = memoryStorage();
  storage.setItem("lv.own.pending", JSON.stringify({ returnTo: "//evil.example" }));
  const done = await completeOwnCallback(client, config, "?own=1&code=ok", storage, okFetch(jwt({ sub: "user-1", name: "Pat" })));
  assert.equal(done.returnTo, "/me");
  const corrupt = memoryStorage();
  corrupt.setItem("lv.own.pending", "{not json");
  assert.equal((await completeOwnCallback(client, config, "?own=1&code=ok", corrupt, okFetch(jwt({ sub: "user-1" })))).returnTo, "/me");
});

test("A8: lists methods oldest first, adds one through linkIdentity, and never removes the last", async () => {
  const { client, calls } = fakeClient();
  const { methods, total } = await listMethods(client);
  assert.deepEqual(methods.map((m) => m.provider), ["google", "discord"]);
  assert.equal(total, 2);
  const url = await startLink(client, config, "discord", "/settings", memoryStorage());
  assert.match(url, /provider=discord/);
  assert.equal(calls.some((c) => c.fn === "link"), true);
  await removeMethod(client, methods[1]!, total);
  assert.equal(calls.some((c) => c.fn === "unlink"), true);
  await assert.rejects(() => removeMethod(client, methods[0]!, 1), OwnSignInError);
  assert.equal(calls.filter((c) => c.fn === "unlink").length, 1);
});

test("A8: a short password is refused before any call, a good one is saved", async () => {
  const { client, calls } = fakeClient();
  await assert.rejects(() => addPassword(client, "short"), OwnSignInError);
  assert.equal(calls.some((c) => c.fn === "update"), false);
  await addPassword(client, "a-long-enough-pass-1");
  assert.equal(calls.some((c) => c.fn === "update"), true);
});
