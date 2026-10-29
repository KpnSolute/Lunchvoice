# DESIGN.md — LunchVoice v2

Approved direction: **Hybrid** — an expressive public brand over a calm application.
Visual DNA: ink, amber, bone. The v1 cafeteria layouts are not a reference.

## Implementation status

Tokens in `src/index.css` today are light-only OKLCH (bone surfaces, ink text, one amber
accent, Fraunces display, Space Grotesk UI, Space Mono data). The rest of this file is the
**target**; items are marked when they exist. The reusable library lives in `src/ui/` with a
component gallery at `/__gallery` (dev builds only) — **not started** until the design-system
slice lands. No page may carry bespoke CSS for something the library should own.

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

## Tokens (existing)

- Light: `--bg` bone, `--surface` white, `--surface-2` inset, `--ink`, `--muted`, `--line`.
- Brand: `--accent` amber, `--accent-ink`, `--pop` jade (success), `--danger`.
- Radius `--r-sm/--r/--r-lg/--r-pill`; motion `--ease` ease-out-quint, `--dur` 200ms.
- Type: `--font-display` Fraunces, `--font-sans` Space Grotesk, `--font-mono` Space Mono.

To add: dark values, spacing scale, elevation, z-index, semantic status colors, chart palette
(color-blind safe, single-series default), tenant-color validator.

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
