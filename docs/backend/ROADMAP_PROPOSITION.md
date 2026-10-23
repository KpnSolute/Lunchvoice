# Roadmap proposition and request to Claude

Requested by the founder on **October 23, 2026**. This is a planning assignment;
the schedule below is a proposal to assess, not an approved delivery commitment.
Use **America/New_York** for dates and event scheduling.

## Assignment

Claude: start with [backend/README.md](README.md), audit the current source, and
create `docs/backend/EXECUTION_ROADMAP.md` covering **October 23-December 11, 2026
inclusive**. Develop backend contracts first and coordinate frontend work against
them. Use the [initial plan](../v2/IMPLEMENTATION_PLAN.md),
[comparison](../v2/CURRENT_STATE_AUDIT.md), [resources](../archeture/RESOURCE_MAP.md),
[architecture](../archeture/ARCHITECTURE.md), and
[Definition of Done](../v2/DEFINITION_OF_DONE.md).

Plan launch for the **start of MJCC Hub Winter Survey 2026**. Confirm the opening
date/time, timezone, operator, questionnaire, audience, closing date and fallback.
December 13 was an earlier provisional target, not a verified survey opening.
December 11 is the requested roadmap/readiness boundary. If the survey starts
before readiness, report the conflict and propose options; do not invent its date.

## Proposed work windows to refine

| Window (2026) | Proposed focus | Review evidence |
| --- | --- | --- |
| October 23-30 | Audit refresh, resource owners, identity contract, CI/dependency plan, founder decision packet | Backend design, estimates and critical path |
| October 31-November 6 | Identity compatibility, memberships/RLS, migration fixtures | Two-Hub account, preserved IDs, cross-Hub denials |
| November 7-12 | Roles/Owner, entitlement/activation contracts, public waitlist and internal prototype | Demonstrable core; November 12 remains proposed |
| November 13-20 | Campaign modes, scheduling/targeting, guest/anonymity, commerce/reservations | Replay/concurrency/privacy tests; unresolved prices not sold |
| November 21-27 | Builder/community, analytics/exports/embeds, discovery/beta | Integrated journeys, page permissions, discovery approval and owner-cap evidence |
| November 28-December 4 | Integration, non-production migration and Winter Survey rehearsal | Reconciled data, operator acceptance, rollback/recovery |
| December 5-11 | Defects, accessibility/performance/privacy, release candidate and go/no-go | DoD evidence and dated readiness decision by December 11 |
| Winter Survey opening: TBD | Launch at the confirmed event start | Separate deployment authority, opening verification, monitoring/fallback |

Work may overlap once dependencies are satisfied. Estimate real capacity; the
table is not proof the whole scope fits. Do not silently remove confirmed v2
features to meet a date. Present scope/date tradeoffs for founder approval.

## Required roadmap content

For every work item include requirement ID, backend/frontend/system area,
current state, deliverable/PR slice, owner or explicitly unassigned status,
dependencies, start/finish, effort range/confidence, test evidence, decision
deadline, resource/access need and fallback. Identify the critical path and
defect buffer. Distinguish planned, in progress, blocked and complete.

Include review checkpoints for identity, RBAC, Campaign gates, privacy, billing,
reservations, Builder/analytics, migration and release. Map all Definition of Done
criteria to work items/evidence owners. Track D-01 through D-12 without treating
proposals as approved. Test seasonal expiry separately from annual name protection.

Address existing dependency advisories, missing PR behavioral checks, staging
resources, central Identity ownership, legacy auth coexistence and the survey's
actual content/operational setup. No production database, secret, DNS, billing or
deployment change is authorized merely by preparing this roadmap.

## Planning completion

The roadmap is reviewable when every confirmed capability is scheduled or blocked
with a reason, estimates support dates, resources/owners are recorded, founder
decisions are actionable, and December 11 readiness is distinguished from the
survey opening. Commit on a feature branch, update CHANGELOG and both brain files
identically if guidance changes, validate, and provide the PR and open decisions.
Implementation follows review/approval under existing governance.
