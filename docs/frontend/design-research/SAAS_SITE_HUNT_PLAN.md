# The SaaS design hunt: 500 sites, one pattern atlas

Founder direction 2026-11-14: hunt 500 SaaS websites, study their UI and design, and use what works to make LunchVoice's
landing page and inside screens world class. This file is the plan the Design agent (weeks 1 to 2) follows. It feeds the 40
chosen patterns, the token proposals T-1 to T-7 (`docs/v2/launch-roadmap/05_WEEK4_UI_UX_REDESIGN.md`) and the upgrade ledger.

## 1. What we take and what we never take

We take **patterns and principles**: how a hero proves a product in five seconds, how pricing is laid out, how a dashboard
organises a hundred things, how motion explains a state, how an empty screen teaches. We never take: copy, logos,
illustrations, icons, photography, code, brand colours as a set, or a distinctive layout as a whole. The output of this
research is original LunchVoice design (identity fixed: amber, ink, bone, Bricolage, Geist, Space Mono, the LV mark).

Rules for the research itself: public pages only; no sign-in, no account creation, no trials on anyone's product; respect each
site's published terms and robots rules; record the URL and the capture date; keep captures internal (gitignored folder
`docs/frontend/design-research/captures/`, optionally mirrored to the founder's Drive); quote nothing beyond a few words; never
claim a competitor feature we did not see on the live page (company worker playbook).

## 2. The 500 (sample frame)

The Design agent builds the list as `sites.csv` (columns: id, name, url, category, why_included, source_of_discovery) from public
directories, "best SaaS landing page" galleries, award lists, comparison articles and Firecrawl searches. The mix is fixed so the
atlas is balanced:

| Category | Count | Why it matters to LunchVoice |
| --- | --- | --- |
| Surveys, forms and polling | 40 | Direct competitors and the best of their category |
| Live and classroom engagement (quiz, presentation, Q and A) | 40 | Kahoot-style energy, join flows, presenter screens |
| Community and social platforms | 60 | Hub pages, profiles, presence, notifications, Discord-adjacent warmth |
| Creator and prosumer tools | 50 | Solo creator dashboards, templates, brand kits |
| Developer and infrastructure | 60 | Trust, docs, pricing clarity, dark-mode craft, API pages |
| Productivity and collaboration | 60 | Dense app shells, command menus, empty states |
| Analytics and BI | 40 | Charts, tables, filters, privacy-aware reporting |
| Fintech and billing | 40 | Checkout, plan pages, receipts, trust cues for paying |
| AI-era and modern product launches | 50 | Current motion, interactive heroes, bold type |
| Events, marketing and e-commerce apps | 30 | Conversion patterns, share cards, onboarding |
| Education and nonprofit | 30 | Accessible, friendly, simple |

Include well-known leaders **and** small, unusually well-designed sites (at least 100 sites outside the top 1,000 by traffic)
so the atlas is not only what everyone already copies.

## 3. What is captured per site

For each site, at **390 px** (phone) and **1440 px** (desktop), through Firecrawl's scrape with screenshot and branding formats:
the landing page; the pricing page; one product or feature page; a public demo or tour page when one exists (for inside-the-app
patterns we use only what the site itself publishes). Stored: the screenshot file name, the Firecrawl branding data (colours,
fonts, spacing), the page title, and the date. Pilot of 25 sites first to measure credits and failures; the full run goes in
batches of 50.

**Cost control (founder approval before the full run).** Firecrawl is a billed service. The pilot reports credits per site;
the Design agent multiplies by 500 sites by 2 viewports by 3 pages, shows the total, and the founder approves the figure or
trims the list. Nothing else in this plan costs money.

## 4. The rubric (scored 1 to 5 by the annotating agents)

1. **Five-second clarity**: do you know what it is and who it is for?
2. **Product in the hero**: is the product shown working, not described?
3. **Interaction**: can you do something on the page?
4. **Motion with meaning**: does movement explain, or only decorate?
5. **Type personality**: does the type carry the brand?
6. **Colour confidence**: bold and controlled, or timid or noisy?
7. **Density and rhythm**: spacing, hierarchy, scannability.
8. **Trust cues**: proof, security, privacy, real numbers.
9. **Pricing clarity**: can you tell what you get for what you pay?
10. **Mobile quality**: does it feel designed for the phone, not squeezed?
11. **Accessibility signals**: contrast, focus, text size, reduced motion (by eye and, for the top 100, by an automated audit).
12. **Performance feel**: how fast it shows something (Lighthouse for the top 100).

Each site also gets **pattern tags** from a controlled vocabulary: hero (product-demo, big-type, illustration, video, interactive,
split), navigation (top, sidebar, command menu), pricing (cards, toggle, comparison table, calculator, per-seat), social proof (logos,
numbers, quotes, live data), onboarding (checklist, empty-state tutorial, sample data), dashboard (sidebar shell, top shell, cards,
table-first), data visualisation style, empty-state style, form style, motion style (scroll-linked, hover, spring, none), dark-mode
quality, density (calm, balanced, dense). Annotation is bounded, parallel work for lower-cost agents (CLAUDE.md "Local CLI
Delegation": a narrow prompt, a fixed output schema, one retry) and is reviewed by the Design agent on a 10% sample.

## 5. Synthesis: the Pattern Atlas

The Design agent writes `docs/frontend/design-research/PATTERN_ATLAS.md`:

1. Frequency of each tag, and the same among the top quartile by rubric score (what the best do that the rest do not).
2. For each LunchVoice surface (landing sections, pricing, templates, player, results, Present mode, creator dashboard, studio,
   Hub page, Hub console, Decisions, Discover, billing, account, admin, empty and error states), the **three strongest patterns**
   with: what it is, why it works, our adaptation in LunchVoice's identity, what we will not copy.
3. The **40 chosen patterns** shortlist for the founder (Fri of week 2), each mapped to ledger routes.
4. A 60-reference moodboard as a list of links with one line each (no images in the repository).
5. Revised token proposals T-1 to T-7 if the research changes them.

## 6. Component sources (the "shadcn and more" integration)

LunchVoice already runs shadcn/ui (30 primitives in `src/components/shadcn/`, style `radix-nova`, Radix, Lucide icons, Recharts, Sonner,
`tw-animate-css`). The design track evaluates what to add, and week 4 adds only what the Atlas justifies:

| Need | Candidate (MIT or equivalent) | Notes |
| --- | --- | --- |
| App shell, sidebar, breadcrumbs | shadcn `sidebar`, `breadcrumb` | For the creator dashboard and Hub console |
| Command menu | shadcn `command` (cmdk) | Ctrl or Cmd+K, planned in the product direction |
| Mobile sheets | shadcn `drawer` (vaul) | Phone studio panels |
| Charts | shadcn `chart` wrapper over Recharts (already a dependency) | Keeps one chart system and the data palette |
| Dates, ranges | shadcn `calendar` and a date-range picker | Analytics date range (C4) |
| Tables | shadcn `table` plus a headless table for sorting and filtering | Analytics and admin |
| Motion | `motion` (the framer-motion successor, MIT) or the existing `motion.tsx` | Only if the spring and stagger tokens (T-6) cannot be met with CSS |
| Carousels, toggles, hover cards, context menus, resizable panels | shadcn `carousel`, `toggle-group`, `hover-card`, `context-menu`, `resizable` | As the Atlas needs them |
| Animated marketing pieces | Copy-in patterns from open component collections whose licence permits it | Each pattern is rewritten to our tokens; the licence and source are recorded in the changelog |

Rules: copy-in components (the shadcn model) rather than heavy runtime packages; licences MIT or Apache 2.0 only; every new
dependency is exact-pinned and in the lockfile; `npm run check:bundle` and the performance budget in `05_` must still pass;
documentation is fetched with Context7 (`ctx7`) before use; every added component is registered at `/__gallery` and in the component
map and passes `npm run check:design`.

## 7. Timeline

| When | Work | Output |
| --- | --- | --- |
| Week 1 Mon to Tue | Build the 500-site list; pilot 25; report credits | `sites.csv`, pilot report; **founder approves the credit total** |
| Week 1 Wed to Fri | Capture the remaining sites in batches; start the ledger audit of LunchVoice's own 63 routes | Captures, `UPGRADE_LEDGER.md` defects filled |
| Week 2 Mon to Tue | Annotate (parallel agents); Lighthouse top 100 | Annotated dataset (`dataset.json`) |
| Week 2 Wed to Thu | Pattern Atlas; shortlist of 40 patterns | `PATTERN_ATLAS.md` |
| Week 2 Fri | **Founder reviews the 40 patterns** | Approved shortlist, or edits |
| Week 3 Mon to Wed | Figma frames and prototypes built from the approved patterns; token proposals final | Frames, `DESIGN_EXTENSIONS.md` entries |
| Week 3 Wed (12-02) | **Founder approves tokens and the landing storyboard** | Week 4 can start |

## 8. Acceptance

1. 500 sites listed with the category mix above; at least 450 captured at both viewports (the rest documented as blocked).
2. Every captured site annotated; every rubric score of 1 or 5 has a one-line reason.
3. The Atlas names three patterns for each LunchVoice surface, with "what we will not copy".
4. The founder approves the 40 chosen patterns in writing.
5. No site's copy, logo, illustration or code appears in the repository.
6. The tracker rows UI-1 and UI-2 carry the evidence (changelog heading) and the credit total actually spent.
