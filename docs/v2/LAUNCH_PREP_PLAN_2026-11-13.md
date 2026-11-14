# Launch prep plan (founder, 2026-11-13)

This week is **planning and prep**. Next week (starting 2026-11-16) is **building for launch**. Nothing in this file
builds anything; it records the decisions, the designs and the order of work so the build week starts running.

Order of authority is unchanged: `LAUNCH_PLAN.md`, the master spec, `PRODUCT_DIRECTION_2026-11-11.md`, then this file.
`BUILD_PLAN_2026-11-21.md` still records feature-complete on 2026-11-21 and public launch on 2026-12-01; founder to
confirm those dates still hold (question Q7 below). The service inventory is `docs/ops/SERVICES_AND_DEPENDENCIES.md`.

## 1. Decisions logged today

| ID | Decision (founder, 2026-11-13) | Notes |
| --- | --- | --- |
| D-01 | **Cloudflare Workers is LunchVoice's edge platform.** Use it for LunchVoice's edge needs without asking each time. Every use is logged in the Cloudflare usage log (`SERVICES_AND_DEPENDENCIES.md` section 6) and in this roadmap | Does not cover a paid plan change, nameservers or registrar changes, or other KpnSolute products' Workers (`papercliped-*`, `kpnsolute-*`). New credentials still need a go-ahead at build time |
| D-02 | **Results visibility is the creator's choice, not the platform's.** Team Hub and Creator Pro creators may choose live results for any survey type, elections and anonymous surveys included. Respondents are always told before they answer | Design in section 2. Opens questions Q1 to Q3 |
| D-03 | This week is plan and prep; next week is the launch build | Section 4 (this week) and section 5 (next week) |
| D-04 | `SERVICES_AND_DEPENDENCIES.md` is the one inventory of services, secrets (names only) and dependencies, and is updated in the same commit as any change | Brain files point to it |
| D-05 | **LunchVoice is built at the lowest possible cost, and no new Render custom domains are added.** Render charges $0.25 a month for each custom domain beyond a plan's allowance. Every future hostname (`auth`, `create`, `pay`) is routed through Cloudflare, so Render keeps exactly two domains (`lunchvoice.com`, `www`) | Routing table and cost ledger: `SERVICES_AND_DEPENDENCIES.md` section 2a. Q13 and Q14 are answered below |
| D-06 | **One creator dashboard for every plan, like Kahoot**, at `create.lunchvoice.com` (the founder named the address). The same layout, navigation and screens for everyone; the plan changes what is unlocked, never what you see | Design in section 2b |
| D-07 | **`pay.lunchvoice.com` is the payment site** (Stripe), replacing the old GoDaddy-era site. A Cloudflare Worker, no Render domain, no paid Stripe custom-domain add-on | Services log section 2a |
| D-08 | **How the site really deploys:** a Render **static site** built from `main` (`npm install; npm run build`, publish `dist`), **not Docker**. `render.yaml` is not connected (Render has no Blueprint); routing and headers live inside the Render service. Docker is used only for the local and CI database tests | Fixed 2026-11-13; record and rollback in `docs/ops/RENDER_SETTINGS.md` |

## 2. Results visibility: creator-controlled live results

### What was said

"for teams the user should be and creator pro the creator should be able to if it want live results for elections and
for any survey types. I haven't been clear about privacy."

### How this plan reads it (confirm in Q1)

Privacy for results is the **creator's** setting. Team Hub and Creator Pro creators can turn on live results for any
survey, including elections and anonymous surveys. Creator Plus keeps what shipped today (live on every non-election
survey). Free, Starter and Campaign Starter keep the waiting rules. In every case the people answering are told, in
plain words, before they answer.

### What is live in production today (migration 000053)

| Plan | Totals and charts | Individual answers |
| --- | --- | --- |
| Free, Starter, Campaign Starter | Anonymous: after the survey closes and 5 answers. Identified: from the first answer | Anonymous: never live. Identified: as today |
| Creator Plus, Creator Pro, Team Hub, Campaign Plus | From the first answer, live, anonymous and identified | Anonymous: groups of 5, all after close. Identified: live, with names |
| Any plan, **elections** | Waiting rules always (a live tally would show votes as they are cast) | Waiting rules |

### Proposed model for next week (migration 000054)

One per-survey setting, **Results**, chosen by the creator in the survey's settings:

| Setting | Meaning | Who may choose it |
| --- | --- | --- |
| **When the survey closes** | Waiting rules apply (the safest) | every plan (the only choice on Free and Starter) |
| **Live** | Totals and charts from the first answer. Anonymous individual answers in groups of 5 | Creator Plus, Creator Pro, Team Hub, Campaign Plus, **not elections** |
| **Live, including elections** | The same, and an election's running tally is visible | **Team Hub and Creator Pro only** |
| **Instant answers** (extra switch, anonymous surveys) | The creator sees each anonymous answer the moment it is submitted, no groups | **Team Hub and Creator Pro only** |

Entitlement keys in the one plan map: `results.instant` (exists: Team, Creator Plus, Creator Pro),
`results.instant_elections` (new: Team, Creator Pro), `results.instant_rows` (new: Team, Creator Pro). The server decides;
the interface only explains.

**Respondent notice (computed by the server and shown on the start screen, never left to the creator):**

- Live: "The creator can see results as they come in."
- Live, anonymous, groups of 5 (shipped): "The creator can see results as they come in. Individual answers are shown in groups of 5 and never with your name."
- Instant answers: "The creator sees each answer as soon as you submit it. No name is attached, but when only a few people answer, the creator may be able to guess whose it is."
- Election with a live tally: "Votes are counted live. The creator can see the running tally. Your ballot is never linked to your name."

**Creator confirmation for the two risky choices** (a plain dialog, not a tooltip): "Live tallies can sway voters and can show how a small group voted. Voters will be told. Turn on live results?" and "Instant answers can let you work out who said what when few people answer. Voters will be told."

**Safeguards that stay on whatever the creator picks:** no names, times or receipt ids on anonymous answers; filters stay
refused on anonymous surveys (they let two queries be subtracted); device, source and duration breakdowns on anonymous
surveys keep the close-and-5 rule; quiz answer keys never reach respondents; the respondent notice cannot be turned off.

**Defaults:** new surveys on a live-capable plan stay **Live** (as shipped, nothing changes for existing creators);
elections default to **When the survey closes**. Changing a setting after answers exist applies to results shown from then
on and is written to the audit log with who changed it and when.

**Tests (heavy, privacy):** pgTAP across plan × setting × anonymous/identified × election × open/closed × below/above 5;
no regressions on suites 24, 42, 44, 53; e2e for the dialogs, the notice and a plan downgrade (the setting falls back,
nothing is deleted). **Brain files:** `AGENTS.md` and `CLAUDE.md` carry the approved summary (done with this plan).

## 2b. The creator dashboard: one for everyone (D-06)

**Question:** should the dashboard change with the plan, or stay the same for every user like Kahoot? **Recommendation
(adopted): the same dashboard for everyone.** The plan changes what is unlocked, never what you see.

Why:

- **One thing to build, test and document**, which is the cheapest to run (the cost principle). Per-plan dashboards
  multiply every screen, test and support answer by five plans.
- **People see what they could unlock.** A locked control says which plan opens it, never a dead end (the pattern
  already used for branding, logic and question types). Hiding features from lower plans hides the reason to upgrade.
- **Upgrading moves nothing.** The layout, navigation and muscle memory stay put; a control just unlocks.
- **The server decides, the screen explains.** Entitlements stay in the plan map; the dashboard only reads the answer.

What differs by plan, and only this: a **plan card** at the top (plan name, what it unlocks), **usage meters** (active
surveys 3 of 5, questions per survey, Trends used of allowed), **locked controls** with a one-line unlock note, and the
**Results setting** choices (section 2). Nothing is rearranged.

Shape of `create.lunchvoice.com`: **Library** (the creator's surveys), **Templates** (the 82), **Create** (the studio:
question rail, canvas, properties), **Results**, **Trends**, **Present**, **Branding**, and **Plan and billing**. A
space switcher (personal space or a Hub) swaps the contents, never the screens. `lunchvoice.com` stays where people
answer, join with a code and visit Hubs; `/me` stays the place for what someone has answered and their Hubs. Staff
tools stay in `/admin`.

Not doing: a separate dashboard per plan, or removing features from lower plans' screens.

## 3. Staying signed in for 30 days: Cloudflare Worker design (decided)

`docs/backend/SESSIONS.md` has the threat model and the refresh-credential design. The open question there (which proxy)
is now answered: **a Cloudflare Worker**. One correction to that file: a Worker on `lunchvoice.com/auth/*` will **not**
run today, because the apex is a proxied A record to Render and Cloudflare skips zone Workers in front of it (the
`hub-card` README documents the same finding). So the Worker gets its own Custom Domain, like `hub.lunchvoice.com`.

**Shape**

- `auth.lunchvoice.com` is a Custom Domain served only by a new Worker (`workers/auth-session/`). It never touches Render.
- `auth.lunchvoice.com` and `lunchvoice.com` (and any future subdomain, such as `create`) share one registrable domain, so they are
  the **same site**: Safari and Chrome treat the cookie as first-party. It is answered by our own Worker, not a CNAME to
  another company's domain, so the 7-day cap on cloaked cookies should not apply (to verify, below).
- The cookie is **host-only** on `auth.lunchvoice.com`: `__Host-lv_device=<token>; Secure; HttpOnly; SameSite=Strict;
  Path=/; Max-Age=2592000` (30 days, sliding). Host-only means it is sent to the Worker and nowhere else, no tenant host
  ever receives it, and the `__Host-` prefix is allowed. This settles owner decision (2) in `SESSIONS.md`.
- The browser calls the Worker with `credentials: "include"` from `lunchvoice.com` or a tenant host. The Worker echoes
  the exact origin only if it matches `^https://([a-z0-9-]+\.)?lunchvoice\.com$` (and is not `auth` or `hub`), sets
  `Access-Control-Allow-Credentials: true` and `Vary: Origin`, requires a custom header (`x-lv-csrf: 1`) and checks `Origin`.
- The Worker is stateless. It calls an extended `session` Edge Function server to server with a shared secret header:
  `issue` (after a normal sign-in), `refresh` (cookie in, new short-lived access session and a new rotated cookie out),
  `revoke` and `revoke-all`. The function and database own the truth; the Worker only moves the cookie.
- Database (migration 000049, already reserved): hashed refresh credentials in families, single use, rotated on every
  use, **reuse of an old one revokes the whole family**, device label, created, last used, 30-day sliding expiry. RLS on,
  no API-role grants, `service_role` only, like `lv.session_exchange_consume`.
- Interface: "Keep me signed in on this device" (default on, off for shared computers); an Account page list of signed-in
  devices with Revoke and "Sign out everywhere". CSP `connect-src` gains `https://auth.lunchvoice.com`.

**Verify before relying on it (first day of the build)**

1. iOS Safari and macOS Safari: still signed in after more than 7 days (set the cookie, then simulate or wait, or use
   Safari's developer tooling to inspect expiry).
2. Chrome with third-party cookies blocked, and Firefox: the refresh call carries the cookie.
3. A second hostname (`create.lunchvoice.com`, once it exists) refreshes through the same Worker. Hub URLs are paths and
   there is no wildcard DNS today, so there are no tenant hosts to test.
4. If Safari caps it, ship 7 days and say so in `SESSIONS.md`; do not fall back to a token in `localStorage`.

**At build time, ask for the go-ahead on:** the new shared secret (a credential), deploying the `session` Edge Function
(functions are not redeployed by merging), and applying 000049. No KpnIdentity or KpnAuth setting changes for this.

**Optional later (log in the Cloudflare usage log when done):** make the apex a proxied CNAME to Render ("O2O") so zone
Workers can sit in front of the whole site. That would allow a true HTTP 404, per-Hub share images at `/h/*`, and edge
header control. It is a DNS change, so it waits for a decision after launch unless something needs it sooner.

## 4. This week: prep, no building

### Founder (owner actions)

| # | Action | Why it blocks |
| --- | --- | --- |
| 1 | Create a PostHog Cloud account and connect it in Composio | Analytics events, funnels, the staff dashboard |
| 2 | Stripe is already set up in **live mode** (read 2026-11-13: 7 products, 9 prices at your amounts, a webhook to `billing-webhook`, the Customer Portal, Tax active). Remaining: set a software tax code on the products (the default is "general tangible goods"), confirm the two function secrets are set, and decide how to test: there are no test-mode copies, so either create them or run one live purchase with a 100% coupon and refund it | Billing end to end, the audit's top blocker |
| 3 | Legal operator (F-12): is the KpnSolute company formed, and what is its legal name? Privacy and Terms still carry placeholders | Real payments, the legal pages |
| 4 | Rename the Google sign-in app to "KpnSolute" in Google Cloud | Sign-in trust screen |
| 5 | Approve KpnIdentity settings B1 to B6 (email confirmation, Resend SMTP, 12-character passwords, leaked-password check, security emails, current password to change) | Account security |
| 6 | Answer `SERVICES_AND_DEPENDENCIES.md` section 9 (registrar, Render workspace, Stripe and Resend and Discord secrets, KpnAuth hosting) | An accurate inventory |
| 7 | Answer the questions in section 6 below (each has a recommended answer: "go with yours" works) | Build week starts without waiting |
| 8 | Reconnect Cloudflare in Composio: the connection shows active but its token is rejected for zones and DNS (error 9109) | Adding the `auth` hostname's record, Cache Rules, the HSTS setting, a `create` redirect |
| 9 | Tell me which Render workspace plan you are on, and fill in the "Confirm" rows of the cost ledger (`SERVICES_AND_DEPENDENCIES.md` section 2a) | Keeping recurring cost near zero on purpose |

### Agent prep (read-only or documentation, no new features)

| # | Prep | Output |
| --- | --- | --- |
| 1 | Review open PRs #59 and #73 against today's `main`: production runs migrations `000029` to `000032` and `000036` to `000038` that `main` does not contain, so a fresh canonical build differs from production | A merge plan with conflicts listed (`docs/backend/`), ready to execute |
| 2 | Re-score the pre-launch audit against today's production (it was 65 of 100, "not ready") | Remaining blockers, by owner |
| 3 | Write the launch smoke test: sign in, make a survey, publish, answer as a guest and as a member, read live results, buy in Stripe test mode, refund | A runnable checklist that next week turns into an e2e or manual script |
| 4 | Backups: compare turning on point-in-time recovery (currently off) with the daily backup, with cost | A recommendation for the owner |
| 5 | Confirm which KpnAuth items (K1 to K16) are still open and where KpnAuth is deployed | A list for the KpnAuth repo |
| 6 | **Done 2026-11-13** (founder go-ahead): the Render header rules and the `/templates` rewrites are applied and verified live; record and rollback in `docs/ops/RENDER_SETTINGS.md`. Left, optional: a small script that applies the repository's headers and rewrites through the API so they cannot drift again, then retiring `render.yaml`; the sign-in Worker's origin joins the CSP when that Worker ships | Done; drift-proofing is optional |
| 7 | Write the specs for `create.lunchvoice.com` (the creator app: a redirect first) and `pay.lunchvoice.com` (the payment site replacing the old GoDaddy-era one) | Two small specs, nothing deployed |
| 8 | Draft the one-dashboard layout for `create.lunchvoice.com` (section 2b): screens, navigation, the plan card, how locks and usage look | A one-page layout spec |

## 5. Next week: build order (starts 2026-11-16)

| Day | Build | Migration or deploy | Needs |
| --- | --- | --- | --- |
| 1 | Creator-controlled results (section 2): setting, entitlement keys, notices, dialogs, audit | 000054 | Q1 to Q3 answered |
| 1 to 2 | 30-day sign-in (section 3): Worker, `session` function actions, device sessions, Account devices, CSP | 000049, `session` deploy, Worker | Verification list, secret go-ahead |
| 2 | Routing: apply the Render header and rewrite fixes (services log section 2a), the `create` redirect, the `pay` Worker and site. Render API and Cloudflare; no new Render domains | Render settings, Cloudflare | Go-ahead for Render settings; founder action 8 |
| 2 | PostHog: seven events, no ids or answers, route-pattern rewriting, CSP, staff dashboard reads | none | Founder action 1 |
| 2 to 3 | Billing end to end: one purchase, webhook, entitlement, refund. Add the Creator Plus and Creator Pro prices to the database policy (`billing.stripe_prices` has 6 of 9 today) and make them purchasable (account-scoped); software tax code | function deploys, a policy update | Founder action 2, keys (credential go-ahead) |
| 3 | KpnAuth: the phone sign-in screen, headers, forgot password, product named on every screen (K1 to K10) | KpnAuth repo | Founder action 6 |
| 3 to 4 | KpnIdentity settings B1 to B6 through Composio, one approval each | settings | Founder action 5 |
| 4 | Reconcile production-only migrations with `main` (prep item 1) | none on production | Prep item 1 |
| 4 to 5 | If time: Hub Pulse Lite, simple community goals, manual weekly recap (the roadmap's launch-safe engagement items) | none expected | |
| 5 | Re-score the audit, run the smoke test, full e2e and database suites, freeze | | |

Rules that stay: tests pass before anything reaches `main`; migrations apply once tests pass and each apply is recorded
in `CHANGELOG.md`; a push to `main` deploys the site; new credentials, paid plans, DNS ownership and other products'
resources need an explicit go-ahead.

## 6. Open questions (each with the recommended answer)

| # | Question | Recommended |
| --- | --- | --- |
| Q1 | Section 2 reading: Team and Creator Pro choose live for elections and any type; Creator Plus keeps live on non-election surveys only | Yes |
| Q2 | Should "Instant answers" (no groups of 5) exist as a disclosed opt-in on Team and Creator Pro, or should anonymous answers always be grouped? | Opt-in with the disclosure and the creator dialog |
| Q3 | Default Results setting for new surveys on live-capable plans | Live (as shipped); elections at close |
| Q4 | Creator Trend counts (Plus 3, Pro 10) are provisional in the plan map | Keep 3 and 10 for launch, revisit with usage |
| Q5 | Image-choice pictures: the site's policy blocks outside image hosts | Store them in a private Supabase bucket like logos (no new service) |
| Q6 | Officer election template is an anonymous invite-only secret ballot (the brief listed it as identified) | Keep anonymous |
| Q7 | Do feature-complete 2026-11-21 and public launch 2026-12-01 still hold? Production policy `billing.launched_at` is already set to 2026-12-12T17:12Z (billing opens then) | Confirm which date is the launch, then make the three match |
| Q8 | Quiz: show each respondent their score after submitting? Build trivia timing and a leaderboard? | Score yes, trivia timing after launch |
| Q9 | After sign-in a visitor's survey is published automatically (today) or left as a draft | Leave as a draft |
| Q10 | Charts use the Hub's colour inside a Hub and amber elsewhere | Keep |
| Q11 | A true HTTP 404 and per-Hub share images need the apex as a proxied CNAME (section 3, optional) | After launch |
| Q12 | The Team plan copy was rewritten to what exists ("More custom Hub pages", "Aim identified Campaigns at chosen roles"). What should Team actually add? | Decide after launch from usage |
| Q13 | **Answered 2026-11-13:** `pay.lunchvoice.com` is the payment site (Stripe), replacing the old GoDaddy-era site | Worker (free), nothing on Render |
| Q14 | **Answered 2026-11-13:** the address is `create.lunchvoice.com`. Still open: start as a plain redirect to `lunchvoice.com/create` | Redirect first |

## 7. Shipped this week (reference)

Production migrations applied 2026-11-13: `000042` Linked Questions, `000043` and `000048` survey branding, `000044`
Trends and analytics, `000045` and `000046` delete survey and the Kitchen's public poll, `000047` 16 question types
and 82 templates, `000050` and `000051` sign-in on survey links and Creator limits on My home, `000052` respondent names,
`000053` live results by plan. Each is recorded in `CHANGELOG.md` with how it was verified.
