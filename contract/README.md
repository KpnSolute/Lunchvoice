# LunchVoice API contract (v0.2.0)

Machine-readable contract for the backend, reconciled with all 49 frontend flows (F-01..F-49 in
`docs/frontend/EXPERIENCE_PLAN.md`). Authored in `contract/src` (dependency-free JavaScript), emitted to
`contract/generated/`. Do not edit generated files; run `npm run contract:build`. `npm run contract:check`
(part of `test:pr`) fails if they are stale, if a flow and an operation disagree, or if any fixture or example
does not validate against its schema.

## Frontend handoff

| What | Where |
| --- | --- |
| OpenAPI 3.1 | `contract/generated/openapi.json` |
| TypeScript types (`LvResult<T>`, one type per schema, `OperationMap`) | `contract/generated/types.ts` |
| Operation index (status, milestone, auth, flows, capabilities, decisions) | `contract/generated/operations.json` |
| Request/response pairs per operation, including failures | `contract/generated/examples.json` |
| Schema-level fixtures (contexts, roles, entitlements, Campaign states, receipts, analytics, gate cases, one failure per error code) | `contract/generated/fixtures/*.json` |
| Flow to operation map | `x-flow-map` in `openapi.json` |

Fixtures are deterministic and synthetic: generic Hub names, fixed UUIDs, fixed timestamps. No real people,
MJCC/LionCafe settings, survey content or policy values.

### Calling convention

v2 operations are Postgres functions exposed as PostgREST RPC: `POST /rest/v1/rpc/lv_*` with headers `apikey`
(publishable key) and, for signed-in calls, `Authorization: Bearer <Supabase access token>`. They return HTTP 200
with `{ ok: true, data, request_id }` or `{ ok: false, error: { code, message, details? }, request_id }`. Gateway
or transport failures use PostgREST errors (non-200). Branch on `error.code`, never on `message`.

Error codes: `lv_unauthenticated`, `lv_forbidden`, `lv_not_member`, `lv_not_found`, `lv_hub_mismatch`,
`lv_quota_exceeded`, `lv_gate_unmet`, `lv_entitlement_missing`, `lv_lifecycle_invalid`, `lv_conflict`,
`lv_policy_undecided`, `lv_rate_limited`, `lv_invalid_input`. Each operation lists the codes it can return
(`x-errors`).

### Endpoint status (`x-status`)

| Status | Meaning |
| --- | --- |
| `implemented` | Live in production today. Only the legacy v1 surface (`login-start`, `staff-sso`, `staff-login`, `staff-status`, `menu-sync`, `join_session`, `join_available_session`, `submit_response`, `redeem_item`). |
| `implemented-nonprod` | Built in a reviewed migration and tested in an isolated database, not applied to production. Flipped per module as each PR lands. |
| `proposed` | Specified here, not built. Use a labelled mock adapter. |
| `blocked-decision` | Cannot be built until the decisions in `x-decisions` are made (D-xx in `docs/archeture`). Show a "not available yet" state. |

At v0.2.0 nine operations are `implemented-nonprod` (identity, Hub and membership: `lv_my_context`, `lv_hub_public`,
`lv_member_count`, `lv_join_hub`, `lv_decide_join`, `lv_leave_hub`, `lv_remove_member`, `lv_suspend_member`,
`lv_members_list`). They exist in migration `20261024000100` and are tested in a throwaway database; **none is applied to
production**, so the real endpoints do not exist yet. Everything else is `proposed` or `blocked-decision`. A mock
adapter must be visibly labelled and must never act as a production auth bypass.

### Capabilities, entitlements, undecided values

- `Membership.capabilities` is **advisory** (for hiding controls). The server re-checks every call and returns
  `lv_forbidden` regardless. Operations list required capability ids in `x-capabilities`.
- `Entitlements.limits.*.limit` is `null` when the policy is undecided; it is **never** "unlimited". The
  `undecided` array names those limits. Render "not set yet".
- `GateStatus.met` is `null` when the bootstrap rule is undecided (zero eligible members).
  Starter requires `2R > M`; Team requires `5R >= M`; integer arithmetic, no rounding.
- Anonymous analytics return `lv_policy_undecided` or `policy.status = "undecided"` with no groups until the
  suppression threshold (D-10) is decided. The `min_cohort` in the applied fixture is a test value only.
- Owner is protected, outside role slots, and can only change via the transfer flow.

### Idempotency

`lv_campaign_activate` and `lv_submit_response` take an `idempotency_key` (UUID). Retrying with the same key
returns the first result (`replay: true` / `duplicate: true`), never a second effect.

### Changing the contract

Edit `contract/src`, run `npm run contract:build`, commit the generated output, and add a CHANGELOG entry. Bump
`CONTRACT_VERSION` in `src/assemble.mjs` for breaking changes (removed/renamed operations or fields); additive
changes bump the minor version. The Codex frontend preview adapter (`LvResult`, `Membership`, `LvContext`,
`GateStatus`) is compatible with these shapes.

## Modules

identity, hubs, roles, entitlements, campaigns, participation, analytics, pages, growth, billing, connectors,
legacy. Each has its own `src/schemas/*.mjs` and `src/ops/*.mjs` pair so parallel work does not touch the same
files.

## Backend stack (D-14)

D-14 is not approved. Nothing in this contract depends on it: the v2 operations are Postgres functions behind
PostgREST and the same schemas could be served by another runtime later. FastAPI is a candidate runtime for the
Stripe webhook receiver, identity brokering, scheduled jobs and connector ingress, not a requirement; those
pieces could also be Edge Functions or database jobs. Work that does not depend on the choice continues.

## Contract changes

| Version | Change | Frontend impact |
| --- | --- | --- |
| 0.2.0 | `HubPublic.member_count` is now `number \| null` (null when the Hub is private and the caller is not an accepted member; previously always a number). Nine identity/Hub/membership operations move to `implemented-nonprod`. `lv_decide_join` can return `lv_invalid_input` and no longer lists `lv_hub_mismatch`; `lv_suspend_member` can return `lv_conflict`; `lv_remove_member` no longer lists `lv_hub_mismatch`. Capability `community.moderate` was renamed `community.comments.moderate` (0.1.0 to 0.2.0 pre-release rename). | Handle a null member count. Membership `roles` and `capabilities` are empty arrays until the roles migration lands; `Context.pending` is always present; `GateStatus.policy_version` is required. |
| 0.1.0 | Initial contract. | |
