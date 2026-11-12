# Handoff: UI after design system 3 (2026-11-12)

For the separate UI agent the founder asked for. Read `AGENTS.md`, `DESIGN.md`, `PRODUCT.md`,
`docs/v2/PRODUCT_DIRECTION_2026-11-11.md` and `docs/v2/V2_STATUS_2026-11-12.md` first.

## What is in place

- **Elements** (tokens in `src/ui/tokens.css`, components in `src/components/shadcn/`): flat surfaces with hairlines,
  rounded-rectangle buttons with the springy press, white fields, tinted selected states, sentence-case labels,
  12px floor, 44px targets on public pages, one full-width header. Rules: `DESIGN.md`, "Design system 3".
- **Hub identity:** `src/ui/HubProfile.tsx`, `src/components/HubCard.tsx`, `src/components/ShareHub.tsx`,
  styles in `src/ui/hub.css`. Share links are `lunchvoice.com/h/<slug>`; previews come from `workers/hub-card`.
- **Badges:** `src/config/badges.ts` and `src/components/IconBadge.tsx`. One icon, one meaning, a tooltip and an
  accessible label each; shown only when data earns them.
- **Billing-driven calls to action:** `src/lib/billingState.ts` is the only place that decides CTA wording.

## Founder feedback still open

1. "The UI still needs polishing" in general: spacing rhythm, alignment and proximity across pages. Start with the
   Hub workspace (overview tiles, rail, the share card in the right column, which now duplicates the header's Share)
   and the Campaign Studio.
2. Badges: keep proximity tight (badge 6-8px from the name, centred on the cap height) and tooltips left-aligned with
   the label over the meaning. Add more badges only with real data behind them (for example staff, founding member,
   verified identity), each with a one-sentence meaning in `BADGES`.
3. The Hub card should match a Discord server card more closely once the backend sends `online`, `tags` and
   `created_at` (requested in `API_CONTRACT.md`).
4. The warmer page background (Cream) is still a proposal; do not merge it without founder approval.

## Rules

- Change tokens and components, not page CSS. A page that needs its own colour, radius or size is a missing token.
- Light, dark and high contrast must pass `e2e/sitecta.test.mjs` "launch plan UI gate"; add routes to it as you touch them.
- The respondent player keeps its bold amber answer choices and motion; it is the lively heart of the product.
- No invented numbers, testimonials or badges. Suppressed or withheld results are never shown as zero.
- `npm run test:pr` and `npm run test:e2e` before every push; update `CHANGELOG.md` in the same commit.
