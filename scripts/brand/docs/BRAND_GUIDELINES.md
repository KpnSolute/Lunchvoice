# LunchVoice brand guidelines (short form)

The full, illustrated version is `LunchVoice-Brand-Guidelines.pdf` in this folder. This page is the same rules as plain
text, for agents and for quick reference. Where the product's design system and this page overlap, `src/ui/tokens.css`
and `DESIGN.md` decide.

## Identity

- Name: **LunchVoice**, one word, capital L and V.
- Tagline: **Make every voice count.** Beside or below the logo in marketing; never inside a logo file.
- Retired: "Smart feedback. Better cafeterias." and "Every voice has a story. Hear it."
- LunchVoice is a surveys and feedback platform for any community. It is not a cafeteria product.

## Logo

- One drawing: `scripts/brand/logo.mjs`. The site's `LvMark` component uses the same shapes. Never redraw it.
- Versions: horizontal (primary), stacked, symbol, small-size symbol (under 48px: no smile, no dots), wordmark, icon.
- Treatments: `on-light` (ink letters), `on-dark` (bone letters), `mono-dark` (all ink), `mono-light` (all white).
- Icon: the symbol in white on an amber tile. Used for the favicon, app icons and profile pictures.
- Clear space: the height of the speech bubble on every side.
- Smallest: horizontal 96px wide, stacked 72px wide, symbol 24px tall, icon 16px.
- Never: stretch, rotate, recolour, add shadows, glows, outlines or gradients, retype the name, put ink letters on a
  dark background, or put a tagline in the logo.

## Colour

Amber `#FF9A18` (accent), Ink `#14110F` (anchor), Bone `#F7F3EA` (on ink), Page `#EEEDEA`, White `#FFFFFF`.
Full tokens and measured contrast: `COLOR_SPEC.md`.

- Amber is the accent: one amber thing per screen or graphic.
- Amber is never text on a light background. Use `--lv-accent-text` `#8F4A00`, or put the amber on ink.
- Text on amber is ink.

## Type

Bricolage Grotesque 800 (display), Geist 400 to 600 (interface and body), Space Mono (codes, addresses, numbers).
Sizes: `TYPOGRAPHY.md`.

## Motion

Motion answers an action. Springy press, eased entrances, one orchestrated moment per page, reduced motion respected.
The logo may fade in, with the bubble popping in last; it never spins, bounces, glows or morphs.

## Where things are

`brand/lv-package/README.md` lists every folder. Social sizes and safe areas: `SOCIAL_SPECS.md`.
