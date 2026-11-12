# Platform sizes and safe areas

Checked on 2026-11-12. These come from current published guides, not from the platforms' own interfaces, and platforms
change them without notice. Recheck before a campaign, and always look at the result on a phone.

| Asset | Size | Keep the logo and text inside | Why |
| --- | --- | --- | --- |
| Instagram profile picture | 1080 x 1080 (shown from 320 x 320) | The centre circle | Shown as a circle |
| Instagram square post | 1080 x 1080 | The centre 810 px of width | The profile grid now crops to 3:4 |
| Instagram portrait post | 1080 x 1350 (4:5) | The centre 1012 px of width | The profile grid crops to 3:4 |
| Instagram Reel, YouTube Short | 1080 x 1920 (9:16) | Away from the top and bottom 250px and the right-hand edge | The app's buttons and captions sit there |
| YouTube thumbnail | 1280 x 720 | Above the bottom-right corner | The duration badge covers it |
| YouTube channel banner | 2560 x 1440 | The centre 1546 x 423 | Phones show only that band; TVs show everything |
| LinkedIn company banner | 1128 x 191 | Right of the first 250px | The page logo overlaps the lower left |
| Facebook cover | 851 x 315 | The centre 640 px of width | Phones crop the sides; desktop shows 820 x 312 |
| Presentation frame | 1920 x 1080 (16:9) | The whole frame | |
| Link preview | 1200 x 630 | The whole frame | Used for `og:image` on the site |

Notes:

- Sources disagree on the LinkedIn company banner: most give 1128 x 191, one gives 4200 x 700 (6:1). The frame here is
  1128 x 191 with the content centred, which survives either crop.
- Instagram also accepts 1080 x 1440 (3:4) posts. The 4:5 frame is used here because it can also run as an advert.
- Every frame in `social/` has a twin in `social/guides/` with the safe area drawn on it.

Sources checked: Adobe Express banner dimensions guide; Snappa and async.com YouTube banner guides; contentstudio.io
Facebook cover guide; pixotter and socialrails LinkedIn guides; oktopost, recurpost and nealschaffer Instagram guides.
