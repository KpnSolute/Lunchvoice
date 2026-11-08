# Changelog

This file is the durable project memory. Every meaningful code, configuration,
release, and operational change belongs here. Entries follow Keep a Changelog
categories and the repository's decimal `X.X.X` release policy.

## [Unreleased]

### Fixed and changed (UX polish pass)

- Production bug: Hub colour swatches rendered blank because `lv_hub_get` returns the palette as `{key,label,hex}`
  objects and the UI painted the objects; the stored accent is a key. `src/lib/accent.ts` resolves key to hex
  everywhere (Hub header, cover, Builder preview, Discover cards); the mock now returns the SQL shape.
- Hub Settings: Reddit-style "Community appearance" editor (labelled swatches with a check, live preview of banner,
  Hub mark, Join button, tabs and a Campaign card; Save/Reset with save state). The accent applies only to the Hub's
  own pages, never to LunchVoice chrome.
- Owner walkthrough fixes: Questions panel no longer shows under other Studio sections; member roles in one menu with
  remove confirmation; revoked invite codes disappear and invites can be emailed; role names keep their casing,
  roles can be edited and deletion asks first; Discover shows a requirements checklist; Hub settings show save state;
  a fresh Hub shows a getting-started card; Builder/Newsroom visibility labels; thank-you screen contrast.
- Poll quick-create (one Single choice question, two empty options, Question focused, poll summary in Review);
  Rating and Feedback starters.
- Respondent player motion from the design tokens only: direction-aware question transitions, gliding progress,
  jelly on choice, spring-filled rating circles with a word per value, staggered welcome, drawn check and a CSS burst
  on thanks; all instant under reduced motion. Creator side: count-up metrics, growing result bars, copy pop, a live
  response counter that never shows a withheld count as a number.
- Tests: unit 29/29, e2e 59/59 (13 new). JS +5.4 kB gzip, CSS +1.8 kB.

### Operations (2026-11-08)

- Billing paused at the founder's request: `billing.provider_ready` back to false (open 07:52-15:41 UTC; one checkout
  session was started, no charge was made; the open Stripe session expires on its own). The paid path was proven up
  to Stripe: a server-created session for exactly $13.00 with automatic tax. Stripe Tax is active (head office set);
  webhook destination enabled with the six events; secrets set; all four Edge Functions deployed from main
  (`session` v3 with LC-13 replay protection).
- F-14: KpnWorld listed on Discover by founder override (public, Team granted, approved entry with its real
  genuine-member count, recorded as a founder decision and in the audit log).

### Operations (production, 2026-11-08)

- Stripe (live account "Lunchvoice"): products `lv_starter_hub`, `lv_team_hub`, `lv_campaign_starter`,
  `lv_campaign_plus`, `lv_hub_reservation` with seven USD tax-exclusive prices at the canonical amounts (lookup keys
  `lv_*`), and the default Customer Portal configuration (cancel at period end, no proration, payment methods,
  invoices; no plan switching or promotion codes). Stripe Tax is pending the founder's head office address.
- Applied 000018-000022 to production under the founder's approval after the gate was met (0 BLOCKER, 0 HIGH).
  Rehearsed first on a database holding 000001-000017 plus production-shaped data (accounts, Hub, personal space,
  Quick Surveys, a hashed invite, waitlist): all applied, link tokens backfilled, the founder's context still works.
  Files hash-verified from `33cf4a7`; 000018 applied and verified alone before 000019-000022. Migration history set
  to 000018-000022. Grant audit: 109 `lv_api` functions, 13 signed-out (as reviewed), nothing PUBLIC, no `lv`
  reachability, RLS everywhere, every definer function pins `search_path`.
- `billing.stripe_prices` holds the Stripe price IDs; `billing.provider_ready` stays false (no checkout yet).
- #47 merged and deployed; 12 live routes (incl. /discover, /reserve) with zero CSP violations; sign-in reads
  "Continue with KpnSolute". Edge Functions `session` (LC-13), `billing-webhook`, `checkout`, `email-dispatch` await
  a CLI deploy by the founder (the Composio deploy tool cannot set `verify_jwt` or an import map).

### Compliance (feature-complete gate met)

- Targeted re-review at 8f2feb0: FB-01 closed (attack refused in both directions; forced rows blocked at activation),
  FB-02/04/05 closed; 0 BLOCKER, 0 HIGH. FB-06 (one newly admitted member between two Hub-wide anonymous Campaigns)
  accepted as LOW for launch with a public FAQ disclosure ("Can totals ever reveal one person?"); the structural fix
  (freeze the audience at activation, withhold results across anonymous Campaigns differing by 1-4 members) is
  scheduled after launch. Remaining: LC-08 legal operator name (founder), accepted MEDIUM/LOW items.
- Full e2e suite 46/46; canonical suite 1003 checks, 0 failed.

### Security (FB-01, 000022)

- Full-build compliance re-review found one HIGH (FB-01): two anonymous Campaigns targeted at overlapping roles
  that differ by one member let the creator difference out that member's answer. Role targeting is now for
  identified Campaigns only: a trigger refuses an anonymous, role-targeted Campaign (setting roles on an anonymous
  draft, or switching a role-targeted draft to anonymous, answers `lv_not_available` with an explanation) and the
  activation gate adds `role_targeting_anonymous`. Track A's tests now target roles on identified Campaigns. New
  suite `22_anonymous_role_targeting.sql` (9 checks, including the reproduced attack). The Studio disables
  "Specific roles" on anonymous Campaigns and "Anonymous" while roles are chosen, each with the reason; the mock
  follows the same rule.

### Fixed

- Founder bug report: a new question with options but no question text never saved and the editor did not say why
  (the example placeholder looked like real text). The Question field now has a neutral placeholder and shows
  "Type the question text to save this question." as soon as options are entered; the outline says
  "Not saved yet: type the question text". E2e test added.
- Sign-in button reads "Continue with KpnSolute" (KpnSolute account; Google is one way to sign in to it); the
  waitlist page says the same.
- FB-02: `/privacy` lists community data, payments (Stripe), service emails and their 30-day retention, the
  Discover listing, and Stripe and Resend as processors. FB-04: the leaderboard opt-in says anonymous Campaigns
  count too. FB-05: invite emails say who sent them and how to report abuse (function test added).
- Full-build compliance re-review merged into `docs/compliance/LAUNCH_COMPLIANCE_REVIEW.md` §8.

### Security and gaps (full build: track A; 000018)

- LC-10: every Campaign has a 128-bit link token for links and QR codes; failed join-code lookups are rate-limited
  per caller and globally. LC-11: guest keys from `crypto.getRandomValues`. LC-12: the database requires
  `aud = authenticated` and `session_kind = lunchvoice` (the deployed `session` function already issues both, checked
  in its deployed bundle). LC-13: single-use ID-token exchange and a 10-minute `iat` limit in `session`. LC-14: strict
  return-path checks (react-router has no fixed 6.x; mitigated). LC-30: bundle check forbids key and secret
  patterns. LC-37: the More sheet is a real modal. NEW-05: Campaign invite tokens stored hashed.
- Gaps closed: Campaign description; server-side option validation; Quick Survey access change while draft; Team
  role targeting (eligibility and thresholds count only role holders); `lv_hub_limits` for managers; new-question
  save race; owner transfer is now an offer the member accepts or declines.

### Fixed (integration)

- Roles page read `custom_slots` as a number, but `lv_role_list` returns `{ used, limit }`: on production the slot
  meter showed an object and "all slots used" never triggered. Types, mock and page now follow the SQL shape.
- An unsaved new question was lost when switching Studio sections; the Questions workbench now stays mounted.
  New e2e test confirmed to fail without the fix.

### Verification (all tracks)

- Canonical suite through 000021: 994 checks, 0 failed, races and full rollback. Function tests 60/60, unit 26/26,
  e2e 44/44, `test:pr` and high-severity audit clean; every UI API call matches its SQL signature.

### Added (full build: track B commerce, email and admin; 000019)

- Stripe-ready checkout end to end: `checkout` Edge Function creating server-side Checkout Sessions (subscriptions
  for Hub plans; Campaign plans as first period + extra weeks so the subtotal equals the intent amount; automatic tax;
  no promotion codes), Customer Portal, `lv_billing_config`, renewals and period-end cancellation in the webhook
  (NEW-01 guarantees kept), Hub Name Reservation purchase and renewal at `/reserve`. Fails closed until the founder
  sets `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs and `billing.provider_ready`.
- Transactional email outbox and `email-dispatch` (Resend when `RESEND_API_KEY` is set; otherwise queued) with
  templates E01-E08; never an answer in mail; receipts only for identified Campaigns; deleted with the account.
- Platform admin console `/admin` (waitlist without emails, abuse reports, Campaign block, Discover decisions,
  billing events, outbox); every admin function refuses non-admins.

### Added (full build: track C community and Discover; 000020)

- Custom pages with safe limited markdown and members/public visibility; Newsroom (drafts, publish, pin; public posts
  only on public Hubs); Comments with report, hide and delete moderation and rate limits; opt-in Leaderboard counting
  ended Campaigns only; optional Hub points and a Shop with manual fulfilment (no cash value); public `/discover`
  directory of approved Team Hubs with rounded member counts. Builder add-ons are real (no more "Coming with M2").
  Every community operation refuses personal spaces; guests never post, comment, order or rank.

### Added (integration; 000021)

- A fulfilled shop order queues one E08 email to the member's verified address (placed/cancelled send nothing).

### Verification

- Canonical suite through 000021: 881 checks, 0 failed, races and full rollback rehearsed. Function tests 54/54,
  unit 23/23, e2e 30/30, `test:pr` and high-severity audit clean; 95 UI API calls match their SQL signatures.

### Operations (live verification, 2026-11-07)

- Security headers (LC-04) are live on lunchvoice.com (set in the Render dashboard because the static site is not
  Blueprint-managed): CSP, HSTS, nosniff, referrer and permissions policies, frame blocking. With the CSP active, 10
  live routes load with zero violations and the sign-in redirect to auth.kpnsolute.com works.
- Founder sign-in verified on production: one account, one identity, no duplicate identity pairs; waitlist admission
  granted one Founding credit, consumed once by the founder's Hub (Starter / founding / waitlist, protected Owner).
- UI correction pass (#45) deployed.

### Added (full build plan)

- `docs/v2/BUILD_PLAN_2026-11-21.md`: definition of done for feature-complete (2026-11-21) ahead of the 2026-12-01
  launch, three parallel full-stack tracks (hardening and gaps, commerce/email/admin, community and Discover) with
  migration numbers, ownership rules and build decisions B-01, B-02, C-01, C-02.

### Changed (UI/UX correction pass)

- Hub overview: the stat row is one responsive grid; plan names ("Starter") never wrap per character; the Plan tile is
  a raised card with an amber edge instead of a full orange card, so activity stays primary. The share card states the
  real join mode (open / approval / invite only), shows the full address without clipping, and offers Copy link, QR
  code and Invite (for people who can admit members).
- Campaign Studio rebuilt as Details | Questions | Audience | Schedule | Review with free navigation, a lifecycle
  badge, autosave state, Preview from the draft (no submission) and a lifecycle-derived action (Schedule or Publish
  from draft; Pause, Resume, Close, Archive afterwards; never Publish once live). Publish is disabled with an
  accessible explanation until the Review checklist passes; the server still re-validates and its errors are shown.
- Questions: one Add question; choice options as editable rows (add, remove, reorder by drag or keyboard, 2-10);
  a Required switch mapped to `config.optional`; type changes that drop options ask first.
- Audience, response identity (anonymous / identified) and guest responses are three separate controls; only
  options the backend supports are offered.
- Schedule section (start now or later, end never or later, end after start) with real plan limits from the API.
- Error copy uses the backend's field-specific messages; "Some details need fixing." is only a last resort.
- Quick Surveys keep their single-page flow (Title, Questions, Who can respond, Publish) and share the question editor.
- Review summary labels and values no longer overlap at 390px.
- `npm run test:e2e` (Playwright against the dev mock; not part of `test:pr`): 11 tests covering the corrections,
  including a painted-text overlap check that fails on the old layout. Dev dependency: `playwright`.

### Fixed (Campaign first-question autosave)

- Campaign Studio and Quick Surveys now create the first question at position 1, matching the database constraint that question positions must be greater than zero. This fixes the production autosave error that left a valid first question unsaved with “That value is not allowed.”

### Operations (production, 2026-11-07)

- Applied 000014-000017 to the LunchVoice production project (`qprfonxvthmaoxfixigk`) under the founder's
  conditional approval (F-13) after the gate was met. Pre-checks passed (chain 000001-000013, no data, no slug
  conflicts); backup 2184898828 recorded; files hash-verified from `e375fca`. Migration history versions set to
  000014-000017. Grant audit A-F and policy values matched the runbook exactly.
- Exposed `lv_api` through the Data API (`public,graphql_public,lv_api`; `lv` stays private). This fixes the HTTP 406
  that blocked every app call after sign-in. Signed-out smoke: `lv_my_context` answers `lv_unauthenticated`,
  `lv_waitlist_status` shows 50 open seats, `lv_plan_limits` is public, signed-in functions are refused (401).

### Compliance (launch gate met)

- `docs/compliance/LAUNCH_COMPLIANCE_REVIEW.md` §7.7: targeted re-review at 5c665e1 confirms 0 BLOCKER and 0 HIGH
  open (NEW-01 reproduced and refused; NEW-02, NEW-06, NEW-08, LC-31, NEW-03, NEW-04, NEW-07 closed). Open: 4 MEDIUM
  (LC-10, LC-12, LC-13, LC-14) and 5 LOW, each with an owner.

### Security (000017 billing hardening)

- NEW-01 (HIGH): `lv.billing_apply_event` grants only for a matching checkout intent with `payment_status` paid (or no
  payment required), currency `usd` and `amount_subtotal` equal to the intent's amount; product, account, Hub, slug
  and weeks come only from the intent. `checkout.session.async_payment_succeeded` is handled; unpaid sessions grant
  nothing. Fixed-price links can no longer over-grant Campaign weeks.
- NEW-02: refunds follow F-08 (partial refunds never revoke; full refunds revoke only unused credits, unstarted
  windows and reservations; Hub subscriptions keep access to the end of the paid period).
- NEW-06: questions marked optional may be skipped by members and guests; required ones may not.
- NEW-08: waitlist seats are never re-issued after an account is deleted (at most 50 Founding grants ever).
- LC-31: the error-contract test uses a synthetic slug.
- Canonical suite: 660 checks, 0 failed, rollback of 000014-000017 rehearsed. Function tests: 24 pass.

### Fixed (compliance re-review, UI side)

- NEW-03: the account-deletion copy no longer promises to delete anonymous written answers (they were never linked to
  the person and cannot be found); it states what is deleted and what stays.
- NEW-04: `/privacy` adds who can see stored data (operator access), provider request logs, the US data region and a
  children statement (not directed at children under 13; schools through adult administrators).
- NEW-07: CSV export neutralises spreadsheet formulas in cells.
- `docs/compliance/LAUNCH_COMPLIANCE_REVIEW.md` section 7: reconciliation of all 41 original findings on the
  integrated branch (every original BLOCKER and HIGH closed) and new findings NEW-01 to NEW-08.

### Added (launch backend: migrations 000014-000016)

- 000014: one entitlement map (`lv.plan_limits`, products incl. Campaign Plus at 3900 + 1900/week), entitlements and
  Hub credits (`lv_hub_create` consumes a credit; no beta gate), Founding entitlements ending 30 days after
  `billing.launched_at`, the 50-seat waitlist (race-safe; consent version for the optional email; never
  authorization), personal spaces and Quick Surveys (link or invite-only, 5 slots, archive frees a slot, 20 creations
  per hour), the survey threshold gate, fail-closed expiry, `lv_report_abuse` and admin block, explicit grants with an
  anon allow-list and RLS on every table (LC-05), reserved slugs synced with every UI route (LC-24).
- 000015: Hub update/branding, owner transfer, Hub delete with a 30-day slug quarantine and `lv_hub_gone` (LC-27),
  Hub pages, profile update, account delete with irreversible unlinking and free-text removal (LC-16), recent sign-in
  required for destructive actions (LC-22).
- 000016: checkout intents (fail closed), idempotent service-role-only `lv.billing_apply_event`, billing summary,
  Hub Name Reservation lifecycle, strict analytics engine `lv.safe_cells` (LC-01, LC-02), free text only at 5+ in
  random order, export, Discover gate, retention sweep.
- `billing-webhook` Edge Function (Stripe signature check, 503 without the secret) with tests; runbook rewritten for
  the real production state (LC-07), including exposing `lv_api` only after the grant audit.
- Canonical suite: 628 checks, 0 failed, slug and waitlist races, full rollback rehearsal. Function tests: 21 pass.

### Fixed (UI aligned to the real backend)

- `lv_waitlist_join` now receives `p_intended_hub_name` (it was sent as `p_note`, which the Data API would reject);
  `lv_checkout_start` passes `p_slug`; a fully withheld question renders as Withheld, never as "no answers"; the
  merged withheld cell's `null` key is handled; `lv_reauth_required` has copy. Every UI RPC call (59) was checked
  against the SQL signatures by argument name: 0 mismatches.

### Security (LC-04)

- `render.yaml` sets production headers on every path: a Content-Security-Policy built from the app's real runtime
  origins (self, the Lunchvoice Supabase project, the KpnIdentity issuer; the theme pre-paint script pinned by
  sha256; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri`/`form-action 'self'`), HSTS (1 year),
  `nosniff`, `strict-origin-when-cross-origin`, a restrictive Permissions-Policy and `X-Frame-Options: DENY`.
  Verified against a production build served with these headers: 10 routes and the sign-in redirect to KpnIdentity
  ran with zero CSP violations. Must be re-verified on the live site after deploy.

### Added (launch UI on the shadcn layer)

- One UI system: shadcn components (button, inputs, select, checkbox, radio, switch, tabs, dialog, alert-dialog,
  sheet, menus, popover, tooltip, toasts, badge, card, table, skeleton, progress, accordion, avatar, scroll-area,
  input-otp, alert) restyled to the tactile tokens, plus composite blocks (QuotaMeter, ResultBars with one striped
  withheld bucket, TypedConfirm, QrCode, Notice, EmptyState). `src/components/ui.tsx` is now a thin wrapper over it.
- Launch journey: landing with the waitlist section, `/waitlist` (and `/whitelist` redirecting to it), `/me`
  dashboard, Quick Surveys (`/surveys`, editor, results, `/s/:token` invites) with link, client-side QR and join code,
  `/create` stepper on Hub credits, the rebuilt Hub workspace (overview, Campaigns, Studio, results, members, invites,
  roles, settings with owner transfer and delete, Builder pages, billing, reservation, Discover) and the player.
- Respondent copy derives from the Campaign's settings (LC-03); "Report this survey" on every respondent screen;
  blocked Campaign and "This Hub is no longer available" states.
- `/privacy` plain-language data summary (stored data, anonymity, guests, browser storage keys, subprocessors,
  retention, deletion), `/support` and footer contact (`src/config/contact.ts`, address to confirm), legal operator
  placeholder (LC-08). Reserved slugs gain `how-it-works`, `use-cases`, `whitelist`, `waitlist`, `signup`, `surveys`,
  `s`, `c`, `j`, `brand`, `licenses` (LC-24, UI side).
- Pricing: the founder's capability table, Campaign Plus at $39 for 2 weeks + $19 per week, tax, cancellation and
  refund notes; checkout disabled with a reason.
- Typed `lvApi` and dev-only mock for every launch operation; new error copy (`lv_entitlement_required`,
  `lv_billing_unavailable`, `lv_hub_gone`, `lv_confirmation_mismatch`, `lv_not_available`).
- Dependency: `qrcode` (client-side QR, own chunk). The Hub workspace and Quick Surveys are lazy route chunks
  (JS 238.7 kB gzip in total).

### Changed (founder final decisions, 2026-11-07)

- Campaign Plus is priced: $39 for the first 2 weeks, $19 per additional week (master spec 11.5, `AGENTS.md`,
  `CLAUDE.md`, `LAUNCH_PLAN.md`).
- Master spec gains 11.0 Free Quick Survey (personal space, limits, access modes) and the waitlist rule in section 12.
- `LAUNCH_PLAN.md`: "whitelist" is now "waitlist" and never authorization; founder decisions F-01 to F-13 (strict
  anonymity, deletion with free-text removal, 30-day slug quarantine, abuse brakes, refunds and cancellation, Stripe
  Tax, minors, legal operator, conditional production approval) and the BLOCKER/HIGH-zero launch gate.

### Added (launch compliance review)

- `docs/v2/LAUNCH_PLAN.md` records decisions L-07 to L-14 taken with Jev on the review's founder questions, and lists
  the decisions that stay with the founder (refunds, Campaign Plus price, minors, legal review, production approval).
- `docs/compliance/LAUNCH_COMPLIANCE_REVIEW.md`: privacy, security, payments-readiness, policy, legal-surface and
  accessibility review of the launch plan and current code (1 blocker, 7 high, 21 medium, 12 low), a reusable
  re-review checklist and the founder decisions needed. Findings are assigned to the backend and UI work in progress.

### Added (launch plan)

- `docs/v2/LAUNCH_PLAN.md`: the founder direction of 2026-11-07 (free Quick Surveys, 50-seat whitelist launch with a
  free Founding Starter entitlement), the decisions taken for the founder with Jev (L-01 to L-06), architecture
  decisions A-01 to A-05, the launch definition of done, the roadmap and the API contract the backend and UI build to.
  `AGENTS.md` and `CLAUDE.md` point to it.

### Added (shadcn/ui on the design system)

- Tailwind v4 (`tailwindcss`, `@tailwindcss/vite`) and shadcn/ui (`components.json`, Radix, Nova style), with the
  `@/` import alias in `tsconfig.json` and `vite.config.ts`. New runtime dependencies: `radix-ui`,
  `class-variance-authority`, `cn` (shadcn's class merger), `lucide-react`, `tw-animate-css`; `shadcn` is a
  dev dependency (its `tailwind.css` is only read at build time).
- `src/ui/shadcn.css` maps every shadcn variable onto the `--lv-*` tokens, so components follow light, dark and high
  contrast with no per-theme block. It imports no preflight, scopes its reset to `[data-slot]`, and Tailwind scans
  only `src/components/shadcn/`: scanning the whole app generated `container`, `grid`, `hidden` and `table` utilities
  from existing class names. `--muted` is left to `index.css` (muted text); shadcn's muted surface maps to the well.
- First component: `src/components/shadcn/button.tsx`, shown in the dev-only gallery (`/__gallery`). Checked in the
  browser in all three themes; the landing page still has no horizontal scroll at 390px.
- `docs/frontend/FRONTEND.md` documents how to add components and the rules above.

### Added (shadcn MCP server)

- `.mcp.json` registers the shadcn MCP server (`shadcn mcp init --client claude`) so agents can browse, search and get
  add commands for shadcn registry components. Pinned to `shadcn@4.23.0` and started with `npx`; it is not a project
  dependency (the init's devDependency and 218-package lockfile change were dropped). The project has no
  `components.json` yet, so adding components still needs a deliberate shadcn setup first.

### Changed (Campaign Studio)

- Campaign Studio rebuilt as three panes: a numbered questions outline, an editor (prompt and options save when you leave a field) with a live respondent preview, and a Share panel (link, join code, QR placeholder, facts). On phones it is one pane at a time with Outline, Edit and Share tabs. Published Campaigns stay locked and say so.
- In dark mode, amber is no longer used as text on the surfaces that turn light.

### Added (route registry and participant pages)

- `src/config/routes.json`: one entry per route (layout L1 to L11, shell, access, milestone) from the Core Routes map, and `scripts/check-route-layouts.mjs` (in `test:pr` and `test:light`) which fails when a route has no entry or an entry has no route. Tested in `scripts/check-route-layouts.test.mjs`.
- Participant Hub shell (L10): a Hub cover (mark, name, address, visibility) for visitors and for the add-on pages. The six M2 pages (`/:hub/shop`, `leaderboard`, `news`, `news/:post`, `comments`, `p/:page`) exist as honest "Coming with M2" states.
- Hub Builder (`/:hub/builder`, owner): page toggles with a participant tab preview. Saving is disabled and says why (`lv_hub_pages_update` is not available yet).

### Added (respondent player)

- Respondent player rebuilt to the design (L9): welcome with promises (anonymity, skip anything, time), one question per screen with a segmented progress bar and Skip, a review screen with Edit, and a thanks screen. Bare surface: no app header, no signature, Powered by LunchVoice at the foot. Drafts still resume; offline shows a banner and holds the Submit until you are back online.
- Accessible question controls (`src/ui/QuestionControls.tsx`): rating circles, yes/no tiles, single and multi choice with a max-N message, and open text with a counter. Radiogroups use a roving tabindex with arrow keys; selection is the pressed amber surface plus a glyph; jelly motion respects reduced motion.
- `StateScreen` (L11) for not found, error, closed, scheduled, ineligible, offline, empty and loading, in plain words with a next step.

### Changed (v2 UI screens)

- Account home (`/me`) rebuilt to the design: greeting, stat tiles, a "pick up where you left off" card, My Hubs rail with Hub marks, join shortcut. Only data the API provides is shown (no invented streaks or badges).
- Signed-in header pills (Home, Join, Create, Settings) on desktop; shared `BottomTabs` on phones for account and Hub routes: solid surface, no blur, 52px targets, the current tab is the pressed amber surface with `aria-current`, and a More sheet holds the extra Hub sections. The old blurred bottom nav is gone.
- Hub overview is the dashboard layout: live Campaigns, members and roles tiles, an All Campaigns list with phase badges, a People rail for managers, and the share panel. The Hub header shows the Hub mark; the segmented tab strip is desktop only.
- New icons (settings, join, more, back, globe, clock).

### Added (v2 UI foundations)

- `src/ui/tokens.css`: the design system's tokens (core v1.1) as the single source, with light, dark and high-contrast themes selected by `data-theme` on `<html>`. The older variable names in `index.css` now map onto these tokens, so every existing page gains dark and high contrast without per-page CSS.
- `src/ui/theme.ts`, `ThemeControl` and a pre-paint script in `index.html`: Appearance in Settings (System, Light, Dark, High contrast), saved on the device only, no flash of the wrong theme. Selected is the pressed amber surface; the group is a radiogroup with arrow-key navigation.
- Self-hosted fonts (Bricolage Grotesque, Geist, Space Mono; latin and latin-ext only) replace Google Fonts; OFL licence texts ship in `/licenses`. The page now contacts no third-party host.
- `src/ui/ui.css` (shared primitives; first is the segmented control).

### Fixed (v2 UI foundations)

- The landing page scrolled sideways at phone and tablet widths; it no longer does (checked at 320 to 1600 px on 14 public routes).
- The hero eyebrow, step and plan icons and empty-state icon used the on-amber ink colour as foreground on the page, which disappeared in dark mode; they now use the page ink.
- Hard-coded surface colors in `index.css`, `system.css` and `landing.css` now use tokens.

### Added (KpnIdentity sign-in)

- `supabase/functions/session/deno.json`: the function's own import map, so the Supabase deploy bundles `jose` (the shared `supabase/functions/deno.json` is not read by the deploy).

- `[functions.session] verify_jwt = false` in `supabase/config.toml` so redeploys keep the function reachable before sign-in; setup guide records the LunchVoice OAuth client id and the KpnIdentity issuer.

- Real sign-in: **Continue with Google** redirects to KpnIdentity (Supabase Auth OAuth 2.1 server) with
  PKCE S256, state and nonce; `/auth/callback` exchanges the code for an ID token and the new `session`
  Edge Function turns it into a one-hour LunchVoice session with the same `(issuer, subject)`.
- `session` Edge Function: verifies signature (KpnIdentity JWKS, ES256/RS256 only), allow-listed issuer,
  audience, expiry, UUID subject and nonce before anything else; fails closed when unconfigured.
  Tested with `npm run test:functions` (now part of `test:pr`).
- `docs/v2/KPNIDENTITY_SETUP.md`: the flow and every setting it needs. Expired sessions are dropped on load.

### Fixed (tactile surfaces after the handoff pass)

- Price cards were left flat white with a hairline while every other surface moved to the raised gradient, and display
  text asked for weight 900, which the Bricolage variable font clamps to 800. Cards now use the raised surface at the
  28px hero radius and display weight is stated as 800 everywhere.
- The reservation lifecycle on an ink panel needed light rules; it now has that override instead of invisible borders.
- `.commit-msg` is ignored so a temporary commit message can never be committed again.

### Changed (adopt the v2 design handoff's type and tactile layer)

- Type now comes from the v2 design handoff (`tokens/lunchvoice-tokens.css`, `ASSET_MANIFEST.md`): **Bricolage Grotesque**
  for display at weight 800 with -0.045em tracking and 0.88–0.96 leading, **Geist** for UI and body, **Space Mono** kept for
  labels, codes and numbers. Fraunces and Space Grotesk are gone. Fonts load from Google Fonts for now; the manifest asks for
  self-hosting before launch, which is a dependency change and is not done here.
- Adopted the handoff palette and radii: page `#EEEDEA`, line `#DAD8D4`, well `#E9E8E5`, ink gradient `#2E2A25 → #14110F`,
  accent `#FF9A18` with `#E98207` deep, fields at 16px, cards at 24px, hero at 28px.
- Adopted the tactile surface layer everywhere: raised gradient cards with an inner top light, pressed amber CTA
  (`#FFBE5C → #FF9A18 → #F58C0C` with the three-layer shadow), ink-gradient primary buttons, inset wells for inputs,
  segmented tabs with a raised thumb, and spring press motion (`cubic-bezier(.34,1.56,.64,1)`).
- Landing hero rebuilt to the handoff's `7d` treatment: floating pill nav, marker-highlight phrase instead of the italic
  accent, and a "Have a join code?" well card linking to `/join`. The v1 layer (grain, ticker, ghost numerals, reveal)
  stays and matches the handoff's landing.
- Documented the source of the tokens in `index.css` so the next agent can trace them.

### Added (v1 design DNA, and the last UI phases)

- Marketing surface now carries the retired v1 visual language instead of a plain landing: paper grain (SVG turbulence,
  no asset), the amber mono ticker band, amber italic display accent in the hero, a hero gradient with a citrus glow,
  oversized ghost numerals on the how-it-works steps, hover-lift cards, ruled section eyebrows and scroll-reveal in
  `src/pages/Landing.tsx` + `src/styles/landing.css`. Reveals are skipped under `prefers-reduced-motion`.
- Typography hardened: `preconnect` for `fonts.gstatic.com`, hero scale that fits its column at every width, and a
  mobile marketing nav (the desktop links become a scrollable strip) instead of hiding navigation below 720px.
- Full-width sticky marketing header aligned to the 1120px column, at 96% opacity so content cannot bleed through it.
- `src/pages/Pricing.tsx` rebuilt as a real surface: all six canonical plans, the Starter/Team entitlement table, the
  two Campaign windows (Plus stays unpriced), and Hub Name Reservation with its ACTIVE → GRACE → RELEASED lifecycle.
  Every checkout stays disabled with the reason shown; the page says up front that nothing can charge you.
- Hub tabs now expose Billing, Reservation and Discover for the Owner (they had routes but no way in), and a mobile
  bottom tab bar (`ui-bottom-nav`) gives the five most-used Hub surfaces thumb reach.
- Billing, Reservation and Discover surfaces are filled out with the canonical prices, the reservation lifecycle and a
  real member meter toward 700, each still failing closed on the missing endpoint.
- `src/pages/Analytics.tsx` rebuilt on the design system: ink participation panel, per-question distribution bars, and
  suppressed answers grouped into an explicit withheld state. Export stays disabled until an authorized export exists.
- Component gallery covers the new marketing pieces (ticker, price card, lifecycle) and the withheld bar treatment.
- `src/lib/errors.ts`: `lv_policy_undecided` now says an anonymous Campaign publishes results once it closes, instead of
  referring to an unsettled policy.
- Removed dead surfaces: `src/pages/Me.tsx`, `NotFound` in `Public.tsx`, `ComingSoon` in `Pricing.tsx`.

### Added (public landing page)

- Replaced the placeholder hero with a real marketing page: hero with an example Campaign card (including a withheld
  cohort), how-it-works steps, a privacy section explaining anonymous-by-default / withheld-never-zero / guests-stay-guests,
  six use cases (dining only as one), a pricing teaser read from `src/config/pricing.ts`, an FAQ, a closing call to action
  and a footer. Type-led layout in the existing ink/amber/bone tokens.
- Marketing chrome in `Shell`: nav (How it works, Use cases, Pricing) on `/` and `/pricing` only, so in-product Hub routes
  keep the compact header; footer carries the maker's mark.
- `src/components/MakerMark.tsx`: `MakerMark`/`MadeBy` for the KpnSolute signature, using `currentColor` and a documented
  placeholder until the real SVG and typeface are supplied (`--font-maker` token added in `src/styles/landing.css`).
- Anchor targets carry `scroll-margin-top` so sections do not hide under the sticky header; hash links scroll on navigation.
- Verified in the browser at 1280px and 390px: no console errors, no horizontal overflow at 390px.


### Fixed

- Production build: `src/lib/reservedSlugs.test.ts` imports `node:test`, and `tsc -b` type-checks everything under
  `src/`, but `@types/node` was only present transitively through `vite`. A cold Render install resolved it as missing
  and the deploy build failed. Declared `@types/node` in `devDependencies` and committed the lockfile.

### Fixed

- `AGENTS.md`/`CLAUDE.md`: the architecture-map line pointed at `graphify-out/wiki/index.md`, deleted with the v1 map.
  It now says no map exists yet and names `/graphify` as the way to rebuild the v2 one. Both files stay identical.
- Restored the `database` PR job ("Canonical v2 database suite") that PR #26 added and a later squash-merge dropped:
  it runs `scripts/db-test-canonical.sh` against a throwaway Postgres container. Verified locally: 356 checks, 0 failed,
  slug race and rollback rehearsal included.

### Removed (v1 residue)

- Deleted `graphify-out/`: 34 generated files that mapped the v1 app (`Menu_Data_&_Student_Pages`, `Auth_&_App_Shell`,
  `Admin_&_DB_Types`, `Edge_Function_HTTP_Utils`, `Home()`, and a `graph.json` whose v1 vocabulary outweighs everything
  else in the repo). Regenerate it with `/graphify` once the v2 architecture settles; `AGENTS.md` still points at
  `graphify-out/wiki/index.md`, so that reference is dangling until the backend thread regenerates or drops it.
- Deleted `time-log.md`, the v1 work log that opens with the `MJCC-Portal/Interact` clone. Git history keeps it.
- Renamed the package from `lunch-line-survey` to `lunchvoice` and synced the lockfile; the name was the retired
  product's.
- `render.yaml`: replaced the v1 route comment (`/join`, `/survey/:id`, `/admin/*`) with the v2 routes. The service
  `name` stays `lunch-line-survey` on purpose - it is the existing Render service identifier and renaming it here would
  provision a new service, so that change belongs in the Render dashboard.
- `index.html`: `og:title` was `Lunch Voice`; it now matches the brand, `LunchVoice`.

### Frontend baseline rebased onto `main` (`uiv2`)

- The v2 frontend branch is rebased onto `main` at `d45b449` and renamed `uiv2`. Conflicts were resolved in `main`'s
  favour for everything the backend thread owns (`AGENTS.md`, `CLAUDE.md`, `docs/backend/*`, `docs/v2/PRODUCT_SPEC.md`,
  `scripts/db-test-canonical.sh`, `supabase/tests/*`), because the branch copies were older and still pointed the brain
  at the retired repo; the v2 `.env.example` template and this changelog's UI entries were kept.
- Added `scripts/check-customer-names.mjs`, a source guard that fails on `LionCafe`, `MCC`-style customer names,
  `Miami` or `Job Corps` anywhere under `src/`, including tests and fixtures. Wired into `test:pr` and `test:light` so
  CI enforces it.
- `src/lib/reservedSlugs.test.ts` fixtures renamed to synthetic names (`acme-test`, `example-hub`) so the test no longer
  needs a customer name to prove that a business name is not reserved.
- Removed the `edge-functions` Deno job from `.github/workflows/pr-checks.yml`. It ran
  `deno test supabase/functions/_shared/`, but v2 has no `supabase/functions` directory, so it failed on every pull
  request for code that does not exist. Overlaps the intent of draft PR #27; land one or the other, not both.

### Security

- The dev mock API and the simulated sign-in no longer ship in production bundles: they are gated on `import.meta.env.DEV`, a
  production build without Supabase configuration fails closed, and `scripts/check-bundle.mjs` now fails on dev-only strings.
  Adopted the backend's v2 `AGENTS.md`/`CLAUDE.md`; removed `public/tenants`, `legacy/`, the v1 `.env.example` values and
  `docs/backend/DATA_AND_MIGRATION_PLAN.md`.

### Added (read APIs and screens)

- Typed client now covers the full `lv_api` contract (hub get, members, invites, campaigns, submit, analytics, beta). Screens:
  public Hub landing (readable signed out), Campaign list, Campaign Studio (add questions, publish, close, share code),
  respondent player (one question per screen, anonymity notice, receipt), results with explicit "Withheld" states, Members and
  Invitations, `/pricing` from `src/config/pricing.ts` (Campaign Plus has no price; checkout disabled), placeholder
  `/discover`, `/billing`, `/settings`. Create Hub handles `lv_beta_required` with a beta application.
  Walked in the browser against the dev mock (create Hub, publish Campaign, respond, results); no console errors.

### Documentation

- Frontend docs reset to the v2 canonical master spec (2026-10-25): `README.md`, `PRODUCT.md` and `DESIGN.md` rewritten for the
  Hub/Campaign SaaS (Hybrid design direction, canonical pricing, Campaign Plus has no numeric price, Hub Name Reservation);
  new `docs/frontend/FRONTEND.md` (routes, boundaries, mock-to-real replacement table, work order, acceptance test) and
  `docs/frontend/HANDOFF.md`; `MULTI_TENANT_PLAN.md` (v1 plan) removed; history keeps it. `discover` added to the reserved slugs;
  `lioncafe` and `mjcc-admin` removed from them so no customer name is special-cased (regression test added).
  `AGENTS.md`, `CLAUDE.md` and the spec/API contract remain with the backend thread.

### Changed

- **v2 frontend reset (branch `feat/v2-ui`).** Removed every v1 screen and its support code: student/cafeteria routes,
  Content Central and the other admin screens, the `/LionCafe` and subdomain redirects, `AuthProvider`/`Gate`, the MJCC staff
  SSO callback, the organization provider, menu/QR/workbook libraries and the v1 `public.*` types. `src/index.css` was trimmed
  to the shared tokens, buttons, forms, cards, pills and chart styles. Unused dependencies `fflate`, `qrcode` and
  `@types/qrcode` were dropped. Legacy behaviour lives in Git history only. No database, deployment or MJCC data was touched.
- `scripts/check-bundle.mjs` and its test now require `lv_api` markers instead of v1 Supabase markers.
- `AGENTS.md` / `CLAUDE.md` still describe v1 and are intentionally unchanged here (they must stay byte-identical); updating
  them is pending an owner decision on v2 agent notes.

### Added

- v2 frontend foundation: routes `/`, `/signin`, `/me`, `/:hub`, `/:hub/campaigns`, `/:hub/campaigns/:id`, `/:hub/analytics`;
  `src/lib/lvApi.ts` typed client over the 13 `lv_api` functions; `src/lib/reservedSlugs.ts` (system-path reservation, mirrored
  to the backend) with `npm run test:unit`; `src/identity/IdentityProvider.tsx` (simulated sign-in in mock mode only, since the
  KpnIdentity issuer does not exist yet); an in-memory mock transport used when no Supabase env is set.

- Added the canonical v2 fresh-install baseline: `supabase/migrations/000001_v2_core.sql` through `000006_v2_platform.sql`
  (core identity/Hubs/memberships, authorization, campaigns, participation, privacy analytics, platform), each with a matching
  `supabase/rollbacks/*.down.sql`. A **blank database plus these six files is a complete LunchVoice v2 installation**; the
  legacy `public/` migrations in the same directory are v1 and are not part of it. Identity is `(issuer, subject)` with
  `UNIQUE(identity_issuer, identity_subject)`; there is no auth-user-keyed identity, no legacy-auth-user synthesis, no
  `public.profiles` mirror trigger and no dependency on `public.orgs`. For an anonymous Campaign the submission stores no
  account and the participation stores no submission, enforced by triggers, so there is no stored join path from a person to
  their answers. Tables live in schema `lv` and are never exposed; the whole API surface is 13 `lv_api` functions.
- Added `scripts/db-test-canonical.sh`, a fresh-install runner that applies only the canonical migrations to a throwaway
  Postgres, runs every suite, then applies and reverses the full baseline. It **fails on a zero-check run** rather than
  reporting a false green.
- Added tests: `supabase/tests/setup.sql` plus `01_identity` (25), `02_authorization` (28), `03_privacy` (26),
  `04_analytics` (22), `05_acceptance` (50) and `06_concurrency` (11). **162 checks executed, 0 failed**, and the full
  baseline applies to a blank database and rolls back completely.
- Added `docs/backend/PRODUCTION_RESET_RUNBOOK.md`: the not-approved, not-executed procedure for resetting the v1 database,
  including what is destroyed (137 users, 72 responses, 639 answers, 803 ratings, 14 orders), what is preserved, the
  dependency of all six live Edge Functions on `profiles`/`orgs`, how the first v2 administrator and MJCC Hub are created, how
  to prove no old student data survived, and the fact that there is **no rollback** after the schema drop.

### Changed

- **Founder reset, 2026-10-25 (supersedes every earlier entry that preserves, migrates or special-cases v1 or LionCafe).**
  LunchVoice v1 is retired and nothing is preserved, migrated, backfilled, mapped or bridged; LunchVoice builds the platform
  and never a customer Hub. No Hub, owner, role, page, Campaign, slug or fixture for LionCafe or MJCC exists in product code,
  migrations or tests; a customer creates `lioncafe` through the public `lv_hub_create` flow. The earlier entries below that
  mention creating the MJCC Hub, a Dec 11 MJCC launch or a v1 staff-permission fix are historical and no longer apply.
- Added the canonical spec to the repo as `docs/v2/LunchVoice_v2_CANONICAL_MASTER_SPEC_2026-10-25.md`, and the split worker
  prompts as `docs/v2/handoffs/UI_WORKER.md` and `docs/v2/handoffs/BACKEND_WORKER.md`.
- Rewrote `AGENTS.md` and `CLAUDE.md` (byte-identical) as v2-only: SaaS boundary, identity, one entitlement map (Starter $13/mo,
  Team $29/mo, Campaign Starter $19 for 2 weeks plus $13 per week, Campaign Plus price unset and fail-closed, Hub Name
  Reservation $25 per 12 months with 25-day grace), `lv_api`-only frontend, error contract, privacy rules and thread ownership.
- Rewrote `docs/backend/EXECUTION_ROADMAP.md` to the spec's 14-slice backend order with the entitlement map and the audit of the
  migration chain. Amended `docs/v2/PRODUCT_SPEC.md` (now subordinate to the master spec; MJCC preservation, subdomain/LionCafe
  compatibility and Campaign-Pass-only reservation wording replaced) and `docs/backend/PRODUCTION_RESET_RUNBOOK.md` (the reset
  no longer creates any Hub).
- Audit of migrations 000001-000007: no v1 table dependency, no seed. Fixed two issues: tests created `lioncafe` as their sample
  Hub (now a synthetic Hub), and a draft reserved-slug list carried `mjcc-admin` and `lioncafe-admin` (removed; no customer name
  is reserved). Added a test that no customer name is reserved and that no Hub exists before a customer creates one.

- Added `supabase/migrations/000008_v2_error_envelope.sql` (with rollback and `08_error_contract` tests). All 13 `lv_api` write
  functions now return `{ok:false, error:{code, message, ...}}` for every expected failure; bodies moved to `lv.api_*` behind
  thin wrappers; `lv_gate_blocked` carries `reasons`; caller-caused database rule violations map to `lv_invalid_input`,
  `lv_conflict` or `lv_not_found`; real faults stay exceptional as `lv_server_error` with no detail. `lv_hub_create` now
  validates slug format and display name itself (no raw constraint errors) and writes a `hub.created` audit event. For anonymous
  Campaigns the submission and answer timestamps are coarsened to the day so they never equal the participation timestamp (the
  stored join path found in the spec audit). Existing tests that expected raises now assert error codes.
- Added a two-connection slug race to `scripts/db-test-canonical.sh`: two clients claim one slug at once; exactly one wins, the
  other gets `lv_conflict` and keeps its approval. Suite is now 228 checks plus the race, 0 failed, rollback rehearsal passing.

### Removed

- **v1 removed from the repository (founder authorization 2026-10-26).** Deleted the v1 Edge Functions (`login-start`,
  `staff-login`, `staff-sso`, `staff-status`, `menu-sync`, `send-email` and `_shared`), `supabase/keepalive.sql`, the tracked
  `supabase/.temp/linked-project.json`, `legacy/`, `public/tenants/`, `scripts/check-email-setup.mjs`, the `deploy:functions` and
  `check:email` scripts, the MJCC menu bridge and tenant-map settings in `.env.example`, and all 20 v1 migrations from
  `supabase/migrations/`. The active migration directory now contains only `000001`-`000008`, so `supabase db reset` or `db push`
  produces only the v2 schema; `scripts/db-test-canonical.sh` fails if any other file appears there. Git history keeps v1.
  Not touched here (UI branch owns them): `src/` v1 frontend, `scripts/check-bundle.mjs` and `scripts/release-policy*`.
- **Live production not yet reset.** The backend session's Supabase connector and the local CLI login cannot see project
  `qprfonxvthmaoxfixigk`, so the destructive live steps (drop v1 schema, delete v1 users, retire v1 functions and secrets,
  install v2, deploy v2) are blocked on access and have not been run. See `docs/backend/PRODUCTION_RESET_RUNBOOK.md`.
- Removed `MULTI_TENANT_PLAN.md` and `docs/backend/DATA_AND_MIGRATION_PLAN.md`, which planned v1 org-to-Hub continuity and a data
  migration. Git history keeps them.

### Added

- **Roadmap slices 7, 8, 10 and 11 (branch `feat/v2-collab-participation-api`, stacked on `feat/v2-read-api`; not applied to
  production).** Split with the backend thread: this branch owns migrations `000010`-`000019`; slices 4, 5, 6, 9, 12 and 13 stay
  with the backend thread. Each migration has a rollback and a test suite; documented append-only in `docs/backend/API_CONTRACT.md`.
  - `000010_v2_roles_members.sql`: capability catalogue with groups; custom roles with name and icon; `lv_role_list/create/update/
    delete`, `lv_member_role_assign/unassign`, `lv_hub_join`, `lv_member_leave/admit/reject/remove`. No escalation anywhere (nobody
    grants, edits, deletes, assigns or removes past their own capabilities); Owner role untouchable; the Owner never uses a custom
    slot. Custom-role slots read `lv.custom_role_limit()`, which fails closed until policy `roles.max_custom_per_hub` is set; slice 9
    should replace that body with the entitlement map. Members can leave and rejoin (`left` status); removal stays permanent.
    `lv_invite_redeem` now re-admits someone who left.
  - `000011_v2_campaign_lifecycle.sql`: statuses `paused` and `archived`; Scheduled and Ended are derived from the window
    (`lv.campaign_phase`), so scheduled Campaigns hold their slot from publication and no background job is needed. Publishing writes
    an immutable `lv.campaign_versions` row (questions, participation settings, limit in force). New `lv_campaign_update`,
    `lv_campaign_question_update/remove`, `lv_campaign_schedule`, `lv_campaign_pause/resume` (resume re-checks the cap),
    `lv_campaign_archive`, `lv_campaign_versions`; `lv_campaign_close` now also closes paused or scheduled Campaigns and refuses drafts.
  - `000012_v2_participation_modes.sql`: guest participation (`audience = 'members_and_guests'`) through `lv_guest_campaign_get` and
    `lv_guest_submit` by join code, signed out. Guests never create memberships or count toward member totals; dedup by a hashed
    client key; per-Campaign total and per-minute rate limits, failing closed until policy `participation.guest_rate_per_minute` is set.
    `lv_campaign_set_participation` (draft only).
  - `000013_v2_analytics.sql`: anonymous results publish once finished (closed, archived or past `closes_at`; paused is not finished);
    guests counted apart (`guest_n`) and included in the frozen release population; new `participation_rate` and `rating_summary`
    metrics; `multi_choice` counted per option; `lv_analytics_overview`; `lv.campaign_member_participation()` for the survey unlock
    threshold in slice 9.
  - Tests: `10_roles_members` (46 checks), `11_campaign_lifecycle` (39), `12_participation_modes` (23), `13_analytics` (20).
    `scripts/db-test-canonical.sh`: 356 checks, 0 failed, slug race passing, full apply and rollback rehearsal passing.
  - Not done here: ownership transfer (slice 6), entitlement-driven limits (slice 9), election-mode guest rules (no election mode
    exists yet), true parallel races for the new advisory locks, and `lv_campaign_list/get` still return the stored status (the UI
    derives the phase; folding `phase` into those reads is left to the read-API owner).

- Added `supabase/migrations/000007_v2_read_api.sql` (with rollback and `07_read_api` tests): read API for the v2 frontend
  (`lv_hub_get`, `lv_campaign_list`, `lv_campaign_get`, `lv_member_list`, `lv_invite_list`, `lv_invite_preview`, `lv_beta_status`),
  richer `lv_my_context` (roles, capabilities, platform-admin and beta state), a completed reserved-slug list enforced by a
  trigger, and a no-double-hyphen slug rule. Documented in `docs/backend/API_CONTRACT.md`.

### Added

- Added the canonical v2 fresh-install baseline: `supabase/migrations/000001_v2_core.sql` through `000006_v2_platform.sql`
  (core identity/Hubs/memberships, authorization, campaigns, participation, privacy analytics, platform), each with a matching
  `supabase/rollbacks/*.down.sql`. A **blank database plus these six files is a complete LunchVoice v2 installation**; the
  legacy `public/` migrations in the same directory are v1 and are not part of it. Identity is `(issuer, subject)` with
  `UNIQUE(identity_issuer, identity_subject)`; there is no auth-user-keyed identity, no legacy-auth-user synthesis, no
  `public.profiles` mirror trigger and no dependency on `public.orgs`. For an anonymous Campaign the submission stores no
  account and the participation stores no submission, enforced by triggers, so there is no stored join path from a person to
  their answers. Tables live in schema `lv` and are never exposed; the whole API surface is 13 `lv_api` functions.
- Added `scripts/db-test-canonical.sh`, a fresh-install runner that applies only the canonical migrations to a throwaway
  Postgres, runs every suite, then applies and reverses the full baseline. It **fails on a zero-check run** rather than
  reporting a false green.
- Added tests: `supabase/tests/setup.sql` plus `01_identity` (25), `02_authorization` (28), `03_privacy` (26),
  `04_analytics` (22), `05_acceptance` (50) and `06_concurrency` (11). **162 checks executed, 0 failed**, and the full
  baseline applies to a blank database and rolls back completely.
- Added `docs/backend/PRODUCTION_RESET_RUNBOOK.md`: the not-approved, not-executed procedure for resetting the v1 database,
  including what is destroyed (137 users, 72 responses, 639 answers, 803 ratings, 14 orders), what is preserved, the
  dependency of all six live Edge Functions on `profiles`/`orgs`, how the first v2 administrator and MJCC Hub are created, how
  to prove no old student data survived, and the fact that there is **no rollback** after the schema drop.

### Changed

- **Architecture: LunchVoice v2 starts fresh; D-01 Option D withdrawn.** Google → KpnIdentity → LunchVoice is now the only
  identity path, and the old student dataset is explicitly not migrated. Old student accounts, responses, answers, ratings,
  points, reward history and legacy memberships do not carry into v2; the old production database is v1 / retirement-pending.
  Identity is the `(issuer, subject)` pair with `UNIQUE(identity_issuer, identity_subject)`; email is never the identity key.
  Hubs get independent v2 identities and no longer depend on `public.orgs`; `public.profiles` is not the v2 identity model and
  `role`, `is_staff`, `org_id` and `mjcc_username` are absent from the canonical schema. The legacy survey bridge is removed.
  Recorded in `docs/backend/D01_IDENTITY_SUPERSESSION_2026-10-25.md`, which supersedes parts of the D-01 packet
  (`docs/backend/D01_IDENTITY_DECISION_PACKET.md`), `docs/v2/PRODUCT_SPEC.md` (V2-02), `docs/backend/DATA_AND_MIGRATION_PLAN.md`
  (§2 principle 4) and `docs/backend/EXECUTION_ROADMAP.md`, all of which were amended in the same change so no authoritative
  document still mandates Option D or v1 data continuity.
- **Schedule risk recorded, not softened:** with no fallback, Dec 11 depends on a KpnIdentity issuer that does not yet exist.
  Architecture correctness takes priority over retaining Option D.

### Added

- Added `docs/v2/IDENTITY_CONTRACT.md`: what crosses from KpnIdentity into LunchVoice (`iss`, `sub`, `email`,
  `email_verified`, `name`, `picture`, nonce), the token/session trust model, validation and fail-closed rules, account-linking
  rules (no email merging), verified-vs-unverified behaviour, and the explicit statement that email is not the identity key.
- Added `docs/v2/KPNIDENTITY_SCHEMA_V1.md`: a minimal identity schema (`kpni.profiles`, `kpni.oauth_clients`,
  `kpni.oauth_redirect_uris`, `kpni.security_events`), the Supabase-managed vs application-table split, and the deliberate
  exclusions (MFA, grants, tenancy, billing) that would otherwise make an oversized IAM platform.
- Added `docs/v2/LUNCHVOICE_SCHEMA_V2.md`: the canonical fresh-install schema and its six baseline migrations, the
  `accounts → hub_memberships → membership_roles → role_capabilities` model, and the anonymity boundary.
- Added `docs/backend/V2_MIGRATION_CLASSIFICATION.md`: KEEP / REDESIGN / REMOVE for all 11 prototype migrations with reasons
  and destinations, plus the ported non-SQL assets. Nothing in the prototype stack was deleted.

### Notes

- The prototype stack (`feat/v2-hub-invitations` and the other 10 v2 branches) is unchanged and remains the research record.
  The canonical baseline is built on `feat/v2-canonical-baseline` off `main`, not on the prototype branch.
- No production database was read, written or wiped in this change.

### Added

- Fixed the project-scoped Supabase MCP server failing to start in the Claude desktop app on Windows with WSL (`.mcp.json`). The app launches `bash` from Windows with the
  `\\wsl.localhost\...` repository folder as the working directory, which Windows does not support, so the relative `scripts/mcp/supabase.sh` was never found
  ("Connection closed"). The server is now started by absolute path (`$HOME/projects/lunchvoice/scripts/mcp/supabase.sh`), which assumes the checkout lives there.
  The wrapper, token handling and read/write setting are unchanged. No secret, migration or database change.
- Added pull-request validation (`.github/workflows/pr-checks.yml`). Previously the only
  workflow ran on pushes to `main`, so a PR could merge with no automated checks. The new
  workflow runs on `pull_request`, has read-only permissions and no secrets, and cannot tag,
  release, deploy or push. It runs `check:brain`, new script tests (`node --test scripts/*.test.mjs`),
  the production build, a bundle smoke check, and Deno tests for
  `supabase/functions/_shared/`; it requires a `CHANGELOG.md` update in every PR and runs
  `npm audit --audit-level=high` when the PR touches dependency, auth, org, migration,
  function, workflow or hook paths. Builds now use placeholder (non-secret)
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`: without them `src/lib/supabase.ts` throws
  at load and the bundler drops the whole app, so a green build proved little;
  `scripts/check-bundle.mjs` now fails if the bundle lacks the app and Supabase client.
  Added `release-policy.mjs pr <base>` mode and npm scripts `test:pr`, `test:scripts`,
  `check:bundle`. `test:light`, `test:heavy` and `version-release.yml` are unchanged.
  Branch protection (making these checks required) is a separate founder decision; no
  repository setting was changed.
- Added project-scoped MCP server setup (`scripts/mcp/`): the Supabase MCP server now starts through
  `scripts/mcp/supabase.sh`, which loads secrets only from a gitignored, owner-only `.mcp.env` (never from the
  global shell), is scoped to one project with `--project-ref`, starts **read-only** by default, and pins
  `@supabase/mcp-server-supabase@0.13.0` instead of `@latest`. `.mcp.json`, `.cursor/mcp.json` and
  `.vscode/mcp.json` call the wrapper and contain no secrets; `.vscode/mcp.json` now uses VS Code's documented
  `servers` root (it previously used `mcpServers`). Also added a generic `with-env.sh` wrapper for future servers,
  `doctor.sh` (checks the setup and confirms the project ref exists for the token using one read-only API request),
  `.mcp.env.example`, a README, and 6 tests (`scripts/mcp.test.mjs`). `SUPABASE_ACCESS_TOKEN` was removed from
  `.env.example` (it moves to `.mcp.env`). Render MCP is documented but not enabled: its HTTP transport needs an API
  key in the process environment and no key scoping is documented. No secret, migration, resource or deployment.
- Added a signed KpnSolute CloudEvents receiver to the existing `menu-sync`
  function for MJCC menu-day and menu-cycle events. It verifies Standard
  Webhooks signatures against the raw request body, enforces the tenant-to-org
  mapping, and atomically deduplicates and projects menu data into Lunchvoice.
  The existing pull/manual synchronization remains available as a fallback.
- Added the service-role-only event receipt/projection migration and bounded
  CloudEvent request bodies to 256 KiB. Source verification passed Deno check,
  the independent signature test, `check:brain`, and the production build. No
  migration, secret, function deployment, or live subscription was applied.

### Fixed

- Restricted self-service writes to `public.profiles` (migration
  `20261023225534_restrict_profile_self_service_columns`, **applied to production on 2026-10-23** with the
  founder's authorization through the project MCP server, then recorded here with the same version). API roles
  (`anon`, `authenticated`) can no longer INSERT or UPDATE profile rows at table level; signed-in users may update
  only `email` and `display_name` (the app's only client-side profile write, `src/routes/Login.tsx`). Production
  already restricted UPDATE to those two columns, but that grant was never recorded in the migrations, so fresh
  replays did not match; this codifies it. A `BEFORE UPDATE` trigger additionally rejects changes to privileged
  columns (role, staff flag, points, streak, last survey date, org, MJCC username) by any role other than the
  database owner roles and the service role. Profiles are still created by `handle_new_user()` (SECURITY DEFINER,
  owned by `postgres`); points/streak changes still happen in SECURITY DEFINER RPCs; Edge Functions use the service
  role. Verified on a throwaway database replay first, then in production via catalog checks (privileges, trigger,
  unchanged profile counts).
- Fixed the heavy-test selector in `scripts/release-policy.mjs`: it matched
  `src/contexts/Auth`, a directory that does not exist, so a commit touching only
  `src/auth/AuthProvider.tsx` or `src/org/OrgProvider.tsx` skipped the heavy release
  gate. The patterns now live in `scripts/release-patterns.mjs` (covering `src/auth/`,
  `src/org/`, `src/lib/supabase`, `supabase/config.toml`, `.githooks/` and the release
  scripts besides the earlier paths) with regression tests.

- Remediated the three high-severity dependency advisories reported by `npm audit`
  on 2026-10-23 (`vite` 8.1.3 -> 8.3.5, `nanoid` 3.3.17 -> 3.3.20, `source-map-js`
  1.2.1 -> 1.2.2, with the matching `rolldown` 1.1.4 -> 1.2.15 and `postcss`
  8.5.25 -> 8.5.31 updates) by refreshing `package-lock.json` only; `package.json`
  ranges are unchanged and `react-router-dom` moved within 6.x (6.30.4 -> 6.30.6).
  `npm audit --audit-level=high` now exits 0, so the heavy release gate passes
  again. Two moderate `react-router` / `react-router-dom` advisories remain: their fix
  requires React Router 7 (major). Assessment: the app is a client-side SPA with no
  server rendering or hydration, so the `deserializeErrors()` advisory has no
  reachable path; every `<Navigate>`/`navigate()` target in `src/` begins with a fixed
  prefix (`/${org.slug}`, `/LionCafe`, a relative path, or `/`), so the backslash
  open-redirect advisory has no user-controlled leading segment today. This is a
  read-through of the call sites, not a proof; the React Router 7 migration remains
  a separate, scheduled change. Verified with placeholder `VITE_SUPABASE_*`
  values (see below) that the production bundle still contains the same app and
  Supabase client code (519 kB -> 517 kB). No migration, secret or deployment.
- Discovered that `npm run build` without `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` succeeds but produces a near-empty bundle (`src/lib/supabase.ts`
  throws at module load, so the bundler drops everything after it), meaning a "passing
  build" in an environment without those variables proves little. The CI change
  tracks this separately.

- Updated the locked PostCSS toolchain to remove the high-severity source-map
  path-disclosure advisory found by the release audit. Two moderate React
  Router advisories remain because their upstream fix requires the separate
  React Router 7 migration; the high-severity release gate is clean.

- Fixed the Supabase MCP server failing with a permission error in every
  local AI tool (Claude Code, Cursor, VS Code). `.mcp.json`,
  `.cursor/mcp.json`, and `.vscode/mcp.json` all pointed at the hosted
  `mcp.supabase.com` endpoint; the two IDE configs sent no `Authorization`
  header at all, and none had ever been committed, so a fresh clone had no
  working Supabase MCP access regardless of tool. Switched all three to the
  local `npx`-spawned `@supabase/mcp-server-supabase` server, scoped to this
  project via `--project-ref=qprfonxvthmaoxfixigk` and authenticated with
  `SUPABASE_ACCESS_TOKEN` (documented in `.env.example`, same Supabase
  account as KpnCompute). Verified full read/write access to the live
  project via the Management API directly (19 public tables reachable)
  before committing the config.

- Fixed `single_choice`/`yes_no` answers being double-counted in Content
  Central's Results tab: they were tallied correctly as choice-bar options
  but also pushed into the free-text bucket, inflating "Open comments" and
  showing structured picks (e.g. "Yes", "Too small") as if they were quoted
  student comments. Only genuine open-text answers land in the text bucket
  now.
- Fixed the dead "Continue with MJCC" staff sign-in button: `MJCC_STAFF_SSO_URL`
  pointed at `mjcc.kpncompute.com`, whose apex domain no longer resolves in
  DNS. The live portal moved to `mjcc.kpnsolute.com` (confirmed reachable,
  same underlying Render service) — updated the constant and the matching
  README reference. Backend edge functions were unaffected; they already call
  the stable `mjcc-managements.onrender.com` URL directly.
- Applied the `responses`/`join_code` tracking-integrity migration to MJCCv2
  (unique constraint on `responses(session_id, student_id)`, org-scoped
  `join_code`, reserved-column comments). While applying it, found and
  dropped a second, untracked unique constraint on the same `responses`
  columns that predated this change and wasn't recorded in any migration
  file — both enforced the same thing, so the untracked one was removed.
- Applied `20260706153000_add_flame_slider_question_types.sql`, which had
  been written and committed but never actually run against MJCCv2 — the
  `survey_questions.type` check constraint was silently missing `flame` and
  `slider` even though the Question Editor UI already offered both as answer
  types, so creating either would have failed with a database error.
- Made the session duration dropdown reflect what's actually saved:
  previously it always showed a hardcoded "30 minutes" default regardless of
  the session's real `closes_at`, so clicking "Set duration" without
  deliberately changing the dropdown could silently shrink a session that
  was set to close much later. It now seeds from the session's persisted
  duration (mapped to the closest preset) on load.

- Stopped "Set duration" from silently reopening a closed survey session to
  students — it now only updates the auto-lock time, never `is_active`.
  Reopening a session is exclusively a Close/Reopen action, and that action
  (along with Remove/Show in Available) now requires a confirmation naming the
  live student-facing consequence before it fires.
- Stopped every session-card action (Close/Reopen, Set duration, Available
  toggle) from reloading the whole Content Central tab and resetting scroll to
  the top — these now patch local state instead of a full refetch.
- Added a unique constraint on `responses(session_id, student_id)` to close a
  check-then-insert race in `submit_response` that could double-award points
  on a double-submit or retry. Confirmed zero existing duplicate rows before
  applying.
- Re-scoped `sessions.join_code` uniqueness from global to per-`org_id`,
  matching the org-scoped design of the rest of the schema; prevents a
  spurious insert failure if two different orgs happen to generate the same
  join code.
- Fixed double-encoded UTF-8 (mojibake) on the student Surveys page that
  rendered `Loading…` and `·` as garbled characters.
- Replaced the ambiguous "fixed survey" session label with "No linked survey"
  so staff can tell an intentionally template-less session from a broken
  join.
- Made staff sessions expire only after 60 minutes of real inactivity across
  open Lunchvoice tabs, then return staff to the MJCC-backed admin login instead
  of silently dropping them into the student flow.
- Replaced blank legacy dish-idea rows with ranked tag bubbles sourced from
  dynamic survey answers categorized as Ideas, legacy survey ideas, and visible
  Student Voice ideas. Empty answers are ignored and repeated ideas show their
  combined request count.
- Replaced the separate Lunchvoice staff-password flow with a one-time MJCC
  single-sign-on handoff. Staff sessions are now provisioned in MJCCv2 only
  after KpnCompute confirms the live LionCafe role grant, and persisted sessions
  continue to recheck that same grant.
- Fixed Student Voice submissions by sending the authenticated student ID and
  visible status required by the tenant-scoped database insert policy.
- Replaced the displayed-row count with exact Student Voice totals and kind
  counts, refreshed through database events, browser focus, and five-second
  polling. The admin dashboard now includes those totals and Student Voice
  ideas alongside survey ideas.
- Allowed HTTPS tenant subdomains through the staff Edge Function CORS checks
  and stopped transient staff-status failures from signing sudo staff out. Only
  a confirmed upstream access revocation now ends the local session.
- Made Content Central results refresh from database changes, browser focus,
  and a five-second polling fallback. Response totals and trends now use the
  response records directly, including submissions without dynamic answers.
- Disambiguated the admin results embeds from `survey_answers` to
  `survey_questions` and `responses`, preventing PostgREST `PGRST201` errors
  when duplicate database foreign-key relationships are present.

### Added

- Added the project-scoped Supabase MCP skeleton at `.mcp.json`, targeting
  MJCCv2 (`qprfonxvthmaoxfixigk`) without storing credentials in the repository.

- Added a dedicated "Sessions" tab in Content Central, separate from "Launch,"
  with search by title/join code, Active/Closed grouping with counts, a
  visually distinct "Live controls" cluster on each card so staff can tell
  read-only info from student-facing actions, and the QR code now renders
  directly under its own button instead of below three unrelated controls.
- Added a campus-compatible KpnCompute launch path, a short-lived SSO callback,
  and staff QR destination controls for either the Render campus URL or the
  public Lunchvoice URL. QR codes can now be downloaded as high-resolution PNG
  images for flyers. The KpnCompute bridge, MJCCv2 functions, and Interact
  frontend were deployed and verified fail-closed for anonymous/forged access.
- Added three clear student survey access paths: QR links that survive sign-in
  or sign-up and open the intended survey, code entry on the Surveys page, and
  an optional staff-controlled Available surveys list.
- Added an authenticated, tenant-scoped `join_available_session` RPC plus staff
  launch/session controls for opting sessions into student discovery.
- Added wildcard hostname routing so any subscribed organization can use
  `<orgSlug>.lunchvoice.com` while the root and `www` hosts remain the public
  Lunch Voice site. Existing `/:orgSlug` URLs remain compatible.
- Added governing-agent rules for Codex and Claude, including KpnRelay pawn
  operation, Regional Overseer/Synthesis Drive handoffs, standing routine push
  authority, bounded OpenCode/Mimo delegation, credit safeguards, and
  PowerShell-first frontline automation.
- Added staff controls to edit store-item details, stock, point cost, and
  visibility, plus guarded permanent deletion for items without order history.
- Added a one-time, per-staff Content Central tutorial covering survey creation,
  questions, publishing, launching, and results, with an optional replay button.
- Added configurable survey durations for both launch and active-session
  management, ranging from 15 minutes to one week with a manual-close option.
- Established identical `AGENTS.md` and `CLAUDE.md` project-brain instructions.
- Added automatic sequential commit tagging and milestone release automation.
- Added light/heavy test classification and project-brain consistency checks.
- Added the project-specific work-session time log.

### Changed

- Restricted session reads so code-only sessions stay hidden until a student
  joins, while discoverable active sessions and each student's joined history
  remain accessible under RLS.
- Reset the repository package version baseline to `0.0.1` for the new release
  sequence. Historical commits remain untagged; automation begins at current
  `main`.
- Enabled the Windows WSL and Virtual Machine Platform features and staged a
  per-user Docker Desktop installation for isolated local Supabase testing.

## [0.0.1] - Unreleased

- Initial version-policy baseline.
