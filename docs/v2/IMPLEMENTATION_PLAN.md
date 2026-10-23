# LunchVoice v2 implementation roadmap

Status: handoff for Claude **after specification review and approval**.
Baseline: `main` at `0dbc343227bdb8f3cd5745f59c0247ae84841aec`.
This documentation branch does not implement features or authorize deployment.
Read [product requirements](PRODUCT_SPEC.md), [source audit](CURRENT_STATE_AUDIT.md),
[architecture](ARCHITECTURE.md), and [acceptance criteria](DEFINITION_OF_DONE.md).

## Ownership and execution rules

- Founder approves product decisions, unresolved D-01 through D-12, scope changes,
  and commercial terms. Claude owns implementation decomposition and review.
- Central Identity's implementation owner must agree to the service contract;
  LunchVoice documentation does not authorize changes in other repositories.
- Follow existing agent governance, narrowly scoped local CLI delegation where
  available, feature branches, changelog updates, brain parity, and release checks.
- Preserve LionCafe operations and the planned December MJCC Campaign throughout.
  Do not apply migrations or deploy without separate explicit operational authority.
- Every implementation PR links requirement IDs, decision IDs, evidence, tests,
  migration/rollback impact, remaining blockers, and next action. Do not label a
  feature complete because a route or table exists.

## Milestones

| Milestone | Timing | Exit evidence |
| --- | --- | --- |
| Specification approval | Before dependent implementation | Confirmed scope accepted; blocking decisions resolved or explicitly sequenced |
| Public waitlist/internal prototype | **November 12, 2026 proposed** | Waitlist available, internal Hub/Campaign prototype demonstrated; not a promised public beta release |
| Controlled beta | Before consumer launch; date TBD | No more than 50 admitted Hub owners; identity, isolation, commercial and guest/privacy paths verified |
| MJCC Campaign readiness | Before its December event; exact date TBD | Named operator rehearses legacy-compatible Campaign; data reconciliation and fallback demonstrated |
| Consumer v2 launch | **December 13, 2026 target** | All applicable release gates pass and separate production approval is granted |

These dates are goals, not estimates of completed engineering. If a gate cannot
be met, report the affected capability and revised options to the founder; do not
silently ship unprotected data or an invented entitlement.

## Dependency-ordered work packages

| Package | Requirements and source starting points | Dependencies | Exit evidence |
| --- | --- | --- | --- |
| P0: decisions and baseline | D-01..D-12; current audit; source/migrations/workflows | Spec review | Recorded decisions, scenario matrix, runtime/test plan, scoped implementation PRs |
| P1: verification foundation | `package.json`, release policy, current migrations/functions | P0 scope | Required PR checks proposed; auth path covered by heavy-test selection; dependency advisories remediated in separate PR; behavior test harness and reproducible local DB replay |
| P2: identity and memberships | V2-02/03/04; `AuthProvider`, `OrgProvider`, login/staff bridge, profiles/RLS | D-01/D-05; P1 | Central Google login contract tested; stable account mapping, multiple accepted Hub memberships, safe legacy mapping and Hub switcher |
| P3: roles and ownership | V2-07/18; current `Gate`/`is_admin` policies | P2; D-02 | 3/6 custom roles plus protected Owner; grouped/individual permissions; server denial tests, owner-only transfer/delete, revocation proof |
| P4: commerce and policy core | V2-05/06/10/11/12/13/14 | P2/P3; D-06/D-08/D-09 | Verified provider events, subscription and seasonal grants, annual reservation/grace jobs, retry/race tests; Plus remains unsellable until both prices approved |
| P5: Campaign engine | V2-08/09/19; Content Central, Survey/Surveys, existing RPCs | P3/P4; D-03/D-04/D-08 | Modes and tier mapping implemented; targeting, codes, scheduling, anonymity/guest flows; atomic total/mode caps and additional-survey gates |
| P6: Hub Builder and community | V2-20; existing layout/marketing/dining routes | P3/P4; D-11/D-12 | Three-panel builder and previews; branding/navigation; required community pages, 3 Starter custom pages; separate view/edit/publish enforcement |
| P7: analytics and publication | V2-21; Dashboard, Content Central results, invoker views | P5/P6; D-10 and tier matrix | Real-time/history, comparisons/trends/breakdowns, responsive graphs, authorized exports/embeds; anonymity preserved at every access path |
| P8: waitlist, beta and discovery | V2-15/16/17; current marketing lead form | P2/P3 and D-05/D-07; discovery requires membership data | Public waitlist first; atomic 50-owner admission; >=700 valid accepted-member application, moderated listing at discovery host |
| P9: migration rehearsal and launch | V2-01/17; legacy IDs/data/auth, Render and release pipeline | P1..P8; D-12 | Staging reconciliation, December MJCC rehearsal, rollback/restore proof, all DoD evidence, separate release authority |

Waitlist UI and synthetic prototypes can be built early once their contracts are
approved. P8's live admission/discovery checks still depend on membership/RBAC.
Independent page/analytics presentation work may proceed against reviewed mock
contracts, but mocks are not evidence of entitlement, privacy, or migration safety.

## Suggested reviewable PR slices

1. Resolve the decision register and add behavior-test infrastructure; remediate
   the existing dependency audit independently of product redesign.
2. Add account/membership schema and tested legacy mappings in additive migrations.
3. Integrate central identity in a non-production environment; implement session
   and Hub switching without broadening legacy staff privileges.
4. Implement server capability evaluation and role editor/owner transfer with
   quota, revocation, escalation, and ownership race tests.
5. Add server entitlement model and billing adapters, then subscriptions, seasonal
   activation windows, reservations, and grace/release workers in separate slices.
6. Adapt templates/sessions into versioned Campaigns. Implement lifecycle and
   total/mode limits before exposing creation/activation controls.
7. Implement each Campaign mode and its targeted/anonymous/guest paths with
   focused tests; do not assume the Survey-mode implementation covers elections.
8. Implement Builder drafts/previews/publishing and community pages with their
   own permissions and quota tests; retain legacy rewards/menu functionality.
9. Implement validated metrics, comparison views, exports and publication with
   privacy suppression and permission checks shared across every surface.
10. Complete beta/discovery, staging migration, user acceptance, operational
    runbooks, and the founder-approved production rollout proposal.

Do not combine an irreversible migration, new identity, new billing, and a UI
rewrite in one unreviewable release. Migration PRs include forward/backward
compatibility, reconciliation queries, rollback limitations, and isolation tests.

## Decision-resolution priorities

**Before identity/RBAC work:** D-01, D-02 and accepted/valid-member semantics from
D-05. **Before activation work:** D-03, D-04 and mode/tier mapping from D-06/D-08.
**Before selling:** D-06, D-08, D-09, including Plus base and extension prices.
**Before public reporting:** D-10. **Before Builder quotas:** D-11. **Before beta
admission:** D-07. **Before legacy cutover:** D-12 plus all auth/privacy decisions.

The concrete gate algorithm must specify first-survey and subsequent allowances,
which Campaign supplies participation, eligible snapshot/window, zero-member
behavior, targeted roles, and close/reopen/mode-change semantics. Founder approval
of the numeric thresholds alone is not approval of an arbitrary algorithm.

## Handoff and blockers

This phase delivers exactly five v2 documents, identical governance updates, and
CHANGELOG on `docs/lunchvoice-v2-spec`, with a PR targeting `main`. No manual version
tag, production changes, runtime code, dependency updates, or new migrations are
included. The PR description records the commit, check results, and live PR URL.

Outstanding: product decisions above; central identity service contract and
implementation; missing v2 domains; three high/two moderate dependency entries
reported by the audit; missing behavioral/PR CI coverage; and unverified deployed
migration state, staging proof, and December MJCC Campaign details.

Claude's next action after review/approval: read both brain files and the newest
changelog, confirm main and PR status, refresh the audit against any changed source,
resolve P0 decisions with the founder, then begin P1 on a new implementation branch.
The existing spec branch is documentation, not permission to run deployment hooks.
