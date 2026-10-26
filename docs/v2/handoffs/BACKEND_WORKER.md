# LunchVoice v2 backend worker handoff

Canonical source: [LunchVoice_v2_CANONICAL_MASTER_SPEC_2026-10-25.md](../LunchVoice_v2_CANONICAL_MASTER_SPEC_2026-10-25.md). Dated 2026-10-25. The UI counterpart is [UI_WORKER.md](UI_WORKER.md).


You own the LunchVoice v2 backend.

Scope:

- v2 schema/migrations;
- RLS;
- KpnIdentity account/session mapping;
- Hub lifecycle;
- memberships/invites;
- RBAC;
- Campaign lifecycle;
- participation/privacy;
- analytics;
- billing/entitlements;
- Hub Name Reservation;
- discovery/moderation;
- audit/integrity.

Before changing code, read the new canonical master spec in full.

## Founder reset

### V1 data is gone from the product

V2 starts fresh.

Do not preserve, import, backfill, map, alias, or depend on v1 data.

Do not create:

- legacy-user mapping tables;
- MJCC staff mappings;
- v1 survey migration jobs;
- v1 response backfills;
- v1 reward migrations;
- v1 org → Hub backfills;
- legacy LionCafe owner/membership records.

Remove/retire any v2 branch work whose only purpose is a legacy bridge.

The old proposed v1 staff-permission production fix is not part of v2.

Do not spend the v2 critical path fixing removed v1 features.

### Do not create LionCafe

LunchVoice backend provides generic SaaS operations.

Do not seed:

- LionCafe Hub;
- Miami Job Corps Hub;
- LionCafe slug reservation;
- LionCafe Owner;
- MJCC Campaign;
- MJCC roles;
- MJCC questions.

The real food service manager will later use the generic product.

Expected real-world flow:

Google/KpnIdentity → LunchVoice account → entitlement → `lv_hub_create` → claim `lioncafe` if available → protected Owner → configure Hub → create December Campaign.

That must work with zero customer-specific backend code.

## Fresh-v2 database model

Treat v2 as a clean SaaS schema.

Core domains:

- app identities/accounts;
- Hubs;
- slugs;
- Hub Name Reservations;
- memberships;
- roles;
- role permissions;
- member-role assignments;
- Hub pages;
- Campaigns;
- Campaign versions;
- questions/options;
- schedule/session;
- eligibility;
- participation receipts;
- responses/answers;
- analytics aggregates;
- subscriptions;
- entitlement grants;
- Campaign duration purchases;
- billing events;
- moderation/discovery;
- audit events;
- optional Hub-local currency/rewards.

No legacy bridge should be part of the canonical v2 migration chain.

## Current backend work

The local `feat/v2-read-api` work is still useful because it serves the new SaaS API.

Reported additions:

- `lv_hub_get`
- `lv_campaign_list`
- `lv_campaign_get`
- `lv_member_list`
- `lv_invite_list`
- `lv_invite_preview`
- `lv_beta_status`
- expanded `lv_my_context`
- reserved slug enforcement
- double-hyphen rejection
- private Hub not-found behavior
- respondent-safe Campaign view
- member list without email

Reported verification:

- 202 checks
- 0 failures
- rollback rehearsal passes

Reconcile this with the canonical fresh-v2 baseline.

Do not keep a migration merely because it exists if it encodes v1 preservation.

## Immediate next action: normalize API errors

Expected application failures must return one stable contract:

`{ ok: false, error: { code, message, ...optional metadata } }`

Normalize old write functions that still raise expected `lv_*` failures as Postgres exception strings.

Keep truly unexpected server failures exceptional.

Update:

- tests;
- `docs/backend/API_CONTRACT.md`;
- frontend-consumed types/examples.

## Identity

Target:

`auth.kpnsolute.com`

Federation:

Google first.

Use stable identity subject linkage.

Do not use raw email as the durable account identity.

LunchVoice authorization remains local to LunchVoice.

## Hub creation

`lv_hub_create` must be generic and atomic.

Enforce:

- authentication;
- entitlement;
- normalized slug;
- reserved-system-slug rejection;
- uniqueness;
- concurrency safety;
- Hub creation;
- protected Owner binding;
- audit event.

No customer-specific branch.

Test two users racing for the same slug.

`lioncafe` must be claimable like any other non-reserved available slug.

## Role model

Confirmed:

- Owner protected outside custom-role count;
- Starter/Campaign Starter: 3 custom roles;
- Team/Campaign Plus: 6 custom roles;
- custom names/icons;
- discrete capabilities;
- grouped toggles;
- additive multiple-role grants;
- no privilege escalation;
- owner-only delete;
- secure ownership transfer.

Validate existing capability work against this.

## Campaign model

Campaign is the umbrella object.

Survey is one mode.

Build generic lifecycle and contracts for:

- create;
- read/list;
- edit;
- version;
- questions/options;
- schedule;
- activate;
- pause/close/archive;
- audience/eligibility;
- anonymous;
- authenticated;
- guest;
- submit;
- idempotent participation receipt;
- results.

Do not hardcode dining.

## Pricing and entitlement model

One authoritative entitlement map.

Feature-family mapping:

- Starter Hub ↔ Campaign Starter
- Team Hub ↔ Campaign Plus

The feature family is the same.

The billing/time model differs.

### Starter Hub

$13/month.

Entitlements include:

- 3 custom roles;
- 3 custom Hub pages;
- 15 active total Campaigns;
- 2 active Survey-mode Campaigns;
- >50% unique-eligible-member survey replacement threshold.

### Team Hub

$29/month.

Entitlements include:

- 6 custom roles;
- expanded community pages;
- enhanced Campaign modes;
- advanced role-targeting;
- advanced analytics;
- 5 active Survey-mode Campaigns;
- >=20% unique-eligible-member survey replacement threshold;
- Discover application eligibility at 700 genuine active members.

### Campaign Starter

Duration-based Starter equivalent.

- $19 first 2 weeks;
- $13 per additional week.

The customer chooses/schedules the active paid window.

### Campaign Plus

Duration-based Team equivalent.

The feature model is final.

It inherits Team capabilities during the paid scheduled window.

Do not create a second entitlement family for Plus.

If the authoritative repository/config still lacks the exact Plus numeric price, keep checkout disabled/fail-closed for that amount rather than inventing a number.

### Hub Name Reservation

Canonical product: `Hub Name Reservation`.

- $25 for 12 months;
- $25 renewal;
- 25 calendar days grace after expiration;
- release after grace if unpaid;
- reservation alone does not grant product feature entitlement.

Hub ID must remain independent of slug.

A released slug must not expose a prior owner's Hub/data.

## Campaign duration semantics

Campaign plans are pay-for-time.

Backend must support:

- scheduled future start;
- paid active end timestamp;
- extension by additional weeks;
- entitlement active only inside paid window;
- idempotent extension;
- server-authoritative time;
- no destructive deletion when access ends;
- fail-closed premium actions after expiry.

Do not implement seasonal Campaigns as a fake monthly subscription.

## Participation thresholds

Starter/Campaign Starter:

- 2 active surveys;
- >50% threshold.

Team/Campaign Plus:

- 5 active surveys;
- >=20% threshold.

Count unique eligible Hub members.

Do not let:

- guests;
- duplicate submissions;
- bots;
- repeated events

inflate the percentage.

## Privacy

Authenticated anonymous and guest are distinct.

Anonymous:

- account may prove eligibility;
- answers must not expose creator-resolvable identity.

Guest:

- no account required where enabled;
- no Hub membership;
- no member-count inflation;
- no automatic member perks;
- no access to private Hub pages.

Analytics must preserve suppression/withholding semantics.

Suppressed does not mean zero.

## Backend implementation order

1. Audit canonical migration chain and remove legacy-bridge assumptions.
2. Normalize `lv_api` errors.
3. Reconcile/push read API into canonical v2 stack.
4. Complete KpnIdentity/Google exchange.
5. Complete account/session APIs.
6. Complete Hub CRUD/ownership.
7. Complete memberships/invites/roles.
8. Complete Campaign version/question/lifecycle APIs.
9. Complete scheduling and Campaign-duration entitlements.
10. Complete anonymous/authenticated/guest submission.
11. Complete analytics.
12. Complete recurring Hub subscription entitlements.
13. Complete Hub Name Reservation.
14. Complete remaining Builder/community/discovery/rewards APIs.

## Tests

Use generic synthetic Hubs.

Required adversarial coverage:

- unauthenticated access;
- cross-Hub reads;
- cross-Hub writes;
- privilege escalation;
- Owner protection;
- concurrent slug claims;
- reserved routes;
- duplicate submissions;
- invalid Campaign lifecycle;
- expired duration entitlement;
- duplicate billing webhook;
- anonymous privacy;
- guest isolation;
- analytics suppression;
- reservation expiry/grace/release;
- released slug ownership isolation.

Do not seed LionCafe as a baseline fixture.

If `lioncafe` is used in an isolated test, it must be created through the same public Hub-create operation as any other test Hub.

## Docs/governance

Update v2 docs so they no longer say:

- preserve v1;
- migrate historical MJCC data;
- keep old staff access;
- backfill LionCafe;
- create a legacy bridge.

`AGENTS.md` and `CLAUDE.md` must remain byte-identical.

The canonical docs should describe LunchVoice as a fresh SaaS.

## Git/release

Work in dedicated branches/worktrees.

Commit reviewable slices.

Do not deploy/reset/mutate production from this task unless a separate release instruction explicitly authorizes it.

Report:

- migration chain;
- removed legacy assumptions;
- API contract;
- tests;
- rollback status;
- entitlement implementation;
- identity status;
- blockers;
- next slice.

## Hard acceptance test

A completely new Google-authenticated user must be able to buy/activate creator entitlement, create an arbitrary Hub, become Owner, configure it, create/schedule/publish a Campaign, accept responses, and read authorized analytics.

Later, the Miami Job Corps manager will use that same path to create LionCafe.

There must be no code path saying "if MJCC" or "if LionCafe".
