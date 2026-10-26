# LunchVoice v2 UI worker handoff

Canonical source: [LunchVoice_v2_CANONICAL_MASTER_SPEC_2026-10-25.md](../LunchVoice_v2_CANONICAL_MASTER_SPEC_2026-10-25.md). Dated 2026-10-25. The backend counterpart is [BACKEND_WORKER.md](BACKEND_WORKER.md).


You own the LunchVoice v2 frontend.

Working location:

- worktree: `~/projects/lunchvoice-wt/ui`
- branch: `feat/v2-ui`
- current reported local commit: `e4a679d`
- at the last report, nothing was pushed or deployed

Before changing code, read the new canonical master spec in full.

## Founder reset

Two previous assumptions are invalid.

### V1 is not being migrated

V1 is retired.

Its users, historical data, student records, staff records, old surveys, old menu data, rewards/store history and old tenant model are not part of v2.

Do not preserve or recreate v1 UI.

Do not make any v2 experience depend on v1 data.

Do not restore:

- old student pages;
- cafeteria admin;
- Content Central;
- v1 menu/store/orders/roster;
- old Gate/AuthProvider;
- MJCC SSO;
- `/LionCafe` compatibility UI;
- v1 tenant/subdomain behavior.

Your current removal of the v1 frontend is correct.

### Do not build LionCafe

LunchVoice is a SaaS product.

We build the platform.

We do NOT build customer Hubs.

Do not hardcode:

- LionCafe;
- Miami Job Corps;
- MJCC owner identity;
- MJCC pages;
- MJCC survey questions;
- MJCC branding;
- MJCC routes;
- a December Campaign.

The real food service manager will later use the finished SaaS product like any other creator:

Google/KpnIdentity → account → choose entitlement → Create Hub → claim `lioncafe` if available → become Owner → configure Hub → create December Campaign.

That flow is an acceptance test of the SaaS.

No engineering change should be necessary for it.

## Current frontend baseline

Continue from the work already done on `feat/v2-ui`:

- v1 routes/auth/components removed;
- new route shell exists;
- typed `lvApi` client exists;
- mock transport exists;
- reserved-slug check exists;
- mock sign-in exists;
- `/me`, Hub shell, Campaign shell and analytics shell exist;
- TypeScript/build/bundle/unit/script/brain checks were reported passing.

Do not restart from v1.

## Product routes

Core route direction:

- `/`
- `/signin`
- `/me`
- `/:hub`
- `/:hub/campaigns`
- `/:hub/campaigns/:id`
- `/:hub/analytics`

Add/reserve system routes such as pricing/discover/billing/settings before the dynamic Hub route.

Backend remains authoritative for reserved slugs.

## Authentication

Target flow:

LunchVoice → `auth.kpnsolute.com` → Google → KpnIdentity → LunchVoice

Mock mode may simulate this for local UI work.

Mock identity must never become production auth.

No MJCC staff SSO belongs in v2.

## UI mission

Build the full LunchVoice SaaS shell.

The approved design direction is Hybrid:

- expressive public brand;
- calm product UI;
- ink / amber / bone visual DNA;
- strong display typography;
- restrained application typography;
- mobile-first Campaign respondent UI;
- accessibility-first controls;
- light/dark support;
- tenant branding constrained by accessibility.

Build a reusable v2 design system, not page-by-page CSS.

Required design-system coverage:

- tokens;
- typography;
- spacing/layout;
- color;
- light/dark;
- buttons;
- inputs;
- selects;
- radio/checkbox/switch;
- tabs;
- dialogs;
- menus;
- tables;
- navigation;
- cards;
- badges;
- tooltips;
- notifications;
- empty/loading/error/success states;
- Hub cards;
- Campaign cards;
- permission controls;
- pricing/entitlement cards;
- Survey/Campaign question controls;
- respondent progress/player;
- charts/analytics;
- billing state;
- Hub Name Reservation surfaces.

## SaaS screens to build

### Public

- homepage;
- how it works;
- pricing;
- sign in;
- creator CTA;
- templates/use cases if useful;
- discovery entry when backend is ready.

### Account

- `/me`;
- profile;
- My Hubs;
- create Hub;
- invitations;
- subscription/Campaign entitlement state.

### Hub

- public/member landing;
- join/access state;
- member management;
- roles/permissions;
- Hub Builder;
- settings;
- billing/entitlement state;
- Hub Name Reservation.

### Campaign

- Campaign list;
- create Campaign;
- Campaign Studio;
- question builder;
- schedule/duration;
- audience/participation policy;
- anonymous/authenticated/guest settings;
- publish/activate/close;
- share link/QR surface;
- respondent player;
- completion state.

### Analytics

- counts;
- distributions;
- trends;
- filters;
- suppressed states;
- withheld states;
- authorized export.

## API rule

Use `lv_api`.

Do not query Supabase application tables directly from the frontend.

Backend read API currently reports:

- `lv_hub_get`
- `lv_campaign_list`
- `lv_campaign_get`
- `lv_member_list`
- `lv_invite_list`
- `lv_invite_preview`
- `lv_beta_status`
- expanded `lv_my_context`

Coordinate directly with backend for missing contracts.

Mocks are allowed while backend work lands, but every mock must have an explicit real-API replacement path.

## Pricing — do not relitigate feature models

### Free participant

$0.

### Starter Hub

$13/month.

Includes:

- 3 custom roles;
- 3 custom Hub pages;
- 15 simultaneously active Campaigns overall;
- 2 simultaneously active Survey-mode Campaigns;
- >50% unique-eligible-member participation threshold for survey replacement/unlock;
- Starter feature family.

### Team Hub

$29/month.

Includes:

- 6 custom roles;
- expanded community pages;
- enhanced Campaign modes;
- advanced role targeting;
- advanced analytics;
- 5 simultaneously active Survey-mode Campaigns;
- >=20% unique-eligible-member participation threshold;
- eligibility to apply for Discover at 700 genuine active members.

### Campaign Starter

Duration-based Starter equivalent.

- $19 first 2 weeks;
- $13 each additional week;
- same Starter feature family during the paid scheduled window.

### Campaign Plus

Duration-based Team equivalent.

- same Team feature family during the paid scheduled window;
- not a separate feature model;
- no recurring Team subscription required.

Do not invent a numeric Plus checkout price in UI if the authoritative pricing constant is not available in the repo/config.

### Hub Name Reservation

Canonical name: `Hub Name Reservation`.

User-facing copy may say `Reserve your Hub URL`.

- $25 / 12 months;
- $25 renewal / 12 months;
- 25-day grace after expiration;
- release after grace if not renewed;
- reservation does not grant paid feature access.

## Immediate frontend order

1. Update v2 design system and component gallery.
2. Wire completed read APIs.
3. Replace outdated v1 agent/docs assumptions in frontend-relevant docs.
4. Finish real KpnIdentity-ready sign-in/callback shell.
5. Finish `/me` and generic create-Hub flow.
6. Finish Hub workspace and Builder.
7. Finish members/invites/roles.
8. Finish Campaign Studio and duration scheduling.
9. Finish respondent player.
10. Finish analytics.
11. Finish pricing/entitlement/Hub Name Reservation UI.
12. Add browser E2E, responsive and accessibility validation.

## Hard acceptance test

A generic new creator must be able to:

sign in → create any Hub → become Owner → configure Hub → create/schedule/publish a Campaign → share it → receive responses → view results.

The test may use arbitrary synthetic Hub names.

Do not seed LionCafe.

Do not create a special MJCC fixture in production code.

## Git/release

Continue on the dedicated branch/worktree.

Commit reviewable slices.

Do not deploy production from this task.

Do not merge until review gates pass.

Report:

- branch;
- commit;
- PR if opened;
- screenshots;
- design-system status;
- real API operations wired;
- mocks remaining;
- tests;
- accessibility/mobile status;
- blockers;
- next slice.

