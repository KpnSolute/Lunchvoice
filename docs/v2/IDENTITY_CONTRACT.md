# Identity contract: KpnIdentity → LunchVoice

Version **1.0**, 2026-10-25. Authority for everything that crosses the boundary
between the KpnIdentity platform and LunchVoice v2.

Companions: [KPNIDENTITY_SCHEMA_V1.md](KPNIDENTITY_SCHEMA_V1.md),
[LUNCHVOICE_SCHEMA_V2.md](LUNCHVOICE_SCHEMA_V2.md),
[D-01 supersession](D01_IDENTITY_SUPERSESSION_2026-10-25.md).

## 0. The one sentence

LunchVoice identifies a person by the pair **`(issuer, subject)`** and by nothing
else. **Email is never the identity key.**

## 1. Direction of authority

| Concern | Owner |
| --- | --- |
| Google authentication, Google account linking | **KpnIdentity** |
| Auth account lifecycle, recovery, MFA | **KpnIdentity** |
| Issuer identity, `subject` allocation | **KpnIdentity** |
| Verified-email state | **KpnIdentity** (asserted), LunchVoice may cache as an attribute |
| Profile claims (name, picture) | **KpnIdentity** (source), LunchVoice may cache |
| OAuth clients, redirect URIs, consent/grants | **KpnIdentity** |
| Product account creation | **LunchVoice** |
| Hubs, memberships, roles, capabilities, Owner | **LunchVoice** |
| Campaigns, questions, submissions, anonymity | **LunchVoice** |
| Analytics, privacy thresholds | **LunchVoice** |
| Entitlements, plans, beta access, reserved slugs | **LunchVoice** |
| Product audit events | **LunchVoice** |

KpnIdentity must never learn that LunchVoice has Hubs, roles, plans, campaigns or
participations. No LunchVoice concept may appear in a KpnIdentity table.

## 2. What crosses the boundary

Exactly one token crosses, on sign-in, and only these claims are consumed.

| Claim | Required | Type | Use in LunchVoice |
| --- | --- | --- | --- |
| `iss` | **yes** | URL (https) | the `identity_issuer` half of the key; must be in the allow-list |
| `sub` | **yes** | UUID string | the `identity_subject` half of the key; stable forever for that person at that issuer |
| `aud` | **yes** | string | must equal the LunchVoice client id |
| `exp`, `iat` | **yes** | numeric | standard lifetime checks |
| `email` | no | string | **cached attribute only**; never a key, never a lookup |
| `email_verified` | no | boolean | gates flows that require a deliverable address (see §5) |
| `name` | no | string | cached display default |
| `picture` | no | URL | cached avatar; safe to drop |
| `nonce` | yes for OIDC login | string | replay protection |

Not consumed, and **must not** be treated as identity: any LunchVoice-specific
claim, any Hub/role/plan claim, any claim invented by the browser. A client
cannot forge these because they are read from a token LunchVoice has verified
against KpnIdentity's JWKS — never from a request body.

### 2.1 Explicitly rejected as identity

- email, even when verified and unique
- display name
- avatar URL
- Google's own `sub` (that is KpnIdentity's business; Google identity never
  reaches LunchVoice)
- any LunchVoice-local auth user id as a durable identity primary key

## 3. Token and session trust model

```
browser ──login──▶ KpnIdentity ──(Google)──▶ KpnIdentity session
                        │
                        └── ID token (iss, sub, email, email_verified, name, picture)
                                    │
                                    ▼
                         LunchVoice verifies
                                    │
                                    ▼
                    LunchVoice own product session
```

Rules:

1. **Verification happens before any database read.** Signature against
   KpnIdentity JWKS (asymmetric only), `iss` allow-listed, `aud` matches, `exp`
   not passed, `sub` well-formed.
2. **Asymmetric signatures only.** No shared-secret `HS256` acceptance, ever.
3. **Fail closed.** Unset or empty allow-list ⇒ *nobody* is signable-in. This is
   deliberate: an unconfigured environment must not accept tokens.
4. **No implicit account creation from a browser-supplied id.** The only way an
   account appears is first verified sign-in.
5. **LunchVoice issues its own session.** It does not pass the KpnIdentity token
   through to the client as an authority for product operations.
6. **Clock and key rotation.** JWKS is cached with a bounded TTL and refreshed on
   unknown `kid`.

## 4. Account linking rules

1. First verified sign-in for `(issuer, subject)` creates exactly one LunchVoice
   account. Repeat sign-ins reuse it, including concurrent ones (serialised).
2. `UNIQUE(identity_issuer, identity_subject)` at the database level. The
   application must not do the uniqueness check alone.
3. **Two identities never merge because their emails match.** Two accounts that
   share an email stay two accounts. Support cannot merge them by email.
4. One LunchVoice account may hold **many** identity rows (for example a future
   second issuer), but each `(issuer, subject)` maps to exactly one account.
5. A person's roles are **per Hub**. Signing in with a different identity does not
   carry roles anywhere.
6. Deleting a LunchVoice account does not delete the KpnIdentity person; it
   removes the product account, its memberships and its participation.

## 5. Verified vs unverified email

`email_verified` is a KpnIdentity assertion, cached at the time of sign-in.

| Flow | Unverified email |
| --- | --- |
| Sign-in and browse | allowed |
| Join a Hub by invitation code | allowed |
| Apply for beta | **refused** |
| Anything that promises to send mail to that address | **refused** |

A stale cache must never be treated as fresh verification. Where a decision
depends on verification, the value recorded at sign-in is used and the flow is
re-entered on the next sign-in if it changes.

## 6. Failure behaviour

Every failure is opaque to the caller: the response does not say whether the
issuer, signature or account was the problem.

| Condition | Result |
| --- | --- |
| No token / malformed | refused, no account touched |
| Unknown issuer | refused |
| Bad signature / unknown `kid` after refresh | refused |
| Expired | refused |
| Wrong `aud` | refused |
| `sub` not a UUID | refused |
| Allow-list unset | everything refused (fail closed) |
| Token OK, no account yet | account created once, then proceeded |
| Concurrent first sign-ins | exactly one account (row lock) |
| Disabled LunchVoice account | refused with a stable, non-revealing code |

## 7. Tested boundary

A real Google login **cannot** be exercised in local automation, and the real
KpnIdentity issuer is not deployed yet. Therefore:

- Tests mint **simulated but correctly-shaped** KpnIdentity tokens for a test
  issuer, set that issuer in the allow-list, and run the full path.
- This proves LunchVoice's verification, linking, uniqueness, isolation and
  privacy behaviour.
- It **does not** prove KpnIdentity's own token issuance or Google's round trip.

**Remaining blocker (accepted):** one real Google → KpnIdentity → LunchVoice
sign-in must be recorded against the deployed issuer before launch. Until then,
"identity works" means "works against a simulated issuer of the correct shape".
