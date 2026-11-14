# Launch tracker (the founder's progress view)

One row per spec ID. Every agent updates its row **in the same commit** as the work and writes the matching `CHANGELOG.md`
entry (Work Tracking Protocol in `AGENTS.md` and `CLAUDE.md`). Never delete a row; a cut feature is `cut` with a reason.

**Status values (claim only as far as the evidence goes):** `planned` (specified), `coded`, `tested`, `deployed`,
`verified` (proven end to end with a real run), `UI-complete` (passed the week-4 acceptance). Also `blocked` and `cut`.

Last full refresh: 2026-11-14 (all rows `planned`). Weeks: 1 = 11-16, 2 = 11-23, 3 = 11-30, 4 = 12-07 (UI refresh). Gates: G1 11-20, G2 11-27, G3 12-04 (freeze), G4 12-11.

## Specs (`02_FEATURE_SPECS.md`, `03_`)

| ID | Pillar | Feature | Pri | Week | Owner | Status | Evidence (changelog heading) | Last update |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | Foundation | 30-day sign-in on a device | P0 | 1 | Edge | planned | | |
| A2 | Foundation | Hostname-aware app (one build, three hostnames) | P0 | 1 | Edge | planned | | |
| A3 | Foundation | Hostnames and Cloudflare rules for `auth`, `create`, `pay-next` (03_ sections 3 to 6) | P0 | 1 | Edge | planned | | |
| A4 | Foundation | `pay` cutover from GoDaddy with rollback (03_ section 5) | P0 | 1 | Edge | planned | | |
| A5 | Foundation | Turnstile on guest and sign-up paths | P0 | 3 | Edge | planned | | |
| A6 | Foundation | Sign-in and sign-up screens (built in this repository on LunchVoice's own sign-in) | P0 | 1-4 | Design + UI-functional + UI-refresh | coded (functional screens: Google, Discord, email, sign-up, forgot and reset; behind `VITE_LV_AUTH`; unstyled for week 4) | CHANGELOG "A7 own sign-in: code behind a flag" (2026-11-14) | 2026-11-14 |
| A7 | Foundation | Own sign-in for LunchVoice (Supabase Auth in the Lunchvoice project; ADR proposed, spike first) | P0 | 1-2 | Backend + Edge + UI-functional | deployed (server side: Auth settings, `session` v16, `LV_OWN_AUTH`, trusted issuer); screens off until Google, Discord and SMTP credentials are entered; not verified end to end | CHANGELOG "own sign-in switched on server side" (2026-11-14) | 2026-11-14 |
| A8 | Foundation | Sign-in methods on one account (link Google, Discord, email) | P0 | 1-2 | UI-functional + Edge | planned | | |
| A9 | Foundation | Link an existing account found by email, confirmed with its password | P0 | 1-2 | Backend + Edge + UI-functional | planned (email index and `lv_link_candidates` applied in production with 000055) | CHANGELOG "E11 usernames" (2026-11-14) | 2026-11-14 |
| B1 | Foundation | Creator Plus and Creator Pro purchases (person-scoped) | P0 | 1 | Backend + Edge | planned | | |
| B2 | Foundation | Prove billing with a real purchase | P0 | 1 | Backend + Edge | planned | | |
| B3 | Foundation | Billing screens | P0 | 1 | Backend + Edge | planned | | |
| B4 | Foundation | Campaign passes | P0 | 2 | Backend + Edge | planned | | |
| B5 | Foundation | Hub Name Reservation purchase and renewal | P0 | 2 | Backend + Edge | planned | | |
| B6 | Foundation | Money emails | P0 | 1 | Backend + Edge | planned | | |
| B7 | Foundation | Entitlement edge cases | P0 | 2 | Backend + Edge | planned | | |
| B8 | Foundation | Armed, audited billing release (do not auto-charge anyone) | P0 | 1 | Backend + Edge | planned | | |
| C1 | Analytics | Creator-controlled results (design in `LAUNCH_PREP_PLAN` section 2, adopted unchanged) | P0 | 1 | Backend | planned | | |
| C2 | Analytics | Decisions log ("You said, we did") | P0 | 2 | Backend | planned | | |
| C3 | Analytics | Share results with members (published snapshots) | P0 | 2 | Backend | planned | | |
| C4 | Analytics | Advanced analytics (fills the undelivered Team claim) | P0 | 2 | Backend | planned | | |
| C5 | Analytics | Trends and Ask again completion | P0 | 2 | Backend | planned | | |
| C6 | Analytics | Hub health panel (the Heartbeat and Voice parts of Pulse; built together with E10) | P0 | 2 | Backend | planned | | |
| C7 | Analytics | Exports and the manager digest | P0 | 3 | Backend | planned | | |
| C8 | Analytics | Embed released results (P1, Team) | P1 | 3 | Backend | planned | | |
| D1 | Survey design | Elections (finish PR #73 and complete) | P0 | 2 | Backend | planned | | |
| D2 | Survey design | Quiz mode | P0 | 2 | Backend | planned | | |
| D3 | Survey design | Question-type and logic parity (finish, do not add) | P0 | 2 | Backend | planned | | |
| D4 | Survey design | Live Session Lite (the Kahoot-like room, minus competition) | P1 | 3 | Backend | planned | | |
| D5 | Survey design | Recurring schedules and Ask again | P0 | 2 | Backend | planned | | |
| D7 | Survey design | Participation receipt | P0 | 3 | Backend | planned | | |
| E1 | Social presence | Profiles and Hub nicknames | P0 | 3 | Backend | planned | | |
| E2 | Social presence | Hub identity: presence, topic tags, badges, Discord card | P0 | 3 | Backend | planned | | |
| E3 | Social presence | Notifications | P0 | 3 | Backend | planned | | |
| E4 | Social presence | Points, shop and leaderboard | P0 | 3 | Backend | planned | | |
| E5 | Social presence | News, comments, reactions and moderation | P0 | 3 | Backend | planned | | |
| E6 | Social presence | Reports, blocks and appeals | P0 | 3 | Backend | planned | | |
| E7 | Social presence | Onboarding and invites | P0 | 3 | Backend | planned | | |
| E8 | Social presence | Discover finish | P0 | 3 | Backend | planned | | |
| E9 | Social presence | Hub activity and member directory | P0 | 3 | Backend | planned | | |
| E10 | Social presence | Hub Pulse (launch version: Pulse Lite, P0) | P0 | 3 | Backend | planned | | |
| E11 | Social presence | Usernames and display names, the Discord way, chosen at sign-up | P0 | 1 | Backend + UI-functional | deployed (000055 applied; username step live; not verified by a real sign-in; mentions and profile pages not built) | CHANGELOG "E11 usernames: migration 000055 applied" (2026-11-14) | 2026-11-14 |
| F1 | Connectivity | Link a Discord account | P0 | 3 | Edge | planned | | |
| F2 | Connectivity | Connect a server to a Hub and role rules | P0 | 3 | Edge | planned | | |
| F3 | Connectivity | Decision posts and results cards in Discord | P0 | 3 | Edge | planned | | |
| F4 | Connectivity | Discord onboarding | P0 | 3 | Edge | planned | | |
| F5 | Connectivity | Abuse limits and staff control | P0 | 3 | Edge | planned | | |
| G1 | Platform | Public API v1 and docs | P0 | 3 | Edge + Backend | planned | | |
| G2 | Platform | Webhooks | P0 | 3 | Edge + Backend | planned | | |
| G3 | Platform | Account export and deletion | P0 | 3 | Edge + Backend | planned | | |
| G4 | Platform | Admin console completeness | P0 | 3 | Edge + Backend | planned | | |
| G5 | Platform | Product analytics (PostHog), cookieless | P0 | 1 | Edge + Backend | planned | | |
| G6 | Platform | Creator dashboard (functional, for `create.lunchvoice.com`) | P0 | 1-3 | Edge + Backend | planned | | |
| N1 | Connectivity | Share kit | P0 | 3 | Edge + Backend | planned | | |
| N2 | Connectivity | Invite by email | P0 | 3 | Edge + Backend | planned | | |
| N3 | Connectivity | Integration recipes (documentation, not new code) | P0 | 3 | Edge + Backend | planned | | |
| N4 | Connectivity | Embed an answer link (P1, with C8) | P1 | 3 | Edge + Backend | planned | | |
| R1 | Foundation | Reconcile production with `main` (Mon 11-16) | P0 | 1 | Backend | planned | | |
| Y1 | Survey design | Creator studio, finished | P0 | 1-2 | Backend + UI-functional | planned | | |
| Y2 | Survey design | Preview and test before publish | P0 | 2 | Backend + UI-functional | planned | | |
| Y3 | Survey design | Personal templates, Hub templates and the question bank | P0 | 2 | Backend + UI-functional | planned | | |
| Y4 | Survey design | Brand kit and themes | P0 | 2-3 | Backend + UI-functional | planned | | |
| Y5 | Survey design | Co-creator | P1 | 3 | Backend + UI-functional | planned | | |

## Security and operations (`04_SECURITY_AND_OPERATIONS_HARDENING.md`)

| ID | Requirement | Owner | Status | Evidence | Last update |
| --- | --- | --- | --- | --- | --- |
| S-01 | Anonymous answers cannot be linked to a person by any API, join, export, timing or log | QA and Security | planned | | |
| S-02 | Every reporting surface uses the one suppression engine | QA and Security | planned | | |
| S-03 | Small groups are withheld, never zero; complementary cells are covered | QA and Security | planned | | |
| S-04 | No timestamps, order or ids that identify anonymous answers | QA and Security | planned | | |
| S-05 | Guest identifiers are hashed and expire | QA and Security | planned | | |
| S-06 | Retention matches policy | QA and Security | planned | | |
| S-07 | Staff cannot read anonymous answers or ballots, and every staff read of personal data is audited with a reason | QA and Security | planned | | |
| S-08 | Account deletion removes what F-05 says and nothing else breaks | QA and Security | planned | | |
| S-10 | Every `lv_api` function is `security definer` only where needed, has a fixed `search_path`, and checks the caller | QA and Security | planned | | |
| S-11 | RLS on every exposed table; the Data API exposes `lv_api` only | QA and Security | planned | | |
| S-12 | Each Edge Function authenticates itself (all have `verify_jwt = false`) | QA and Security | planned | | |
| S-13 | CORS and origins are allow-lists | QA and Security | planned | | |
| S-14 | No injection or script in user text | QA and Security | planned | | |
| S-15 | Uploads are safe | QA and Security | planned | | |
| S-16 | No open redirects | QA and Security | planned | | |
| S-17 | Outbound webhooks cannot reach our network | QA and Security | planned | | |
| S-18 | Rate limits at every write | QA and Security | planned | | |
| S-19 | Clickjacking and framing | QA and Security | planned | | |
| S-20 | Security headers verified live on all three hosts | QA and Security | planned | | |
| S-21 | Subdomain hygiene | QA and Security | planned | | |
| S-23 | No email address is ever shown as a name or to a person who should not see it (found live on the Hub Members list and Overview) | QA and Security | tested | CHANGELOG "HB1 display-name data fix applied" (2026-11-14): data fixed and constraint validated in production, live page checked; the e2e name-position test and E11 remain, so not `verified` | 2026-11-14 |
| S-22 | A coordinated-disclosure door | QA and Security | planned | | |
| S-30 | 30-day device sessions are rotating, single-use and revocable | QA and Security | planned | | |
| S-31 | Step-up for dangerous actions | QA and Security | planned | | |
| S-32 | Staff accounts are protected | QA and Security | planned | | |
| S-33 | KpnIdentity hardened | QA and Security | planned | | |
| S-34 | Supabase key generations | QA and Security | planned | | |
| S-35 | Founder and operator accounts have two-factor | QA and Security | planned | | |
| S-40 | A grant needs a matching intent, paid status, USD and an equal subtotal; metadata never trusted | QA and Security | planned | | |
| S-41 | Webhooks are verified and idempotent | QA and Security | planned | | |
| S-42 | No double purchase | QA and Security | planned | | |
| S-43 | Refund and dispute paths work | QA and Security | planned | | |
| S-44 | Test artefacts removed | QA and Security | planned | | |
| S-45 | Radar and 3-D Secure on | QA and Security | planned | | |
| S-46 | Taxes | QA and Security | planned | | |
| S-47 | Billing release is armed and audited, never automatic | QA and Security | planned | | |
| S-50 | Secrets are not in the repository or its history | QA and Security | planned | | |
| S-51 | Least privilege on tokens | QA and Security | planned | | |
| S-52 | Dependencies are clean and pinned | QA and Security | planned | | |
| S-53 | `main` is protected enough | QA and Security | planned | | |
| S-54 | Cloudflare account safety | QA and Security | planned | | |
| S-55 | Bot protection | QA and Security | planned | | |
| S-56 | Pen-test pass | QA and Security | planned | | |
| S-60 | Backups and a rehearsed restore | QA and Security | planned | | |
| S-61 | Monitoring and alerts | QA and Security | planned | | |
| S-62 | Email deliverability and suppression | QA and Security | planned | | |
| S-63 | Load and soak | QA and Security | planned | | |
| S-64 | Rollback is rehearsed | QA and Security | planned | | |
| S-65 | Incident response | QA and Security | planned | | |
| S-66 | Status page | QA and Security | planned | | |
| S-67 | Data migrations are safe | QA and Security | planned | | |
| S-70 | Abuse handling works end to end | QA and Security | planned | | |
| S-71 | Illegal content process | QA and Security | planned | | |
| S-72 | Minors | QA and Security | planned | | |
| S-73 | Legal documents are real | QA and Security | planned | | |
| S-74 | Accessibility statement | QA and Security | planned | | |
| S-75 | Contact points work | QA and Security | planned | | |

## Drills (`04_` section 10)

| ID | Status | Evidence | Last update |
| --- | --- | --- | --- |
| DR-01 | planned | | |
| DR-02 | planned | | |
| DR-03 | planned | | |
| DR-04 | planned | | |
| DR-05 | planned | | |
| DR-06 | planned | | |
| DR-07 | planned | | |
| DR-08 | planned | | |
| DR-09 | planned | | |
| DR-10 | planned | | |
| DR-11 | planned | | |
| DR-12 | planned | | |
| DR-13 | planned | | |
| DR-14 | planned | | |

## UI and UX (week 4)

The per-route ledger is `docs/frontend/design-research/UPGRADE_LEDGER.md` (every route, before and after). The SaaS design hunt is
`docs/frontend/design-research/SAAS_SITE_HUNT_PLAN.md`.

| ID | Item | Owner | Status | Evidence | Last update |
| --- | --- | --- | --- | --- | --- |
| UI-1 | Design hunt: 500 SaaS sites captured and annotated | Design | planned | | |
| UI-2 | Pattern Atlas and the 40 chosen patterns approved by the founder | Design | planned | | |
| UI-3 | Upgrade ledger audited (every route has a before capture and a defect list) | Design | planned | | |
| UI-4 | Token proposals T-1 to T-7 approved | Design | planned | | |
| UI-5 | Shared patterns built (page header, stat grid, forms, empty states) | UI-refresh | planned | | |
| UI-6 | Tier A screens redesigned | UI-refresh | planned | | |
| UI-7 | Every ledger route reviewed and fixed | UI-refresh | planned | | |
| UI-8 | Accessibility, performance and G4 acceptance | QA | planned | | |
