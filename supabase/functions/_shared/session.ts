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
  /** LC-13: an ID token older than this (by `iat`) is refused. Default 600 s. */
  maxTokenAgeSeconds?: number;
  /** LC-13: single-use store; every ID token is exchanged at most once. Default: an in-memory store (per instance). */
  replayGuard?: ReplayGuard;
}

/** LC-13: records an exchanged ID token. `consume` resolves true the first time a key is seen, false on a replay. */
export interface ReplayGuard {
  consume(keyHash: string, expiresAt: Date): Promise<boolean>;
}

/** Best-effort guard for one function instance. The deployed function uses the database store when it can. */
export function memoryReplayGuard(): ReplayGuard {
  const seen = new Map<string, number>();
  return {
    async consume(keyHash, expiresAt) {
      const now = Date.now();
      for (const [k, until] of seen) if (until < now) seen.delete(k);
      if (seen.has(keyHash)) return false;
      seen.set(keyHash, expiresAt.getTime());
      return true;
    },
  };
}

const defaultGuard = memoryReplayGuard();

/** The replay key: SHA-256 over issuer, subject and the token's jti (or its nonce). No token or profile data. */
export async function replayKey(payload: JWTPayload): Promise<string> {
  const id = typeof payload.jti === "string" && payload.jti ? `jti:${payload.jti}` : `nonce:${String(payload.nonce ?? "")}`;
  const data = new TextEncoder().encode(`${payload.iss}|${payload.sub}|${id}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
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
  // LC-13: a stolen ID token cannot be exchanged later or twice. `iat` is checked when present (KpnIdentity sets it);
  // a token without `iat` still passes the single-use check, so existing sign-ins keep working.
  const now = Math.floor(Date.now() / 1000);
  const maxAge = config.maxTokenAgeSeconds ?? 600;
  if (typeof payload.iat === "number" && now - payload.iat > maxAge + 30) {
    throw new SessionError("lv_invalid_token", "This sign-in is too old. Start again.");
  }
  const expires = new Date(1000 * (typeof payload.exp === "number" ? payload.exp + 60 : now + maxAge));
  const fresh = await (config.replayGuard ?? defaultGuard).consume(await replayKey(payload), expires);
  if (!fresh) throw new SessionError("lv_invalid_token", "This sign-in was already used. Start again.");
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
