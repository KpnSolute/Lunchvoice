---
name: design-system
description: Follow LunchVoice's design system on every visible UI change in this repository. Use whenever you create, edit, restyle or review anything a person sees (pages, components, CSS, icons, copy layout, themes, responsive behaviour), including small fixes. Finds the existing tokens in src/ui/tokens.css and the existing components before anything new is written. Not needed for backend, SQL, Edge Function or infrastructure-only work.
---

# LunchVoice design system

You are working inside LunchVoice's one design system. Your job is to make the change look like it was always part of
the product: same tokens, same components, same states, in light, dark and high contrast.

## Before you write UI

1. Read `docs/frontend/design-system/README.md` (source order, identity, token map, component map). For any rule you
   are unsure about, `docs/frontend/design-system/COMPONENT_STANDARDS.md`.
2. Open `src/ui/tokens.css`. It is the only token registry. Use `--lv-*` names; never a hex, pixel radius, shadow or
   duration literal in page CSS.
3. Find what already exists for your need: the component map in the README,
   `src/components/shadcn/blocks/index.tsx`, `src/components/`, `src/ui/`, and `/__gallery` (`src/pages/Gallery.tsx`).
   Search: `grep -rn "export function" src/components src/ui`.
4. Read the page or component you are changing, and match its register: expressive public pages (`/`, pricing,
   use cases, sign-in) or calm app pages (account, Hub workspace, Studio, results). The respondent player stays bold
   and lively.

## While you build

- Reuse, then extend with a variant or prop, then compose. Only a genuinely new reusable element or rule goes through
  the `design-element-authoring` skill.
- One amber `primary` action per screen; other buttons are `secondary`, `ink` or `quiet`.
- Labels in the UI font, sentence case. Space Mono only for codes, addresses and numbers. Nothing under 12px.
- 44px targets on public pages and the respondent flow; visible focus; real buttons and links; names on icon buttons.
- States: hover, focus-visible, pressed, disabled (neutral grey), loading, empty with one next step, error with a
  cause; analytics withheld states are labelled, never zero.
- Tailwind classes only inside `src/components/shadcn/` (the one scanned folder; preflight stays off). Elsewhere, CSS
  classes in the area's stylesheet (`src/ui/hub.css`, `src/ui/app.css`, `src/ui/ui.css`, `src/styles/landing.css`).
- Inside a Hub, the Hub's colour arrives through `.lv-hubscope`; never hard-code a Hub colour.
- Icons from `src/components/Icon.tsx` only; the logo is `LvMark`; no emoji as UI; no generic blue or purple SaaS look.

## Never without founder approval

New colours, fonts, radii, shadows, durations or breakpoints; changing a token's value; changing the logo or a rule in
`DESIGN.md`; a second token file. If you need one, stop and use `design-element-authoring` to write the proposal.

## Before you finish

- Check light, dark and high contrast, and 390 / 768 / 1280 widths (the gallery has a theme switch; Playwright is
  installed). Take a screenshot and look at it.
- `npm run check:design` (gallery registration and skill sync), `npm run test:pr`, and `npm run test:e2e` for anything
  with behaviour. Add new pages to the "launch plan UI gate" test in `e2e/sitecta.test.mjs`.
- Report any disagreement you found between `DESIGN.md` and `tokens.css` instead of fixing one side silently.
- Update `CHANGELOG.md`; add a component-map row in the README if you added something reusable.
