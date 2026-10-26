# KpnIdentity schema v1 (minimal)

2026-10-25. Minimal identity platform schema — **not** an enterprise IAM build.
Scope is what LunchVoice needs for launch, plus room to grow without reshaping.

Companion: [IDENTITY_CONTRACT.md](IDENTITY_CONTRACT.md).

## 1. What KpnIdentity is allowed to know

Identity, authentication and OAuth clients. **Nothing** about Hubs, roles,
memberships, plans, campaigns or participation. If a column would only make sense
to LunchVoice, it does not belong here.

## 2. Managed vs application tables

Two clearly separated layers:

| Layer | Owner | Examples |
| --- | --- | --- |
| **Supabase-managed auth** | Supabase migrations | `auth.users`, `auth.identities`, `auth.sessions`, `auth.refresh_tokens`, `auth.audit_log_entries` |
| **KpnIdentity application** | KpnIdentity | `kpni.profiles`, `kpni.oauth_clients`, `kpni.oauth_redirect_uris`, `kpni.security_events` |

Rules:

- Read `auth.*`; **never** alter its shape.
- Never store product data in `auth.users.raw_user_meta_data`.
- Anything that must be *authoritative* lives in `kpni.*`, not in user-editable
  metadata.

## 3. Application tables

### 3.1 `kpni.profiles`

One row per KpnIdentity person. Keyed by the Supabase auth user id.

| Column | Type | Notes |
| --- | --- | --- |
| `auth_user_id` | uuid PK → `auth.users(id)` on delete cascade | the person in Supabase's auth |
| `subject` | uuid UNIQUE NOT NULL default `gen_random_uuid()` | **the stable `sub`**; never regenerated |
| `display_name` | text | from Google `name` |
| `picture_url` | text | from Google `picture`; nullable |
| `email` | citext | cached contact attribute — **not a key** |
| `email_verified` | boolean NOT NULL default false | from Google's assertion |
| `created_at` / `updated_at` | timestamptz | |

`subject` is the value LunchVoice keys on. It must survive email changes, name
changes, and Google account re-authorisation.

### 3.2 `kpni.oauth_clients`

| Column | Type | Notes |
| --- | --- | --- |
| `client_id` | text PK | public identifier |
| `client_name` | text | `'LunchVoice'` |
| `client_secret_hash` | text | hashed; never the secret itself |
| `is_confidential` | boolean | server-side clients |
| `is_active` | boolean default true | kill switch |
| `created_at` | timestamptz | |

### 3.3 `kpni.oauth_redirect_uris`

| Column | Type | Notes |
| --- | --- | --- |
| `client_id` | text → `kpni.oauth_clients` | |
| `uri` | text | exact match only, no wildcards |
| `created_at` | timestamptz | |

Exact-match redirect URIs. A wildcard redirect is how open-redirects happen.

### 3.4 `kpni.security_events`

Append-only audit of identity-relevant actions.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `occurred_at` | timestamptz default now() | |
| `event` | text | `sign_in`, `sign_in_failed`, `account_created`, `email_changed`, `client_created` |
| `subject` | uuid | nullable; not a foreign key so history survives deletion |
| `detail` | jsonb | non-secret context |
| `ip`, `user_agent` | text | nullable |

No product events here. A LunchVoice role change is not a KpnIdentity event.

## 4. Deliberately excluded from v1

Not because they are wrong, but because building them now would be the "oversized
IAM platform" the directive warns against:

- MFA / TOTP / passkeys (recovery and MFA are explicitly "later")
- consent/grants tables (add when a second client needs scoped grants)
- organisations, teams, groups — these would be KpnIdentity pretending to know
  about tenancy
- SCIM, SAML, provisioning
- billing or plans
- any Hub, role, membership, campaign or participation concept

## 5. Invariants to test

1. `subject` is unique and stable across email/name changes.
2. Two auth users can hold different `subject` values; the same subject cannot
   attach to two people.
3. Deleting `auth.users` row cascades to the profile but security events survive.
4. A redirect URI must match exactly; a look-alike is refused.
5. Client secret is stored hashed; the plaintext never persists.
6. A deactivated client cannot complete a flow.

## 6. Deployment reality (as of 2026-10-25)

The KpnIdentity project (`axzwdbizblfkspduqilj`) is ACTIVE_HEALTHY but **empty**:
OAuth server off, no SMTP, no OAuth client for LunchVoice, Site URL
`http://localhost:3000`. This schema is a design + local-baseline artifact; it is
**not deployed**.
