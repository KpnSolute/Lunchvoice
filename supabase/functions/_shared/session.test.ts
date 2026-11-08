import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createLocalJWKSet, decodeJwt, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { configFromEnv, issueSession, memoryReplayGuard, replayKey, SessionError, verifyIdToken, type JsonWebKeyWithKid, type ReplayGuard, type SessionConfig } from "./session.ts";

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
