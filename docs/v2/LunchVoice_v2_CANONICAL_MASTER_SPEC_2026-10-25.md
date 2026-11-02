# LunchVoice v2 — Canonical Master Product, Pricing, Architecture & Delivery Specification

**Document version:** 2.0 — founder-corrected canonical reset  
**Date:** 2026-10-25  
**Product:** LunchVoice, a KpnSolute SaaS product  
**Launch objective:** public v2 platform capable of supporting the Miami Job Corps / LionCafe December 2026 Campaign through normal customer onboarding  
**Source of truth:** founder decisions in the current LunchVoice planning conversations  
**Supersedes:** prior specifications that preserve, migrate, backfill, wrap, or depend on LunchVoice v1

> **FOUNDER RESET — NON-NEGOTIABLE:** LunchVoice v1, its users, historical survey data, cafeteria UI, tenant model, staff SSO, rewards/store history, and old product assumptions are not part of v2. V2 starts fresh. Do not preserve, migrate, backfill, alias, or depend on v1 application data.

> **SAAS BOUNDARY — NON-NEGOTIABLE:** LunchVoice builds the platform, not customer Hubs. Do not pre-create, seed, hardcode, backfill, or special-case LionCafe or Miami Job Corps. The food service manager will later sign in through Google/KpnSolute Identity, create the LionCafe Hub through the same public creator onboarding used by every customer, configure that Hub, and create the December Campaign himself.

---

## 1. Product definition

LunchVoice is a multi-tenant SaaS platform for interactive community feedback.

The product provides reusable platform capabilities:

- global accounts and authentication;
- Hub creation and ownership;
- memberships and invitations;
- custom roles and permissions;
- Hub branding and configurable pages;
- Campaign creation and lifecycle;
- surveys, polls, ratings, ideas/feedback, elections, and other Campaign modes;
- anonymous, authenticated, and configurable guest participation;
- scheduling and time-bounded Campaign access;
- results and privacy-safe analytics;
- plan entitlements;
- Hub Name Reservation;
- community/discovery capabilities;
- optional Hub-local rewards/currency features where enabled.

LunchVoice is not a cafeteria application. Dining is one possible customer use case.

Miami Job Corps / LionCafe is the first intended real-world v2 customer test, not a product template and not a prebuilt tenant.

### Core product loop

Creator signs in → chooses a paid creation model → creates a Hub → configures branding/membership/roles → creates a Campaign → schedules/publishes it → participants respond → creator sees authorized analytics → Hub continues according to plan and entitlement state.

### Participant loop

Participant visits a Hub or Campaign → signs in only when required → joins or participates according to policy → submits response → sees any authorized results or community content.

---

## 2. V1 disposition

V1 is retired.

### V1 data policy

V2 has no obligation to preserve:

- v1 users;
- v1 student profiles;
- v1 staff profiles;
- v1 survey responses;
- v1 sessions;
- v1 menus;
- v1 reward balances;
- v1 store/orders;
- v1 tenant/org rows;
- v1 authentication mappings;
- v1 historical analytics.

V2 must not contain compatibility code whose purpose is to reconstruct or expose v1.

If old schema or code remnants still exist in a branch, database, migration history, fixture, or local checkout, they are legacy cleanup targets, not migration sources for v2.

### V1 UI policy

Do not ship:

- old student screens;
- old cafeteria admin screens;
- Content Central;
- old menu/store/order/roster experiences;
- old `/LionCafe` redirects;
- old subdomain tenant compatibility;
- `Gate`;
- old `AuthProvider`;
- MJCC-specific staff SSO;
- direct v1 table access.

Git history is sufficient archival history for source code.

---

## 3. SaaS/customer boundary

LunchVoice owns platform primitives.

Customers own the content and configuration they create using those primitives.

### LunchVoice builds

- account system;
- Hub creation workflow;
- Hub slug system;
- ownership;
- subscriptions and Campaign passes;
- Hub Name Reservation;
- roles/capabilities;
- member management;
- invitation system;
- Campaign Studio;
- Campaign versions/questions/options;
- schedules;
- participation policy;
- respondent experience;
- analytics;
- branding controls;
- page builder;
- moderation;
- discovery;
- billing/entitlements;
- audit/security infrastructure.

### LunchVoice does not build

- LionCafe as a hardcoded Hub;
- MJCC-specific owner records;
- MJCC-specific roles;
- MJCC-specific Campaign questions;
- MJCC-specific pages;
- MJCC-specific branding;
- a December survey preloaded into product code.

Those are customer-created data.

### December MJCC acceptance scenario

The platform is successful when a real manager can:

1. open LunchVoice;
2. sign in with Google through KpnSolute Identity;
3. purchase or activate the appropriate LunchVoice creation entitlement;
4. create a Hub named LionCafe if the slug is available;
5. become protected Owner automatically through the Hub-creation transaction;
6. configure the Hub;
7. create a December Miami Job Corps Campaign;
8. set its schedule and participation mode;
9. publish/share it;
10. collect responses;
11. view privacy-safe results.

No code change should be required to create LionCafe.

---

## 4. Identity and accounts

`auth.kpnsolute.com` is the KpnSolute-wide identity service.

Initial federation: Google.

Target flow:

`LunchVoice → auth.kpnsolute.com → Google → KpnIdentity callback → LunchVoice account/session`

Identity and LunchVoice authorization are separate.

KpnIdentity owns:

- authentication;
- stable identity subject;
- Google federation;
- session/authentication assertions.

LunchVoice owns:

- app account;
- Hub ownership;
- memberships;
- roles;
- permissions;
- entitlements;
- Campaign eligibility;
- participation receipts.

Never use raw email alone as the durable user identity.

Recommended linkage is stable issuer + subject.

No MJCC staff SSO is part of v2.

---

### 4.1 Amendment, 2026-10-27 (founder): open sign-up for Hub users

Hub users sign up with their own email address. A person does **not** need to belong to any KpnSolute
team, staff group or organization, and nobody has to be inside a "KpnIdentity network" first: KpnIdentity
sign-up is open to the public.

- KpnIdentity offers Google and the person's own email address as sign-in methods. KpnIdentity verifies the
  email and asserts `email_verified`. LunchVoice never runs its own email or password authentication and
  still consumes only verified KpnIdentity tokens, keyed by `(issuer, subject)`, never by email.
- Hub membership, roles and plan (including Team Hub and Campaign Plus) are LunchVoice concepts. They are
  independent of any KpnSolute team or staff membership. Paying for or owning a Team Hub does not require the
  owner, and joining one does not require a member, to be KpnSolute staff.
- A Hub may let people join with their own email through its normal join mode (open, approval, invite-only);
  the invitation and membership rules in sections 5 and 6 are unchanged. A person with an unverified email may
  browse and join by invitation, but flows that promise mail to that address stay refused until it is verified
  (see `IDENTITY_CONTRACT.md` section 5).
- **Open item.** KpnIdentity must support email sign-up. `KPNIDENTITY_SCHEMA_V1.md` does not yet describe it,
  so it is a KpnIdentity work item and a dependency of the first real customer sign-in. If the intent is
  instead that LunchVoice runs its own email sign-up outside KpnIdentity, that reverses decision S-1 in
  `docs/backend/D01_IDENTITY_SUPERSESSION_2026-10-25.md` and needs an explicit founder decision.

## 5. Hubs

A Hub is the core customer/community space.

Canonical public route:

`https://lunchvoice.com/{hubSlug}`

### Hub creation

A Hub is created only through the public v2 product.

Creation must atomically establish:

- authenticated creator;
- entitlement eligibility;
- normalized slug;
- reserved-system-path rejection;
- unique slug claim;
- Hub record;
- protected Owner binding;
- audit event.

### Hub visibility/joining

Platform supports configurable:

- public/listed;
- unlisted;
- private/hidden;
- open join;
- approval;
- invite-only;
- closed.

Hub page visibility and Campaign participation are separate controls.

### Hub identity

Hub immutable ID and Hub slug are separate.

Changing or releasing a slug never changes the Hub's immutable ID.

---

## 6. Roles and permissions

The Owner is protected and does not consume a custom-role slot.

Confirmed custom-role limits:

- Starter Hub / Campaign Starter: **3** custom role slots;
- Team Hub / Campaign Plus: **6** custom role slots.

Roles support:

- custom name;
- custom icon;
- discrete capability toggles;
- capability-group toggles;
- multiple roles per member;
- additive effective grants;
- platform-deny/protected-owner overrides.

Owner-only actions include:

- Hub deletion;
- ownership transfer.

No user may grant permissions they do not possess.

Ownership transfer must be secure, atomic, explicitly accepted, and require strong reauthentication.

---

## 7. Hub Builder and pages

Hub Builder uses the v2 three-column model:

- left: page list, toggles, add-page tools;
- center: live responsive preview with desktop/mobile switch;
- right: contextual settings.

Supported page types include:

- Home;
- Campaigns;
- Shop;
- Leaderboard;
- Newsroom;
- Comments;
- Custom Page;
- External Link.

Custom content must use safe platform blocks. No arbitrary customer JavaScript.

Starter includes **3 custom Hub pages** in addition to required/system pages.

Team includes the expanded community-page capability defined by the Team tier.

---

## 8. Campaign model

Campaign is the umbrella interactive object.

Survey is one Campaign mode.

Supported/target modes include:

- survey;
- poll;
- rating;
- idea/feedback;
- election;
- seasonal interaction;
- enhanced Team/Plus modes.

Campaign lifecycle:

`Draft → Scheduled → Active → Paused/Closed → Archived`

Campaigns may be scheduled in advance.

Core records should separate:

- Campaign;
- immutable/published version;
- questions/options;
- schedule/session;
- participation policy;
- eligibility;
- response;
- answers;
- receipt;
- analytics aggregate;
- entitlement snapshot.

Do not use UI disabling as authorization.

---

## 9. Participation modes and privacy

Campaign participation policy is configurable.

### Authenticated member participation

Requires LunchVoice/KpnIdentity account and whatever Hub/Campaign membership rule is configured.

### Authenticated anonymous participation

Identity may be used to prove eligibility, but creator-facing response data must not reveal the respondent identity.

Eligibility proof and response contents must be separated.

### Guest participation

Where a creator enables it, a respondent may participate without a LunchVoice account.

Guest participation:

- does not create Hub membership;
- does not increase Hub member totals;
- does not automatically earn member perks;
- does not expose private Hub content;
- must be rate-limited/abuse-controlled;
- may be disallowed for high-integrity election modes.

Anonymous must not be marketed as anonymous if ordinary creator APIs, exports, embeds, timestamps, or joins can reverse-identify the respondent.

---

## 10. Analytics

Analytics are platform-generated and authorization-aware.

Target capabilities:

- participation totals;
- completion;
- answer distributions;
- trends;
- Campaign comparisons;
- ratings/reactions;
- election results;
- filters;
- authorized exports;
- Hub-published insight widgets;
- accessible table fallbacks.

Privacy states are explicit.

Suppressed/withheld data is not zero.

Current contract shape:

`participant_count`
- `n`
- `suppressed`

When suppressed:
- `n = null`

`answer_distribution`
- cells with `key`, `n`, `suppressed`, `reason`

Known suppression reasons:
- `below_min_cohort`
- `complementary`
- `null`

Free-text aggregation remains subject to privacy policy.

---

## 11. Pricing model — canonical

LunchVoice has two ways to pay for creator capability:

1. recurring Hub subscriptions;
2. duration-based Campaign plans.

Participation remains free.

### 11.1 Free participant

**Price:** $0

Includes:

- account/login;
- join authorized Hubs;
- participate in public/eligible Campaigns;
- use normal participant-facing features authorized by the Hub.

Free participant does not create a paid Hub by default.

### 11.2 Starter Hub

**Price:** **$13/month**

Recurring creator subscription.

Includes:

- Hub creation/use under Starter entitlement;
- protected Owner;
- **3** custom roles;
- **3** custom Hub pages;
- **15** simultaneously active Campaigns overall;
- maximum **2** simultaneously active Survey-mode Campaigns;
- Starter Campaign modes/features;
- normal membership/invite tooling;
- Starter results/analytics;
- survey replacement/unlock threshold requiring **more than 50%** participation from unique eligible Hub members.

Guests, duplicates, bots, and raw response-event counts do not inflate the participation percentage.

### 11.3 Team Hub

**Price:** **$29/month**

Recurring creator subscription.

Includes Starter features plus:

- **6** custom roles;
- expanded community pages;
- enhanced Campaign modes;
- advanced role-targeting;
- advanced analytics;
- maximum **5** simultaneously active Survey-mode Campaigns;
- survey replacement/unlock threshold requiring **at least 20%** participation from unique eligible Hub members;
- eligibility to apply for LunchVoice Discover once the Hub reaches **700 genuine active members**, subject to moderation/approval.

### 11.4 Campaign Starter

**Price:** **$19 for the first 2 weeks**  
**Extension:** **$13 for each additional week**

This is the duration-based equivalent of Starter Hub capability.

It is not a different feature family.

During the purchased/scheduled active window, Campaign Starter inherits the applicable Starter feature/entitlement set.

The purchaser selects how long the Campaign access window should run.

The entitlement engine computes the scheduled paid duration.

### 11.5 Campaign Plus

Campaign Plus is the duration-based equivalent of Team Hub capability.

It inherits the applicable Team feature/entitlement set during the purchased/scheduled active window.

It is not a separate feature family and does not require a recurring Team subscription.

**Pricing model is final:** first purchased period + additional paid weeks according to the Campaign duration model.

**Important source note:** the founder record available to this specification does not contain a recoverable explicit dollar amount for the Campaign Plus first period or additional week. Do not invent one in code, UI, Stripe, migrations, or documentation. Treat the numeric amount as a configuration value that must be supplied from the authoritative pricing record before checkout is enabled.

This is a missing numeric constant, not an open question about what Campaign Plus is or what features it includes.

### 11.6 Hub Name Reservation

Canonical product name: **Hub Name Reservation**

Customer-facing wording may say: **Reserve your Hub URL**.

**Price:** **$25 for 12 months**  
**Renewal:** **$25 for another 12 months**

Purpose:

- reserve an available Hub slug/URL independent of active Campaign execution;
- keep the slug unavailable to others while the reservation is active;
- allow a seasonal Campaign customer to retain a Hub URL between active Campaign periods.

Lifecycle:

`ACTIVE → GRACE → RELEASED`

After reservation expiry:

- **25 calendar days** grace;
- slug remains unavailable to others during grace;
- if not renewed by the end of grace, the reservation is canceled/released;
- another eligible customer may then claim the slug.

A reservation by itself does not grant Hub subscription/Campaign entitlements.

---

## 12. Entitlement model

Do not hardcode plan behavior independently throughout UI and API.

Use one authoritative entitlement map.

Recurring Hub subscriptions and duration-based Campaign plans map to the same feature-capability families:

- Starter Hub ↔ Campaign Starter
- Team Hub ↔ Campaign Plus

The difference is billing/time semantics, not product identity.

Backend authorization must evaluate the active entitlement, not merely frontend plan labels.

Duration-based Campaign access must use explicit start/end timestamps and scheduled entitlement activation.

Expired paid access must fail closed for premium actions without deleting customer-created data.

Hub Name Reservation is a separate entitlement from feature access.

---

## 13. Survey activation thresholds

Confirmed:

Starter / Campaign Starter:
- maximum 2 simultaneous active Survey-mode Campaigns;
- replacement/unlock threshold: **more than 50%** participation.

Team / Campaign Plus:
- maximum 5 simultaneous active Survey-mode Campaigns;
- replacement/unlock threshold: **at least 20%** participation.

Participation denominator/numerator must use unique eligible Hub members.

Do not count:

- duplicate submissions;
- bots;
- guest responders;
- total response events in place of unique eligible participants.

Implementation must avoid deadlocking a brand-new Hub that has no meaningful denominator; the exact accounting algorithm belongs in backend tests and must follow the canonical entitlement rule once finalized in code.

---

## 14. Public website and UI design

LunchVoice v2 has no v1 UI.

The frontend must provide:

- public marketing site;
- pricing;
- sign in;
- account/My Hubs;
- creator onboarding;
- Hub shell;
- Hub Builder;
- members/invites;
- role editor;
- Campaign listing;
- Campaign Studio;
- respondent Campaign player;
- analytics/results;
- billing/entitlement state;
- Hub Name Reservation flow;
- account/settings;
- moderation/discovery surfaces as they land.

### Design direction

Approved direction: Hybrid.

Public brand:
- expressive;
- bold;
- high personality;
- recognizable LunchVoice identity.

Application:
- calmer;
- highly legible;
- professional;
- responsive;
- fast.

Design-system direction:
- ink / amber / bone visual DNA;
- strong display typography;
- restrained UI typography;
- mobile-first respondent experience;
- accessible focus/keyboard/screen-reader behavior;
- light/dark support;
- tenant branding constrained by accessibility.

The old cafeteria page structure is not a design reference to preserve.

---

## 15. Frontend architecture

Current UI worktree:

`~/projects/lunchvoice-wt/ui`

Branch:

`feat/v2-ui`

Reported local commit:

`e4a679d`

At the founder synthesis point:

- v1 screens/auth/components removed;
- v2 route shell created;
- typed `lvApi` client created;
- mock transport created;
- reserved-slug check created;
- simulated sign-in created for mock mode;
- TypeScript/build/bundle/unit/script/brain checks passing;
- nothing pushed or deployed.

Canonical routes:

- `/`
- `/signin`
- `/me`
- `/:hub`
- `/:hub/campaigns`
- `/:hub/campaigns/:id`
- `/:hub/analytics`

Additional system routes such as pricing/discover/billing/settings must be reserved before generic `/:hub` resolution.

The frontend must use `lv_api`, not direct table access.

Mocks are development-only.

---

## 16. Backend architecture

Backend owns:

- account linkage;
- RLS;
- RBAC;
- Hub lifecycle;
- membership/invites;
- Campaign integrity;
- respondent safety;
- analytics;
- billing/entitlements;
- Hub Name Reservation;
- discovery/moderation;
- audits.

Current read-API branch:

`feat/v2-read-api`

Worktree:

`~/projects/lunchvoice-wt/readapi`

Reported completed operations:

- `lv_hub_get`
- `lv_campaign_list`
- `lv_campaign_get`
- `lv_member_list`
- `lv_invite_list`
- `lv_invite_preview`
- `lv_beta_status`
- expanded `lv_my_context`

Reported verification:

- 202 checks;
- 0 failures;
- rollback rehearsal passing;
- nothing pushed at founder synthesis.

Expected application failures should normalize to:

`{ ok: false, error: { code, message, ... } }`

Do not force the frontend to permanently parse Postgres exception strings.

---

## 17. Fresh-v2 database rule

The v2 database/schema is a fresh SaaS model.

Do not design migrations around preservation of v1 rows.

Do not create migration mapping tables for old MJCC users.

Do not create a legacy LionCafe owner.

Do not import old survey history.

Do not use old v1 `orgs`, `profiles`, sessions, menus, rewards, or staff records as v2 bootstrap data.

Target logical v2 domains include:

- app accounts / identities;
- Hubs;
- Hub slugs;
- Hub Name Reservations;
- memberships;
- roles;
- permissions;
- member-role assignments;
- Hub pages;
- Campaigns;
- Campaign versions;
- questions/options;
- schedules/sessions;
- eligibility;
- participation receipts;
- responses/answers;
- analytics aggregates;
- entitlements;
- subscriptions;
- billing events;
- moderation/discovery/audits;
- optional Hub-local currency/rewards.

Fresh database does not mean weak security. Cross-Hub isolation remains a launch gate.

---

## 18. December Miami Job Corps objective

LunchVoice does not ship a prebuilt MJCC/LionCafe experience.

The December goal is to prove that the SaaS can support it without engineering intervention.

Acceptance journey:

1. Food service manager signs in with Google.
2. LunchVoice creates/maps the manager's v2 account.
3. Manager chooses the appropriate paid creation model.
4. Manager creates `LionCafe` as a normal Hub.
5. Manager becomes Owner.
6. Manager configures Hub branding/pages/settings.
7. Manager creates the December Campaign.
8. Manager adds survey questions.
9. Manager chooses participant/privacy mode.
10. Manager schedules the Campaign.
11. Manager publishes/shares link or QR.
12. Students/respondents participate.
13. Manager sees authorized privacy-safe analytics.

If engineering must hardcode LionCafe, MJCC, a survey, owner permissions, or a special route for this to work, the SaaS architecture has failed the acceptance test.

---

## 19. Delivery priorities

### Frontend

1. canonical v2 design system;
2. real public website/pricing;
3. KpnIdentity-ready sign-in;
4. `/me` creator onboarding;
5. generic Hub creation;
6. Hub workspace/Builder;
7. members/invites/roles;
8. Campaign Studio;
9. respondent flow;
10. analytics;
11. billing/entitlement/Hub Name Reservation surfaces;
12. E2E/mobile/accessibility.

### Backend

1. normalize API error contract;
2. merge/reconcile canonical read operations;
3. real KpnIdentity/Google exchange;
4. account/session contract;
5. Hub create/read/update;
6. membership/invite/role APIs;
7. Campaign lifecycle and question/version APIs;
8. anonymous/authenticated/guest participation;
9. analytics;
10. entitlement enforcement;
11. Campaign duration billing;
12. Hub Name Reservation;
13. moderation/discovery/community APIs.

V1 permission fixes are not part of the v2 critical path.

---

## 20. Definition of Done

### Platform DoD

- no v1 screen exists in served UI;
- no v1 data is required for v2;
- no LionCafe/MJCC hardcoding exists;
- Google/KpnIdentity account works;
- a normal paid creator can create a Hub;
- Hub creation atomically assigns protected Owner;
- reserved system slugs are blocked;
- concurrent slug claims are safe;
- roles/capabilities enforce server-side;
- Starter/Team entitlements enforce server-side;
- Campaign Starter/Plus map to Starter/Team feature families using duration-based access;
- Campaign Studio works;
- respondent flow works;
- privacy modes work;
- analytics suppression/withholding works;
- Hub Name Reservation lifecycle works;
- billing is idempotent and server-authoritative;
- cross-Hub access tests pass;
- mobile/accessibility E2E passes;
- rollback/recovery is documented for v2 changes.

### SaaS proof DoD

Without changing source code, a brand-new Google-authenticated creator can create a new Hub, configure it, create/schedule/publish a Campaign, receive responses, and view results.

LionCafe is one future instance of that generic journey.

### Documentation DoD

- `AGENTS.md` and `CLAUDE.md` are byte-identical;
- both describe v2, not v1;
- canonical pricing and entitlement mapping is documented;
- API contract matches implementation;
- changelog is current;
- no document instructs agents to preserve or migrate v1 data;
- no document describes LionCafe as an existing v2 tenant.

---

## 21. Agent rules

1. Read this document before implementing LunchVoice v2.
2. V1 is retired and its data is not a migration source.
3. Never create LionCafe/MJCC in product code, migrations, seeds, or default fixtures.
4. Build generic SaaS capabilities only.
5. Customer Hubs are created by customers through product flows.
6. Use KpnIdentity/Google for v2 account onboarding.
7. Use `lv_api`; no direct frontend table access.
8. Enforce entitlements and permissions on the backend.
9. Treat Campaign Starter as Starter-equivalent and Campaign Plus as Team-equivalent; billing duration is the differentiator.
10. Use the confirmed numeric prices above. Do not invent a Campaign Plus numeric price if it is not present in the authoritative pricing source.
11. Use Hub Name Reservation as the canonical reservation product: $25/12 months, $25 renewal, 25-day grace.
12. Use feature branches, tests, PRs, and review gates.
13. Do not deploy or mutate production merely because a local branch passes tests.
14. The December MJCC use case is an acceptance test of the generic platform, not a reason to add customer-specific architecture.
