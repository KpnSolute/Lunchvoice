# LunchVoice: reusable AI video generation prompts

This is a production guide for InVideo AI and comparable script-to-video systems. Use the real brand files, not reconstructed logos. For the release order, see [CAMPAIGN_QUEUE.md](CAMPAIGN_QUEUE.md).

## Master prompt template (copy, then replace the placeholders)

> Act as a creative director and video producer for **LunchVoice**, a privacy-conscious survey and feedback SaaS platform for adult organizers of clubs, communities, events, teams and businesses (including school administrators, never marketing directly to minors). Produce a polished **[DURATION]** **[FORMAT, e.g., 9:16 1080×1920]** video for **[CHANNEL]** with goal **[GOAL]**.
>
> **Brand fidelity is mandatory:** use uploaded **official** LunchVoice wordmark or lockup as an image asset, without redrawing it. Palette: Ink #14110F, Amber #FF9A18, Bone #F7F3EA, light page #EEEDEA, white #FFFFFF. Typography direction: Bricolage Grotesque display, Geist UI, Space Mono for supporting data. Avoid blue/purple brand styling. Use high contrast, elegant motion, restrained cinematic transitions and accurate legible captions.
>
> **Product truth:** LunchVoice lets people create surveys, share by QR code or link, and see privacy-safe anonymous results. Its use cases extend far beyond food. Do not invent UI, testimonials, brand marks, customers, numbers, live features or launch dates. Use actual screenshots only when supplied. If not supplied, show abstract story-led visuals rather than simulated app dashboards. Do not describe Election mode as live. Align all paid-tier claims with live pricing.
>
> **Audience:** [ADULT TARGET AUDIENCE]. **Core message:** [HOOK / VALUE PROPOSITION]. **Call to action:** [EXACT TRUTHFUL CTA AND URL].
>
> Build a beat-by-beat timeline including on-screen text, voiceover and shot descriptions. Make the first 2 seconds visually arresting, ensure 3–5 seconds of clear brand recognition, then end with the official wordmark and CTA. Music must be commercially usable; export subtitles and a no-watermark version only if allowed on the user's plan. Deliver the actual edited video, not only a script. Ask before spending additional paid credits.

## Official asset links (public GitHub raw URLs)
- Wordmark PNG: https://raw.githubusercontent.com/KpnSolute/Lunchvoice/main/brand/lv-package/logo/lunchvoice-wordmark_2000.png
- Dark lockup PNG: https://raw.githubusercontent.com/KpnSolute/Lunchvoice/main/brand/lv-package/logo/lunchvoice-lockup-dark_2000.png
- Light lockup PNG: https://raw.githubusercontent.com/KpnSolute/Lunchvoice/main/brand/lv-package/logo/lunchvoice-lockup-light_2000.png
- Mark PNG: https://raw.githubusercontent.com/KpnSolute/Lunchvoice/main/brand/lv-package/logo/lunchvoice-mark_1024.png

## V01: The Official Teaser | 15s | 9:16 | Reels / Shorts

**Goal:** establish brand recognition and curiosity for the broader LunchVoice launch without misrepresenting already-available Quick Surveys.

**Copy-paste prompt:**

> Create an elegant, cinematic 15-second 9:16 1080×1920 promotional teaser for **LunchVoice**. Use the official imported LunchVoice logo assets (not an AI interpretation) and its real amber #FF9A18, ink #14110F, bone #F7F3EA visual language. Address adults running teams, communities, events and organizations, not children. 0–4s: minimal ink backdrop with a delicate amber soundwave and text **“Everyone has a voice.”** 4–8s: crisp transitions and the question **“But is anyone listening?”** 8–12s: abstract dots becoming organized responses, voiceover **“Better listening starts here.”** 12–15s: reveal the exact LunchVoice wordmark with **“Make every voice count.”** and **“The next chapter is coming.”** Below in smaller type, display **“Explore LunchVoice · lunchvoice.com”**. Sound: warm, uplifting, restrained, with commercially cleared music and concise confident adult voiceover. No invented app interface, fake social proof, fabricated launch date, or blue-purple gradients. Deliver a finished captioned video and editable project within available free credits.

**Assets attached to InVideo:** wordmark, dark lockup, icon mark (see README's working project).

## V02: Stop guessing. Start listening. | 30s | 9:16

> Using the master brand and truth rules, produce a 30-second vertical LunchVoice product-value reveal for adult group organizers. Hook: **“Still guessing what your community thinks?”** Show the pain of scattered feedback (stylized generic, no fabricated customer scenes). Reveal authentic LunchVoice logo. If genuine UI screen recordings are available, show a creator starting a Quick Survey, sharing a link/QR code and inspecting privacy-safe results; otherwise show labeled conceptual motion graphics and never fake the interface. Core line: **“Build a survey in minutes. Share it by QR code. See anonymous results live.”** End: **“Stop guessing. Start listening. Try LunchVoice at lunchvoice.com.”** Produce voiceover, animated captions and commercially suitable soundtrack.

## V03: Make feedback effortless | 30s | 9:16

> Create a 30-second polished LunchVoice explainer for adult event hosts and community managers. Story: launch an event, need real opinions, use a quick survey, share one QR code, understand anonymous trends. Bring in official logo and palette, avoid implying identification of anonymous respondents, and never display fabricated charts as actual results. Hook **“Your next event deserves better feedback.”** CTA **“Start a free survey · lunchvoice.com.”** Use actual screenshots only when provided.

## V04: Community Hubs preview | 30–45s | 9:16

> Make a 30–45-second LunchVoice Hub preview for adult club and association organizers. Keep this as a **preview** until current Hub availability and entitlements are verified. Show the idea of a dedicated place for campaigns and group feedback using abstract visuals or real UI only. Hook **“One community. A better way to listen.”** Avoid unverified role targeting, integrations, or plan promises. CTA **“Discover LunchVoice · lunchvoice.com.”** Use official assets.

## V05: Meet LunchVoice | 60–90s | 16:9 | YouTube

> Produce a 60–90-second YouTube brand and product explainer for LunchVoice, an all-purpose feedback product for adult group leaders and organizations. Segment into the problem, product intro, authentic Quick Survey demo (only if real footage supplied), privacy-safe results, multiple use cases, and ending with **“Make every voice count.”** and **lunchvoice.com**. Include accurate captions and matching official brand graphics. Avoid claiming hypothetical product capabilities are released. Use commercially licensed soundtrack and a calm confident narrator.

## Per-video production record template

Copy to a video's `brief.md` when production begins:

```md
# VNN — [Title]
Status: planned | scripted | generating | needs review | approved | published
Channel / format / duration:
Goal and audience:
Production tool / project URL:
Exact asset references:
Prompt revision:
Script / captions:
Truth & legal checks:
Commercial rights / watermark:
Approval:
Published URL and date:
Results (views, retention, clicks, conversions; no invented figures):
Next iteration:
```
