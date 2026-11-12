# Prompt for the next agent: product pages, site menu, a "less generated" pass, and Hub identity

Paste everything below the line into a new session opened on `KpnSolute/Lunchvoice`.

---

You are continuing work on LunchVoice (`KpnSolute/Lunchvoice`). Read `CLAUDE.md` first and follow it, including the
Frontend Design Protocol and the three design skills (`design-system`, `frontend-design`, `design-element-authoring`).
Work in small pull requests, one per numbered part below. Do not push to `main` directly, do not apply a migration to
production, and do not deploy an Edge Function unless the founder says so in your session.

## 1. Where things stand (verified 2026-11-12, about 00:40 Eastern)

- **`main` is `e0d4247`.** PR #66 (design system 3, `HubProfile`, `HubCard`, `ShareHubDialog`, the design skills, and
  the link-preview fix) was squash-merged tonight. It was 17 ahead and 0 behind, with both checks green.
- **Link previews.** Every preview of lunchvoice.com ended with `<meta property=`. The fix is in #66
  (`scripts/seo-prerender.mjs` now uses function replacements). Confirm the Render deploy of `e0d4247` finished, then
  view source on https://lunchvoice.com/ and check the `og:description` tag is whole. Discord caches previews, so an
  old link may keep showing the broken text for a while; test with a fresh URL such as `https://lunchvoice.com/?v=2`.
- **The LunchVoice Hub is `lunchvoice.com/kitchen`.** In production, Hub `b3311357-89cc-4550-90e6-018ee35d40fa` had
  its slug changed from `kpnworld` to `kitchen` on 2026-11-11 (one row, `lv.hubs`). It is public and open to join.
  `kpnworld` is now free for anyone to claim and no redirect exists. This change is not in `CHANGELOG.md` yet: add it
  under Operations.
- **Branch `wip/product-pages` (this handoff's branch)** holds unfinished, unwired work. Nothing in it is routed or
  deployed:
  - `src/config/products.json`, `src/config/products.ts`, `src/lib/products.test.ts` (3 tests pass)
  - `src/pages/Products.tsx` (`Products` index and `ProductPage`; type-checks, never rendered in a browser)
  - new CSS at the end of `src/styles/landing.css` (`.lv-pd-*`, `.lv-nav-menu`, `.lv-prodmenu`, `.lv-footer-cols`),
    written but never looked at
  - `docs/v2/handoffs/drafts/hub_identity.draft.sql` and `hub_identity.down.draft.sql` (part 5; never run)
- **Branch `claude/vigilant-feynman-npze3t`** (7 ahead of main, 6 behind, no PR) holds feedback types, elections and
  election night: migrations **000036, 000037 and 000038**, built and tested there, not applied to production, waiting
  for founder approval. It edits `Marketing.tsx`, `Hub.tsx`, `lvApi.ts`, `mockTransport.ts` and
  `supabase/tests/14_entitlements.sql`. Do not merge it and do not reuse its migration numbers. Keep your changes out
  of those files where you can, so it still merges cleanly.
- **Production has migrations 000029 to 000032** from PR #59 (`claude/determined-darwin-aa79al`) that are not on
  `main`. The canonical suite on `main` therefore does not match production exactly. Do not "fix" this by copying
  files; mention it if it blocks you.
- **Docker works in a cloud session** after `dockerd &`. `bash scripts/db-test-canonical.sh` passed on `main` before
  tonight's merge.

## 2. What the founder asked for, in their words and in the roadmap

Sources, in order of authority: `docs/v2/LAUNCH_PLAN.md`, the master spec, `docs/v2/PRODUCT_DIRECTION_2026-11-11.md`
(read section 8 from `claude/vigilant-feynman-npze3t`, where it is newer), then the founder's Google Doc "LunchVoice —
Innovation Concepts and Product Roadmap — 2026-11-11" (the last addendum, "What we built and decided").

- Identity: **LunchVoice is where a community decides. Discord is where a community talks.** Integrate with Discord
  and similar places; do not rebuild a chat app or a social feed inside LunchVoice.
- The founder wants the site to read like a complete company's site, "a page for every product" in the way
  SurveyMonkey has one, and wants the UI to feel "less AI and more usable and friendly".
- The website has **six products**, each with its own page in the **same layout: headline, who it is for, features by
  plan, how it fits, price**. The six are Hubs, Feedback, Campaigns, LunchVoice for Discord, Developers and Privacy.
  Plan columns must be read from the entitlement map the server uses (`lv_plan_limits`), so a page can never promise
  something a plan does not give.
- The landing hero stays "Every voice has a story. Hear it."
- Never describe something planned as available. Hub Pulse, goals, recaps, missions, achievements, Trends, Creator
  plans and every AI feature are not built. Elections and the Yes/No type exist only on the elections branch, so they
  must not appear on a page until that branch is merged and its migrations are applied.

## 3. Part A: finish the six product pages and the site menu (frontend, one PR)

The content and the page component exist on `wip/product-pages`. What is missing:

1. **Routes.** In `src/main.tsx` add `products` and `products/:slug` before the `:hub` route. Add both to
   `src/config/routes.json` (layout `L1`, shell `public`, access `public`); `npm run check:routes` enforces this.
2. **Reserved name.** `products` is not in `lv.reserved_slugs`, so a customer could create a Hub at that address and
   the page would hide it. Add `products` to `src/lib/reservedSlugs.ts`, and write a migration modelled on
   `000026_v2_reserve_platform_pages.sql` with its rollback. Number it **000039** (36 to 38 belong to the elections
   branch). It needs founder approval before it is applied to production; say so in the PR.
3. **Header** (`src/pages/Public.tsx`). Replace the five flat links with: a **Products** menu, then Use cases, Pricing,
   Discover and How it works. The waitlist is already the amber header button, so it does not need a link as well.
   The Products menu lists the six products (icon, name, one line from `products.json`) and ends with "All products".
   Use the existing `DropdownMenu`; the trigger is a real button with the `.lv-nav-menu` class. On phones the bottom
   sheet (`MarketingMenu`) shows the six products under a "Products" heading, then the other links.
   Treat `/products` and `/products/*` as marketing routes so they get the full header and footer
   (`MARKETING_ROUTES` and the `startsWith` check).
4. **Footer.** Today it is one row of twelve links. Make it four columns with headings: Products (the six), Use it for
   (Use cases, Discover, How it works), Company (About, Pricing, Waitlist, Support, Status) and Legal (Privacy, Terms,
   Guidelines), with the brand above and "Made by KpnSolute" below. `.lv-footer-cols` is drafted for this. Note that
   "Privacy" appears twice with two meanings: the product page (`/products/privacy`) and the legal policy
   (`/privacy`). Label the legal one "Privacy policy".
5. **Search and sharing.** In `scripts/seo-prerender.mjs`, `loadSeo` should add `/products` and one page per product
   from `products.json` (title, description, h1, lede as body), the way it does for use cases. Add the rewrites to
   `render.yaml`. The Render dashboard rules are **not** synced from `render.yaml`: list the seven rules the founder
   has to add by hand in the PR description. Until they are added the pages still work for people (the app loads and
   routes), but crawlers get the home page's metadata.
6. **Look at it.** Start the app with the e2e harness (`e2e/harness.mjs`, `startApp` and `openPage`), and take
   full-page screenshots of `/products` and all six product pages at 390, 768 and 1280, in light, dark and high
   contrast. Fix what you see. Things I expect to need attention because nobody has looked yet:
   - the two-column top section at 768;
   - the plan table on a 390px screen (three plan columns plus the label; if it does not fit, show one plan at a time
     the way `CompareMobile` in `Pricing.tsx` does, rather than sideways scrolling);
   - the Products menu on the ink home-page header;
   - footer link height: the e2e touch-target test requires 44px for `footer a` on phones.
7. **In the mock, some plan rows disappear.** `src/lib/mockTransport.ts` returns only a few keys from
   `lv_plan_limits`. Rows keyed on `community.*`, `shop.max_items`, `api.*`, `webhooks.max_endpoints`,
   `campaigns.role_targeting` and `analytics.export` are left out on purpose when the map has no value. Add those keys
   to the mock's `limitsOut` with production's values so development and tests show the full table: Starter and Team
   `community.newsroom/comments/leaderboard/shop` true; `shop.max_items` 10 and 50; `analytics.export` true for both;
   `campaigns.role_targeting` Team only; Team `api.enabled` true, `api.max_keys` 10, `api.rate_per_minute` 60,
   `webhooks.max_endpoints` 5. (`mockTransport.ts` is also edited on the elections branch; keep the change to that
   one function.)
8. **Tests.** Add `e2e/products.test.mjs`: the index lists six products; each page has one `h1`, the plan table, the
   price list and a working primary button; an unknown slug shows the not-found page; no horizontal scroll at 360;
   the canonical link is right. Add the new pages to the "launch plan UI gate" test in `e2e/sitecta.test.mjs`.
9. **Check every sentence in `products.json` against the product.** I wrote it from the code and the contract, but
   confirm these before shipping: the Campaign modes on `main` are `survey`, `poll`, `rating` and `feedback`; question
   kinds are rating, single choice, multiple choice, yes or no and short text; the Discord commands are link, unlink,
   verify, connect, post and setup; the API is Team only with 10 keys, 60 requests a minute and 5 webhook endpoints.
10. `CHANGELOG.md`, then `npm run test:pr` and `npm run test:e2e`.

## 4. Part B: the "less generated" pass on the public site (frontend, one PR)

The `frontend-design` skill lists the tells. These are the specific places I found them in screenshots of `main`:

| Where | What reads as templated | Change |
| --- | --- | --- |
| Home, every section | A small all-caps mono eyebrow sits above every heading (USE CASES, HOW IT WORKS, LIVE RESULTS, YOUR HUB, FOR PARTICIPANTS, FOUNDING SEATS, PRICING) | Keep the eyebrow on the hero and on Founding seats, where it adds a fact. Remove it where the heading already says the same thing |
| Home, headings | Six headings in a row use the same two-short-sentences shape ("Build it, share it, hear it. Same afternoon.", "Free to start. Grow when you're ready.") | Rewrite half of them as plain statements of what the section is. Do not touch the hero |
| Home, "How it works" | Three cards numbered 01, 02, 03 in three different fills | It is a real sequence, so numbers are fine, but make the three steps one connected row instead of three unrelated cards |
| Home | No route from the home page into the product pages | Add one plain section listing the six products with one line each, linking to their pages. Replace a weaker section instead of adding length |
| `/how-it-works` | Four identical cards numbered 01 to 04, though they are not steps, with the fourth alone on a second row | Remove the numbers; set them as a two-by-two list or a definition list with hairlines |
| `/use-cases` and others | Every item is the same rounded card with an icon tile | Fine for the use-case grid (they are peers). Do not copy the pattern onto new pages |
| Site copy | "ideas and elections" are named as things you can run (`src/config/seo.json` use-cases description; check Landing and About too). `main` has no ideas or election mode | Say survey, poll, rating and open feedback until the elections branch ships |
| Pricing | The Team plan lists "Enhanced Campaign modes" and "Advanced targeting and analytics", which the billing audit says are not delivered | The founder chose to leave this copy for now. Do not change it; mention it in the PR so the decision stays visible |

Rules for this pass: no new colours, fonts, radii or shadows; reuse components; one amber primary button per screen;
remove more than you add. `e2e/sitecta.test.mjs` and `e2e/usecases.test.mjs` assert on some home-page text and test
ids (`landing-use-cases`, `data-lv-cta` values, "Start a free survey"), so read them before deleting a section.

## 5. Part C: the Hub workspace settings screen (frontend, one PR)

The founder looked at `/<hub>/settings` and said the UI felt weird. From their screenshot (taken before #66):

- The Hub header showed six unexplained tags at once: HUB, PUBLIC, OPEN, the address, TEAM, OWNER. Check what #66's
  `HubProfile` does now; the goal is name, address, and at most the badges that mean something, each with a tooltip.
- Field labels were small uppercase mono (NAME, ABOUT, VISIBILITY). Design system 3 says sentence case in the UI font.
  Confirm no page still overrides it.
- The left rail has eleven items. A new owner does not know what Builder, Reservation and Discover do. Add a
  "Set up your Hub" checklist to Overview for owners (name and about, colour, first Campaign, invite people, connect
  Discord), each item linking to the right place and ticking itself off from real data. The existing "Get your Hub
  going" card in `HubOverview` is the starting point.
- The address cannot be changed in the app (the founder had to ask for a database change). Decide with the founder
  whether owners may change it; if yes it needs a backend function with the reserved-name and quarantine rules.
- **Discord tab** (`HubDiscordSettings` in `src/pages/Integrations.tsx`). Today it is one paragraph and a list. Rebuild
  it as "Connected communities":
  1. When nothing is connected: three numbered steps (add the bot to your server, run `/lunchvoice connect hub:<slug>`
     with a copy button, confirm the link it posts), and what members can do afterwards.
  2. When connected: one card per server with its name, when it was connected, an auto-post switch with a sentence
     saying what it does, the number of role rules, and Disconnect behind a confirmation.
  3. One line that anonymous Campaigns are always answered in LunchVoice, and why.
  4. If part 5 ships: a "Show this server on your Hub" switch and an invite-link field on the card.

## 6. Part D: Hub identity backend (backend plus a small frontend change, one PR, needs founder approval to apply)

The founder decided this on 2026-11-11:

- **Presence** means who is here now: a live count and names of members currently in the Hub.
- **Tags** are topic tags on a Hub, like a Discord server's.
- **Badges**: a Hub shows up to **five** badges. They are symbols LunchVoice makes; each one means something about the
  Hub or marks an achievement.
- **Discord on the Hub**: after connecting Discord, the Hub's About shows the server.
- They approved "test, then apply to production" for this change. That approval was given before the elections branch
  was known to hold 000036 to 000038, so confirm the order with them before applying anything.

`HubCard` and `HubProfile` already accept `online`, `tags` and `created_at` and draw them only when the backend sends
them. Nothing sends them yet.

`docs/v2/handoffs/drafts/hub_identity.draft.sql` is a complete first draft with its rollback. **It has never been
run.** It adds only new objects (no existing function is replaced):

- tables `lv.hub_tags`, `lv.badges` (catalog), `lv.hub_badges`, `lv.hub_presence`, `lv.presence_prefs`; columns
  `show_on_hub` and `invite_code` on `lv.discord_connections`; `member_count`, `online_count`, `stats_at` on
  `lv.discord_guilds`;
- `lv_api.lv_hub_about(p_slug)` (signed out allowed, follows the Hub's own visibility), `lv_hub_presence_ping`,
  `lv_presence_pref_get/set`, `lv_hub_tags_set`, `lv_hub_discord_cards`, `lv_hub_discord_card_set`,
  `lv_admin_hub_badges`, `lv_admin_hub_badge_set`;
- service-role `lv.discord_stats_due` and `lv.discord_stats_set`.

To finish it:

1. Renumber to the next free number after the elections branch and the reserved-name migration (000040 if both land
   first), move both files into `supabase/migrations` and `supabase/rollbacks`, and get
   `bash scripts/db-test-canonical.sh` green.
2. Write `supabase/tests/NN_hub_identity.sql`. Cases that matter: a non-member of a private Hub gets `lv_not_found`
   from `lv_hub_about`; a visitor to a public Hub gets the count but no names; a member who turned presence off is
   neither named nor counted; a suspended Hub answers neutrally to everyone but its Owner; tags are normalised, capped
   at five and need `hub.settings.manage`; an earned badge cannot be awarded by hand; a sixth awarded badge is
   refused; only staff can award; only one connection per Hub can be shown; a server staff turned off cannot be
   shown; no `lv` table or function is reachable by `anon` or `authenticated`.
3. `lv_hub_about` is a new signed-out function, so the anon allow-list in `supabase/tests/14_entitlements.sql` (two
   places) and in `docs/backend/PRODUCTION_RESET_RUNBOOK.md` must gain it. The elections branch edits the same test
   file; expect a small conflict.
4. Privacy review before shipping, because this is new: presence is recorded from Hub pages only, never from the
   survey player, and is never joined to participation. Even so, in a very small Hub a live "here now" list beside a
   live anonymous response count could hint at who just answered. Decide with the founder whether names should be
   hidden while an anonymous Campaign is open, or presence delayed. The draft does neither.
5. The badge catalog in the draft is my proposal, not the founder's list: awarded by staff (Official, Verified,
   Partner, Trailblazer) and earned from facts (Founding Hub, First voice, Gathering at 25 members, Full house at 100,
   On Discord). Get the names and meanings approved, then draw one symbol per badge in `Icon.tsx` or
   `IconBadge.tsx`, following `design-element-authoring`. `src/config/badges.ts` from #66 already defines Owner,
   Founding Hub, Team Hub and Listed on Discover in the frontend; merge the two lists, do not keep both.
6. Discord member and online counts cannot be fetched in the browser: the site's Content-Security-Policy allows
   connections only to itself and Supabase, and images only from itself. The draft expects the `discord` Edge
   Function's `/dispatch` run (every two minutes by cron) to call Discord's `GET /guilds/{id}?with_counts=true` with
   the bot token for servers returned by `lv.discord_stats_due`, then `lv.discord_stats_set`. That function change is
   not written. The deployed `discord` function is a single bundled file that does not match the repository's layout,
   so compare the two before deploying, and get the founder's go-ahead: a bad deploy breaks the live bot.
7. Frontend: an `api.hubAbout(slug)` client and mock; feed `online`, `tags`, `created_at` and badges into
   `HubProfile` and `HubCard`; ping presence every 60 seconds while a Hub page is open and the tab is visible; a tags
   editor in Hub settings; a "Show when I'm active in a Hub" switch in Account settings; a badge control in the staff
   panel. Document every function in `docs/backend/API_CONTRACT.md`.
8. Once it is applied, the Kitchen Hub should be given the Official badge through the staff call, not by SQL and not
   by any code that names a Hub.

## 7. Not code: the Kitchen's Discord invite card

The founder compared the Kitchen server's invite card (plain banner, no description) with a server that has a banner,
a description and tags. That card is drawn by Discord from the server's own settings. In Discord: Server Settings,
then Server Profile, set a description, a banner colour or image, and traits. Nothing in this repository controls it.
The "Join" button appears only for people who are not already in the server.

## 8. How to report back

For each PR: what changed, the screenshots you checked, the checks you ran and their results, anything you found but
did not change, and what needs the founder (approvals, Render dashboard rules, Discord settings). Say plainly what
you did not verify.
