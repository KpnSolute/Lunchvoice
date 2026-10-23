# Campaign and entitlement plan

Planning deliverable, 2026-10-23. Status: **proposal**. Confirmed numbers (V2-05..V2-14,
V2-19) are in [PRODUCT_SPEC.md](../v2/PRODUCT_SPEC.md). Anything marked **Rec.** is an
engineering recommendation awaiting the founder; **TBD (D-xx)** means undecided and must
not be defaulted. Related: [API contracts](API_AND_AUTHORIZATION_CONTRACTS.md),
[roadmap items R-09, R-12, R-13, R-15](EXECUTION_ROADMAP.md).

## 1. Mode and tier mapping

Confirmed: modes are surveys, polls, ratings, elections, feedback and seasonal activities.
Starter: 15 simultaneously active Campaigns total, at most 2 active Survey-mode. Team: at most 5 active Survey-mode,
**total cap undecided**. The two caps are independent; a gate never raises either.

| Mode | Starter | Team | Campaign Starter (seasonal) | Campaign Plus (seasonal) | Contract status |
| --- | --- | --- | --- | --- | --- |
| Survey | Yes, max 2 active, gate for additional | Yes, max 5 active, gate for additional | TBD (D-08) | TBD (D-08) | Exists in source (adapt) |
| Poll | Yes (within 15 total) | Yes | TBD | TBD | Contract TBD (D-08) |
| Rating | Yes (within 15 total) | Yes | TBD | TBD | Exists in part (dish ratings) |
| Feedback | Yes (within 15 total) | Yes | TBD | TBD | Exists in part (Voice) |
| Election | TBD (D-08) | TBD (D-08) | TBD | TBD | Not defined; a basic poll does not satisfy it |
| Seasonal activity | TBD (D-08) | TBD (D-08) | TBD | TBD | Not defined |

"Yes" for Starter/Team of non-Survey modes means only that the **15-total** Starter cap governs them; the
mode matrix itself is **TBD (D-08)**. Team's total cap and advanced-mode matrix are **TBD (D-06/D-08)**.
The entitlement engine represents an undefined limit as `null` = *undecided*, rendered and enforced as
`lv_policy_undecided` for that capability; it is never treated as unlimited.

## 2. Campaign lifecycle

States (Rec.): `draft` -> `scheduled` -> `active` -> `closed`; plus `expired` (purchased window ended) and `reopened`
as an `active` transition. `paused` exists only if D-08 approves it.

| Transition | Who/what | Server checks (same path for manual, scheduled, reopen) |
| --- | --- | --- |
| draft -> scheduled | capability `community.campaign.activate` | schedule valid, audience valid, revision published |
| scheduled -> active | scheduled job (system actor) or manual | **full activation transaction (section 3)** |
| active -> closed | capability `community.campaign.close`, or schedule | none beyond authorization; preserves responses |
| active -> expired | job | window end reached; preserves responses |
| closed/expired -> active (reopen) | capability | **full activation transaction**; reopen is a new activation |

**Slot-consuming definition (Rec., D-04):** a Campaign consumes a slot from the instant it becomes `active`
until it becomes `closed` or `expired`. `draft`, `scheduled` do not consume. `paused`, if allowed, **TBD**.
Mode changes after creation re-run the transaction so changing mode cannot evade a cap.
Closing a Campaign preserves all responses; no participation data is deleted to free a slot.

## 3. Atomic activation transaction

```text
lv_campaign_activate(campaign_id, idempotency_key):
 1. Resolve actor (user or system job) and the campaign's immutable hub_id.
 2. If a prior result exists for (campaign_id, idempotency_key): return it unchanged.
 3. SELECT ... FOR UPDATE on the hub_policy row for hub_id        -- single lock, fixed lock order
 4. Verify: membership + capability, entitlement valid, audience, revision published,
    lifecycle transition allowed, schedule window.
 5. Count active campaigns and active Survey-mode campaigns under the approved "active" definition.
 6. Enforce Starter 15 total / 2 Survey; Team 5 Survey and its total cap (TBD -> lv_policy_undecided).
 7. If this is an additional Survey activation: evaluate the approved gate (section 4)
    using integer comparisons and the approved snapshot/window (D-04).
 8. Persist: state=active, activated_at, expires_at (seasonal), entitlement consumption,
    gate_measurement record, non-identifying audit event      -- all in the same transaction.
 9. Return { ok, state, activated_at, expires_at } .
```

Properties to prove with tests: bounded transaction, consistent lock order, retry returns the
original result and never restarts the seasonal clock, two concurrent last-slot requests produce
exactly one winner, a failed scheduled activation fails visibly (job record plus alert) and never grants
unpaid access. Advisory locks are not used unless **every** writer honours them; the row-lock convention is the first choice.

## 4. Participation gate (D-04 blocking)

Notation: `M` approved eligible accepted-member denominator; `R` distinct eligible members who participated
in the approved measurement scope/window.

| Plan | Rule (integer form, no rounding) |
| --- | --- |
| Starter | `M > 0 AND 2*R > M` |
| Team | `M > 0 AND 5*R >= M` |
| `M = 0` | **Not defined** until the founder approves a bootstrap rule; the engine returns `lv_policy_undecided`, never divides, never passes |

The gate unlocks an additional survey activation **only within caps and valid entitlements**.

**Recommendation to make D-04 concrete (not approved):** the proposal in
[IMPLEMENTATION_PLAN.md](../v2/IMPLEMENTATION_PLAN.md): one initial Survey allowance for a newly eligible Hub;
before each additional activation, measure distinct eligible members in the preceding Survey-mode Campaign against
the accepted-membership snapshot taken at that Campaign's activation (role targeting narrows the snapshot), from its
activation through the next activation request or its close; exclude guests; closing, reopening, deleting or mode
change never waives the gate; a zero-member snapshot cannot unlock additional surveys until a bootstrap/re-snapshot
rule is approved. Consequence to show the founder: a Hub that starts with zero members never grows its denominator.

Implementation shape: a versioned policy interface `gate_policy_vN(plan, snapshot, participation) -> {met, numerator, denominator, scope}`;
every measurement is stored with the policy version and is never reinterpreted retroactively without a
migration rule. Gate UI shows numerator, denominator, scope, unmet requirement, and next action.

### Gate and cap fixtures (from the Definition of Done, plus implementation cases)

| Case | Required result |
| --- | --- |
| Starter M=100, R=50 / R=51 | fail / pass |
| Team M=100, R=19 / R=20 | fail / pass |
| Starter M=3, R=1 / R=2 | fail / pass |
| Team M=3, R=0 / R=1 | fail / pass |
| M=0 | `lv_policy_undecided` until bootstrap approved |
| Same member retries/submits twice | one qualifying respondent |
| Guests submit many responses | numerator and member total unchanged |
| Pending applicant participates | not counted |
| Two requests, final slot | exactly one succeeds |
| Gate passes, Survey cap full | denied |
| Two Survey + 13 other modes on Starter | total 15; 16th denied |
| Gate passes at Starter with 2 active Surveys | still denied (cap, not gate) |
| Retry of a successful activation | identical result; `expires_at` unchanged |

## 5. Entitlement model

A shared, server-side policy engine reads **grants**; plan names in the UI are labels only.

| Grant field | Meaning |
| --- | --- |
| `hub_id` | Scope (billing ownership scope TBD, D-06) |
| `source` | `subscription`, `seasonal`, `manual`, `synthetic` (non-production) |
| `plan_code` | `starter`, `team`, `campaign_starter`, `campaign_plus` (the last not purchasable until approved) |
| `limits` (jsonb) | Numeric caps and booleans; unknown = `null` (undecided) |
| `valid_from`, `valid_to` | Subscription period or activation-based seasonal window |
| `provider_ref`, `event_id` | Verified provider linkage; unique `(provider, event_id)` |

**How multiple grants combine** (e.g. a Starter subscription plus a seasonal Campaign Plus): **TBD (D-06/D-08)**; Rec.: take the
most permissive *defined* value per limit and union feature flags, but only after the founder confirms stacking is intended.
`synthetic` grants exist only in non-production fixtures and can never be created in production.

## 6. Seasonal purchases

- **Campaign Starter:** `price = 19 + 13 * extra_weeks` where the 2-week base is included. Examples: 2 weeks $19, 3 weeks $32, 4 weeks $45. **Partial weeks, maximum duration, tax/currency: TBD (D-06/D-08).**
- **Campaign Plus:** Team-equivalent seasonally; **base and extension prices TBD (D-08).** No purchasable SKU, no placeholder price, no copying Starter's extension into Plus. Implementation: a hard guard (`plus_purchasable = false`) and a test that checkout creation for Plus fails.
- Purchased window **starts at activation**, not at payment. The activation event is persisted once with `expires_at`; extension arithmetic runs once per verified purchase; retries do not reset or double-extend.
- D-08 questions to settle before coding: scheduled activation failure, pause/resume, unused purchases, maximum duration, timezone, late extensions, overlap.

## 7. Three independent clocks

| Clock | Start | End | Behaviour |
| --- | --- | --- | --- |
| Hub subscription period | Verified provider period start | Period end per provider events | Recurring; failure/downgrade policy D-06 |
| Seasonal Campaign window | **Activation** | Activation + purchased duration | Scheduled windows can wait; expiry preserves data |
| Name reservation term | Purchase | +12 months, then 25 **calendar** days of grace | Independent of Campaign access expiry; D-09 fixes timezone/boundaries |

Do not reuse one timestamp for different clocks. Test seasonal expiry separately from annual name protection.

## 8. Payment interfaces (provider TBD, D-06)

```ts
interface BillingProvider {
  createCheckout(input: { hubId: string; sku: string; successUrl: string; cancelUrl: string; idempotencyKey: string }): Promise<{ url: string }>;
  verifyWebhook(rawBody: string, headers: Record<string,string>): Promise<VerifiedEvent>;   // signature + timestamp tolerance
}
```

Rules: (1) a browser success redirect is **never** proof of payment; grants derive from verified
events/authoritative provider state. (2) Events are stored in an `event_receipts`-style table with unique
`(provider, event_id)`, processed idempotently, reconciled when out of order. (3) Duplicate and replayed
events grant nothing twice. (4) Refund, chargeback, cancellation, downgrade, payment failure and over-limit content follow D-06; **responses and private Hub data are never deleted** to resolve an over-limit or unpaid state.
(5) Billing events do not route through the menu function. (6) Sandbox provider account in staging only.

## 9. Test plan summary

Unit tests for the gate function and price calculator; transactional tests for the activation RPC
(concurrency via parallel connections in the local Postgres harness); property tests on integer
threshold comparisons (no float); event replay tests; Plus-unsellable test; seasonal clock tests
(activation after scheduled delay; retry; DST day Nov 1 in America/New_York); direct-write denial tests on lifecycle fields.

## 10. Blocked on decisions

| Behaviour | Blocked by |
| --- | --- |
| Additional-survey activation | D-04 |
| Mode matrix, elections, Plus pricing, seasonal timing | D-08 |
| Team total cap, stacking, provider, currency, failure/refund | D-06 |
| Beta admission pricing | D-07 |

Work unaffected by these (the activation lock, known numeric caps for Starter, synthetic fixtures, interface design) proceeds.
