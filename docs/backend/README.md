# Backend planning: Claude starts here

Continue LunchVoice v2 planning from source evidence. Develop backend contracts
first, then create an executable roadmap (requested for October 23-December 11, 2026;
now **October 23-December 23, 2026**). Per the founder's relayed update, **MJCC Hub and
Winter Survey launch December 11** (v2 beta), **v2 main public release December 23**,
readiness go/no-go recommended **December 9**. Confirm the survey's opening time and
timezone, closing, operator, questionnaire, audience and anonymity (D-12); the earlier
December 13 target is superseded.

Read the [index](../README.md), [product spec](../v2/PRODUCT_SPEC.md),
[comparison audit](../v2/CURRENT_STATE_AUDIT.md),
[architecture](../archeture/ARCHITECTURE.md),
[resource map](../archeture/RESOURCE_MAP.md), and
[Definition of Done](../v2/DEFINITION_OF_DONE.md).
The [roadmap proposition](ROADMAP_PROPOSITION.md) is the concrete assignment.

## First planning pass

1. Refresh branch/main/source status and mark audit drift. Inspect schema,
   functions, auth entry points, grants, jobs and workflows. Migration files do
   not prove live applied state.
2. Classify capabilities as reuse, adapt, build, externally dependent or undecided.
   Preserve LionCafe IDs, responses, points, rewards, orders, menus and staff access.
3. Complete the central identity contract and compare integration alternatives.
   Upstream OIDC federation remains a recommendation to test, not a proven migration.
4. Define membership, roles/capabilities, entitlements, Campaign lifecycle,
   guest access, anonymous-response protection, reservations and analytics boundaries.
5. Resolve or present options for D-01 through D-12. Separate engineering
   recommendations from founder decisions, including the proposed survey gate.
6. Build the dated roadmap with estimates, dependencies, owners, decisions,
   frontend contracts and a December 11 readiness gate.

## Requested next outputs

Claude created these documents on 2026-10-23 as **proposals for founder review**
(not approved scope or implementation). Keep them current as decisions land:

| Output | Required content |
| --- | --- |
| `EXECUTION_ROADMAP.md` | Dates, capacity assumptions, critical path, PR slices, owners, checkpoints, contingency and survey-launch dependency |
| `DATA_AND_MIGRATION_PLAN.md` | Source-to-target mapping, stable IDs, additive phases, fixtures, reconciliation, rollback and compatibility |
| `API_AND_AUTHORIZATION_CONTRACTS.md` | Identity/session contract, membership/capabilities, requests/results/errors, direct-write restrictions and frontend interfaces |
| `CAMPAIGN_AND_ENTITLEMENT_PLAN.md` | Mode/tier mapping, atomic activation, approved gate policy, payment interfaces, separate seasonal/reservation clocks |
| `PRIVACY_AND_OPERATIONS_PLAN.md` | Guest proof, anonymity/export/embed rules, retention, jobs/retries, monitoring, recovery and MJCC rehearsal |

Every endpoint/schema proposal maps to a requirement and allow/deny evidence.
Cross-Hub and concurrency cases must be explicit. Resources have named owners
or owner-to-assign blockers. Unknown policy is TBD, not an invented default.
Frontend may use reviewed mock contracts, but mocks do not prove backend readiness.

Planning does not authorize production migrations, secrets, paid resources,
deployments, main merges or changes to unrelated repositories.
