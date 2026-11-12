# LunchVoice v2 launch plan (2026-11-07)

Owner: the governing agent. Binding for the backend, UI and compliance agents until launch.
Order of authority: this file's **Founder direction** section, then the canonical master spec
(`LunchVoice_v2_CANONICAL_MASTER_SPEC_2026-10-25.md`), then everything else. Where they differ, this file wins,
because it records the founder's direction of 2026-11-07, which is newer than the spec.

Goal: a live, waitlist-only LunchVoice SaaS that the founder can sign in to, use end to end, and then connect Stripe
to without further backend or UI work. Nothing in this plan charges money.

## Founder direction (2026-11-07)

1. **Three connected experiences:** Quick Survey (free), Campaign (time-bounded paid), Hub (ongoing paid). A person
   never has to create a Hub to ask a question, and a Hub owner can still make Quick Surveys.
2. **Quick Surveys (free):** any signed-in user, up to **5 active**, up to **10 questions**, core question kinds
   (rating, single choice, multi choice, yes/no, text). Access is **anyone with the link** (link, QR, 6-character join
   code, never listed publicly) or **invite only** (only people the creator invited; sign-in required). Anonymous or
   identified. Simple start/end scheduling, basic totals and charts, history, LunchVoice branding. No members, roles,
   pages, segmentation or exports.
3. **Waitlist launch:** `lunchvoice.com/waitlist` (and a section on the landing page). Joining requires sign-in.
   The **first 50** people are admitted automatically; later joiners are waitlisted. An admitted person gets a free
   **Founding** entitlement: one Hub credit in the **Starter** family, free **until paid billing launches, then 30
   more days**, after which premium actions lock (data is kept). There is no permanent creator waitlist: once billing
   is live, anyone can buy an entitlement.
4. **Capability table:** the founder's table (Free / Campaign Starter / Campaign Plus / Starter Hub / Team Hub) is the
   product truth for limits. Campaign Plus is $39 for the first 2 weeks + $19 per additional week (founder, 2026-11-07). The Team overall
   active-Campaign limit stays provisional (A-04).

## Decisions taken for the founder (Jev, 2026-11-07, recorded)

| ID | Decision | Value | Jev confidence |
| --- | --- | --- | --- |
| L-01 | Waitlist grant | Starter family, free until billing launches + 30 days | 0.87 |
| L-02 | Waitlist admission | First 50 signed-in joiners auto-admitted, rest waitlisted | 0.50 |
| L-03 | Waitlist requires sign-in | Yes; seat bound to (issuer, subject); optional contact email stored separately | 0.78 |
| L-04 | Analytics minimum cohort | 5 (`campaign.min_cohort`) | 0.43 |
| L-05 | Guest submissions per Campaign per minute | 10 (`participation.guest_rate_per_minute`) | 0.26 |
| L-06 | Quick Survey question limit | 10 | 0.28 |
| L-07 | Anonymous analytics strictness (LC-01, LC-02) | Strict: withhold mean/n of a question with any withheld cell, one merged withheld bucket, dominance rule, no participation rate at 100% or when non-respondents < min cohort | 0.98 |
| L-08 | Account deletion (LC-16) | De-identify identified answers; nothing traceable remains | 0.08 (coin flip; founder should confirm) |
| L-09 | Deleted Hub slug cooldown (LC-27) | 0 days, configurable policy `hub.deleted_slug_cooldown_days` | 1.00 |
| L-10 | Free text at launch (LC-41) | Allowed; shown only as an unlinked list once min cohort is reached, with a creator warning | 0.30 |
| L-11 | Guests (LC-11) | Allowed on link surveys with the 10/min cap; results labelled with the guest count; never counted as members | 0.50 |
| L-12 | Waitlist contact email (LC-18) | Optional; launch and account updates only; deleted with the account | 0.56 |
| L-13 | Retention (LC-17) | Campaign data while account/Hub exists; logs 12 months; guest rate-limit hashes 7 days | 0.74 |
| L-14 | Abuse policy for free surveys (LC-26) | None beyond the support contact for now | 0.30 (low; founder should confirm) |

### Founder final decisions (2026-11-07, supersede L-08, L-09, L-12, L-14)

| ID | Decision |
| --- | --- |
| F-01 | Strict anonymous suppression as L-07. Free text only at 5+ responses, no timestamps, random order. |
| F-02 | Guests on link surveys; 10 per minute is configuration, not product law; guest responses labelled. |
| F-03 | The waitlist is a launch tool, never authorization. All "whitelist" wording is now "waitlist". |
| F-04 | Retention: survey data while its account or Hub exists; operational and security logs 12 months. |
| F-05 | Account deletion removes profile, identity links, memberships, invites, settings and the waitlist entry; structured answers remain only after irreversible unlinking; that account's free-text answers are deleted; aggregates remain. |
| F-06 | A deleted Hub's slug is quarantined for 30 days (tombstone, neutral "no longer available"), separate from the 25-day reservation grace. |
| F-07 | Free-survey abuse brakes: 5 active per account, rate limits, report-abuse action, operator block, support contact; Quick Surveys never in Discover. |
| F-08 | Hub subscriptions cancel anytime, access to the end of the paid period, no automatic proration. Campaign plans: full refund before the window activates; after activation only for duplicate charges, technical failure or where legally required. |
| F-09 | Taxes by Stripe Tax; shown separately; no tax engine of our own. |
| F-10 | Campaign Plus: $39 first 2 weeks + $19 per additional week, Team family. |
| F-11 | **Updated 2026-11-11 (founder): LunchVoice is for anyone 13 and older, and works for schools, including high schools** (homecoming, class and student-government elections, school-wide feedback). Replaces the earlier "no marketing to minors" rule. Build school use so students can take part without accounts or personal data (ballot codes, anonymous by default). Counsel review of COPPA (under 13), FERPA and state student-privacy law is still recommended before signing school agreements; the Terms and Privacy pages state the 13+ rule. |
| F-12 | Public name "LunchVoice by KpnSolute"; legal documents name the actual legal operator (placeholder until supplied; never pretend an entity exists). |
| F-13 | **Conditional production approval:** apply the migrations and deploy once LC-01, LC-02, LC-03, LC-05, LC-06, LC-08 and the security headers are fixed, BLOCKER and HIGH findings are zero on the compliance re-run, the canonical DB suite and the frontend build pass, and the real auth smoke test passes. No further approval loop. |

| F-14 | KpnWorld, LunchVoice's own Hub, is listed on Discover by founder override (2026-11-08) of the Team + 700 genuine members rule: made public, granted Team (source `grant`, no end date), approved Discover entry with its real genuine-member count; recorded in `lv.discover_decisions` and the audit log (`discover.founder_override`). The rule still applies to every other Hub. |

Launch gate: no production launch while any BLOCKER or HIGH finding is open. MEDIUM findings are triaged into
"before public beta" and "after public beta".

Governing-agent decisions (architecture, not product):

- **A-01 Personal space.** Quick Surveys live in a per-account *personal space*: a `lv.hubs` row with
  `kind = 'personal'`, no slug, never routable, never listed as a Hub, created lazily on the first Quick Survey. This
  reuses every existing Campaign, participation, guest and analytics path instead of making `hub_id` nullable.
  Community Hubs are `kind = 'community'` (all existing rows).
- **A-02 One entitlement map.** `lv.plan_limits(family, key, value)` is the only place limits live. The backend
  evaluates the active entitlement; the UI only displays what the API returns.
- **A-03 Provider-agnostic billing.** Stripe is wired later by the founder. The backend ships an idempotent event log,
  a service-role-only grant path, and a `billing-webhook` Edge Function that verifies Stripe signatures and fails
  closed (503) while `STRIPE_WEBHOOK_SECRET` is unset. `lv_checkout_start` returns `lv_billing_unavailable` until the
  `billing.provider_ready` policy is true. Campaign Plus is priced and behaves like every other product.
- **A-04 Team values not given by the founder** are provisional and visible as such in `lv.plan_limits.note`:
  Team custom pages 10, Team overall active Campaigns 15 (never below Starter).
- **A-05 Hub delete** is Owner-only with typed confirmation (the slug). It deletes the Hub's data, which is the
  Owner's explicit choice; nothing deletes data automatically for unpaid or over-limit states.

## Definition of done (launch)

Status checked against the code, CI and `CHANGELOG.md` on 2026-11-12. Evidence for every line is in
`V2_STATUS_2026-11-12.md`. `[x]` = proven in the repository; `[~]` = done in code, waiting on a founder action.

Backend
- [x] Entitlements: `lv.entitlements`, `lv.plan_limits`, Hub credits; `lv_hub_create` gated by a Hub credit, not beta.
- [x] Every limit (custom roles, custom pages, active Campaigns, active surveys + threshold gate, Quick Survey limits,
      question kinds) enforced server-side from the map; expired access fails closed for premium actions only.
- [x] Quick Surveys: create, edit, schedule, activate, close, list; link and invite-only access; analytics.
- [x] Waitlist: join (atomic first-50 admission), status, Founding grant; `billing.launched_at` ends it +30 days.
- [x] Account: profile update, account delete. Hub: update/branding, owner transfer, delete, pages (Builder).
- [x] Billing-ready: checkout intent (fail closed), summary, idempotent event log, grant path, webhook function.
- [x] Hub Name Reservation ACTIVE → GRACE (25 days) → RELEASED, status read, slug protection.
- [x] Analytics export of released aggregates only; Discover application gate (Team, 700 genuine members).
- [x] Reserved slugs in `lv.reserved_slugs` cover every top-level UI route.
- [x] Policies set: min cohort 5, guest rate 10. No NULL policy blocks a launch path.
- [x] `scripts/db-test-canonical.sh` passes from empty, with rollbacks rehearsed; `API_CONTRACT.md` matches.

UI
- [x] One UI system: shadcn components restyled (design system 3 since 2026-11-12, `DESIGN.md`), used by every page.
- [x] Every route in the founder's journey works against `lvApi` (mock in dev, real in prod): landing, waitlist,
      sign-in, `/me` dashboard, Quick Surveys, create Hub, Hub workspace, Studio, player, results, settings, billing,
      reservation, Discover, account settings.
- [x] Pricing page shows the founder's capability table from `src/config/pricing.ts`; checkout follows billing state.
- [x] Light, dark, high contrast; 390 / 768 / 1280 with no horizontal scroll; keyboard and screen-reader basics.
- [x] `npm run test:pr` green; route registry covers every route.

Compliance
- [x] Review of privacy, security, identity, data retention and customer-name rules, with no open blocking finding
      (`docs/compliance/LAUNCH_COMPLIANCE_REVIEW.md` section 8.6: 0 BLOCKER, 0 HIGH).
- [x] Legal pages carry visible "Legal text pending review" placeholders; the waitlist form has a privacy notice.

Release
- [x] Work reaches `main` through PRs (the single integration branch named here originally was retired).
- [~] Production migrations applied only with the founder's explicit approval, per `PRODUCTION_RESET_RUNBOOK.md`.
      Several built migrations are recorded as not yet applied; see the status file.
- [~] Live check: sign in, join waitlist, create a Hub, run a Campaign and a Quick Survey, answer as a guest, read
      results. Needs the founder's real sign-in.

## Roadmap

| # | Work | Owner | Depends on |
| --- | --- | --- | --- |
| 1 | This plan, decisions, contract | governing | – |
| 2 | Migration 000014 entitlements + waitlist + personal space + Quick Surveys + policies + reserved slugs | backend | 1 |
| 3 | Migration 000015 account/Hub management, pages, owner transfer, delete | backend | 2 |
| 4 | Migration 000016 billing-ready, reservation, export, Discover; `billing-webhook` function | backend | 2 |
| 5 | shadcn component layer restyled to the design; gallery | UI | 1 |
| 6 | Pages on the new layer; new routes; mock transport for every new operation | UI | 1, 5 |
| 7 | Compliance review of plan and code; re-review of the integrated branch | compliance | 2–6 |
| 8 | Integration, full checks, changelog, PR | governing | 2–7 |
| 9 | Production apply and live check | governing, with founder approval | 8 |

## API contract (new and changed operations)

All are `lv_api.*` RPCs returning `{ ok:true, ... }` or `{ ok:false, error:{ code, message, ... } }`. New error codes:
`lv_entitlement_required` (no active entitlement for a premium action; adds `product` hint),
`lv_billing_unavailable` (billing not live yet), `lv_hub_gone` (quarantined deleted-Hub slug), `lv_not_available` (operation
intentionally off), `lv_confirmation_mismatch` (typed confirmation wrong). Existing codes keep their meaning
(`lv_limit_reached` adds `limit` and `used`).

### Context and entitlements
- `lv_my_context()` adds: `entitlements: [Entitlement]`, `hub_credits: int`, `quick_surveys: { active, limit,
  question_limit }`, `waitlist: { status: "none"|"admitted"|"waitlisted", position? }`, and each Hub in `hubs`
  gains `kind` (only `community` Hubs are listed) and `plan: { family, product, ends_at, state }`.
- `Entitlement = { id, product, family: "free"|"starter"|"team", scope: "account"|"hub", hub_id?, starts_at,
  ends_at?, state: "active"|"expired"|"scheduled", source: "waitlist"|"billing"|"grant" }`.
- `lv_plan_limits()` → `{ ok, families: { free|starter|team: { [key]: number|null } }, products: [{ product,
  family, price_cents?, interval, purchasable }] }`. Works signed out (pricing page).

### Waitlist
- `lv_waitlist_status()` → `{ ok, seats_total, seats_taken, open: bool, me?: { status, position?, joined_at } }`.
  Works signed out (`me` omitted).
- `lv_waitlist_join(p_contact_email text default null, p_note text default null)` → `{ ok, status:
  "admitted"|"waitlisted", position, granted?: Entitlement }`. Requires sign-in. Idempotent: a second call returns the
  existing row. Admission and the 50-seat count are race-safe.

### Quick Surveys (personal space)
- `lv_quick_survey_create(p_title, p_access "link"|"invite", p_anonymity "anonymous"|"identified",
  p_guests bool default true)` → `{ ok, campaign }` (draft, mode `survey`). Guests are allowed only with `link`.
- `lv_quick_survey_list()` → `{ ok, surveys: [CampaignSummary], active, limit }`.
- Editing, scheduling, activating, pausing, closing, archiving, questions, results and analytics reuse the existing
  `lv_campaign_*` and `lv_analytics_*` operations with the survey's campaign id. Activation enforces the free limits
  (`lv_limit_reached` with `limit`, `used`) and core kinds only.
- `lv_campaign_invite_create(p_campaign, p_max_uses int default null, p_expires_at timestamptz default null)` →
  `{ ok, invite: { token, max_uses, uses, expires_at } }`; `lv_campaign_invite_list(p_campaign)`,
  `lv_campaign_invite_revoke(p_token)`, `lv_campaign_invite_redeem(p_token)` → `{ ok, campaign_id, join_code }`
  (sign-in required; grants eligibility for that one Campaign only).

### Hubs and accounts
- `lv_hub_create(...)` unchanged signature; now consumes one Hub credit (or fails `lv_entitlement_required`) and
  attaches a Hub entitlement of the credit's family. `lv_beta_required` is no longer returned.
- `lv_hub_update(p_hub, p_display_name?, p_visibility?, p_membership_mode?, p_about?, p_accent?)` → `{ ok, hub }`.
  `p_accent` is one of a fixed contrast-safe palette list returned by `lv_hub_get`.
- `lv_owner_transfer(p_hub, p_membership, p_confirm text)` → `{ ok }`; `p_confirm` must equal the Hub slug.
- `lv_hub_delete(p_hub, p_confirm text)` → `{ ok }`; Owner only; `p_confirm` must equal the slug.
- `lv_hub_pages_get(p_hub)` → `{ ok, pages: [Page], custom_slots: { used, limit } }`; readable by anyone who can
  read the Hub (only enabled pages for non-managers).
- `lv_hub_pages_update(p_hub, p_pages jsonb)` → `{ ok, pages }`; `Page = { key, kind:
  "home"|"campaigns"|"custom"|"shop"|"leaderboard"|"news"|"comments", title, body?, position, enabled }`. Custom pages
  count against the plan limit; add-on kinds may be enabled but show "Coming with M2" in the UI.
- `lv_profile_update(p_display_name)` → `{ ok, account }`.
- `lv_account_delete(p_confirm text)` → `{ ok }`; `p_confirm` must be `DELETE`; refuses with `lv_owner_protected`
  while the account owns a community Hub.

### Billing-ready
- `lv_checkout_start(p_product, p_hub uuid default null, p_weeks int default null)` → today always
  `lv_billing_unavailable` (or `lv_price_unset` for `campaign_plus`). When the founder wires Stripe it returns
  `{ ok, checkout_url }`.
- `lv_billing_summary(p_hub)` → `{ ok, plan: { family, product, state, starts_at, ends_at }, limits, usage:
  { custom_roles, custom_pages, active_campaigns, active_surveys }, reservation? }`. Owner or `billing.view`.
- Service-role only (not in `lv_api`): `lv.billing_apply_event(p_provider, p_event_id, p_type, p_payload)` — idempotent
  on `(provider, event_id)`; grants or extends entitlements and reservations.

### Hub Name Reservation
- `lv_hub_reservation_status(p_slug)` → `{ ok, slug, state: "available"|"active"|"grace"|"released"|"taken",
  expires_at?, grace_ends_at?, mine: bool }`. A reserved slug (ACTIVE or GRACE) cannot be claimed by anyone but the
  holder; RELEASED never exposes prior data.

### Analytics and Discover
- `lv_analytics_export(p_campaign)` → `{ ok, rows: [...] }` of released aggregates only, same suppression as
  `lv_analytics_query`; needs `analytics.export` and a non-free family.
- `lv_discover_apply(p_hub)` → `{ ok, status: "submitted" }` or `lv_gate_blocked` with `reasons` (Team family,
  700 genuine active members).

## Agent rules for this launch

- Backend owns `supabase/`, `docs/backend/`, `scripts/db-test-canonical.sh`. UI owns `src/`, `public/`,
  `docs/frontend/`, `scripts/check-route-layouts*`. Compliance writes only `docs/compliance/`.
- Agents do not edit `CHANGELOG.md`, `AGENTS.md` or `CLAUDE.md`, do not push, and never touch production. The
  governing agent integrates, writes the changelog and pushes.
- No LionCafe/MJCC anywhere. No invented prices. No secrets.
