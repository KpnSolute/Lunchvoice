import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { authorizeUrl, codeChallenge, completeSignIn, readConfig, safeReturnTo, SignInError, startSignIn } from "./kpnIdentity";

class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

const env = { VITE_KPNIDENTITY_ISSUER: "https://idp.example.supabase.co/auth/v1/", VITE_KPNIDENTITY_CLIENT_ID: "lv-web", VITE_SUPABASE_URL: "https://lv.example.supabase.co", VITE_SUPABASE_ANON_KEY: "anon" };
const config = readConfig(env, "https://lunchvoice.com")!;

test("config fails closed when anything is missing", () => {
  assert.equal(readConfig({ ...env, VITE_KPNIDENTITY_CLIENT_ID: undefined }, "https://lunchvoice.com"), null);
  assert.equal(config.authorizeUrl, "https://idp.example.supabase.co/auth/v1/oauth/authorize");
  assert.equal(config.redirectUri, "https://lunchvoice.com/auth/callback");
});

test("PKCE S256 challenge is base64url(SHA-256(verifier)) with no padding", async () => {
  const verifier = "dBjftJeZ4CVP-mJ92K1PRFzv1sKxUTeD7Xyug0uN6c0";
  const expected = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(await codeChallenge(verifier), expected);
  assert.doesNotMatch(expected, /[=+/]/);
});

test("the authorize URL carries PKCE, state, nonce and openid scope, never a secret", async () => {
  const url = new URL(await authorizeUrl(config, { verifier: "v".repeat(48), state: "s".repeat(32), nonce: "n".repeat(32), returnTo: "/me" }));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("nonce"), "n".repeat(32));
  assert.equal(url.searchParams.get("code_verifier"), null);
});

test("only same-site return paths are honoured", () => {
  assert.equal(safeReturnTo("//evil.example"), "/me");
  assert.equal(safeReturnTo("https://evil.example"), "/me");
  assert.equal(safeReturnTo("/create"), "/create");
});

test("a callback with the wrong state is refused and the pending sign-in is cleared", async () => {
  const storage = new MemoryStorage();
  await startSignIn(config, "/create", storage);
  await assert.rejects(completeSignIn(config, "?code=abc&state=wrong", storage, (() => { throw new Error("no network"); }) as never), SignInError);
  assert.equal(storage.getItem("lv.signin.pending"), null);
});

test("a good callback exchanges the code with the verifier, then the ID token with the nonce", async () => {
  const storage = new MemoryStorage();
  const url = new URL(await startSignIn(config, "/create", storage));
  const state = url.searchParams.get("state")!;
  const payload = btoa(JSON.stringify({ name: "Pat" })).replace(/=+$/, "");
  const calls: { url: string; body: string }[] = [];
  const fetcher = (async (input: string, init: RequestInit) => {
    calls.push({ url: input, body: String(init.body) });
    if (input === config.tokenUrl) return new Response(JSON.stringify({ id_token: "id.token.sig" }), { status: 200 });
    return new Response(JSON.stringify({ ok: true, session: `h.${payload}.s`, expiresIn: 3600 }), { status: 200 });
  }) as never;
  const result = await completeSignIn(config, `?code=abc&state=${state}`, storage, fetcher);
  assert.equal(result.returnTo, "/create");
  assert.equal(result.session.name, "Pat");
  assert.match(calls[0]!.body, /code_verifier=/);
  assert.equal(JSON.parse(calls[1]!.body).nonce, url.searchParams.get("nonce"));
});
