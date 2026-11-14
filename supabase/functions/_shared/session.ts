// KpnIdentity ID token -> LunchVoice session (IDENTITY_CONTRACT.md §3).
//
// Runs inside the `session` Edge Function and in Node tests (`jose` resolves to
// npm:jose in Deno through supabase/functions/deno.json). Verification happens
// before anything else, uses asymmetric keys only, and fails closed when the
// environment is not configured. LunchVoice then issues its own short session:
// the KpnIdentity token never becomes a product credential.
import { createRemoteJWKSet, decodeJwt, importJWK, jwtVerify, SignJWT, type JWTPayload, type JWTVerifyGetKey } from "jose";

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
  /**
   * A7 (ADR_LUNCHVOICE_OWN_SIGN_IN): LunchVoice's own Supabase Auth as a second trusted issuer. Off unless
   * LV_OWN_AUTH is set. Access tokens are verified by asking the issuer (GET /auth/v1/user), which checks the
   * signature, expiry and session revocation and returns the verified-email state.
   */
  ownAuth?: OwnAuthConfig;
}

export interface OwnAuthConfig {
  /** Exactly the `iss` of the project's access tokens, e.g. https://<ref>.supabase.co/auth/v1 */
  issuer: string;
  /** The Auth user endpoint, e.g. https://<ref>.supabase.co/auth/v1/user */
  userUrl: string;
  /** The project's publishable key (public by design), sent as `apikey`. */
  apikey: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
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
  // A7: Supabase Auth access tokens carry no jti or nonce; a token is unique per (session_id, iat).
  const sid = typeof payload.session_id === "string" && payload.session_id ? `sid:${payload.session_id}:${String(payload.iat ?? "")}` : "";
  const id = typeof payload.jti === "string" && payload.jti ? `jti:${payload.jti}` : sid || `nonce:${String(payload.nonce ?? "")}`;
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
  const ownAuth = ownAuthFromEnv(get);
  const legacy = Boolean(issuers.length && clientId && jwksUrl);
  if ((!legacy && !ownAuth) || !rawKey) {
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
  if (legacy && !jwksUrl!.startsWith("https://")) throw new SessionError("lv_not_configured", "The KpnIdentity JWKS URL must use https.");
  const jwks = legacy
    ? createRemoteJWKSet(new URL(jwksUrl!), { cacheMaxAge: 10 * 60 * 1000 })
    : (async () => { throw new SessionError("lv_invalid_token", "KpnIdentity sign-in is not enabled."); }) as unknown as JWTVerifyGetKey;
  return { issuers: legacy ? issuers : [], clientId: legacy ? clientId! : "", jwks, sessionKey, ...(ownAuth ? { ownAuth } : {}) };
}

/** A7: read LunchVoice's own Auth settings. Off (undefined) unless LV_OWN_AUTH is "1" or "true". */
export function ownAuthFromEnv(get: (name: string) => string | undefined): OwnAuthConfig | undefined {
  const on = (get("LV_OWN_AUTH") ?? "").trim().toLowerCase();
  if (on !== "1" && on !== "true") return undefined;
  const base = (get("SUPABASE_URL") ?? "").trim().replace(/\/+$/, "");
  const apikey = (get("LV_PUBLISHABLE_KEY") ?? get("SUPABASE_PUBLISHABLE_KEY") ?? "").trim();
  if (!base.startsWith("https://") || !apikey) {
    throw new SessionError("lv_not_configured", "LunchVoice sign-in needs SUPABASE_URL and a publishable key.");
  }
  return { issuer: `${base}/auth/v1`, userUrl: `${base}/auth/v1/user`, apikey };
}

/**
 * A7: verify an access token minted by LunchVoice's own Supabase Auth. The token's claims are read only to pre-check
 * issuer, audience, age and shape; the decision is the issuer's own answer to GET /auth/v1/user, which verifies the
 * signature, the expiry and that the session has not been revoked, and returns the verified-email state.
 * Single use per token (LC-13) and a maximum age by `iat`, so the browser forces a refresh before each exchange.
 */
export async function verifySupabaseToken(accessToken: string, config: SessionConfig): Promise<JWTPayload & { sub: string }> {
  const own = config.ownAuth;
  if (!own) throw new SessionError("lv_not_configured", "LunchVoice sign-in is not enabled on this server.");
  let claims: JWTPayload & { session_id?: unknown };
  try {
    claims = decodeJwt(accessToken);
  } catch {
    throw new SessionError("lv_invalid_token", "The sign-in could not be verified.");
  }
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== own.issuer || !aud.includes("authenticated")) throw new SessionError("lv_invalid_token", "The sign-in could not be verified.");
  if (typeof claims.sub !== "string" || !UUID.test(claims.sub)) throw new SessionError("lv_invalid_token", "The sign-in did not carry a valid account id.");
  if (typeof claims.session_id !== "string" || !claims.session_id) throw new SessionError("lv_invalid_token", "The sign-in did not carry a session.");
  if (typeof claims.exp !== "number" || claims.exp + 30 < now) throw new SessionError("lv_invalid_token", "The sign-in could not be verified.");
  const maxAge = config.maxTokenAgeSeconds ?? 600;
  if (typeof claims.iat !== "number" || now - claims.iat > maxAge + 30) throw new SessionError("lv_invalid_token", "This sign-in is too old. Start again.");
  let user: { id?: unknown; email?: unknown; email_confirmed_at?: unknown; confirmed_at?: unknown; user_metadata?: Record<string, unknown> | null };
  try {
    const res = await (own.fetch ?? fetch)(own.userUrl, { headers: { authorization: `Bearer ${accessToken}`, apikey: own.apikey } });
    if (!res.ok) throw new Error(String(res.status));
    user = await res.json();
  } catch {
    // Fail closed: if the issuer cannot confirm the token, nobody signs in.
    throw new SessionError("lv_invalid_token", "The sign-in could not be verified.");
  }
  if (typeof user.id !== "string" || user.id.toLowerCase() !== claims.sub.toLowerCase()) {
    throw new SessionError("lv_invalid_token", "The sign-in could not be verified.");
  }
  const meta = user.user_metadata ?? {};
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const identity = {
    iss: own.issuer,
    sub: claims.sub,
    iat: claims.iat,
    exp: claims.exp,
    session_id: claims.session_id,
    email: text(user.email),
    // The email counts as verified only when the issuer says it confirmed it (X-19: never link or trust an unverified email).
    email_verified: Boolean(user.email_confirmed_at ?? user.confirmed_at),
    name: text(meta.full_name) ?? text(meta.name) ?? text(meta.user_name),
    picture: text(meta.avatar_url) ?? text(meta.picture),
  } as JWTPayload & { sub: string };
  const expires = new Date(1000 * (claims.exp + 60));
  const fresh = await (config.replayGuard ?? defaultGuard).consume(await replayKey(identity), expires);
  if (!fresh) throw new SessionError("lv_invalid_token", "This sign-in was already used. Start again.");
  return identity;
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
 * A9: verify a LunchVoice session token that THIS function issued (ES256 with our own key). Used by the link path to learn which
 * new sign-in is asking to be linked, without trusting the browser's claim. Returns the identity pair the session carries.
 */
export async function verifyLunchVoiceSession(token: string, config: SessionConfig): Promise<{ iss: string; sub: string }> {
  const { d: _private, ...publicJwk } = config.sessionKey as JsonWebKeyWithKid & { d?: string };
  try {
    const key = await importJWK(publicJwk, "ES256");
    const { payload } = await jwtVerify(token, key, { audience: "authenticated", algorithms: ["ES256"], clockTolerance: 30 });
    if (payload.session_kind !== "lunchvoice" || typeof payload.iss !== "string" || typeof payload.sub !== "string" || !UUID.test(payload.sub)) {
      throw new Error("not a LunchVoice session");
    }
    return { iss: payload.iss, sub: payload.sub.toLowerCase() };
  } catch {
    throw new SessionError("lv_invalid_token", "The new sign-in could not be verified.");
  }
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
