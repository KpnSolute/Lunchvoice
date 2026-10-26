# LunchVoice v2 — frontend contract

Owner: the UI thread. Source of truth for product scope: the canonical master spec
(2026-10-25). Backend contract: `docs/backend/API_CONTRACT.md` (backend-owned).

## Boundaries

- V1 is retired. Do not restore any v1 screen, auth, route or data dependency.
- LunchVoice builds the platform, never a customer Hub. No `lioncafe`, `mjcc` or "Miami Job
  Corps" in routes, pages, branding, fixtures or seeded Campaigns. Tests use synthetic Hub
  names.
- All data goes through `lv_api` (`src/lib/lvApi.ts`). No direct table access.
- Authorization lives in the backend. UI gating is presentation only.

## Routes

| Path | Screen |
| --- | --- |
| `/` | public site |
| `/signin` | KpnIdentity sign-in and callback shell |
| `/me` | account, My Hubs, create Hub, invitations, entitlement state |
| `/:hub` | Hub landing / workspace |
| `/:hub/campaigns` | Campaign list |
| `/:hub/campaigns/:id` | Campaign Studio; respondent player for participants |
| `/:hub/analytics` | results |

System paths are reserved before `/:hub` (`src/lib/reservedSlugs.ts`, mirrored from the
backend which is authoritative): existing list plus `pricing`, `discover`, `billing`,
`settings` (add `discover` to the list when the route lands; verify against the backend
list before relying on it). Static routes always outrank `:hub` in the router.

## Identity

Flow: LunchVoice → `auth.kpnsolute.com` → Google → KpnIdentity → LunchVoice. The browser
holds only a token; `(issuer, subject)` is resolved server-side. The simulated sign-in
exists only when the mock is active and must be impossible in a build with real
`VITE_SUPABASE_*` values. No MJCC staff SSO.

## Mocks: each needs a real-API replacement path

| Mock (`src/lib/mockTransport.ts`) | Real replacement | Status |
| --- | --- | --- |
The mock is dev-only: `import.meta.env.DEV` gates it, a production build without a configured
backend fails closed, and `npm run check:bundle` fails if mock or simulated-sign-in strings reach
`dist`. Every function below is wired in `src/lib/lvApi.ts` against the real contract; the mock
only stands in until `feat/v2-read-api` is merged and deployed.

| Mock case | Real function | Status |
| --- | --- | --- |
| my context, beta status/apply | `lv_my_context`, `lv_beta_status`, `lv_beta_apply` | wired; backend local only |
| hub create/get, members | `lv_hub_create`, `lv_hub_get`, `lv_member_list` | wired; backend local only |
| invites create/list/preview/redeem/revoke | `lv_invite_*` | wired; backend local only |
| campaign list/get/create/question/activate/close | `lv_campaign_*` | wired; backend local only |
| submit, analytics | `lv_submit_response`, `lv_analytics_query` | wired; backend local only |
| simulated sign-in | KpnIdentity OIDC | issuer does not exist yet |
| plans, entitlements, reservations, scheduling, pages, roles editing | none yet | blocked on backend |

When a function lands, move it from the mock to the real transport and delete the mock case.

## Errors

Target shape `{ ok:false, error:{ code, message, ... } }`. Until the backend normalizes old
writes, `lvApi` also parses the `lv_*` prefix of a raised exception message.

## Pricing in code

Prices come from a single config module (`src/config/pricing.ts`, not yet written) used by the
pricing page and checkout surfaces. Campaign Plus has no numeric price: its card shows
features only and its checkout is disabled. Never invent a number. The backend entitlement
map is authoritative; the UI never decides what a plan allows.

## Work order

1. Design system and component gallery (`src/ui/`).
2. Wire the read APIs.
3. Fix v1 assumptions in frontend docs (this change).
4. KpnIdentity-ready sign-in and callback.
5. `/me` and generic create-Hub.
6. Hub workspace and Builder (three columns).
7. Members, invites, roles.
8. Campaign Studio and duration scheduling.
9. Respondent player.
10. Analytics, with suppressed and withheld states as their own states.
11. Pricing, entitlement, Hub Name Reservation.
12. Browser E2E, mobile and accessibility validation.

## Acceptance test

A new creator signs in, creates any Hub, becomes Owner, configures it, creates, schedules and
publishes a Campaign, shares it, receives responses and reads results, with zero source
changes and a synthetic Hub name.

## Definition of done per slice

Build, bundle check, unit and script tests, and brain check pass; `CHANGELOG.md` updated;
mobile (360px) and keyboard behavior verified; no new mock without an entry in the table
above; local commit only (push and PR need the owner's go-ahead).
