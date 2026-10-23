# Inbound webhooks

Both inbound webhooks verify a [Standard Webhooks](https://www.standardwebhooks.com/) signature over the **raw**
request body (`webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64>` headers).

## Supabase Auth send-email hook (`send-email`)

Supabase Auth calls this function instead of sending its own email. The function delivers the one-time code
through Azure Communication Services Email; the code itself stays inside Supabase Auth, so `verifyOtp` and RLS are unchanged.

| | |
| --- | --- |
| Caller | Supabase Auth only (configured as the project's Send Email hook) |
| Verification | Standard Webhooks with `SEND_EMAIL_HOOK_SECRET` |
| Payload used | `user.email`, `email_data.token`, `email_data.email_action_type` |
| Success | `200 {}` |
| Errors | Supabase hook format `{ "error": { "http_code", "message" } }`: 401 invalid signature, 400 missing fields, 500 not configured or provider failure |

The email subject is `"<code> is your Lunch Voice code"`. v2's Google sign-in removes the need for verification email on
the new path; this hook stays for legacy email sign-in.

## KpnSolute menu CloudEvents (`menu-sync`)

Signed events from KpnSolute/KpnCompute that update the LionCafe menu. Any request to `menu-sync` carrying a `webhook-id`
header is treated as a CloudEvent.

| | |
| --- | --- |
| Verification | Standard Webhooks with `KPNSOLUTE_EVENTS_SIGNING_SECRET`; 5-minute timestamp tolerance |
| Size limit | 256 KiB (HTTP 413 above) |
| Envelope | CloudEvents 1.0: `specversion`, `id`, `source`, `type`, `time`, `tenantid`, `data` |
| Types | `com.kpnsolute.compute.menu.day.updated.v1` (one day in `data`) and `com.kpnsolute.compute.menu.cycle.updated.v1` (`data.days[]`) |
| Day shape | `cycle_day` (integer >= 1), `day_of_week`, `meals` (`Breakfast`/`Brunch`/`Lunch`/`Dinner` arrays of `{ slot_name, item_name }`), optional `anchor_date` |
| Tenant mapping | `tenantid` mapped to an org slug through `KPNSOLUTE_TENANT_ORG_MAP` (default `{ "mjcc": "LionCafe" }`); unmapped tenants get 403 |
| Idempotency | `apply_kpnsolute_menu_event` records each `webhook-id`; a repeat returns `duplicate: true` without reapplying |
| Success | `202 { "accepted": true, "duplicate": bool, "cycle_id": uuid, "days_applied": n }` |
| Errors | 401 bad signature, 403 unmapped tenant, 413 too large, 422 invalid envelope or data, 500 projection failure |

Status: legacy MJCC integration; v2 does not extend it. The proposed v2 replacement is a generic per-Hub connector
(roadmap R-28, decision D-13) reusing the same signature and idempotency pattern.
