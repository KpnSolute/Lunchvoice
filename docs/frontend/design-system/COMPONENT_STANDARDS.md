# Component standards

Rules every visible change follows, and the specification every new reusable component needs. The values come from
`src/ui/tokens.css`; this file says how to use them.

## Rules for all UI work

**Tokens, never literals.** Colours, radii, spacing, type, shadows and durations come from `--lv-*` tokens. A hex value,
a pixel radius or a millisecond duration in page CSS means a token is missing (see `DESIGN_EXTENSIONS.md`). The only
literals allowed are inside `src/ui/tokens.css` itself and the fixed landing bands documented in `src/styles/landing.css`.

**Reuse first.** Search the component map in `README.md` and `src/components/shadcn/blocks/index.tsx` before writing a
component. Extend with a variant or prop before adding a sibling.

**Where code goes.**
- Tailwind utilities only work inside `src/components/shadcn/` (the one folder Tailwind scans; preflight is off). A
  component built from Tailwind classes lives there. Elsewhere, use plain CSS classes in `src/ui/*.css` or
  `src/styles/*.css` with `--lv-*` tokens.
- Primitives and generic blocks: `src/components/shadcn/` and `src/components/shadcn/blocks/`.
- Product components (Hub card, share dialog, badges, checkout): `src/components/`.
- Layout pieces (Hub header, bottom tabs, state screens): `src/ui/`.
- New CSS for a component goes in the stylesheet of its area (`src/ui/hub.css`, `src/ui/app.css`, `src/ui/ui.css`),
  never in a new global reset.

**Hierarchy.**
- One amber `primary` action per screen. Secondary, ink and quiet buttons are flat.
- Labels in the UI font, sentence case (`tactile-label`, `Eyebrow`). Space Mono only for codes, addresses and numbers.
- Badges: words for states (`Badge`, `PhaseBadge`); icons with a meaning (`IconBadge`) only when data earns them.
- Selected app controls use the tint and outline (`surface-selected`); solid amber is for answer choices and status.

**States.** Every interactive element has hover, focus-visible (2px `--lv-focus` outline), active (the
`tactile-press` squash) and disabled (neutral grey, never faded amber). Data views have loading (`LoadingRows`,
`Skeleton`), empty (`EmptyState` with one next step), error (`Notice tone="error"` with the cause and what to do) and,
for analytics, **withheld** states that are never shown as zero.

**Size and touch.** 44px minimum (`--lv-target-min`) for anything a finger hits on public pages and the respondent
flow; app-dense controls may use `sm` (36px) only where a 44px alternative exists on phones. No text below 12px
(`--lv-text-min`).

**Themes.** Light, dark and high contrast must all work. Use tokens and they will; check the gallery's theme switch.
High contrast replaces shadows with borders: never rely on a shadow alone to show a boundary or a state.

**Motion.** `--lv-ease-spring` with `--lv-dur-press` for presses, `--lv-ease-out` for entrances. Motion answers a
person's action; one orchestrated moment per page at most. `prefers-reduced-motion` zeroes the durations in tokens.css,
so durations must come from tokens.

**Accessibility.** Real elements (`button`, `a`, `label`), names on icon-only controls, `aria-live` for things that
change on their own, colour never the only signal (icon, text or shape too), focus order that follows the layout, 4.5:1
text contrast (`--lv-accent-text` for amber text), every chart with an accessible table.

**Responsive.** Mobile first. No horizontal page scroll at 360px. Phones get the bottom tabs and stacked actions;
wide tables become per-row cards or a picker (see the pricing compare table).

**Privacy and honesty.** Suppressed or withheld results are their own labelled state. No invented numbers,
testimonials or badges. Anything illustrative is labelled "Sample data" or "Example".

## Specification for a new reusable component

Copy this into the pull request (or `DESIGN_EXTENSIONS.md` for anything foundational) before building:

```md
### <ComponentName>
- Purpose and use cases:
- Existing alternatives evaluated (and why they do not fit):
- Location: src/components/... | src/components/shadcn/... | src/ui/...
- Public props and TypeScript types:
- Variants and sizes:
- Tokens used:
- States: hover / focus-visible / active / disabled; loading / empty / error where they apply
- Mobile behaviour (360px):
- Keyboard and screen reader:
- Light / dark / high contrast:
- Reduced motion:
- Example usage:
- Tests: unit (pure logic), e2e (behaviour, themes, widths), gallery entry
```

## Definition of done for a component

1. Uses only `--lv-*` tokens and existing utilities; no new global reset or font.
2. Exported from its file with typed props; pure logic (formatting, rules) in `src/lib/*.ts` with a unit test.
3. Shown at `/__gallery` in its main states (`npm run check:design` enforces presence).
4. Covered by an e2e test where it has behaviour; added to the theme-and-width gate in `e2e/sitecta.test.mjs` if it is
   a new page.
5. Documented: a row in the component map (`README.md`) when it is reusable.
6. `npm run test:pr` and `npm run test:e2e` pass; `CHANGELOG.md` updated in the same commit.
