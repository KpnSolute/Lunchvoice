# API and authorization contracts

Planning deliverable, 2026-10-23. Status: **proposal for review**. Names, signatures
and error codes are illustrative engineering recommendations; none exists in source.
Product rules come from [PRODUCT_SPEC.md](../v2/PRODUCT_SPEC.md); architecture context
from [ARCHITECTURE.md](../archeture/ARCHITECTURE.md). Unknown policy is **TBD**, never an invented default.

Implementation style (Recommendation, keeps current patterns): business logic in
Postgres functions called via `supabase.rpc`, with explicit `execute` grants and
caller checks; Edge Functions only for things a browser must not do (identity
callback exchange, billing webhooks, job runners, email). The browser never holds a
service-role key or a client secret.

## 1. Identity and session contract (D-01; to be completed with the identity owner)

| Field | Proposed contract | Status |
| --- | --- | --- |
| Issuer | `https://auth.kpnsolute.com` (exact value from identity owner) | TBD |
| Discovery/JWKS | HTTPS discovery document, asymmetric signing keys with key IDs | TBD |
| Client type | Confidential client at the Supabase provider layer (secret server-side); browser uses Authorization Code + PKCE where applicable | Option A under test |
| Subject | Stable verified personal ID; `(issuer, subject)` stored in `account_identities` | TBD |
| Claims released | verified personal ID, email, `email_verified`, name; nothing else without approval | TBD |
| Callback allowlist | Per environment (local, staging, production); exact-match; no wildcards | TBD |
| Return route | Allowlisted relative path preserved across login; reject external URLs | Proposed |
| Session | Supabase session for the application; refresh per Supabase defaults; privileged state rechecked against the database | Option A under test |
| Revocation / logout | Local sign-out plus central sign-out; sensitive capability checks read current DB state, not token claims | TBD (freshness target TBD) |
| Key rotation | JWKS rotation honoured with caching rules | TBD |
| Legacy coexistence | Email OTP and MJCC staff bridge remain during transition; neither may restore revoked v2 rights | Proposed |

Allow/deny evidence for every row is the R-06 scenario matrix (new Google user, existing
OTP user, existing staff user, changed email same subject, conflicting account, revoked access,
expired token, second-Hub access, provider outage, wrong issuer, wrong audience, replay, tampered return URL).

## 2. Authorization model

```
allow = verified_context
        AND hub_resource_binding(hub_id, resource)       -- resource belongs to this Hub
        AND audience_eligible(account|guest, resource)
        AND (capability_required IS NULL OR has_capability(account, hub_id, capability))
        AND entitlement_valid(hub_id, feature)
        AND lifecycle_valid(resource)
```

- **Verified context:** an authenticated database role alone is not membership. Guests use a
  separate scoped context (section 6).
- **Authority source:** database rows (memberships, role assignments, entitlements). Never user-editable
  metadata, never client-supplied claims, never the slug.
- **Role composition (Recommendation, D-02):** additive union of capabilities across assigned custom roles;
  no explicit deny; Owner-only operations live outside the grantable catalog.
- **Owner-only (never grantable):** delete Hub, transfer ownership.
- **Freshness:** capability checks execute inside each RPC against current rows, so revocation takes
  effect on the next call. Cached UI state is advisory only.

### 2.1 Capability catalog (proposed vocabulary for D-02; three categories)

| Category | Capability IDs |
| --- | --- |
| Administration | `admin.settings.edit`, `admin.members.admit`, `admin.members.remove`, `admin.members.suspend`, `admin.directory.visibility`, `admin.roles.manage`, `admin.billing.view`, `admin.billing.manage`, `admin.slug.renew`, `admin.discovery.apply` |
| Hub Appearance & Structure | `structure.branding.edit`, `structure.navigation.edit`, `structure.pages.edit`, `structure.pages.publish`, `structure.pages.audience`, `structure.currency.edit` |
| Community & Campaigns | `community.campaign.draft`, `community.campaign.activate`, `community.campaign.close`, `community.campaign.audience`, `community.moderate`, `community.analytics.view`, `community.analytics.export`, `community.analytics.publish`, `community.shop.manage`, `community.newsroom.manage`, `community.leaderboard.manage` |

Group toggles flip delegable capabilities in their category only and never create Owner-only operations.
Default role templates and delegation limits (an editor cannot grant what they lack, cannot edit
a role above them, cannot touch the Owner) are **TBD under D-02**.

## 3. Common request/result/error envelope

All RPCs return `jsonb` shaped as:

```json
{ "ok": true, "data": { }, "request_id": "uuid" }
{ "ok": false, "error": { "code": "lv_forbidden", "message": "...", "details": { } }, "request_id": "uuid" }
```

Error codes (stable strings the frontend can switch on):

| Code | Meaning |
| --- | --- |
| `lv_unauthenticated` | No verified context |
| `lv_forbidden` | Verified, lacks capability or audience |
| `lv_not_member` | No accepted membership in the Hub |
| `lv_not_found` | Resource absent **or** not visible to the caller (no existence leak across Hubs) |
| `lv_hub_mismatch` | Resource not bound to the stated Hub |
| `lv_quota_exceeded` | Role/page/Campaign/Survey/beta cap reached (`details.limit`, `details.used`) |
| `lv_gate_unmet` | Participation gate unmet (`details.numerator`, `details.denominator`, `details.scope`) |
| `lv_entitlement_missing` | No valid entitlement for the feature |
| `lv_lifecycle_invalid` | Wrong lifecycle state or schedule |
| `lv_conflict` | Concurrent change or uniqueness conflict (safe to retry after refetch) |
| `lv_policy_undecided` | Behaviour blocked on an undecided D-xx; never a silent default |
| `lv_rate_limited` | Abuse limit hit |
| `lv_invalid_input` | Validation failure (`details.fields`) |

Idempotency: mutating RPCs accept an optional `idempotency_key` (uuid). A retry with the same key
returns the original result and never repeats a state change or restarts a clock.

## 4. RPC and function contracts

Each row maps to a requirement and to the allow/deny evidence required (tested through direct
RPC/PostgREST calls, not only the UI).

### 4.1 Account and Hub membership

| Contract | Req | Request | Result | Allow evidence | Deny evidence |
| --- | --- | --- | --- | --- | --- |
| `lv_my_context()` | V2-02 | none | account, accepted memberships with Hub ID/slug/name, capabilities per Hub | Same account sees two Hubs with different capabilities | Pending/suspended Hubs not listed as accepted; other Hub's data absent |
| `lv_hub_public(slug)` | V2-04 | slug | public Hub card (name, membership mode, member count, public settings) | Public Hub visible to signed-out | Private details/directory not exposed; slug of released Hub resolves only to its current generation |
| `lv_join_hub(hub_id, answers?)` | V2 hubs | Hub ID | status `accepted` / `pending` / `denied` per mode | Public Hub accepts immediately when the rule says so | Invite-only without invite denied; guests cannot join |
| `lv_decide_join(hub_id, account_id, decision)` | D-05 | IDs | updated membership | Capability `admin.members.admit` | Missing capability; cross-Hub account |
| `lv_leave_hub`, `lv_remove_member`, `lv_suspend_member` | D-05 | IDs | updated membership + count effect | Owner/authorized roles | Cannot remove the Owner |
| `lv_member_count(hub_id)` | V2-15 | Hub | integer of accepted valid members | Counts only accepted | Pending, invited, guests excluded |

### 4.2 Roles and ownership

| Contract | Req | Notes | Deny evidence |
| --- | --- | --- | --- |
| `lv_role_create/update/delete(hub_id, ...)` | V2-05/06/07 | Locks the Hub policy row before counting slots (3 Starter, 6 Team; Owner excluded) | 4th/7th concurrent creation denied; editor cannot escalate beyond own capabilities |
| `lv_role_assign(hub_id, account_id, role_id)` | V2-18 | Capability `admin.roles.manage` | Cannot assign a role containing capabilities the grantor lacks; cannot touch the Owner |
| `lv_role_set_capability(role_id, capability, enabled)`, `lv_role_set_group(role_id, category, enabled)` | V2-18 | Group toggle affects delegable capabilities only | Cannot enable ownership-only operations |
| `lv_owner_transfer_start/accept(hub_id, to_account_id)` | V2-07 | Two-step: Owner initiates, recipient accepts, both authenticated, audited, atomic swap | Never zero or two effective Owners; expiring offer; non-Owner cannot start |
| `lv_hub_delete(hub_id)` | V2-07 | Owner only; separate retention rules (D-10) | Any role, including full-capability roles, denied |

### 4.3 Entitlements and Campaigns

| Contract | Req | Notes |
| --- | --- | --- |
| `lv_entitlements(hub_id)` | V2-05/06 | Read-only effective limits and usage (active total, active Survey, roles, pages) |
| `lv_campaign_create/update(hub_id, ...)` | V2-19 | Draft only; protected lifecycle fields not writable directly |
| `lv_campaign_activate(campaign_id, idempotency_key)` | V2-08/09/12 | The only path that activates or reopens: locks Hub policy row, checks capability, entitlement, audience, caps, gate, schedule; persists activation and expiry once |
| `lv_campaign_schedule`, `lv_campaign_close` | V2-12 | Same checks; scheduled job calls `lv_campaign_activate` as a system actor |
| `lv_gate_status(hub_id, mode)` | V2-09 | Numerator, denominator, scope, unmet requirement, next action (display data for the UI) |

Details and the activation transaction are in the [Campaign plan](CAMPAIGN_AND_ENTITLEMENT_PLAN.md).

### 4.4 Participation

| Contract | Notes |
| --- | --- |
| `lv_campaign_resolve(code_or_token)` | Resolves join code, QR or guest share to a Campaign ID and Hub ID; returns only what the audience rule allows |
| `lv_submit_response(campaign_id, revision, answers, proof?)` | Member path (`auth`) or guest path (proof); idempotent per participant; writes a receipt and an answer set separated for anonymous Campaigns |
| `lv_my_receipts()` | The participant's own participation history only |

### 4.5 Pages, analytics, discovery, waitlist, billing, reservations

| Contract | Req | Notes |
| --- | --- | --- |
| `lv_page_save_draft / publish / set_audience` | V2-20 | Three independent capabilities: edit, publish, audience; custom-page quota enforced under the Hub lock |
| `lv_analytics_query(hub_id, metric, filters)` | V2-21 | Server-side aggregates; applies suppression (D-10) and member/guest split; same path for UI, export and embed |
| `lv_analytics_export`, `lv_analytics_embed_create/revoke` | V2-21 | Aggregate projections only; revocation invalidates later reads |
| `lv_discovery_apply(hub_id)`, review RPCs | V2-15 | 699 denied, 700 allowed to apply; approval separate |
| `lv_waitlist_join(email, ...)`, `lv_beta_admit(request_id)` | V2-16 | Atomic 50-owner ceiling; rules from D-07 |
| `lv_slug_claim`, `lv_slug_renew` | V2-13/14 | Generation-bound; evaluate expiry under one policy |
| Billing webhook (Edge Function `billing-events`) | V2-05..12 | Signature verified, event ID deduplicated, state reconciled; **a client success URL is never proof of payment** |

## 5. Direct-write restrictions

Browser (anon/authenticated) clients get **no** direct `insert/update/delete` on the tables below;
all changes go through RPCs. `service_role` is for Edge Functions and jobs only.

| Table group | Browser direct writes |
| --- | --- |
| `accounts`, `account_identities`, `account_legacy_links` | None |
| `hub_memberships`, `hub_roles`, `hub_role_assignments`, `hub_role_capabilities` | None |
| `hub_entitlements`, billing and reservation tables, `hub_slugs` | None |
| `campaigns` lifecycle fields, `campaign_revisions` published rows | None for lifecycle; drafts only via RPC |
| `participation_receipts`, `campaign_responses` | None (RPC only) |
| `points_ledger`, `hub_member_stats` | None |
| `audit_events`, `job_runs`, `event_receipts` | None |

Additional rules: RLS enabled on every exposed table; explicit `grant`/`revoke` per role; views use
`security_invoker = on`; every `security definer` function sets `search_path`, validates the caller, and
revokes `execute` from `public`/`anon` unless the endpoint is public; existing definer functions
(`caller_org_id`, `is_admin`, `join_session`, `submit_response`, `redeem_item`, `handle_new_user`) are re-reviewed
before reuse. The legacy `handle_new_user` LionCafe fallback is replaced by verified membership provisioning.

## 6. Guest context

A guest has no Supabase identity. A guest request carries a scoped, revocable proof
(D-03, Recommendation: random 128-bit token, stored hashed, bound to Campaign ID and Hub ID and generation, expiring at close). The proof authorizes
only `lv_campaign_resolve` and `lv_submit_response` for that Campaign. It never grants
membership, directory access, perks, or administrative authority. Public pages alone do not authorize guest responses.

## 7. Frontend interfaces (TypeScript sketch)

```ts
type LvResult<T> = { ok: true; data: T; request_id: string }
  | { ok: false; error: { code: LvErrorCode; message: string; details?: Record<string, unknown> }; request_id: string };

interface LvContext {
  account: { id: string; display_name: string };
  memberships: Array<{
    hub_id: string; slug: string; name: string; status: 'accepted';
    roles: Array<{ id: string; name: string; icon: string | null }>;
    capabilities: string[];          // advisory; server rechecks
    is_owner: boolean;
  }>;
}
interface GateStatus { scope: string; numerator: number; denominator: number; met: boolean; next_action: string }
interface EntitlementUsage { active_total: { used: number; limit: number | null }; active_survey: { used: number; limit: number | null };
  roles: { used: number; limit: number | null }; pages: { used: number; limit: number | null } }
```

`limit: null` means **undefined policy (TBD)**, shown as such and never treated as unlimited.
Mocks of these types are allowed for UI work but must be labelled and are not evidence of backend readiness.

## 8. Cross-Hub and concurrency cases (explicit)

1. Account in Hubs A and B; a request for A's resource with B's context returns `lv_hub_mismatch`/`lv_not_found`.
2. Forged client capability list ignored; database decides.
3. Two concurrent `lv_campaign_activate` for the last slot: exactly one succeeds, the other gets `lv_quota_exceeded`.
4. Two concurrent role creations at the slot limit: exactly one succeeds.
5. Simultaneous beta admissions at 49 -> 50 and 50 -> 51: ceiling holds.
6. Owner transfer racing a role edit or a second transfer: never zero or two Owners.
7. Retried billing event or activation job: no second grant, no clock restart.
8. Slug reclaimed after release: old share/QR/embed with an old generation fails; no private data crosses.

## 9. Evidence matrix rule

For every contract above the implementing PR adds: the requirement ID, the decision ID(s), at least one allow test,
at least one deny test, a cross-Hub test, a direct-call test (not UI), and, where state changes, a concurrency or retry test.
