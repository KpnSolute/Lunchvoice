# Setting up LunchVoice in Canva

Nothing has been uploaded to any Canva account. These are the steps to do it yourself; it takes about ten minutes. A
Brand Kit needs Canva Pro or Teams. On the free plan, upload the same files to a folder and add the colours by hand.

## 1. Logos

Brand Kit, then Logos, then upload from this folder:

| File | When to use it |
| --- | --- |
| `01-logo-primary-for-light-backgrounds.png` | First choice on light designs |
| `02-logo-primary-for-dark-backgrounds.png` | First choice on dark designs |
| `03-` and `04-logo-stacked-…` | Centred and square layouts |
| `05-` and `06-symbol-…` | When the name is already on the design |
| `07-logo-all-white.png` | Over video and photos |
| `08-logo-all-ink.png` | On amber, or when colour cannot be used |
| `09-app-icon.png` | Profile pictures |

The `svg/` folder has vector copies; Canva accepts SVG uploads and they stay sharp at any size.

## 2. Colours

Brand Kit, then Colours. Add one palette named "LunchVoice" with these five, in this order:

| Name | HEX |
| --- | --- |
| Amber | `#FF9A18` |
| Ink | `#14110F` |
| Bone | `#F7F3EA` |
| Page | `#EEEDEA` |
| White | `#FFFFFF` |

Optional second palette, "LunchVoice support": Amber text `#8F4A00`, Deep amber `#E98207`, Light amber `#FFB347`,
Muted `#4A4540`, Subtle `#6A645E`, Line `#DAD8D4`. More detail in `COLORS.md`.

## 3. Fonts

Brand Kit, then Fonts. All three are already in Canva; search by name. No upload is needed.

| Style in Canva | Font | Weight | Size to start from |
| --- | --- | --- | --- |
| Title | Bricolage Grotesque | ExtraBold | 96 |
| Heading | Bricolage Grotesque | ExtraBold | 56 |
| Subheading | Geist | SemiBold | 28 |
| Body | Geist | Regular | 18 |
| Caption | Space Mono | Regular | 14 |

For titles and headings set letter spacing to about -45 and line spacing to about 0.95. `FONTS.md` has the detail and
what to pick if a font is missing.

## 4. Templates

Upload the files in `templates/` and `video/`, open each as a new design at the size in its name, and save it as a
Brand Template:

- `templates/instagram-square.png` (1080 x 1080), `instagram-portrait.png` (1080 x 1350)
- `templates/reel-or-short-cover.png` (1080 x 1920), `youtube-thumbnail.png` (1280 x 720)
- `video/outro-vertical.png`, `outro-wide.png`, `title-card.png`, and `lower-third.png` (transparent: place it over
  your footage and type the name on top)

More sizes, including banners, are in `brand/lv-package/social/`.

## 5. Check

Make one test design. The logo should be the right version for its background, the headline in Bricolage Grotesque,
and amber used once. If the logo looks faint, you have the light-background version on a dark design, or the reverse.
