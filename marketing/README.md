# LunchVoice Marketing Studio

This directory is the source of truth for LunchVoice's outward-facing marketing production: copy, concepts, video prompts, storyboards, publishing queue, outcomes and creative assets references. Product and engineering truth remain in `PRODUCT.md`, `DESIGN.md`, `src/ui/tokens.css`, `docs/v2/LAUNCH_PLAN.md` and `docs/frontend/GO_TO_MARKET.md`. When those change, update marketing accordingly.

## Brand rules
- Name: **LunchVoice** (one word).
- Brand visual DNA: **ink, amber, bone**, NOT blue/purple. Ink `#14110F`; amber `#FF9A18`; bone `#F7F3EA`; page `#EEEDEA`; white `#FFFFFF`.
- Display: Bricolage Grotesque; interface: Geist; data: Space Mono. Preserve accessibility and clear contrast.
- Use actual graphics from this repository, never an AI-generated replacement:
  - `brand/lv-package/logo/lunchvoice-wordmark_2000.png`
  - `brand/lv-package/logo/lunchvoice-lockup-dark_2000.png`
  - `brand/lv-package/logo/lunchvoice-lockup-light_2000.png`
  - `brand/lv-package/logo/lunchvoice-mark_1024.png`
  - `public/brand/lunchvoice-wordmark.svg`
  - `public/brand/lunchvoice-mark.svg`
- Official site: https://lunchvoice.com

## Product and audience claims
- Primary: **adult** organizers of groups, events, clubs, communities, organizations, teams and businesses; school administration is an adult-facing use case. Do not market to minors.
- LunchVoice is **not only for dining**. Never imply it is a cafeteria-only product.
- Approved, source-backed core line: **“Build a survey in minutes, share it by QR code, see anonymous results live. Free.”**
- Quick Surveys are currently accessible; don't falsely say the *entire* product is unavailable. `Coming Soon` may refer to the broader launch/campaign, but prefer a truthful CTA to try Quick Surveys or explore founding seats where appropriate.
- Current documented free offer: up to 5 active Quick Surveys, up to 10 questions each (verify before publication).
- Use privacy-safe wording. Anonymous applies only when the creator cannot identify who responded; results for small groups may be withheld.
- No invented analytics metrics, user counts, customer logos, testimonials, dates, partner claims or working features. Election mode is not live. Don't show fake product UI; use authentic screenshots or non-UI motion graphics.
- Any music, stock footage, voices and generated assets must be licensed for commercial marketing use. Free plan does not necessarily mean commercial rights or no watermark.

## Files and workflow
1. `CAMPAIGN_QUEUE.md`: planned videos, order, statuses, publication checklist and outcomes.
2. `VIDEO_PROMPTS.md`: reusable master prompt, individual scripts and platform-specific variants.
3. For each video, make a new folder in `marketing/videos/` only when real project exports, captions, thumbnails, or other artifacts exist. Include `brief.md` and links to hosted project/export; prefer linking to large binaries over committing them.
4. InVideo working project: https://invideo.io/workspace/5c327c91-78b7-4e5f-96bf-4a03f2354aad/v45-copilot/agents-models/c173e6b6-1ef9-4a23-bebb-ef1e035bb141

## Approvals before publishing
Check branding, claims against live functionality, rights, legibility and captions, platform sizing, CTA URL and privacy. Log exact publish URL and performance after release.
