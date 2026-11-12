# Design extensions: adding to the system

How a new component, variant, token or global rule enters LunchVoice, and who has to approve it. Followed by the
`design-element-authoring` skill.

## What needs approval

| Change | Approval |
| --- | --- |
| A new variant or prop on an existing component, using existing tokens | None during authorised feature work. Document it |
| A new reusable component built only from existing tokens | None. Full specification, gallery entry and tests |
| A new **semantic token** that only aliases existing values (for example a role name for an existing colour) | Founder approval |
| A new value: colour, radius, shadow, duration, size, font, breakpoint | Founder approval |
| A change to an existing token's value, the brand colours, type, logo or a rule in `DESIGN.md` | Founder approval, with screenshots before and after |
| A new global rule (spacing convention, motion pattern, accessibility rule, layout pattern) | Founder approval |

Without approval, write the proposal (below), stop, and ask. Never adopt a global change silently, never add a value
"just for this page", and never create a parallel token file.

## The lifecycle

1. **Discover.** Search before building: the component map in `README.md`, `src/components/shadcn/blocks/index.tsx`,
   `src/components/`, `src/ui/`, `/__gallery`, and the token map. `grep -rn "<Name>\|<role>" src` for near matches.
2. **Evaluate.** Prefer, in order: use as is; add a variant or prop; compose existing pieces; then a new component.
   Record what you considered.
3. **Specify.** Fill the specification in `COMPONENT_STANDARDS.md` (component) or the proposal below (token or rule).
4. **Design.** Apply the identity in `README.md`: tokens, the two registers, one primary action, the respondent player
   stays lively. Sketch states and phone layout first.
5. **Implement.** In the right folder, with tokens only. Pure logic in `src/lib/` with unit tests.
6. **Register.** Export it, add it to `/__gallery`, add a row to the component map.
7. **Test.** Unit tests for logic; e2e for behaviour; themes (light, dark, high contrast) and widths (390, 768, 1280);
   keyboard path; `npm run check:design`.
8. **Document.** When to use it and when not to, in the component map or this file.
9. **Approve.** For anything in the approval table above: stop and ask, with the proposal and screenshots.
10. **Release.** Commit with a `CHANGELOG.md` entry under `[Unreleased]`; follow the repository's Git authority.

## Proposal template (tokens and global rules)

```md
### Proposal: <token or rule name>
- Problem: what cannot be expressed with today's tokens or rules (with the page or component)
- Existing tokens and rules checked:
- Proposal: name(s), value(s) in light / dark / high contrast, or the rule text
- Rationale and contrast figures (text 4.5:1, UI 3:1):
- Affected components and pages (inventory, with file paths):
- Migration: what changes, in what order; is anything breaking?
- Compatibility: shadcn mapping in src/ui/shadcn.css, Hub scope in src/ui/app.css, themes
- Screenshots: before and after, 390 and 1280, light and dark
- Status: proposed | approved by the founder on <date> | rejected
```

## Recorded extensions

| Date | Extension | Type | Approval |
| --- | --- | --- | --- |
| 2026-11-12 | Design system 3 (flat surfaces, rectangular buttons, tinted selection, sentence-case labels) | Global | Founder direction ("full UI revamp", 2026-11-12) |
| 2026-11-12 | `--lv-accent-text`, `--lv-text-min`, `--lv-target-min` use, `--lv-header-clear` | Tokens | Founder brief 2026-11-11 (contrast, type floor, targets) |
| 2026-11-12 | `--lv-selected-*`, `--lv-field-*`, `--lv-radius-control`, `--lv-radius-tag`, `--lv-header-bg` | Tokens | Founder direction 2026-11-12 (element rebuild) |
| 2026-11-12 | `HubProfile`, `HubCard`, `ShareHubDialog`, `IconBadge` and `BADGES` | Components | Founder direction 2026-11-12 (Discord-style sharing and badges) |
