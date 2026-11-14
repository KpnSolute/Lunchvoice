# Week 4: the UI and UX refresh (Mon 2026-12-07 to Fri 2026-12-11)

The founder's brief (2026-11-14): the UI "looks AI... generic... boring". It should look like the best SaaS products
(Kahoot, SurveyMonkey and the rest), with interactive images and motion on the landing page, and it is applied **after**
the backend is finished. The 2026-11-13 handoff says the same thing in order: services, then functional UI, then final
synthesis, then readiness. This file is the design contract for that last step. It does not touch the backend.

What stays fixed (founder-approved identity, `docs/frontend/design-system/README.md`): the sharp-cornered LV mark with the
amber speech bubble (`LvMark`), the wordmark, amber `#FF9A18`, ink `#14110F`, bone `#F7F3EA`, Bricolage Grotesque for
display, Geist for UI, Space Mono for data, the two taglines and where each may appear, light, dark and high-contrast
themes. **Hub pages and Hub cards keep their current structure** (founder, 2026-11-14): they are restyled, not re-laid-out.

What may change, with approval: how much of the palette is used and how loudly, imagery and illustration, motion, density,
the structure of the marketing pages and the creator dashboard, copy. Each global change is listed in section 3 for the
founder to approve by Wed 12-02 (`DESIGN_EXTENSIONS.md` records approvals).

## 1. Why it looks generic (diagnosis, J)

The system is correct and calm, which is the problem for the public face. Evidence read from the design guide and the code:

1. **One quiet register almost everywhere.** The guide asks for "flat surfaces" and "never gradients on controls", with one
   strong colour on a bone page. Applied to every screen, nothing is allowed to be a moment.
2. **No product on the page.** The landing and marketing pages are built from tiles and text (`Landing.tsx` 313 lines,
   `Marketing.tsx` 312). Competitors show the product working in the first screen. A visitor cannot feel what LunchVoice does.
3. **Stock component shape.** The shadcn layer gives familiar cards, tabs and dialogs, so any page assembled from them looks like
   any other.
4. **No illustration or imagery system.** There is a logo and nothing else visual.
5. **Motion is decoration, not meaning.** The player has springy choices, but results, decisions and the landing do not use
   motion to explain anything.
6. **The strongest idea is invisible.** Anonymity with a visible promise, and "you said, we did", are what no competitor has,
   and today they are sentences, not pictures.

## 2. Direction: make the voice visible

**One idea:** the product is about voices being heard, so the interface should *show voices arriving and mattering*. The
logo is a speech bubble; the motif is already ours.

Six principles:

1. **Big, confident fields of colour and type.** Ink and amber blocks, huge Bricolage headlines (the display font is the personality),
   generous space. Kahoot's energy, our palette, no purple, no stock gradients.
2. **The product is the hero.** Real components, interactive, in the first screen of every marketing page. No screenshots of
   screenshots; the demo uses the same chart and player components the product uses, fed with fake data labelled as a demo.
3. **Motion carries meaning.** Answers arrive as dots that drift into bars; a withheld result is a closed bubble that opens at
   five; a decision "lands" on the Hub; a live room counts up. Motion is short, springy, reduced-motion safe.
4. **Trust is a visual.** What the creator can see and cannot see is drawn (a two-pane "you / the creator" picture) wherever a
   person is about to answer.
5. **Communities have faces.** Avatars, presence dots, role colours, small celebration moments, Discord-adjacent warmth without
   copying anyone's components or colours.
6. **Calm where work happens.** The creator dashboard, studios, analytics and admin stay dense and quiet; the energy lives on
   the public pages, the player and results. Two registers (already the rule) with a sharper contrast between them.

Reference points (adjective, not imitation): **Kahoot** for confident play and big colour; **SurveyMonkey** for
trustworthy density in the creator tools; **Discord** for community texture and dark-mode comfort; **GitHub** for
credibility through visible history (decisions, audit trails); **Linear** and **Notion** for restraint in work screens.
We do not use their colours, icons or components.

## 3. Design-system changes for the founder to approve (by Wed 12-02)

Everything else in `tokens.css` stays. Each row is one approval; the Design agent supplies a mock for each.

| # | Change | Why | Where | Risk |
| --- | --- | --- | --- | --- |
| T-1 | **Data palette**: six categorical hues, a sequential ramp and a diverging ramp, validated at AA on light, dark and high-contrast (the `dataviz` skill's validator), used in charts, badges and illustrations only | Charts and result screens currently lean on one amber; a real data palette makes results feel like a product | `tokens.css` new `--lv-data-1..6` | Low |
| T-2 | **Two supporting hues** (J: a deep teal and a berry) for illustration, role colours and celebration, never for primary buttons or text on light | Gives the public pages range without a second brand colour | `tokens.css` `--lv-support-a/b` | Medium: brand dilution; keep amber the only action colour |
| T-3 | **Gradients allowed on marketing surfaces and illustrations** (not on controls) | Depth on the hero and bands | `tokens.css` `--lv-fx-*` | Low |
| T-4 | **One "lifted" elevation** for hero demo cards and popovers | The demo widget needs to sit above the page | `--lv-lifted-shadow` | Low |
| T-5 | **Display type range**: fluid hero size up to about 96px on desktop, tighter tracking, optical size on (`opsz` already shipped) | Louder headlines | `tokens.css` type scale | Low |
| T-6 | **Motion tokens**: four named springs and a stagger, reduced-motion fallbacks | One vocabulary for the dots, bars, bubbles and counters | `src/ui/motion.css` and `motion.tsx` | Low |
| T-7 | **Illustration language**: flat geometric speech bubbles, dots and waveforms in ink, amber, bone and the support hues; no people drawings, no 3-D, no stock photos of invented people | Distinctive and cheap to produce as SVG | `public/illustrations/*.svg` and components | Low |

No new fonts, no new radii (rule kept), no invented numbers, testimonials or logos.

## 4. Scope by tier

**Tier A: bespoke redesign (the screens people see first or use most).**

| Surface | Route | What changes |
| --- | --- | --- |
| Landing | `/` | Full rebuild to the storyboard in section 5 |
| Pricing | `/pricing` | Plan comparison redrawn around outcomes (`01_` section 2), live prices from the plan map, honest copy |
| Templates | `/templates`, `/templates/:slug` | Visual cards, live preview of the first questions in a phone frame |
| Use-case and product pages | `/use-cases/*`, `/products/*` | New hero pattern, product demo block |
| Player | `/c/:joinCode`, `/s/:token`, `/j/:code` | The "lively heart": big choices, progress, the promise panel, thank-you with "you can come back for the result" |
| Results and Present | `/campaigns/:id/results`, `/surveys/:id/results` | Data palette, animated reveal, withheld bubbles, Present mode as a stage |
| Creator dashboard | `create.lunchvoice.com/` | Plan card, usage meters, library cards, empty states that teach |
| Hub page and Hub card | `/:hub`, Discover cards | **Restyle only** (structure unchanged): colours, avatars, presence, motion |
| Sign-in and waitlist | `/signin`, `/waitlist` | `/signin` becomes the entry card (provider buttons, remember checkbox, legal line) and matches the themed KpnAuth screens built in week 3 (`02_` A6); `/waitlist` calm and confident |
| Decisions | Hub Decisions tab and decision page | New feature, designed once, to a high standard (the "GitHub" of community decisions) |

**Tier B: fixed through shared patterns and reviewed one by one** (Account, Settings, Roles, Billing screens on `pay.`, Analytics tables,
Admin, Integrations, Developers, legal pages, and every other route in the ledger). They get the new tokens, type scale, motion tokens and icons, plus
the shared patterns of section 12 (page header, stat grid, forms, states). Every one is reviewed by eye against the ledger; none ships unreviewed.

## 5. Landing storyboard (the interactive page)

Mobile first (390), then 768, then 1280. Every interactive piece works with keyboard and touch, honours
`prefers-reduced-motion` (a static version of each), and degrades without JavaScript to its text.

1. **Hero.** Headline from the approved rotation (one of "Make every voice count." or "Every voice has a story. Hear it.");
   subline in plain words (what it is, who it is for). Right side (below on phones): a **live poll card**, real components:
   "What should we have for lunch Friday?" with four options. The visitor taps one; bars animate; a handful of scripted
   dots drift in as if others answered (labelled "demo"); a small toggle **"See it as the creator / as you"** swaps the
   panel from "creator sees totals" to "you stay anonymous". One button: "Make your own, free".
2. **"Ask anything" strip.** A horizontally drifting row of real template cards (names from the 82 templates, linking
   to their pages), pausing on hover and focus. Under it: "82 templates. 21 question types. Free to start."
3. **"Anonymous means anonymous" explainer** (the signature interaction). A slider "How many people answered? 1 to 8" under a
   result bar chart. At 1 to 4 the bars are closed bubbles reading "Hidden until 5 people answered"; at 5 they open.
   A caption: "Small groups are never shown. This is built into LunchVoice, not a setting you can forget." This is the product's
   privacy engine drawn.
4. **"From answers to decisions".** Five steps (Ask, Answer, See, Decide, You said, we did) as a scroll-linked sequence; the last step
   shows a Hub **decision card** ("Decided: Friday lunch is tacos. 62% of 48 answers.") landing on a Hub home. Plain
   sentence under it: "People see what their answers did."
5. **"Where your community already is."** Split view: a Discord-like chat (drawn, not a screenshot of Discord) on the left
   saying "talk"; the LunchVoice decision on the right saying "decide"; a bridging bubble. Copy: "Discord is for talking.
   LunchVoice is for deciding."
6. **Mini demos in a row** (tap to try): **Join code** (type a six-character code, see the room count up), **Election** (three
   candidates, a ballot, a receipt that says "You voted" and nothing about whom), **Quiz** (one question, a score reveal).
7. **Proof, honestly.** The live Kitchen poll embedded (the real Hub, real counts, a link to join). No testimonials, logos or
   statistics unless real and approved.
8. **Pricing teaser.** Three cards (Free, Creator Plus, Hub plans) from the plan map, link to `/pricing`.
9. **FAQ** (anonymity, who can see what, what free includes, cancelling, Discord), then a closing band with the second
   headline line and the primary button, then the footer.

**Performance budget (landing):** Largest Contentful Paint under 2.5 s on a mid-range phone on 4G; layout shift under 0.1;
initial JavaScript for `/` kept to what it is today plus the demo island (lazy-loaded after first paint); images are SVG;
fonts already self-hosted. Lighthouse mobile performance 90 or better (the audit in week 1 sets the baseline).

## 6. The key screens in more detail

- **Player.** One question per screen on phones, big tappable choices with the amber selection, a thin progress ribbon, a
  collapsible **"Who sees my answer"** panel written from the server's notice (C1) with the two-pane picture, a calm
  autosave state, and a thank-you that offers the next action (see results if shared, join the Hub, make your own). The
  creator's branding (colour, gradient, logo) frames the player, never the app chrome.
- **Results.** Data palette, animated counters, per-question cards with a chart and a table alternative, withheld cells as
  closed bubbles with a one-line reason, a "Publish to members" action beside "Export", and a Present button. Breakdown
  selectors appear as a segmented control with a lock and unlock note for lower plans.
- **Present.** A stage: the question on the left, a live bar race on the right, the join code and QR in a corner, a big count
  of people, reveal animation on close. Quiz variant shows the correct answer with a flourish. Election night reveals by office.
- **Creator dashboard.** Top: greeting, plan card (name, one line of what it unlocks), usage meters. Middle: "Continue
  where you left off" (drafts), then "Your surveys" as cards with a tiny live sparkline of answers (counts only), then
  "Start something" tiles (survey, quiz, poll, election, Hub). A sidebar with Library, Templates, Trends, Decisions, Branding,
  Plan and billing. Locked items show a small lock and a sentence.
- **Hub page and card (restyle only).** Same structure. New: presence dot and "N here now" (E2), role colours, topic tags
  as chips, the "What we decided" card, motion on join, Hub accent used for selection and charts inside the Hub.
- **Decisions.** A timeline page like an issue tracker: status chip, who and when, the evidence snapshot as a compact chart, the
  "Preview as a member" toggle for managers, reactions and comments.
- **Discover.** Cards with the Hub's identity, member and online counts, tags, a Join button; search and filters in a calm bar.
- **Empty, loading, error and locked states** are designed once as shared components with an illustration from T-7 and
  one sentence plus one button.

## 7. Content and copy tasks in week 4 (the "honest copy" pass)

1. Creator Plus and Pro feature lists: remove "Trends, results charts, new question types and templates: coming soon"
   (they exist) and list what the plans actually include (approved perks only, `01_` section 4).
2. Team Hub card: replace "Advanced analytics" and "Enhanced Campaign modes" with the concrete items from C4, D1, D2, D4 that
   passed G3; anything cut at G3 is not mentioned.
3. Remove "Coming with billing" on the Hub creation plan chooser once billing opens; before that the text stays honest.
4. Replace every legal placeholder with the reviewed text (S-73), or keep billing closed.
5. Vocabulary: **Hub**, **Campaign** (the umbrella), **survey / poll / election / quiz** (what people see); one sentence in the
   product that defines each; "Discord is for talking. LunchVoice is for deciding." appears on the landing, `/products/discord`
   (if present) and the Discord bot's description.
6. Accessibility statement page (S-74) written from the week-4 audit.
7. Brand leftovers: the Discord banner redone from the source and the bot avatar uploaded (founder), the headline test
   measured (G5), the favicon contrast check.

## 8. The design track in weeks 1 to 3 (so week 4 is application, not invention)

The Design agent works in Figma through the Figma MCP (frames are reference only; **tokens live in `tokens.css` and nowhere
else**: the design-system rule stands) and in `DESIGN_EXTENSIONS.md`:

| Week | Deliverable |
| --- | --- |
| 1 | Audit screenshots of the live site at 375, 768, 1440 in all three themes; moodboard; one-page principles (this file's section 2) confirmed with the founder; landing storyboard frames |
| 2 | Frames: landing, Player, Results, Present, creator dashboard, Decisions; interactive prototypes of the hero poll and the anonymity slider (HTML in a scratch folder, not in `src/`) so motion is judged before it is built; illustration SVGs started |
| 3 | Token proposals T-1 to T-7 as a change list with before/after swatches; final frames; illustration set complete; copy v1 frozen Wed 12-02; asset hand-off folder `docs/frontend/design-system/week4-handoff/` (frames list, SVGs, motion spec, copy deck) |

## 9. The week, day by day

| Day | Work | Evidence at end of day |
| --- | --- | --- |
| Mon 12-07 | Apply approved tokens, type scale, motion tokens; restyle the shadcn layer; shell (header, footer, creator sidebar); icon pass | Gallery (`/__gallery`) updated and screenshotted in three themes |
| Tue 12-08 | Landing and pricing and templates; the three demo islands (hero poll, anonymity slider, mini demos) | Before and after captures at 390, 768, 1280; Lighthouse mobile |
| Wed 12-09 | Player and results and Present; **founder checkpoint at noon** (captures of landing, player, results, dashboard); fixes | Founder's written yes or list of changes |
| Thu 12-10 | Creator dashboard, Hub restyle, Decisions, Discover; copy pass (section 7); empty and error states; Tier B sweep | Route-by-route captures; copy deck ticked |
| Fri 12-11 | Accessibility (keyboard, screen reader labels, contrast in all three themes, reduced motion), performance, e2e updates, final captures; **G4 go or no-go** | Accessibility and performance report; e2e green; go or no-go minutes |

## 10. Acceptance (G4, UI part)

1. Every route in the route registry renders at 390, 768 and 1280 in light, dark and high contrast with no horizontal scroll.
2. Keyboard-only walk of: sign in, make a survey, publish, answer, read results, publish to members, record a decision,
   buy a plan. Screen-reader labels on all interactive demos; every chart has a table alternative.
3. `check:design` and `check:brand` pass; `LvMark` is the only logo in the UI; no raw colours outside tokens.
4. Lighthouse mobile on `/`, `/pricing`, `/templates` and the Player: performance 90 or better, accessibility 95 or better.
5. e2e suite green; the launch plan UI gate (8 routes, 3 themes, 3 widths) green.
6. Founder's written approval of the landing, player, results and dashboard on Wed 12-09 and again on Fri 12-11.
7. No "coming soon" next to a paid claim; no invented number, logo or testimonial anywhere.

## 11a. The auth screens are part of week 4 (founder, 2026-11-14)

Every screen a person meets while signing in, signing up and managing how they sign in is a **Tier A** surface and is redesigned in week 4 with the new tokens, motion and the 500-site Atlas patterns:

- `/signin` (Google, Discord, email, forgot password, reset, check-your-inbox), the sign-up states and the legacy-account link;
- `/signin/username` (the one-time username and display-name step) and the **link prompt** that offers to link an existing account (spec A9);
- Account settings **Sign-in methods** (spec A8) and the account-link confirmations;
- the **emails** Supabase sends (confirm, reset, magic) restyled to the brand with the real support address;
- the Google consent screen and the Discord application page (logo, name, descriptions) set from the brand kit;
- error, loading and locked states of all of the above, 390 and 1440 px, three themes, keyboard and screen reader.

They are functional before week 4 (built behind the beta switch) so week 4 restyles working screens.

## 12. Upgrade what exists today (the founder's rule: no leftovers)

The founder looked at the live creator screens on 2026-11-14 and does not want to see the same quality after four weeks. Two screens already
show what "unfinished" means (F, from the founder's screenshots):

- **Survey editor** (`/surveys/:id`): the six header actions (Preview, Share, Pause, Close, Archive, Results) wrap onto two uneven rows; the Title and
  Description inputs are grey fills that read as disabled; a long stack of full-width cards with the live preview squeezed into a narrow column;
  Branding feels like a settings form, not a design tool.
- **My home** (`/me`): three stat tiles (black, amber, white) stack edge to edge with no gaps and read as one block; a heavy black "Create your Hub"
  banner dominates even for a person who already owns a Hub; test content sits in the survey list; the page is narrower than the editor, so
  widths jump between pages.

**Therefore Tier B is not "inherit and hope".** The rules for week 4:

1. **`UPGRADE_LEDGER.md` lists all 63 routes.** The Design agent audits each in week 1 (before captures at 390, 768 and 1280, light and dark, and a defect list). A route is
   finished only when it is on the new look *completely* and has an after capture.
2. **Shared patterns first (UI-5, Monday of week 4), then routes.** Build once, apply everywhere: a **page header** (title, status, one or two primary actions, an overflow menu for the
   rest, never wrapping); a **stat grid** with real gutters and one hierarchy; **form fields** (filled, bordered and clearly editable, with visible focus); **section cards** with a
   consistent rhythm; **two-column editors** with a sticky preview; one **container width** per page type; **empty, error, loading and locked states**.
3. **Specific rebuilds** of what the screenshots show: the survey editor becomes a three-region studio (outline, canvas, live phone preview) with Branding as a design panel and a sticky preview;
   My home becomes a dashboard (G6) with a plan card, usage meters and a "Create your Hub" prompt that appears only when the person has no Hub and a credit to use.
4. **No route ships unreviewed.** The founder walks the ledger on Wed 12-09 and Fri 12-11; a route with open defects blocks G4 unless the founder moves it to V2.1 in writing.
5. **Test content never appears in anything a person sees.** Seed and test data are filtered at the source (the founder's own `[TEST]` surveys are archived by the founder, not hidden by code).

## 13. The 500-site design hunt

`docs/frontend/design-research/SAAS_SITE_HUNT_PLAN.md`: 500 SaaS sites captured at phone and desktop width, scored on a 12-point rubric and tagged,
synthesised into a **Pattern Atlas** and a shortlist of **40 patterns** for the founder to approve (Fri of week 2), then applied to the landing page and the screens inside the app. Patterns and
principles only, never copy, assets or code. Credits for the capture are approved by the founder after a 25-site pilot. Components come from shadcn and similar MIT-licensed copy-in sources
(section 6 of that plan); every addition passes the bundle and design checks.

## 14. Tracking this week

UI items are rows UI-1 to UI-8 in `TRACKER.md`. Every UI agent writes the changelog entry in the Work Tracking Protocol format, with before and after capture names for each ledger route it closes.

## 11. Risks and fallbacks

| Risk | Fallback |
| --- | --- |
| Behind by Thursday noon | Tier A only: landing, player, results, dashboard, pricing; Tier B stays token-restyled; nothing half-restyled is merged (a route is either on the new look or fully on the old) |
| An approved token breaks contrast in high-contrast theme | The token reverts to its current value for that theme; the validator output is the evidence |
| A demo island hurts performance | Lazy-load below the fold and ship the static illustration version |
| The founder wants a different direction late | The direction is approved by Wed 12-02 in writing; later changes go to V2.1 unless they are blockers |
