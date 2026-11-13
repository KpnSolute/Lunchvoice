# Handoff: respondent names, live results, results privacy by plan, Creator studio (2026-11-13)

For the Claude worker. Read `AGENTS.md`, `CLAUDE.md`, the newest `CHANGELOG.md` entries and `docs/v2/LAUNCH_PLAN.md` first.
This is four pieces of work. Each piece says which thread it belongs to (UI or backend), what needs approval first,
and how to prove it is done. When you finish, report back in the format at the end of this file.

## Objective

Make LunchVoice surveys feel finished for a creator who is showing them to a real audience:

1. A signed-in person can change the name their answers carry.
2. Results can be shown live, Kahoot style, on a big screen.
3. Results privacy follows the plan: lower plans wait for enough answers, Creator Plus gets private, instant results.
4. The survey editor for Creator Plus looks and works like a professional tool.

## Scope and branch

- Branch: `claude/survey-names-results-studio` off `main` (or the KpnRelay branch you are given).
- UI thread: `src/pages/Player.tsx`, `src/pages/Results.tsx`, `src/pages/Studio.tsx`, `src/pages/QuestionWorkbench.tsx`,
  `src/pages/SurveyDraft.tsx`, new components under `src/ui/` (register them at `/__gallery`).
- Backend thread: new numbered migrations after `000051`, `docs/backend/API_CONTRACT.md`, `src/lib/lvApi.ts` types.
- Out of scope: pricing changes, checkout, anything Hub-specific. Never special-case a customer Hub (LionCafe, MJCC).

## What already exists (read before building)

| Fact | Where |
|---|---|
| Guests in an identified survey get a name box; mode `off / optional / required` | `000028_v2_guest_names.sql`, `lv.submissions.guest_name`, `Player.tsx` line ~222 |
| Signed-in people only see "Answering as {session.name}" with no way to change it | `Player.tsx` line ~238 |
| `lv_submit_response(p_campaign, p_answers)` takes no name | `src/lib/lvApi.ts`, migrations |
| Anonymous results: hidden while the Campaign is active, and below `campaign.min_cohort` (5) after it closes; free text never published | `000005_v2_privacy_analytics.sql`, `src/config/privacy.ts` (`ANON_MIN_ANSWERS = 5`) |
| Identified results: shown from the first answer on every plan (`v_min = 1`) | `000005`, same function |
| Linked questions already exist ("Show only if", jumps, sections), gated by `survey.branching` | `000041`, `000042`, `LogicPanel.tsx` |
| Survey branding gated by `survey.branding` | `000041` |
| Creator Plus and Creator Pro are account-scoped plans | `000041`, `src/config/pricing.ts` |
| Join codes (6 characters) and sign-in answering | `000050_v2_campaign_by_code.sql` |

Do not rebuild branching. Earlier notes said LunchVoice had no conditional questions; that was wrong.

## 1. Respondent names (UI + backend)

Problem seen on a live identified survey with `guest_names = required`: a signed-in respondent is locked to their
account name and cannot answer as "Maurice from Corporate" or a preferred name.

Build:

- Backend: add an optional `p_display_name text` to the submit RPC (new overload or a new `lv_submit_response_v2`;
  keep the old signature working). Store it on the submission (reuse `guest_name` or add `display_name`; pick one and
  document it). Trim, collapse spaces, 1 to 40 characters, reject control characters. Ignore it entirely when the
  Campaign is anonymous: never store a name on an anonymous answer.
- UI: in the "Answering as" chip add a **Change** button that opens an inline field prefilled with the account name.
  Remember the choice per device (same pattern as the guest name `localStorage` key). Anonymous surveys show
  "Your answers are anonymous" and no name control.
- Results: show the chosen name, with a small tag "Account" or "Guest" so a creator can tell them apart. The account
  identity stays the `(issuer, subject)` pair; the display name is only a label and never used for authorization or
  de-duplication.

Acceptance:

- Signed-in respondent changes the name, submits, the creator sees the new name tagged "Account".
- Guest flow unchanged for `off / optional / required`.
- Anonymous survey: no name field, and a crafted RPC call with a name stores nothing (database test).

## 2. Present mode: Kahoot-style live results (UI, small backend read)

Build a **Present** button on the Results page that opens a full-screen view for a projector:

- One question per slide, large type, arrow keys and on-screen buttons to move, Escape to leave.
- Choice and yes/no questions: bars that grow as answers arrive, with count and percent; ratings as a bar per score
  and the average. Text questions: a word cloud plus a scrolling list of answers (identified surveys only).
- A live answer counter and the join code and short link in a corner, so people can still join.
- Identified surveys only: a quiet "Just answered: Ana, Jordan" line. Never on anonymous surveys.
- Poll every 3 to 5 seconds (or Supabase realtime if the contract already allows it), pause when the tab is hidden.
- Anything the server withholds shows as "Waiting for more answers" or "Shown when the survey closes", never as zero.
- Respect reduced motion (no growing bars, just updated numbers) and keep contrast for a projector in light and dark.

Acceptance: with a seeded identified Campaign, answers submitted from a second browser appear on the Present slide
within one poll; an anonymous Campaign in Present mode shows the withheld message and no names.

## 3. Results privacy by plan (backend first, needs approval)

What the founder asked for: below 5 answers, results stay hidden on Starter Hub and the Free Quick Survey; Creator Plus
can run **private** surveys where only people with the link answer and the creator sees results instantly.

Recommendation, to confirm with the founder before building:

- **Keep the anonymous protections on every plan, Creator Plus included.** They protect respondents, not the creator: with
  fewer than 5 anonymous answers a creator can often tell who said what. Paying should not switch that off.
- Apply the new plan rule to **identified** surveys, which today show results from the first answer on every plan:
  - Free Quick Survey and Starter Hub (and Campaign Starter): identified results are hidden until 5 answers.
  - Creator Plus, Creator Pro, Team Hub, Campaign Plus: identified results show instantly.
- "Private survey" (Creator Plus): link or invite only, not listed in any Hub feed or Discover, results visible only to
  the creator and people they share them with. Free Quick Surveys are already link or invite only, so the paid
  difference is instant results and the private-results sharing control.
- Ambiguity to confirm: "the people who get the link get surveyed instantly" could also mean respondents see the
  results right after answering. Ask; do not build respondent-visible results without a yes.

Build after approval:

- New entitlement keys in the single entitlement map (for example `results.instant` and `survey.private`), evaluated on
  the server in the analytics function. The UI only explains the server's answer (reuse the withheld message).
- Starter and free creators see "Results appear after 5 answers (2 so far)". Show the count; it is not sensitive for an
  identified survey. Offer the Creator Plus upgrade as **Coming soon** if checkout is not live.
- Database tests for each plan family, for anonymous and identified, active and closed.

Approvals needed first:

- A Loom verdict and founder approval: this is an entitlement change, and `AGENTS.md` says "Other Creator perks are not
  approved yet". Update the pricing section of `AGENTS.md` and `CLAUDE.md` together once approved.
- Applying the migration to production needs `docs/backend/PRODUCTION_RESET_RUNBOOK.md` and explicit owner approval.
  A passing local test does not authorize it.

## 4. Creator studio revamp (UI, needs design approval for new standards)

Reference: the Kahoot creator, explored on 2026-11-13. Take the layout ideas, not its look, colours or wording; LunchVoice
keeps its own tokens and brand.

Layout for Creator Plus and above (free creators keep the current simple editor, with a preview of the pro editor):

- **Left rail:** question thumbnails in order, drag to reorder, number and type icon on each, section dividers, a
  right-click or `...` menu (Duplicate, Move to section, Delete), and **Add question** at the bottom.
- **Centre canvas:** the question as the respondent will see it, edited in place: title, optional image, answer tiles.
  Tiles are large and colour-coded with a shape as well as a colour (never colour alone). "Add more answers" under them.
- **Right panel:** question type, required, linked logic ("Show only if", reusing `LogicPanel`), section, and for text
  questions the length limit. A **Theme** tab with the existing `survey.branding` options.
- **Type picker**, grouped the way creators think:
  - Choose: single choice, multiple choice, yes/no.
  - Rate: rating scale (and NPS 0 to 10 if the founder approves a new kind).
  - Write: short text, long text.
  New question kinds (slider, ranking, word cloud) need a backend kind and founder approval; list them as proposals.
- **Top bar:** survey title, Preview (phone and desktop), Save status ("Saved" / "Saving..."), Share, and Publish.
- **Start screen** when creating: Blank, From a template (`src/config/campaignTemplates.ts`), and "Start from a
  description" (AI) only if an approved AI path exists; otherwise leave it out, do not stub it.
- Phone: rail becomes a bottom strip of thumbnails, properties open in a sheet.

Follow the Frontend Design Protocol in `AGENTS.md`: the `design-system` and `frontend-design` skills, check light, dark
and high contrast at 390, 768 and 1280, keyboard only (reorder with keys, not only drag), reduced motion, screenshots.
New reusable components go to `/__gallery` and the component map. Any new token value or global rule needs founder
approval through `docs/frontend/design-system/DESIGN_EXTENSIONS.md`.

Acceptance: a Creator Plus account builds a 10-question survey with two sections and one linked question without
leaving the canvas; a free account sees the simple editor; `npm run check:design` passes; Playwright covers create,
reorder, logic and publish.

## Order of work

1. Piece 1 backend + UI (small, unblocks the live survey).
2. Piece 2 Present mode (UI; no entitlement change).
3. Piece 4 studio revamp (UI; can start in parallel with 2 on separate files).
4. Piece 3 only after the Loom verdict and founder approval.

## Checks before any push

`npm run check:brain`, `npm run build`, `npm run test:pr`, `npm run check:design` for UI pieces, and
`scripts/db-test-canonical.sh` for every migration (with its rollback in `supabase/rollbacks/`). Update `CHANGELOG.md`
under `[Unreleased]` in the same commit. Never push to production or apply migrations without the approvals above.

## Report back (copy this, fill it in, add it to the end of this file and to CHANGELOG.md)

```
## Worker report (date)
Objective: ...
Branch / commits / PR: ...
Changed files: ...
Ready: (table: piece, what works now, how it was checked)
Linked: (migrations, API contract sections, gallery entries)
Blocked or needs a decision: ...
Where this brief was off: ...
Checks run and results: ...
Next command: ...
```
