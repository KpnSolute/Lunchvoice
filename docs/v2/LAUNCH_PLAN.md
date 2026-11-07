# LunchVoice v2 launch plan (2026-11-07)

Owner: the governing agent. Binding for the backend, UI and compliance agents until launch.
Order of authority: this file's **Founder direction** section, then the canonical master spec
(`LunchVoice_v2_CANONICAL_MASTER_SPEC_2026-10-25.md`), then everything else. Where they differ, this file wins,
because it records the founder's direction of 2026-11-07, which is newer than the spec.

Goal: a live, whitelist-only LunchVoice SaaS that the founder can sign in to, use end to end, and then connect Stripe
to without further backend or UI work. Nothing in this plan charges money.

## Founder direction (2026-11-07)

1. **Three connected experiences:** Quick Survey (free), Campaign (time-bounded paid), Hub (ongoing paid). A person
   never has to create a Hub to ask a question, and a Hub owner can still make Quick Surveys.
2. **Quick Surveys (free):** any signed-in user, up to **5 active**, up to **10 questions**, core question kinds
   (rating, single choice, multi choice, yes/no, text). Access is **anyone with the link** (link, QR, 6-character join
   code, never listed publicly) or **invite only** (only people the creator invited; sign-in required). Anonymous or
   identified. Simple start/end scheduling, basic totals and charts, history, LunchVoice branding. No members, roles,
   pages, segmentation or exports.
3. **Whitelist launch:** `lunchvoice.com/whitelist` (and a section on the landing page). Joining requires sign-in.
   The **first 50** people are admitted automatically; later joiners are waitlisted. An admitted person gets a free
   **Founding** entitlement: one Hub credit in the **Starter** family, free **until paid billing launches, then 30
   more days**, after which premium actions lock (data is kept). There is no permanent creator whitelist: once billing
   is live, anyone can buy an entitlement.
4. **Capability table:** the founder's table (Free / Campaign Starter / Campaign Plus / Starter Hub / Team Hub) is the
   product truth for limits. Unknown values stay unknown: Campaign Plus price, Team overall active-Campaign limit.

## Decisions taken for the founder (Jev, 2026-11-07, recorded)

| ID | Decision | Value | Jev confidence |
| --- | --- | --- | --- |
| L-01 | Whitelist grant | Starter family, free until billing launches + 30 days | 0.87 |
| L-02 | Whitelist admission | First 50 signed-in joiners auto-admitted, rest waitlisted | 0.50 |
| L-03 | Whitelist requires sign-in | Yes; seat bound to (issuer, subject); optional contact email stored separately | 0.78 |
| L-04 | Analytics minimum cohort | 5 (`campaign.min_cohort`) | 0.43 |
| L-05 | Guest submissions per Campaign per minute | 10 (`participation.guest_rate_per_minute`) | 0.26 |
| L-06 | Quick Survey question limit | 10 | 0.28 |

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
  `billing.provider_ready` policy is true. Campaign Plus checkout always returns `lv_price_unset`.
- **A-04 Team values not given by the founder** are provisional and visible as such in `lv.plan_limits.note`:
  Team custom pages 10, Team overall active Campaigns 15 (never below Starter). Campaign Plus price stays NULL.
- **A-05 Hub delete** is Owner-only with typed confirmation (the slug). It deletes the Hub's data, which is the
  Owner's explicit choice; nothing deletes data automatically for unpaid or over-limit states.

## Definition of done (launch)

Backend
- [ ] Entitlements: `lv.entitlements`, `lv.plan_limits`, Hub credits; `lv_hub_create` gated by a Hub credit, not beta.
- [ ] Every limit (custom roles, custom pages, active Campaigns, active surveys + threshold gate, Quick Survey limits,
      question kinds) enforced server-side from the map; expired access fails closed for premium actions only.
- [ ] Quick Surveys: create, edit, schedule, activate, close, list; link and invite-only access; analytics.
- [ ] Whitelist: join (atomic first-50 admission), status, Founding grant; `billing.launched_at` ends it +30 days.
- [ ] Account: profile update, account delete. Hub: update/branding, owner transfer, delete, pages (Builder).
- [ ] Billing-ready: checkout intent (fail closed), summary, idempotent event log, grant path, webhook function.
- [ ] Hub Name Reservation ACTIVE → GRACE (25 days) → RELEASED, status read, slug protection.
- [ ] Analytics export of released aggregates only; Discover application gate (Team, 700 genuine members).
- [ ] Reserved slugs in `lv.reserved_slugs` cover every top-level UI route.
- [ ] Policies set: min cohort 5, guest rate 10. No NULL policy blocks a launch path.
- [ ] `scripts/db-test-canonical.sh` passes from empty, with rollbacks rehearsed; `API_CONTRACT.md` matches.

UI
- [ ] One UI system: shadcn components restyled to the tactile design (`src/components/shadcn/`), used by every page.
- [ ] Every route in the founder's journey works against `lvApi` (mock in dev, real in prod): landing, whitelist,
      sign-in, `/me` dashboard, Quick Surveys, create Hub, Hub workspace, Studio, player, results, settings, billing,
      reservation, Discover, account settings.
- [ ] Pricing page shows the founder's capability table from `src/config/pricing.ts`; checkout disabled with reason.
- [ ] Light, dark, high contrast; 390 / 768 / 1280 with no horizontal scroll; keyboard and screen-reader basics.
- [ ] `npm run test:pr` green; route registry covers every route.

Compliance
- [ ] Review of privacy (anonymity, guests, exports, withheld never zero), security (RLS, grants, definer functions,
      secrets), identity, data retention and customer-name rules, with no open blocking finding.
- [ ] Legal pages carry visible "Legal text pending review" placeholders; the whitelist form has a privacy notice.

Release
- [ ] All of the above on `claude/wizardly-meitner-wohkzr`; PR to `main`.
- [ ] Production migrations applied only with the founder's explicit approval, per `PRODUCTION_RESET_RUNBOOK.md`.
- [ ] Live check: sign in, join whitelist, create a Hub, run a Campaign and a Quick Survey, answer as a guest, read
      results.

## Roadmap

| # | Work | Owner | Depends on |
| --- | --- | --- | --- |
| 1 | This plan, decisions, contract | governing | – |
| 2 | Migration 000014 entitlements + whitelist + personal space + Quick Surveys + policies + reserved slugs | backend | 1 |
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
`lv_billing_unavailable` (billing not live yet), `lv_price_unset` (Campaign Plus), `lv_not_available` (operation
intentionally off), `lv_confirmation_mismatch` (typed confirmation wrong). Existing codes keep their meaning
(`lv_limit_reached` adds `limit` and `used`).

### Context and entitlements
- `lv_my_context()` adds: `entitlements: [Entitlement]`, `hub_credits: int`, `quick_surveys: { active, limit,
  question_limit }`, `whitelist: { status: "none"|"admitted"|"waitlisted", position? }`, and each Hub in `hubs`
  gains `kind` (only `community` Hubs are listed) and `plan: { family, product, ends_at, state }`.
- `Entitlement = { id, product, family: "free"|"starter"|"team", scope: "account"|"hub", hub_id?, starts_at,
  ends_at?, state: "active"|"expired"|"scheduled", source: "whitelist"|"billing"|"grant" }`.
- `lv_plan_limits()` → `{ ok, families: { free|starter|team: { [key]: number|null } }, products: [{ product,
  family, price_cents?, interval, purchasable }] }`. Works signed out (pricing page).

### Whitelist
- `lv_whitelist_status()` → `{ ok, seats_total, seats_taken, open: bool, me?: { status, position?, joined_at } }`.
  Works signed out (`me` omitted).
- `lv_whitelist_join(p_contact_email text default null, p_note text default null)` → `{ ok, status:
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
