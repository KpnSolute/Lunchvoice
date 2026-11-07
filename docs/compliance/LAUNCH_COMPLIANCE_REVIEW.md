# LunchVoice v2 launch compliance review

- **Reviewer:** compliance agent (review only; no product code changed)
- **Date:** 2026-11-07
- **Scope:** the plan in `docs/v2/LAUNCH_PLAN.md` (migrations 000014-000016, billing webhook, Quick Surveys,
  whitelist, shadcn UI) and the code at commit `27c83bd` on `claude/wizardly-meitner-wohkzr`.
- **Not legal advice.** Items about law (privacy notices, COPPA, FERPA, state student-privacy law, payments) are
  risks for the founder to take to counsel. They are not statements of what the law requires.

## 1. Summary verdict

**Not ready to launch. 1 BLOCKER and 7 HIGH findings are open.**

The base is strong. Every `security definer` function pins `search_path = ''`. No table in `lv` is granted to
`anon`, `authenticated` or `service_role`. Authorization uses the Hub id, never the slug. Hub slug claims are safe
under concurrency (the slug race test passes). The canonical suite passes from an empty database
(`356 checks, 0 failed`, with the rollback rehearsed). No customer name is hardcoded in product code. Campaign Plus
has no invented price, and no secret is in the tree.

The blocker is the core privacy promise. On a small anonymous Campaign the published analytics let anyone with
`analytics.read` recover the exact counts the platform says it withholds. This was reproduced (see LC-01). The
marketing pages, the Player and the Privacy page all promise that withheld cohorts stay withheld, so this must be
fixed before real people answer.

A whitelist-only launch can go ahead once these are closed: LC-01; the HIGH findings LC-02 to LC-07; and LC-08 in its
minimum form, meaning a real privacy notice and a contact address for the people who sign in to the whitelist.

| Severity | Count |
| --- | --- |
| BLOCKER | 1 |
| HIGH | 7 |
| MEDIUM | 21 |
| LOW | 12 |

Evidence gathered (all read-only, against throwaway local containers only):

- `bash scripts/db-test-canonical.sh`: PASS, 356 checks, slug race 1 winner and 1 `lv_conflict`, rollback rehearsed.
- Catalog audit (queries in section 4.2) on a fresh install of 000001-000013:
  - 0 definer functions without `search_path=''`;
  - 0 `lv` table grants and 0 `lv` function grants to the API roles;
  - RLS is off on all 26 `lv` tables;
  - `anon` can execute all 44 `lv_api` functions;
  - `service_role` has no usage on `lv`.
- `npm run check:names`: clean (it scans `src/` only). `npm run check:brain`: in sync.
- `npm run build` + `npm run check:bundle`: pass. The bundle has no mock markers and no `service_role` or
  `sb_secret_` strings.
- `npm audit`: 8 findings (6 moderate, 2 low, 0 high). The findings are in `react-router` 6.30.6 and in the
  `shadcn` CLI's dependency tree.

## 2. Findings

Owner: **backend** = `supabase/`, `docs/backend/`; **UI** = `src/`, `public/`, `render.yaml` headers; **founder** = a
product or legal decision; **governing** = integration or runbook.

### BLOCKER

| ID | Sev | Area | File:line | Finding | Required fix | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| LC-01 | BLOCKER | Privacy / analytics | `supabase/migrations/000013_v2_analytics.sql:100-110,141-173`; `000005_v2_privacy_analytics.sql:56-94` | **The published aggregates let anyone recover the suppressed cells.** Reproduced on an anonymous rating Campaign with `min_cohort=5`, where 5 people answered "5" and 1 answered "1". Both cells come back `suppressed`, but `lv_analytics_overview` still returns (a) the cell **keys** `1` and `5`, (b) `participant_count.n = 6` and (c) `rating_summary` `n = 6, mean = 4.33`. Solving 5a + b = 26 with a + b = 6 gives exactly 5x"5" and 1x"1". Without the mean the bounds alone are enough: the primary cell is below 5, the complementary cell is 5 or more, and they sum to 6, so the split can only be (1, 5). Every required question has n equal to the participant count, so the sum of the suppressed cells is always known. | Rule: no published statistic may let a suppressed cell be derived. Minimum fix: (1) when any cell of a question is suppressed, suppress that question's `rating_summary` (mean and n); (2) show suppressed cells in an anonymous Campaign as one merged "withheld" bucket with no per-key presence, or always return every configured option so that presence reveals nothing; (3) require the suppressed set to sum to at least `min_cohort` and never let it be pinned by bounds (for example suppress at least 2 cells and, when the remainder is below 2 x `min_cohort`, suppress the whole question); (4) apply the same engine to `lv_analytics_export` (planned). Add SQL tests for the case reproduced here (section 4.3). | backend |

### HIGH

| ID | Sev | Area | File:line | Finding | Required fix | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| LC-02 | HIGH | Privacy / analytics | `000013_v2_analytics.sql:112-125,141-157` | **A unanimous or full-turnout result reveals individual answers.** `participation_rate` publishes `n` and `eligible_n`. When n = eligible_n (everyone answered) and one cell holds all n, every member's answer is known. The same happens to any subgroup when a cell equals n. Cohort suppression does not cover this "homogeneity" case. | For anonymous Campaigns, withhold or round a cell whose n equals the question total (a dominance rule), and do not publish `participation_rate` when it is 100% or when `eligible_n - n` is below `min_cohort`. State the rule in `API_CONTRACT.md`. | backend |
| LC-03 | HIGH | Privacy / representations | `src/pages/Player.tsx:155-156`; `000004_v2_participation.sql:125-127`; `src/pages/Marketing.tsx:44-48,241-249` | **The Player makes false privacy and UX promises.** For a member Campaign that is anonymous it says "No name, no login, no email." Member Campaigns require sign-in, and the account's email is cached (`000001_v2_core.sql:75,233`). It also says "Every question is optional", but `lv.validate_answers` rejects any missing answer. The FAQ and Privacy copy say an anonymous answer "cannot be resolved". That is true for creator tools only after LC-01 and LC-02 are fixed, and is not true for operators (LC-09). Inaccurate privacy claims are a consumer-protection risk. | Make the copy match the behaviour: "Hub managers see totals only, never who answered. You may need to sign in to prove you are eligible." Either make questions optional in the backend or remove "Skip anything". Scope the Privacy text to "people who run the Hub", and describe operator access honestly. | UI (copy), backend (if optional answers) |
| LC-04 | HIGH | Security / headers | `render.yaml:1-20`; `src/identity/IdentityProvider.tsx:36-56`; `index.html:16-26` | **No CSP or security headers, and the bearer session sits in `localStorage`.** Any XSS (including XSS in a dependency) can read `lv.session`, a 1-hour LunchVoice JWT, and act as the user. `render.yaml` sets no `headers`. Missing: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `frame-ancestors`. The inline theme script in `index.html` needs a CSP hash. | Add a `headers:` block to `render.yaml` for `/*`, with at least: `default-src 'self'; script-src 'self' 'sha256-<theme script>'; connect-src 'self' https://<project>.supabase.co https://auth.kpnsolute.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://auth.kpnsolute.com`, plus `HSTS max-age=31536000; includeSubDomains`, `nosniff`, `Referrer-Policy: no-referrer` (codes sit in paths, see LC-21) and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. If the Player is ever embedded, relax `frame-ancestors` only for an embed route. Consider holding the session in memory with a short refresh. | UI, founder (embedding) |
| LC-05 | HIGH | Security / grants | `000006_v2_platform.sql:415-416`; `000007:332`; `000008:219`; `000010:543`; `000011:359`; `000012:206`; `000013:225` | **Every migration grants every `lv_api` function to `public`.** Each one ends with `grant execute on all functions in schema lv_api to public`, so `anon` can execute all 44 functions (catalog audit A7). Today each function checks the caller itself, but the pattern fails open. The plan's service-role-only billing path (`lv.billing_apply_event`, A-03) is safe in `lv`. Any `lv_api` wrapper for it, or any admin-only `lv_api` function, would be re-granted to the public by the next migration that repeats the line. | From 000014 on: drop the blanket grant. `revoke execute on all functions in schema lv_api from public`, then grant per function. `anon` gets only the signed-out surface (`lv_hub_get`, `lv_guest_campaign_get`, `lv_guest_submit`, `lv_capability_catalog`, `lv_plan_limits`, `lv_whitelist_status`, `lv_hub_reservation_status`); everything else goes to `authenticated`. Never expose a service-role function in `lv_api` without `revoke ... from public, anon, authenticated` and a check of `current_user`/`request.jwt.claims->>'role' = 'service_role'` inside it. Add a test that fails if `anon` can execute anything outside the allow-list. | backend |
| LC-06 | HIGH | Privacy / authorization (plan A-01) | `000001_v2_core.sql:95-103`; `000004_v2_participation.sql:169-172`; `000006:252-270`; `000010:336-369` | **The personal space reuses community Hub paths.** A Quick Survey lives in a `lv.hubs` row with `kind='personal'`. Every Hub-scoped operation will accept that Hub id unless each one is changed: `lv_invite_create`, `lv_hub_join`, the role and member operations, and the planned `lv_hub_update`, `lv_hub_pages_*`, `lv_owner_transfer`, `lv_discover_apply`, reservation and checkout. Someone could then gain membership in another person's personal space and see its Quick Surveys. In addition, `lv.submit_response` requires an accepted membership. The easy way to let invited Quick Survey respondents answer would be to make them members, which would count them as members and make them visible in member lists. The plan also says "no slug", but `slug` is `NOT NULL` with format, length and reserved-name constraints. | In 000014: a single helper `lv.require_community(p_hub)` called by every Hub-scoped body. Quick Survey eligibility comes from campaign invites (a new table) or guest keys, never from `hub_memberships`. Make `slug` nullable only when `kind='personal'` (a CHECK constraint), and never list or route personal Hubs. Tests: each Hub-scoped `lv_api` called with a personal-space id returns `lv_not_found`. | backend |
| LC-07 | HIGH | Operations / production | `docs/backend/PRODUCTION_RESET_RUNBOOK.md:17,28,146-155` | **The production runbook is stale.** It says to apply `000001` to `000008` only, so 000010-000016 would be missed. It has no step to: set the launch policies (`campaign.min_cohort=5`, `participation.guest_rate_per_minute=10`, max-active and entitlement values); import the LunchVoice session public key into the project's JWT signing keys; set Edge Function secrets (`KPNIDENTITY_*`, `LV_SESSION_PRIVATE_JWK`, `LV_ALLOWED_ORIGINS`, later `STRIPE_WEBHOOK_SECRET`); disable Supabase Auth sign-ups on the LunchVoice project; or re-run the grant and RLS audit (section 4.2) against production after applying. | Update the runbook to "apply every `0000NN_v2_*.sql` in order", add the policy, key, secret and post-apply audit steps, and record which approval covers 000014-000016. | backend, governing |
| LC-08 | HIGH | Legal surface | `src/pages/Marketing.tsx:209-253,255-269` | **No real privacy notice or contact before real people sign in.** The whitelist launch collects identity claims (email, name, picture: `000001:75-78`), an optional contact email, survey answers and guest answers. The Privacy page is a placeholder. The Support page says no contact channel exists. Many US state laws (for example California's CalOPPA) expect a conspicuous privacy policy wherever personal information is collected online. Section 5 lists the required contents. | Before the whitelist opens: a minimum reviewed privacy notice (section 5), a working contact address for privacy and support, and a notice at the whitelist form (the plan already requires it). The full Terms can wait for public sign-ups. | founder, UI |

### MEDIUM

| ID | Sev | Area | File:line | Finding | Required fix | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| LC-09 | MEDIUM | Privacy / at-rest linkage | `000004:16-45,189-202`; `000008:194-216` | **Anonymity holds for creator tools only, not for anyone with database access.** `participation.created_at` keeps full precision, while submissions are coarsened to the day. The two rows are inserted in the same order in the same transaction, so heap order (`ctid`) and day-level timestamps can link them for an operator, a `service_role` holder or a backup reader, especially on low-volume days. | Document the boundary honestly (LC-03). Reduce linkage: coarsen `participation.created_at` to the day for anonymous Campaigns; insert submissions in a randomised or batched order, or store them in a separate table with no ordering signal; never export row-level data. The planned export must stay aggregates-only (LC-01). | backend |
| LC-10 | MEDIUM | Security / join codes | `000003_v2_campaigns.sql:64-77`; `000012:64-71,94-119` | **Join codes are short, use a non-cryptographic generator, and can be enumerated.** They are 6 characters from a 32-character alphabet (about 1.07e9 values) generated with `random()`, and `lv_guest_campaign_get` works signed out with no rate limit. Quick Survey "anyone with the link" access will rest on the code alone. | Generate codes from `lv.random_bytes`. Give links and QR codes a separate 128-bit token, and keep the 6-character code for typing only, behind a rate limit at the edge or in the database. Return the same answer for unknown and closed codes (already the case). | backend |
| LC-11 | MEDIUM | Integrity / guests | `000012:140-168`; `src/pages/Player.tsx:17,215-224` | **Guests are only deduplicated by a key they choose.** A new key gives a new submission, up to `guest_rate_per_minute` (10) per Campaign, which is about 14,400 per day. The same cap lets one attacker block every real guest (denial of service). The guest key comes from `Math.random`. | Disallow guests for election and high-integrity modes (the spec allows that). Show "guest responses are not deduplicated" to creators. Add an edge per-IP limit or a challenge. Generate the key with `crypto.getRandomValues`. Consider a per-Campaign guest total by default. | backend, UI, founder |
| LC-12 | MEDIUM | Identity | `000001_v2_core.sql:162-196`; `supabase/functions/_shared/session.ts:133-147` | **The database cannot tell a LunchVoice session from a raw KpnIdentity token.** The session token reuses KpnIdentity's `iss`, and `lv.caller_identity()` checks neither `aud` nor `session_kind`. If KpnIdentity were ever added as third-party auth on this project, or its tokens were otherwise accepted by PostgREST, a token minted for another KpnSolute app would sign in here. | In `lv.caller_identity()`, require `aud = 'authenticated'` and `session_kind = 'lunchvoice'`. Document in `IDENTITY_CONTRACT.md` and the runbook: never configure KpnIdentity as third-party auth on the LunchVoice project. | backend |
| LC-13 | MEDIUM | Identity | `supabase/functions/session/index.ts:30-34`; `_shared/session.ts:103,118` | **The nonce check does not stop a stolen ID token being replayed.** The client sends both the ID token and its nonce, and the nonce can be read from the token itself, so a stolen ID token (within its expiry) can be exchanged for a session. | Bind the nonce server-side: an httpOnly cookie or a server-stored nonce, or keep a short-lived single-use `jti` table. At minimum, refuse ID tokens older than a few minutes (`iat` check). | backend |
| LC-14 | MEDIUM | Security / redirect | `src/lib/kpnIdentity.ts:68-70`; `src/pages/Public.tsx:169-170`; `package-lock.json` (`react-router` 6.30.6) | `safeReturnTo` accepts `/\evil.example`, and `npm audit` reports a react-router open-redirect advisory for backslash paths in `navigate`. Together they give an open-redirect chain after sign-in. | Reject `\`, control characters and percent-encoded slashes. Allow only the app's own route patterns. Upgrade react-router to a fixed release. | UI |
| LC-15 | MEDIUM | Privacy / device storage | `src/pages/Player.tsx:39,53-63,215-224` | Unsent answer drafts (`lv-draft-*`) and guest keys stay in `localStorage` indefinitely. On shared school or kiosk devices the next person can read a previous person's unsent anonymous answers, and they reuse that person's guest key (their own submission returns `duplicate`). | Use `sessionStorage`, or expire drafts after a short time. Offer "This is a shared device". List every storage key in the privacy notice (section 5). | UI |
| LC-16 | MEDIUM | Privacy / account deletion (plan) | `000001_v2_core.sql:99,141-149`; `000004:20,41`; `000006:298-308` | **Planned `lv_account_delete` gaps.** Participation cascades, which changes the frozen population, so released anonymous results become permanently withheld. Identified submissions are kept with `account_id` set to NULL. Audit `target` and `detail` keep account ids as text. Whitelist rows and the contact email must be deleted. The KpnIdentity person is not deleted. Backups keep data. | Decide and document what deletion means: either keep participation rows de-identified rather than delete them, or recompute the population. Delete or de-identify identified answers per the founder's decision. Erase whitelist and contact email. Disclose what KpnIdentity and backups retain. Test it end to end. | backend, founder |
| LC-17 | MEDIUM | Privacy / retention | `000001:141-150`; `000005:29-37`; `000012:36-48` | **No retention policy anywhere.** `audit_events`, `analytics_query_log`, `guest_participation` (key hashes), beta and whitelist records and cached identity attributes are kept forever. | The founder sets retention periods (section 6). Backend adds a purge job or documents the manual procedure, and the privacy notice states the periods. | founder, backend |
| LC-18 | MEDIUM | Privacy / whitelist (plan L-03) | `docs/v2/LAUNCH_PLAN.md` (Whitelist) | The optional contact email and free-text `p_note` are new personal data with no stated purpose, notice or lifecycle. The token email already exists, which makes a second email unnecessary unless there is a reason for it. | Store it in its own table, never as a key and never for linking. Show a notice at collection (purpose: launch updates only). Delete it with the account and when the whitelist ends. Add an unsubscribe path. Do not collect it unless it is needed. Cap and plainly label `p_note`. Admission must be atomic (an advisory lock, or a unique seat number 1..50 under a constraint), with a race test like the slug race. | backend, UI |
| LC-19 | MEDIUM | Payments (plan A-03) | planned `supabase/functions/billing-webhook/` | **The Stripe webhook has to meet these requirements before it is merged.** | Verify `Stripe-Signature` (v1 HMAC-SHA256 over `t.payload`) with a constant-time compare and a timestamp tolerance of 300 s or less. Return 503 when `STRIPE_WEBHOOK_SECRET` is unset. Read the raw body before parsing. Make it idempotent on `(provider, event_id)` with a unique constraint. Use the service role only server-side, through one narrow function. Do not log payloads or secrets. Map only known event types and ignore the rest with 2xx. Grants must be additive and must never delete data. Expiry must fail closed for premium actions only. Add tests: bad signature, stale timestamp, replay, unset secret. | backend |
| LC-20 | MEDIUM | Payments / grants | catalog audit A6; LAUNCH_PLAN A-03 | `service_role` has no `USAGE` on `lv`, and PostgREST exposes only `lv_api`. The planned grant path needs either a direct database connection from the Edge Function or a narrowly granted wrapper. There is a risk someone exposes `lv` or grants broadly to make it work. | Grant `usage on schema lv` and `execute on lv.billing_apply_event` only, both to `service_role`, and nothing on tables. Alternatively, put a single `lv_api` wrapper behind LC-05's per-function grants. Test that `anon` and `authenticated` cannot call it. | backend |
| LC-21 | MEDIUM | Privacy / URLs | `src/main.tsx:52,58` | Invite codes (`/j/:code`) and join codes (`/c/:joinCode`) sit in URL paths, so they land in Render access logs, browser history and shared screenshots. The `Referer` header is the remaining leak path once LC-04 adds `no-referrer`. | Use `Referrer-Policy: no-referrer` (LC-04). Move invite codes to the URL fragment, or exchange them on landing and then `replaceState`. Note the logging in the privacy notice. | UI |
| LC-22 | MEDIUM | Security / step-up (plan) | `LAUNCH_PLAN.md` (`lv_owner_transfer`, `lv_hub_delete`, `lv_account_delete`); spec: owner transfer needs strong reauth | Typed confirmation is the only guard on irreversible operations. Any stolen 1-hour session (see LC-04) can delete a Hub and its respondents' data or transfer ownership. | Require recent authentication (session `iat` within about 5 minutes, or re-sign-in) for owner transfer, Hub delete and account delete. Write an audit event for each. | backend, UI |
| LC-23 | MEDIUM | Rules / one entitlement map | `src/pages/Pricing.tsx:10-16,89-90,125-126`; `src/pages/Hub.tsx:658-666`; `src/config/pricing.ts` | Prices and limits are hardcoded in three UI places, separately from the planned `lv.plan_limits` and `lv_plan_limits()`. Team overall active Campaigns shows "Not published" while A-04 provisionally sets 15. | Render limits and prices from `lv_plan_limits()`, with `src/config/pricing.ts` as copy only. Show provisional values as provisional (`note`). Never show a Campaign Plus price. | UI |
| LC-24 | MEDIUM | Rules / reserved slugs | `src/main.tsx:37-38`; `src/lib/reservedSlugs.ts:3-17`; `000006:18-31`; `000007:18-38` | **Top-level routes are claimable as Hub slugs.** `how-it-works` and `use-cases` are valid slugs reserved in neither list, so a Hub with that slug would be shadowed and unreachable. The planned `whitelist` (and any Quick Survey route such as `quick` or `q`) is not reserved. `signup` is reserved only in the database. The UI list is hand-copied. | 000014: reserve `how-it-works`, `use-cases`, `whitelist`, every new top-level route, and `quick`/`quick-surveys` if used. Generate the UI list from `src/config/routes.json` and add a test that every top-level route of 3 or more characters is in `lv.reserved_slugs` (section 4.4). | backend, UI |
| LC-25 | MEDIUM | Launch config | `render.yaml:14-20`; `src/lib/kpnIdentity.ts:32-37` | `VITE_KPNIDENTITY_ISSUER` and `VITE_KPNIDENTITY_CLIENT_ID` are not declared in `render.yaml`, so a production build silently has sign-in "not configured" unless they are set by hand in the dashboard. | Declare them with `sync: false`. Add a production-build check that fails when they are missing. | UI, governing |
| LC-26 | MEDIUM | Abuse / acceptable use (plan) | `LAUNCH_PLAN.md` (Quick Surveys free, link + guests) | **Free Quick Surveys can be used for phishing.** Free, link-shared, LunchVoice-branded surveys with free-text questions are a phishing vehicle ("enter your password"). There is no report or takedown path. | Founder: an acceptable-use policy in the Terms, a "Report this survey" link in the Player, and an operator disable path (an admin-only function). Consider blocking common credential prompts in question text. | founder, backend, UI |
| LC-27 | MEDIUM | Privacy / slug reuse (plan A-05) | `LAUNCH_PLAN.md` A-05; `000001:101` | **A deleted Hub's slug can be claimed again at once.** Old posters, QR codes and links (`lunchvoice.com/{slug}`) would then lead people to a new owner, which allows impersonation. No data leaks, because the cascade deletes it and a new Hub id is created. | Hold a deleted Hub's slug for a cooling-off period (for example, the reservation's 25-day grace) before release. | founder, backend |
| LC-28 | MEDIUM | Minors (risk only) | `src/pages/Marketing.tsx:91`; `src/pages/Landing.tsx:86` | Schools are marketed as a use case. Sign-in goes through Google, and guests answer with no account at all, so children may respond. Risks for counsel: COPPA (under-13 users and verifiable parental consent; whether free-text answers are "personal information"); FERPA (whether LunchVoice acts as a "school official" for a school's records and needs a written agreement); state student-privacy laws (for example California SOPIPA, New York Ed Law 2-d), which often need a data-processing agreement. | Founder decides on an age gate or an "audience is 13+" rule, on school terms or a DPA template, and on whether to drop the "Schools" marketing until that is decided. The privacy notice gets a children's section. | founder |
| LC-29 | MEDIUM | Security / RLS defence in depth | catalog audit A3 (all 26 `lv` tables) | RLS is disabled on every `lv` table. They are not exposed (no schema usage, no grants), so this meets the AGENTS.md rule for exposed tables. However, one mistaken `grant` or exposed-schema change would expose them with no row filter. | `alter table lv.* enable row level security` with no policies, so definer functions owned by the table owner keep working. Add a test that RLS is on for every `lv` table. | backend |

### LOW

| ID | Sev | Area | File:line | Finding | Required fix | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| LC-30 | LOW | Build guard | `scripts/check-bundle.mjs:12-15` | Forbidden markers cover mock code only, not secrets. | Add `service_role`, `sb_secret_`, `"d":"` (private JWK), `sk_live_`, `sk_test_` and `whsec_` to the forbidden markers. | UI |
| LC-31 | LOW | Rules / names | `scripts/check-customer-names.mjs:64`; `supabase/tests/08_error_contract.sql:42-52` | The names check scans `src/` only. A database test creates a Hub with slug `lioncafe`, which is a fixture by AGENTS.md's wording. Its intent is to prove the name is not reserved, which the `07_read_api.sql:45` assertion already covers. | Rename the fixture to `acme-test`. Extend the check to `supabase/` code, excluding the explicit not-reserved assertion. | backend |
| LC-32 | LOW | Dependencies | `package-lock.json` | `npm audit`: react-router (moderate; see LC-14), plus shadcn CLI dependencies (deepmerge, minimatch, ts-morph), which are dev-only. | Upgrade react-router. Keep `shadcn` in devDependencies only (it is). | UI |
| LC-33 | LOW | Session lifecycle | `src/identity/IdentityProvider.tsx:211`; `_shared/session.ts:129` | Sign-out only clears local state. A session cannot be revoked for up to 1 hour, including after account deletion. | Accept and document this, or add a `session_epoch` per account that is checked in `caller_identity`. | backend |
| LC-34 | LOW | Legal placeholders | `src/pages/Marketing.tsx:212-216,235` | The placeholder wording is "Draft. Pending legal review", not the plan's "Legal text pending review". The Terms say Hub creation is always paid, which conflicts with free Quick Surveys and the whitelist grant. | Use the plan's exact placeholder string and correct the facts. | UI |
| LC-35 | LOW | Accessibility | `src/pages/Public.tsx:74` | There is no "skip to content" link (WCAG 2.4.1). | Add a skip link to `#main`. | UI |
| LC-36 | LOW | Accessibility | `src/index.css:150-153`; `src/styles/system.css:155` | The focus ring uses `outline: none` with a box-shadow, which disappears in forced-colors (high contrast) mode (WCAG 2.4.7 and 1.4.11). | Add `outline: 2px solid transparent` or a `@media (forced-colors: active)` outline. | UI |
| LC-37 | LOW | Accessibility | `src/ui/BottomTabs.tsx:50-51` | The sheet has `role="dialog"` but no `aria-modal`, focus trap or focus return. The scrim is a clickable `div`. | Use the shadcn/Radix `Dialog`/`Sheet`, which handles all of these. | UI |
| LC-38 | LOW | Analytics display | `src/pages/Campaigns.tsx:429` | `n ?? 0` in the not-suppressed branch would show 0 if the contract drifted (n null with suppressed false). | Render "Withheld" whenever `n === null`. | UI |
| LC-39 | LOW | Docs accuracy | `000006_v2_platform.sql:262` | The comment says "80 random bits", but the code generates 128 bits as hex. | Fix the comment. | backend |
| LC-40 | LOW | CI supply chain | `.github/workflows/*.yml` | Actions are pinned by tag (`@v4`), not by commit SHA. | Pin to SHAs. | governing |
| LC-41 | LOW | Privacy / minimisation | `000004:47-55`; `000013:132-138` | Free-text answers are collected but can never be published. Respondents are not told who, if anyone, can read them. | Either say "Free-text answers are stored and not shown to anyone yet", or do not offer free text until a publishing policy exists. | founder, UI |

## 3. Status of required controls (current code)

| Control | Status | Evidence |
| --- | --- | --- |
| Definer functions pin `search_path = ''` | PASS | Audit A1 and A2: 0 rows |
| Authorization before data access in definer functions | PASS (sampled every `lv_api` body) | e.g. `000011:86-97` `managed_campaign`, `000013:193-198` |
| No client grants on `lv` | PASS | Audit A4 and A5: 0 rows; `lv` usage false for all API roles |
| RLS on exposed tables | N/A (no exposed tables); see LC-29 | Audit A3, A9 (no views) |
| `lv_api` grants minimal | FAIL | LC-05 |
| No slug-based authorization | PASS | `000007:143-160` resolves slug to id, then checks membership by id |
| Slug claim concurrency | PASS | db-test slug race |
| Whitelist 50-seat race, credit consumption | NOT BUILT; see LC-18 and checklist 4.5 | – |
| Session function: issuer allow-list, audience, alg | PASS; nonce weak (LC-13), aud not rechecked in the database (LC-12) | `_shared/session.ts:106-118` (ES256/RS256 only, issuer, audience) |
| CORS `LV_ALLOWED_ORIGINS` | PASS (exact-match list; no credentials) | `session/index.ts:5-18` |
| Mock code absent from production bundle | PASS | `check:bundle` |
| Service-role key absent from frontend | PASS | grep of `dist/` |
| CSP and headers | FAIL | LC-04 |
| Anonymous: no stored FK join | PASS | `000004:65-104` triggers |
| Anonymous: timestamps | PARTIAL | LC-09 |
| Withheld never zero (backend) | PASS | `000005:84-90` returns `n: null` |
| Suppression cannot be inverted | FAIL | LC-01, LC-02 |
| Guests not members and not in thresholds | PASS | `000012:173-181` (no membership); `000013:26-36` (members only) |
| Owner protected and not a custom slot | PASS | `000002:97-174`; `000010:164,200` |
| No invented prices; Campaign Plus null | PASS (UI); backend not built | `src/pages/Pricing.tsx:135-142` |
| No LionCafe/MJCC in product code | PASS (one test fixture, LC-31) | `check:names`; grep |
| No v1 bridges | PASS | no `public.*` references in migrations |

## 4. Reusable re-review checklist (integrated branch)

Run all of this from the repository root against a **throwaway** container. Never point it at production. A check
passes only when its expected result holds.

### 4.1 Repository checks

```bash
npm run check:brain && npm run check:names && npm run check:routes
npm run test:pr                         # build + bundle smoke check
npm audit --audit-level=high            # expect exit 0
bash scripts/db-test-canonical.sh       # expect PASS, 0 failed, rollback rehearsed
# secrets and dev code in the bundle (expect no output)
grep -l -E 'service_role|sb_secret_|sk_live_|sk_test_|whsec_|"d":"' dist/assets/*.js
grep -l -E 'Sign in \(simulated\)|mock-account|createMockTransport' dist/assets/*.js
# customer names outside policy prose (expect only policy statements and the not-reserved assertion)
grep -rIn -i -E 'lion ?cafe|\bmjcc|miami|job ?corps' supabase/ src/ public/ index.html render.yaml
# invented price for Campaign Plus (expect no numeric price next to Campaign Plus or campaign_plus)
grep -rn -i -E 'campaign.?plus.{0,80}\$[0-9]|campaign_plus.{0,80}[0-9]{3,}' src supabase
# Stripe webhook (once it exists): signature, tolerance, constant-time, fail-closed, no payload logs
grep -n -E 'constructEvent|timingSafeEqual|tolerance|STRIPE_WEBHOOK_SECRET|503' supabase/functions/billing-webhook/*.ts
grep -n -E 'console\.(log|info|debug)\(.*(body|payload|event)' supabase/functions/billing-webhook/*.ts   # expect none
# headers present
grep -n -A30 '^ *headers:' render.yaml | grep -E 'Content-Security-Policy|Strict-Transport-Security|Referrer-Policy|X-Content-Type-Options|frame-ancestors'
```

### 4.2 Catalog audit (run after applying every migration plus `supabase/tests/setup.sql`)

```sql
-- A1 definer functions without search_path=''  (expect 0 rows)
select n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('lv','lv_api') and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'], false);
-- A3 lv tables without RLS  (expect 0 rows once LC-29 is fixed)
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='lv' and c.relkind in ('r','p') and not c.relrowsecurity;
-- A4 any table privilege for API roles on lv  (expect 0 rows)
select grantee, table_name, privilege_type from information_schema.role_table_grants
 where table_schema='lv' and grantee in ('anon','authenticated','PUBLIC');
-- A5 lv functions executable by API roles  (expect only lv.billing_apply_event for service_role)
select p.proname, r from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
       unnest(array['anon','authenticated','service_role']) r
 where n.nspname='lv' and has_function_privilege(r, p.oid, 'execute');
-- A7 lv_api functions executable by anon  (expect exactly the signed-out allow-list in LC-05)
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='lv_api' and has_function_privilege('anon', p.oid, 'execute') order by 1;
-- A8 every lv_api function is security definer  (expect 0 rows)
select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='lv_api' and not p.prosecdef;
-- A9 views must be security_invoker  (expect 0 rows)
select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('lv','lv_api') and c.relkind='v' and not coalesce(c.reloptions @> array['security_invoker=on'], false);
-- A10 launch policies set (expect min_cohort 5, guest rate 10, no NULL on a launch path)
select key, value from lv.policy where value is null or key in ('campaign.min_cohort','participation.guest_rate_per_minute');
-- A12 no customer name reserved or seeded  (expect 0 and 0)
select count(*) from lv.reserved_slugs where slug ~ '(lion|mjcc|miami|corps)';
select count(*) from lv.hubs where slug ~ '(lion|mjcc|miami|corps)';
-- A14 Campaign Plus price stays NULL  (expect price null and checkout unavailable)
select * from lv.plan_limits where family='team' and key ~ 'price';   -- adapt to the 000014 shape
-- A15 every Hub-scoped lv_api refuses personal spaces (LC-06): call each with a kind='personal' id; expect lv_not_found
```

### 4.3 Privacy regression tests (add them to `supabase/tests/`; they must pass)

1. **Inversion (LC-01).** Anonymous rating question, `min_cohort=5`, 5 answer "5" and 1 answers "1", then close.
   Expect: no published combination of `participant_count.n`, `rating_summary`, cell keys and visible cells
   determines the suppressed counts. In practice, `summary.mean` is null whenever any cell is suppressed, and
   suppressed keys are not individually listed.
2. **Bounds.** Single choice with totals 6, 7 and 9 and one small cell. The suppressed counts must not be uniquely
   solvable from `n` and `min_cohort`.
3. **Homogeneity (LC-02).** 5 eligible members, all answer "No". Expect the cell or the rate to be withheld.
4. **Live and paused.** An anonymous Campaign that is active or paused returns `lv_policy_undecided` (this exists today).
5. **Population change.** Results are withheld after a late guest, and after an account deletion (LC-16 decision).
6. **Export (planned).** `lv_analytics_export` output equals the released `lv_analytics_overview` cells: no
   suppressed n, no row-level data, no timestamps finer than the day, no free text, and it is refused on the free
   family.
7. **Guests.** A guest submission creates no `hub_memberships` row, leaves `member_count`, `participation_rate.eligible_n`
   and survey thresholds unchanged, and a guest cannot read any Hub page or Campaign other than the one for its code.
8. **Quick Survey invite-only.** A respondent who redeems a campaign invite gets no `hub_memberships` row in the
   personal space. The invite list does not show which invitee responded to an anonymous survey.
9. **Withheld is never zero in the UI.** Grep and review: `grep -rn '?? 0\||| 0' src/pages src/components`. Every hit
   must be a count of the user's own rows, never an analytics value. Never pass response timestamps of an anonymous
   Campaign to `dailyTrend` (`src/components/charts.tsx:6`).

### 4.4 Rules and routes

```bash
# every top-level route of 3+ characters must be in lv.reserved_slugs (expect empty output)
grep -oE 'path="[a-z][a-z0-9-]{2,}' src/main.tsx | sed 's/path="//' | sort -u > /tmp/routes.txt
#   then, in the test container:
#   select r from unnest(array[...routes...]) r where r not in (select slug from lv.reserved_slugs);
# the UI reserved list matches the database list (expect only static-file names in the difference)
```

- One entitlement map: `grep -rn -E '\$1[39]|\$2[59]|\b(3|6|15)\b.*(roles|campaigns)' src/pages` must show values
  coming only from `lv_plan_limits()` or labelled copy in `src/config/pricing.ts`.
- `lv_hub_create` without a Hub credit returns `lv_entitlement_required`, and `lv_beta_required` never appears.
- Expired entitlement: premium actions return `lv_entitlement_required`; reads and existing data stay; nothing is
  deleted (check row counts before and after expiry).
- The Owner role is not counted in `custom_slots.used`, and the Owner cannot be removed, demoted, leave, or be deleted.
- No v1 bridge: `grep -rn -E 'public\.(profiles|orgs|responses)|legacy' supabase/migrations` returns nothing.

### 4.5 Concurrency

- Whitelist: 60 parallel `lv_whitelist_join` calls from distinct accounts. Expect exactly 50 `admitted`, 10
  `waitlisted`, unique positions, and repeated calls idempotent (follow the slug-race pattern in
  `scripts/db-test-canonical.sh`).
- Hub credit: 2 parallel `lv_hub_create` calls with 1 credit. Expect 1 Hub and 0 credits left.
- Billing events: the same `(provider, event_id)` delivered twice in parallel is applied once.
- Quick Survey activation at the limit of 5: parallel activations never produce 6 active.

### 4.6 Edge Functions

- session: tests cover a wrong `aud`, an unknown `iss`, `alg: none` and HS256, a missing or mismatched nonce, a
  non-UUID `sub`, a JWKS with an unknown `kid`, and missing environment (503). After LC-12, the database refuses a
  token without `session_kind = 'lunchvoice'`.
- billing-webhook: tests cover a bad signature (400), a stale timestamp (400), an unset secret (503), a replay
  (200 and applied once), and an unknown event type (200 and ignored). No payload appears in logs.

### 4.7 UI

- The Player copy matches behaviour (LC-03): no "no login" claim on member Campaigns, and "optional" only if the
  backend allows it.
- The whitelist form shows a privacy notice at collection and links to `/privacy`.
- `/terms` and `/privacy` show "Legal text pending review" until replaced.
- Keyboard: tab through `/`, `/whitelist`, `/me`, the Player and results at 390, 768 and 1280 px. Focus is visible in
  light, dark, high-contrast and forced-colors modes, and there is no horizontal scroll.

## 5. Legal surface the founder needs before launch

**Before the whitelist opens (minimum):**

1. **Privacy notice.** It covers:
   - **Who we are:** KpnSolute, with a contact for privacy requests.
   - **What we collect:**
     - identity claims from KpnIdentity: issuer, subject, email, verified flag, name, picture;
     - the whitelist contact email and note;
     - Hub, membership and role data;
     - answers, both identified and anonymous;
     - guest answers and the guest-key hash;
     - audit and analytics-query logs;
     - server and hosting logs (which include URL paths carrying join and invite codes).
   - **Why:** the purpose of each item.
   - **Anonymity:** what it does and does not mean. Creators see aggregates only. Operators with database access
     are bound by policy. Free text is stored and not published.
   - **Who receives data (subprocessors):**
     - **Supabase** (database and Edge Functions, US region us-west-2);
     - **Render** (static hosting and access logs);
     - **KpnIdentity** (a KpnSolute service, running on Supabase);
     - **Google** (sign-in);
     - **Stripe** (payments, once enabled).
   - **Retention periods** (section 6), and what account deletion removes and what it keeps (KpnIdentity record,
     backups).
   - **Rights and how to exercise them:** access, deletion and correction. Note any state-law rights counsel
     identifies.
   - **Children:** see LC-28.
   - **Changes and effective date.**
2. **Browser storage disclosure.** No cookies are set by the app today, but these storage keys are:
   - `localStorage`: `lv.session` (sign-in session, up to 1 hour), `lv.theme` (theme preference), `lv-draft-<id>`
     (unsent answers), `lv-guest-key-<code>` (guest deduplication key);
   - `sessionStorage`: `lv.signin.pending` (sign-in state for one redirect).

   Only strictly necessary storage is used, which may matter for consent rules in some jurisdictions; counsel
   should confirm. Stripe Checkout will add Stripe's own cookies on Stripe's domain.
3. **Contact.** A monitored address for privacy, support and abuse reports. The Support page currently has none.
4. **Whitelist notice at the form.** What the email is used for, that it is optional, and how to withdraw.

**Before public sign-ups or charging:**

5. **Terms of Service:**
   - free tiers and the whitelist grant (and that it ends 30 days after billing launches);
   - paid plans, renewal, cancellation and refund rules (section 6);
   - acceptable use and takedown (LC-26);
   - creator responsibilities: lawful basis, telling their respondents what they collect, no sensitive data;
   - Hub deletion (A-05) and slug reuse (LC-27);
   - data kept on lapse (never deleted for non-payment);
   - liability and governing law.
6. **Creator-facing data terms or DPA.** Workplaces and schools will ask who controls respondent data. A short
   creator data-processing addendum is likely needed for schools (LC-28).
7. **Accessibility statement.** The target (WCAG 2.2 AA), known gaps (section 2, LC-35 to LC-37) and a contact for
   accessibility problems.
8. **Subprocessor list page,** kept current, including Stripe when it is enabled.

## 6. Founder decisions needed

| # | Decision | Why it blocks | Related |
| --- | --- | --- | --- |
| F-01 | How strict anonymous analytics are: hide the means of suppressed questions, merge withheld buckets, and add a dominance rule. Confirm `min_cohort = 5` (Jev confidence 0.43). | The core privacy promise | LC-01, LC-02 |
| F-02 | What "anonymous" promises in copy, including the operator-access statement. | Accurate representations | LC-03, LC-09 |
| F-03 | Retention periods: audit log, analytics query log, guest key hashes, whitelist emails, closed-Campaign answers, backups. | Privacy notice | LC-17 |
| F-04 | Account deletion semantics: delete or de-identify identified answers; what happens to released results. | `lv_account_delete` | LC-16 |
| F-05 | Minors: an age rule (13+?), whether to market to schools now, school DPA and FERPA posture. Take this to counsel. | Legal risk | LC-28 |
| F-06 | Guests: whether they are allowed in elections or high-integrity modes; default guest caps; whether to accept a ballot-stuffing risk statement. | Integrity | LC-11 |
| F-07 | Whether to collect a whitelist contact email at all, and its purpose and lifetime. | Data minimisation | LC-18 |
| F-08 | **Refunds and cancellation** before Stripe is enabled:<br>• Starter/Team: whether cancellation takes effect at period end or immediately; whether to prorate.<br>• Campaign Starter: whether unused weeks are refundable.<br>• Reservation: refundable or not; what happens to a renewal paid during grace.<br>• Disputes and chargebacks: whether access is revoked and how a disputed reservation is handled.<br>• Failed payments: whether there is dunning, and how long access is held before premium actions lock.<br>• Taxes: sales tax and VAT (for example Stripe Tax).<br>• Receipts. | Stripe go-live | LC-19 |
| F-09 | The Campaign Plus price. Until it is supplied, checkout stays `lv_price_unset`. | Payments | spec §11 |
| F-10 | Whether the Player may be embedded on other sites (CSP `frame-ancestors`). | Headers | LC-04 |
| F-11 | A cooling-off period before a deleted Hub's slug can be claimed again. | Impersonation | LC-27 |
| F-12 | An acceptable-use policy, an abuse contact and a takedown process for free Quick Surveys. | Abuse | LC-26 |
| F-13 | Approval scope for applying 000010-000016 to production, and a corrected runbook. | Production | LC-07 |
| F-14 | Whether free-text questions are offered before a publishing policy exists. | Minimisation | LC-41 |
| F-15 | Counsel review of the privacy notice and Terms. Name the legal entity and governing law. | Legal surface | LC-08, §5 |
