# LunchVoice typography

Three typefaces, all under the SIL Open Font License 1.1 and all free on Google Fonts and in Canva. The product loads
them from the `@fontsource` packages (`src/ui/fonts.css`); the tokens are `--lv-font-display`, `--lv-font-ui` and
`--lv-font-mono` in `src/ui/tokens.css`. No other typeface is used, and none may be added without founder approval.

| Face | Role | Weights used | If it is not available |
| --- | --- | --- | --- |
| Bricolage Grotesque | Display: headlines, the tagline, big numbers | 800 | Archivo ExtraBold, then Arial Black |
| Geist | Interface and body: everything you read or press | 400, 500, 600 | Inter, then Arial or Helvetica |
| Space Mono | Data: codes, web addresses, numbers; small labels on public pages | 400, 700 | IBM Plex Mono, then Courier New |

## Product sizes

The values below are the ones the site uses today (`src/styles/landing.css`, `src/ui/ui.css`). Sizes given as a range
scale with the width of the screen (CSS `clamp`).

| Use | Face and weight | Size | Line height | Letter spacing |
| --- | --- | --- | --- | --- |
| Marketing hero heading | Bricolage 800 | 52 to 112px | 0.88 | -0.05em |
| Page heading, public pages | Bricolage 800 | 40 to 68px | 0.95 | -0.045em |
| Section heading, public pages | Bricolage 800 | 36 to 60px | 0.95 | -0.04em |
| Page heading, app | Bricolage 800 | 34 to 56px | 0.98 | -0.045em |
| Question title, survey player | Bricolage 800 | 28 to 38px | 1.02 | -0.035em |
| Card and panel heading | Geist 600 | 18px | 1.3 | -0.01em |
| Lead paragraph | Geist 400 | 16 to 19px | 1.55 | 0 |
| Body | Geist 400 | 16px; 15px in dense lists | 1.5 | 0 |
| Button | Geist 500 to 600 | 14.5px; 17px in the survey player | 1 | 0 |
| Field label | Geist 600, sentence case | 13px | 1.25 | 0.005em |
| Caption and help text | Geist 400 | 13px | 1.45 | 0 |
| Big figure | Bricolage 800 | 34 to 46px | 0.95 | -0.04em |
| Code, address, counter | Space Mono 400 or 700 | 12 to 15px | 1 to 1.35 | 0 |
| Eyebrow, public pages only | Space Mono 700, capitals | 12px | 1.2 | 0.14em |
| Wordmark in the header | Bricolage 800 | 19px | 1 | -0.03em |

Rules:

- Nothing on screen is smaller than 12px (`--lv-text-min`).
- Labels in the app are sentence case in Geist. Capitals in Space Mono are for eyebrows on public pages only.
- Reading text stays under about 75 characters a line.
- Bricolage is set with optical sizing on, so large headlines use its display cut.

## Video and social sizes

For a frame 1080px wide. Scale in proportion for other widths.

| Use | Face and weight | Size | Notes |
| --- | --- | --- | --- |
| Headline or hook | Bricolage 800 | 96 to 140px | Line height 0.95, letter spacing -0.045em, five words or fewer a line |
| Supporting line | Geist 500 | 40 to 52px | One sentence |
| Captions and subtitles | Geist 600 | 44 to 56px | Bone on an ink panel, or ink on bone; never amber |
| Web address, codes | Space Mono | 28 to 36px | Lower case: lunchvoice.com |
| Lower-third name | Geist 600 | 40px on a 1920-wide frame | Role beneath in Space Mono 22px |

## The tagline as a graphic

"Make every voice count." in Bricolage 800, letter spacing -0.045em, line height 0.95, broken after "voice".
On ink: bone, with "count." in amber. On a light background: all ink, because amber would not be readable.

## The wordmark

The wordmark in the logo files is Bricolage Grotesque 800 at optical size 96 with -0.03em letter spacing, converted to
outlines (`scripts/brand/wordmark.json`). Use the logo file; do not retype it.
