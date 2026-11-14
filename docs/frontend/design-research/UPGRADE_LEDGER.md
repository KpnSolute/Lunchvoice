# UI upgrade ledger (every route, before and after)

The founder's rule (2026-11-14): after four weeks nothing that exists today may still look unfinished. This ledger lists **every route** in
`src/config/routes.json` (63 routes) and is the week-4 checklist. The Design agent fills "Defects today" for every row during week 1 with a
before capture at 390, 768 and 1280 in light and dark (stored in the gitignored `docs/frontend/design-research/captures/`, referenced by name).
The UI-refresh agent closes each row in week 4 with an after capture. A route is done only when it is on the new look **completely**.

**Tier A** = bespoke redesign. **Tier B** = fixed through the shared patterns (page header with an overflow menu for secondary actions, stat grid with spacing, form fields,
empty and error states, container widths) **and** reviewed by eye; nothing ships unreviewed.

**Defects already observed (F):** the founder's screenshots and a full live walk on 2026-11-14 are recorded in `UI_AUDIT_2026-11-14.md`; each audited row below carries its defect IDs. Rows still reading "to audit in week 1" were not seen yet; the Design agent adds phone and tablet, dark and high-contrast, keyboard, and the admin, elections and Present screens.

| Route | Name | Shell | Access | Tier | Defects today | Status | Before | After |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | Landing | public | public | A | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): L1 to L7, G1, G7. | audited (desktop) | | |
| `/how-it-works` | How it works | public | public | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): H1. | audited (desktop) | | |
| `/use-cases` | Use cases | public | public | A | to audit in week 1 | planned | | |
| `/use-cases/:slug` | Use case page (sample questions, Use this template) | public | public | A | to audit in week 1 | planned | | |
| `/templates` | Template gallery (search, category and plan filters) | public | public | A | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): T1, T2, MB2. | audited (desktop) | | |
| `/templates/:slug` | Template category or template (live preview, Use this template) | public | public | A | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): T2 (the live preview works well). | audited (desktop) | | |
| `/products` | Products (the six product pages) | public | public | A | to audit in week 1 | planned | | |
| `/products/:slug` | Product page (who it is for, by plan, how it fits, price) | public | public | A | to audit in week 1 | planned | | |
| `/pricing` | Pricing | public | public | A | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): P1 (P0), P2. | audited (desktop) | | |
| `/beta` | Beta | public | public | B | to audit in week 1 | planned | | |
| `/about` | About | public | public | B | to audit in week 1 | planned | | |
| `/status` | Status | public | public | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): ST1. | audited (desktop) | | |
| `/support` | Support | public | public | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): SU1. | audited (desktop) | | |
| `/terms` | Terms | public | public | B | to audit in week 1 | planned | | |
| `/guidelines` | Community Guidelines | public | public | B | to audit in week 1 | planned | | |
| `/privacy` | Privacy | public | public | B | to audit in week 1 | planned | | |
| `/discover` | Discover | public | public | A | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): D1. | audited (desktop) | | |
| `/waitlist` | Founding waitlist (seats, join, admitted / waitlisted) | public | public | A | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): none seen (works); G1. | audited (desktop) | | |
| `/whitelist` | Redirect to /waitlist (link already shared) | public | public | B | to audit in week 1 | planned | | |
| `/signin` | Sign in | none | public | A | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): none seen (clean at 390, MB3). | audited (desktop) | | |
| `/auth/callback` | Sign-in callback | none | public | B | to audit in week 1 | planned | | |
| `/join` | Join with code | none | public | B | to audit in week 1 | planned | | |
| `/h/:slug` | Hub share link | none | public | B | to audit in week 1 | planned | | |
| `/j/:code` | Invite preview | none | public | A | to audit in week 1 | planned | | |
| `/create` | Create Hub (stepper) | none | signed-in | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): AC2, G9. | audited (desktop) | | |
| `/me` | My home | account | signed-in | A | Stat tiles stack edge to edge with no gaps and read as one block; the black "Create your Hub" banner dominates even for a person who already has a Hub; test content ("[TEST] Audit") sits in the list; page width is narrower than other pages (inconsistent container widths). Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): M1 to M3, G1, G4. | audited (desktop) | | |
| `/settings` | Account settings | account | signed-in | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): AC1. | audited (desktop) | | |
| `/surveys` | Quick Surveys | account | signed-in | A | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): M2, M4. | audited (desktop) | | |
| `/surveys/new` | New Quick Survey | account | signed-in | A | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): N1. | audited (desktop) | | |
| `/surveys/:id` | Quick Survey Studio (personal space) | account | signed-in | A | Header action buttons (Preview, Share, Pause, Close, Archive, Results) wrap onto two uneven rows; the Title and Description inputs render as grey fills that read as disabled; a long vertical stack of cards with the preview squeezed into a narrow column; the Branding step feels like a settings form, not a design tool. Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): E1 to E6, G6. | audited (desktop) | | |
| `/surveys/:id/results` | Quick Survey results | account | signed-in | A | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): R1, R2. | audited (desktop) | | |
| `/trends` | Trends (Quick Surveys) | account | signed-in | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): TR1, G2, G9. | audited (desktop) | | |
| `/trends/:trend` | Trend (Quick Surveys) | account | signed-in | B | to audit in week 1 | planned | | |
| `/reserve` | Reserve your Hub URL (check, buy, renew) | account | signed-in | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): AC3, G2, G9. | audited (desktop) | | |
| `/admin` | Platform admin console (waitlist, reports, Discover, billing, email) | account | platform-admin | B | to audit in week 1 | planned | | |
| `/developers` | Developers: API, webhooks and Discord reference | public | public | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): DV1, G2. | audited (desktop) | | |
| `/connect/discord` | Connect Discord (one-time code: link account or confirm a server) | account | signed-in | B | to audit in week 1 | planned | | |
| `/:hub` | Overview (manager) / Hub landing (visitor, L10) | hub | manager | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): HB1 (P0), HB2, HB3. | audited (desktop) | | |
| `/:hub/campaigns` | Campaigns | hub | manager | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): HB10. | audited (desktop) | | |
| `/:hub/campaigns/new` | Template picker | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/campaigns/:id` | Campaign detail | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/campaigns/:id/studio` | Campaign Studio | none | manager | B | to audit in week 1 | planned | | |
| `/:hub/campaigns/:id/results` | Results | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/analytics` | Analytics | hub | manager | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): HB7. | audited (desktop) | | |
| `/:hub/trends` | Trends | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/trends/:trend` | Trend | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/members` | Members | hub | manager | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): HB1 (P0), HB8. | audited (desktop) | | |
| `/:hub/invites` | Invites | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/roles` | Roles | hub | owner | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): HB4. | audited (desktop) | | |
| `/:hub/settings` | Hub settings | hub | owner | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): HB2. | audited (desktop) | | |
| `/:hub/builder` | Hub Builder | none | owner | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): HB5. | audited (desktop) | | |
| `/:hub/billing` | Billing | hub | owner | B | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): HB6. | audited (desktop) | | |
| `/:hub/reservation` | Name reservation | hub | owner | B | to audit in week 1 | planned | | |
| `/:hub/discover` | Discover eligibility | hub | owner | B | to audit in week 1 | planned | | |
| `/:hub/shop` | Shop | hub-public | member | B | to audit in week 1 | planned | | |
| `/:hub/leaderboard` | Leaderboard | hub-public | member | B | to audit in week 1 | planned | | |
| `/:hub/news` | Newsroom | hub-public | public | B | to audit in week 1 | planned | | |
| `/:hub/news/:post` | News post | hub-public | public | B | to audit in week 1 | planned | | |
| `/:hub/comments` | Comments | hub-public | member | B | to audit in week 1 | planned | | |
| `/:hub/p/:page` | Custom page | hub-public | public | B | to audit in week 1 | planned | | |
| `/c/:joinCode` | Respondent player (welcome, question, review, thanks) | none | public | A | Audit 2026-11-14 (live, desktop; `UI_AUDIT_2026-11-14.md`): PL1 to PL5 (PL2 is P0). | audited (desktop) | | |
| `/s/:token` | Quick Survey invite (redeem, then player) | none | signed-in | A | to audit in week 1 | planned | | |
| `*` | 404, error, closed, offline, empty, loading | inherits | any | B | to audit in week 1 | planned | | |
