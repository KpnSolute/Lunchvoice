# LunchVoice four-week launch roadmap (2026-11-16 to 2026-12-12)

Written 2026-11-14 for the founder. This is the plan the build agents execute. They do not re-decide anything in it:
where a choice was needed, this file makes it (marked **Default**) and the founder may override it in one line.
Order of authority is unchanged: `docs/v2/LAUNCH_PLAN.md`, the canonical master spec, `PRODUCT_DIRECTION_2026-11-11.md`,
`LAUNCH_PREP_PLAN_2026-11-13.md`, then this folder. This folder wins on **build order and scope** (it is newer); it
never overrides a price, a privacy rule or an approved entitlement.

Progress lives in `TRACKER.md` (one row per spec) and `CHANGELOG.md` (one entry per change).

Read in this order: this file, `01_PURPOSE_AND_ACCESS_MAP.md` (why every feature exists and who gets it),
`02_FEATURE_SPECS.md` (spec for spec), `03_PLATFORM_DOMAINS_AND_SERVICES.md` (`auth`, `create`, `pay`, Discord, Stripe),
`04_SECURITY_AND_OPERATIONS_HARDENING.md`, `05_WEEK4_UI_UX_REDESIGN.md`.

Evidence labels used throughout: **F** observed fact (file, query or page read), **J** judgment, **A** assumption to
confirm.

---

## 1. The idea this roadmap hardens

LunchVoice started as a lunch survey for one food-service operation. Version 2 is a community platform: **Discord is
where a community talks; LunchVoice is where it decides.** A person joins a Hub (a community), is asked things,
answers (anonymously when the creator promises it), watches the result arrive, and then sees **what the community
decided and what changed because of it**. SurveyMonkey sells a company a way to extract answers from people it treats as
subjects. Kahoot gives a room a game. LunchVoice gives a community a voice that is heard: answers come back to the people
who gave them, and the people running the Hub are accountable for what they do with them.

Every feature in this folder must pass one test, written into its spec as **Purpose**: *which person is better off, and
how?* A feature that cannot answer that in one sentence is cut or hidden, not shipped half-built.

The product loop, which every week of this plan serves:

1. **Ask** (surveys, polls, ratings, ideas, elections, quizzes), from a link, a code, a Hub or Discord.
2. **Answer** (free for everyone, anonymous when promised, in seconds on a phone).
3. **See** (live or at-close results, by the plan and the creator's choice, never past the privacy engine).
4. **Decide** (a Hub records the decision, who made it and why).
5. **Show the impact** ("You said, we did": the decision and its result are shared back to the members who answered).

## 1a. The four pillars (what LunchVoice is, and what each must be at launch)

LunchVoice stands on **four pillars of equal weight**, over one foundation. No pillar is "the centre"; a launch that
is strong in one and thin in another fails. Each pillar has an exit criterion at G3, and the gate is not passed
until all four pass.

| Pillar | The promise to a person | Features (spec IDs in `02_`) | Exit criterion at G3 (Fri 12-04) |
| --- | --- | --- | --- |
| **Analytics** (see, understand, decide, show impact) | "I can see what my community thinks, trust the numbers, act on them, and show people what changed." | C1 visibility, C2 Decisions, C3 shared results, C4 advanced analytics, C5 Trends, C6 Hub health (with E10 Pulse), C7 digest, C8 embeds | A manager runs ask, answer, see, decide, show-impact with no developer help; the differencing and plan matrices pass |
| **Survey design** (ask well) | "Making a survey is fast, good-looking and correct, on a phone or a laptop, alone or with a helper." | Y1 studio, Y2 preview and test, Y3 templates and question bank, Y4 brand kit and themes, Y5 co-creator, D1 elections, D2 quiz, D3 question parity, D4 Live Session Lite, D5 recurring | The 21 kinds by 82 templates matrix is all green; a new account publishes its first survey in under 3 minutes; the 20-question branch fixture passes |
| **Social presence** (belong) | "This is a place with people in it. I have a face, I get noticed, I am not spammed, and I am safe." | E1 profiles, E2 presence and Hub identity, E3 notifications, E4 points and shop, E5 comments and reactions, E6 reports and appeals, E7 onboarding, E8 Discover, E9 activity and directory, **E10 Hub Pulse** (heartbeat, voice, mood check, goals, weekly recap), **E11 usernames and display names (the Discord way)** | A new member joins, sees who is here, gets a welcome, a notification and a reward; a report reaches the right queue |
| **Connectivity** (reach people, plug into tools) | "My survey reaches the people I mean, wherever they are, and my data reaches the tools I use." | F1 to F5 Discord, G1 API, G2 webhooks, N1 share kit, N2 invite by email, N3 recipes, C8 and N4 embeds, the `create` and `pay` hosts, A1 sign-in across hosts | A survey is shared by link, QR, code, email and Discord and arrives each time; a webhook and an API call work against a test Hub |

**Foundation** (not a pillar, but every pillar stands on it): identity and sessions (A), money (B), release hygiene (R),
security and operations (`04_`), the privacy engine. Foundation work is weeks 1 and 3; pillar work is weeks 1 to 3 in
parallel lanes, so no pillar waits for another.

**The loop** every pillar serves: Ask (survey design, connectivity) → Answer (social presence, connectivity) → See and
Decide and Show impact (analytics). Decisions and "You said, we did" are one important feature inside the analytics
pillar, not the identity of the product.

**Lane balance rule.** At every daily standup the governing agent checks that each pillar has work in flight. If one pillar has
had no merged work for two working days, it gets the next free agent before any new P1 starts.

## 2. Shape of the four weeks

Today is Saturday 2026-11-14. Launch and billing open **Saturday 2026-12-12 at 17:12 UTC** (set in the admin portal; F:
`billing.launched_at`). Founding Hubs keep Starter features free until 30 days after that date (2027-01-11).

| Week | Dates | Theme | Gate at the end |
| --- | --- | --- | --- |
| 1 | Mon 11-16 to Fri 11-20 | **Foundation and money**: release hygiene, 30-day sign-in, the three platform hostnames, billing end to end including Creator plans, creator-controlled results | G1: billing proven with a real test purchase and refund; sign-in lasts 30 days; production and `main` agree |
| 2 | Mon 11-23 to Fri 11-27 (US holiday Thu 11-26: plan for four working days) | **The decision platform**: decisions and impact, shared results, advanced analytics, elections finished, quiz mode, recurring surveys | G2: a Hub can run the full ask, answer, see, decide, show loop with no developer help |
| 3 | Mon 11-30 to Fri 12-04 | **Community, Discord, integrations and hardening**: notifications, profiles, points and shop finished, Discord as the decision place, API, security work, the Kitchen | **G3, the hard backend freeze (Fri 12-04, end of day): every half-built service is finished or removed from view** |
| 4 | Mon 12-07 to Fri 12-11, launch Sat 12-12 | **The mass UI and UX refresh** on a frozen backend, then launch checks | G4: go or no-go on Fri 12-11 |

**Default (week 3 gate).** After G3 no migration, Edge Function or entitlement-map change is merged except a security fix
or a launch blocker the governing agent approves. Week 4 changes only `src/`, `public/`, copy and design tokens.

**Default (design runs early).** The UI refresh is *applied* in week 4, but it is *designed* in weeks 1 to 3 by a design
track that never touches the backend (section 6). Functional screens for new backend features are built in weeks 1 to 3
inside the existing design system, plain and correct, so the refresh re-skins working screens instead of inventing them.

## 3. Rules every agent follows

1. **Finish or hide.** Nothing half-built is visible at launch. A feature that misses G3 is removed from navigation, pricing
   copy and the plan card the same day, and listed in section 9 as post-launch. No "coming soon" badge on anything that
   gates a paid claim.
2. **One entitlement map.** Plan behavior lives only in `lv.plan_limits` and `lv.feature_allowed`. The UI reads the answer.
   New keys are added in the migration that ships the feature, with a rollback and a pgTAP test.
3. **The privacy engine is not negotiable.** Min cohort 5, withheld never zero, anonymous differencing defences, eligibility
   proof kept apart from answers. Every new reporting surface (shared results, embeds, exports, digests, Discord cards,
   API) reads the same engine; none re-implements suppression.
4. **Lowest possible cost.** Free tiers first. No new Render custom domains. Every new hostname goes through Cloudflare.
   A recurring cost needs the founder's yes and a line in the cost ledger (`SERVICES_AND_DEPENDENCIES.md` section 2a).
5. **No customer is special-cased in code.** The Kitchen (LunchVoice's own Hub) is made through the public flow like any
   Hub; a config value may point the landing page at it, no logic may branch on its name.
6. **Tests before main; migrations once tests pass.** Procedure unchanged (Management API, one transaction per file, history
   row, verify, changelog). New credentials, paid plans, DNS ownership and Stripe live changes need an explicit yes.
7. **Backend first, then skin.** Weeks 1 to 3 ship behavior and correct plain screens. Weeks 1 to 3 do not polish.
8. **Every feature has a spec ID** (section letters in `02_FEATURE_SPECS.md`) and a "Done when" list. Done means the list
   passes, not that code exists.
9. **Update the inventory in the same commit** as any service, secret or hostname change
   (`docs/ops/SERVICES_AND_DEPENDENCIES.md`), and `CHANGELOG.md` for every operation.
10. **Track every change.** The Work Tracking Protocol in `AGENTS.md` and `CLAUDE.md` applies to every agent: a changelog entry in the
    fixed format and an updated row in `TRACKER.md`, in the same commit, with status claimed only as far as the evidence goes. The
    founder reads progress from those two files.

## 4. Priorities

- **P0**: launch blockers and everything half-built. Mandatory by G3. If a P0 cannot finish, it is cut from the product
  surface, not left rough.
- **P1**: should ship; finish if the P0 lane is clear by Wednesday of week 3. Otherwise post-launch, honestly labelled.
- **P2**: post-launch (V2.x). Listed so nobody builds it early.

## 5. The half-built inventory (what exists but is not finished)

This is the audit the founder asked for: every service or feature that exists in some form but would embarrass us if a
paying customer touched it today. Each has one disposition. Evidence is in the right column.

| # | Item | State today | Disposition | Spec | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | Production and `main` disagree: migrations 000029 to 000032 and 000036 to 000038 run in production but are not on `main` (PRs #59 and #73 open) | Fresh database builds differ from production | **Finish (day 1)**: merge, rebuild from empty, prove equal | R1 | `SERVICES_AND_DEPENDENCIES.md` section 4; CHANGELOG |
| 2 | Elections | Code and migrations live on unmerged PR #73; election results never use the live path | **Finish**: full election system | D1 | PR #73; CHANGELOG 000053 notes |
| 3 | Team claims "Enhanced Campaign modes" and "Advanced analytics" | Advertised, nothing distinguishes them | **Build both, defined concretely** | C4, D1, D2, D4 | `BILLING_FULFILLMENT_AUDIT_2026-11-11.md` |
| 4 | Creator Plus ($5) and Creator Pro ($15) cannot be bought | Prices in price list (2026-11-14), `purchasable=false`, no person-scoped checkout or grant | **Finish** | B1 | `lv.policy` read; CHANGELOG 2026-11-14 |
| 5 | Creator plan copy says "Trends, results charts, new question types and templates: coming soon" | Trends (000044), 16 question types and 82 templates (000047) are live in production | **Fix the copy** (week 4, flagged now) | UI copy list | `src/config/pricing.ts` lines 110 and 115 versus CHANGELOG |
| 6 | Template "Trivia night" is flagged (timed, leaderboard); its "Use" button is hidden | 1 of 82 templates unusable | **Finish** with quiz mode and live session, else hide the template | D2, D4 | `templates.json` flags |
| 7 | 30-day sign-in | Designed, migration 000049 reserved, nothing built | **Build** | A1 | `LAUNCH_PREP_PLAN` section 3 |
| 8 | `create.lunchvoice.com`, `pay.lunchvoice.com`, `auth.lunchvoice.com` | `pay` is still a proxied CNAME to GoDaddy (`paylinks.commerce.godaddy.com`); `create` and `auth` have no DNS | **Build** | `03_` | DNS read 2026-11-14 |
| 9 | Billing never completed with a real payment | Proven to Stripe Checkout and in database tests only | **Prove** (one real purchase, one refund) | B2 | `BILLING_FULFILLMENT_AUDIT` |
| 10 | Tax code on Stripe products is the default "general tangible goods" | Wrong for software | **Founder sets**, agent verifies | B2 | `LAUNCH_PREP_PLAN` founder action 2 |
| 11 | Hub identity: presence, topic tags, badges, Discord server card | Drafted SQL only, never run; Hub card fields `created_at`, `online`, `tags` requested of backend | **Finish** (small) | E2 | `docs/v2/handoffs/drafts/hub_identity*.sql` on PR #72; `API_CONTRACT.md` end |
| 12 | Points, shop, leaderboard, news, comments | Pages and operations exist; roadmap row 14 says "partial" | **Finish**: rules, moderation, privacy | E4, E5 | `EXECUTION_ROADMAP.md` row 14 |
| 13 | Reports and moderation | Report buttons and a staff queue exist | **Finish**: appeals, Hub-level moderation, notices | E6 | CHANGELOG |
| 14 | Discord: link, connect, post, roles | Function deployed (v11); secrets and a live server test unconfirmed; banner image outdated | **Finish and prove live** | F1 to F5 | Services log sections 3 and 5; brand report |
| 15 | Notifications | Email outbox only; no in-app notifications | **Build** | E3 | `email-dispatch` only |
| 16 | PostHog, Sentry, Turnstile, uptime monitor | "Planned, not adopted" | **Adopt (free tiers)** | G5, S-series | Services log |
| 17 | Backups: point-in-time recovery off, one daily backup | Recovery gap | **Decide and rehearse a restore** | S-ops | Services log section 4 |
| 18 | KpnIdentity settings B1 to B6 and KpnAuth K1 to K16 | Open | **Founder approves, agent applies** | S-series | `LAUNCH_PREP_PLAN` |
| 19 | Legal pages carry "pending review" placeholders; legal operator unnamed (F-12) | Cannot take real payments cleanly | **Founder** | S-legal | `LAUNCH_PLAN` |
| 20 | Team limits "provisional": custom pages 10, active Campaigns 15 | Visible as provisional | **Default**: adopt as final for launch | pricing map | A-04 |
| 21 | Supabase legacy keys retire early 2027 | Callers still use them | **Finish the switch** | S-series | `V2_STATUS` item 6 |
| 22 | Open PRs: #72 (docs/v3 roadmap, Trends spec), #74 (hero), #73, #59, plus #28 to #31 (stale) | Docs the plan relies on are not on `main` | **Triage day 1**: merge #72, #74; #59 and #73 per R1; close #28 to #31 if superseded | R1 | `gh pr list` |
| 23 | Brand leftovers: Discord banner source missing; bot avatar not uploaded; headline test unmeasured | Cosmetic | **Finish in week 4** | UI | Brand report |

## 6. Agent roster and who owns which files

| Agent | Owns | Never touches |
| --- | --- | --- |
| **Backend** | `supabase/migrations`, `supabase/rollbacks`, `supabase/tests`, `lv_api`, `docs/backend` | `src/` |
| **Edge** | `supabase/functions`, `workers/*`, Cloudflare and Stripe configuration through Composio | migrations |
| **UI-functional** (weeks 1 to 3) | `src/` behavior, mock transport, e2e; plain screens inside today's design system | tokens, brand, global style |
| **Design** (weeks 1 to 3, no code) | Figma frames (Figma MCP), token proposals in `docs/frontend/design-system/DESIGN_EXTENSIONS.md`, landing storyboards, asset briefs | anything under `src/` |
| **UI-refresh** (week 4 only) | `src/ui/tokens.css`, `src/components/shadcn`, pages, `public/`, landing | migrations, functions |
| **QA and Security** | `e2e/`, `docs/compliance`, test scripts, the S-series checks | product code (reports, then hands off a fix) |
| **Governing** (this role) | integration, `CHANGELOG.md`, brain files, production applies, reviews every handoff | |

Handoff format (unchanged): objective, scope, branch, changed files, checks, commit, blockers, next action.

## 7. Day by day

Items name a spec in `02_FEATURE_SPECS.md`. Approvals needed are in **bold**.

### Week 1: foundation and money (11-16 to 11-20)

| Day | Backend | Edge | UI-functional | Design | QA and Security |
| --- | --- | --- | --- | --- | --- |
| Mon | R1 reconcile production-only migrations with `main`; rebuild from empty and diff against production schema; merge #72 and #74 (**Design starts the 500-site hunt: list and pilot, `docs/frontend/design-research/SAAS_SITE_HUNT_PLAN.md`**) | A3 DNS and rules: `auth` as a Worker Custom Domain; `create` and a temporary `pay-next` as proxied CNAMEs with Origin, URL Rewrite and Response Header rules (`03_` section 3). DNS records are covered by D-01; nameserver changes are not | Adopt reconciled `main`; fix any e2e drift | Kick-off: audit the live site at 375, 768, 1440; moodboard; one-page design principles for the founder | Baseline: Supabase advisors on both projects; `npm audit`; list every table without RLS (expect none); record in `docs/compliance/` |
| Tue | C1 results visibility setting (migration, keys, notices, audit) | A1 `workers/auth-session` skeleton plus `session` function actions (`issue`, `refresh`, `revoke`, `revoke-all`) | C1 screens: the Results setting and respondent notice | Figma: landing, Hub card, creator dashboard frames | pgTAP matrix for C1 (plan by setting by anonymity by election) |
| Wed | A1 device sessions migration (000049): families, rotation, reuse detection | A1 finish and deploy to its own hostname; run the Safari, Chrome and Firefox cookie checks | A2 hostname-aware routing (`hostMode`), Account "Devices" list and "Keep me signed in" | Figma: Player and results frames | Cookie verification report |
| Thu | B1 person-scoped billing: intent, grant, renewal, cancel, downgrade fallbacks | A4 `pay` host: stage on `pay-next`, rehearse the rollback; **founder go-ahead to repoint `pay` from GoDaddy (the Stripe webhook URL is not changed)**. B8 armed billing release (tests) | B3 billing screen shows Creator plans, usage and the portal | Figma: studio and Hub console frames | S-series: Turnstile design, CSP diff |
| Fri | B1 proof in database; B6 receipt and failed-payment emails | **B2 one real purchase (Starter, $13) with a 100% coupon, then a real refund** (founder acts, agent verifies) | Fix e2e; update `routes.json` | Token proposals for founder review | **Gate G1** report |

### Week 2: the decision platform (11-23 to 11-27)

| Day | Backend | Edge | UI-functional | Design | QA and Security |
| --- | --- | --- | --- | --- | --- |
| Mon | C2 Decisions: tables, statuses, permissions, audit | | Decisions screens (Hub Decisions tab, decision card) | Figma: decision and impact surfaces | Privacy tests for C2 and C3 |
| Tue | C3 Share results with members: snapshot engine, visibility, entitlement | Webhook events `decision.published`, `results.published` (G2) | "Publish results" flow with a preview of exactly what members will see | Interaction prototypes for the landing | Differencing attack tests on shared snapshots |
| Wed | C4 Advanced analytics: breakdowns, compare, exports, participation funnel | | Analytics screens for Team and Pro | Landing animation prototypes (live poll hero, anonymity explainer) | Suppression tests per dimension |
| Thu (holiday) | D1 elections: reconcile PR #73 with the election spec; ballot methods | | | Asset production (SVG, motion) | |
| Fri | D2 quiz mode; D5 recurring schedules and Ask again; C5 Trends completion | | Election and quiz screens | Token proposals v2 | **Gate G2** report: a scripted run of the whole loop |

### Week 3: community, Discord, integrations, hardening, freeze (11-30 to 12-04)

| Day | Backend | Edge | UI-functional | Design | QA and Security |
| --- | --- | --- | --- | --- | --- |
| Mon | E3 notifications; E1 profiles and Hub nicknames | F1 Discord OAuth link (new secret: **founder go-ahead**) and `/lunchvoice` command parity | Notification centre; profile edit | Final Figma review with the founder; copy v1 frozen | S-series: pen-test checklist pass 1 |
| Tue | E4 points and shop rules; E5 comments, reactions, moderation; E2 presence, tags, badges, Discord card | F2 to F4 Discord server connect, role rules, decision posts | Shop and leaderboard finish; moderator tools | Asset handoff to UI-refresh | Webhook SSRF test; API key tests |
| Wed | E6 reports and appeals; E8 Discover finish; K1 the Kitchen's seed content through the public flow | G1 API v1 and OpenAPI; D4 Live Session Lite edge pieces | D4 screens. **P1 cut line: anything not passing review today is hidden** | Design tokens v4 signed off by the founder | Restore drill: restore a backup to a scratch project and verify |
| Thu | Hardening fixes only; load test of the submit path | Turnstile, PostHog, Sentry wired; uptime monitor | Hide or remove cut features; update copy lists | | Pen-test pass 2; secrets scan; incident drill |
| Fri | **Freeze.** Final production applies approved; backend tag | Final function deploys | e2e green | Deliver token package | **Gate G3** report |

### Placement of the pillar specs that were added after the first draft

| Spec | Week and day | Agent |
| --- | --- | --- |
| Y1 studio finish | W1 Wed to W2 Tue | UI-functional (with Backend for conflict handling) |
| Y2 preview, test mode, checklist | W2 Mon to Wed | Backend (test flag), UI-functional |
| Y3 templates and question bank | W2 Wed to Fri | Backend, UI-functional |
| Y4 brand kit | W2 Thu to W3 Mon | Backend, UI-functional |
| Y5 co-creator (P1) | W3 Tue to Wed | Backend, UI-functional |
| N1 share kit and preview cards | W3 Mon to Wed | Edge (Worker), UI-functional |
| N2 invite by email | W3 Mon to Wed | Backend, Edge |
| N3 recipes | W3 Thu | QA |
| N4 and C8 embeds (P1) | W3 Wed, needs the Render header go-ahead | Edge |
| E9 activity and directory | W3 Tue to Wed | Backend, UI-functional |
| E10 Hub Pulse | W2 Fri (data) to W3 Wed | Backend, UI-functional |
| E11 usernames and display names | W1 Wed to Fri | Backend, UI-functional |
| A6 sign-in and sign-up screens | Design W1 to W2, build W3 (KpnAuth Worker), `/signin` entry W4 | Design, Edge, UI-refresh |

The week-1 to week-3 day tables above show the heaviest items; the placement table adds these lanes in parallel. If a lane
conflicts with the pillar balance rule (section 1a), the governing agent reassigns.

### Week 4: UI and UX refresh (12-07 to 12-11), then launch

See `05_WEEK4_UI_UX_REDESIGN.md`. Backend changes are bug and security fixes only.

| Day | Work |
| --- | --- |
| Mon | Tokens, shadcn layer, shell (header, rail, footer), motion primitives |
| Tue | Landing (interactive hero, anonymity explainer, pricing), `/templates`, `/discover` |
| Wed | Player and results (the highest-traffic screens), creator dashboard at `/create` |
| Thu | Hub console, Decisions, analytics, billing, account, admin tidy; copy pass; fix the pricing copy (inventory row 5) |
| Fri | Accessibility and performance pass, three themes, 390/768/1280, QA sign-off, **G4 go or no-go** |
| Sat 12-12 | 17:12 UTC billing opens. Monitor. No deploys in the first four hours except a rollback |

## 8. Founder actions (dates are deadlines)

| By | Action | Unblocks |
| --- | --- | --- |
| Sun 11-15 | Answer, or accept, the defaults in section 10 (silence means "go with yours") | Week 1 start |
| Mon 11-16 | Tell us where KpnAuth's source and deploys live (`auth.kpnsolute.com` is a Cloudflare Worker; its repository is not in the KpnSolute GitHub organisation) and approve the providers in X-18 | A6 |
| Mon 11-16 | Supabase is on **Pro** with daily backups and PITR off (read 2026-11-14). Decide PITR: recommended **keep off for launch**, prove the daily backup with the restore drill (DR-01), revisit with paying customers | Backups |
| Mon 11-23 | Name the legal operator and approve counsel's review plan; approve KpnIdentity settings B1 to B6 one by one | Legal, account security |
| Wed 11-18 | Set a software tax code on the Stripe products; confirm `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set in Supabase | B2 |
| Thu 11-19 | **Approved 2026-11-14 ("go ahead"); executes Thursday after the `pay-next` staging checks pass.** repoint `pay.lunchvoice.com` from GoDaddy (the Stripe webhook URL stays as it is), generate the shared Worker secret, add the `create` and `pay` callback URLs in KpnIdentity | A4, A1 |
| Fri 11-20 | Perform the live $13 test purchase with a 100% coupon and refund it, with the agent watching | G1 |
| Mon 11-30 | Create the **"KpnSolute" Discord application for sign-in** (client ID and secret go into KpnIdentity's Discord provider in the Supabase dashboard yourself, never into chat) and approve the KpnIdentity provider setting; create the Discord OAuth client secret; confirm the `DISCORD_*` secrets; invite the bot to the Kitchen's server | F1 to F4 |
| Wed 12-02 | Approve design tokens v4 and the landing storyboard | Week 4 |
| Fri 12-11 | Go or no-go; if go, **arm the billing release** (B8, typed `ARM RELEASE`) so billing opens at 17:12 UTC on 12-12; if not armed, billing stays closed and nobody is charged | Launch |

## 9. What is not at launch (honest list)

These are V2.x or V3 (`docs/v3/ROADMAP.md` on PR #72). Nothing here may be built early or advertised.

Multilingual surveys, Pulse Pro (AI insight, custom scoring), competitive goals, missions and achievements beyond the badges in E2,
quests, Living Surveys, the Decision Engine and outcome intelligence, AI summaries and theme detection, the full live
room with player scoring, Reddit, Slack and Teams integrations, a respondent reward marketplace, white-label domains,
SSO, TwinLab. Image uploads for avatars and Hub backgrounds come after launch (E1 ships colour-plus-emoji avatars, as
the product direction already says).

## 10. Defaults chosen for the founder

**Approved by the founder on 2026-11-14 ("go with urs"): every default X-01 to X-17 below stands.** A later change is one line in this table.

| ID | Question | Default |
| --- | --- | --- |
| X-01 | Results visibility reading (Q1 to Q3) | As written in the prep plan: Team and Creator Pro choose live including elections and instant answers; Creator Plus keeps live on non-election surveys; elections default to "when the survey closes" |
| X-02 | Creator Pro includes standalone elections? | No at launch; elections need a Hub member roll |
| X-03 | Elections by plan | Starter Hub: plurality, 1 active election. Team Hub and Campaign Plus: plurality, approval and ranked choice, 3 active elections |
| X-04 | Quiz score shown to the respondent after submitting (Q8) | Yes; timed play and a live leaderboard are P1 (D4) |
| X-05 | After sign-in, a visitor's survey is left as a draft (Q9) | Draft |
| X-06 | Team limits provisional values (A-04) | Final for launch: 10 custom pages, 15 active Campaigns |
| X-07 | Discover lives at `lunchvoice.com/discover`, not `discovery.lunchvoice.com` | Path only (no extra hostname, cost rule) |
| X-08 | Image-choice pictures stored in a private bucket (Q5) | Yes |
| X-09 | Charts use the Hub colour in a Hub, amber elsewhere (Q10) | Keep |
| X-10 | Apex as proxied CNAME to Render (Q11) | After launch |
| X-11 | Creator perks beyond branching, branding, live results and the Trends allowances | Only what `01_` marks "approved"; everything marked "proposal" waits for the founder |
| X-12 | The Kitchen is a normal Hub with slug `kitchen` | Yes, seeded only through the public flow and its own Discord server |
| X-13 | `create.lunchvoice.com` is served (same build, hostname-aware), not a redirect | Served: the 2026-11-13 founder handoff made it the creator home; this supersedes the earlier "redirect first" answer to Q14. A redirect stays as the fallback (`03_` section 4) |
| X-14 | Checkout style | Stripe-hosted Checkout (redirect), not embedded, so the site's script policy is unchanged |
| X-15 | Stripe webhook endpoint | Unchanged (Supabase function URL); no proxy through `pay` |
| X-16 | Launch does not auto-charge anyone | Billing opens only if armed (B8); people buy by choice; Founding grants end by policy |
| X-17 | `status`, `help`, `developers`, `api`, `discovery` hostnames | Not created at launch (paths instead); reserved so no Hub can take them |
| X-18 | Sign-in providers | **Approved 2026-11-14:** Google, Discord and email with password at launch. Apple, Microsoft, Clever and SSO are not at launch (`02_` A6) |

## 11. Risks

| Risk | Likelihood | Effect | Mitigation |
| --- | --- | --- | --- |
| Week 4 is five days for a heavy redesign | High | Redesign half-applied at launch | Two tiers (`05_`): bespoke redesign for the screens people see first, token inheritance for the rest; design done in weeks 1 to 3; copy frozen Dec 2 |
| Elections reconcile (PR #73) is bigger than a day | Medium | Slips week 2 | R1 sizes it on Monday; if it cannot finish by Thu 11-26, elections ship single-office plurality only and the other methods move to V2.x with the Team copy adjusted |
| 30-day cookie is capped by Safari | Medium | Sessions shorter than promised | Verify on day 3; ship 7 days and say so; never fall back to `localStorage` |
| Billing cannot be proven with a live test | Low | Launch risk | One coupon purchase and refund on Fri 11-20; if it fails, billing stays closed and the date moves |
| Scope creep | High | G3 missed | Rule 1 in section 3; a P1 is cut on Wednesday of week 3 without discussion |
| Holiday week | Certain | Four working days | Week 2 loads only what four days hold |
| The founder is the single approver | Medium | Waiting | Section 8 lists every approval with a date; the defaults in section 10 remove most questions |

## 12. Spec index

| Letter | Area | Specs (in `02_FEATURE_SPECS.md`) |
| --- | --- | --- |
| R | Release hygiene | R1 |
| A | Identity and the edge | A1 30-day sign-in, A2 hostname-aware app, A5 Turnstile, A6 sign-in and sign-up screens (A3 and A4 are in `03_`) |
| B | Money | B1 Creator purchases, B2 real-purchase proof, B3 billing screens, B4 Campaign passes, B5 name reservation, B6 money emails, B7 entitlement edge cases, B8 armed billing release |
| Y | Survey design | Y1 to Y5 |
| N | Connectivity | N1 share kit, N2 invite by email, N3 recipes, N4 embeddable answer link |
| C | Decide, share, analyse | C1 results visibility, C2 Decisions, C3 shared results, C4 advanced analytics, C5 Trends, C6 Hub health, C7 digest, C8 embeds |
| D | Campaign modes | D1 elections, D2 quiz, D3 question-type parity, D4 Live Session Lite, D5 recurring, D7 participation receipt |
| E | Community | E1 profiles, E2 Hub identity, E3 notifications, E4 points and shop, E5 comments and moderation, E6 reports and appeals, E7 onboarding, E8 Discover, E9 activity and directory, E10 Hub Pulse, E11 usernames and display names |
| F | Discord | F1 link, F2 server and roles, F3 decision posts, F4 onboarding, F5 limits |
| G | Platform | G1 API, G2 webhooks, G3 export and deletion, G4 admin, G5 analytics, G6 creator dashboard |
| K | The Kitchen | K1 |
| S | Security and operations | `04_` |
| UI | Week 4 | `05_` |
