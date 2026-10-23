# v2 API (planned)

Status: **proposal; nothing on this page is implemented.** The detailed contracts (identity, authorization model, error
codes, idempotency, cross-Hub and concurrency rules) are in
[API_AND_AUTHORIZATION_CONTRACTS.md](../backend/API_AND_AUTHORIZATION_CONTRACTS.md); Campaign and entitlement behaviour is
in [CAMPAIGN_AND_ENTITLEMENT_PLAN.md](../backend/CAMPAIGN_AND_ENTITLEMENT_PLAN.md). This page is the reference index for the
planned surface and its relationship to today's endpoints. Delivery milestones: M1 = MJCC beta (Dec 11), M2 = main
release (Dec 23), per the [execution roadmap](../backend/EXECUTION_ROADMAP.md).

## Conventions (planned)

- RPCs return `{ "ok": true, "data": ..., "request_id" }` or `{ "ok": false, "error": { "code", "message", "details" }, "request_id" }`.
- Stable error codes: `lv_unauthenticated`, `lv_forbidden`, `lv_not_member`, `lv_not_found`, `lv_hub_mismatch`,
  `lv_quota_exceeded`, `lv_gate_unmet`, `lv_entitlement_missing`, `lv_lifecycle_invalid`, `lv_conflict`,
  `lv_policy_undecided`, `lv_rate_limited`, `lv_invalid_input`.
- Mutating calls accept `idempotency_key`; a retry returns the original result.
- Authority comes from database state (memberships, roles, entitlements), never from client claims or the slug.
- Browsers never write protected tables directly; all changes go through RPCs or Edge Functions.

## Endpoint index

| Area | Planned endpoint | Replaces today | Milestone |
| --- | --- | --- | --- |
| Identity | Google sign-in through central identity (Option A) or Supabase's Google provider (approved fallback, Option D) | `login-start` + email code; `staff-sso` / `staff-login` | M1 |
| Context | `lv_my_context()` | profile read in `AuthProvider` | M1 |
| Hubs | `lv_hub_public(slug)`, `lv_join_hub`, `lv_decide_join`, `lv_leave_hub`, `lv_remove_member`, `lv_suspend_member`, `lv_member_count` | single-org profile, `orgs` read | M1 |
| Roles | `lv_role_create/update/delete`, `lv_role_assign`, `lv_role_set_capability`, `lv_role_set_group`, `lv_owner_transfer_start/accept`, `lv_hub_delete` | `profiles.role`, `is_admin()` | M1 |
| Entitlements | `lv_entitlements(hub_id)`, `lv_gate_status(hub_id, mode)` | none | M1 |
| Campaigns | `lv_campaign_create/update`, `lv_campaign_activate`, `lv_campaign_schedule`, `lv_campaign_close` | direct `sessions` / `survey_templates` writes | M1 (survey mode), M2 (other modes) |
| Participation | `lv_campaign_resolve(code_or_token)`, `lv_submit_response`, `lv_my_receipts` | `join_session`, `join_available_session`, `submit_response` | M1 |
| Pages | `lv_page_save_draft`, `lv_page_publish`, `lv_page_set_audience` | none | M1 (MJCC pages), M2 |
| Analytics | `lv_analytics_query`, `lv_analytics_export`, `lv_analytics_embed_create/revoke` | direct reads of responses and views | M1 (results), M2 (exports/embeds) |
| Discovery, beta | `lv_discovery_apply`, `lv_waitlist_join`, `lv_beta_admit` | `contract_requests` insert | M1 (waitlist), M2 (discovery) |
| Commerce | `billing-events` Edge Function, `lv_slug_claim`, `lv_slug_renew` | none | M2 |
| Connectors | per-Hub connector registration and signed inbound events (proposed, D-13) | `menu-sync` CloudEvents | TBD |

## Compatibility

Today's endpoints stay available during the transition and are retired only after parity is signed off (data plan, phase
P5). The legacy LionCafe flow remains the fallback for the Winter Survey.
