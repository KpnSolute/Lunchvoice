// KpnIdentity ID token -> LunchVoice session (IDENTITY_CONTRACT.md §3).
//
// Runs inside the `session` Edge Function and in Node tests (`jose` resolves to
// npm:jose in Deno through supabase/functions/deno.json). Verification happens
// before anything else, uses asymmetric keys only, and fails closed when the
// environment is not configured. LunchVoice then issues its own short session:
// the KpnIdentity token never becomes a product credential.
import { createRemoteJWKSet, importJWK, jwtVerify, SignJWT, type JWTPayload, type JWTVerifyGetKey } from "jose";

export interface SessionConfig {
  /** Allow-listed KpnIdentity issuers. Empty means nobody can sign in. */
  issuers: string[];
  /** This app's OAuth client id at KpnIdentity: the ID token's required audience. */
  clientId: string;
  /** KpnIdentity public keys. */
  jwks: JWTVerifyGetKey;
  /** LunchVoice session signing key (private ES256 JWK with `kid`), trusted by the LunchVoice database. */
  sessionKey: JsonWebKeyWithKid;
  /** Session lifetime in seconds (default 3600). */
  ttlSeconds?: number;
}

export interface JsonWebKeyWithKid extends JsonWebKey {
  kid: string;
}

export class SessionError extends Error {
  constructor(public readonly code: "lv_not_configured" | "lv_invalid_token", message: string) {
    super(message);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read configuration from environment variables; throws lv_not_configured when anything is missing. */
export function configFromEnv(get: (name: string) => string | undefined): SessionConfig {
  const issuers = (get("KPNIDENTITY_ISSUERS") ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  const clientId = get("KPNIDENTITY_CLIENT_ID")?.trim();
  const jwksUrl = get("KPNIDENTITY_JWKS_URL")?.trim();
  const rawKey = get("LV_SESSION_PRIVATE_JWK");
  if (!issuers.length || !clientId || !jwksUrl || !rawKey) {
    throw new SessionError("lv_not_configured", "Sign-in is not configured on this server.");
  }
  let sessionKey: JsonWebKeyWithKid;
  try {
    sessionKey = JSON.parse(rawKey) as JsonWebKeyWithKid;
  } catch {
    throw new SessionError("lv_not_configured", "The session signing key is not valid JSON.");
  }
  if (sessionKey.kty !== "EC" || sessionKey.crv !== "P-256" || !sessionKey.d || !sessionKey.kid) {
    throw new SessionError("lv_not_configured", "The session signing key must be a private P-256 JWK with a kid.");
  }
  if (!jwksUrl.startsWith("https://")) throw new SessionError("lv_not_configured", "The KpnIdentity JWKS URL must use https.");
  return { issuers, clientId, jwks: createRemoteJWKSet(new URL(jwksUrl), { cacheMaxAge: 10 * 60 * 1000 }), sessionKey };
}

/** Verify a KpnIdentity ID token. Signature, issuer allow-list, audience, expiry, UUID subject and nonce. */
export async function verifyIdToken(idToken: string, nonce: string, config: SessionConfig): Promise<JWTPayload & { sub: string }> {
  if (!config.issuers.length) throw new SessionError("lv_not_configured", "No identity issuer is trusted.");
  if (typeof nonce !== "string" || nonce.length < 16) throw new SessionError("lv_invalid_token", "A sign-in nonce is required.");
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, config.jwks, {
      issuer: config.issuers,
      audience: config.clientId,
      algorithms: ["ES256", "RS256"],
      clockTolerance: 30,
    }));
  } catch {
    throw new SessionError("lv_invalid_token", "The sign-in could not be verified.");
  }
  if (typeof payload.sub !== "string" || !UUID.test(payload.sub)) {
    throw new SessionError("lv_invalid_token", "The sign-in did not carry a valid account id.");
  }
  if (payload.nonce !== nonce) throw new SessionError("lv_invalid_token", "The sign-in does not match this browser.");
  return payload as JWTPayload & { sub: string };
}

/**
 * Issue the LunchVoice session. Claims keep the KpnIdentity (issuer, subject)
 * pair, which lv.caller_identity() checks against identity.trusted_issuers, and
 * carry only the cacheable profile attributes. Role and audience are the ones
 * the Data API expects for signed-in callers.
 */
export async function issueSession(identity: JWTPayload & { sub: string }, config: SessionConfig): Promise<{ token: string; expiresIn: number }> {
  const ttl = Math.min(Math.max(config.ttlSeconds ?? 3600, 60), 3600);
  const key = await importJWK(config.sessionKey, "ES256");
  const now = Math.floor(Date.now() / 1000);
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const token = await new SignJWT({
    role: "authenticated",
    email: text(identity.email),
    email_verified: identity.email_verified === true,
    name: text(identity.name),
    picture: text(identity.picture),
    session_kind: "lunchvoice",
  })
    .setProtectedHeader({ alg: "ES256", kid: config.sessionKey.kid, typ: "JWT" })
    .setIssuer(String(identity.iss))
    .setSubject(identity.sub.toLowerCase())
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(key);
  return { token, expiresIn: ttl };
}
