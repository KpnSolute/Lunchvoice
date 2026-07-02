# DESIGN.md — The Lunch Line

Visual system for the bold-editorial, light+dark, no-emoji redesign. All values are
tokens in `src/index.css` (`:root` = light, `[data-theme="dark"]` / `prefers-color-scheme`
= dark). Mood: **late-night food zine — ink & bone paper with one acid-citrus jolt.**

## Color (OKLCH)

Warmth is carried by the ACCENT + type, not the surface. Surfaces are near-neutral bone
(light) and ink (dark), so the accent pops in both.

### Light
- `--bg`      oklch(0.985 0.004 80)  — bone paper, barely warm
- `--surface` oklch(1 0 0)           — pure white cards
- `--surface-2` oklch(0.965 0.006 80)— insets, tracks
- `--ink`     oklch(0.18 0.012 60)   — near-black text (contrast ≥ 12:1)
- `--muted`   oklch(0.50 0.012 65)   — secondary text (≥ 4.6:1 on bg)
- `--line`    oklch(0.90 0.006 75)   — hairlines

### Dark
- `--bg`      oklch(0.17 0.012 65)   — warm ink
- `--surface` oklch(0.215 0.014 65)  — raised cards
- `--surface-2` oklch(0.26 0.015 65)
- `--ink`     oklch(0.96 0.006 80)   — bone text
- `--muted`   oklch(0.70 0.012 75)
- `--line`    oklch(0.30 0.014 65)

### Brand (shared across themes)
- `--accent`      oklch(0.76 0.185 66)  — electric citrus-orange. Actions, current, focus.
- `--accent-ink`  oklch(0.22 0.06 66)   — text ON accent (dark, for contrast on bright orange)
- `--pop`         oklch(0.70 0.16 150)  — jade "success/points earned" (used sparingly)
- `--danger`      oklch(0.62 0.19 25)   — errors

Accent is the ONLY saturated color in normal UI. `--pop` appears only on points/success
moments; `--danger` only on errors.

## Typography

Contrast pairing (display serif × grotesk), one weight axis each — not two similar sans.

- **Display:** `Fraunces` (opsz high, weight 800–900), tight tracking (-0.03em), used
  BIG for page titles and hero numbers. This is the "graphic".
- **Text/UI:** `Space Grotesk` — headings-small, body, buttons, labels.
- **Mono:** `Space Mono` — codes, points values, meta/eyebrow-as-data (used deliberately,
  not as a section eyebrow on every block).
- Scale: fixed rem, ratio ~1.2. Hero clamp max ≤ 3.4rem. `text-wrap: balance` on titles.

## Motion

- Durations 150–260ms; ease-out-quint `cubic-bezier(.22,1,.36,1)`.
- Tap: `scale(.97)` press on buttons/cards. Rating fills animate (pop keyframe).
- Points count-up + a single jade burst on earn (no confetti spam, no emoji).
- Page/route + tab transitions subtle; bottom-nav active indicator slides.
- Full `@media (prefers-reduced-motion: reduce)` fallback (crossfade/instant).

## Components

- **Cards:** `--surface`, 1px `--line`, radius 16–20px, soft shadow in light / raised
  fill in dark. No nested cards.
- **Hero "today" card:** ink-filled (dark surface even in light theme) with accent CTA —
  the signature element, echoing the reference.
- **Buttons:** primary = accent fill + `--accent-ink`; ghost = `--line` border; all share
  one radius + press motion. Full state set (hover/focus/active/disabled).
- **Ratings:** custom SVG stars/forks (no emoji), accent fill on select, spring pop.
- **Bottom nav:** 5 tabs, custom line icons, sliding accent indicator, active label accent.
- **Chips:** pill filters, accent-fill when active.
- **Inputs:** surface fill, `--line` border, accent focus ring (3px), custom select chevron.

## Icons

Custom inline SVG set (1.75 stroke, round caps), centralized in one `Icon` component.
Replaces ALL emoji. Names: home, star, fork, menu, survey, voice, store, orders, roster,
dashboard, logout, check, chevron, points/coin, flame(streak), etc.

## Layout

- Mobile-first, `max-width` app column (~1000px) centered; content padding + bottom-nav
  safe-area. Responsive grids via `auto-fit minmax`, no fluid type.
