# KpnIdentity sign-in: setup

How LunchVoice signs people in (IDENTITY_CONTRACT.md §3), and what must be configured. Nothing here
holds a secret; values live in the vault, Supabase secrets and Render environment.

## Flow

1. **Sign in** sends the browser to KpnIdentity (Supabase Auth OAuth 2.1 server on the KpnIdentity
   project) with PKCE S256, `state` and `nonce` (`src/lib/kpnIdentity.ts`).
2. KpnIdentity signs the person in with Google on its consent page (`auth.kpnsolute.com`) and
   redirects to `https://lunchvoice.com/auth/callback` with a one-time code.
3. The callback exchanges the code (public client + PKCE) for an **ID token**, then POSTs it with the
   nonce to the `session` Edge Function.
4. `session` verifies the ID token (KpnIdentity JWKS, allow-listed issuer, audience = LunchVoice client
   id, expiry, UUID subject, nonce) and issues a **LunchVoice session** (ES256, 1 hour) carrying the
   same `(iss, sub)`. The Data API accepts it because its signing key is registered with the
   LunchVoice project. `lv.caller_identity()` checks the issuer against `identity.trusted_issuers`,
   and `lv.ensure_account()` creates the account on first use.

## Configuration

| Where | Name | Value |
| --- | --- | --- |
| KpnIdentity Supabase project | OAuth 2.1 server | enabled; authorization URL `https://auth.kpnsolute.com/oauth/consent` (the consent app) |
| KpnIdentity Supabase project | JWT signing keys | asymmetric (ES256 or RS256) |
| KpnIdentity Supabase project | Google provider | Google Cloud OAuth web client id and secret |
| KpnIdentity Supabase project | OAuth client | public client "LunchVoice", redirect `https://lunchvoice.com/auth/callback` (exact). Client ID `7d7de52f-48e7-4b33-8c88-a6c940ca0335` (not a secret). Project `axzwdbizblfkspduqilj`, issuer `https://axzwdbizblfkspduqilj.supabase.co/auth/v1` |
| LunchVoice Supabase project | JWT signing keys | import the public half of the session key (private half stays in the function secret) |
| LunchVoice Supabase secrets | `KPNIDENTITY_ISSUERS` | `https://<kpnidentity-ref>.supabase.co/auth/v1` (comma-separated allow-list) |
| LunchVoice Supabase secrets | `KPNIDENTITY_CLIENT_ID` | the LunchVoice client id from KpnIdentity |
| LunchVoice Supabase secrets | `KPNIDENTITY_JWKS_URL` | `https://<kpnidentity-ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| LunchVoice Supabase secrets | `LV_SESSION_PRIVATE_JWK` | private P-256 JWK with `kid` |
| LunchVoice Supabase secrets | `LV_ALLOWED_ORIGINS` | `https://lunchvoice.com,https://www.lunchvoice.com` (default) |
| LunchVoice database policy | `identity.trusted_issuers` | `["https://<kpnidentity-ref>.supabase.co/auth/v1"]` |
| Render (Lunchvoice static site) | `VITE_KPNIDENTITY_ISSUER`, `VITE_KPNIDENTITY_CLIENT_ID` | as above |

Everything fails closed: a missing value means nobody can sign in, never that anyone can.

## Limits today

- Sessions last one hour, then the person signs in again (no refresh). KpnIdentity's own session
  usually makes that a single click.
- Rotating the session key: import the new public key as standby in the LunchVoice project, switch
  `LV_SESSION_PRIVATE_JWK`, then retire the old key once its sessions have expired.
