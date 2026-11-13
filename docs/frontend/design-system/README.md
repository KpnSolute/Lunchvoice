# LunchVoice design system: the agent reference

This folder is the shared design guidance for every agent and person working on LunchVoice's UI. The native skills in
`.claude/skills/` (Claude Code) and `.agents/skills/` (Codex) are thin entry points that send agents here, so there is
one source of guidance, not one per tool.

| File | Read it when |
| --- | --- |
| [README.md](README.md) (this file) | Always: the source order, the identity, the token map, the component map |
| [COMPONENT_STANDARDS.md](COMPONENT_STANDARDS.md) | Building or changing any visible UI; the spec every new component needs |
| [DESIGN_EXTENSIONS.md](DESIGN_EXTENSIONS.md) | Something genuinely new is needed: a component, a token or a global rule |
| [AGENT_WORKFLOW.md](AGENT_WORKFLOW.md) | How the skills are invoked, kept in sync and verified, on both platforms |

## Canonical source order

When two sources disagree, the higher one is the implementation truth. Report the disagreement; do not quietly
"fix" either side.

1. **`src/ui/tokens.css`**: the only token registry. Colour, type, radius, spacing, motion, targets; light, dark and
   high contrast.
2. **`DESIGN.md`**: approved principles and the design system 3 rules (2026-11-12).
3. **Existing components and theme mappings**: `src/components/shadcn/` (primitives and blocks),
   `src/components/*.tsx` (product components), `src/ui/*.tsx` (layout pieces), `src/ui/shadcn.css` (shadcn variables
   mapped onto `--lv-*`), `src/ui/theme.ts` (theme switching).
4. **Product and architecture specs**: `PRODUCT.md`, `docs/frontend/FRONTEND.md`, `docs/v2/`.
5. **Approved extensions**: recorded in `DESIGN_EXTENSIONS.md` and `CHANGELOG.md`.

There is no second token file, no JSON token export and no design-tool sync. Do not create one.

## The identity (do not change without founder approval)

| | Value | Token |
| --- | --- | --- |
| Amber (the one strong colour; fills, icons, the primary action) | `#FF9A18` | `--lv-accent` |
| Amber for text on light surfaces (AA) | `#8F4A00` | `--lv-accent-text` |
| Ink | `#14110F` | `--lv-text`, `--lv-primary` |
| Bone (text on ink) | `#F7F3EA` | `--lv-on-primary` |
| Page | `#EEEDEA` | `--lv-page` |
| Surface | `#FFFFFF` | `--lv-surface` |
| Display type | Bricolage Grotesque | `--lv-font-display` |
| UI type | Geist | `--lv-font-ui` |
| Data type (codes, addresses, numbers only) | Space Mono | `--lv-font-mono` |

Two registers: **expressive public pages** (`/`, `/pricing`, `/use-cases`, sign-in: big display type, ink and amber
bands, mono eyebrows) over **calm, legible app pages** (account, Hub workspace, Studio, results: flat surfaces,
sentence-case labels). The respondent player is the lively heart: bold amber answer choices and springy motion.

Never: generic blue or purple SaaS styling, new fonts, new radii, new shadow systems, new animation timings, gradients
on controls, emoji as UI, invented numbers or testimonials, the logo recoloured or rebuilt (use `LvMark`).

## Token map (`src/ui/tokens.css`)

| Role | Tokens |
| --- | --- |
| Surfaces | `--lv-page`, `--lv-surface`, `--lv-surface2`, `--lv-well`, `--lv-popover`, `--lv-line` |
| Text | `--lv-text`, `--lv-muted`, `--lv-subtle`, `--lv-accent-text`, `--lv-on-primary`, `--lv-on-accent` |
| Brand and status | `--lv-accent`, `--lv-accent-deep`, `--lv-accent-light`, `--lv-success`, `--lv-success-ink`, `--lv-danger`, `--lv-danger-ink` |
| Elevation | `--lv-raised-shadow`, `--lv-card-shadow`, `--lv-popover-shadow`, `--lv-well-shadow`, `--lv-cta-shadow` |
| States | `--lv-selected-bg`, `--lv-selected-ring`, `--lv-field-bg`, `--lv-field-ring`, `--lv-pressed-bg`, `--lv-focus` |
| Radius | `--lv-radius-control` 12, `--lv-radius-field` 12, `--lv-radius-card` 18, `--lv-radius-hero` 22, `--lv-radius-tag` 8, `--lv-radius-pill` |
| Space (4px base) | `--lv-space-1` … `--lv-space-14` |
| Type | `--lv-font-display`, `--lv-font-ui`, `--lv-font-mono`, `--lv-text-min` (12px floor) |
| Motion | `--lv-ease-spring`, `--lv-ease-out`, `--lv-dur-press`, `--lv-dur-toggle`, `--lv-dur-popover`, `--lv-dur-jelly`, `--lv-dur-enter` |
| Targets | `--lv-target-min` (44px), `--lv-circle-control`, `--lv-header-clear` |

Themes: `[data-theme='dark']` and `[data-theme='hc']` on `<html>` redefine the same names (`src/ui/theme.ts` sets the
attribute). Inside a Hub, `.lv-hubscope` maps the Hub's own colour onto `--lv-accent` and the selected tint
(`src/ui/app.css`).

Utilities in `src/ui/shadcn.css` (usable only inside `src/components/shadcn/`, which is the one folder Tailwind scans):
`surface-raised`, `surface-card`, `surface-well`, `surface-field`, `surface-selected`, `surface-pressed`,
`surface-ink`, `surface-cta`, `surface-pop`, `surface-danger`, `tactile-press`, `tactile-focus`, `tactile-label`.

### Known inconsistencies (recorded 2026-11-12, not yet resolved)

| Where | What | Resolution |
| --- | --- | --- |
| `src/ui/motion.css` | A second duration scale, `--lv-d1/2/3` (150/260/460ms), next to `--lv-dur-*` in tokens.css | Founder decision: fold into tokens.css or keep as the player's motion scale. Until then, use `--lv-dur-*` for new work and `--lv-d*` only inside the player |
| `src/index.css` | Legacy aliases (`--ink`, `--muted`, `--cta-shadow` with the old glow) for the pre-shadcn `.btn` classes | Do not use in new code; remove once nothing references them |
| `src/components/ui.tsx` | Older wrappers (`Card`, `Notice`, `Metric`, `CopyField`, `PhaseBadge`, `Tabs`, `Pill`) around the shadcn blocks | Keep for existing callers; new code imports from `@/components/shadcn/blocks` |

## Component map (look here before building anything)

| Need | Use | File |
| --- | --- | --- |
| Button, link button | `Button` (`primary`, `secondary`, `ink`, `quiet`, `danger`; `sm`, `md`, `lg`, `icon*`), `LinkButton` | `shadcn/button.tsx`, `components/ui.tsx` |
| Card, panel | `Card` (`card`, `ink`, `well`, `accent`) | `shadcn/card.tsx` |
| Page header, section title, eyebrow | `PageHeader`, `SectionTitle`, `Eyebrow` | `shadcn/blocks` |
| Form field, toggle row | `Field`, `ToggleRow`, `Input`, `Textarea`, `Select`, `Switch`, `Checkbox`, `RadioCard`, `Segmented` | `shadcn/*`, `shadcn/blocks` |
| Status | `Badge` (text), `PhaseBadge` (Campaign phase), `IconBadge` / `BadgeRow` (meaning badges) | `shadcn/badge.tsx`, `shadcn/blocks`, `components/IconBadge.tsx` |
| Numbers | `StatTile`, `Metric`, `QuotaMeter`, `Progress` | `shadcn/blocks`, `shadcn/progress.tsx` |
| Lists, tables | `RowList` / `RowItem`, `Table` | `shadcn/blocks`, `shadcn/table.tsx` |
| Feedback and states | `Notice`, `EmptyState`, `LoadingRows`, `Skeleton`, `StateScreen`, toasts (`sonner`) | `shadcn/blocks`, `ui/StateScreen.tsx` |
| Disabled with a reason | `DisabledAction` | `shadcn/blocks` |
| Destructive confirm | `TypedConfirm`, `AlertDialog` | `shadcn/blocks`, `shadcn/alert-dialog.tsx` |
| Overlays | `Dialog`, `Sheet`, `Popover`, `DropdownMenu`, `Tooltip` (`arrow` prop) | `shadcn/*` |
| Navigation | `NavTabs`, `Tabs`, `BottomTabs` (phones), the Hub rail | `shadcn/blocks`, `shadcn/tabs.tsx`, `ui/BottomTabs.tsx`, `pages/Hub.tsx` |
| Hub identity | `HubProfile`, `HubCard`, `HubMark`, `ShareHubDialog` | `ui/HubProfile.tsx`, `components/HubCard.tsx`, `ui/HubMark.tsx`, `components/ShareHub.tsx` |
| Brand | `LvMark` (theme-aware logo, same geometry as the brand kit's master), `MadeBy` | `components/LvMark.tsx`, `components/MakerMark.tsx`; exports and guidelines in `brand/lv-package/` |
| Icons | `Icon` (one inline-SVG set, 24px grid, 1.75 stroke) | `components/Icon.tsx` |
| Charts and results | result blocks, charts with an accessible table and a withheld state | `shadcn/blocks/results.tsx`, `components/charts.tsx` |
| Survey controls | `QuestionInput` (rating, choice, yes/no, text) | `ui/QuestionControls.tsx` |
| QR | `QrCode` | `shadcn/blocks/qr.tsx` |
| Creator studio (Creator Plus): question rail, answer tiles (shape and colour) | `StudioRail`, `AnswerTile`, `KindGlyph`; `QuestionWorkbench layout="pro"` | `ui/StudioRail.tsx`, `pages/QuestionWorkbench.tsx`, helpers in `lib/studio.ts` |
| Live results on a projector | `PresentMode` (opened by **Present** on Results; one question per slide, keys, polling, withheld messages) | `ui/PresentMode.tsx`, helpers in `lib/present.ts` |

Every reusable component is shown at `/__gallery` (dev builds only; `src/pages/Gallery.tsx`). `npm run check:design`
fails if a reusable component is missing from it.
