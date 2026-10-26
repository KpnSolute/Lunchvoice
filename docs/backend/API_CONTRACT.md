# LunchVoice v2 API contract (`lv_api`)

Status: implemented on `feat/v2-read-api` (migrations 000001-000008). Not applied to production.
The frontend uses only these functions for application data. Tables and the `lv` schema are not reachable.

Every function returns `jsonb`. The caller is always taken from the verified KpnIdentity token; no function
accepts an account id. Call them through PostgREST RPC against schema `lv_api`.

## Envelope

- Success: `{ "ok": true, ... }`
- Failure: `{ "ok": false, "error": { "code": "lv_...", "message": "..." } }`

**One contract (since 000008).** Every expected failure from every `lv_api` function is returned as the
failure envelope. The client never parses Postgres exception text. Optional metadata rides alongside `code`
and `message`: `lv_gate_blocked` adds `reasons: [...]`, and `lv_policy_undecided` may add `missing: [...]`.
Database rule violations the caller caused (bad enum, malformed value, check constraint) come back as
`lv_invalid_input`, duplicates as `lv_conflict`, and a missing referenced record as `lv_not_found`.
Only a true server fault is an HTTP-level error, reported as `lv_server_error` with no internal detail.
`lv_submit_response` is also an envelope function now: `lv_closed`, `lv_forbidden`, `lv_not_found`,
`lv_invalid_input` and `lv_unauthenticated` are returned, not raised.

## Error codes

| Code | Meaning |
|---|---|
| `lv_unauthenticated` | No valid KpnIdentity session, or issuer not trusted |
| `lv_forbidden` | Signed in but missing the capability or membership |
| `lv_not_found` | No such record, or it exists but is hidden from you (private Hub, draft Campaign) |
| `lv_invalid_input` | Bad value (unreadable answers, reserved or malformed Hub name, wrong question) |
| `lv_conflict` | Already exists (Hub name taken, already applied for beta) |
| `lv_closed` | Campaign is not accepting responses (not active, not yet open, or past close) |
| `lv_locked` | Questions cannot change once a Campaign has been activated |
| `lv_gate_blocked` | Activation refused; message lists reasons (`no_questions`, `limit_reached`, `limit_undefined`, `not_draft`, `already_closed`) |
| `lv_lifecycle_invalid` | Action not valid for the Campaign's state (for example results for a draft) |
| `lv_invalid_code` | Invitation unknown, revoked, expired or used up (all answered identically) |
| `lv_unverified_email` | Beta application needs a verified email at KpnIdentity |
| `lv_beta_required` | Creating a Hub needs an approved beta application |
| `lv_policy_undecided` | Anonymous results are withheld; see Analytics |
| `lv_owner_protected`, `lv_owner_immutable`, `lv_hub_mismatch`, `lv_not_accepted`, `lv_anonymity_violation` | Integrity guards; treat as a generic failure and show the message |
| `lv_server_error` | Unexpected server fault |

## Identity and account

### `lv_my_context()`
Signs the caller in (creates their account on first call). Returns:

```
{ ok, account_id, display_name, email_verified, is_platform_admin,
  beta_status: "none"|"pending"|"approved"|"rejected"|"consumed",
  hubs: [{ hub_id, slug, name, is_owner,
           roles: [{ key, name }],
           capabilities: ["campaign.manage", "analytics.read", ...] }] }
```
`hubs` lists accepted memberships only. Errors: `lv_unauthenticated`.

Capability names today: `hub.settings.manage`, `admin.members.admit`, `admin.members.remove`,
`admin.roles.manage`, `campaign.manage`, `analytics.read`. Use these to show or hide controls; the server
enforces them regardless.

### `lv_beta_status()`
`{ ok, status: "none"|"pending"|"approved"|"rejected"|"consumed", applied_at?, decided_at? }`.
`consumed` means the approval was used to create a Hub.

### `lv_beta_apply(p_note?)`
`{ ok, application_id }`. Errors: `lv_unverified_email`, `lv_conflict`, `lv_unauthenticated`.

### `lv_beta_decide(p_application, p_approve)` (platform admin only)
Errors: `lv_forbidden` (not an administrator, or deciding your own), `lv_not_found`.

## Hubs

### `lv_hub_create(p_slug, p_name)`
`{ ok, hub_id, slug }`. Slug is lowercased. Atomic: the Hub, its protected Owner membership and role, the
beta consumption and a `hub.created` audit event commit together or not at all. Errors: `lv_invalid_input`
(reserved, wrong length or format, or a blank display name), `lv_beta_required`, `lv_conflict` (taken). Format
is 3 to 40 characters, `[a-z0-9-]`, no leading or trailing hyphen, no `--`. Concurrent claims of one slug are
safe: exactly one caller wins and the other gets `lv_conflict` with its approval intact (proven by a
two-connection test in `scripts/db-test-canonical.sh`). Reserved slugs are in `lv.reserved_slugs` (case-insensitive); the UI may mirror them for
availability hints but the server decides.

### `lv_hub_get(p_slug)`
Works signed out for public Hubs.
```
{ ok, hub: { hub_id, slug, name, visibility: "public"|"private",
             membership_mode: "open"|"approval"|"invite_only", member_count },
  membership: null | { is_owner, roles, capabilities, active_campaigns } }
```
Private Hubs answer `lv_not_found` to non-members. `membership` is null for non-members.

### `lv_member_list(p_hub)`
Needs one of `admin.members.admit`, `admin.members.remove`, `admin.roles.manage`.
`{ ok, members: [{ membership_id, account_id, display_name, status: "accepted"|"pending",
accepted_at, is_owner, roles }] }`. No email addresses.

## Invitations

- `lv_invite_create(p_hub, p_max_uses?, p_expires_at?)` needs `admin.members.admit`. Returns `{ ok, invite_id, code, shown_once: true }`; the code appears only in this response.
- `lv_invite_list(p_hub)` needs `admin.members.admit`:
  `{ ok, invites: [{ invite_id, max_uses, uses, expires_at, revoked_at, created_at, state: "active"|"revoked"|"expired"|"exhausted" }] }`.
  Codes are stored hashed and cannot be shown again.
- `lv_invite_revoke(p_invite)` needs `admin.members.admit`.
- `lv_invite_preview(p_code)`: signed in. `{ ok, hub: { hub_id, slug, name }, already_member }` or
  `lv_invalid_code`. Consumes nothing.
- `lv_invite_redeem(p_code)`: `{ ok, hub_id, already_member }` or `lv_invalid_code`. Grants membership only, never a role.

## Campaigns

Modes: `survey`, `poll`, `rating`, `feedback`. Anonymity: `anonymous` (default) or `identified`.
Status: `draft` -> `active` -> `closed`. Question kinds: `rating` (1-5), `single_choice`, `multi_choice`,
`yes_no`, `text`.

### `lv_campaign_list(p_hub)`
Members only (non-members get `lv_not_found`).
`{ ok, campaigns: [{ campaign_id, title, mode, anonymity, status, opens_at, closes_at, created_at,
question_count, has_responded, join_code }] }`.
Drafts and `join_code` are visible only with `campaign.manage`. `has_responded` is the caller's own.

### `lv_campaign_get(p_campaign)`
Respondent-safe. Never returns answers or other people's data.
```
{ ok, campaign: { campaign_id, hub_id, title, mode, anonymity, status, revision, opens_at, closes_at },
  questions: [{ question_id, position, kind, prompt, config }],
  has_responded, receipt_id, can_respond, can_manage,
  join_code?, gate? }          // join_code and gate only with campaign.manage
```
`can_respond` is true when the Campaign is active and in its window and the caller has not responded.
Drafts are `lv_not_found` unless the caller can manage. `gate` is `{ ok, reasons: [...] }` for activation.

### Writes
`lv_campaign_create(p_hub, p_title, p_mode, p_anonymity?)`, `lv_campaign_question_add(p_campaign, p_position, p_kind, p_prompt, p_config?)`,
`lv_campaign_activate(p_campaign)`, `lv_campaign_close(p_campaign)`. All need `campaign.manage`.
Create returns `{ ok, campaign_id }`. Activation can fail with `lv_gate_blocked`. Adding questions after activation: `lv_locked`.

## Participation

### `lv_submit_response(p_campaign, p_answers)`
`p_answers` is `[{ question_id, value }]` and must answer every question (rating 1-5; others non-null).
Success: `{ ok, receipt_id, duplicate }`. A repeat submission is not an error: it returns the original
receipt with `duplicate: true`. Errors (envelope): `lv_unauthenticated`, `lv_not_found`, `lv_closed`,
`lv_forbidden` (not an accepted member), `lv_invalid_input` (message names the problem).

Anonymous versus identified is a Campaign setting (`campaign.anonymity`), not an error. For an anonymous
Campaign the submission stores no account and the Hub can never see who answered. Show this to respondents
before they submit.

## Analytics

### `lv_analytics_query(p_campaign, p_metric, p_question?)`
Needs `analytics.read`. `p_metric` is `participant_count` or `answer_distribution` (needs `p_question`).

Published:
- `participant_count`: `{ ok, metric, n, suppressed }`. If `suppressed` is true, `n` is null; show "withheld", not 0.
- `answer_distribution`: `{ ok, metric, question_id, cells: [{ key, n, suppressed, reason }] }`.
  A suppressed cell has `n: null` and `reason` of `below_min_cohort` or `complementary`
  (hidden only so a neighbouring cell cannot be recovered by subtraction). Render as "withheld".

Withheld whole results come back as `{ ok:false, error:{ code:"lv_policy_undecided", message, missing? } }`:
- operator has not set the privacy policy (`missing` lists the undecided settings),
- anonymous Campaign still active (results appear only after it finishes),
- participant population changed after first release,
- free-text question (not publishable yet).

A draft Campaign returns `lv_lifecycle_invalid`. Treat `lv_policy_undecided` as an explained empty state, not a failure.

## Not yet available

Hub settings changes, role management, member admit/remove/approve, Owner transfer, waitlist, pages,
comments, rewards. Anything in the prototype's 76 operations that is not listed above is not in the v2 baseline.
