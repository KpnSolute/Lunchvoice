# LunchVoice API reference

Status: **reference for the API as deployed today (v1) plus the planned v2 surface.** First edition
2026-10-23. The v1 sections were verified against **production** (project `Lunchvoice`, ref
`qprfonxvthmaoxfixigk`) with read-only catalog queries through the project MCP server and against the
source in this repository; where production and the repository differ, this reference follows
production and says so.

| Document | Covers |
| --- | --- |
| [EDGE_FUNCTIONS.md](EDGE_FUNCTIONS.md) | HTTP endpoints under `/functions/v1/`: login, staff bridge, staff status, menu sync |
| [RPC.md](RPC.md) | Postgres functions callable through the Data API (`/rest/v1/rpc/...`) |
| [DATA_API.md](DATA_API.md) | Tables and views exposed through PostgREST (`/rest/v1/...`), read scoping and supported writes |
| [WEBHOOKS.md](WEBHOOKS.md) | Inbound webhooks: Supabase Auth send-email hook and KpnSolute menu CloudEvents |
| [V2_API.md](V2_API.md) | Planned v2 API (proposal), mapped from today's endpoints |

## Base URLs

| Surface | URL |
| --- | --- |
| Data API (tables, views) | `https://qprfonxvthmaoxfixigk.supabase.co/rest/v1/` |
| RPC | `https://qprfonxvthmaoxfixigk.supabase.co/rest/v1/rpc/<function>` |
| Edge Functions | `https://qprfonxvthmaoxfixigk.supabase.co/functions/v1/<name>` |
| Auth | `https://qprfonxvthmaoxfixigk.supabase.co/auth/v1/` (Supabase Auth) |

The web app uses `@supabase/supabase-js` (`src/lib/supabase.ts`); the raw HTTP forms above are what that
client sends. The project URL and publishable (anon) key are public by design and appear in `.env.example`.

## Authentication and roles

| Caller | How it authenticates | Database role |
| --- | --- | --- |
| Signed-out browser | `apikey: <publishable key>` | `anon` |
| Signed-in user (student or staff) | `apikey` plus `Authorization: Bearer <user access token>` from Supabase Auth | `authenticated` |
| Edge Functions, jobs | Service role key (server-side only, **never** in the browser) | `service_role` (bypasses RLS) |

Sign-in today: students use email one-time codes (`login-start` then Supabase Auth `verifyOtp`); staff use the MJCC
bridge (`staff-sso`, or the legacy `staff-login`). Staff sessions are revalidated with `staff-status`. The planned
v2 sign-in (Google through central identity, with a Supabase built-in Google fallback) is in [V2_API.md](V2_API.md).

**Tenant scoping.** Every org-scoped row carries `org_id`. Row-level security compares it with
`caller_org_id()`, the `org_id` on the caller's own profile. A signed-out caller has no profile, so org-scoped
reads return nothing and RPCs fail closed. One profile belongs to exactly one org today; v2 replaces this with
memberships.

**Admin.** `is_admin()` is true when the caller's profile `role = 'admin'`. Staff provisioned through the MJCC bridge
receive that role; `staff-status` demotes them when MJCC access is withdrawn.

## Conventions and errors

- JSON in and out. Timestamps are ISO 8601 with time zone (`timestamptz`); `date` is `YYYY-MM-DD`.
- **Data API errors** follow PostgREST: HTTP 4xx/5xx with `{ "code", "message", "details", "hint" }`. RLS denials on
  reads appear as empty results, not errors; denied writes return `42501` (permission denied) or an RLS violation.
- **RPC errors**: functions either return a message string (for example `"Session not found or closed."`) or raise
  an exception, which PostgREST returns as HTTP 400 with the message. Each function documents which.
- **Edge Function errors**: `{ "error": "<message>" }` with the HTTP status listed per endpoint. The auth hook uses
  Supabase's hook format `{ "error": { "http_code", "message" } }`.

## Supported API versus reachable API

The Data API exposes the tables the database grants to the API roles; row-level security decides what each caller can
actually read or change. This reference documents the **supported** operations, the ones the app uses and that are
intended to be stable.

**Write privileges in production (verified 2026-10-23, after the hardening migrations in PR #7 and #9):** `anon` may only
insert `contract_requests`. `authenticated` may write only: `dish_ratings` (own rows), `voice_notes` (own notes; admins moderate),
admin content tables (`sessions`, `survey_templates`, `survey_questions`, `store_items`, `menu_cycles`, `menu_cycle_days`, each also
bound by an admin-only policy), `orders.status` and `orders.updated_at` (admins), `profiles.email` and `profiles.display_name`
(own row), and `contract_requests` insert. `orders`, `responses`, `response_ratings`, `survey_answers` and `session_members` are
**RPC-only**: they cannot be written directly. Anything outside this list is not part of the API.

## Keeping this reference current

Regenerate the inventory (functions, privileges, tables, columns, read policies, deployed Edge Functions) with
read-only queries through the project MCP server (`scripts/mcp/README.md`) and update the affected pages in the
same PR as any API change. Known differences between production and the repository's migrations are listed in
[DATA_AND_MIGRATION_PLAN.md](../backend/DATA_AND_MIGRATION_PLAN.md#8a-production-drift-verified-2026-10-23-read-only).
