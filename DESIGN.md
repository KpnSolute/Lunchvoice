# DESIGN.md — LunchVoice v2

Approved direction: **Hybrid** — an expressive public brand over a calm application.
Visual DNA: ink, amber, bone. The v1 cafeteria layouts are not a reference.

## Implementation status

`src/ui/tokens.css` is the single source of truth for colour, type, radius, spacing and motion, in light, dark and
high-contrast themes. This file and `brand/lv-package/README.txt` describe it; if they ever disagree, the tokens win
and the documents are corrected. The reusable library lives in `src/ui/` and `src/components/shadcn/`, with a
component gallery at `/__gallery` (dev builds only). No page may carry bespoke CSS values for something the tokens or
the library should own.

## Principles

1. **Two registers.** Public surfaces (`/`, pricing, sign-in) use big display type and motion.
   App surfaces (`/me`, Hub, Studio, analytics) use restrained UI type, dense legible layouts.
2. **Accessibility first.** WCAG AA contrast, visible 3px focus ring, full keyboard paths,
   labelled controls, `prefers-reduced-motion`, 44px touch targets on the respondent flow.
3. **Light and dark.** Every token has both values; the app follows the system with a manual
   override.
4. **Mobile-first respondent flow.** The Campaign player is designed at 360px first.
5. **Tenant branding is constrained.** A Hub color is accepted only if text on it reaches
   4.5:1; otherwise the platform color is used. Footer keeps "Powered by LunchVoice".
6. **Suppressed is not zero.** Charts and tables render suppressed and withheld states as
   explicit, labelled states with a text explanation. Every chart has an accessible table.

## Tokens (`src/ui/tokens.css`)

- Surfaces: `--lv-page` (light `#EEEDEA`, a neutral grey), `--lv-surface`, `--lv-surface2`, `--lv-well`, `--lv-line`.
- Text: `--lv-text` (ink `#14110F`), `--lv-muted`, `--lv-subtle`.
- Brand: `--lv-accent` amber `#FF9A18` with `--lv-accent-deep` and `--lv-accent-light` for fills and icons, and
  `--lv-accent-text` for amber **text** (plain `--lv-accent` on a light surface is about 1.8:1 and fails AA).
  `--lv-success`, `--lv-danger`.
- Type: `--lv-font-display` Bricolage Grotesque, `--lv-font-ui` Geist, `--lv-font-mono` Space Mono. Nothing is set
  below `--lv-text-min` (12px).
- Radius `--lv-radius-field/card/hero/pill`; spacing `--lv-space-*` (4px base); motion `--lv-ease-*`, `--lv-dur-*`.
- Targets: `--lv-target-min` 44px for every link and button a finger has to hit, on public pages as well as the
  respondent flow.
- Buttons: one amber primary per screen; secondary, ink and quiet buttons are flat.

## Design system 3 (2026-11-12): the element rebuild

Professional and calm by default, lively where people act. Everything below lives in tokens and the component layer
(`src/components/shadcn/`), so pages follow without their own CSS.

| Element | Rule |
| --- | --- |
| Surfaces | Solid fills, 1px hairline (`--lv-line`), a 1-3px shadow at most. Real shadows only on what floats: menus, dialogs, toasts. No gradients on controls. |
| Buttons | Rounded rectangles (`--lv-radius-control`, 12px). Primary is solid amber with a short, low glow; hover changes colour, never position. Disabled is neutral grey, never faded amber. |
| Press | `tactile-press` keeps the springy squash on every control. This is where the "lively" lives. |
| Fields | White (`--lv-field-bg`) with a hairline; hover darkens the hairline; focus is a 2px ink ring plus an amber halo. |
| Selected | App controls (radio cards, segmented tabs, bottom tabs) use a tint plus an outline (`--lv-selected-*`). The solid amber fill is reserved for the respondent's answer choices and status badges. |
| Labels | The UI font in sentence case (`tactile-label`, 13px 600). Space Mono only for codes, addresses and numbers. Public pages keep their mono eyebrows. |
| Badges | Small rounded tags (`--lv-radius-tag`, 8px), 12px semibold, first letter capitalised. |
| Header | One full-width bar with a blur and a hairline; the homepage hero keeps its ink header. |
| Inside a Hub | The same elements, with the Hub's own colour as `--lv-accent` and the selected tint (`.lv-hubscope`). |

Hub identity: `HubProfile` (banner in the Hub's colour, mark overlapping it, facts, actions), `HubCard` (the shareable
card used on Discover, in the share dialog and on the home page) and `ShareHubDialog` (card preview, `/h/<slug>` link,
invite message, phone share sheet, QR). See `src/ui/hub.css`.

## Required component coverage

Buttons, inputs, selects, radio/checkbox/switch, tabs, dialogs, menus, tables, navigation,
cards, badges, tooltips, notifications, empty/loading/error/success states, Hub cards,
Campaign cards, permission controls, pricing/entitlement cards, question controls (rating,
slider, yes/no, single, multi, NPS, short/long text, ranking), respondent progress/player,
charts (line/area, bars, stacked distribution, donut, accessible table), billing state, Hub
Name Reservation surfaces.

## Icons

One inline-SVG `Icon` component (1.75 stroke, round caps). No emoji in UI.

## Motion

150–260ms ease-out-quint. Press scale .97. One reduced-motion fallback for everything.
The signature draw-on animation is reserved for the public CTA.

## Layout

Public: full-bleed sections, max 1200px text column. App: three-column Builder (page list /
live preview with desktop+mobile toggle / contextual settings) on desktop; single column with
a bottom sheet for settings on mobile. Respondent: single column, one question per screen.
