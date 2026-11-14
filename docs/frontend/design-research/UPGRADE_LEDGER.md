# UI upgrade ledger (every route, before and after)

The founder's rule (2026-11-14): after four weeks nothing that exists today may still look unfinished. This ledger lists **every route** in
`src/config/routes.json` (63 routes) and is the week-4 checklist. The Design agent fills "Defects today" for every row during week 1 with a
before capture at 390, 768 and 1280 in light and dark (stored in the gitignored `docs/frontend/design-research/captures/`, referenced by name).
The UI-refresh agent closes each row in week 4 with an after capture. A route is done only when it is on the new look **completely**.

**Tier A** = bespoke redesign. **Tier B** = fixed through the shared patterns (page header with an overflow menu for secondary actions, stat grid with spacing, form fields,
empty and error states, container widths) **and** reviewed by eye; nothing ships unreviewed.

**Defects already observed (F, from the founder's screenshots of 2026-11-14)** are on the rows below; the Design agent adds the rest.

| Route | Name | Shell | Access | Tier | Defects today | Status | Before | After |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | Landing | public | public | A | to audit in week 1 | planned | | |
| `/how-it-works` | How it works | public | public | B | to audit in week 1 | planned | | |
| `/use-cases` | Use cases | public | public | A | to audit in week 1 | planned | | |
| `/use-cases/:slug` | Use case page (sample questions, Use this template) | public | public | A | to audit in week 1 | planned | | |
| `/templates` | Template gallery (search, category and plan filters) | public | public | A | to audit in week 1 | planned | | |
| `/templates/:slug` | Template category or template (live preview, Use this template) | public | public | A | to audit in week 1 | planned | | |
| `/products` | Products (the six product pages) | public | public | A | to audit in week 1 | planned | | |
| `/products/:slug` | Product page (who it is for, by plan, how it fits, price) | public | public | A | to audit in week 1 | planned | | |
| `/pricing` | Pricing | public | public | A | to audit in week 1 | planned | | |
| `/beta` | Beta | public | public | B | to audit in week 1 | planned | | |
| `/about` | About | public | public | B | to audit in week 1 | planned | | |
| `/status` | Status | public | public | B | to audit in week 1 | planned | | |
| `/support` | Support | public | public | B | to audit in week 1 | planned | | |
| `/terms` | Terms | public | public | B | to audit in week 1 | planned | | |
| `/guidelines` | Community Guidelines | public | public | B | to audit in week 1 | planned | | |
| `/privacy` | Privacy | public | public | B | to audit in week 1 | planned | | |
| `/discover` | Discover | public | public | A | to audit in week 1 | planned | | |
| `/waitlist` | Founding waitlist (seats, join, admitted / waitlisted) | public | public | A | to audit in week 1 | planned | | |
| `/whitelist` | Redirect to /waitlist (link already shared) | public | public | B | to audit in week 1 | planned | | |
| `/signin` | Sign in | none | public | A | to audit in week 1 | planned | | |
| `/auth/callback` | Sign-in callback | none | public | B | to audit in week 1 | planned | | |
| `/join` | Join with code | none | public | B | to audit in week 1 | planned | | |
| `/h/:slug` | Hub share link | none | public | B | to audit in week 1 | planned | | |
| `/j/:code` | Invite preview | none | public | A | to audit in week 1 | planned | | |
| `/create` | Create Hub (stepper) | none | signed-in | B | to audit in week 1 | planned | | |
| `/me` | My home | account | signed-in | A | Stat tiles stack edge to edge with no gaps and read as one block; the black "Create your Hub" banner dominates even for a person who already has a Hub; test content ("[TEST] Audit") sits in the list; page width is narrower than other pages (inconsistent container widths). | planned | | |
| `/settings` | Account settings | account | signed-in | B | to audit in week 1 | planned | | |
| `/surveys` | Quick Surveys | account | signed-in | A | to audit in week 1 | planned | | |
| `/surveys/new` | New Quick Survey | account | signed-in | A | to audit in week 1 | planned | | |
| `/surveys/:id` | Quick Survey Studio (personal space) | account | signed-in | A | Header action buttons (Preview, Share, Pause, Close, Archive, Results) wrap onto two uneven rows; the Title and Description inputs render as grey fills that read as disabled; a long vertical stack of cards with the preview squeezed into a narrow column; the Branding step feels like a settings form, not a design tool. | planned | | |
| `/surveys/:id/results` | Quick Survey results | account | signed-in | A | to audit in week 1 | planned | | |
| `/trends` | Trends (Quick Surveys) | account | signed-in | B | to audit in week 1 | planned | | |
| `/trends/:trend` | Trend (Quick Surveys) | account | signed-in | B | to audit in week 1 | planned | | |
| `/reserve` | Reserve your Hub URL (check, buy, renew) | account | signed-in | B | to audit in week 1 | planned | | |
| `/admin` | Platform admin console (waitlist, reports, Discover, billing, email) | account | platform-admin | B | to audit in week 1 | planned | | |
| `/developers` | Developers: API, webhooks and Discord reference | public | public | B | to audit in week 1 | planned | | |
| `/connect/discord` | Connect Discord (one-time code: link account or confirm a server) | account | signed-in | B | to audit in week 1 | planned | | |
| `/:hub` | Overview (manager) / Hub landing (visitor, L10) | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/campaigns` | Campaigns | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/campaigns/new` | Template picker | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/campaigns/:id` | Campaign detail | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/campaigns/:id/studio` | Campaign Studio | none | manager | B | to audit in week 1 | planned | | |
| `/:hub/campaigns/:id/results` | Results | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/analytics` | Analytics | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/trends` | Trends | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/trends/:trend` | Trend | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/members` | Members | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/invites` | Invites | hub | manager | B | to audit in week 1 | planned | | |
| `/:hub/roles` | Roles | hub | owner | B | to audit in week 1 | planned | | |
| `/:hub/settings` | Hub settings | hub | owner | B | to audit in week 1 | planned | | |
| `/:hub/builder` | Hub Builder | none | owner | B | to audit in week 1 | planned | | |
| `/:hub/billing` | Billing | hub | owner | B | to audit in week 1 | planned | | |
| `/:hub/reservation` | Name reservation | hub | owner | B | to audit in week 1 | planned | | |
| `/:hub/discover` | Discover eligibility | hub | owner | B | to audit in week 1 | planned | | |
| `/:hub/shop` | Shop | hub-public | member | B | to audit in week 1 | planned | | |
| `/:hub/leaderboard` | Leaderboard | hub-public | member | B | to audit in week 1 | planned | | |
| `/:hub/news` | Newsroom | hub-public | public | B | to audit in week 1 | planned | | |
| `/:hub/news/:post` | News post | hub-public | public | B | to audit in week 1 | planned | | |
| `/:hub/comments` | Comments | hub-public | member | B | to audit in week 1 | planned | | |
| `/:hub/p/:page` | Custom page | hub-public | public | B | to audit in week 1 | planned | | |
| `/c/:joinCode` | Respondent player (welcome, question, review, thanks) | none | public | A | to audit in week 1 | planned | | |
| `/s/:token` | Quick Survey invite (redeem, then player) | none | signed-in | A | to audit in week 1 | planned | | |
| `*` | 404, error, closed, offline, empty, loading | inherits | any | B | to audit in week 1 | planned | | |
