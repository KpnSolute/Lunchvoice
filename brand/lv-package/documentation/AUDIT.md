# Brand audit, 2026-11-12

What the repository held on `main` (`e0d4247`) before this kit, and what was done about each finding. Measurements
were taken from the files themselves.

## Findings

| # | Finding | Evidence | Resolution |
| --- | --- | --- | --- |
| 1 | **Two different logos were in use.** The site header, the Discord bot and the link preview used a sharp-cornered LV with an amber speech bubble and smile. The favicon and app icons used a different, rounded LV drawn with thick strokes on an amber tile. | `brand/lv-package/source-svg/lunchvoice-mark.svg` (polygons) against `lunchvoice-icon-full.svg` and `-icon-simple.svg` (62px round strokes) | Founder decision: the sharp LV is the one mark. The rounded drawing is deleted. The favicon and app icons keep their amber tile and now carry the sharp LV in white |
| 2 | **Three public logo files carried a retired cafeteria tagline** in a typeface that is not the brand's. | `lunchvoice-lockup-dark.svg`, `-lockup-light.svg`, `-wordmark.svg`: "SMART FEEDBACK. BETTER CAFETERIAS." set in Georgia and Arial; the same in five PNG exports. Two of these were served from `public/brand/` | Files deleted. New lockups have no tagline and use the real wordmark as outlines |
| 3 | **Three taglines were in circulation.** | "Smart feedback. Better cafeterias." (logo files), "Every voice has a story. Hear it." (site hero, link preview), "Make every voice count." (the brief) | Founder decision: **Make every voice count.** everywhere. The site hero, the search metadata and the link preview image were changed with it |
| 4 | **The logo disappeared on dark backgrounds.** | The mark and wordmark files had ink `#14110F` letters baked in and no dark version. The only "dark" file had a black rectangle baked behind it | Every version now exists as `on-dark` (bone letters) and `mono-light` (all white), with transparent backgrounds |
| 5 | **The old kit's colours were not the product's.** | Lockups used Cream `#FAF7F2`, Warm Gray `#8B857E` and `#C9BFAE`; none is in `src/ui/tokens.css` | The kit now reads its colours from `tokens.css`. No colour value was changed or added |
| 6 | **`favicon.ico` held one 16px image**, though the kit's notes said 16, 32, 48 and 64. | ICO header: 1 entry, 16 x 16, 449 bytes | Rebuilt with 16, 32 and 48 |
| 7 | **The mark sat off-centre in its own file.** | Drawing area 400 x 430; artwork occupies x 40 to 378, y 4 to 377, so 40 left, 22 right, 4 top, 53 bottom | Master files are cropped to the artwork (338 x 373). Clear space is now a rule (the bubble's height on every side), not baked-in padding. The live `LvMark` component was moved to the same crop so the header logo is centred |
| 8 | **Exports were not square where a square is required.** | `lunchvoice-mark_1024.png` is 1024 x 1101 | Symbol exports are named by width and keep their true ratio; separate square files exist for avatars and icons |
| 9 | **No stacked logo, no one-colour versions, no social or video assets, no guidelines.** | Absent from the repository | Added |
| 10 | **Amber was available as a text colour by accident.** | `#FF9A18` on white measures 2.1:1 and on the page colour 1.8:1 | Already handled in the product by `--lv-accent-text`; now stated as a brand rule with measurements in `COLOR_SPEC.md` |
| 11 | **No maskable icon.** Android may crop an icon to a circle. | `site.webmanifest` listed two rounded icons only | Maskable 192 and 512 added to the manifest |

## Found, not changed

- **The V dips below the L.** In the approved drawing the V's point ends 18 units below the L's foot (y 322 against
  304), which shows as a small notch under the L. It is part of the recognised mark, so it was kept. Squaring it off
  would be a real change to the logo and needs the founder's eye.
- **White on amber in the icon measures 2.1:1.** The founder chose the amber icon. The symbol is large and is a mark,
  not text, but ink on amber (8.9:1) would be easier to make out at 16px. One line in `scripts/brand/logo.mjs`
  (`ICON_TREATMENT`) switches it.
- **`public/brand/discord-banner.png`** still reads "Ask your community. Hear every voice." It was made by hand and has
  no source in the repository, so it was not regenerated. It should be redone with the new tagline.
- **`marketing/VIDEO_PROMPTS.md` and `CAMPAIGN_QUEUE.md`** were checked; they already use "Make every voice count" or
  no tagline.
- **Warning notices inside a Hub take the Hub's colour**, and two motion duration scales exist. Both were already
  recorded in `docs/frontend/design-system/README.md` and are design-system questions, not brand-kit ones.
