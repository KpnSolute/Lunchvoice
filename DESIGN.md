# LunchVoice design system

Version 3.0 (2026-11-10). Written from the code at `5d29758`; replaces the earlier `DESIGN.md`, which described
fonts and tokens the product no longer uses. Owner: the UI thread.

**Purpose.** Any developer or model that reads this file can build a new LunchVoice screen that looks, moves and
reads like the existing ones, without looking at another screen first. If the code and this file disagree, fix
whichever is wrong in the same change.

Each rule is marked: **[is]** true in the code today, **[target]** the standard new work must meet while older code
is migrated (plan in §13).

## 0. The ten rules

1. Colors, type, space, radius, shadow and motion come from `--lv-*` tokens in `src/ui/tokens.css`. No raw hex,
   pixel font size or duration in a page. **[target; 60 raw colors and 22 font sizes exist today]**
2. A page is built from components (§8) and layout classes (§7). A page never styles a button, field or card itself.
3. Every component works in three themes: light, dark, high contrast. **[is]**
4. Every interactive element is at least 44 px tall on touch surfaces, reachable by keyboard, and shows the focus
   ring. **[is]**
5. Two registers: **public** (expressive) and **app** (calm). A screen is one or the other, never a blend (§2).
6. One accent, amber. It marks the primary action and the selected state. It is never decoration, never body text.
7. Withheld results are a designed state with a reason. Never a zero, an empty chart or a dash (§9).
8. Before a respondent answers, they see what the creator can and cannot see (§9, `PrivacyPromise`).
9. Motion confirms an action or orients a change. If it does neither, remove it. Everything stops under
   `prefers-reduced-motion`. **[is]**
10. No emoji in the interface. Sentence case everywhere. Words from the vocabulary in §10 only.

## 1. Brand foundations

| | |
| --- | --- |
| Name | **LunchVoice**. One word, capital L and V. Never "Lunch Voice", "Lunchvoice" (the repository name only) or "LV" in public copy |
| Attribution | "LunchVoice by KpnSolute" in footers and legal pages |
| Idea | Every voice counts, and nobody is singled out for using theirs |
| Visual DNA | Ink, amber, bone. Soft, tactile surfaces: things look pressable because they are |
| Personality | Warm, direct, a little playful in public; quiet and exact in the app |
| Mark | `public/brand/lunchvoice-mark.svg`. Clear space: half the mark's width on every side. Minimum 20 px |
| Do not use | The lockup with the tagline "Smart feedback. Better cafeterias." (`brand/lv-package/.../lunchvoice-wordmark.*`) |

Full brand and voice guidance: `docs/strategy/03_BRAND_AND_MARKETING.md`.

## 2. Registers

| | Public | App | Respondent |
| --- | --- | --- | --- |
| Routes | `/`, `/pricing`, `/how-it-works`, `/use-cases`, `/about`, `/waitlist`, `/discover`, legal | `/me`, `/surveys/*`, `/:hub/*`, `/settings`, `/admin` | `/c/:code`, `/s/:token`, embedded player |
| Goal | Understand and start | Get work done | Answer in ten seconds |
| Type | Display type large, tight tracking | UI type; display only for the page title | One question in display type |
| Density | Generous; one idea per section | Compact; cards and tables | One thing per screen |
| Motion | Entrance and the signature CTA | Press and state feedback only | Stage slide, press, the thank-you mark |
| Width | 1200 px content | 1000 px content (`.wrap`) | 560 px column |
| Surface | Page and ink bands | Page, raised cards, wells | Ink (`lv-player-ink`) or contained card when embedded |

## 3. Color

### 3.1 Semantic tokens **[is]**

Use the role, never the value.

| Token | Role | Light | Dark | High contrast |
| --- | --- | --- | --- | --- |
| `--lv-page` | App background | `#EEEDEA` | `#17140F` | `#FFFFFF` |
| `--lv-surface` | Cards, sheets | `#FFFFFF` | `#34302A` | `#FFFFFF` |
| `--lv-surface2` | Inset areas, hover fill | `#F2F1EE` | `#2A2620` | `#FFFFFF` |
| `--lv-popover` | Menus, popovers | `#F8F7F5` | `#2E2A25` | `#FFFFFF` |
| `--lv-well` | Field background | `#E9E8E5` | `#0F0D0A` | `#FFFFFF` |
| `--lv-text` | Primary text | `#14110F` | `#F7F3EA` | `#000000` |
| `--lv-muted` | Secondary text | `#4A4540` | `#C9C3BA` | `#262320` |
| `--lv-subtle` | Hints, captions | `#6A645E` | `#A39D94` | `#3A3632` |
| `--lv-line` | Dividers | `#DAD8D4` | `#3A352F` | `#000000` |
| `--lv-control-off` | Unselected control glyph | `#7F7972` | `#8A847B` | `#000000` |
| `--lv-primary` / `--lv-on-primary` | Ink surfaces and their text | `#14110F` / `#F7F3EA` | `#F7F3EA` / `#14110F` | `#000` / `#FFF` |
| `--lv-accent` | Primary action, selection | `#FF9A18` | `#FF9A18` | `#FFB347` |
| `--lv-accent-deep` / `-light` | Gradient ends, pressed | `#E98207` / `#FFB347` | same | `#FFB347` |
| `--lv-on-accent` | Text on amber | `#14110F` | `#14110F` | `#000000` |
| `--lv-danger` / `--lv-danger-ink` | Destructive, errors | `#C2382B` / `#8A2318` | `#FF8A7A` / `#FFB3A8` | `#A3140A` |
| `--lv-success` / `--lv-success-ink` | Confirmation | `#2E8A4E` / `#1F5E35` | `#5CC98A` / `#8EE0B0` | `#0B5E2A` |
| `--lv-focus` | Focus ring | `#14110F` | `#FFB347` | `#000000` |
| `--lv-scrim` | Behind dialogs | ink 42% | black 60% | black 60% |

Rules:

- Text on amber is always `--lv-on-accent` (ink). White on amber fails contrast.
- Amber text on a light surface is not allowed for anything a person must read; use `--lv-text` with an amber marker.
- Body text uses `--lv-text` or `--lv-muted`. `--lv-subtle` is for captions of 13 px or more only.
- Status is never color alone: pair with an icon or a word.

### 3.2 Tokens to add **[target]**

Proposed values. Run each through a contrast check against its surface in all three themes (and the chart set
through a color-vision simulation) before adding it to `tokens.css`; adjust the value, keep the role.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--lv-warning` / `--lv-warning-ink` | `#B45309` / `#7A3A06` | `#F2B45C` / `#F7CF94` | Limits nearly reached, plan ending |
| `--lv-info` / `--lv-info-ink` | `#1D4ED8` / `#173EA8` | `#8FB2FF` / `#B9CFFF` | Neutral notices |
| `--lv-withheld` | `--lv-control-off` | same | The withheld bucket in charts, always hatched (§9) |
| `--lv-chart-1` … `--lv-chart-6` | `#14110F`, `#FF9A18`, `#0F766E`, `#4338CA`, `#BE123C`, `#6A645E` | `#F7F3EA`, `#FF9A18`, `#5CC9B8`, `#A5A0FF`, `#FF8FA8`, `#A39D94` | Series colors, in this order. A single series uses `-1` with the top value in `-2` |
| `--lv-layer-*` | `base 0`, `sticky 20`, `nav 30`, `sheet 40`, `dialog 60`, `toast 100` | | The only `z-index` values (these are the six in use today) |

### 3.3 Hub colors **[is]**

A Hub picks an accent from a fixed palette (`lv.accent_palette()`, mirrored in `src/lib/accent.ts`): indigo
`#4338CA`, blue `#1D4ED8`, cyan `#0E7490`, teal `#0F766E`, green `#15803D`, amber `#B45309`, rose `#BE123C`, violet
`#6D28D9`, slate `#334155`. Each holds white text at 4.5:1 or better. It is applied as `--hub-accent` /
`--hub-on-accent` to the Hub cover, mark, primary buttons inside the Hub's public pages and the player header.
Platform chrome (navigation, settings, billing, dialogs) keeps LunchVoice colors. A free hex color is never accepted.

## 4. Typography

Fonts, self-hosted through `@fontsource` **[is]**: display **Bricolage Grotesque** (`--lv-font-display`), interface
**Geist** (`--lv-font-ui`), data **Space Mono** (`--lv-font-mono`).

### Scale **[target; add as tokens `--lv-text-*`]**

| Token | Size / line | Font, weight | Use |
| --- | --- | --- | --- |
| `--lv-text-hero` | `clamp(34px, 6vw, 56px)` / 1.05 | display 700, tracking −0.02em | Public hero only |
| `--lv-text-h1` | `clamp(28px, 4vw, 40px)` / 1.1 | display 700, −0.02em | Public section titles; respondent question on desktop |
| `--lv-text-h2` | `clamp(22px, 3vw, 28px)` / 1.2 | display 700, −0.01em | App page title; respondent question on phone |
| `--lv-text-h3` | 18px / 1.3 | display 700, −0.01em | Card titles, dialog titles |
| `--lv-text-lead` | 17px / 1.5 | UI 400 | Public intro paragraphs |
| `--lv-text-body` | 15px / 1.5 | UI 400 | Default |
| `--lv-text-ui` | 14px / 1.4 | UI 500 | Buttons, fields, table cells, menu items |
| `--lv-text-small` | 13px / 1.4 | UI 400 | Help text, captions, badges |
| `--lv-text-micro` | 11px / 1.2 | mono 400, uppercase, tracking 0.08em | Eyebrows, column headers, codes' labels |

Rules: nine sizes, no half pixels. Map old values to the nearest step (13.5 → 13 or 14 by role; 14.5 → 14; 15.5 →
15; 10.5 and 11.5 → 11; 12 and 12.5 → 13). Numbers that people compare (counts, percentages, codes) use the mono
font with `font-variant-numeric: tabular-nums`. Headings use `text-wrap: balance`. Maximum line length 68 characters
for paragraphs. Never center more than three lines.

## 5. Space, radius, elevation, breakpoints

**Space [is]**, 4 px base: `--lv-space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 20, `-6` 24, `-8` 32, `-10` 40,
`-14` 56. Gaps inside a component: 8 or 12. Between components in a card: 16. Between cards: 16 on phone, 24 on
desktop. Between page sections: 40 app, 56+ public. Page gutter: 16 phone, 24 tablet and up.

**Radius**: `--lv-radius-field` 16 (fields), `--lv-radius-card` 24 (cards, dialogs, sheets),
`--lv-radius-hero` 28 (public feature panels), `--lv-radius-pill` 999 (every button, badges, chips) **[is]**; add
`--lv-radius-sm` 12 for small insets (menu items, tags inside a field) **[target]**. Five values replace the 33 in
use. Nested radius = outer radius − padding.

**Elevation [is]**: surfaces are named, never composed by hand.

| Surface | Background + shadow tokens | Use |
| --- | --- | --- |
| Flat | `--lv-page` | The canvas |
| Well | `--lv-well` + `--lv-well-shadow` (inset) | Fields, tracks, code inputs: things you put something into |
| Raised | `--lv-raised-bg` + `--lv-raised-shadow` | Secondary buttons, tiles, unselected options: things you press |
| Card | `--lv-surface` + `--lv-card-shadow` | Content containers |
| Popover | `--lv-popover` + `--lv-popover-shadow` | Menus, selects, tooltips, dialogs |
| Ink | `--lv-ink-bg` + `--lv-ink-shadow` | Strong buttons, the player, dark bands |
| CTA | `--lv-accent-cta-bg` + `--lv-cta-shadow` | The one primary action |
| Pressed | `--lv-pressed-bg` + `--lv-pressed-shadow` | Selected options and toggles |

High contrast removes every shadow and gradient and draws `--lv-control-border` instead; a selected control gains a
3 px border and a glyph change, so selection never depends on color.

**Breakpoints [target; nine exist today]**: `sm` 520 (large phone), `md` 720 (tablet; app navigation switches from
bottom tabs to top), `lg` 960 (desktop; multi-column layouts). Design at 360 first, verify at 390, 768 and 1280. No
horizontal scroll at any width from 320.

## 6. Motion **[is]**

| Token | Value | Use |
| --- | --- | --- |
| `--lv-ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Entrances, color and shadow changes |
| `--lv-ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Press, toggle, selection: anything touched |
| `--lv-dur-press` | 260 ms | Press and release |
| `--lv-dur-popover` | 280 ms | Menus, dialogs, sheets |
| `--lv-dur-enter` | 420 ms | Page and section entrance, staggered 40 ms per item (`.lv-enter`, `--i`) |
| `--lv-dur-toggle` | 460 ms | Switch travel |
| `--lv-dur-jelly` | 560 ms | Selection confirmation, the thank-you mark |
| `--lv-signature-*` | 9 s / 6 s / 4 s | The looping draw-on mark on the public CTA only |

Add `--lv-d1` 150 ms, `--lv-d2` 260 ms, `--lv-d3` 420 ms to `tokens.css`; they are referenced with fallbacks today.
**[target]**

Press feedback: scale 0.97 (large circular controls 0.94 × 0.88). Hover lifts a raised surface 1 px, a CTA 2 px.
Under `prefers-reduced-motion` all durations are 0 and nothing loops.

## 7. Layout

**App shell [is]**: `Shell` (header with mark, navigation, account menu; `BottomTabs` below `md`). Content in
`.wrap` (max 1000 px). Each page starts with `PageHead` (eyebrow, title, one-line description, actions on the right).

**Templates [target: name and reuse]**

| Template | Structure | Used by |
| --- | --- | --- |
| `ListPage` | PageHead → filter row → list of cards or table → empty state | Surveys, Campaigns, Members, Invites |
| `DetailPage` | PageHead with status badge and actions → tabs → sections | Campaign detail, Results |
| `EditorPage` | PageHead with save state → numbered sections in cards → sticky readiness bar with Publish | Studio, Quick Survey editor, Builder |
| `SettingsPage` | PageHead → stacked cards, one decision each → danger zone last | Hub settings, Account, Billing |
| `PlayerPage` | Progress → one question → Back / Next | Respondent |
| `StatePage` | `StateScreen` centered | Not found, closed, scheduled, ineligible, error, offline |
| `MarketingPage` | Hero → alternating sections → CTA band → footer | Public pages |

Forms: one column; label above the field; help text below in `--lv-text-small`; error replaces help text and is
announced; primary action bottom right on desktop and full width on phone; destructive actions separated and
confirmed with a typed word when irreversible.

## 8. Components

One owner per job. "Import from" is the only allowed source in a page.

### 8.1 Primitives (`@/components/shadcn/*`, restyled; `tactile.ts` holds shared surface classes) **[is]**

| Component | Variants | Notes |
| --- | --- | --- |
| `Button` | `primary` (CTA, one per view), `secondary` (default), `ink`, `quiet`, `danger`, `link`; sizes `sm` 36, `md` 44, `lg` 52, `icon` 44, `icon-sm` 36, `icon-lg` 58; `block` | Label is a verb phrase. Loading keeps width and shows a spinner beside the label. Disabled explains why nearby |
| `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Label` | – | Fields are wells. Always labelled. 44 px high |
| `InputOTP` | 6 cells | Join codes: `inputMode="text"`, uppercase, no autocorrect |
| `Card` | default, quiet | Title in `h3`. One purpose per card |
| `Badge` | `muted`, `accent`, `ok`, `danger`, `ink` | Status words only (§10) |
| `Alert` | info, ok, warn, error | Inline messages that stay. Title + one sentence + optional action |
| `Dialog`, `AlertDialog`, `Sheet` | – | Dialog for a decision; AlertDialog for a destructive confirm; Sheet for settings on phone |
| `DropdownMenu`, `Popover`, `Tooltip` | – | Tooltips never hold required information |
| `Tabs`, `Accordion`, `Table`, `Progress`, `Skeleton`, `Separator`, `ScrollArea`, `Avatar` | – | Tables get a card layout below `md` |
| `Toaster` (sonner) | success, error | Confirmation of a completed action only; 4 s; never for errors that need a decision |

### 8.2 Product components **[is unless marked]**

| Component | File | Job |
| --- | --- | --- |
| `PageHead`, `Empty`, `Loading`, `Metric`, `Meter`, `CopyField`, `PhaseBadge`, `ErrorNote` | `src/components/ui.tsx` | App page furniture |
| `StateScreen` | `src/ui/StateScreen.tsx` | Full-view states: `notfound`, `error`, `closed`, `scheduled`, `ineligible`, `offline`, `empty`, `loading` |
| `QuestionControls` | `src/ui/QuestionControls.tsx` | The five answer controls: rating circles, single choice, multi choice, yes / no, text |
| QR and results blocks | `src/components/shadcn/blocks/` | QR card, distribution bars, results summary |
| Charts | `src/components/charts.tsx` | Bars, distribution; every chart has a table alternative |
| `HubCover`, `HubMark` | `src/ui/` | Hub identity with the Hub accent |
| `Icon` | `src/components/Icon.tsx` | The only icon import in pages. 24 px grid, 1.75 stroke, round caps and joins, `currentColor` |
| `ThemeControl` | `src/ui/ThemeControl.tsx` | Light / dark / high contrast / system |
| `Checkout` | `src/components/Checkout.tsx` | Plan purchase surface with the disabled reason |
| `ShareSheet` **[target]** | – | Link, code, QR, "Post to Discord" in one component, used after publish and on locked results |
| `ResultsSealed` **[target]** | – | §9 |
| `PrivacyPromise` **[target: extract from Player]** | – | §9 |
| `PlanGate` **[target]** | – | §9 |

Duplicates to retire **[target]**: `Btn` → `Button`; `Pill` → `Badge`; `Notice` → `Alert`; `Card`/`Panel` in
`ui.tsx` → shadcn `Card`; the local `Tabs` in `ui.tsx` is renamed `NavTabs` (it is route navigation, a different
job). `lucide-react` is imported only inside `Icon.tsx` and the shadcn primitives.

### 8.3 Component states

Every interactive component defines and is checked in: default, hover, focus-visible, pressed, selected, disabled,
loading, error. Every data view defines: loading (skeleton shaped like the content), empty (what this is, why it is
empty, one action), error (what happened in plain words, Retry, support link), partial (some data withheld).

Focus: 3 px ring in `--lv-focus`, 2 px offset, on every focusable element, never removed.

## 9. Signature patterns

These five patterns are what make a screen recognisably LunchVoice. Reproduce them exactly.

**PrivacyPromise.** Shown on the player's first screen, above Start. An icon, a four-word title, one sentence.

| Survey | Title | Sentence |
| --- | --- | --- |
| Anonymous | "Your answers are anonymous" | "The creator sees totals only and cannot find out who answered." |
| Named | "Your name is shared" | "The creator will see your answers with your name." |
| Guest, anonymous | "No account needed" | "Your answers are not linked to you." |
| Guest, named with a typed name | "No account needed" | "The creator sees your answers and the name you type." |

**ResultsSealed.** An anonymous survey releases nothing while it is open, so that two readings can never be compared
to find one person's answer. Where results would be: a lock icon, "Sealed until this survey closes", the sentence
"Early answers can't be matched to people this way.", the closing time or a Close now button, and the `ShareSheet`
directly beneath. After closing with fewer than 5 answers: "Fewer than 5 people answered, so results stay withheld."
Never an empty chart, never a zero. An open **named** survey shows its results with a "Live" badge and refreshes every
20 seconds.

**Withheld.** In a chart: one bar or segment labelled "Withheld", hatched in `--lv-withheld`, last in order, with no
number. Beside the chart: "Some answers are withheld because the group is too small to stay anonymous." In a table:
the word "Withheld", never 0, a dash or a blank. A withheld mean shows "Withheld" in place of the number.

**PlanGate.** When an action needs a plan the Hub does not have, the control stays visible and the gate explains in
place: what the feature does (one sentence), which plan includes it, the price, one button. Never a disabled button
without a reason; never a modal that interrupts unrelated work. The backend decides (`lv_entitlement_required`,
`lv_limit_reached` with `limit` and `used`); the UI only presents.

**Made with LunchVoice.** On the guest thank-you screen only: after the confirmation, a quiet line and one
secondary button, "Ask your own group something. Free." Never on embedded Hub players, never before submit, never
animated.

## 10. Content

**Voice.** Plain, warm, specific. Write the way a helpful person would say it across a table.

| Do | Do not |
| --- | --- |
| "Sealed until this survey closes." | "Insufficient data to display analytics." |
| "This survey has closed." | "Error: campaign not accepting submissions." |
| "Publish" / "Share" / "Close survey" | "Submit" / "OK" / "Confirm" for everything |
| "You're on the Hub plan until 12 December." | "Entitlement state: active" |
| "We couldn't save that. Try again." | "Oops! Something went wrong 😬" |

- Sentence case for every heading, button and label. No exclamation marks in the app. No emoji.
- Buttons say what happens: verb + object. The confirm button of a destructive dialog repeats the verb ("Delete Hub").
- Errors: what happened, what to do next. Never a code alone; the code may follow in mono for support.
- Numbers: "1 answer", "2 answers"; thousands with a comma; percentages without decimals under 100 answers.
- Dates: "12 Dec 2026", times in the viewer's zone with the zone on hover; relative ("in 3 days") only within a week.
- Vocabulary: survey, Hub, code, invite, plan, anonymous, named, guest, withheld, Founding member. Never shown:
  entitlement, family, credit, personal space, tenant, token, suppressed, cohort (say "group").

**Status words** (the only ones a `Badge` may show for a survey): Draft, Scheduled, Open, Paused, Closed, Archived.

## 11. Accessibility

- WCAG 2.2 AA. Text contrast 4.5:1, large text and interface boundaries 3:1, checked in all three themes.
- Full keyboard path for every flow; visible focus; no keyboard trap; Escape closes overlays and returns focus.
- Targets 44 × 44 px in the player and on phone; 36 px minimum for dense desktop tables.
- Every field has a `<label>`; errors are tied with `aria-describedby` and announced; status changes use
  `aria-live="polite"`, errors `role="alert"`.
- Every chart has a table alternative and a one-sentence summary.
- The player works at 200% zoom and with a screen reader: question as a heading, options as a radio or checkbox
  group, progress announced as "Question 2 of 5".
- Honors `prefers-reduced-motion`, `prefers-contrast: more` and `forced-colors`.

## 12. Files **[target structure]**

```
src/ui/
  tokens.css        every --lv-* token, three themes               (exists)
  fonts.css         @font-face                                      (exists)
  base.css          reset, element defaults, focus ring             (from index.css)
  components.css    lv- classes for product components              (from ui.css, system.css, community.css)
  layouts.css       shell, .wrap, templates in §7                   (from app.css)
  motion.css        keyframes and motion utilities                  (exists)
  shadcn.css        maps shadcn variables to --lv-*; Tailwind entry (exists)
src/styles/marketing.css   public register only                     (from landing.css)
src/components/shadcn/     primitives; the only folder Tailwind scans
src/components/            product components, one file each
src/pages/<area>/<Route>.tsx   one route per file
```

Tailwind utilities work **only** inside `src/components/shadcn/`. A utility class written in a page generates no
CSS and fails silently. Pages use components and `lv-` classes.

Class naming: `lv-<block>`, `lv-<block>-<part>`, state through `data-*` attributes (`data-on`, `data-variant`,
`data-theme`), never a modifier class. No new `ui-` classes.

## 13. Adding and changing

**New screen.** Pick the register (§2) → pick the template (§7) → compose from §8 → write copy with §10 → add the
route to `src/config/routes.json` → check the list below.

**New component.** Only when no component in §8 does the job. Build it in `src/components/`, tokens only, all
states in §8.3, three themes, add it to `/__gallery` with every state, add a row to §8.2 here.

**New token.** Only when a role has no token. Add light, dark and high-contrast values in `tokens.css` and a row in
this file in the same change.

**Review checklist** (every UI change):

- [ ] Tokens only: no raw color, size, radius, shadow or duration
- [ ] Light, dark, high contrast
- [ ] 360, 768, 1280 px; no horizontal scroll
- [ ] Keyboard path and focus ring; labels; live regions
- [ ] Loading, empty, error and withheld states
- [ ] Reduced motion
- [ ] Copy follows §10; vocabulary only
- [ ] Present in `/__gallery`; e2e covers the new behavior

**Proposed gate, `npm run check:design` [target].** A script in the style of the existing checks that fails on,
outside `tokens.css`: a hex or `rgb()` color, a `font-size` not from the scale, a `border-radius` or `z-index` not
from a token, a `@media` width other than 520 / 720 / 960, a new `ui-` class, an import of `lucide-react` outside the
icon and primitive layers. It starts with a baseline file of today's violations and only fails on new ones, so
consolidation can happen page by page.

**Migration order.** 1) add the missing tokens (§3.2, §4, §6); 2) ship `check:design` with a baseline; 3) extract
`PrivacyPromise`, `ResultsSealed`, `ShareSheet`, `PlanGate`; 4) retire duplicate components (§8.2) as each page is
touched; 5) merge stylesheets into the structure in §12; 6) remove the legacy aliases in `index.css` when unused.
