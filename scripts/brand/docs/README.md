# LunchVoice brand kit

Version 1.0, November 2026. This folder is the official LunchVoice identity: one logo, one palette, three typefaces,
and every file you need to use them.

**Everything here is generated.** `npm run brand:build` rebuilds the whole folder from one vector source
(`scripts/brand/logo.mjs`), and `npm run check:brand` verifies it. Do not edit an export by hand: change the source and
rebuild. The hand-written documents live in `scripts/brand/docs/`.

## Start here

| I want to | Open |
| --- | --- |
| Read the rules | `documentation/LunchVoice-Brand-Guidelines.pdf` |
| Put the logo on something | `logo/` (PNG) or `source-svg/` (vector) |
| Set up Canva | `canva/CANVA_SETUP.md` |
| Make a post, a thumbnail or a banner | `social/` |
| Finish a video | `video/` |
| Look up a colour | `documentation/COLOR_SPEC.md` |
| Look up a type size | `documentation/TYPOGRAPHY.md` |
| See every logo version at once | `documentation/logo-comparison-sheet.png` |
| See what was wrong before | `documentation/AUDIT.md` |

## The five things to remember

1. The name is one word: **LunchVoice**.
2. The tagline is **Make every voice count.** It goes beside the logo, never inside it.
3. Light background: the `on-light` logo. Dark background: the `on-dark` logo. Never the other way round.
4. Amber `#FF9A18` is the accent, ink `#14110F` is the anchor. Amber is never text on a light background.
5. Bricolage Grotesque for headlines, Geist for everything you read, Space Mono for codes and addresses.

## Folders

| Folder | Contents |
| --- | --- |
| `source-svg/` | Vector masters: horizontal logo, stacked logo, symbol, small-size symbol and wordmark in four treatments, and the icon in four shapes |
| `logo/` | Transparent PNGs of each, at several widths |
| `favicons/` | `favicon.ico` (16, 32, 48) and PNGs for browsers and iOS |
| `app-icons/` | The icon from 16 to 1024px, plus square and maskable shapes |
| `social/` | Frames at each platform's size; `social/guides/` shows the area every device displays |
| `video/` | Outros, title card, lower third, backgrounds, transparent overlays; `video/examples/` shows them with text |
| `canva/` | The short list to upload to a Canva Brand Kit |
| `documentation/` | Guidelines PDF, colour and type specifications, platform sizes, audit, comparison sheet |

## File names

`lunchvoice-<what>-<treatment>_<width>.png`

- **what:** `logo-horizontal`, `logo-stacked`, `mark` (the symbol), `mark-small`, `wordmark`, `icon`
- **treatment:** `on-light`, `on-dark`, `mono-dark` (all ink), `mono-light` (all white)
- **size:** width in pixels, or `width x height` for a fixed canvas

## Licences

Bricolage Grotesque, Geist and Space Mono are under the SIL Open Font License 1.1 (`public/licenses/`). No font files
are stored in this kit; install them from Google Fonts or pick them in Canva.
