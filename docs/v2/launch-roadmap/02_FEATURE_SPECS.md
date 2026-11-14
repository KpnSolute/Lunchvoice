# Feature specs (weeks 1 to 3)

Spec for spec: each feature below is complete enough that a build agent needs no further product decision. Where a
choice was open, the spec states the **Default** and `00_ROADMAP_4_WEEKS.md` section 10 lists it for the founder.
Column or function names are the contract; migration numbers are assigned in merge order starting at the next free
number after 000054 (000049 is reserved for A1). The backend agent checks `supabase/migrations` before numbering.

**Template for every spec**: Purpose · Who and access · Behavior and rules · Data · API and edge · Functional screens ·
Privacy and security · Tests · Done when · Depends on.

**Global rules that apply to every spec** (not repeated): `lv_api` only from the frontend; failures return
`{ok:false, error:{code,...}}` with codes from `API_CONTRACT.md` (new codes are added there in the same PR); RLS on every
exposed table; explicit grants; views `security_invoker = on`; every write that changes money, access, results or
membership writes `lv.audit_events` (columns `action`, `target`, `detail`); new policy values go in `lv.policy`; every
migration has a rollback in `supabase/rollbacks/` rehearsed by `scripts/db-test-canonical.sh`; mock transport and e2e
for every new operation; no v1 reference; no customer name in code.

---

## R. Release hygiene

### R1. Reconcile production with `main` (Mon 11-16)

- **Purpose.** A fresh database built from `main` must equal production, or no test proves anything.
- **Behavior.** (1) List `supabase_migrations.schema_migrations` in production. (2) Merge PR #73 (000036 to 000039:
  feedback types, elections, election night) and PR #59 (000029 to 000032) into `main` in order, resolving conflicts so
  that migration files equal what production ran (compare SHA-256 recorded in `CHANGELOG.md`; where a production
  migration was applied under a different name, record the mapping, do not rewrite history). (3) Merge #72 (docs) and
  #74 (hero). (4) Close #28 to #31 if superseded, with a note. (5) Rebuild from empty with `scripts/db-test-canonical.sh`;
  dump `pg_dump --schema-only` of the result and of production (read-only through the Management API); diff function
  bodies and table definitions; every difference is explained or fixed.
- **Done when.** The diff is empty or fully explained in `docs/backend/RECONCILIATION_2026-11-16.md`; the canonical suite
  and `npm run test:pr` are green on `main`; the elections code is on `main`.
- **Sizing note.** If the election merge takes more than Monday, the backend agent says so at the end of the day; the
  fallback is in `00_` section 11.

---

## A. Identity and the edge (details of hostnames in `03_`)

### A1. 30-day sign-in on a device

- **Purpose.** People who come back every few days should not sign in again; creators move between `lunchvoice.com` and
  `create.lunchvoice.com`.
- **Who.** Everyone who signs in. Default on, off for shared computers.
- **Behavior.** As designed in `LAUNCH_PREP_PLAN_2026-11-13.md` section 3, unchanged: Worker `workers/auth-session/` on the
  Custom Domain `auth.lunchvoice.com`; host-only cookie `__Host-lv_device`, `Secure; HttpOnly; SameSite=Strict;
  Path=/; Max-Age=2592000`; stateless Worker calling the `session` function with a shared secret; refresh credentials
  hashed, single use, rotated on every use, **reuse of an old credential revokes the whole family**; sliding 30-day
  expiry; CORS echo only for `^https://(www\.)?lunchvoice\.com$` and the platform hostnames `create` and `pay`
  (an allow-list, not a pattern), `Vary: Origin`, required header `x-lv-csrf: 1`.
- **Added by this roadmap.** Allowed origins are an explicit list in policy `auth.allowed_origins`
  (`https://lunchvoice.com`, `https://www.lunchvoice.com`, `https://create.lunchvoice.com`, `https://pay.lunchvoice.com`).
  Step-up: billing changes, owner transfer, Hub delete and account delete still require a session issued within
  `security.reauth_seconds` (600): a refreshed 30-day session does not satisfy it, the user must re-authenticate.
  Maximum 10 active device sessions per account; the oldest is revoked on the eleventh.
- **Data.** Migration 000049: `lv.device_sessions` (id, account_id, family_id, token_hash, device_label, created_at,
  last_used_at, expires_at, revoked_at, replaced_by), RLS on, no API-role grants, `service_role` only; `lv.session_family_revoke`.
- **API.** `lv_session_list()`, `lv_session_revoke(p_id)`, `lv_session_revoke_all()` for the signed-in person (device
  list); function actions `issue`, `refresh`, `revoke`, `revoke-all` are service-only.
- **Screens.** Account: "Signed-in devices" (label, last used, this device, Revoke), "Sign out everywhere";
  sign-in: "Keep me signed in on this device".
- **Security.** CSP `connect-src` gains `https://auth.lunchvoice.com`; a leaked cookie works only against the Worker and
  cannot be read by script; rotation plus reuse detection; no token in `localStorage`; logs hold ids, never tokens.
- **Tests.** pgTAP: rotation, reuse revokes family, expiry, revoke-all, cap of 10, no API-role access. Unit: Worker CORS
  and CSRF. Manual (agent-run, recorded): iOS Safari and macOS Safari after the 7-day mark, Chrome with third-party
  cookies blocked, Firefox, second hostname `create`.
- **Done when.** Safari either keeps 30 days or the product says 7 (never `localStorage`); all tests green; Account lists
  devices; `SESSIONS.md` updated.
- **Depends on.** A3 (hostname), founder go-ahead for the shared secret and the `session` deploy.

### A2. Hostname-aware app (one build, three hostnames)

- **Purpose.** `create.lunchvoice.com` is where creators work, `pay.lunchvoice.com` is where they pay, and
  `lunchvoice.com` is where people answer, without three codebases or three Render domains.
- **Behavior.** The same `dist` is served on all three hostnames (mechanism in `03_` section 3). A small module
  `src/lib/hostMode.ts` returns `"public" | "create" | "pay"` from `location.hostname` (the dev server and previews
  fall back to `"public"` unless `?mode=` is set in development only). The router uses the mode:
  - **public** (`lunchvoice.com`, `www`): marketing, `/pricing`, `/templates`, `/discover`, Hub pages `/:hub/*`, answering
    (`/c/:joinCode`, `/s/:token`, `/j/:code`, `/h/:slug`), `/me`, `/status`, `/support`, legal. Creator-only routes (`/surveys*`,
    `/trends*`, `/create` Hub creation) redirect to the same path on `create.` and pay routes to `pay.`.
  - **create**: the creator app (dashboard `/`, `/surveys`, `/templates`, `/trends`, `/hubs`, studio and results under
    `/campaigns/:id/*`, `/billing` entry that links to pay). Public routes (answering, Hub pages, marketing) redirect to
    `lunchvoice.com`; a respondent never lands on `create.`.
  - **pay**: `/` plan review, `/checkout/:product`, `/return`, `/manage` (portal entry), `/receipts`, `/status`.
    Nothing else; every other path redirects to `create.`.
  Hub Console remains at `lunchvoice.com/:hub/...` (Hub URLs are path-based forever); the create dashboard links to it.
- **Rules.** `rel=canonical` always points to `lunchvoice.com` public URLs; `create.` and `pay.` pages are `noindex` and
  send `X-Robots-Tag: noindex` (response header rule in `03_`). Reserved slugs already protect `create`, `pay`, `auth`,
  `hub`: the backend agent verifies each is in `lv.reserved_slugs`, plus `status`, `help`, `api`, `developers`,
  `discovery` (none may be claimed as a Hub).
- **Tests.** e2e per host with `?mode=`-free host mapping through a Playwright route map; redirect matrix (every public
  route on create and pay, every creator route on public); sign-in carries across `lunchvoice.com` and `create.`.
- **Done when.** `check:routes` registry has a `hosts` field for every route and the matrix test passes.

### A5. Turnstile on guest and sign-up paths

- **Purpose.** Stop bots without puzzles.
- **Behavior.** Invisible Turnstile on: guest submission to a survey link, waitlist join, Quick Survey creation after the
  4th in an hour, and report submission. The widget's token is verified server-side in the function or RPC wrapper that
  already rate-limits; a failure returns `lv_rate_limited` with `reason: "challenge"`. If Turnstile is unreachable,
  guests are allowed at half the rate (fail soft for answering, fail closed for creation).
- **Data.** Policy `bot.turnstile_required` (bool). Secret `TURNSTILE_SECRET` (function secret, name only).
- **Security.** CSP gains `https://challenges.cloudflare.com` for script and frame; documented in `RENDER_SETTINGS.md` with
  a rollback. The site key is public.
- **Done when.** Staged test: a scripted client without a token is refused; a normal browser passes with no visible step.

---

## B. Money

### B1. Creator Plus and Creator Pro purchases (person-scoped)

- **Purpose.** A solo creator can pay $5 or $15 a month and get the perks everywhere they edit.
- **Who.** Any signed-in account.
- **Behavior.** Hub plans attach to a Hub; Creator plans attach to the **person** (`scope='account'`). Flow:
  `lv_checkout_start(p_product 'creator_plus'|'creator_pro')` with no `p_hub` creates an intent for the caller's account;
  the `checkout` function creates a Stripe Checkout Session (mode `subscription`, price from `billing.stripe_prices`,
  Stripe Tax automatic, `client_reference_id` = intent id, metadata is never trusted); the webhook grants an
  account-scoped entitlement through `lv.billing_apply_event` after verifying a matching intent, status paid, USD,
  `amount_subtotal` equal to the intent price (NEW-01), idempotent on `(provider, event_id)`.
  - Renewal (`invoice.paid`) extends the entitlement; **cancel** keeps access to the end of the paid period; **payment failed**
    starts a 7-day grace (policy `billing.past_due_grace_days`) shown as a banner, then the entitlement falls back to Free
    limits; **downgrade from Pro to Plus** takes effect at the next renewal; **upgrade Plus to Pro** is immediate with
    Stripe's proration (Stripe computes, our code never does); a person who already has an active Creator subscription
    is refused a second one (`lv_conflict`).
  - **Over-limit after downgrade**: nothing is deleted. Surveys above the new active limit stay readable and can be
    closed by the owner; new activation is refused with `lv_limit_reached`. Branded surveys keep their look but cannot
    be re-themed.
  - A Creator plan applies to the person's personal space and to every Hub where they have the `campaign.manage`
    capability, for the surveys *they* create there (per founder: "the perks go with the person").
- **Data.** `lv.billing_intents` gains `scope` and `account_id` (nullable `hub_id`); `lv.entitlements` already supports
  account scope (000041). Products `creator_plus` and `creator_pro` flip to `purchasable=true` **only** by the migration
  that ships B1 *after* the real-purchase proof in B2. `lv.api_billing_config` adds both products.
- **API.** `lv_checkout_start` (extended), `lv_billing_summary` (adds `account` block: plan, state, renews_at,
  cancel_at_period_end), `lv_billing_portal_start()` (returns a Stripe Customer Portal URL for the caller's customer id).
- **Screens.** `pay.lunchvoice.com`: plan review and the purchase for each product; create dashboard plan card and usage
  meters read the same summary.
- **Security.** Customer id stored against the account, never accepted from the client; a purchase can only grant to the
  caller of the intent; replay of a webhook grants nothing; refund path (NEW-02, suite 17) extended to account scope.
- **Tests.** pgTAP extends suite 36: purchase, repeat event, renewal, failed payment grace, cancel, downgrade, upgrade,
  refund, second-subscription refusal, entitlement visible on personal space and on a Hub the person edits, absent on a
  Hub they only belong to as a member. Function tests for `checkout` and `billing-webhook`.
- **Done when.** B2 passes against Stripe test data and then one live coupon purchase.
- **Depends on.** Founder: tax code, secrets confirmed (`00_` section 8).

### B2. Prove billing with a real purchase

- **Purpose.** Nothing is sold until one real payment has flowed through the whole chain.
- **Behavior.** On Fri 11-20, with the founder present: create a 100% coupon in the live Stripe account; buy Starter ($13)
  on a throwaway Hub through the real `checkout` and `billing-webhook`; confirm the entitlement, the receipt email,
  the Stripe Tax line, the portal; cancel; refund; confirm the entitlement end and the audit trail; repeat for Creator
  Plus. Record the Stripe event ids and database rows in `docs/ops/BILLING_PROOF_2026-11-20.md` (ids only, no card data).
- **Done when.** Every row of `BILLING_FULFILLMENT_AUDIT_2026-11-11.md` "Not yet proven" is checked.

### B3. Billing screens

- **Purpose.** A person sees what they have, what it costs, when it renews and how to leave.
- **Screens (functional).** On `pay.`: `/` (choose: Hub plans need a Hub; Creator plans; Campaign passes with a week
  picker computing `19 + 13 × extra weeks` or `39 + 19 × extra weeks` from the plan map; Name reservation with a slug check);
  `/checkout/:product` (confirmation, then redirect to Stripe-hosted Checkout; **default: hosted Checkout, not embedded**,
  so the site's `script-src 'self'` stays unchanged); `/return` (verifies the session server-side, shows paid, pending
  or failed, never trusts the query string); `/manage` (opens the portal); `/receipts` (list from our events with a
  link to Stripe's hosted invoice). On `create.`: plan card, usage meters, "Manage billing" to `pay.`.
- **Rules.** Prices shown come from `lv_plan_limits().products`, never hard-coded; tax is shown as "calculated at
  checkout" because Stripe Tax computes it; every state of `lv_billing_unavailable` renders an honest message.
- **Done when.** e2e covers all states: unavailable, ready, pending, success, failed, cancelled, expired.

### B4. Campaign passes

- **Behavior.** Unchanged rules (window starts on activation; schedulable; cancellation rules F-08). Added: the pass
  picker on `pay.`; "Add a week" extension before expiry; a pass's Trend allowance (1) and read-only after the window.
- **Done when.** pgTAP: extension, expiry, reactivation refused after expiry without a new purchase, window clock never
  reset by retries.

### B5. Hub Name Reservation purchase and renewal

- **Behavior.** `lv_hub_reservation_status` already exists. Add the purchase on `pay.` and renewal reminders by email at
  30, 7 and 0 days before expiry and at grace day 20 (E3 notifications, `reservation.reminder`).
- **Done when.** The lifecycle table in the product spec is demonstrated: ACTIVE, GRACE (25 days), RELEASED, claim by another
  person after release exposes none of the prior holder's data.

### B6. Money emails

- **Behavior.** Through the existing outbox and Resend: receipt (we send a short note linking to Stripe's invoice), payment
  failed, plan cancelled (with end date), plan ending soon, refund issued, reservation reminders. Plain templates; no
  tracking pixels (open and click tracking stay off). Footer carries the legal operator name once supplied (F-12).
- **Done when.** Each template renders in light and dark mail clients (agent checks with Resend preview) and is sent once
  per event (idempotent key per event).

### B7. Entitlement edge cases

- **Rules to test.** Founding grant expiry at `launched_at + 30 days`; a Hub with both a Founding grant and a paid plan
  uses the stronger; downgrade over limits (B1 rules apply to Hubs: roles above the limit stay but cannot be edited
  upward; pages above the limit stay readable; Campaigns above the limit stay readable and closable); expired premium
  fails closed for premium actions only; nothing is ever deleted for an unpaid state.

### B8. Armed, audited billing release (do not auto-charge anyone)

- **Purpose.** The admin portal date must not silently turn sales on, and must not charge anyone. It lets people *buy*.
- **Behavior.** Today `billing.launched_at = 2026-12-12T17:12:00Z` and `billing.provider_ready = false`; no scheduled job opens
  billing (F: `2026-11-13` handoff, section 4). Add policy `billing.release_armed` (bool, default false) and
  `billing.release_state` (`unarmed`, `armed`, `released`, `blocked`). A `pg_cron` job `billing_release` runs every minute:
  if `release_armed` is true, `now() >= launched_at`, `provider_ready = false` and every readiness check passes
  (`lv.billing_readiness()`: every `billing.stripe_prices` entry present for every purchasable product, `billing.merchant_ready`
  true, no open BLOCKER flag), it sets `provider_ready = true`, `release_state = released`, writes `billing.opened_at`
  and an audit row, **exactly once** (it never resets the date; a manual open is still the typed `OPEN BILLING`). If the
  checks fail the state is `blocked` and a staff alert is raised (E3 admin notification and an email). Pausing sets
  `provider_ready = false` and `release_armed = false`.
- **Staff screens.** Billing tab: "Arm release" (typed `ARM RELEASE`), readiness checklist with the live result of
  `lv.billing_readiness()`, state, history.
- **Founder step.** Arm on Fri 12-11 only after G4. If not armed, 17:12 passes and billing stays closed; the Founding
  countdown still runs from the date.
- **Tests.** pgTAP: unarmed does nothing; armed before the time does nothing; armed after the time with failing checks
  becomes blocked; armed with passing checks opens once; a second run is a no-op; pause disarms.

---

## C. Decide, share, analyse

### C1. Creator-controlled results (design in `LAUNCH_PREP_PLAN` section 2, adopted unchanged)

- **Purpose.** The creator, not the platform, decides when results appear, and respondents are always told.
- **Behavior.** Per survey setting **Results**: `at_close` (all plans), `live` (Plus, Pro, Team, Campaign Plus; not elections),
  `live_elections` (Team, Creator Pro, Campaign Plus), plus the extra switch `instant_rows` (Team, Creator Pro, Campaign
  Plus) for anonymous surveys. Respondent notice text is computed by the server (the four exact strings in the prep plan)
  and shown on the start screen; it cannot be disabled. Creator confirmation dialogs for the two risky choices.
  Defaults: new surveys on live-capable plans stay `live`; elections default to `at_close`. A change after answers exist
  applies from then on and is audited. A downgrade falls back to `at_close`; nothing is deleted.
- **Data.** `lv.campaigns.results_mode` (`at_close|live|live_elections`), `instant_rows bool`; keys `results.instant_elections`,
  `results.instant_rows`. The reporting functions read the mode and the entitlement.
- **Safeguards that stay on.** No names, times or receipt ids on anonymous answers; filters stay refused on anonymous
  surveys; device, source and duration breakdowns on anonymous surveys keep close-and-5; quiz keys never reach
  respondents; the notice cannot be turned off.
- **Tests.** pgTAP matrix: plan × setting × anonymous/identified × election × open/closed × below/above 5; regressions on
  suites 24, 42, 44, 53; e2e for dialogs, notice, downgrade.
- **Done when.** Matrix green; `AGENTS.md` and `CLAUDE.md` already carry the summary (no change).

### C2. Decisions log ("You said, we did")

- **Purpose.** A community trusts a Hub that writes down what it decided and why. This is the step after results that
  survey tools skip, and the feature that makes members answer again.
- **Who.** Create and edit: `decision.manage` (new capability; Owner and roles that have it). Read: by the decision's
  visibility. Every Hub plan has the log; publishing to members needs `decisions.publish` (Starter and up).
- **Behavior.** A **decision** is a record in a Hub:
  - `title` (3 to 120 characters), `summary` (markdown-lite, up to 2,000 characters; the existing `markdownLite` renderer, no HTML),
    `status` in `proposed → decided → in_progress → done` or `declined`, `decided_at`, `decided_by` (a membership, shown
    as a role or name per Hub setting `decisions.show_decider`: default role only),
    `visibility` in `managers` (default), `members`, `public` (public needs a public Hub and Team plan), `outcome_note`
    (what changed, up to 1,000 characters), optional `due_at`.
  - **Evidence links**: zero or more Campaigns (`lv.decision_campaigns`) and, at publication, a **results snapshot** (C3). A
    decision may stand without a Campaign (a manager's call), and is labelled "Decided by managers" so members can tell.
  - **Status changes** write `lv.decision_events` (who, from, to, note, time). Members who answered a linked Campaign (by
    eligibility receipt, which never exposes their answers) are notified on publish and on every later status change
    (E3, `decision.update`), subject to their preferences and the Hub mute.
  - **Reactions**: a member may react 👍 or 🤔 on a decision visible to them (not on anonymous Campaign answers); counts
    are shown only at 5 or more reactions in total.
  - **Comments** reuse the Hub comments system (E5) with the same moderation.
  - **Limit.** Starter 50 decisions per Hub, Team 500 (policy `decisions.max_per_hub`); counts archived (`archived_at`) ones
    too. Nothing is deleted on downgrade.
- **Data.** `lv.hub_decisions(id, hub_id, title, summary, status, visibility, decided_at, decided_by_membership, outcome_note,
  due_at, created_by, created_at, updated_at, archived_at)`, `lv.decision_campaigns(decision_id, campaign_id, snapshot_id)`,
  `lv.decision_events`, `lv.decision_reactions(decision_id, membership_id, kind)`. RLS: read by visibility rules through
  `lv.can_read_decision`; write only through `lv_api` functions. Capability `decision.manage` added to the capability
  catalogue and to the default Manager template.
- **API.** `lv_decision_create`, `lv_decision_update`, `lv_decision_set_status(p_decision, p_status, p_note)`,
  `lv_decision_list(p_hub, p_status?, p_cursor?)`, `lv_decision_get`, `lv_decision_link_campaign`, `lv_decision_react`,
  `lv_decision_archive`.
- **Screens (functional).** Hub tab **Decisions**: a list with status chips and filters; a decision page with the linked
  results (C3), timeline of events and reactions; manager editor with a "Preview as a member" button; member-facing "What
  we decided" card on the Hub home when any decision is published in the last 30 days.
- **Privacy and security.** A decision never contains individual answers; evidence is only a snapshot produced by C3;
  visibility `public` shows the snapshot, never live data; editing a published snapshot is impossible (create a new
  snapshot instead); audit every status change; rate limit 30 writes a minute per person.
- **Tests.** pgTAP: capability checks, visibility matrix (manager, member, guest, non-member, public), limit,
  status machine (illegal transitions refused), archive, downgrade, audit rows, notification fan-out only to eligible
  receipts. e2e: manager records a decision, links a Campaign, previews, publishes; member sees and reacts.
- **Done when.** The loop in `00_` section 1 runs end to end by a manager with no developer help.

### C3. Share results with members (published snapshots)

- **Purpose.** People see what their answers added up to. Hub owners and managers can show members the analytics and
  see what their decisions impact.
- **Who.** Publish: `analytics.publish` (an existing capability in the product spec's vocabulary) and `results.share` entitlement.
  View: the audience chosen (`managers`, `members`, `public`).
- **Behavior.** "Publish results" on a closed or live Campaign creates a **snapshot**: the *released* aggregates at that
  moment, produced by the same strict engine as the creator's own view (never a copy of raw data).
  - A snapshot has the **sections the creator ticks** from those the plan allows: totals and charts per question (Starter and
    up); **breakdowns by role and by source, run-over-run comparisons** (Team, Creator Pro on own surveys; `analytics.breakdown`).
  - What is shown is exactly what the creator would see: withheld cells stay withheld; free text appears only at 5 or more
    answers, in random order, without times; participation numbers follow the existing rules (no rate at 100% or when the
    non-respondents are fewer than the cohort).
  - **Preview**: the publish dialog shows the page exactly as members will see it, with a plain-language line "Members
    will see totals and charts. They will not see who answered." (for anonymous Campaigns; the identified equivalent
    names the visible fields).
  - **Update**: a later snapshot supersedes the earlier one on the page and the earlier one remains in history
    (`superseded_at`). A snapshot is immutable.
  - **Anonymous Campaign, small group**: if the Campaign has fewer than 5 responses, publishing is refused with
    `lv_gate_blocked` reason `below_cohort`.
  - **Closed-Campaign requirement on anonymous surveys** unless the creator's Results setting is `live` (C1); a live
    snapshot is labelled "Live as of {time}".
  - Members who can see a snapshot can also **export nothing** (no CSV for members); managers keep export (`analytics.export`).
- **Data.** `lv.result_snapshots(id, campaign_id, hub_id, taken_at, taken_by, sections jsonb, payload jsonb, audience,
  superseded_at)`. `payload` is built by `lv.snapshot_build(campaign, sections)` that calls the analytics core per section
  and fails if any section returns a value the viewer audience is not allowed to see. RLS: read through
  `lv.can_read_snapshot`; the table is not in the Data API; `lv_api` functions return the payload.
- **API.** `lv_snapshot_preview(p_campaign, p_sections)`, `lv_snapshot_publish(p_campaign, p_sections, p_audience, p_decision?)`,
  `lv_snapshot_get(p_id)`, `lv_snapshot_list(p_campaign)`.
- **Screens (functional).** Results → "Publish results" (sections, audience, preview, confirm); Hub home "Latest results";
  decision page evidence; a read-only results page for members (same chart components as the creator view, with the
  plain note about what is hidden).
- **Security.** A snapshot of an anonymous Campaign is built only from the already-suppressed output, so there is no
  second suppression implementation to get wrong. **Differencing defence**: two snapshots of the same Campaign taken
  while it is live, with different cohorts, must not let a member subtract to isolate a person: the build refuses to publish
  a live snapshot of an anonymous survey if a previous snapshot of the same survey exists and fewer than 5 new responses
  arrived since it (`lv_rate_limited` reason `snapshot_spacing`). Snapshots of election Campaigns publish only after
  certification (D1).
- **Tests.** pgTAP differencing suite (1, 4, 5, 6 responses; successive snapshots; role breakdown with a cell of 4;
  complementary-cell suppression); audience matrix; immutability; plan matrix. Property test: for every anonymous
  Campaign generated, no snapshot field changes by less than the cohort when one respondent is added.
- **Done when.** The differencing suite and the audience matrix pass and a manager publishes and a member reads in e2e.

### C4. Advanced analytics (fills the undelivered Team claim)

- **Purpose.** Show a Hub owner **who is and is not being heard**, so decisions are fair.
- **Who.** `analytics.breakdown`, `analytics.compare`, `analytics.funnel`: Team Hub, Creator Pro (own surveys), Campaign Plus.
- **Behavior.** On the Results and Analytics screens, a creator with the keys can:
  1. **Break down any question by** `role` (Hub Campaigns only), `source` (link, QR, code, Hub, Discord, invite), `device
     class` (phone, desktop), `day` and `hour` of week. Rules: for **anonymous** surveys, breakdowns appear only after the
     survey closes, only cells of 5 or more are shown, and a **complementary-cell rule** withholds the smallest remaining
     cell when exactly one cell in a dimension would otherwise be derivable by subtraction; one dimension at a time (no
     crossing dimensions) on anonymous surveys; for **identified** surveys two dimensions may cross with the same cell rule.
  2. **Compare runs** of a Trend: per repeating question, the change in mean, share or split between runs, with the
     "different question version" warning when the wording or kind changed.
  3. **Participation funnel**: invited or eligible → opened → started → completed, from counters only (no per-person
     timing): `lv.campaign_counters` increments `opened` (server-side on first load of the player for a link) and `started`
     (first answer saved). Funnel numbers below 5 in any step are withheld.
  4. **Response rate by role** (Hub Campaigns with role targeting): eligible count and responded count per role, withheld
     under 5 eligible.
  5. **Text themes (no AI)**: word frequency and top phrases from free text, only at 5 or more answers, stop-words removed,
     words used by fewer than 3 answers dropped, never shown with answer text next to a person.
  6. **Custom date range** and **export** (CSV of released aggregates only, same suppression).
- **Data.** No raw tables change; a new core `lv.analytics_dim(campaign, metric, dim, question?)` that reuses the existing
  withheld-bucket and dominance logic; counters table `lv.campaign_counters(campaign_id, day, opened, started, completed)`
  with a trim job (retention 13 months).
- **API.** `lv_analytics_query` gains `p_dim`; `lv_analytics_compare(p_trend)`; `lv_analytics_funnel(p_campaign)`;
  `lv_analytics_text_themes(p_campaign, p_question)`.
- **Screens (functional).** A "Breakdown" selector on each question card (locked with a one-line unlock note below the
  plan), a "Compare" tab on a Trend, a Funnel strip on the Campaign header.
- **Security.** Every output goes through the one engine; new dimensions are covered by a **generator-based differencing test**
  that builds random response sets and proves no sequence of allowed queries isolates a respondent when `n` per cell is below 5.
- **Tests.** The differencing generator; plan matrix; unit tests for text themes (stop words, minimum counts); funnel
  counters under concurrency.
- **Done when.** The generator test passes, and every claim on the Team and Creator Pro cards that says "advanced analytics"
  maps to a numbered item above (the pricing copy change lists them).

### C5. Trends and Ask again completion

- **State.** Trends exist (000044). **Finish**: the "different question version" warning, Ask again from a closed survey
  creating a draft copy inside the Trend, per-plan limits (`trends.max`: Creator Plus 5, Creator Pro 10, Starter Hub 3,
  Team Hub 5 per 000044; Campaign passes 1), over-limit read-only behavior, and the empty state.
- **Done when.** A run-over-run view across three runs renders with a changed-wording warning and a withheld run is
  shown as withheld, never zero.

### C6. Hub health panel (the Heartbeat and Voice parts of Pulse; built together with E10)

- **Purpose.** An owner sees in ten seconds whether the community is alive and whether people are heard.
- **Behavior.** On the Hub Overview: members (genuine, accepted), new members this week, active members this week
  (answered, commented or voted), participation rate of the last closed Campaign (rules above), decisions published in the
  last 30 days, open reports, and **time to decision** (median days from a Campaign's close to its linked decision's
  `decided`). Each metric is a number and a simple trend arrow versus the prior period; withheld under 5.
- **Data.** A view `lv.hub_health(hub_id)` (security invoker) over existing tables plus `lv.decision_events`; one policy
  `hub.health_window_days` (7).
- **Access.** Basic panel on every Hub plan; Team adds the trend sparkline and the weekly digest (C7).
- **Done when.** Numbers match a seeded fixture exactly; no metric exposes who.

### C7. Exports and the manager digest

- **Behavior.** CSV export of released aggregates (existing, unchanged rules). New: **weekly digest email** to people with
  `analytics.view` in Team Hubs: new answers, decisions due, open reports, health numbers; sent Monday 09:00 in the
  Hub's timezone (new Hub setting, default UTC) through the outbox; unsubscribe per person (E3). No individual data.
- **Done when.** A fixture Hub produces the expected digest text and a person can unsubscribe in one click.

### C8. Embed released results (P1, Team)

- **Behavior.** A Team Hub manager may add a **Results block** to a custom page that renders a published snapshot (C3,
  audience `public` or `members`), and may copy an embed link `https://lunchvoice.com/embed/snapshot/:id` for external sites.
  The embed route shows only the snapshot payload (no scripts from the host), `frame-ancestors *` for that path **only**
  through a path-scoped Render header rule (`/embed/*`), CSP otherwise unchanged; members-only snapshots cannot be embedded
  externally.
- **Security.** A new Render header rule changes a global setting: needs the founder's go-ahead and an entry in
  `RENDER_SETTINGS.md` with a rollback. If not approved, ship only the in-Hub Results block.
- **Cut line.** If not passing review by Wed 12-02, remove from the plan card copy and ship the in-Hub block only.

---

## D. Campaign modes (the "enhanced Campaign modes" claim, defined)

### D1. Elections (finish PR #73 and complete)

- **Purpose.** A community chooses its people fairly, visibly and secretly.
- **Who.** `elections.max_active` and `elections.methods` (`01_` section 4). Eligible voters are Hub members chosen by
  role or "all members", with a minimum membership age (default 0 days, `election.min_member_days`).
- **Behavior.** Phases: `draft → nominations → review → voting → closed → certified → published`.
  - **Offices and candidates.** An election has 1 to 10 offices; each office 2 to 20 candidates (two minimum). Candidates
    are members; they self-nominate or are nominated and must accept; a manager may add a candidate directly; each
    candidate has a name (taken from the member's display name or Hub nickname) and a statement up to 600 characters. A
    candidate may not vote in a contest where the manager set `election.candidates_vote = false` (default true).
  - **Methods.** `plurality` (pick one), `approval` (pick any number), `ranked` (instant runoff: eliminate the lowest,
    transfer, repeat until a majority of continuing ballots; ties for elimination broken by the earliest-first-preference
    count, then by a recorded random draw seeded by the election id and logged).
  - **Eligibility roll.** Frozen when voting opens: `lv.election_roll(election_id, membership_id)`. A membership
    added later cannot vote; a membership removed before the close keeps its already-cast ballot.
  - **Secret ballot.** A ballot is stored in `lv.election_ballots` with **no account or membership column**; the roll's
    `voted_at` is set separately, rounded to the day, so the receipt cannot be matched to a ballot by time. Ballot ids
    are random and never returned.
  - **Voter receipt.** "You voted in {election} on {date}." No choice, no ballot id.
  - **Results.** Not visible until the election is `closed` and certified (default). A live tally exists only when the
    creator picks `live_elections` (C1; Team, Creator Pro in standalone is out of scope per X-02, Campaign Plus) with the
    confirmation dialog and the respondent notice "Votes are counted live. The creator can see the running tally. Your
    ballot is never linked to your name."
  - **Minimums.** An election needs at least 5 eligible voters (otherwise creation is refused with `lv_gate_blocked`
    reason `electorate_below_cohort`); results for an office are published only when at least 5 ballots were cast in it.
  - **Certification.** Two managers confirm (Team and Campaign Plus); one manager on Starter. Certification freezes the
    count; any change afterwards is a new election. The certified record includes per-round counts for ranked
    elections. **Cast-vote records are never published** (the ranked "Italian attack" can identify a voter).
  - **Tie.** Plurality and approval ties are broken by the election's `tie_rule`: `runoff` (a one-day follow-up), `manual`
    (managers record the decision with a reason, shown to members) or `draw` (recorded random draw).
  - **Election night.** Present mode reveals results by office in order on a big screen after certification.
  - **Publish.** The certified result becomes a C3 snapshot and may be linked to a decision (C2) "Officer elected".
- **Data.** Reconcile with PR #73's tables (000036 to 000039); additions under `lv.elections`, `lv.election_offices`,
  `lv.election_candidates`, `lv.election_roll`, `lv.election_ballots`, `lv.election_certifications`.
- **API.** The backend agent maps these to the PR's existing operations first and lists any gap in
  `docs/backend/ELECTIONS_GAP_2026-11-16.md` before writing code.
- **Security.** Ballot table inaccessible to every API role; a ballot insert and a roll update happen in one
  transaction that cannot be split by a client; double voting impossible (unique on roll row plus the transaction);
  rate limit; audit of every phase change; manager cannot see ballots; staff cannot either (no policy exists).
- **Tests.** pgTAP: secret-ballot separation (join attempts fail), double vote, roll freezing, each method with
  published examples (including a known IRV edge case), tie rules, certification, below-cohort refusal, live-tally gate, plan
  matrix. e2e: a full election with three roles and 30 simulated voters.
- **Done when.** The method fixtures match their expected winners and a secret-ballot audit script finds no join path from
  a roll row to a ballot.

### D2. Quiz mode

- **Purpose.** Learning, trivia and team games: people learn what they got right.
- **Behavior.** A Campaign has `quiz` on or off. Questions of tier-appropriate kinds carry an answer key (stored in
  `lv.campaign_questions.quiz`, never in `config`; already built in 000047). After submitting, the respondent sees a score
  and, per question, correct or not with an optional explanation (`quiz.reveal` per Campaign: `after_submit` default,
  `after_close`, `never`). **Points**: 1 per correct unless the creator sets weights; partial credit is not supported.
  Creators see score distribution (released with the usual cohort rule) and per-question correct rate.
- **Timed play and leaderboard (P1)**: a per-question timer (10 to 120 seconds) in Live Session (D4), with a **top-5**
  reveal at the end by nickname. Nothing about timing is stored for anonymous quizzes beyond a `timed_out` flag.
- **Trivia template.** The `trivia-night` template loses its flags when D4 passes review; otherwise the template is
  hidden (default) and the flags remain.
- **Tests.** Key never reaches a respondent before reveal; score arithmetic; reveal modes; no leaderboard for anonymous
  quizzes other than the top-5 nickname reveal in a live session by consent.
- **Done when.** A 10-question quiz is created, taken, scored and revealed on a phone.

### D3. Question-type and logic parity (finish, do not add)

- **Behavior.** Audit the 21 kinds and 82 templates against the player and results; fix gaps; ensure every kind has a
  results chart and an export column, an accessible alternative (keyboard, screen reader labels), a mobile layout, and a
  server-side validator (`lv.check_answer_value`). No new kinds at launch. Linked Questions: the 20-question role-branch
  fixture from the handoff passes in server and player.
- **Done when.** A table `kind × {player, results, export, validator, a11y, mobile}` is all ✓ in
  `docs/v2/QUESTION_KINDS_MATRIX.md`.

### D4. Live Session Lite (the Kahoot-like room, minus competition)

- **Purpose.** Run a survey in a room: people join with a code, answer on phones, the screen shows results moving. It is
  the feature that gets LunchVoice onto stages, classrooms and Discord calls.
- **Who.** Any creator on their own Campaign; participant cap by plan (`live.max_participants`: 30, 100, 200, 100, 300).
- **Behavior.** Present mode gains **Live**: the presenter opens a session (`lv.live_sessions`) for an **active** Campaign;
  the screen shows the join code, QR and a count of joined people; a join page `lunchvoice.com/j/:code` already exists
  and is reused. The presenter advances question by question (**Host-paced**) or the room goes at its own pace
  (**Self-paced**, default). Results update on the presenter screen every 2 seconds by short polling of a cached
  aggregate (not a realtime socket, to keep cost and complexity down) and obey C1 (anonymous at-close rules still apply:
  a live room on an anonymous survey with `at_close` results shows only "n people have answered", never a result, until
  the presenter closes the question and 5 have answered).
- **Quiz extras (P1).** Per-question timer and a top-5 nickname reveal (D2).
- **Not in scope.** Team play, power-ups, music, avatars, points-per-speed, a persistent live leaderboard (V2.x).
- **Data.** `lv.live_sessions(id, campaign_id, host_membership/account, state, current_question, started_at, ended_at,
  join_code)`; counters only. Participants are not stored beyond the normal response rows.
- **API.** `lv_live_start`, `lv_live_state(p_code)` (public, cached 2s), `lv_live_next`, `lv_live_end`.
- **Security.** The state call returns only counts and the current question's public text; rate limit per IP hash;
  join codes are 6 characters from a non-ambiguous alphabet, rotate per session, expire after 12 hours.
- **Tests.** Concurrency: 300 simulated joins; state call p95 under 200 ms on a cached aggregate; anonymous rules.
- **Cut line.** If not reviewed by Wed 12-02, ship Present mode as is and remove "live sessions" from the Team card.
- **Done when.** A 30-person scripted session runs on phones with the presenter screen updating.

### D5. Recurring schedules and Ask again

- **Behavior.** A Trend run can be **scheduled to repeat** weekly, every two weeks or monthly (`lv.trend_schedules`): a
  scheduler job creates the next run as a **draft** and notifies the creator to review and activate; **it never auto-activates**
  (a repeat survey must be checked first). Pause and stop. Counts against `trends.max`.
- **Done when.** A weekly schedule produces a draft the following week in a time-travel test.

### D7. Participation receipt

- **Purpose.** "I took part" without revealing what was said.
- **Behavior.** After submitting, a signed-in respondent can see on `/me` "Answered: {survey}, {date}" and can download a
  receipt with a random id. For anonymous Campaigns the receipt proves participation only; it does not let anyone
  look up the answer.
- **Done when.** A receipt for an anonymous survey cannot be joined to any answer row by any API.

---

## E. Community

### E1. Profiles and Hub nicknames

- **Behavior.** As the product direction: display name, avatar (colour plus emoji), banner colour, bio (160), optional
  pronouns, and a switch to show the Hubs one belongs to. **Hub profile**: a per-Hub nickname and avatar colour; owners see
  the real display name; a Hub may require nicknames to meet its rules (`hub.nickname_rules` text, advisory). Hover card on
  people. Pronouns appear only if the person entered them. Images are out of scope (colour plus emoji only).
- **Data.** `lv.accounts` gains `bio`, `pronouns`, `avatar_emoji`, `avatar_color`, `banner_color`, `show_hubs`; `lv.memberships`
  gains `nickname`, `avatar_color`. Display name changes are limited to 3 per day.
- **Security.** Text goes through the existing profanity-safe validator and the markdown-lite renderer (no HTML); a reported
  profile is handled by E6.
- **Rule found by the 2026-11-14 UI audit (HB1, P0, week 1).** No surface may show an email address as a name. Today the Hub Members list and the
  Overview People card show a member's full email as their display name. The display-name resolver in the API falls back to "Member" plus a short id, never to the
  email; a pgTAP test and an e2e test prove no email appears in any member list, Hub card, comment, news post, decision, leaderboard or Discord post.
- **Done when.** Profile edit and Hub profile edit work on mobile; hover card never shows an email.

### E2. Hub identity: presence, topic tags, badges, Discord card

- **Behavior.** Adopt `docs/v2/handoffs/drafts/hub_identity.draft.sql` (only new objects, rollback drafted): presence
  ("here now" within 300 seconds, count to visitors, names to members, personal opt-out, never from the player, never
  joined to participation), up to 5 topic tags per Hub, Hub badges (verified, founding), and the connected Discord server
  card (server name, member and online counts refreshed by `discord_stats_*`). Renumber the draft to the next free
  number. Satisfies the open Hub card fields `created_at`, `online`, `tags`.
- **Note.** The 2026-11-13 handoff observed that `discord_stats_due` and `discord_stats_set` were not deployed; this
  migration deploys them. Do not show stats from a guild row alone.
- **Done when.** A Hub shows presence, tags and a Discord card with real counts from a real server.

### E3. Notifications

- **Purpose.** Do not miss what matters; never be spammed.
- **Behavior.** In-app **notification centre** (bell, unread count, list, mark read, mark all read) and email, with
  per-category preferences. Categories: `campaign.new` (a Campaign you can answer in a Hub you belong to),
  `campaign.closing` (you have not answered, 24 hours before close), `results.published`, `decision.update`,
  `election.nomination`, `election.voting_open`, `election.results`, `reservation.reminder`, `billing.notice`,
  `mention` (comments), `report.outcome`, `digest.weekly` (managers). Delivery per category: in-app on, email off by default
  except `billing.notice`, `election.voting_open`, `reservation.reminder` and `report.outcome` (on); email digest as
  an option "daily summary". **Frequency cap** 3 emails a day per person except billing and security. Per-Hub mute.
  One-click unsubscribe link in every email (`List-Unsubscribe` header) that works without signing in via a signed token.
  Quiet hours optional (default off).
- **Data.** `lv.notifications(id, account_id, kind, hub_id?, campaign_id?, payload_ref, created_at, read_at)` (payloads
  carry ids and a short title, never answer data), `lv.notification_prefs(account_id, kind, in_app, email)`, `lv.hub_mutes`.
  A producer function `lv.notify(kind, account_ids, ref)` is the only writer; fan-out batches of 500 by a cron job through
  the existing outbox.
- **API.** `lv_notifications_list`, `lv_notifications_mark_read`, `lv_notification_prefs_get`, `lv_notification_prefs_set`,
  `lv_hub_mute_set`.
- **Privacy.** "You have not answered" is computed from eligibility receipts and never reveals anyone's answer; for anonymous
  Campaigns, "closing soon" goes to eligible members who have no receipt, which uses the receipt table the system already has.
- **Tests.** Frequency cap, preference matrix, unsubscribe token, no answer data in any payload, fan-out under 5,000 recipients.
- **Done when.** A member gets an in-app notice for a new Campaign and an email for voting open, and can turn both off.

### E4. Points, shop and leaderboard

- **Purpose.** Recognition and play for taking part, never for what you said.
- **Behavior.** A Hub sets a currency (name, icon). Points are awarded by **rules** a manager sets per Campaign: a flat
  amount for completing it (default 0, so nothing is awarded unless chosen), plus streak bonuses (X-day answer streak
  across Campaigns, optional). **Points never depend on answer content.** For **anonymous** Campaigns the award is made from the eligibility
  receipt and is added to a running per-member counter with **no Campaign id attached**, so a leaderboard or ledger line
  cannot reveal that a person answered a specific anonymous survey. Caps: 200 points a day per member (policy
  `points.daily_cap`), configurable per Hub within 50 to 500. **Shop**: items with a price, stock and a fulfilment type
  (`manual` default: a manager marks an order fulfilled; `role` grants a Hub role cosmetic; `code` reveals a code from a
  list). Orders: `lv_order_create` is atomic on balance and stock (`lv_insufficient_points`, `lv_out_of_stock` exist);
  refunds by managers return points. **Leaderboard**: top 10 by points this month and all-time, by nickname, with a member
  opt-out (default opted in for members, off for guests), and a Hub switch to hide it. Points are Hub-scoped and never
  convertible to money or across Hubs.
- **Security.** Prevent farming: points per Campaign once per person; Quick-Survey-style duplicate accounts cannot earn in a
  Hub they did not join; a manager cannot award points to themselves (`lv_forbidden`); audit all awards and orders.
- **Tests.** Atomic purchase under concurrency; anonymous award leaves no join to a Campaign; caps; opt-out; refund.
- **Done when.** The pgTAP concurrency test passes and a manager runs a shop with a manual fulfilment end to end.

### E5. News, comments, reactions and moderation

- **Behavior.** News posts (manager, markdown-lite, pin, schedule), comments on news and decisions (threaded one level),
  reactions (👍 ❤️ 🤔 🎉) with counts shown from 1 (comments are not anonymous, unlike survey answers). Moderation:
  managers hide or delete; **auto-moderation** blocks links from accounts younger than 24 hours, enforces a per-person
  rate limit (10 comments a minute), and a word list the Hub can extend (`hub.blocklist`, up to 100 terms); a report
  button on every comment; a hidden comment shows "Hidden by a moderator" to the author with a reason code. Muted members
  cannot comment.
- **Done when.** All of the above in e2e; a flood of 50 comments from one account is throttled.

### E6. Reports, blocks and appeals

- **Behavior.** One **Report** action everywhere (person, Hub, survey, comment, news post, decision): reason categories,
  optional details; reporters are never shown to the reported or to Hub owners; reporter sees "Report sent" and a status
  (`open`, `reviewing`, `actioned`, `dismissed`) with an email on outcome (E3). **Hub-level reports** reach that Hub's
  moderators first for content inside the Hub; **platform-level** categories (illegal content, harassment of a person,
  minors, impersonation) always reach staff. Staff actions: dismiss, warn, hide content, suspend account (exists),
  disable a Hub, disable a Discord server connection; all audited with reasons. **Appeals**: a suspended account or a
  hidden Hub can submit one appeal with text (500 characters) from a signed token link (they may be unable to sign in);
  staff decide within a target of 72 hours (stored `appeal.due_at`; shown in the queue). **Blocks**: a person can block another
  person (they cannot comment on or react to each other's content or invite each other; they still share Hubs).
  Repeated reports rate-limited; reporter and target cannot be the same person.
- **Done when.** Each reason category reaches the correct queue; an appeal flows from a suspended account without sign-in.

### E7. Onboarding and invites

- **Behavior.** First-run: after sign-in with no Hub and no survey, the creator dashboard shows three starting points
  (Make a survey, Start a Hub, Join with a code) with a template picker; for an invited person, accepting an invite lands
  them in the Hub with a one-screen welcome (roles, how anonymous answers work, how to mute). Invite links: per-Hub join
  link with optional role, max uses and expiry; revocable; QR code; "Invite from Discord" via the bot (F4).
- **Done when.** A new account reaches its first published survey in under 3 minutes in a scripted run.

### E8. Discover finish

- **Behavior.** `lunchvoice.com/discover` lists approved Hubs (Team, at least 700 genuine members, approved by staff) with
  search (name, tags), category filter (the Hub's `topic_tags`), sort (members, newest, most active this week), cards with
  member count, online count (E2), tags, and a Join or Request button by membership mode. Staff review queue with approve,
  reject (with a reason shown to the applicant) and delist; a Hub that falls below 700 for 30 days is flagged, not auto-delisted.
  Private Hubs are never listed; a listed Hub's pages are public only where the Hub set them public. No customer is
  special-cased (the existing founder override F-14 for LunchVoice's own Hub stays as recorded data, not code).
- **Done when.** Search, filters and the review queue work with seeded Hubs.

---

### E9. Hub activity and member directory

- **Purpose.** A Hub feels alive, and members can find each other, without exposing anyone's answers.
- **Behavior.** **Activity feed** on the Hub home: counted events such as "New Campaign: Friday lunch", "Decision: Friday lunch is
  tacos", "3 new members", "The Kitchen reached 100 members" (optional auto-news, off by default). Answer activity appears
  only as a count and only at 5 or more ("12 people have answered"), never who; for anonymous Campaigns it follows the
  same rule as results. **Member directory**: name or nickname, roles, joined date, online dot; visibility is the owner's
  setting `hub.directory_visibility` (`managers`, `members` default, `public`); search by name and filter by role; a member
  can hide themselves from the directory (they still appear to managers). **Welcome**: an optional pinned welcome post and
  a one-time welcome notification for each new member (E3).
- **Data.** `lv.hub_activity(id, hub_id, kind, ref, created_at)` written only by server functions with ids and short titles;
  retention 90 days.
- **Tests.** No activity row carries an answer or an account for an anonymous Campaign; directory visibility matrix;
  hide-self; counts under 5 are withheld.
- **Done when.** A new member sees the feed, the directory and a welcome in e2e.

---

### E10. Hub Pulse (launch version: Pulse Lite, P0)

- **Purpose.** An owner knows in ten seconds if the community is alive and heard, and members feel the Hub's heartbeat. Small, regular
  check-ins build the habit of answering; goals and recaps give the community something to move together.
- **Who and access.** Every Hub plan (`pulse.enabled`). Starter: one pulse question chosen from five presets, up to 3 active goals.
  Team: a custom pulse question and up to 3 rotating pulse questions, up to 10 active goals, role breakdown of the pulse (C4 rules)
  and the weekly digest (C7). Founding Hubs have the Starter family. Campaign passes follow their family.
- **Behavior.** Four parts under one **Pulse** card on the Hub Overview, mapped to the four pillars:
  1. **Heartbeat (activity).** The C6 numbers: genuine members, new this week, active this week (answered, commented or voted), open reports.
  2. **Voice (participation).** Participation rate of the last closed Campaign and **time to decision** (median days from a Campaign closing to
     its linked decision being `decided`, C2). Rate rules unchanged (no rate at 100% or when the non-respondents are fewer than the cohort).
  3. **Mood (the pulse check).** A one-question anonymous check-in sent on a schedule (weekly, every two weeks or monthly; default weekly,
     Monday). Presets: "How are you feeling about {Hub} this week?" (five faces), "Do you feel heard in {Hub}?" (yes, somewhat, no),
     "How likely are you to recommend {Hub}?" (0 to 10), "Is {Hub} helping you?" (yes, somewhat, no), "How is the mood this week?" (five faces).
     It is built on D5: each run is an anonymous Campaign in a Hub Trend named "Pulse", created as a draft that **is auto-activated only
     for Pulse** (the one exception to the D5 never-auto-activate rule, because the questions are fixed presets or manager-approved custom text) and closes
     after 5 days. Members get one `campaign.new` notification (E3) and see a "Pulse" card on the Hub home with a single tap answer. The
     mood score is the run's mean, shown only with 5 or more answers, with a trend arrow against the previous four runs. A Pulse run does not
     count against the Hub's active Campaign limit or the Trend allowance (`pulse.*` is its own allowance).
  4. **Impact (decisions).** Decisions published in the last 30 days and how many are `done` (C2).
- **Community goals.** A manager sets a goal: **participation** ("50 people answer the Friday poll by 12-20"), **members** ("reach 100
  members") or **decisions** ("close 3 decisions this month"). Members see a progress bar; reaching it shows a small celebration and can
  create a news post (E5) in one click. Goals are never competitive between people and never punish; they count totals only. `goals.max_active`:
  Starter 3, Team 10. A goal's progress for an anonymous Campaign uses counts at 5 or more only.
- **Weekly recap draft.** Each Monday the system creates a **draft** news post in the Hub from counts only (answers last week, new members,
  decisions made, pulse mood and trend, the result of any snapshot published that week, goals reached). A manager edits and publishes; it is
  **never published automatically**. Team may also send it as the digest (C7).
- **Visibility.** `hub.pulse_visibility`: `managers` (default), `members` or `public` (public needs a public Hub). Members who may see the
  Pulse card never see who answered; withheld numbers show "not enough answers yet".
- **Data.** `lv.hub_pulse_settings(hub_id, enabled, schedule, questions jsonb, visibility)`, `lv.hub_goals(id, hub_id, kind, target, due_at,
  status, visibility, created_by)`, `lv.hub_recap_drafts(id, hub_id, week_start, body, status)`; Pulse runs are ordinary Campaigns flagged
  `purpose = 'pulse'`; a security-invoker view `lv.hub_pulse(hub_id)` assembles the four parts with the withheld rules. Policy keys
  `pulse.run_days` (5), `pulse.history_runs` (4). Keys in the plan map: `pulse.enabled`, `pulse.questions_max` (Starter 1, Team 3),
  `goals.max_active` (3, 10), `recap.draft`.
- **API.** `lv_pulse_get(p_hub)`, `lv_pulse_settings_set`, `lv_goal_create`, `lv_goal_update`, `lv_goal_list`, `lv_recap_draft_get`,
  `lv_recap_draft_publish`.
- **Privacy and security.** A Pulse answer is an anonymous answer under every existing rule; the mood score and goal progress pass through
  the one engine; the weekly recap and any Discord post of Pulse contain only released numbers; a manager cannot see who answered.
- **Tests.** Withheld under 5; schedule creates one run per period (time-travel); runs excluded from Campaign and Trend limits; auto-activation
  limited to Pulse; goal progress arithmetic; recap contains no per-person data; visibility matrix; plan matrix.
- **Done when.** A fixture Hub runs two Pulse runs, shows the mood trend and a goal reaching 100%, and produces a recap draft a manager publishes.

---

## F. Discord, the place of conversation

**Principle.** Discord is for talking; LunchVoice is for deciding. Everything below makes the two feel like one thing for a
community, without making either depend on the other and without exposing an anonymous answer to Discord.

### F1. Link a Discord account

- **Behavior.** Two ways to the same result. (1) `/lunchvoice link` in Discord returns a one-time link (existing, 10-minute
  life). (2) **New:** Account settings → **Connect Discord** (Discord OAuth2, scope `identify` only, PKCE, state bound to the
  session). Both end at `lunchvoice.com/connect/discord`, where the signed-in person confirms and consents (consent version
  and time stored). The link stores the Discord user id as a **linked handle, never an identity key**; unlink from Account
  or `/lunchvoice unlink`; account deletion removes it. One Discord user can be linked to one account at a time (unique).
- **Secrets.** `DISCORD_CLIENT_ID` (public), `DISCORD_CLIENT_SECRET` (function secret; **founder go-ahead**). Redirect URI
  `https://lunchvoice.com/connect/discord/callback` registered in the Discord developer portal.
- **Security.** OAuth `state` and PKCE; the token is used once to read the user id and discarded (no refresh token stored);
  the `identify` scope returns no email.
- **Done when.** Link and unlink both work from both entry points against a real Discord account.

### F2. Connect a server to a Hub and role rules

- **Behavior.** A Hub owner with `integrations.manage` and a Starter or Team plan connects a server: a Discord server admin
  runs `/lunchvoice connect`, receives a code, and confirms it in the Hub's Integrations tab (proof of both sides).
  **Role rules** (per server): map LunchVoice facts to Discord roles: "member of this Hub", "member with Hub role X",
  "voted in election Y" (receipt only, never choice), "has answered the latest Campaign" (receipt only). Applied when a
  person links, clicks **Verify** in the server, or on a nightly sweep; removed when false. A server learns only the facts
  its rules ask about, only for people who linked and consented. The bot needs Manage Roles only if rules exist.
- **Limits.** Per server 25 rules; sweeps rate limited to Discord's limits with backoff; staff can disable a connection.
- **Done when.** A member joins the Hub, clicks Verify and receives the Discord role; leaving the Hub removes it on the next sweep.

### F3. Decision posts and results cards in Discord

- **Behavior.** Commands: `/lunchvoice post` (a Campaign card with an **Answer** button, existing), `/lunchvoice results`
  (the latest published snapshot as an embed: totals only, withheld shown as "withheld", with a link), `/lunchvoice decisions`
  (the latest published decisions), `/lunchvoice discuss` (adds a "Discuss in #channel" link on a Campaign or decision).
  **Auto-announce** (per server, per channel, off by default): a new Campaign is posted when published; a decision is
  posted when its status becomes `decided` or `done`; an election's results when certified. Posts follow the privacy rule:
  **anonymous Campaigns are always answered in the LunchVoice player** (a button opens it), because Discord sees clicks;
  identified polls may be answered in Discord by buttons for linked people.
- **Data.** `lv.discord_posts` (post id, channel, message id, delivery status, last error) for health and retries; the existing
  dispatch cron processes them; failures surface in the Integrations tab with a "Retry" and a plain reason ("the bot lost
  permission to post in #channel").
- **Done when.** A published decision appears in the connected channel with the right content and link; revoking the bot's
  permission shows a clear error and re-granting recovers.

### F4. Discord onboarding

- **Behavior.** `/lunchvoice invite` creates a Hub invite link (E7) and posts it. A new member who arrives from Discord
  signs in, joins, and is told to click **Verify** to receive their role.
- **Done when.** A scripted newcomer goes from the Discord post to a verified role in under 2 minutes.

### F5. Abuse limits and staff control

- **Behavior.** Per-server and per-user command rate limits; a server's connection can be disabled by staff from `/admin`
  with a reason; bot errors never leak tokens or message contents to users; the bot only requests the permissions it uses.

---

## G. Platform

### G1. Public API v1 and docs

- **State.** Built (Team, keys, scopes, REST `/v1`). **Finish**: an OpenAPI 3.1 file `public/openapi.json` generated from
  the function's route table and checked by a test; a `/developers` page showing it with copy-paste examples in curl and
  JavaScript; key rotation (create a second key, revoke the first); per-key rate limits visible; new scopes
  `decisions:read`, `snapshots:read`; keys stop working while the Hub lacks Team (nothing deleted).
- **Done when.** The OpenAPI file validates and the examples run against a test Hub.

### G2. Webhooks

- **Behavior.** Existing events plus `decision.published`, `results.published`, `election.certified`. Signed
  `t=…,v1=HMAC-SHA256`, retries with backoff, delivery log without payload bodies. **SSRF defence (blocker)**: HTTPS only;
  resolve DNS and refuse private, loopback, link-local and metadata addresses (IPv4 and IPv6) at connection time (not only
  at save); no redirects followed; 5-second timeout; 100 KB payload cap; at most 10 endpoints per Hub.
- **Done when.** The SSRF test suite (private IPs, DNS rebinding with a short TTL, redirects to a private address, IPv6
  mapped addresses) passes.

### G3. Account export and deletion

- **Behavior.** **Export my data** (Account → Privacy): a JSON and CSV package of what the person provided and what we hold
  about them: profile, memberships, Hubs, their identified answers, their participation receipts (not the content of
  anonymous answers, which cannot be linked to them), notifications, device sessions (labels and dates), billing
  records. Delivered as a signed, 24-hour download link by email after re-authentication. Deletion exists (F-05); add the
  14-day "undo" window? **Default: no undo** (matches F-05) but a clear confirmation that lists what disappears.
- **Done when.** An export for a fixture person contains exactly the expected files and no other person's data.

### G4. Admin console completeness

- **Behavior.** Staff panel gains: billing release (B8), readiness, reports queue with appeals (E6), Discord server
  connections with disable, Discover queue (E8), user lookup by account id (never by an email search across all users
  without a reason code), audit log viewer with filters. Staff access requires two-factor through KpnIdentity (S-series) and
  every staff action writes an audit row with a reason.
- **Done when.** Each tab works with a staff test account and a non-staff account is refused everywhere.

### G5. Product analytics (PostHog), cookieless

- **Behavior.** Seven events only: `signup_completed`, `survey_published`, `survey_response_submitted` (no ids, no answers),
  `hub_created`, `checkout_started`, `checkout_completed`, `decision_published`. No cookies (memory persistence), no IP
  storage, no session replay, no autocapture, route patterns rewritten (`/c/:joinCode`), a "Do Not Track" respect, and the
  tagline experiment: `data-hero-line` attribute read as a property on `signup_completed`. CSP gains the PostHog host
  (`connect-src`). Staff dashboard in PostHog; no personal data leaves.
- **Done when.** The seven events arrive with no identifiers beyond a random per-session id, verified in the network log.

### G6. Creator dashboard (functional, for `create.lunchvoice.com`)

- **Purpose.** One home for every creator, whatever plan (D-06).
- **Behavior.** Sections: **Library** (the person's surveys, drafts and Campaigns across personal space and Hubs, filterable),
  **Templates** (the 82), **Create** (new survey, with a space switcher between personal space and any Hub the person edits),
  **Results**, **Trends**, **Present**, **Decisions** (across Hubs they manage), **Branding**, **Plan and billing**.
  A **plan card** (name, what it unlocks), **usage meters** (active surveys 3 of 5, questions per survey, Trends used of
  allowed, active elections), **locked controls** with a one-line unlock note and a link to `pay.`, and **empty states** that
  teach (first survey, first Hub). Nothing is rearranged by plan.
- **Done when.** The same dashboard renders for Free, Creator Plus, Creator Pro, Starter, Team, a Campaign pass holder and a
  person with no Hub, with only the plan card, meters and locks differing.

---

## Y. Survey design (the "ask well" pillar)

### Y1. Creator studio, finished

- **Purpose.** Making a good survey is quick, forgiving and works on a phone.
- **Behavior.** Question rail, canvas and properties panel (built) finished to the functional bar: **autosave** with a visible state
  (saving, saved, offline, retrying, conflict) and a conflict dialog when two tabs or two people edit; **undo and redo** (the
  last 50 steps in a session); drag to reorder with a keyboard alternative; duplicate question; move to section;
  bulk-select delete; paste many choices at once; keyboard shortcuts with a help sheet; **mobile editing** that keeps all three
  functions (rail, canvas, properties) as a stacked layout; locked controls show the plan that opens them. Questions cannot
  change after activation (`lv_locked`, unchanged), but copy, theme and closing time can.
- **Done when.** The Starter Studio and Creator Studio journeys pass real authenticated Playwright runs on desktop and phone
  for each plan and role (handoff Gate C).

### Y2. Preview and test before publish

- **Behavior.** **Preview as a respondent** in a phone frame and a desktop frame with the real player and the creator's theme;
  a **test mode** that lets the creator submit test answers that carry `is_test = true`, are excluded from every analytic and
  count, and are purged after 24 hours; a **publish checklist** (the `readiness` library): title, at least one question,
  no logic loops, anonymity and the respondent notice shown, results setting chosen, a close time or an explicit "no close
  time", an eligible audience, a share method. Blocking items stop activation; warnings do not.
- **Security.** Test answers never enter snapshots or exports; a test flag cannot be set by a respondent.
- **Done when.** A creator tests, sees test answers separate, and the real count starts at zero.

### Y3. Personal templates, Hub templates and the question bank

- **Behavior.** **Save as template** from any survey (questions, logic, theme, settings; never answers). Personal templates:
  Free 3, Creator Plus 20, Creator Pro 100. Hub templates shared with everyone who can create in that Hub (Hub plans, up to 50;
  Team 200). A **question bank**: any saved question can be reused (copy, not link). Templates carry a plan tier check so a
  Free account cannot save a Pro-only question kind into a template and use it free. The public 82 templates stay
  read-only.
- **Data.** `lv.user_templates`, `lv.hub_templates`; limits `templates.max_personal`, `templates.max_hub` in the plan map
  (proposal; X-11).
- **Done when.** Save, reuse, share in a Hub, and the tier check, in pgTAP and e2e.

### Y4. Brand kit and themes

- **Behavior.** Survey themes are independent of Hubs (founder rule; a survey does not have to take its Hub's branding). A person
  (Creator Plus and up, and Starter Hub and up for Hub managers) can save a **brand kit** (logo, colours, gradient, cover,
  welcome and thank-you text) and apply it to any survey in one click; changing the kit does not change already-published
  surveys unless the creator chooses "update all". Contrast guard: text over the chosen colours must reach 4.5:1 or the
  editor shows the fix. Live preview in the player. Platform chrome never takes a theme (the Hub and survey colours
  frame the player only).
- **Data.** `lv.brand_kits` (account or Hub scope).
- **Done when.** A kit applies to three surveys and "update all" is audited.

### Y5. Co-creator

- **Behavior.** A survey owner may add **one co-creator** (Creator Pro: one; Hub managers by role have the access already) who can
  edit questions and settings and read results, but not billing, delete or change ownership. Added by account, accepted by
  the invitee, revocable, audited. Over-limit after a downgrade: the co-creator keeps read access, loses edit.
- **Cut line.** P1: if not passing review by Wed 12-02, drop from the Creator Pro list.
- **Done when.** An accepted co-creator edits a draft; a non-accepted one cannot see it.

---

## N. Connectivity (reach people and tools)

### N1. Share kit

- **Purpose.** A survey reaches the people it is for in the place they already are.
- **Behavior.** One **Share** panel on every survey, Campaign, decision and published snapshot: copy link; six-character join
  code; QR (PNG and SVG download, with the LunchVoice mark off by default and a creator logo option on Creator Plus and up);
  one-tap messages for Discord, email, SMS and a plain post, each pre-written in the creator's words and ending with the
  link; **link preview cards** for `/s/`, `/c/` and decisions made by the existing share-preview Worker pattern
  (`lunchvoice-hub-card`) extended with a survey and decision card (title, creator colour, question count, closing time; never
  answers or counts below 5). The Cloudflare usage log records the extension.
- **Security.** Cards never include answer data or private Hub content; a private survey's card shows only "A private
  survey on LunchVoice".
- **Done when.** Each share route renders a correct preview in the common unfurlers (agent checks with the vendors' own
  debuggers where available, otherwise by reading the tags).

### N2. Invite by email

- **Purpose.** Reach people who are not in a Hub or Discord.
- **Behavior.** A creator pastes or imports (CSV, one column) up to **20 addresses (Free), 200 (Creator Plus and Starter), 1,000 (Creator
  Pro and Team)** per survey; the creator attests they may contact them (a required checkbox, stored). Each recipient gets
  an email with a unique invite token (the existing Campaign invite mechanism: sign-in required, eligibility for that one
  Campaign only, anonymous answers still unlinked from the token's account). Rules: a global **suppression list** (unsubscribes,
  bounces, complaints, S-62) is always honoured; every email carries "Why am I getting this?" and a one-click opt-out; a daily
  cap per sender (policy `invites.email_daily_cap`, default 200) protects deliverability and the Resend allowance; reports
  of abuse suspend the sender's email invites pending staff review.
- **Data.** Reuses `lv.campaign_invites` plus `lv.email_suppressions`.
- **Tests.** Suppression honoured; cap; attestation required; token cannot be redeemed twice by different accounts when
  `max_uses=1`; anonymous answer not linkable to the token.
- **Done when.** An invitee receives, signs in, answers, and cannot be traced to the answer by the creator.

### N3. Integration recipes (documentation, not new code)

- **Behavior.** `/developers` gains short, tested recipes for connecting results to common tools using only the API and webhooks:
  results to a spreadsheet through an automation service, a Discord message on `results.published`, an email on
  `decision.published`. Each recipe is run once by the QA agent before it is published. No new integration is built or
  advertised beyond Discord, the API and webhooks; the Slack, Teams and Reddit integrations are V3.

### N4. Embed an answer link (P1, with C8)

- **Behavior.** A creator may embed a survey in another website as an iframe at `lunchvoice.com/embed/s/:token` for **link
  surveys only** (not invite-only, not identified surveys that need sign-in, not elections). The page uses the C8 path
  header rule (`frame-ancestors *` for `/embed/*` only). Guest answering and Turnstile apply; results are never shown in the
  embed. If the Render rule is not approved, N4 and C8 both ship without external embedding.

---

## K. The Kitchen (LunchVoice's own Hub, dogfooding)

- **Purpose.** Show the product working: our community decides about LunchVoice in public.
- **Behavior.** `lunchvoice.com/kitchen` already exists as a public Hub (F: status doc). Week 3: seed, **through the public
  product only**, (1) a pinned welcome news post that explains what the Kitchen is, (2) a public poll "What should we
  build next?" with the V2.x list as options, (3) a decision "Name vote" or similar, published to members, to prove C2
  and C3, (4) a connected Discord server for the LunchVoice community with role rules (F2) and auto-announce (F3), (5) the
  landing page "See a live Hub" link driven by a config value (no logic on the name).
- **Rules.** Seed content is written by the founder's account through the same screens any customer uses; no SQL seeds;
  no special-case in code; the Kitchen counts against its own plan limits (it has Team by recorded grant F-14, which stays data).
- **Done when.** A visitor can open the Kitchen, answer the poll, join the Discord, and later see "You said, we did" for
  the poll's decision.
