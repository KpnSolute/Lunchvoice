# LunchVoice API contract (v0.10.0)

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

At v0.7.0 thirty-eight operations are `implemented-nonprod`: identity, Hub and membership (migration `20261024000100`: `lv_my_context`,
`lv_hub_public`, `lv_member_count`, `lv_join_hub`, `lv_decide_join`, `lv_leave_hub`, `lv_remove_member`, `lv_suspend_member`,
`lv_members_list`) and roles, capabilities and Owner transfer (migration `20261024000200`: `lv_capability_catalog`, `lv_role_list`,
`lv_role_create`, `lv_role_update`, `lv_role_delete`, `lv_role_assign`, `lv_role_unassign`, `lv_role_set_capability`,
`lv_role_set_group`, `lv_owner_transfer_start`, `lv_owner_transfer_accept`, `lv_owner_transfer_cancel`) and entitlements and the Campaign lifecycle
(migration `20261024000300`: `lv_entitlements`, `lv_gate_status`, `lv_campaign_create`, `lv_campaign_list`, `lv_campaign_get`, `lv_campaign_update`,
`lv_campaign_questions`, `lv_campaign_schedule`, `lv_campaign_activate`, `lv_campaign_close`, `lv_campaign_activation_status`) participation (migration `20261024000400`: `lv_campaign_resolve`, `lv_submit_response`, `lv_my_receipts`) analytics (migration `20261024000500`: `lv_analytics_query`) and the public waitlist and Hub settings (migration `20261024000600`: `lv_waitlist_join`, `lv_hub_settings_update`). They are tested in a throwaway
database; **none is applied to production**, so the real endpoints do not exist yet. Everything else is `proposed` or `blocked-decision`. A mock
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

## Quotas, the participation gate and what to display

The server is the only enforcement authority. Activation (manual, reopening and scheduled) runs one function under a Hub-level lock that checks, in
order: permission, lifecycle, entitlement, quota, gate. Show what the server tells you; never compute or cache an "allowed" yourself.

- `lv_campaign_activation_status(campaign_id)` returns `can_activate`, every `blockers[]` entry in the order the server checks them (same `code` and `details`
  that `lv_campaign_activate` would fail with), `quota.active_total` / `quota.active_survey` as `{used, limit}`, and a `gate` state. Use it to enable or disable the
  Activate button and to render the reason. `lv_entitlements` gives plan, active grants and limits for the billing screen; `lv_gate_status` gives the gate numbers.
- A `limit` of `null` means undecided, never unlimited. Starter is 15 active Campaigns and 2 active surveys; Team is 5 active surveys, with Team pages and Team
  active-Campaign totals undecided (so a Team-only Hub cannot activate until that is decided, P-17). `used` counts Campaigns that are active right now.
- `lv_policy_undecided` with `details.missing` (for example `gate.measurement`) means a rule the founder has not set; show "not available yet", not an error.
  `lv_entitlement_missing` means no active plan grant (beta or manual access is not a paid tier). `lv_quota_exceeded` carries `{limit_name, limit, used}`.
  `lv_gate_unmet` carries `{numerator, denominator, plan}` (participants out of eligible members).
- The gate compares exact integers: Starter needs strictly more than 50% of eligible accepted members, Team at least 20%. Guests and repeat responses never count.
- Idempotency: send a fresh UUID per user-initiated activation and reuse it only for retries of the same click; a retry returns the first result with `replay: true`.
- A Campaign past its closing time is returned as `expired` even before the expiry job runs. Closed Campaigns can be reopened until then; expired ones cannot.

## Participation, receipts and privacy

- `lv_campaign_resolve(code)` finds a Campaign by join code (case-insensitive). A private Hub's Campaign resolves only for its accepted members; everyone else gets
  the same `lv_not_found` as a wrong code. Drafts and scheduled Campaigns never resolve.
- `lv_campaign_questions` then `lv_submit_response(campaign_id, answers, idempotency_key)`. Answers are `[{question_id, value}]`: rating/slider/flame/nps = whole number in the
  question's `scale_min..scale_max`; yes_no = boolean; single_choice = one option string; multi_choice = distinct option strings; ranking = every option once, in order; text =
  string up to 2000 characters. Required questions must be answered. Failures are `lv_invalid_input` with `details.reason` (and `question_id`) so a form can point at the field.
- **One response per person per Campaign.** Whatever idempotency key or answers a second attempt uses, the server returns the ORIGINAL receipt with `duplicate: true`. Treat a duplicate as
  success ("you already took part"), not an error, and do not show a second reward. This holds after close and after reopening. Show "closed" when you get `lv_lifecycle_invalid`.
- `Receipt.reward_state` is `unset` (reward policy undecided; `points` is `null`, never 0), `recorded` or `not_applicable`. Do not display or promise points when it is `unset`.
- `lv_my_receipts` lists only the caller's own receipts and never any answers. No operation returns anyone's answers; results arrive only as privacy-guarded aggregates in the analytics
  migration.
- Anonymous Campaigns (`anonymous: true`) store answers with no account and no link to the receipt. The UI may say responses are stored without your name attached; it must not claim more
  than that (see P-23 for what is still undecided).
- Guests are not available: there is no guest entry point and `guest_access: link` is rejected until the guest proof is decided (D-03).

## Archived legacy sessions

The legacy bridge (operator-run, not an API) can archive HISTORICAL LionCafe survey sessions as closed Campaigns with `legacy_historical: true` and `legacy_session_id` set.
They appear in `lv_campaign_list` (state `closed`), their join code resolves for Hub members, and each participant sees their own receipt in `lv_my_receipts` with the
original date and the points the legacy app awarded (`reward_state: recorded`). They are history, not Winter Survey work: label them "archived" or filter them out of
operator views, never offer Activate/Reopen/Edit (the server refuses with `reason: legacy_historical`), and never show results for them (`legacy_record_policy_pending`).
They use no quota slot and do not count toward the participation gate. Live sessions are not archived; the legacy app keeps serving them until a cutover is authorized.

## Waitlist and Hub settings

- `lv_waitlist_join(email, intended_hub_name?)` works for signed-out visitors. It is **closed until the founder has decided four things** (opening, the consent wording, retention and the
  removal channel): while any is missing it answers `lv_policy_undecided` with `details.missing` (show "the waitlist opens soon", not an error), and a deliberately closed list answers
  `{status: "closed"}`. A new and a repeat sign-up look identical (`queued`) on purpose; never tell a visitor "you are already on the list". `lv_rate_limited` carries
  `details.retry_after_seconds` and reflects only that visitor's own recent attempts. The consent/privacy wording beside the form is a founder decision (P-37): do not invent it.
  What is stored, plainly: the email address (lower-cased), the optional Hub name, the approved-wording version shown and a deletion date, in a private table nobody can read through
  the API; the throttle keeps only salted hashes of the address and of the caller's origin, never raw addresses or IPs, for 7 days. The proposal for wording, retention and removal is in
  `contract/WAITLIST_PROPOSAL.md` (unapproved).
- `lv_hub_settings_update(hub_id, name?, visibility?, membership_mode?)` changes the Hub's v2 display name, visibility and join mode (capability `admin.settings.edit`). The response is the
  new settings, and `lv_hub_public` / `lv_my_context` reflect it immediately. The slug and the legacy organization name never change here.

## Analytics: what you may show

`lv_analytics_query(campaign_id, metric, question_id?)` returns aggregates only (`participation`, `completion`, or one question's `answer_distribution`). There are no filters,
cross-tabulations, time slices, free-text or ranking results, and no export or embed (those operations are `blocked-decision`).

- **Unavailable is not zero.** When privacy policy is missing the call fails with `lv_policy_undecided` and `details.missing` naming the keys (`analytics.min_cohort`,
  `analytics.min_participants`, `analytics.disclosure_controls`; a threshold alone is not enough). Show "results not available yet", never an empty chart. Other `details.reason`
  values: `live_anonymous_results_restricted` (anonymous results appear only after the Campaign finishes), `population_changed_after_release` (responses changed after the first
  release, so results stay hidden to prevent differencing), `question_type_not_available` (text and ranking questions).
- **Suppressed is not zero.** A group or participant total that is withheld has `n: null`, `value: null`, `suppressed: true` and a `reason` (`below_min_cohort`, `complementary`,
  `below_min_participants`). Render it as "withheld", never as 0. A shown `0` is a real zero. Do not try to reconstruct a withheld number from totals; some cells are withheld
  precisely so that cannot be done.
- **Members and guests are separate.** `participants.member` and `participants.guest` are never added together and every group has an `audience`. Do not show a combined figure.
- **State the population.** Show `population` and `window` next to the numbers, and `freshness_at` as "as of". `policy.status` is `applied` (suppression rules in force) or
  `not_required` (an identified Campaign with no guests, where the Hub already knows who answered).
- Anonymous results are available only for finished Campaigns. Do not poll an active anonymous Campaign for results.

## Owner transfer and reauthentication

`lv_owner_transfer_start` and `lv_owner_transfer_accept` fail closed with `lv_policy_undecided` until the founder sets the
reauthentication requirement and offer lifetime (P-11). When set, they require a recently authenticated access token from BOTH the
Owner and the recipient; if it is missing or stale the answer is `lv_forbidden` with `details.reason = "reauthentication_required"`.
The UI must then send the person through sign-in again and retry with the new token. The database only checks the token's `amr`
claim; whether Google or the central identity really forces a fresh sign-in (D-01) is a separate integration that no database test
proves. Roles never grant Owner transfer or Hub deletion; they are outside the capability catalog.

## Provisional choices

Some implemented behaviour is a placeholder, not approved policy. Each is registered in
`contract/src/provisional.mjs`, shown per operation as `x-provisional`, and listed in
`contract/generated/PROVISIONAL.md` with the open decision it depends on. Merging code that implements one does not
approve it; the decision must be recorded in the decision register before it reaches production. Do not present these
to users as settled rules.

## Contract changes

| Version | Change | Frontend impact |
| --- | --- | --- |
| 0.8.0 | `Campaign` gains the required boolean `legacy_historical` (false for everything native). New error reasons: `lv_campaign_activate`/`lv_campaign_activation_status` -> `lv_lifecycle_invalid` with `details.reason = legacy_historical`; `lv_analytics_query` -> `lv_policy_undecided` with `details.reason = legacy_record_policy_pending`. No new operations: the bridge is operator-only. Provisional P-42 to P-46. | Add `legacy_historical` to the Campaign type, show archived Campaigns as read-only history, never offer Activate/Edit/Results for them. |
| 0.9.0 | New operations `lv_beta_apply`, `lv_beta_my_application`, `lv_beta_applications_list`, `lv_beta_decide`; `lv_hub_create` is now real (`HubCreateResult`) and `lv_beta_admit` is removed (superseded). New error codes `lv_email_unverified`, `lv_slug_unavailable`. Hub creation answers `lv_policy_undecided` (`details.missing` = `beta.terms`, `slug.reserved`) until the founder decides them. Provisional P-47 to P-49. | Build the apply -> pending -> approved -> create-your-Hub flow; no Owner is ever assigned by hand; show the policy-pending state honestly; a person must call `lv_my_context` first (it creates their account on first sign-in). |
| 0.10.0 | New operations `lv_invite_create` (returns the code ONCE), `lv_invite_list`, `lv_invite_revoke`, `lv_invite_preview` (anon), `lv_invite_redeem`. Invalid, expired, revoked and used-up codes are indistinguishable (`lv_not_found`). `lv_join_hub` still refuses codes; use `lv_invite_redeem`. Provisional P-50. | Build invite management and the join-by-link screen; keep the code in the client through sign-up; call `lv_my_context` after sign-in, then `lv_invite_redeem`. |
| 0.7.0 | `lv_waitlist_join` and `lv_hub_settings_update` are `implemented-nonprod`. `lv_waitlist_join` can return `lv_policy_undecided` (waitlist not opened, with the missing keys), status `closed`, `lv_rate_limited` (own attempts only) and `lv_invalid_input`; the status `duplicate` is never returned (no enumeration). The waitlist needs four decisions before it can open, not one. Hub names in `lv_hub_public` and `lv_my_context` now come from the Hub's display name when set, else the organization name. Provisional P-36 to P-40. | Build the landing waitlist form against these states; do not claim whether an address is already registered; add a Hub settings form (name, visibility, join mode) gated by the `admin.settings.edit` capability. |
| 0.6.0 | `lv_analytics_query` is `implemented-nonprod`. **Breaking shape change:** `AnalyticsResult` replaces `total_participants` with `participants: {member, guest}` (each `{n, suppressed, reason}`), adds `question_id`, `population`, `window`, `groups[].audience` and `groups[].reason`, and `policy.status` is now `applied` or `not_required` (it can no longer be `undecided`: undecided policy is an error). New schema `AnalyticsCount`. `lv_analytics_export`, `lv_analytics_embed_create`, `lv_analytics_embed_revoke` are `blocked-decision`. Provisional choices P-28 to P-35. | Rebuild the results view on `participants`, `groups[].audience/suppressed/reason`; render withheld values as withheld, never 0; handle the four `lv_policy_undecided` reasons as "not available yet" states; hide export/embed controls. |
| 0.5.0 | Three operations move to `implemented-nonprod`: `lv_campaign_resolve`, `lv_submit_response`, `lv_my_receipts`. `Receipt` gains the required field `reward_state` (`unset` / `recorded` / `not_applicable`); `Receipt.points` is `null` while no reward policy exists (the old fixtures showed an invented 50). `lv_submit_response` errors are now `lv_unauthenticated`, `lv_not_found` (non-member, other-Hub member and unknown Campaign are indistinguishable), `lv_lifecycle_invalid` (`details.reason` `not_active` or `closed_by_time`), `lv_invalid_input` (`details.reason`, `question_id`), `lv_policy_undecided` (mode). `lv_campaign_resolve` errors are `lv_not_found` and `lv_invalid_input`. Provisional choices P-20 to P-27. | Add `reward_state` to receipt handling and never show points when it is `unset`; treat `duplicate: true` as success; map `details.reason` to field errors; show a closed/expired state on `lv_lifecycle_invalid`. |
| 0.4.0 | Eleven operations move to `implemented-nonprod`: `lv_entitlements`, `lv_gate_status`, `lv_campaign_create/list/get/update/questions/schedule/activate/close`, plus the NEW `lv_campaign_activation_status` and schemas `ActivationStatus`, `Blocker`, `GateState`. `lv_gate_status` and `lv_campaign_activate` fail closed with `lv_policy_undecided` and `details.missing` until five policy keys are decided (P-14 to P-16). `lv_quota_exceeded.details` now always has `limit_name` (`active_total` or `active_survey`); `lv_gate_unmet.details` now includes `plan`. Provisional choices P-14 to P-19. `lv_grant_manual` stays `proposed`: no grant can be issued through the API. | Drive the Activate button, quota meters and gate panel from `lv_campaign_activation_status`, `lv_entitlements` and `lv_gate_status`; render `policy_pending`, `no entitlement` and `Team total undecided` as "not available yet" states; send an idempotency key per activation; treat `expired` as final. |
| 0.3.0 | Twelve role, capability and Owner-transfer operations move to `implemented-nonprod`. `Membership.roles` and `Membership.capabilities` and `MemberRecord.roles` are now populated (the Owner's `capabilities` lists every delegable capability). New error details: `reason = cannot_grant_unheld_capability` (with `missing`), `role_exceeds_your_authority`, `target_exceeds_your_authority`, `reauthentication_required`. `lv_role_assign` and `lv_role_unassign` no longer list `lv_hub_mismatch`. `lv_role_update`: null leaves a field unchanged, an empty icon clears it. `lv_owner_transfer_start/accept` can return `lv_policy_undecided`. Provisional choices P-07 to P-13 registered. | Render custom roles, the three category toggles (Administration, Hub Appearance & Structure, Community & Campaigns) and slot usage from `lv_role_list`; show "not available yet" for Owner transfer until the policy is set; handle `reauthentication_required` by re-signing in; keep Owner transfer and Hub deletion out of any permission toggle UI. |
| 0.2.0 | A supplied `invite_code` on `lv_join_hub` is refused with `lv_policy_undecided` and `details.reason = "invite_code_unsupported"` (it was silently ignored in the first draft); account-bound invitations still work without a code. Provisional choices are now registered (`x-provisional`). `HubPublic.member_count` is now `number \| null` (null when the Hub is private and the caller is not an accepted member; previously always a number). Nine identity/Hub/membership operations move to `implemented-nonprod`. `lv_decide_join` can return `lv_invalid_input` and no longer lists `lv_hub_mismatch`; `lv_suspend_member` can return `lv_conflict`; `lv_remove_member` no longer lists `lv_hub_mismatch`. Capability `community.moderate` was renamed `community.comments.moderate` (0.1.0 to 0.2.0 pre-release rename). | Handle a null member count. Membership `roles` and `capabilities` are empty arrays until the roles migration lands; `Context.pending` is always present; `GateStatus.policy_version` is required. |
| 0.1.0 | Initial contract. | |
