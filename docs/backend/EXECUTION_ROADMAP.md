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
| 1 | Audit the migration chain for legacy-bridge assumptions | **done** | No canonical migration references v1 |
| 2 | Normalize `lv_api` errors | **done** (000008) | Bodies in `lv.api_*`; structured extras via `lv.api_error` (000014) |
| 3 | Read API | **done** (000007) | |
| 4 | KpnIdentity/Google exchange | **done, live** | `session` Edge Function; production sign-in works end to end |
| 5 | Account and session | **done** (000015) | Profile update, account delete (de-identify per founder) |
| 6 | Hub create/read/update and ownership | **done** (000014, 000015) | Credit-gated create, update, owner transfer, delete with 30-day slug quarantine |
| 7 | Memberships, invites and roles | **done** (000010, limits from the map in 000014) | |
| 8 | Campaign version, questions and lifecycle | **done** (000011) | |
| 9 | Duration entitlements | **done** (000014, 000016) | Entitlements with start/end, Hub credits, fail closed on expiry, nothing deleted |
| 10 | Participation modes and guests | **done** (000012, 000014) | Link/invite access, Campaign invites, guests only on link |
| 11 | Analytics | **done** (000013, strict engine in 000016) | Merged withheld bucket, dominance, withheld mean and rate, free text at cohort, export |
| 12 | Hub subscriptions | **billing-ready** (000016 + `billing-webhook`) | Fails closed until `billing.provider_ready`; Stripe wiring is the founder's step |
| 13 | Hub Name Reservation | **done** (000016) | ACTIVE, GRACE (25 days), RELEASED |
| 14 | Builder, community, discovery and rewards | **partial** | Pages and Discover gate done; comments, shop, leaderboard, news content and rewards later |
| 15 | Quick Surveys, waitlist, abuse controls | **done** (000014) | Personal space, 5 active / 10 questions, 50-seat waitlist, reports and moderation |

Production: 000001-000013 applied; 000014-000016 follow `PRODUCTION_RESET_RUNBOOK.md` with the founder's approval.

## One authoritative entitlement map

`lv.plan_limits` is the authority; `API_CONTRACT.md` (Launch API) mirrors it.

| Plan | Price | Custom roles | Custom pages | Active Campaigns | Active surveys | Survey unlock threshold | Other |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Free Quick Survey | $0 | n/a | n/a | 5 Quick Surveys | 5 | n/a | 10 questions, core kinds, link or invite |
| Starter Hub | $13 per month | 3 | 3 | 15 | 2 | more than 50% | Starter family |
| Team Hub | $29 per month | 6 | 10 (provisional) | 15 (provisional) | 5 | at least 20% | Discover eligibility at 700 members |
| Campaign Starter | $19 first 2 weeks, $13 per extra week | Starter family | Starter family | Starter family | Starter family | Starter family | Time-bounded |
| Campaign Plus | $39 first 2 weeks, $19 per extra week | Team family | Team family | Team family | Team family | Team family | Time-bounded |
| Hub Name Reservation | $25 per 12 months, $25 renewal | none | none | none | none | none | 25-day grace; grants no features |

Thresholds count unique eligible members only: no guests, duplicates or bots. A new Hub never deadlocks: surveys
that have not met the threshold are what count against the survey limit.

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
- Closed in 000014: `lv_hub_create` consumes a Hub credit instead of a beta approval.
