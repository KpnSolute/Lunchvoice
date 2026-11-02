import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createLocalJWKSet, decodeJwt, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { configFromEnv, issueSession, SessionError, verifyIdToken, type JsonWebKeyWithKid, type SessionConfig } from "./session.ts";

const ISSUER = "https://kpnidentity.example.supabase.co/auth/v1";
const CLIENT = "lunchvoice-web";
const NONCE = "nonce-that-is-long-enough-123";

async function setup() {
  const idp = await generateKeyPair("ES256");
  const idpPublic = { ...(await exportJWK(idp.publicKey)), kid: "idp-1", alg: "ES256" } as JWK;
  const lv = await generateKeyPair("ES256", { extractable: true });
  const sessionKey = { ...(await exportJWK(lv.privateKey)), kid: "lv-1" } as JsonWebKeyWithKid;
  const config: SessionConfig = { issuers: [ISSUER], clientId: CLIENT, jwks: createLocalJWKSet({ keys: [idpPublic] }), sessionKey };
  const sign = (claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: number; sub?: string } = {}) =>
    new SignJWT({ nonce: NONCE, email: "pat@example.com", email_verified: true, name: "Pat", ...claims })
      .setProtectedHeader({ alg: "ES256", kid: "idp-1" })
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? CLIENT)
      .setSubject(opts.sub ?? randomUUID())
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 300)
      .sign(idp.privateKey);
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
