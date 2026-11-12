---
name: frontend-design
description: Design and build polished, distinctive LunchVoice interfaces - landing and marketing pages, dashboards, Quick Survey creation, Hub management, the Campaign Studio, analytics and results, settings and account pages, mobile layouts, motion, hierarchy and empty, loading, error and success states. Use when creating a new screen or flow, or significantly polishing or reworking an existing one. Works inside LunchVoice's fixed identity (tokens, fonts, logo); it never replaces it. Use together with the design-system skill.
license: Adapted from Anthropic's frontend-design skill (Apache-2.0); see LICENSE.txt and NOTICE.md
---

# Frontend design for LunchVoice

Act as the design lead who already owns this brand. The identity is decided: amber, ink, bone and page; Bricolage
Grotesque, Geist and Space Mono; the `LvMark` logo; design system 3. Your craft goes into composition, hierarchy,
content, states and motion within that identity, never into a new palette or typeface. Follow the `design-system`
skill for tokens and components; this skill is about making the result excellent.

## Ground the design in the job

Before drawing anything, name: who is on this screen (a creator, a Hub owner, a member, a guest respondent), the one
job they came to do, and the one action that does it. That action gets the single amber `primary` button. Everything
else supports it or gets out of the way. Use LunchVoice's real vocabulary (Hub, Campaign, Quick Survey, join code,
withheld result) and real content from the product, never lorem ipsum.

Pick the register and stay in it:
- **Public pages** are expressive: big Bricolage display type, ink and amber bands, one bold hero moment, mono
  eyebrows. One memorable thing per page.
- **App pages** are calm and legible: flat surfaces, hairlines, sentence-case labels, dense but breathable lists, the
  Hub's own colour inside a Hub. Speed of understanding beats decoration.
- **The respondent player** is the lively heart: one question per screen, bold amber choices, springy feedback.

## Composition and hierarchy

- Structure carries information. Use cards, dividers, numbering and eyebrows only when they say something (a sequence
  is numbered; a list of peers is not). Avoid chopping everything into identical cards.
- One display size per screen region; let type weight and spacing (`--lv-space-*`) create the hierarchy, not colour.
- Keep line length under about 75 characters for reading text.
- Align to a clear edge; group related controls with proximity, separate unrelated ones with space before lines.
- Data first in dashboards: the number, then what it means, then what to do. Show withheld results as their own
  labelled state; never as zero; every chart has an accessible table.

## States are part of the design

Design the empty state (what this is, one next step), loading (skeletons that match the layout), error (what went
wrong, what to do), success (what changed, where to go next) and the permission or plan-limited state (a
`DisabledAction` with the reason) as deliberately as the full one.

## Motion

Motion answers a person's action: pressing, opening, confirming, moving to the next question. Use `--lv-ease-spring`
with `--lv-dur-press` for presses and `--lv-ease-out` for entrances. One orchestrated moment per page at most; no
fade-up on every section, no hover animation on every card. Durations come from tokens so reduced motion works.

## Avoid the generated-page tells

These read as templated wherever they appear; use them only when the content calls for them:
- accenting one word of a headline in a different colour on every page;
- all-caps tracked eyebrows above every heading in the app (public pages keep their mono eyebrows sparingly);
- numbered markers on content that is not a sequence;
- identical rounded cards with the same soft shadow for everything; gradient washes as decoration;
- invented proof (big numbers, testimonials, "trusted by"), stock imagery, emoji as icons;
- generic blue or purple SaaS styling.

## Process: plan, check, build, critique

1. **Plan** in a few lines: the job, the primary action, the register, the layout (an ASCII wireframe for phone and
   desktop), the components you will reuse, and the states.
2. **Check** the plan against this product: does any part read like the default you would produce for any app? Change
   it and say why. Does anything need a new component or token? Then switch to `design-element-authoring`.
3. **Build** with tokens and existing components; mobile first; watch CSS specificity so section and component rules
   do not cancel each other.
4. **Critique** with screenshots (Playwright is installed; `/__gallery` has a theme switch): light, dark and high
   contrast at 390 and 1280. Remove one accessory before you call it done. Hold the quality floor without announcing
   it: no horizontal scroll at 360px, visible focus, reduced motion, 4.5:1 text contrast, 44px targets where people
   tap.

Supporting files: `NOTICE.md` (attribution and changes), `LICENSE.txt` (Apache-2.0).
