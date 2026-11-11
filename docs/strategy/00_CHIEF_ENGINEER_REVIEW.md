# Chief engineer review (2026-11-10)

Status: **proposal for the founder**. Nothing here changes code, pricing, entitlements or production. Where a
recommendation conflicts with `CLAUDE.md`, the master spec or `LAUNCH_PLAN.md`, those documents win until the founder
says otherwise; each such conflict is marked **Founder decision**.

Reviewed at commit `5d29758` (`main` + PR #58). Method: read the brain, launch plan, build plan, contracts and
changelog; inventoried the 27 canonical migrations, 7 Edge Functions, 23 pages and 10 stylesheets; traced the
respondent, creator and sign-in paths in the source. Every finding cites the file it comes from so it can be checked.

This is document 0 of a set:

| # | Document | Answers |
| --- | --- | --- |
| 0 | this file | What is built, what will break, in what order to fix it |
| 1 | [`01_PRODUCT_CORE.md`](01_PRODUCT_CORE.md) | What LunchVoice is for, for whom, and what it should become |
| 2 | [`02_BACKEND_ARCHITECTURE.md`](02_BACKEND_ARCHITECTURE.md) | A modular backend that can be extended without rewrites |
| 3 | [`03_BRAND_AND_MARKETING.md`](03_BRAND_AND_MARKETING.md) | Brand, voice, launch copy for Reddit, Discord and word of mouth |
| 4 | [`04_ROADMAP_AND_GROWTH.md`](04_ROADMAP_AND_GROWTH.md) | December launch plan, the path to 200K users, cost and revenue |
| – | [`../../DESIGN.md`](../../DESIGN.md) | The unified design system, reproducible by any developer or model |
| – | [`../user/USER_GUIDE.md`](../user/USER_GUIDE.md) | Documentation for the people who use the product |

> **Founder decisions, 2026-11-11** (recorded as F-15 to F-21 in `docs/v2/LAUNCH_PLAN.md`): B-1 guest limits agreed
> (anyone may answer an open survey that allows guests); P-7 three plan cards agreed; annual Hub plans at two months
> free and a one-month referral credit agreed; the name stays; **P-1's Labs switch is withdrawn**; email domain is
> verified at Resend. Rows below are updated where a decision changed them.

## 1. Verdict

The engineering is unusually careful for a product this young: a single API surface (`lv_api`), a tested privacy
engine, fail-closed billing, rehearsed rollbacks, a compliance gate at zero BLOCKER and zero HIGH. That foundation is
worth keeping exactly as it is.

The risk is somewhere else. **The product has been built much wider than it has been used.** Production holds 3
accounts, 3 Hubs and 3 Campaigns (changelog, 2026-11-09 audit) against 72 tables, about 140 public API operations and
a surface that already includes a shop, points, a leaderboard, a newsroom, comments, a public REST API, webhooks, a
Discord bot with role rules, and paid URL reservations. None of that has met a stranger yet. The December launch will
not be decided by any of those features. It will be decided by whether a person who clicks a link in a Discord server
can answer in ten seconds, whether the person who made the survey sees something worth sharing, and whether either of
them comes back.

Three things will hurt on launch day if nothing changes, in this order:

1. **A shared survey rejects its own audience.** Guest answers are capped at 10 per minute *per survey, for everyone
   combined* (finding B-1). Thirty people in a room, or one Reddit post, and most of them see "Too many responses
   right now".
2. **Creators are signed out every hour** with no renewal (B-2), in the middle of building a survey.
3. **The first results screen is empty.** Anonymous results are withheld below 5 answers, and the landing page
   promises "answers land by the minute" (P-3). A new creator's first experience is a locked box.

Everything else in this review is about making the next six months cheaper: one design system instead of three, one
place where a backend module lives instead of five migrations, fewer words for users to learn, and a product that
describes itself honestly.

## 2. What is built (inventory)

| Area | State | Evidence |
| --- | --- | --- |
| Identity | Live. Google through KpnIdentity, PKCE, server-side `(issuer, subject)`, 1-hour LunchVoice session | `src/lib/kpnIdentity.ts`, `supabase/functions/session` |
| Quick Surveys (free) | Live. 5 active, 10 questions, link / QR / code / invite, guests, guest names | `000014`, `000028`, `src/pages/Surveys.tsx` |
| Hubs | Live. Credit-gated create, roles and capabilities, members, invites, pages, appearance, transfer, delete with quarantine | `000010`, `000014`, `000015`, `000018` |
| Campaigns | Live. Modes `survey`, `poll`, `rating`, `feedback`; question kinds `rating`, `single_choice`, `multi_choice`, `yes_no`, `text`; draft, scheduled, open, paused, closed, archived | `000003`, `000011`, `000027` |
| Privacy analytics | Live. Min cohort 5, merged withheld bucket, dominance rule, free text only at cohort, export of released aggregates | `000005`, `000013`, `000016` |
| Entitlements | Live. One map (`lv.plan_limits`), Founding waitlist grant, Hub credits, fail closed on expiry | `000014` |
| Billing | Built, **not connected**. Checkout Sessions, portal, webhook, idempotent event log; fails closed without Stripe keys | `000016`, `000017`, `000019`, `functions/checkout`, `functions/billing-webhook` |
| Email | Built, **not sending**. Outbox and dispatcher; no `RESEND_API_KEY` | `000019`, `functions/email-dispatch` |
| Community | Built. Page content, newsroom, comments and moderation, leaderboard, shop, points, Discover | `000020` |
| Integrations | Built. Hub API keys, REST `/v1`, signed webhooks, Discord bot with account link, posting and role rules | `000024`, `functions/api`, `functions/discord` |
| Staff | Built. Waitlist, abuse reports, suspensions, Discover approvals | `000023`, `000025`, `src/pages/Admin.tsx` |
| Public site | Live. Prerendered marketing pages, sitemap, security headers | `render.yaml`, `scripts/seo-prerender.mjs` |
| Quality gates | Brain check, customer-name check, route registry, bundle check, function tests, canonical DB suite (1255 assertions) with rollback rehearsal | `package.json`, `.github/workflows/pr-checks.yml` |

## 3. Findings

Severity: **L** = fix before the December launch. **S** = fix in the first 60 days after. **W** = watch; fix when the
number it depends on is reached.

### 3.1 Backend and architecture

| ID | Sev | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| B-1 | **L** | **The guest rate limit is global per survey.** `lv.api_guest_submit` takes one advisory lock per Campaign, counts every guest row for that Campaign, then refuses if more than `participation.guest_rate_per_minute` (10) arrived in the last minute from *anyone*. The limit that was meant to stop one abuser stops the audience. It also runs two `count(*)` scans per answer, which grow with the survey. | `supabase/migrations/000028_v2_guest_names.sql:69-92` | **Decided (F-15).** Split the one number into two policies: a **per-guest** limit (guest key hash, a few per minute) and a **per-survey safety ceiling** set high enough that a full room or a busy server never meets it (suggest 600/min on every plan to start, as a policy row). Replace both counts with a counter row per Campaign updated in the same transaction. Keep the advisory lock only for the duplicate check, keyed on the guest hash rather than the Campaign. Detail in `02_BACKEND_ARCHITECTURE.md` §6. |
| B-2 | **L** | **Sessions last one hour and cannot be renewed.** `issueSession` clamps the lifetime to 3600 s; the browser keeps the token in `localStorage` and drops it at load when expired. There is no in-session expiry handling: after an hour the next save simply fails as a signed-out call. | `supabase/functions/_shared/session.ts:129`, `src/identity/IdentityProvider.tsx:34-46` | Add silent renewal: 10 minutes before expiry, run the KpnIdentity authorization request with `prompt=none` in a hidden frame or do a refresh-token exchange in `session`, and swap the token. If renewal fails, keep unsaved Studio edits in local draft storage and show "Sign in again to keep editing" instead of an error. |
| B-3 | **L** | **Nothing runs on a schedule.** The email outbox, webhook outbox, Discord outbox and `lv.retention_sweep()` all exist, and each needs a caller. No cron is defined in the repository; the migration comments say "schedule later with pg_cron". Email and retention are both launch promises (invites, the 7-day guest hash unlinking in the privacy text). | `000016` header, `functions/*-dispatch`, no `cron.schedule` anywhere | The Resend domain is verified (F-21), so this is the last step before invites send. One migration that registers four `pg_cron` jobs (dispatchers each minute through `pg_net`, retention nightly) and a staff-panel tile that shows each job's last success. A promise in the privacy policy needs a job that keeps it. |
| B-4 | **L** | **No observability.** No error tracking, no uptime probe, no product funnel. With testers arriving from Reddit you will not know how many started a survey and gave up, or that a function is failing. | no Sentry / analytics reference in `src` or `supabase/functions` | Three small things: (1) a cookieless, self-contained event counter in the database (`lv.product_events`, aggregate only, no identity; see architecture §8), (2) a client error reporter that posts to an Edge Function, (3) an external uptime check on `/`, the session function and one `lv_api` read. |
| B-5 | **S** | **The schema has no modules, only a build history.** 467 distinct functions across 27 files named after work tracks (`hardening`, `commerce`, `billing_ready`). `lv_api.lv_campaign_get` is redefined in 5 migrations, `lv_my_context` in 4, `lv.gate_evaluate` in 4. To read the current body of a function you must find its last redefinition by search. | `grep "create or replace function"` across `supabase/migrations` | Keep the migration chain (it is the deployment truth) and add a **module map plus a generated current-source snapshot** per domain. New work goes in a migration named for its module. See architecture §3. |
| B-6 | **S** | **The UI is tested against a hand-written copy of the backend.** The dev mock is about 2,200 lines (`mockTransport` 1175, `mockCommunity` 463, `mockStaff` 225, `mockCommerce` 199, `mockIntegrations` 162) that re-implement SQL rules in TypeScript. All e2e tests drive the mock. The real path, browser to PostgREST to SQL, has no automated test, and `e2e` is not part of CI. | `src/lib/mock*.ts`, `package.json` (`test:pr` excludes `test:e2e`) | (1) Generate the TypeScript API types from the database catalog and fail CI when `lvApi.ts` disagrees. (2) Add a ten-step smoke test that runs the built app against the Docker database the DB job already starts. (3) Run the mock e2e suite in CI; GitHub runners have Chromium. |
| B-7 | **S** | **Prices live in two places.** `src/config/pricing.ts` hand-copies prices and limits that `lv.plan_limits` and `lv.products` already hold, against the brain's own rule. It has already drifted once: `PRODUCT.md` still said Campaign Plus has no price. | `src/config/pricing.ts`, `PRODUCT.md` | The pricing page renders numbers from `lv_plan_limits()` (it works signed out) and keeps only labels and sentences in the frontend. |
| B-8 | **S** | **Analytics are computed from raw answers on every read.** Correct and simple today. Each results view re-aggregates the Campaign. | `000013`, `000016` (`lv.analytics_core`) | Leave it until a Campaign passes roughly 20,000 answers or the results page gets live refresh. Then add a rollup table maintained at submit time (architecture §7). Do not build it now. |
| B-9 | **S** | **Five levels of document authority.** `CLAUDE.md` → master spec → `LAUNCH_PLAN.md` (which overrides the spec) → `BUILD_PLAN` → `API_AND_DISCORD_PLAN` → handoffs, plus `PRODUCT.md` and `DESIGN.md` at the root that had both gone stale. The master spec still contains two sections about one customer's December scenario. Every agent session spends context reconciling them. | `docs/v2/*`, `PRODUCT.md`, `DESIGN.md` | After launch, fold the founder decisions (F-01 to F-14, L-xx, A-xx, B-xx, C-xx) into one dated spec revision and archive the plans. Until then the order in `CLAUDE.md` stands. |
| B-10 | **W** | **Rate-limit windows and outboxes live in ordinary tables.** Fine at this size; each API call writes a row. | `lv.integration_rate_windows` | Watch write volume. Move to an unlogged table or an edge cache only past roughly 50 API calls per second. |
| B-11 | **W** | **One region, one database, static frontend.** This is the right shape and cheap. The only hard ceiling is database connections from Edge Functions that open direct connections. | `000016` header ("over a direct database connection") | Make every function use the pooled connection string. Revisit compute size at the thresholds in `04_ROADMAP_AND_GROWTH.md` §6. |

### 3.2 Product and user interaction

| ID | Sev | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| P-1 | **W** | **Surface far ahead of validation.** Shop, points, leaderboard, newsroom, comments, REST API, webhooks, Discord role rules and URL reservations are all built before a stranger has used the core. | routes in `src/main.tsx`; 72 tables | **Withdrawn as a launch item (F-20).** I proposed a Labs switch; on checking the Builder, the control exists: a new Hub has only Home and Campaigns, the Owner adds Shop, Leaderboard, News and Comments as pages, and points are off by default (`000015:246`, `000020`). What remains is discipline: no new community features until the loop numbers in the roadmap are healthy. |
| P-2 | **L** | **The site promises things the product does not do.** The SEO text and structured data advertise "idea boards and elections"; the database accepts four modes and five question kinds, none of them an election or idea board. The landing page says "watch answers arrive" and "answers land by the minute"; the results page has no refresh. | `src/config/seo.json:33-35`, `000003:14,36`, `src/lib/useLv.ts` | Remove elections and idea boards from all public copy until they exist (an election needs one-person-one-vote and audit rules that a survey does not). Add a 15-second refresh on an open survey's results so "live" is true. |
| P-3 | **L** | **The first-run result is a locked box.** An anonymous survey shows nothing until 5 people answer. That rule is right. The experience around it is not: the creator shared a link, two friends answered, and the page reads as broken. | F-01, `lv.safe_cells` | Turn the wait into the next action: "2 of 5 answers. Results unlock at 5 so nobody can be singled out." with the share controls directly under it. Show the response count the moment it is safe to (it already carries no per-option information). Make this state a designed component (design system §9, `ResultsLocked`). |
| P-4 | **L** | **The respondent's last screen is the growth engine and it is nearly silent.** Every person who answers sees the thank-you screen. Today it thanks them. It should also offer the one thing that grows the product. | `src/pages/Player.tsx`, thank-you branch | One calm line and one button on the guest thank-you screen: "Made with LunchVoice. Ask your own group something. Free." linking to `/surveys/new` with a referral tag. Never on embedded Hub players, never before submit. Detail in roadmap §4. |
| P-5 | **L** | **The front door is the waitlist, not the product.** The landing hero leads with "50 Founding seats. A Hub on us." A tester from Reddit wants to try something now. Quick Surveys are free and open to any signed-in person, and they sit second. | `src/pages/Landing.tsx` | Lead with "Make a survey free" → `/surveys/new`. Move the Founding offer to a band lower on the page. The waitlist stays what F-03 says it is: a launch tool. |
| P-6 | **S** | **Too many words.** A new user meets Hub, Campaign, Quick Survey, survey-mode Campaign, personal space, Founding seat, Hub credit, entitlement, family, reservation, Discover, join code (`/c/`), invite code (`/j/`), invite link (`/s/`). Three kinds of code look alike and do different things. | routes, `API_CONTRACT.md` | Adopt the vocabulary in product core §6: users see **survey**, **Hub**, **code**, **plan**. "Campaign" stays as the internal noun and the label inside paid Hubs. "Entitlement", "family", "credit" and "personal space" never appear in the interface. |
| P-7 | **L** | **Six prices on two axes.** `/pricing` shows five plan cards, a sixteen-row comparison table and the reservation card at the very bottom, where the founder did not find it. | `src/pages/Pricing.tsx`, `src/config/pricing.ts` | **Decided (F-16, F-17).** Three cards (Free, Starter Hub, Team Hub) with a monthly / yearly toggle once billing opens; one line for the two-week passes; the reservation card directly under the plans; the table stays. The participation-threshold rule is explained in Hub settings where it applies. |
| P-8 | **S** | **One way to sign in, through a domain users have never heard of.** Google only, with a visible hop through `auth.kpnsolute.com`. The launch audience lives on Discord and Reddit. | `IDENTITY_CONTRACT.md` | Add **Discord** as a second upstream provider inside KpnIdentity (the issuer stays KpnIdentity, so the identity contract holds), then email one-time code. Brand the KpnIdentity consent page "Sign in to LunchVoice". |
| P-9 | **S** | **Results cannot be shared.** A creator who gets an interesting result has no link or image to post. That is the second growth loop and the reason people run polls in public communities at all. | no public results route | An opt-in public results page per survey (released aggregates only, same engine) with a generated share image. Off by default; never available while anything is withheld. |
| P-10 | **S** | **Pages are too large to change safely.** `Hub.tsx` 1157 lines, `Studio.tsx` 936, `Community.tsx` 608, `Account.tsx` 566. Several routes are exported from one file. | `wc -l src/pages/*` | One file per route under a folder per area, each under about 300 lines, when a page is next touched. No big-bang refactor before launch. |

### 3.3 Design system

| ID | Sev | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| D-1 | **L** | **`DESIGN.md` described a different product.** It specified Fraunces, Space Grotesk and OKLCH light-only tokens and said the component library was "not started". The code uses Bricolage Grotesque, Geist, hex tokens in three themes and 27 shadcn components. `.impeccable/config.json` still whitelists the old fonts. Any agent that followed the document produced the wrong thing. | old `DESIGN.md`; `src/ui/tokens.css`; `package.json` | Replaced in this change by a `DESIGN.md` written from the code. Update `.impeccable/config.json` when the UI thread next edits it. |
| D-2 | **S** | **Three token vocabularies.** `--lv-*` (the source), legacy aliases in `index.css` (`--bg`, `--ink`, `--accent`, `--r`), and shadcn's variables mapped in `shadcn.css`. | `src/index.css:10-50`, `src/ui/shadcn.css` | `--lv-*` is the only name allowed in new code. Remove an alias when its last use is gone. |
| D-3 | **S** | **Six stylesheets with overlapping jobs, two class prefixes.** `index.css`, `styles/system.css`, `ui/ui.css`, `ui/app.css`, `ui/community.css`, `styles/landing.css`; 639 `lv-` class uses and 297 `ui-`. | counts from `src/pages` | Target layout in design system §12: `tokens`, `base`, `components`, `layouts`, `marketing`. New classes are `lv-` only. |
| D-4 | **S** | **Scale drift.** 22 distinct font sizes (13, 13.5, 14, 14.5, 15, 15.5 px all in use), 33 distinct `border-radius` values, 60 raw colors outside the token file, 9 different breakpoints, 6 ad-hoc `z-index` values. | `grep` over `src/**/*.css` | The design system fixes a 9-step type scale, 4 radii, 3 breakpoints and a named layer scale, and proposes a `check:design` script that fails on new raw values. |
| D-5 | **S** | **Two component sets and two icon sets.** The app's own `src/components/ui.tsx` (`Btn`, `Card`, `Pill`, `Notice`, ...) beside shadcn `button`, `card`, `badge`, `alert`; the custom `Icon` (19 imports) beside `lucide-react`. | import counts | One owner per job, listed in design system §8. `Icon` wraps lucide plus the few custom glyphs, so pages import one thing. |
| D-6 | **S** | **Tailwind is scoped to one folder.** Utilities written anywhere but `src/components/shadcn/` generate no CSS, silently. | `docs/frontend/FRONTEND.md` | Keep the scope (it protects existing class names) and state the rule at the top of the design system: utilities only inside the component layer; pages use components and `lv-` layout classes. |
| D-7 | **L** | **The brand package contradicts the product.** The wordmark SVG carries the tagline "SMART FEEDBACK. BETTER CAFETERIAS.", is set in Georgia, writes the name as two words, and lists Cream `#FAF7F2` where the app page is `#EEEDEA`. | `brand/lv-package/source-svg/lunchvoice-wordmark.svg`, `README.txt` | Do not use the tagline lockup anywhere public. Brand rules in `03_BRAND_AND_MARKETING.md` §3; a corrected wordmark is a small design task for the founder. |

## 4. Order of work

Before launch (all small, all in existing modules):

1. B-1 guest limits. 2. B-2 session renewal. 3. P-5 and P-2 landing and copy honesty. 4. P-3 locked-results state.
5. P-4 thank-you loop. 6. B-3 scheduled jobs. 7. B-4 observability. 8. P-7 pricing page (F-16). 9. D-7 stop using the
cafeteria lockup.

First 60 days: B-6 contract tests and CI e2e, P-8 Discord sign-in, P-9 shareable results, annual plans and referral credit with billing (F-17, F-18), D-2 to
D-6 design consolidation as pages are touched, B-5 module map, B-7 pricing source.

Later, on a trigger: B-8 rollups, B-10, B-11, P-10.

## 5. What not to change

- The `lv` / `lv_api` split, the result envelope, RLS everywhere, per-function grants and the anon allow-list test.
- The strict suppression engine and the rule that withheld is never zero. It is the product's real differentiator.
- Path-based Hub addresses and the id / slug separation.
- Fail-closed billing and the idempotent event log.
- The canonical migration chain with rehearsed rollbacks, and the customer-name check.
- The static frontend. It costs almost nothing and scales without thought.
