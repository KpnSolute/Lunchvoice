# Edge Functions

All functions are `POST` (plus `OPTIONS` for CORS preflight) at
`https://qprfonxvthmaoxfixigk.supabase.co/functions/v1/<name>` and answer JSON.

Deployed in production on 2026-10-23 (from the project's function list):

| Function | Deployed version | Platform JWT check | Source |
| --- | --- | --- | --- |
| `login-start` | 29 | off (function validates input itself) | `supabase/functions/login-start/index.ts` |
| `staff-sso` | 6 | off | `supabase/functions/staff-sso/index.ts` |
| `staff-login` | 41 | off | `supabase/functions/staff-login/index.ts` |
| `staff-status` | 29 | **on** (requires a valid user JWT) | `supabase/functions/staff-status/index.ts` |
| `menu-sync` | 27 | off (function enforces its own authorization) | `supabase/functions/menu-sync/index.ts` |
| `send-email` | 36 | off (Standard Webhooks signature) | `supabase/functions/send-email/index.ts`, see [WEBHOOKS.md](WEBHOOKS.md) |

Deployed bundles were not byte-compared with the repository; the descriptions below follow the repository source.

**CORS** (all browser-facing functions): the response allows the request origin when it is listed in `APP_ORIGINS`,
is a local dev origin (`http://localhost:5173`, `http://127.0.0.1:5173`), or is `https://lunchvoice.com`,
`https://www.lunchvoice.com` or any `https://*.lunchvoice.com`; otherwise the first allowed origin is returned.

**Rate limiting** (`login-start`, `staff-login`): at most 8 attempts per client IP plus identifier in a rolling
10-minute window, then HTTP 429 `{"error":"Too many attempts. Try again later."}`. The counter is held in the
function instance's memory, so it resets when an instance restarts and is not shared between instances.

---

## `login-start`

Classifies a login identifier for an organization and, for students, sends an email one-time code.

**Request**

```http
POST /functions/v1/login-start
apikey: <publishable key>
Content-Type: application/json

{ "identifier": "student@example.com", "org": "LionCafe" }
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `identifier` | string | yes | Student email, or MJCC staff username (`[a-z0-9._-]{2,80}`) |
| `org` | string | yes | Organization slug, case-insensitive |

**Responses**

| Status | Body | When |
| --- | --- | --- |
| 200 | `{ "kind": "student_returning" }` | Known student; a code was sent |
| 200 | `{ "kind": "student_new" }` | New student; a code was sent and the account will be created on verification |
| 200 | `{ "kind": "staff" }` | Active MJCC sudo username; continue with staff sign-in (no code sent) |
| 400 | `{ "error": ... }` | Invalid body, missing identifier/org, malformed identifier, or a staff email/staff account entered as a student |
| 404 | `{ "error": "Unknown organization." }` or `"Staff username not found."` | |
| 429 | rate limited | |
| 501 | `{ "error": "Staff login not yet configured for this organization." }` | Org does not use the MJCC staff provider |
| 502 | `{ "error": ... }` | MJCCv1 lookup, student lookup or code delivery failed |
| 500 | `{ "error": "Login is temporarily unavailable." }` | Unexpected error |

**Next step for students:** call Supabase Auth `verifyOtp({ email, token, type: "email" })` with the code from the
email. On first sign-in the database trigger `handle_new_user` creates the profile in the org named in the code request.

**Dependencies:** MJCCv1 (staff username lookup; v2 does not use the MJCCv1 inventory system and this bridge is legacy),
Supabase Auth email hook (`send-email`).

---

## `staff-sso`

Completes MJCC single sign-on for staff and returns a token to establish a LunchVoice session.

**Request**

```http
POST /functions/v1/staff-sso
apikey: <publishable key>
Content-Type: application/json

{ "code": "<one-time code from the MJCC portal redirect>", "org": "LionCafe" }
```

`code` must be 32-200 characters; `org` is required.

**Behaviour:** exchanges the code with the KpnCompute/MJCC API (`KPNCOMPUTE_API_BASE`, path
`/api/auth/lunchvoice-sso/exchange`) using a shared bridge secret; requires the returned `tenant_slug` to equal `org`;
provisions or updates the staff user (profile role `admin`, `is_staff = true`) and returns a magic-link token hash.

**Responses**

| Status | Body |
| --- | --- |
| 200 | `{ "token_hash": "<hashed token>", "name": "<display name>" }` then the client calls `verifyOtp({ type: "magiclink", token_hash })` |
| 400 | `{ "error": "Invalid SSO request" }` |
| 403 | `{ "error": "SSO organization mismatch" }` |
| 4xx/5xx | MJCC exchange failure, status passed through |
| 500 | `{ "error": "MJCC single sign-on is temporarily unavailable." }` |

---

## `staff-login` (legacy)

Legacy rollback path: password sign-in against MJCCv1, then a LunchVoice admin session. Prefer `staff-sso`.

**Request:** `{ "email": "<MJCC username or email>", "password": "...", "org": "LionCafe" }`.

| Status | Body |
| --- | --- |
| 200 | `{ "access_token", "refresh_token", "name" }` |
| 400 | missing fields or invalid body |
| 401 | `{ "error": "Invalid staff credentials" }` |
| 403 | `{ "error": "This account does not have LionCafe access." }` |
| 404 | unknown organization |
| 429 | rate limited |
| 501 | org does not use the MJCC staff provider |
| 502 / 500 | MJCCv1 or provisioning failure |

---

## `staff-status`

Revalidates a staff session against MJCC. Called by the app on profile load for staff.

**Request:** `POST` with `Authorization: Bearer <user access token>` and `apikey`; no body.

| Status | Body | Effect |
| --- | --- | --- |
| 200 | `{ "ok": true, "staff": true }` | Still has LionCafe access |
| 200 | `{ "ok": true, "staff": false }` | Not a staff profile |
| 401 | `{ "error": "Missing session" }` / `"Invalid session"` | |
| 403 | `{ "error": "Staff access revoked" }` | The profile is demoted to `role = 'student'`, `is_staff = false`; the app signs the user out |
| 500 | `{ "error": "Staff status check is temporarily unavailable." }` | The app keeps the session and retries later |

---

## `menu-sync`

Projects the MJCC cafeteria menu into `menu_cycles` / `menu_cycle_days` and pushes rating aggregates back to MJCCv1.
Two entry modes on the same URL:

**1. Staff or internal call** (no `webhook-id` header)

```json
{ "action": "sync-menu", "org": "LionCafe" }
```

| Field | Values | Default |
| --- | --- | --- |
| `action` | `sync-menu` (pull the 28-day cycle from the MJCC public menu API) or `sync-feedback` (push per-dish averages to MJCCv1 `menu_feedback_summary`) | `sync-menu` |
| `org` | organization slug | `LionCafe` |

Authorization: either header `x-menu-sync-token` equal to the server's `MENU_SYNC_TOKEN`, or
`Authorization: Bearer <user access token>` for a staff/admin profile in the same org.

| Status | Body |
| --- | --- |
| 200 (`sync-menu`) | `{ "cycle_id", "days_synced", "source_anchor_date", "synced_at" }` |
| 200 (`sync-feedback`) | `{ "rows_pushed" }` |
| 400 | `{ "error": "Unknown action: ..." }` |
| 401 / 403 | staff session required, invalid, or wrong org |
| 500 | sync failure with message |

**2. KpnSolute CloudEvent** (request has a `webhook-id` header): see [WEBHOOKS.md](WEBHOOKS.md#kpnsolute-menu-cloudevents-menu-sync).

Status: legacy MJCC integration. v2 is consumer-first and does not extend it; a generic Hub connector is proposed instead
(roadmap R-28, decision D-13).

---

## Server configuration (names only)

| Function | Required settings |
| --- | --- |
| all | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (or `MJCCV2_*` overrides), `APP_ORIGINS` |
| `login-start` | `SUPABASE_ANON_KEY` (or `MJCCV2_ANON_KEY`), `MJCCV1_URL`, `MJCCV1_SERVICE_ROLE_KEY` |
| `staff-login` | `MJCCV1_URL`, `MJCCV1_ANON_KEY`, `MJCCV1_SERVICE_ROLE_KEY` |
| `staff-sso` | `KPNCOMPUTE_API_BASE`, `LUNCHVOICE_SSO_SECRET` (or a value derived from `MJCCV1_SERVICE_ROLE_KEY`) |
| `staff-status` | `MJCCV1_URL`, `MJCCV1_SERVICE_ROLE_KEY` |
| `menu-sync` | `MENU_SYNC_TOKEN` (optional), `MJCC_MENU_API_BASE`, `MJCCV1_URL`, `MJCCV1_SERVICE_ROLE_KEY`, `KPNSOLUTE_EVENTS_SIGNING_SECRET`, `KPNSOLUTE_TENANT_ORG_MAP` |
| `send-email` | `SEND_EMAIL_HOOK_SECRET`, `ACS_ENDPOINT` + `ACS_ACCESS_KEY` or `AZURE_COMMUNICATION_CONNECTION_STRING`, `MAIL_FROM` (or `AZURE_EMAIL_SENDER`), `MAIL_FROM_NAME` |
