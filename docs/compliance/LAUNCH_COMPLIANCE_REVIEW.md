# LunchVoice v2 launch compliance review

- **Reviewer:** compliance agent (review only; no product code changed)
- **Date:** 2026-11-07
- **Scope:** the plan in `docs/v2/LAUNCH_PLAN.md` (migrations 000014-000016, billing webhook, Quick Surveys,
  whitelist, shadcn UI) and the code at commit `27c83bd` on `claude/wizardly-meitner-wohkzr`.
- **Not legal advice.** Items about law (privacy notices, COPPA, FERPA, state student-privacy law, payments) are
  risks for the founder to take to counsel. They are not statements of what the law requires.

> **Latest (full build `9e951ec`, section 8): 0 BLOCKER and 1 HIGH open (FB-01, role targeting on anonymous
> Campaigns allows differencing).** The feature-complete gate is not met until FB-01 is fixed.
>
> **Earlier (targeted re-review at `5c665e1`, section 7.7): 0 BLOCKER and 0 HIGH open. The F-13 compliance
> condition was met for the launch scope.** At `7ea5853` (sections 7.1-7.6) one new HIGH, NEW-01, was open. 000017 (`8f300b3`) closes it,
> with runtime evidence. Sections 1-6 below are the original review, kept as history.

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

The founder answered these in `docs/v2/LAUNCH_PLAN.md`, under "Founder final decisions" (numbered F-01..F-13 there).
Section 7 refers to those as "plan F-xx" so they are not confused with the questions above.

## 7. Re-review (integrated branch)

- **Commit reviewed:** `7ea5853` on `claude/wizardly-meitner-wohkzr`. This covers 000014–000016, `billing-webhook`,
  the runbook rewrite, the shadcn UI and the security headers.
- **Founder decisions applied:** plan F-01..F-13. These supersede L-08, L-09, L-12 and L-14.
- **Method:** runtime evidence, not documentation. Every check below was run against throwaway local containers.
  Production was not touched.

### 7.1 Verdict

**Every original BLOCKER and HIGH is closed. One NEW HIGH (NEW-01) is open, so the plan F-13 gate ("BLOCKER and HIGH
findings are zero") is not met yet.**

- **What NEW-01 is:** a billing defect. The webhook grants whatever the checkout intent asked for without checking
  what Stripe actually charged.
- **Why it cannot be reached at launch:**
  - `billing.provider_ready` is `false`, so `lv_checkout_start` returns `lv_billing_unavailable`;
  - `billing.payment_links` is NULL;
  - `billing-webhook` answers 503 while `STRIPE_WEBHOOK_SECRET` is unset.
- **Options:** fix it now (small, in the backend; see 7.5), or have the founder record it as DEFERRED, gated on
  billing enablement. In both cases it must be fixed and tested before `billing.provider_ready` is set to true.

Open findings by severity at `7ea5853`:

| | BLOCKER | HIGH | MEDIUM | LOW |
| --- | --- | --- | --- | --- |
| Original findings still OPEN | 0 | 0 | 4 | 5 |
| NEW findings OPEN | 0 | 1 | 3 | 4 |

The original open MEDIUMs are LC-10, LC-12, LC-13 and LC-14. The original open LOWs are LC-11 (residual), LC-30,
LC-31, LC-32 and LC-37. Every other original finding is CLOSED, ACCEPTED-for-beta or DEFERRED with a named owner
(table 7.3).

### 7.2 Runtime evidence gathered

| Check | Result |
| --- | --- |
| `bash scripts/db-test-canonical.sh` | **PASS.** 16 migrations; `checks: 628, failed: 0`; slug race 1 winner and 1 `lv_conflict`, with the loser's credit kept; waitlist race on the last seat, 1 admitted and 1 waitlisted, with 1 Founding credit; full rollback rehearsed |
| `npm run test:pr` with placeholder `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | **PASS.** Brain in sync; names clean; every route has a layout; script tests 16/16; function tests 21/21; build passes; bundle markers present |
| `npm run test:unit` | 14/14 pass |
| `npm run check:names` | clean (`src/` only; see LC-31) |
| Bundle scan of `dist/assets/*.js` for `service_role`, `sb_secret_`, `sk_live_`/`sk_test_`, `whsec_`, private keys, simulated sign-in, `createMockTransport`, `lv.mock.state` | **none found** |
| CSP hash in `render.yaml:18` against a sha256 of the inline script in the built `dist/index.html` | **identical** (`sha256-kU0Cb4JI…PdyQ=`) |
| `npm audit --audit-level=high` | exit 0 (moderate and low only) |
| Catalog audit (§4.2) on a fresh install of 000001–000016 | A1/A2: 0 definer functions without `search_path=''`; A3: **0 `lv` tables without RLS**; A4: 0 table or sequence grants to API roles; **A5b: 0 functions in `lv` or `lv_api` executable by PUBLIC**; A5: only `lv.billing_apply_event` and `lv.retention_sweep` are executable, and only by `service_role`; A7: anon executes exactly 10 of 68 `lv_api` functions (`lv_capability_catalog, lv_guest_campaign_get, lv_guest_submit, lv_hub_get, lv_hub_pages_get, lv_hub_reservation_status, lv_my_context, lv_plan_limits, lv_report_abuse, lv_waitlist_status`); A8: every `lv_api` function is a definer; A9: no views; A10: min cohort 5, guest rate 10, 50 seats, reauth 600 s, slug cooldown 30 days, `billing.provider_ready=false`; A12: no customer name reserved or seeded; products: Campaign Plus 3900 plus 1900 per week |
| **Reconstruction attacks** (anonymous, min cohort 5; via `lv_analytics_overview`, `lv_analytics_query` **and** `lv_analytics_export`) | S1, the original LC-01 case (5x"5" + 1x"1"): the question is withheld whole in all three paths. There are no cells, no keys, `summary.n` and `mean` are null, and the export has only a withheld row and a null mean row (`participants=6` is still published, which reveals nothing). S2, single choice 6/3/1: withheld whole. S3, unanimous yes/no ×6: withheld (`dominance`). S4, rating 5×5 + 5×4: cells and mean published, which is correct because nothing is withheld. S5, 5/5/4/1: A=5 and B=5 published, plus **one keyless merged withheld bucket** (sum 5, at the cohort). S6, multi choice with A chosen by everyone: withheld (`dominance`). S7, 4 free-text answers: `texts_withheld`; 5 answers: strings in random order, with no ids or times, and listed separately in the export. S9, 37 of 40 members answered: `participation_rate` withheld (`near_full_turnout`). **No published output let a withheld count be derived.** |
| **Personal-space isolation** | A stranger calling with the personal-space id got 21 Hub-scoped calls refused (`lv_not_found`, `lv_forbidden` or `lv_billing_unavailable`, never `ok`). The owner got 11 Hub-only calls on their own space refused (`lv_not_found` or `lv_not_available`). Respondent views carry `hub_id: null` and `hub.name: null`. The space is never in `lv_my_context.hubs`. A link response creates **no** membership (the space has only the owner's membership) |
| **Account deletion** | A session 2 hours old gets `lv_reauth_required`; a wrong confirmation gets `lv_confirmation_mismatch`. After deletion, a scan of **every column of every `lv` table** for the account uuid, the identity email and the waitlist email finds **no residue**. The identified free-text answer is deleted; the structured answer stays with `account_id NULL` and a UTC-day timestamp; the personal space, its Quick Surveys, the waitlist row and the contact email are gone. Signing in again with the same `(iss, sub)` gives a new account with nothing attached |
| **Slug quarantine** | After Owner delete, another person's claim gets `lv_conflict`; `lv_hub_get` gets `lv_hub_gone`; reservation status reads `taken`. After 31 days (tombstone aged) a new claim gets a **new Hub id** with 0 campaigns and none of the old data |
| **Billing grant binding** (NEW-01) | With `provider_ready=true` and a fixed-price Payment Link, `lv_checkout_start('campaign_starter', null, 104)` records an intent of 134500 cents. Applying `checkout.session.completed` with that `client_reference_id` (exactly as the webhook maps it) gives `applied` and a **728-day** `campaign_starter` credit. No amount, currency or payment status is ever checked. A replay is correctly `duplicate` |

### 7.3 Reconciliation of every original finding

In every row the production-verification column is **pending deploy**. Fix commits: `a928b77` (000014), `c1fa323`
(000015), `14dd3c0` (000016), `0cb1688` (webhook), `9626d23` and `62c24e6` (UI), `490804f` (headers), and `6aadded`
(text results and runbook).

| ID | Orig. sev | Fix commit | Implementation evidence | Automated test evidence | Live prod | Status |
| --- | --- | --- | --- | --- | --- | --- |
| LC-01 | BLOCKER | 14dd3c0, 6aadded | `000016:90-131` `lv.safe_cells` (one merged keyless bucket, grown to the cohort, whole-question withhold); `000016:285` mean and n withheld when anything is withheld; `000016:347-405` export uses the same engine | `16_billing_analytics.sql`: "LC-01: the question is withheld as a whole (no cells, no keys)", "LC-01: the rating mean and n are withheld", "engine: 6 and 1 with cohort 5 withholds the question", "LC-01/export: the export of the 5+1 case holds no option key, no count and no mean", "export: differencing export against query and overview reveals nothing extra"; my S1, S2 and S5 runs | pending deploy | **CLOSED** |
| LC-02 | HIGH | 14dd3c0 | `000016:105-108` dominance rule; `000016:233-249` participation rate withheld at 100% and when non-respondents are below the cohort | "LC-02: a unanimous small cohort (3) is withheld", "…large cohort (7) is withheld by the dominance rule", "participation rate is withheld when eligible minus respondents is below the cohort (12 of 13)", "…withheld at 100% turnout"; my S3, S6 and S9 runs | pending deploy | **CLOSED** |
| LC-03 | HIGH | 9626d23 | `src/pages/Player.tsx:152-160` privacy promise per mode (member anonymous now says "you sign in only so we can count you once"); `:177,218,229` "Every question needs an answer" and Required, matching `lv.validate_answers`; `Marketing.tsx:44` FAQ | none automated (copy); manual read | pending deploy | **CLOSED** (residual NEW-06) |
| LC-04 | HIGH | 490804f | `render.yaml:15-33`: CSP (script hash, `connect-src` = the LunchVoice and KpnIdentity Supabase hosts, which matches the issuer `https://axzwdbizblfkspduqilj.supabase.co/auth/v1` in `docs/v2/KPNIDENTITY_SETUP.md:27`), `frame-ancestors 'none'`, HSTS, nosniff, Referrer-Policy, Permissions-Policy, XFO | my hash check against `dist/index.html`; coordinator's zero-violation browser test | pending deploy (`curl -I https://lunchvoice.com/` must show all 6 headers) | **CLOSED.** The session stays in `localStorage`, mitigated by the strict `script-src`; accepted |
| LC-05 | HIGH | a928b77, c1fa323, 14dd3c0 | `000014:1680-1704` (revoke from PUBLIC, per-function anon allow-list); `000015:589-601`; `000016:851-875` | `14_entitlements.sql` "grants: no lv_api function is executable by PUBLIC", "grants: anon executes exactly the signed-out allow-list", "grants: as anon, every lv_api function outside the allow-list is denied"; catalog A5b and A7 | pending deploy (runbook §2) | **CLOSED** |
| LC-06 | HIGH | a928b77, c1fa323 | `000014:107-121` (kind, slug CHECKs, personal space always private and invite-only); `000014:332-365` `premium_guard`/`require_community`; `000014:1484-1530` wrappers; `000015:559-579`; `000014:403-413` eligibility without membership | `14_entitlements.sql` "personal: Hub-scoped operations answer lv_not_found …", "personal (LC-06): …", "link: answering never creates a membership in the personal space"; `15_hub_management.sql` "personal: update, pages, transfer and delete answer lv_not_found"; my 32-call isolation run | pending deploy | **CLOSED** |
| LC-07 | HIGH | 6aadded | `docs/backend/PRODUCTION_RESET_RUNBOOK.md:1-130`: rewritten for the real state (000001–000013 applied); apply 000014–000016; post-apply grant audit; policy check; secrets by name; "never configure KpnIdentity as third-party auth"; Auth sign-ups disabled; `lv_api` exposed last | n/a (procedure) | pending deploy | **CLOSED** |
| LC-08 | HIGH | 62c24e6 | `Marketing.tsx:141-245`: Terms, Privacy and Support carry what is stored, anonymity, guests, a per-key storage table, retention, deletion, processors and a contact; `LegalPending` "Legal text pending review" (`:27-29`); `Waitlist.tsx:115-127` notice and consent at collection | none (copy) | pending deploy | **ACCEPTED-for-beta.** Founder inputs outstanding: legal operator name (`Marketing.tsx:15` is a placeholder, as plan F-12 requires) and confirmation that `support@lunchvoice.com` (`src/config/contact.ts:3`) is a monitored mailbox. Both must be in place before the waitlist URL is shared. Remaining content gaps: NEW-03, NEW-04 |
| LC-09 | MEDIUM | a928b77 | `000014:1654-1666` participation coarsened to the UTC day (submissions were already coarsened) | db suite (privacy files) | pending deploy | **ACCEPTED-for-beta.** Physical insertion order is still a linkage path for database operators; disclosure tracked in NEW-04 (backend / founder) |
| LC-10 | MEDIUM | a928b77 | `000014:1636-1652` join codes from `lv.random_bytes` | "join codes come from the CSPRNG" | pending deploy | **OPEN (MEDIUM, before public beta).** There is still no separate high-entropy link token and no rate limit on `lv_guest_campaign_get` (backend) |
| LC-11 | MEDIUM | 14dd3c0, 62c24e6 | plan F-02 accepts guests at 10/min; results labelled (`000016:338-341` `includes_guests`; `Results.tsx:62-66`) | "survey gate: a guest answer leaves the threshold unmet" | pending deploy | **ACCEPTED-for-beta** (plan F-02). Residual: the guest key still comes from `Math.random` (`Player.tsx:19`), OPEN LOW (UI) |
| LC-12 | MEDIUM | – | `lv.caller_identity` (000001:162-196) still checks neither `aud` nor `session_kind`; mitigated procedurally in the runbook ("never configure KpnIdentity as third-party auth") | – | pending deploy | **OPEN (MEDIUM, before public beta)** (backend) |
| LC-13 | MEDIUM | – | `_shared/session.ts` unchanged (nonce is client-supplied) | – | – | **OPEN (MEDIUM, before public beta)** (backend) |
| LC-14 | MEDIUM | – | `src/lib/kpnIdentity.ts:68-70` still accepts `/\`; react-router 6.30.6 | – | – | **OPEN (MEDIUM, before public beta)** (UI): reject `\` and upgrade react-router |
| LC-15 | MEDIUM | 62c24e6 | disclosed in the Privacy storage table (`Marketing.tsx:170-176`) | – | – | **ACCEPTED-for-beta.** Drafts are still in `localStorage`; a shared-device option is still to come (UI) |
| LC-16 | MEDIUM | c1fa323 | `000015:502-552` (plan F-05: free text deleted, structured answers unlinked and coarsened, audit scrubbed, waitlist and email cascade, personal space deleted) | `15_hub_management.sql` "delete: no lv row references the deleted account id or identity subject", "delete: the unlinked submission keeps no exact time…", "delete: signing in again starts a fresh account"; my full-table residue scan | pending deploy | **CLOSED** (copy accuracy: NEW-03) |
| LC-17 | MEDIUM | 14dd3c0 | `000016:806-828` `lv.retention_sweep()` (logs 365 days, guest hashes 7 days); Privacy retention list | db suite | pending deploy: **the sweep is not scheduled** (runbook:174-176 pg_cron step) | **ACCEPTED-for-beta.** Founder or backend schedules it within 12 months of launch at the latest |
| LC-18 | MEDIUM | a928b77, 62c24e6 | `000014:960-1068` (separate column, consent version, global advisory lock, unique per account); `Waitlist.tsx:115-127` | "waitlist: a contact email needs the current consent version", "waitlist: the 51st joiner is waitlisted…", waitlist race in db-test | pending deploy | **CLOSED** |
| LC-19 | MEDIUM | 0cb1688 | `_shared/billing.ts:65-125` (raw body, HMAC-SHA256, constant-time, 300 s tolerance, all v1 values); `billing-webhook/index.ts:21-31` 503 without a secret, 256 KB cap, no payload logs; `000016:580-597` idempotent on `(provider, event_id)` | `billing.test.ts`: "a stale or future timestamp beyond 300 s fails…", "an unset secret fails closed", "timing-safe comparison", "bad metadata values are dropped"; my replay gives `duplicate` | pending (secret unset) | **CLOSED** for verification and idempotency. **Grant semantics: NEW-01, NEW-02** |
| LC-20 | MEDIUM | 14dd3c0 | `000016:870-875` service_role gets `usage on lv` and execute on 2 functions only; webhook uses `set local role service_role` | "grants: service-only functions never live in lv_api", "…not executable by anon or authenticated"; catalog A5 | pending deploy | **CLOSED** |
| LC-21 | MEDIUM | 490804f | `Referrer-Policy: strict-origin-when-cross-origin` (`render.yaml:26-27`): paths never leave the origin | – | pending deploy | **ACCEPTED-for-beta.** Codes stay in paths and in Render access logs; disclosure tracked in NEW-04 |
| LC-22 | MEDIUM | c1fa323 | `000015:58-80` `lv.require_recent_auth` (session `iat` within 600 s) on transfer, Hub delete and account delete | "transfer: a stale session is lv_reauth_required", "hub delete: …", "delete: …"; my 2-hour-old-iat run | pending deploy | **CLOSED** |
| LC-23 | MEDIUM | 62c24e6 | `src/config/pricing.ts` is the single display source; its values match `lv.products` (catalog). Checkout amounts come only from `lv.products` | "products: prices are the canonical cents" | – | **ACCEPTED-for-beta.** Display copy is not read from `lv_plan_limits()`, so drift is possible (UI) |
| LC-24 | MEDIUM | a928b77 | `000014:1381-1407` | "reserved: every top-level UI and launch route is reserved", "reserved: whitelist and how-it-works cannot be claimed"; my route-against-table query found no gaps | pending deploy | **CLOSED** |
| LC-25 | MEDIUM | – | `render.yaml:39-45` still declares no `VITE_KPNIDENTITY_*`; the runbook states production sign-in works, so they are set in the dashboard | – | pending deploy (smoke sign-in) | **ACCEPTED-for-beta** (governing: declare them with `sync: false`) |
| LC-26 | MEDIUM | a928b77, 62c24e6 | `000014:1313-1380` report (signed out, rate-limited, same answer for unknown codes) and admin block; `src/pages/ReportSurvey.tsx` | "abuse: reporting is rate-limited", "moderation: … nothing was deleted" | pending deploy | **CLOSED** (plan F-07) |
| LC-27 | MEDIUM | c1fa323 | `000015:185-205` tombstones, 30-day quarantine, `lv_hub_gone` | "quarantine: nobody can claim it for 30 days", "after quarantine: the new Hub shows none of the old data"; my run | pending deploy | **CLOSED** (plan F-06) |
| LC-28 | MEDIUM | 62c24e6 | plan F-11; Terms say "LunchVoice isn't aimed at children" (`Marketing.tsx:147`) | – | – | **DEFERRED** (founder and counsel: minors workflows). The children line should also appear in Privacy (NEW-04) |
| LC-29 | MEDIUM | a928b77 | `000014:1668-1678` | "rls: every lv table has row level security enabled"; catalog A3 | pending deploy | **CLOSED** |
| LC-30 | LOW | – | `scripts/check-bundle.mjs:15` markers unchanged | – | – | **OPEN (LOW)** (UI). My manual grep was clean |
| LC-31 | LOW | – | `supabase/tests/08_error_contract.sql:46-56` still claims `lioncafe`; the names check covers `src/` only | – | – | **CLOSED at 5c665e1** (fixture renamed to `harbor-book-circle`; no customer name left in `08_error_contract.sql`) |
| LC-32 | LOW | – | `npm audit` shows moderate only; react-router 6.30.6 | – | – | **OPEN (LOW)**, together with LC-14 (UI) |
| LC-33 | LOW | c1fa323 | reauth (LC-22) covers the destructive operations | – | – | **ACCEPTED** |
| LC-34 | LOW | 62c24e6 | `Marketing.tsx:27-29` exact "Legal text pending review"; Terms facts corrected (`:147-151`) | – | – | **CLOSED** |
| LC-35 | LOW | 9626d23 | `src/pages/Public.tsx:118` skip link to `#main` | – | – | **CLOSED** |
| LC-36 | LOW | 165ccf6, 62c24e6 | `src/ui/tokens.css:167` `@media (forced-colors: active)`; `src/ui/ui.css:204` focus-visible outlines | – | pending (visual check in forced colours) | **CLOSED** |
| LC-37 | LOW | – | `src/ui/BottomTabs.tsx:50-51` is still a custom dialog without `aria-modal` or a focus trap | – | – | **OPEN (LOW)** (UI): use the Radix Sheet |
| LC-38 | LOW | 9626d23 | `src/pages/Results.tsx:61` renders `null` (Withheld) when suppressed | – | – | **CLOSED** |
| LC-39 | LOW | – | comment in an applied migration (000006) | – | – | **ACCEPTED** (applied migrations are immutable) |
| LC-40 | LOW | – | actions are still pinned by tag | – | – | **DEFERRED** (governing) |
| LC-41 | LOW | 14dd3c0, 62c24e6 | plan F-01: free text only at 5 or more, random order, no ids or times (`000016:152-167`); creator warning (`src/pages/Studio.tsx:45,262,312`) | "text: below 5 answers the list is withheld", "text: the list carries no ids or timestamps"; my S7 run | pending deploy | **CLOSED** |

### 7.4 New findings

| ID | Sev | Area | File:line | Finding | Required fix | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NEW-01 | **HIGH** | Payments / integrity | `supabase/migrations/000016_v2_billing_ready.sql:520-578,580-650`; `supabase/functions/_shared/billing.ts:129-136` | **A grant is not bound to what was paid.** `lv_checkout_start` lets the buyer pick `p_weeks` (up to 104) and returns a static Payment Link, whose price is fixed in Stripe. On `checkout.session.completed` the webhook maps only `client_reference_id`, metadata, subscription and payment_intent. `lv.billing_apply_event` then grants the intent's weeks with no check of `amount_total`, `currency`, `payment_status` or `mode`. Reproduced: a 104-week intent (134500 cents) paid through a fixed $19 link would grant a **728-day** credit. A session that completes with `payment_status = 'unpaid'` (delayed payment methods) also grants access before any money arrives. | See 7.5 | backend | **CLOSED at 5c665e1** (000017 `8f300b3`; §7.7) |
| NEW-02 | MEDIUM | Payments / refunds | `000016:696-707` | `charge.refunded` revokes everything bought with that payment on **any** refund, including a partial or goodwill refund, and ends a Hub subscription immediately. Plan F-08 makes only Campaign plans refundable (and only before activation), and says Hub plans run to the end of the period. | Act only when `amount_refunded = amount` (full refund), and only for Campaign plans and reservations. For Hub subscriptions, rely on `customer.subscription.deleted` and the period end. Add tests. | backend | **CLOSED at 5c665e1** (000017; §7.7) |
| NEW-03 | MEDIUM | Privacy / representations | `src/pages/Account.tsx:430-431` (`DELETE_COPY`, shown on Settings and Privacy) | It says "your written answers are deleted" and "multiple-choice and rating answers stay only as anonymous totals". Free-text answers given on **anonymous** surveys cannot be found (by design) and remain, and creators can still read them at 5 or more. Structured answers remain as unlinked rows, not only as totals. | Say: "Written answers you gave on identified surveys are deleted. Answers on anonymous surveys were never linked to you, so they can't be found and stay part of the results. Your other answers stay without any link to you." | UI | **CLOSED at 5c665e1** (`798b45f`) |
| NEW-04 | MEDIUM | Legal surface | `src/pages/Marketing.tsx:181-245` | The Privacy summary is missing four things. (a) The operator and backup caveat to "results can't be traced back to you" (LC-09 residual). (b) Server and hosting logs (Render and Supabase), which record URL paths that carry join and invite codes (LC-21). (c) The data region (Supabase us-west-2). (d) The children statement, which is in Terms only. Rights wording ("access or deletion requests") is minimal. | Add these lines. Counsel review is still question F-15 in section 6. | UI, founder | **CLOSED at 5c665e1** (`798b45f`); counsel review is still F-15 |
| NEW-05 | LOW | Security | `000014:375-389,1229` | Campaign invite tokens (96-bit) are stored in plaintext and are readable by managers through `lv_campaign_invite_list`. Hub invites, by contrast, store a hash. | Store the hash, show the token once, and keep a short prefix for listing. | backend | OPEN (LOW, after public beta) |
| NEW-06 | LOW | Product consistency | `src/pages/Player.tsx:152-155,218,229`; `000004:125-127` | The Player honours `config.optional` (it shows Skip), but `lv.validate_answers` rejects any missing answer. A question created through the API with `optional: true` therefore makes every skipped submission fail. | Either support `optional` in `validate_answers` or ignore it in the Player. | backend or UI | **CLOSED at 5c665e1** (000017; §7.7) |
| NEW-07 | LOW | Export | `src/pages/Results.tsx:123-124` | The CSV escape does not neutralise leading `=`, `+`, `-` or `@` (formula injection) in creator-authored prompts and option labels. | Prefix such cells with `'`. | UI | **CLOSED at 5c665e1** (`798b45f`) |
| NEW-08 | LOW | Waitlist | `000014:1040-1047`; `000015:540-546` | Deleting an admitted account frees a seat, and positions are computed by count, so later joiners can get a duplicate position and more than 50 Founding grants can be issued over time. | Decide whether seats are re-issued, and use a sequence or `max(position)+1`. | backend, founder | **CLOSED at 5c665e1** (000017; §7.7) |

### 7.5 Still open at BLOCKER or HIGH, with the exact fix

1. **NEW-01 (HIGH):** bind every billing grant to the confirmed payment.
   - `supabase/functions/_shared/billing.ts`, `mapStripeEvent` case `checkout.session.completed`: add
     `amount_subtotal: num(object.amount_subtotal)`, `currency: str(object.currency)`,
     `payment_status: str(object.payment_status)`, `mode: str(object.mode)`. Also handle
     `checkout.session.async_payment_succeeded` (and add it to `HANDLED_TYPES`).
   - A new migration `000017` (applied migrations stay immutable), `create or replace lv.billing_apply_event`:
     - before any grant, record `rejected` unless `payment_status` is `paid` or `no_payment_required`, `currency` is
       `usd`, an intent exists, and `amount_subtotal` (pre-tax, since Stripe Tax adds tax on top) equals
       `checkout_intents.amount_cents`;
     - reject a session that has no intent rather than trusting metadata for the product, weeks, account or Hub.
   - Alternatively, create Checkout Sessions server-side with the Stripe price and `quantity = weeks`, instead of a
     static Payment Link.
   - Tests in `16_billing_analytics.sql` and `billing.test.ts`:
     - a 104-week intent paid with `amount_subtotal = 1900` is rejected;
     - `payment_status = 'unpaid'` grants nothing;
     - `async_payment_succeeded` grants exactly once;
     - a matching amount grants the intent's weeks.
   - Until this ships, `billing.provider_ready` must stay `false` and `billing.payment_links` must stay NULL.

No BLOCKER is open. **Update:** 000017 implemented this fix at `5c665e1`, and it was verified at runtime (§7.7).

### 7.6 To verify on production after deploy

- The 6 security headers are present on `/` and on a deep link (`/c/ABC234`). There are no CSP violations during
  sign-in, waitlist join, Quick Survey creation and answering, and results.
- Runbook §2 grant audit returns exactly A3, A5, A5b and A7 above. `lv_api` is exposed only after it passes.
- `lv.policy` matches A10. `billing.provider_ready` is `false` and `billing.payment_links` is NULL.
- The `billing-webhook` POST answers 503 (secret unset).
- Real Google → KpnIdentity → LunchVoice sign-in works (plan F-13 smoke test). A fresh session can delete a test
  account; a session older than 10 minutes gets `lv_reauth_required`.
- The legal operator name is filled in (`src/pages/Marketing.tsx:15`), and `support@lunchvoice.com` receives mail.
- The retention sweep is scheduled (runbook:174-176), or a date is recorded for scheduling it.

### 7.7 Targeted re-review at `5c665e1` (000017 `8f300b3`, UI `798b45f`)

**Result: 0 BLOCKER and 0 HIGH open. The plan F-13 compliance condition is met.** The other F-13 conditions (real
auth smoke test, items in 7.6) are verified on production.

**Suite and build:**
- `bash scripts/db-test-canonical.sh`: **PASS**, 17 migrations, `checks: 660, failed: 0`; both races pass; full
  rollback rehearsed (including `000017_v2_billing_hardening.down.sql`).
- `npm run test:pr` with placeholder env: **PASS**; function tests 24/24.
- Catalog on a fresh install of 000001–000017: 0 functions executable by PUBLIC; only `lv.billing_apply_event` and
  `lv.retention_sweep` are executable, and only by `service_role`; 0 `lv` tables without RLS.

**Runtime tests:** run as `service_role` calls to `lv.billing_apply_event`, with the payload shape that
`mapStripeEvent` now produces (`billing.ts`: `amount_subtotal`, `currency`, `payment_status`, `mode`, `ended_at`,
`amount`, `amount_refunded`, `refunded`).

| Case | Expected | Observed |
| --- | --- | --- |
| NEW-01: 104-week Campaign Starter intent (134500 cents) paid via a fixed $19 link (`amount_subtotal` 1900) | nothing granted | `rejected` / `amount_mismatch`; no credit |
| NEW-01: correct 2-week intent, `payment_status = 'unpaid'` | nothing granted | `rejected` / `not_paid`; no credit |
| NEW-01: currency `eur` · metadata only, no intent (104 weeks) · amount missing | nothing granted | `rejected` (`currency`, `no_intent`, `amount_mismatch`); no credit |
| NEW-01: `async_payment_succeeded` (paid, matching amount), then a second completion event | granted once | `applied` (14-day credit), then `ignored` / `intent_already_used` |
| NEW-02: partial refund (500 of 1900) on a Campaign credit | kept | `ignored` / `partial_refund_recorded_for_support`; credit stays open |
| NEW-02: full refund of an unused Campaign credit (plan F-08: before the window) | revoked | `applied`; credit `ends_at = now()` |
| NEW-02: full refund after the credit became a Hub window (started) | kept | `ignored` / `started_window_recorded_for_support`; Hub family still `starter` |
| NEW-02: full refund of a Hub subscription payment, then `customer.subscription.deleted` | access to the end of the period | `ignored` / `subscription_refund_recorded`; cancellation `end_of_paid_period`; `ends_at` still the period end (+30 d) |
| NEW-08: 2 seats; 2 admitted; one admitted account deleted; 2 more join | no re-issue | the next joiners are `waitlisted` at positions 1 and 2; `seats_taken = 2`, `open = false` |
| NEW-06: a required plus an optional question | optional may be skipped; required enforced | the optional answer alone gives `lv_invalid_input`; an empty submission gives `lv_invalid_input`; the required answer with the optional one skipped is accepted |
| LC-31 | no customer-name fixture | `08_error_contract.sql` uses `harbor-book-circle`; 0 matches for lioncafe or mjcc |
| NEW-03 | accurate deletion copy | `src/pages/Account.tsx:430-431` now says identified written answers are deleted and anonymous answers cannot be found and stay in results |
| NEW-04 | operator access, logs, region, children | `src/pages/Marketing.tsx` Privacy adds "Who can see stored data", request logs, data region (US), and Children (under 13) |
| NEW-07 | CSV formula neutralised | `src/pages/Results.tsx:123-124` prefixes `'` to cells starting with `=` `+` `-` `@` tab or CR |

**Remaining LOW note (not a finding):** grants check `amount_subtotal`, which is the amount before discounts. A 100%
promotion code (`no_payment_required`) would still grant access, which is correct if promotion codes are enabled
deliberately. The founder should keep promotion codes off the Payment Links unless that is intended.

**Still open, none BLOCKER or HIGH:**
- MEDIUM: LC-10, LC-12, LC-13, LC-14.
- LOW: LC-11 (residual), LC-30, LC-32, LC-37, NEW-05.
- Founder inputs before the waitlist link is shared: the legal operator name, and confirmation that
  `support@lunchvoice.com` is monitored.

## 8. Re-review: full build (9e951ec)

- **Commit reviewed:** `9e951ec` on `claude/wizardly-meitner-wohkzr`. It adds 000018 (track A hardening), 000019
  (commerce, email outbox, admin console), 000020 (community and Discover), 000021 (shop-order email), and the
  `checkout` and `email-dispatch` Edge Functions. Plan: `docs/v2/BUILD_PLAN_2026-11-21.md`.
- **Method:** runtime evidence on throwaway local containers only. Nothing touched production, real Stripe or
  Resend.

### 8.1 Verdict

**Not feature-complete-gate ready: 0 BLOCKER, 1 HIGH open.**

The open HIGH is FB-01. Role targeting on an **anonymous** Campaign gives a Team admin a working differencing attack
that reveals one member's answer. I reproduced it (8.3). Everything else reviewed holds:
- grants, RLS and definer functions;
- the suppression engine (5×"5" + 1×"1" through overview, query and export);
- personal spaces;
- the admin console;
- outbox contents;
- the billing guarantees;
- markdown safety.

Open counts, previously open items plus the new findings below: **0 BLOCKER, 1 HIGH, 3 MEDIUM, 5 LOW.**

### 8.2 Runtime evidence

| Check | Result |
| --- | --- |
| `bash scripts/db-test-canonical.sh` | **PASS.** 20 migrations, `checks: 994, failed: 0`; slug race and waitlist race pass; full rollback rehearsed |
| `npm run test:pr` (placeholder VITE_ env) | **PASS.** Brain in sync; names clean; routes; script tests 18/18; function tests 60/60; build; bundle markers |
| `npm run test:unit` / `npm run test:e2e` | 26/26 / **44/44** (Vite dev with the mock transport, Playwright Chromium) |
| Bundle scan (`dist/assets/*.js`) for `service_role`, `sb_secret_`, `sk_live_`/`sk_test_`, `whsec_`, Resend keys, `STRIPE_SECRET`, private keys, mock code | none found; `check-bundle.mjs` now forbids these markers itself (LC-30) |
| `npm audit --audit-level=high` | exit 0 |
| Catalog audit on a fresh install of 000001–000021 | 0 definer functions without `search_path=''`; **0 `lv` tables without RLS**; 0 table or sequence grants to API roles; **0 functions executable by PUBLIC**; `lv` usage for `service_role` only; anon executes exactly **13 of 109** `lv_api` functions (the previous 10 plus `lv_discover_list`, `lv_news_get`, `lv_news_list`); `service_role` executes exactly 11 `lv` functions (`billing_apply_event`, `checkout_session_context`, `checkout_intent_attach`, `billing_customer_set`/`_of`, `email_claim`/`_mark`/`_retention_sweep`/`_reservation_sweep`, `retention_sweep`, `session_exchange_consume`); every `lv_api` function is a definer; no views; no customer name reserved or seeded |
| Admin console | As a member who is not an admin, all 11 `lv_admin_*` functions answer `lv_forbidden`; signed out, `lv_unauthenticated`. As an admin, `lv_admin_waitlist` holds no address (only `has_contact_email`); `lv_admin_waitlist_contact` returns it **and writes one `admin.waitlist_contact_viewed` audit row** |
| LC-12 | A raw KpnIdentity ID token (`aud` = client id) gives `caller_identity` NULL; `aud=authenticated` without `session_kind` gives NULL; the deployed session shape (`aud=authenticated`, `session_kind=lunchvoice`, which `_shared/session.ts` issues) is accepted |
| LC-01 regression | 5×"5" + 1×"1": overview, `lv_analytics_query(rating_summary)` and export each withhold the question (no keys, no cells, mean and n null) |
| Outbox | After an identified and an anonymous text Campaign: templates are `hub_created`, `waitlist_joined` and **one** `participation_receipt` (identified only); 0 outbox rows contain an answer; 0 receipts for the anonymous Campaign |
| Billing through the 000019 wrapper | `lv.billing_apply_event` (`000019:292-358`) handles `customer.subscription.updated` itself and delegates every grant to the unchanged 000017 core, which service_role can no longer call directly (`000019:973`). Test "webhook: NEW-01 still binds grants to the confirmed amount through the wrapper" passes. Line items (`_shared/stripe.ts` `lineItemsFor`): first period plus `quantity = weeks - first_period_weeks`. These match `lv.checkout_amount` only if the Stripe prices equal `lv.products`, so a misconfigured price is rejected by the webhook amount check rather than granted |
| Edge Function auth | `checkout`: forwards the caller's own session to PostgREST (`lv_checkout_start` / `lv_billing_portal_check`) before using the service role; returns a generic 502 and never echoes Stripe text (`_shared/checkout.ts:131-139`); 503 without `STRIPE_SECRET_KEY`. `email-dispatch`: constant-time bearer compare against the service role key or `EMAIL_DISPATCH_SECRET`, where an empty secret never matches (`_shared/email/dispatch.ts:90-103`); no addresses logged. Each `verify_jwt=false` is justified in `supabase/config.toml` (LunchVoice ES256 sessions are not Supabase Auth JWTs; Stripe signs its own requests; the dispatcher checks its own bearer) |
| Markdown-lite and email | `src/lib/markdownLite.ts:8-37` keeps only http(s) and mailto links and renders text nodes only (no `dangerouslySetInnerHTML`); links get `rel="noopener noreferrer nofollow ugc"` (`src/pages/Community.tsx:40`). The QR SVG comes from the `qrcode` library, not user HTML. Email templates escape every user value (`_shared/email/templates.ts:29-69`) |
| Shop and points | Balances are visible to the member only; managers see orders with display names. Each order takes a per-member advisory lock plus a lock on the item row (`000020:933-968`); cancelling refunds points and restores stock. UI copy says "Points have no cash value" (`src/pages/Community.tsx:423,482`) |
| **Role-targeting differencing (FB-01)** | See 8.3 |

### 8.3 FB-01 reproduction

1. A Team Hub owner creates role `GroupA` (10 members) and role `GroupAplusT` (the same 10 plus target T).
2. Two anonymous yes/no Campaigns are targeted, one to each role, and closed. Everyone answers, and T answers "yes".
3. The published results are A: yes 5, no 5 (participation rate withheld as `near_full_turnout`), and B: yes 6, no 5.
4. The suppression engine is satisfied in both cases (every cell is at least 5, and no cell dominates).
5. The difference reveals T's answer exactly. The admin needs only `admin.roles.manage` and `campaign.manage`, two
   roles and two Campaigns. Nothing in the gate or the analytics compares audiences across Campaigns.

The same attack is possible without targeting, by admitting one member between two Hub-wide Campaigns. Targeting
makes it free, silent and repeatable: a member never notices a role being created.

### 8.4 Reconciliation of previously open items

| ID | Prior status | Evidence at 9e951ec | Automated tests | Live prod | Status |
| --- | --- | --- | --- | --- | --- |
| LC-10 | OPEN MEDIUM | `000018:115-216` 128-bit `link_token` from the CSPRNG; database rate limit on failed join-code lookups (per caller 10/min, global signed-out 300/min); misses store no code and no IP | `18_hardening.sql` "LC-10: …" (13 checks, including "after 10 misses in a minute even a valid code is lv_rate_limited", "the link token is never rate limited", "misses store neither the code nor the IP") | pending deploy | **CLOSED** (residual FB-03) |
| LC-11 | ACCEPTED-for-beta, residual OPEN LOW | `src/pages/Player.tsx:20` guest key from `crypto.getRandomValues` (32 bytes) | e2e | – | **CLOSED** |
| LC-12 | OPEN MEDIUM | `000018:35-82` requires `aud` = `authenticated` and `session_kind` = `lunchvoice` | "LC-12: …" (8 checks); my runtime run | pending deploy (the real sign-in smoke test must still pass) | **CLOSED** |
| LC-13 | OPEN MEDIUM | `000018:84-113` `lv.session_exchange_consume` (single-use hash of issuer, subject and nonce/jti; service_role only); `supabase/functions/session/index.ts:4-33` | "LC-13: a replayed key is refused", "…only service_role may record exchanges", "…nothing but a hash and times is stored"; function tests | pending deploy | **CLOSED.** Note: if 000018 is missing, the function falls back to a per-instance memory cache (`session/index.ts:30-33`); apply 000018 before redeploying `session` |
| LC-14 | OPEN MEDIUM | `src/lib/kpnIdentity.ts:75-79` rejects `//`, backslash, control characters and encoded slashes | unit tests | – | **CLOSED** (react-router still 6.30.6; see LC-32) |
| LC-30 | OPEN LOW | `scripts/check-bundle.mjs` forbids `service_role`, `sb_secret_`, `"d":"`, `sk_live_`, `sk_test_` and `whsec_` | `test:pr` | – | **CLOSED** |
| LC-32 | OPEN LOW | react-router 6.30.6; `npm audit` has no high findings; the open-redirect chain is broken by LC-14 | – | – | **ACCEPTED** (UI: upgrade when 7.x migration is planned) |
| LC-37 | OPEN LOW | `src/ui/BottomTabs.tsx:4,16-36` uses the Radix Sheet (aria-modal, focus trap and return) | e2e | – | **CLOSED** |
| NEW-05 | OPEN LOW | `000018:748-872` campaign invite tokens are stored as SHA-256 hashes with a 6-character prefix, shown once, and existing tokens were hashed in place | 18_hardening invite checks | pending deploy | **CLOSED** |
| LC-08 | ACCEPTED-for-beta (founder inputs) | `src/pages/Marketing.tsx:16` operator is still `[Legal operator name — pending]` | – | – | **ACCEPTED-for-beta**, unchanged; see also FB-02 |
| LC-09, LC-15, LC-17, LC-21, LC-23, LC-25, LC-28, LC-33, LC-39, LC-40 | ACCEPTED or DEFERRED | unchanged by this build | – | – | unchanged (owners as in §7.3) |
| All other LC and NEW items | CLOSED | no regression found: the db suite and my LC-01, LC-06, LC-12 and grant runs pass | – | – | CLOSED |

### 8.5 New findings (full build)

| ID | Sev | Area | File:line | Finding | Required fix | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| FB-01 | **HIGH** | Privacy / anonymity | `supabase/migrations/000018_v2_hardening.sql:242-253,286-315,375-412`; analytics `000016:169-297` | **Role targeting enables a differencing attack on anonymous Campaigns** (8.3). Two overlapping targeted audiences that differ by one member reveal that member's answer while every cell passes the cohort and dominance rules. | Simplest: refuse `audience_scope = 'roles'` on **anonymous** Campaigns, both in `lv_campaign_set_audience_roles` and as a gate reason (`role_targeting_anonymous`), in a new migration 000022. Identified Campaigns keep targeting. Alternatively: (a) freeze the eligible audience (account set) at activation; (b) withhold an anonymous role-targeted Campaign's results while another released anonymous Campaign of the same Hub has an audience whose symmetric difference with it is between 1 and `min_cohort - 1`; (c) require at least `2 × min_cohort` eligible members. Add my 8.3 scenario as a test that must end withheld (or refused). | backend |
| FB-02 | MEDIUM | Legal surface | `src/pages/Marketing.tsx:216-220` | **The Privacy page does not cover the new data flows:** Stripe (payments, the customer record holding an account id), Resend (email), transactional email (including invite emails to people who are not users), outbox retention (30 days), community data (comments, news posts, leaderboard opt-in, points and shop orders) and the public Discover listing. | Add these processors and data items before the corresponding features or keys go live; Stripe and Resend stay fail-closed until keys are set. | UI, founder |
| FB-03 | LOW | Availability | `000018:180-202` | The global cap (300 failed lookups per minute across all signed-out callers) lets one actor deny typed-code lookups to every signed-out visitor. Link tokens and signed-in callers are unaffected. | Accept for beta and monitor `join_code_misses`. Consider trusting only `cf-connecting-ip` and raising the global cap. | backend |
| FB-04 | LOW | Privacy / representations | `000020:780-813`; leaderboard UI | The opt-in leaderboard changes when a Campaign ends, so other members can tell who took part in that Campaign, including an anonymous one (never what they answered). | On the opt-in control, say: "Others can see how many Campaigns you took part in, including anonymous ones." | UI |
| FB-05 | LOW | Abuse | `000019:659-695`; `supabase/functions/_shared/email/templates.ts:102-112` | Hub invite emails carry Hub- and inviter-controlled names to any address (30 per hour per account). The text is escaped, but the feature can still be used for unsolicited mail. | Add a footer ("You received this because a Hub admin entered your address; ignore it if unexpected") and an abuse contact; keep the hourly cap. | backend |
| FB-06 | LOW | Privacy (residual) | `000010`/`000014` membership paths | Admitting one member between two Hub-wide anonymous Campaigns allows the same differencing as FB-01, at a visible cost. | Document as a known limitation, or extend FB-01 option (b) to all anonymous Campaigns. | backend, founder |

Open BLOCKER/HIGH, with the exact fix: **FB-01**. In 000022, `lv.api_campaign_set_audience_roles` returns
`lv_not_available` ("Role targeting is for identified Campaigns") when `anonymity = 'anonymous'`. `lv.gate_evaluate`
adds the reason `role_targeting_anonymous` when `audience_scope = 'roles'` and the Campaign is anonymous.
`lv_campaign_update` refuses to switch a role-targeted draft to anonymous. A test reproduces 8.3 and asserts the
refusal.
