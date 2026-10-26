# Backend execution roadmap

Rewritten 2026-10-25 to follow the
[canonical master spec](../v2/LunchVoice_v2_CANONICAL_MASTER_SPEC_2026-10-25.md) and the
[backend worker handoff](../v2/handoffs/BACKEND_WORKER.md). The earlier roadmap planned a v1 to v2
migration and a customer-specific launch; both are withdrawn. v1 is retired and LunchVoice builds a
generic SaaS, so nothing below preserves, migrates, backfills or bridges v1, and nothing builds
LionCafe or MJCC.

Status words: **done** (in a local branch, tested), **next**, **later**. Nothing is pushed, deployed
or applied to production unless a release note says so.

## Acceptance test for the whole backend

A brand-new Google-authenticated user can activate a creator entitlement, create an arbitrary Hub,
become its protected Owner, configure it, create/schedule/publish a Campaign, accept responses and
read authorized analytics, with no customer-specific code path. The December food-service manager
uses exactly this path to create `lioncafe`.

## Slices, in order

| # | Slice | Status | Notes and acceptance |
| --- | --- | --- | --- |
| 1 | Audit the migration chain for legacy-bridge assumptions | **done** 2026-10-25 | Canonical migrations 000001-000007 reference no `orgs`, `profiles`, legacy auth, LionCafe or MJCC. Tests use generic Hubs. Customer names are not reserved. See the audit note below |
| 2 | Normalize `lv_api` errors to `{ok:false,error:{code,message,...}}` | **next** | Older write functions still raise. Update tests, `API_CONTRACT.md` and the UI's types |
| 3 | Reconcile the read API into the canonical stack | **done locally** (`feat/v2-read-api`, migration 000007) | `lv_hub_get`, `lv_campaign_list/get`, `lv_member_list`, `lv_invite_list/preview`, `lv_beta_status`, richer `lv_my_context`, reserved slugs. 202+ checks pass. Not pushed |
| 4 | KpnIdentity/Google exchange | later | `auth.kpnsolute.com`, `(issuer, subject)`, never email. Needs the real issuer and JWKS; tested today only with a simulated issuer |
| 5 | Account and session | later | Account created on first verified sign-in; logout/recovery contract |
| 6 | Hub create/read/update and ownership | later | Atomic create: authentication, entitlement check, normalized slug, reserved-slug check, concurrency-safe claim, protected Owner, audit. Add a two-user slug race test. Replace the beta gate with the entitlement check |
| 7 | Memberships, invites and roles | later | 3 custom roles (Starter family), 6 (Team family), Owner outside the count, no privilege escalation, secure ownership transfer |
| 8 | Campaign version, questions and lifecycle | later | Draft, Scheduled, Active, Paused/Closed, Archived; immutable published versions; schedule and eligibility records |
| 9 | Duration entitlements | later | Explicit start/end timestamps, scheduled activation, idempotent extension, server time, fail closed on expiry, no deletion of customer data |
| 10 | Anonymous, authenticated and guest participation | later | Eligibility proof separated from answers; guests never count as members or inflate thresholds |
| 11 | Analytics | later | Keep suppression and withholding semantics; suppressed is not zero |
| 12 | Hub subscriptions | later | One entitlement map; billing idempotent and server-authoritative |
| 13 | Hub Name Reservation | later | ACTIVE, GRACE (25 days), RELEASED; grants no features; Hub id independent of slug |
| 14 | Builder, community, discovery and rewards | later | Pages, moderation, Discover eligibility at 700 genuine members, optional Hub currency |

## One authoritative entitlement map

| Plan | Price | Custom roles | Custom pages | Active Campaigns | Active surveys | Survey unlock threshold | Other |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Free participant | $0 | n/a | n/a | n/a | n/a | n/a | Join and participate |
| Starter Hub | $13 per month | 3 | 3 | 15 | 2 | more than 50% | Starter family |
| Team Hub | $29 per month | 6 | expanded | per Team family | 5 | at least 20% | Discover eligibility at 700 members |
| Campaign Starter | $19 first 2 weeks, $13 per extra week | Starter family | Starter family | Starter family | Starter family | Starter family | Time-bounded |
| Campaign Plus | **not set; checkout fails closed** | Team family | Team family | Team family | Team family | Team family | Time-bounded |
| Hub Name Reservation | $25 per 12 months, $25 renewal | none | none | none | none | none | 25-day grace; grants no features |

Thresholds count unique eligible members only: no guests, duplicates or bots. Campaign Starter is the
Starter feature family and Campaign Plus is the Team feature family; billing duration is the only
difference. Campaign Plus has no known price, so it must not be invented in code, UI, migrations or
documentation. The exact zero-member accounting rule is settled in backend tests (decision D-04).

## Audit note (slice 1, 2026-10-25)

Method: searched migrations 000001-000007, their rollbacks and `supabase/tests` for `orgs`,
`profiles`, `public.`, legacy, backfill, bridge, `lioncafe` and `mjcc`.

- No v2 migration depends on a v1 table. The only mentions are comments recording what was
  deliberately not ported.
- No seed, fixture or migration creates a Hub, owner, role or Campaign.
- Fixed in this audit: tests previously created `lioncafe` as their sample Hub, and a draft of the
  reserved list included `mjcc-admin` and `lioncafe-admin`. Tests now use a synthetic Hub, and no
  customer name is reserved.
- Still present in the repository but outside the canonical chain: v1 migrations
  (`0001` to `0009` and the timestamped files), the v1 Edge Functions (`login-start`, `staff-login`,
  `staff-sso`, `staff-status`, `menu-sync`, `send-email`) and `legacy/`. They are retirement targets,
  not v2 sources. Removing them is a code change that needs the owner's go-ahead because `main`
  still deploys v1.
- Known gap: `lv_hub_create` still gates on beta approval, not on an entitlement. Slice 6 replaces it.
