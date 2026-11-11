# Handoff: UI and interaction review (2026-11-11)

- **Objective:** work through the review brief of 2026-11-11 (blank use-case pages, calls to action that follow billing,
  sign-in copy, pricing on phones, homepage content, accessibility, button style, one brand source).
- **Scope:** frontend, `scripts/seo-prerender.mjs`, docs. No migration, no Render change, no production data touched.
- **Branch:** `claude/upbeat-fermi-6gjqjn` (two commits: the P0 restore, then the review work).
- **Checks:** `npm run test:pr` (now includes `test:unit`), `npm run test:e2e` 121/0.

## Ready

| Task | State |
| --- | --- |
| P0 use-case pages | Restored. Cause: PR #63 was squashed from a branch older than #62 and reverted it. Build now fails if a prerendered page or a `render.yaml` rewrite has no file. |
| P1 calls to action | One state (`src/lib/billingState.ts`) for `/`, header and `/pricing`; tested closed and open, signed in and out. |
| P1 sign-in | Copy explains KpnSolute and what happens next. |
| P1 compare table on phones | Plan picker, no sideways scroll at 360px, no placeholder text. |
| P2 pricing layout and wording | Three plus two; Starter second; plain words. |
| P2 homepage | Label, hero actions, join button, illustrations labelled as samples. |
| P2 accessibility | Amber text token, 44px targets, 12px floor, header action hidden on `/waitlist` and `/signin`, Sign in in the phone menu. |
| P3 buttons | Flat secondary and ink on public pages; primary keeps the glow. |
| P3 brand source | `DESIGN.md` and the brand README follow `tokens.css`. |

## Blocked or needs a decision

1. **Signed-out "billing is open" needs migration 000035 in production** (`lv_plan_limits().billing`). It is built and
   tested but not applied. Until then signed-out visitors always see the closed state, which is true today. Applying it
   needs the runbook and owner approval.
2. **Direct "Continue with Google" / email buttons** need KpnIdentity to accept a provider hint on `/oauth/authorize`
   (for example `provider=google`) and, for email, an email sign-in method. LunchVoice sends only standard OIDC
   parameters today.
3. **Real screenshots or a live demo survey** on the homepage need a founder-owned public survey (its join code) or
   approved captures. Nothing was invented: the panels are kept and labelled as samples.
4. **Warmer page background (closer to Cream `#FAF7F2`)** is not done. It is a one-token change (`--lv-page`) and needs
   founder approval; it was to be a separate PR and this session had one branch.
5. **Button radius on public pages** stays a pill. The Hub Console direction (rectangular, small radius) was written for
   Hub pages; changing the public brand shape is a founder call.
6. **Team "Active Campaigns" number** is provisional in the backend (15, policy note A-04). The compare table shows the
   backend value. Fix the number or say to hide the row.
7. **Process:** PR #63 deleted #62 without a conflict. Rebase before squash-merging, or require branches to be up to date
   with `main` in branch protection. No in-repo test can catch a merge that also deletes the tests.
8. **Render:** no change needed. The dashboard rules already point at the use-case files this build writes again. Verify
   after deploy: `curl -s https://lunchvoice.com/use-cases/event-feedback-form | grep "<title>"`.

## Where the brief was off

- A signed-out billing API does exist: `lv_plan_limits` is public and carries `billing` since 000035 (not yet applied).
- `PRODUCT.md` said Campaign Plus has no price; `AGENTS.md` (founder, 2026-11-07) sets $39. `PRODUCT.md` is corrected.
- `DESIGN.md` described tokens in `src/index.css` and a library "not started"; both were stale.

## Next command

`npm run test:pr && npm run test:e2e`, then merge and run the curl check above against production.
