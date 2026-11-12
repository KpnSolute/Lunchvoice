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

`src/config/routes.json` is the registry (layout, shell, access, milestone); `npm run check:routes` fails on any
route without an entry. Launch routes:

| Path | Screen |
| --- | --- |
| `/` | landing, 1:1 from the design handoff, with the Founding waitlist band |
| `/waitlist` (`/whitelist` redirects) | Founding seats: seat counter, sign-in-then-join, optional email with consent |
| `/pricing` | founder's capability table from `src/config/pricing.ts`; checkout disabled with a reason |
| `/signin`, `/auth/callback` | KpnIdentity sign-in (unchanged flow) |
| `/me` | dashboard: Hubs, Hub credits, Quick Surveys (N/5), plan and waitlist state |
| `/surveys`, `/surveys/new`, `/surveys/:id`, `/surveys/:id/results` | Quick Surveys on the shared Studio and results |
| `/s/:token` | invite-only Quick Survey: redeem, then the player |
| `/c/:joinCode` | respondent player (guests and members) |
| `/create`, `/join`, `/j/:code`, `/settings` | create Hub (stepper), codes, account settings |
| `/:hub/...` | Hub workspace: overview, Campaigns + Studio, results, analytics, members, invites, roles, settings, Builder, billing, reservation, Discover |

Static routes outrank `:hub`; every top-level name is in `src/lib/reservedSlugs.ts` (the backend list in
`lv.reserved_slugs` is authoritative).

## Identity

Flow: LunchVoice → `auth.kpnsolute.com` → Google → KpnIdentity → LunchVoice. The browser
holds only a token; `(issuer, subject)` is resolved server-side. The simulated sign-in
exists only when the mock is active and must be impossible in a build with real
`VITE_SUPABASE_*` values. No MJCC staff SSO.

## Mocks: each needs a real-API replacement path

The mock (`src/lib/mockTransport.ts`) is dev-only: `import.meta.env.DEV` gates it, a production build without a
configured backend fails closed, and `npm run check:bundle` fails if mock or simulated-sign-in strings reach `dist`.
It keeps state in `localStorage` (`lv.mock.state`; seed with `lv.mock.seed = "demo"` or `"expired"`). Every function
is typed in `src/lib/lvApi.ts` against the launch contract (`docs/v2/LAUNCH_PLAN.md`).

| Area | Real function | Status |
| --- | --- | --- |
| context, plan limits, waitlist | `lv_my_context`, `lv_plan_limits`, `lv_waitlist_status/join` | migration 000014 |
| Quick Surveys, Campaign invites | `lv_quick_survey_*`, `lv_campaign_invite_*` | migration 000014 |
| abuse reports | `lv_report_abuse` | migration 000014 |
| Hub update/transfer/delete/pages, profile, account delete | `lv_hub_update`, `lv_owner_transfer`, `lv_hub_delete`, `lv_hub_pages_*`, `lv_profile_update`, `lv_account_delete` | migration 000015 |
| checkout, billing summary, reservation, export, Discover | `lv_checkout_start`, `lv_billing_summary`, `lv_hub_reservation_status`, `lv_analytics_export`, `lv_discover_apply` | backend 000016 pending; the UI shows the error state until then |
| Hubs, members, invites, roles, Campaigns, guests, analytics | `lv_hub_*`, `lv_member_*`, `lv_invite_*`, `lv_role_*`, `lv_campaign_*`, `lv_guest_*`, `lv_analytics_query` | deployed |
| simulated sign-in | KpnIdentity OIDC | dev only |

Contract requests from the UI: `p_consent_version` on `lv_waitlist_join` (sent only with an email),
`recent_participation` on `lv_my_context` (hidden when absent), `texts` on text-question distributions (L-10).

## Errors

Every expected failure is `{ ok:false, error:{ code, message, ... } }` (backend migration 000008;
gate failures add `reasons`). A thrown exception is a genuine fault and maps to `lv_server_error`.

## Design system and agent skills

Design rules live in `src/ui/tokens.css` (the only token registry), `DESIGN.md` and
`docs/frontend/design-system/` (source order, token and component maps, component standards, the extension
lifecycle). Agents load them through the native skills `design-system`, `frontend-design` and
`design-element-authoring` (`.agents/skills/` for Codex, mirrored to `.claude/skills/` for Claude Code; see
`docs/frontend/design-system/AGENT_WORKFLOW.md`). `npm run check:design` keeps the mirrors identical and every
reusable component visible at `/__gallery`.

## shadcn/ui and Tailwind

shadcn/ui (Radix, Nova style) runs on Tailwind v4 as an addition to the design system, not a
replacement. `src/ui/tokens.css` stays the single source of tokens.

- Add components with `npx shadcn@4.23.0 add <name>` (or the shadcn MCP server). They land in
  `src/components/shadcn/`; `src/components/ui.tsx` is the app's own primitives and is unrelated.
- `src/ui/shadcn.css` maps every shadcn variable onto an `--lv-*` token, so components follow the
  light, dark (`data-theme="dark"`) and high-contrast themes automatically. `--muted` is not
  redefined there because `index.css` uses it for muted text.
- No Tailwind preflight: the global reset would restyle existing pages. A reset scoped to
  `[data-slot]` (every shadcn component) gives the components what they need.
- Tailwind only scans `src/components/shadcn/`. Scanning the whole app turned existing class
  names (`container`, `grid`, `hidden`, `table`) into utilities. Tailwind classes written in any
  other folder generate nothing unless that folder is added with another `@source`.
- Imports use the `@/` alias for `src/` (tsconfig `paths` and the Vite alias).

## Pricing in code

Prices come from a single config module (`src/config/pricing.ts`) used by the pricing page, the landing
and the billing surfaces. Campaign Plus is $39 for 2 weeks, then $19 per week. Checkout is disabled
everywhere with a visible reason until billing opens. Never invent a number. The backend entitlement
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

## UI tests (e2e)

`npm run test:e2e` starts Vite in dev mode with the dev-only mock (`VITE_LV_MOCK=1`, seeded "demo" account) and
drives Chromium through Playwright (`e2e/*.test.mjs`, Node's test runner). It needs a Playwright Chromium; this
environment provides one through `PLAYWRIGHT_BROWSERS_PATH`, elsewhere run `npx playwright install chromium` once.
It is not part of `test:pr` because it needs a browser. It covers the Hub overview stat row and share card, the
Campaign Studio sections (one Add question, option rows, required/optional, audience, identity, guests, schedule
validation, readiness checklist, Publish gating, lifecycle actions, preview without submission), 390px rendering and
the lightweight Quick Survey flow.

## Acceptance test

A new creator signs in, creates any Hub, becomes Owner, configures it, creates, schedules and
publishes a Campaign, shares it, receives responses and reads results, with zero source
changes and a synthetic Hub name.

## Definition of done per slice

Build, bundle check, unit and script tests, and brain check pass; `CHANGELOG.md` updated;
mobile (360px) and keyboard behavior verified; no new mock without an entry in the table
above; local commit only (push and PR need the owner's go-ahead).
