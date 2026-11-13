# Product direction (founder, 2026-11-11)

Binding for the next build. Order of authority: `LAUNCH_PLAN.md`, the master spec, then this file. Nothing here weakens
anonymity, suppression, guest rules, entitlements or the no-special-casing rule (no customer is ever named in code).

## 1. Positioning

LunchVoice is not a survey tool with a community bolted on. It is **a place where asking is social**: the audience is a
community people belong to (a Hub, a Discord server, a link they share), not a panel you buy. We make surveys easy to
build and make handling the audience easy and human.

## 2. SurveyMonkey: what they have, our answer

Reviewed from SurveyMonkey's public feature and pricing pages (13 common question types free, more on paid plans; skip
logic and branching; 500+ templates; collectors for link, email and embed; a paid respondent panel "Audience"; analysis
and an AI suite; team shared themes). We are not copying them; we borrow the *job* each feature does.

| Their feature | Our answer | State |
| --- | --- | --- |
| Question types (matrix, ranking, NPS, slider, image choice) | Add ranking, NPS, slider, date, image choice; keep our five core kinds free | roadmap |
| Skip logic and branching | "If answer is X, go to Y", Team tier | roadmap |
| 500+ templates | ~20 social templates: RSVP, name vote, schedule poll, retro, event feedback, "what should we build" | partly (poll, rating, feedback starters) |
| Collectors (link, email, embed) | Link, QR, six-character code, invite links, Hub members, **Discord post** (live); embed and per-source results next | mostly done |
| Paid respondent panel | **Not building.** Our audience is your own community: roles, Hubs, Discord, Discover | by design |
| Analysis | Released totals with privacy suppression; next: filter by role or source, compare over time, word cloud for identified text | partly |
| Team themes | Hub identity and customization (section 4) | next |

## 3. The social layer (our edge)

Already live: Hubs with roles, news, comments, leaderboard, points and shop, Discover, guest names (Kahoot-style) on
identified surveys, Discord bot, public API and webhooks. Next: a **live room** (guest joins by code, sees results move),
reactions on results and posts, "who's here" presence in a Hub, share cards, streaks. All privacy-bound: an anonymous
survey shows totals only.

## 4. Identity and customization

- **Profile (any signed-in person):** display name, avatar (colour plus emoji first, image later), banner colour, short
  bio (160), optional pronouns, and a choice to show the Hubs they belong to. Shown on hover cards and the member list.
- **Hub profile (per Hub):** a nickname and avatar colour used only inside that Hub; owners can see the real display
  name; a Hub can require nicknames to match its rules. Never shown outside the Hub.
- **Hub identity (owner):** name, address (immutable id), icon, accent, description, banner.
- **Premium customization (entitlement-driven, one map, never hardcoded in the UI):**
  - Every paid Hub: accent colour palette (contrast-safe), icon colour and emoji, banner **gradient presets**.
  - Starter: plus patterned backgrounds and a second accent.
  - Team: plus custom background images and banners, a custom accent (hex, with a contrast guard), animated banner,
    light, dark or auto theme, and a branded respondent page.
  - Image uploads need storage and moderation; they come after presets.

## 5. Reporting (Discord-style, wired to the account)

- One **Report** action everywhere something can be reported: a person (member list, hover card), a Hub, a survey, a
  comment, a news post. Reason categories, optional details, optional "also block them from contacting me" later.
- A report about a person attaches to **that account's record** (and the Hub it happened in). Staff see it in the Reports
  queue and on the Accounts tab ("3 open reports") and can act: dismiss, warn, suspend (suspension already exists).
- Reporters are never shown to the reported person or to Hub owners; the reporter sees "Report sent" and a status.
- The Support page leads with **Report something** (person, Hub, survey), then contact (`admin@lunchvoice.com`).
- Staff actions are audited; a reporter and a target can never be the same person; repeated reports are rate-limited.

## 6. The Hub look ("Hub Console")

Feedback: the Hub colour and buttons feel wrong; wants a familiar Discord feel without taking their UI.

- **Layout:** left rail of the Hub's sections (Overview, Campaigns, Members, Invites, Roles, Settings, Builder, Billing)
  grouped like channel lists, with the Hub identity at the top; compact top bar with quick actions and a command palette
  (Ctrl/Cmd+K). On phones the rail becomes a drawer plus the existing bottom bar.
- **Surfaces:** neutral charcoal (dark) or soft grey (light), flat cards, 8-10px radii, hairline borders. No glows.
- **Colour:** the Hub's own accent is the one strong colour (selected rail item, primary button, links); the LunchVoice
  orange stays for LunchVoice-level actions only. No more orange underline on every selected tab.
- **Buttons:** rectangular with small radius (not pills), clear hierarchy: filled accent, quiet outline, ghost, danger.
- **Interaction:** hover cards on people, presence dots, inline editing, keyboard navigation, toasts with Undo, optimistic
  updates, drag to reorder questions.
- We keep our own type, tokens and brand; we borrow the *familiarity* of a rail, sections and density, not their colours,
  icons or components.

## 7. Build order

1. Reporting (database, report buttons, Support page, staff queue and account flags).
2. Hub Console look (rail layout, flat buttons, accent rules) on the Hub pages first.
3. Profile and Hub profile editing; Hub identity and gradient banner presets (entitlement keys).
4. Question types (ranking, NPS, slider), templates, branching.
5. Live room and reactions.
6. Image uploads for avatars and backgrounds (storage, size limits, moderation).

## 8. Future (not scheduled)

- **`create.lunchvoice.com`, a dedicated creator app** (founder, 2026-11-13). A separate entry point for building and
  running surveys, the way Kahoot keeps its creator apart from the player: the studio (question rail, canvas, properties
  panel), templates, a library of the creator's surveys, Present mode and reports. `lunchvoice.com` stays the place
  people answer, join with a code and visit Hubs. Notes for when it is scheduled:
  - Same app and the same `lv_api`, served on the subdomain (a route group, not a second codebase), unless the founder
    decides otherwise.
  - Sign-in must carry across `lunchvoice.com` and `create.lunchvoice.com` (KpnIdentity session and cookie domain).
  - This is a product subdomain, not a tenant subdomain: Hub URLs stay path-based (`lunchvoice.com/{hubSlug}`).
  - Routed through Cloudflare, never a Render custom domain: a Redirect Rule to `lunchvoice.com/create` first, a Worker
    if it needs its own look. Render charges for each custom domain beyond a plan's allowance (section 9).
  - Builds on the Creator studio work in `docs/v2/handoffs/2026-11-13-names-results-privacy-creator-studio.md`.

## 9. Platform and services decisions (log)

Newest last. The full inventory is `docs/ops/SERVICES_AND_DEPENDENCIES.md`; the launch plan for the build week of
2026-11-16 is `docs/v2/LAUNCH_PREP_PLAN_2026-11-13.md`.

- **2026-11-12, Cloudflare Worker `lunchvoice-hub-card`** on `hub.lunchvoice.com`: share-link previews for Hubs. Live.
- **2026-11-13, Cloudflare Workers are LunchVoice's edge platform** (founder). Use them for LunchVoice's edge needs
  without asking each time; log every use here and in the Cloudflare usage log. Not covered: a paid plan change,
  nameservers or registrar, other KpnSolute products' Workers.
- **2026-11-13, 30-day sign-in** will be served by a Worker on its own Custom Domain, `auth.lunchvoice.com` (a Worker on
  `lunchvoice.com/auth/*` cannot run in front of Render while the apex is a proxied A record). Host-only
  `__Host-` cookie, same-site with every `lunchvoice.com` host. Builds the week of 2026-11-16.
- **2026-11-13, results visibility is the creator's choice** (founder): Team Hub and Creator Pro creators may choose live
  results for elections and any survey type; respondents are always told first. Builds the week of 2026-11-16
  (migration 000054).
- **2026-11-13, lowest possible cost** (founder): LunchVoice is built at the lowest cost, so **no new Render custom domains**
  (Render includes 2 on Hobby, 15 on Pro, 25 on Scale per workspace and charges $0.25 a month for each extra). Render
  keeps exactly two: `lunchvoice.com` and `www`.
- **2026-11-13, future routing** (all through Cloudflare, none on Render; table in `SERVICES_AND_DEPENDENCIES.md`
  section 2a): `auth.lunchvoice.com` is a Worker (30-day sign-in cookie); `create.lunchvoice.com` is a Cloudflare
  Redirect Rule to `lunchvoice.com/create` (a Worker later if needed); `pay.lunchvoice.com` is proposed as a Worker for
  the Stripe webhook and return handling; `hub.lunchvoice.com` stays the share-preview Worker. There is no wildcard DNS.
- **2026-11-13, creator dashboard** (founder named `create.lunchvoice.com`): one dashboard for every plan, like Kahoot;
  the plan changes what is unlocked (plan card, usage meters, locked controls), never the layout. Design in
  `docs/v2/LAUNCH_PREP_PLAN_2026-11-13.md` section 2b.
- **2026-11-13, payment site** (founder): `pay.lunchvoice.com` becomes the payment site (Stripe), replacing the old
  GoDaddy-era site; a Cloudflare Worker, no Render domain.
- **2026-11-13, how the site deploys:** a Render static site, not Docker. `render.yaml` is not connected (Render has no
  Blueprint), so production routing and headers are changed through the Render API; today they lag the file (the template
  gallery is not indexable). Fix planned for the build week. Details in `SERVICES_AND_DEPENDENCIES.md` section 2a.
- **Optional, undecided:** make the apex a proxied CNAME to Render ("O2O") so zone Workers run in front of the whole
  site (true HTTP 404, per-Hub share images, edge headers). A DNS change; decide after launch unless needed sooner.
