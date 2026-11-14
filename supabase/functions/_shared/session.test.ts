import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createLocalJWKSet, decodeJwt, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { configFromEnv, issueSession, memoryReplayGuard, ownAuthFromEnv, replayKey, SessionError, verifyIdToken, verifyLunchVoiceSession, verifySupabaseToken, type JsonWebKeyWithKid, type ReplayGuard, type SessionConfig } from "./session.ts";

const ISSUER = "https://kpnidentity.example.supabase.co/auth/v1";
const CLIENT = "lunchvoice-web";
const NONCE = "nonce-that-is-long-enough-123";

async function setup() {
  const idp = await generateKeyPair("ES256");
  const idpPublic = { ...(await exportJWK(idp.publicKey)), kid: "idp-1", alg: "ES256" } as JWK;
  const lv = await generateKeyPair("ES256", { extractable: true });
  const sessionKey = { ...(await exportJWK(lv.privateKey)), kid: "lv-1" } as JsonWebKeyWithKid;
  const config: SessionConfig = { issuers: [ISSUER], clientId: CLIENT, jwks: createLocalJWKSet({ keys: [idpPublic] }), sessionKey };
  const sign = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: number; sub?: string; iat?: number | null } = {}) => {
    const jwt = new SignJWT({ nonce: NONCE, email: "pat@example.com", email_verified: true, name: "Pat", ...claims })
      .setProtectedHeader({ alg: "ES256", kid: "idp-1" })
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? CLIENT)
      .setSubject(opts.sub ?? randomUUID())
      .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 300);
    if (opts.iat !== null) jwt.setIssuedAt(opts.iat);
    return jwt.sign(idp.privateKey);
  };
  return { config, sign };
}

async function rejects(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: unknown) => error instanceof SessionError && error.code === code);
}

test("a valid KpnIdentity ID token becomes a LunchVoice session with the same (issuer, subject)", async () => {
  const { config, sign } = await setup();
  const sub = randomUUID().toUpperCase();
  const identity = await verifyIdToken(await sign({}, { sub }), NONCE, config);
  const { token, expiresIn } = await issueSession(identity, config);
  const claims = decodeJwt(token);
  assert.equal(claims.iss, ISSUER);
  assert.equal(claims.sub, sub.toLowerCase());
  assert.equal(claims.role, "authenticated");
  assert.equal(claims.aud, "authenticated");
  assert.equal(claims.email_verified, true);
  assert.equal(claims.session_kind, "lunchvoice");
  assert.ok(expiresIn <= 3600);
});

test("rejects tokens from an issuer that is not allow-listed", async () => {
  const { config, sign } = await setup();
  await rejects(verifyIdToken(await sign({}, { iss: "https://evil.example.com" }), NONCE, config), "lv_invalid_token");
});

test("rejects tokens minted for another application", async () => {
  const { config, sign } = await setup();
  await rejects(verifyIdToken(await sign({}, { aud: "someone-else" }), NONCE, config), "lv_invalid_token");
});

test("rejects expired tokens and a nonce from another browser", async () => {
  const { config, sign } = await setup();
  await rejects(verifyIdToken(await sign({}, { exp: Math.floor(Date.now() / 1000) - 120 }), NONCE, config), "lv_invalid_token");
  await rejects(verifyIdToken(await sign({}), "a-different-nonce-1234567", config), "lv_invalid_token");
});

test("rejects a non-UUID subject instead of coercing it", async () => {
  const { config, sign } = await setup();
  await rejects(verifyIdToken(await sign({}, { sub: "google|1234567890" }), NONCE, config), "lv_invalid_token");
});

test("rejects a token signed by an unknown key (no HS256, no forged keys)", async () => {
  const { config } = await setup();
  const other = await generateKeyPair("ES256");
  const forged = await new SignJWT({ nonce: NONCE }).setProtectedHeader({ alg: "ES256", kid: "idp-1" }).setIssuer(ISSUER)
    .setAudience(CLIENT).setSubject(randomUUID()).setIssuedAt().setExpirationTime("5m").sign(other.privateKey);
  await rejects(verifyIdToken(forged, NONCE, config), "lv_invalid_token");
});

test("an unverified email stays unverified in the session", async () => {
  const { config, sign } = await setup();
  const { token } = await issueSession(await verifyIdToken(await sign({ email_verified: false }), NONCE, config), config);
  assert.equal(decodeJwt(token).email_verified, false);
});

test("fails closed when the server is not configured", () => {
  assert.throws(() => configFromEnv(() => undefined), (e: unknown) => e instanceof SessionError && e.code === "lv_not_configured");
  const env: Record<string, string> = { KPNIDENTITY_ISSUERS: ISSUER, KPNIDENTITY_CLIENT_ID: CLIENT, KPNIDENTITY_JWKS_URL: "http://insecure.example/jwks", LV_SESSION_PRIVATE_JWK: "{}" };
  assert.throws(() => configFromEnv((n) => env[n]), (e: unknown) => e instanceof SessionError && e.code === "lv_not_configured");
});

/* ---- track A: hardening (LC-13 replay protection) ---- */

test("LC-13: the same ID token cannot be exchanged twice", async () => {
  const { config, sign } = await setup();
  const token = await sign({});
  await verifyIdToken(token, NONCE, config);
  await rejects(verifyIdToken(token, NONCE, config), "lv_invalid_token");
});

test("LC-13: an ID token issued more than the maximum age ago is refused", async () => {
  const { config, sign } = await setup();
  const old = Math.floor(Date.now() / 1000) - 3600;
  await rejects(verifyIdToken(await sign({}, { iat: old, exp: old + 7200 }), NONCE, { ...config, maxTokenAgeSeconds: 600 }), "lv_invalid_token");
  // A token issued a minute ago is still fine.
  await verifyIdToken(await sign({}, { iat: Math.floor(Date.now() / 1000) - 60 }), NONCE, config);
});

test("LC-13: backward compatible: a token without iat still signs in once", async () => {
  const { config, sign } = await setup();
  const token = await sign({}, { iat: null });
  const identity = await verifyIdToken(token, NONCE, { ...config, replayGuard: memoryReplayGuard() });
  assert.equal(typeof identity.sub, "string");
});

test("LC-13: the replay key is a sha256 of issuer, subject and jti or nonce, never the token", async () => {
  const a = await replayKey({ iss: ISSUER, sub: "s", nonce: "n1" });
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, await replayKey({ iss: ISSUER, sub: "s", nonce: "n2" }));
  assert.notEqual(a, await replayKey({ iss: ISSUER, sub: "s", nonce: "n1", jti: "j" }));
});

test("LC-13: the configured store decides, and a store failure fails closed", async () => {
  const { config, sign } = await setup();
  const keys: string[] = [];
  const recording: ReplayGuard = { async consume(k) { keys.push(k); return keys.filter((x) => x === k).length === 1; } };
  const token = await sign({});
  await verifyIdToken(token, NONCE, { ...config, replayGuard: recording });
  await rejects(verifyIdToken(token, NONCE, { ...config, replayGuard: recording }), "lv_invalid_token");
  assert.equal(keys.length, 2);
  const broken: ReplayGuard = { async consume() { throw new Error("db down"); } };
  await assert.rejects(verifyIdToken(await sign({}), NONCE, { ...config, replayGuard: broken }), /db down/);
});

test("LC-12: the issued session carries exactly the claims the database requires", async () => {
  const { config, sign } = await setup();
  const claims = decodeJwt((await issueSession(await verifyIdToken(await sign({}), NONCE, config), config)).token);
  assert.equal(claims.aud, "authenticated");
  assert.equal(claims.session_kind, "lunchvoice");
  assert.equal(claims.role, "authenticated");
  assert.equal(typeof claims.iat, "number");
});

/* ---- A7: LunchVoice's own sign-in (Supabase Auth access tokens verified by the issuer) ---- */

const OWN = "https://lunchvoice-own.example.supabase.co/auth/v1";

async function ownSetup(userOverrides: Record<string, unknown> | "down" | "throw" = {}) {
  const { config } = await setup();
  const calls: { url: string; auth: string | null; apikey: string | null }[] = [];
  const mint = async (claims: Record<string, unknown> = {}, opts: { sub?: string; iat?: number; exp?: number; iss?: string; aud?: string } = {}) => {
    const sub = opts.sub ?? randomUUID();
    const now = Math.floor(Date.now() / 1000);
    // The function only decodes this to pre-check shape; the issuer's /user answer is the decision.
    const key = await generateKeyPair("ES256");
    const token = await new SignJWT({ session_id: randomUUID(), role: "authenticated", ...claims })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuer(opts.iss ?? OWN).setAudience(opts.aud ?? "authenticated").setSubject(sub)
      .setIssuedAt(opts.iat ?? now).setExpirationTime(opts.exp ?? now + 3600).sign(key.privateKey);
    return { token, sub };
  };
  const fakeFetch = (async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, auth: init?.headers?.authorization ?? null, apikey: init?.headers?.apikey ?? null });
    if (userOverrides === "throw") throw new Error("network");
    if (userOverrides === "down") return new Response("nope", { status: 503 });
    const sub = (calls.at(-1)!.auth ?? "").slice(7);
    const decoded = decodeJwt(sub);
    return new Response(JSON.stringify({ id: decoded.sub, email: "pat@example.com", email_confirmed_at: "2026-11-14T00:00:00Z", user_metadata: { full_name: "Pat", avatar_url: "https://img.example/p.png" }, ...userOverrides }), { status: 200 });
  }) as unknown as typeof fetch;
  const own = { issuer: OWN, userUrl: `${OWN}/user`, apikey: "sb_publishable_test", fetch: fakeFetch };
  return { config: { ...config, ownAuth: own, replayGuard: memoryReplayGuard() } as SessionConfig, mint, calls };
}

test("A7: a valid access token from LunchVoice's own Auth becomes a LunchVoice session with that (issuer, subject)", async () => {
  const { config, mint, calls } = await ownSetup();
  const { token, sub } = await mint();
  const identity = await verifySupabaseToken(token, config);
  const claims = decodeJwt((await issueSession(identity, config)).token);
  assert.equal(claims.iss, OWN);
  assert.equal(claims.sub, sub);
  assert.equal(claims.email_verified, true);
  assert.equal(claims.name, "Pat");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${OWN}/user`);
  assert.equal(calls[0].apikey, "sb_publishable_test");
});

test("A7: an email the issuer has not confirmed is never marked verified (X-19)", async () => {
  const { config, mint } = await ownSetup({ email_confirmed_at: null, confirmed_at: null });
  const identity = await verifySupabaseToken((await mint()).token, config);
  assert.equal(identity.email_verified, false);
});

test("A7: the issuer's answer decides: a refused, failing or mismatched /user call fails closed", async () => {
  for (const mode of ["down", "throw"] as const) {
    const { config, mint } = await ownSetup(mode);
    await rejects(verifySupabaseToken((await mint()).token, config), "lv_invalid_token");
  }
  const { config, mint } = await ownSetup({ id: randomUUID() });
  await rejects(verifySupabaseToken((await mint()).token, config), "lv_invalid_token");
});

test("A7: wrong issuer, wrong audience, missing session, expired, too old and non-UUID subjects are refused before any call", async () => {
  const { config, mint, calls } = await ownSetup();
  const now = Math.floor(Date.now() / 1000);
  await rejects(verifySupabaseToken((await mint({}, { iss: "https://evil.example/auth/v1" })).token, config), "lv_invalid_token");
  await rejects(verifySupabaseToken((await mint({}, { aud: "anon" })).token, config), "lv_invalid_token");
  await rejects(verifySupabaseToken((await mint({ session_id: undefined })).token, config), "lv_invalid_token");
  await rejects(verifySupabaseToken((await mint({}, { iat: now - 7200, exp: now - 3600 })).token, config), "lv_invalid_token");
  await rejects(verifySupabaseToken((await mint({}, { iat: now - 3000, exp: now + 600 })).token, { ...config, maxTokenAgeSeconds: 600 }), "lv_invalid_token");
  await rejects(verifySupabaseToken((await mint({}, { sub: "not-a-uuid" })).token, config), "lv_invalid_token");
  await rejects(verifySupabaseToken("not.a.jwt", config), "lv_invalid_token");
  assert.equal(calls.length, 0);
});

test("A7: LC-13 single use: the same access token cannot be exchanged twice, a refreshed one can", async () => {
  const { config, mint } = await ownSetup();
  const a = await mint({}, { sub: "11111111-1111-4111-8111-111111111111" });
  await verifySupabaseToken(a.token, config);
  await rejects(verifySupabaseToken(a.token, config), "lv_invalid_token");
  await verifySupabaseToken((await mint({}, { sub: a.sub })).token, config);
});

test("A7: the replay key uses session_id and iat when a token has no jti or nonce, and never the token", async () => {
  const a = await replayKey({ iss: OWN, sub: "s", session_id: "x", iat: 1 });
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, await replayKey({ iss: OWN, sub: "s", session_id: "x", iat: 2 }));
  assert.notEqual(a, await replayKey({ iss: OWN, sub: "s", session_id: "y", iat: 1 }));
});

test("A7: it is off unless LV_OWN_AUTH is set, and fails closed when enabled without a URL or key", async () => {
  const { config } = await setup();
  await rejects(verifySupabaseToken("a.b.c", config), "lv_not_configured");
  assert.equal(ownAuthFromEnv(() => undefined), undefined);
  assert.equal(ownAuthFromEnv((n) => ({ LV_OWN_AUTH: "0" } as Record<string, string>)[n]), undefined);
  assert.throws(() => ownAuthFromEnv((n) => ({ LV_OWN_AUTH: "1" } as Record<string, string>)[n]), (e: unknown) => e instanceof SessionError && e.code === "lv_not_configured");
  const env: Record<string, string> = { LV_OWN_AUTH: "true", SUPABASE_URL: "https://ref.supabase.co/", LV_PUBLISHABLE_KEY: "sb_publishable_x" };
  const own = ownAuthFromEnv((n) => env[n]);
  assert.equal(own?.issuer, "https://ref.supabase.co/auth/v1");
  assert.equal(own?.userUrl, "https://ref.supabase.co/auth/v1/user");
});

test("A7: configFromEnv accepts own-auth-only configuration, and still needs the session signing key", async () => {
  const lv = await generateKeyPair("ES256", { extractable: true });
  const key = JSON.stringify({ ...(await exportJWK(lv.privateKey)), kid: "lv-1" });
  const env: Record<string, string> = { LV_OWN_AUTH: "1", SUPABASE_URL: "https://ref.supabase.co", LV_PUBLISHABLE_KEY: "k", LV_SESSION_PRIVATE_JWK: key };
  const config = configFromEnv((n) => env[n]);
  assert.equal(config.ownAuth?.issuer, "https://ref.supabase.co/auth/v1");
  assert.deepEqual(config.issuers, []);
  await rejects(verifyIdToken("a.b.c", NONCE, config), "lv_not_configured");
  assert.throws(() => configFromEnv((n) => (n === "LV_SESSION_PRIVATE_JWK" ? undefined : env[n])), (e: unknown) => e instanceof SessionError && e.code === "lv_not_configured");
});

/* ---- A9: the link path verifies the new LunchVoice session that this function issued ---- */

test("A9: a session this function issued is verified and yields its (issuer, subject)", async () => {
  const { config, sign } = await setup();
  const sub = randomUUID().toUpperCase();
  const identity = await verifyIdToken(await sign({}, { sub }), NONCE, config);
  const { token } = await issueSession(identity, config);
  const who = await verifyLunchVoiceSession(token, config);
  assert.equal(who.iss, ISSUER);
  assert.equal(who.sub, sub.toLowerCase());
});

test("A9: a forged, foreign, expired or wrongly shaped session is refused", async () => {
  const { config, sign } = await setup();
  const { token } = await issueSession(await verifyIdToken(await sign({}), NONCE, config), config);
  // Signed by another key.
  const other = await generateKeyPair("ES256");
  const forged = await new SignJWT({ role: "authenticated", session_kind: "lunchvoice" })
    .setProtectedHeader({ alg: "ES256", kid: "lv-1" }).setIssuer(ISSUER).setSubject(randomUUID()).setAudience("authenticated")
    .setIssuedAt().setExpirationTime("1h").sign(other.privateKey);
  await rejects(verifyLunchVoiceSession(forged, config), "lv_invalid_token");
  // An ID token from the identity provider is not a LunchVoice session.
  await rejects(verifyLunchVoiceSession(await sign({}), config), "lv_invalid_token");
  // Missing session kind.
  const lv = await generateKeyPair("ES256", { extractable: true });
  const cfg = { ...config, sessionKey: { ...(await exportJWK(lv.privateKey)), kid: "lv-2" } as JsonWebKeyWithKid };
  const plain = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "lv-2" }).setIssuer(ISSUER).setSubject(randomUUID()).setAudience("authenticated")
    .setIssuedAt().setExpirationTime("1h").sign(lv.privateKey);
  await rejects(verifyLunchVoiceSession(plain, cfg), "lv_invalid_token");
  // Expired.
  const old = Math.floor(Date.now() / 1000) - 7200;
  const expired = await new SignJWT({ role: "authenticated", session_kind: "lunchvoice" })
    .setProtectedHeader({ alg: "ES256", kid: "lv-2" }).setIssuer(ISSUER).setSubject(randomUUID()).setAudience("authenticated")
    .setIssuedAt(old).setExpirationTime(old + 3600).sign(lv.privateKey);
  await rejects(verifyLunchVoiceSession(expired, cfg), "lv_invalid_token");
  assert.ok(token);
});
