---
name: design-element-authoring
description: Create and govern new LunchVoice design elements and design standards. Use when existing components or tokens cannot express what is needed - a new reusable component (button style, Hub widget, analytics card, navigation piece, progress indicator, status badge, survey control, chart, animation, modal or drawer) or a new standard (spacing rule, size, semantic token, layout pattern, interaction, motion pattern, accessibility rule, type convention). Runs discover, evaluate, specify, design, implement, register, test, document, approve, release. Requires founder approval before any new token value or global rule.
---

# Authoring a new LunchVoice design element or standard

The system grows on purpose, not by accident. Follow the lifecycle in
`docs/frontend/design-system/DESIGN_EXTENSIONS.md`; the steps below are the short form. Use the `design-system` skill
for everything you build along the way.

## 1. Discover (always first)

Search for an equivalent before deciding anything new is needed:
- the component map in `docs/frontend/design-system/README.md` and `/__gallery` (`src/pages/Gallery.tsx`);
- `src/components/shadcn/blocks/index.tsx`, `src/components/`, `src/ui/`;
- tokens in `src/ui/tokens.css` (and the Hub scope in `src/ui/app.css`);
- `grep -rni "<role or name>" src docs/frontend`.

Write down what you found. If something close exists, you are extending it, not authoring.

## 2. Evaluate

In order of preference: use as is; add a variant or prop; compose existing parts; only then a new component. For a
standard: can an existing token or rule express it? A new **name** for an existing value is still a token change.

## 3. Classify and check approval

| Kind | Approval |
| --- | --- |
| Variant or prop on an existing component, existing tokens | None (document it) |
| New reusable component from existing tokens | None (full spec, gallery, tests) |
| New semantic token, new value, changed value, new global rule, brand, type, logo | **Founder approval before implementation** |

If approval is needed: write the proposal (template in `DESIGN_EXTENSIONS.md`: problem, existing tokens checked,
values for light / dark / high contrast, contrast figures, affected-component inventory, migration, compatibility with
`src/ui/shadcn.css` and `.lv-hubscope`, screenshots), present it, and **stop**. Do not edit `src/ui/tokens.css`,
`DESIGN.md` or global CSS until the founder approves. Prototype only in a scratch file or a disposable branch.

## 4. Specify

Fill the component specification in `docs/frontend/design-system/COMPONENT_STANDARDS.md`: purpose, alternatives
evaluated, location, typed props, variants and sizes, tokens, all states, 360px behaviour, keyboard and screen reader,
themes, reduced motion, example, tests.

## 5-6. Design and implement

Apply the identity (tokens, two registers, one primary action). Put it in the right folder (Tailwind classes only in
`src/components/shadcn/`); pure logic in `src/lib/` with a unit test; no new dependency without a reason.

## 7. Register

Export it, add it to `/__gallery` in its main states, add a row to the component map in the README. `npm run
check:design` fails if a reusable component is missing from the gallery.

## 8. Test

Unit tests for logic; e2e for behaviour; light, dark and high contrast at 390 / 768 / 1280; keyboard path; screenshot
and look. `npm run test:pr`, `npm run test:e2e`.

## 9-10. Document and release

Say when to use it and when not to. Record approved standards in the table in `DESIGN_EXTENSIONS.md`. Commit with a
`CHANGELOG.md` entry, following the repository's Git authority in `AGENTS.md`.
