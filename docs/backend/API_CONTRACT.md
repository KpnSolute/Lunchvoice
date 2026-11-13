# LunchVoice v2 API contract (`lv_api`)

Status: migrations 000001-000013 are applied to production; 000014-000017 (launch, see the last section) are
tested locally and not applied. Where an older section below differs from **Launch API (000014–000017)**, the
launch section wins.
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
| `lv_beta_required` | Retired in 000014: Hub creation needs a Hub credit (`lv_entitlement_required`) |
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
`{ ok, hub_id, slug, plan }`. Slug is lowercased. Atomic: the Hub, its protected Owner membership and role, the
Hub credit consumption, the hub entitlement and a `hub.created` audit event commit together or not at all. Errors:
`lv_invalid_input` (reserved, wrong length or format, or a blank display name), `lv_entitlement_required` (no Hub
credit), `lv_conflict` (taken, reserved by someone else, or quarantined). Format
is 3 to 40 characters, `[a-z0-9-]`, no leading or trailing hyphen, no `--`. Concurrent claims of one slug are
safe: exactly one caller wins and the other gets `lv_conflict` with its Hub credit intact (proven by a
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
`p_answers` is `[{ question_id, value }]` and must answer every required question (rating 1-5; others non-null).
Since 000017 a question whose `config` has `"optional": true` may be left out (members and guests alike); a missing
required answer is `lv_invalid_input`, and a submission must answer at least one question.
Success: `{ ok, receipt_id, duplicate }`. A repeat submission is not an error: it returns the original
receipt with `duplicate: true`. Errors (envelope): `lv_unauthenticated`, `lv_not_found`, `lv_closed`,
`lv_forbidden` (not an accepted member), `lv_invalid_input` (message names the problem).

Anonymous versus identified is a Campaign setting (`campaign.anonymity`), not an error. For an anonymous
Campaign the submission stores no account and the Hub can never see who answered. Show this to respondents
before they submit.

### `lv_submit_response(p_campaign, p_answers, p_display_name)` (000052)
Overload for a signed-in respondent who wants a different name on their answers ("Maurice from Corporate"). Send
`p_display_name` only when you have one; the two-argument call is unchanged. The name is cleaned the same way for
everyone: runs of spaces collapse, the ends are trimmed, 1 to 40 characters; control characters or more than 40
characters are `lv_invalid_input`; a blank name means "use my account name" and stores nothing. It is stored in
`lv.submissions.guest_name` (the column 000028 protects) and `is_guest` says whose it is. **Anonymous Campaigns
ignore it entirely** (no error, nothing stored). It is only a label: identity stays the `(issuer, subject)` pair, one
answer per account is decided by participation, and authorization never reads it. `lv_campaign_responses` returns it as
`name` with `kind: "member"` (shown as **Account**) or `kind: "guest"` (shown as **Guest, unverified**).

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

Comments, rewards, shop, leaderboard and news content (page kinds exist; content arrives with M2). Anything in the prototype's 76 operations that is not listed above is not in the v2 baseline.

## Roles and members (000010, roadmap slice 7)

Status: on `feat/v2-collab-participation-api`, stacked on `feat/v2-read-api`. Not applied to production.

New error codes: `lv_limit_reached` (a slot or total limit is used up) and `lv_rate_limited` (guest rate, below).

No escalation, everywhere: a caller cannot create, edit, delete, assign or unassign a role carrying a capability
they do not hold, and cannot remove a member who holds a capability they lack. The Owner role is never editable,
deletable or assignable (`lv_owner_protected`).

- `lv_capability_catalog()`: `{ ok, groups: [{ group, capabilities: [{ capability, label }] }] }`. Works signed out.
  Groups today: `hub`, `members`, `roles`, `campaigns`, `analytics`.
- `lv_role_list(p_hub)` needs `admin.roles.manage`:
  `{ ok, roles: [role], custom_slots: { used, limit } }` where `role` is
  `{ role_id, key, name, icon, is_owner, is_system, capabilities: [...], member_count }`. `limit` is null while undecided.
- `lv_role_create(p_hub, p_name, p_icon?, p_capabilities?, p_groups?)` needs `admin.roles.manage`. `p_groups` adds every
  capability in each named group. Returns `{ ok, role }`. Name is 1 to 40 characters and unique in the Hub (any case);
  icon is a lowercase token like `shield` (`[a-z0-9-]`, up to 40). Errors: `lv_invalid_input` (unknown capability or
  group, bad name or icon), `lv_conflict` (name taken), `lv_forbidden` (escalation), `lv_limit_reached` (no free custom
  slot), `lv_policy_undecided` with `missing: ["roles.max_custom_per_hub"]` (no slot limit set yet; fails closed).
  The Owner role never uses a slot. Slots will come from the entitlement map (Starter family 3, Team family 6).
- `lv_role_update(p_role, p_name?, p_icon?, p_capabilities?, p_groups?)`: omitted fields are unchanged; `p_icon = ''`
  clears the icon; giving `p_capabilities` or `p_groups` replaces the whole set. Returns `{ ok, role }`.
- `lv_role_delete(p_role)`: `{ ok }`. Unassigns the role from everyone.
- `lv_member_role_assign(p_membership, p_role)` / `lv_member_role_unassign(p_membership, p_role)` need
  `admin.roles.manage`. Return `{ ok, roles: [{ key, name }] }` for that member. Only accepted members hold roles
  (`lv_not_accepted`).
- `lv_hub_join(p_hub)`: `{ ok, status: "accepted"|"pending", already_member }`. Open Hubs admit at once; approval Hubs
  create a pending request; invite-only Hubs answer `lv_forbidden`. A private Hub answers `lv_not_found` to non-members.
  A removed person gets `lv_forbidden`.
- `lv_member_leave(p_hub)`: `{ ok }`. The Owner cannot leave (`lv_owner_protected`). Someone who left may join again.
- `lv_member_admit(p_membership)` and `lv_member_reject(p_membership)` need `admin.members.admit` and a pending request
  (`lv_lifecycle_invalid` otherwise). Rejecting deletes the request, so the person may ask again.
- `lv_member_remove(p_membership)` needs `admin.members.remove`. Permanent: a removed member can never rejoin, not even
  with an invitation. Not for yourself (`lv_invalid_input`; use leave) and never the Owner.
- `lv_invite_redeem` now also re-admits someone who left and turns a pending request into membership.
- `lv_member_list` (000007) can now show `status: "pending"` rows for approval Hubs.

Ownership transfer is not here; it belongs to the Hub ownership slice.

## Campaign lifecycle and versions (000011, roadmap slice 8)

Stored `status` is now `draft`, `active`, `paused`, `closed` or `archived`. The UI should show a phase:

| Phase | Meaning |
|---|---|
| `draft` | Being written. Editable. |
| `scheduled` | `status = active` and `opens_at` is in the future. Holds an active slot already. |
| `open` | `status = active` and inside its window. Accepts responses. |
| `ended` | `status = active` and `closes_at` has passed. No responses; results count as finished. |
| `paused` | Stopped by a manager. No responses. Does not hold a slot. |
| `closed` | Final for responses. |
| `archived` | Hidden from the working list; nothing deleted. |

`lv_campaign_list` and `lv_campaign_get` return the stored `status` with `opens_at` and `closes_at`; derive the phase
from those three as in the table.

Publishing (`lv_campaign_activate` or `lv_campaign_schedule`) writes an immutable version: the question set, the
participation settings and the active-Campaign limit in force. After publishing, the Campaign and its questions answer
`lv_locked` to edits.

All of these need `campaign.manage`:

- `lv_campaign_update(p_campaign, p_title?, p_mode?, p_anonymity?, p_opens_at?, p_closes_at?, p_clear_schedule?)`:
  draft only. Omitted fields are unchanged; `p_clear_schedule = true` removes the window. `lv_invalid_input` for a blank
  title, an unknown mode, or a window that closes before it opens or already closed.
- `lv_campaign_question_update(p_question, p_position?, p_kind?, p_prompt?, p_config?)` and
  `lv_campaign_question_remove(p_question)`: draft only (`lv_locked`). A taken position is `lv_conflict`.
- `lv_campaign_schedule(p_campaign, p_opens_at?, p_closes_at?)`: publishes a draft with a window.
  `{ ok, status, phase: "scheduled"|"open", version }`. Same gate as activation (`lv_gate_blocked` with `reasons`).
- `lv_campaign_pause(p_campaign)`: running or scheduled to paused. `lv_lifecycle_invalid` otherwise.
- `lv_campaign_resume(p_campaign)`: paused to active. Needs a free active slot again: `lv_gate_blocked` with
  `reasons` of `limit_reached`, `limit_undefined` or `already_closed`.
- `lv_campaign_close(p_campaign)`: now also closes paused and scheduled Campaigns. A draft is `lv_lifecycle_invalid`.
- `lv_campaign_archive(p_campaign)`: closed to archived, or discards a draft. Running or paused is `lv_lifecycle_invalid`.
- `lv_campaign_versions(p_campaign)`: `{ ok, versions: [{ version, published_at, settings, questions }] }`.

## Participation modes and guests (000012, roadmap slice 10)

A Campaign has `anonymity` (`anonymous` or `identified`) and `audience` (`members` or `members_and_guests`).
Members answer through `lv_submit_response` as before. Guests answer by the Campaign's join code, signed out.

- `lv_campaign_set_participation(p_campaign, p_audience?, p_guest_limit?, p_clear_guest_limit?)` needs
  `campaign.manage`; draft only (`lv_locked`), because it is part of the published version. `p_guest_limit` caps the
  total number of guest responses.
- `lv_guest_campaign_get(p_join_code)`: signed out.
  `{ ok, campaign: { campaign_id, title, mode, anonymity, phase, opens_at, closes_at }, hub: { name }, questions, can_respond }`.
  Only a published, unpaused Campaign that allows guests is found; anything else is `lv_not_found`. Nothing else about
  the Hub is returned.
- `lv_guest_submit(p_join_code, p_guest_key, p_answers)`: signed out. `p_guest_key` is a random secret of 32 to 200
  characters that the browser generates once per Campaign and keeps; only its hash is stored. Success:
  `{ ok, receipt_id, duplicate }` (the same key again returns the first receipt). Errors: `lv_not_found`, `lv_closed`,
  `lv_invalid_input`, `lv_limit_reached` (guest total reached), `lv_rate_limited` (too many guest responses this minute),
  `lv_policy_undecided` with `missing: ["participation.guest_rate_per_minute"]` (no rate set yet; fails closed).

Guests never become members, never count toward member totals or survey thresholds, and leave no stored link between
a guest and their answers. Per-network limits (per IP) belong at the edge in front of the API.

## Analytics additions (000013, roadmap slice 11)

`lv_analytics_query` keeps its contract and gains:

- `participant_count` now also returns `guest_n` and `guest_suppressed`. `n` stays unique member participants.
- `participation_rate`: `{ ok, metric, n, eligible_n, rate, suppressed }`. `n` is unique member participants,
  `eligible_n` accepted members, `rate` is `n / eligible_n` (null when there are no members or when suppressed).
  Guests never count.
- `rating_summary` (needs `p_question` of kind `rating`): `{ ok, metric, question_id, n, mean, suppressed }`.
- `answer_distribution` for `multi_choice` now counts each selected option once instead of each combination.
- Anonymous results are published once the Campaign has **finished**: closed, archived, or past `closes_at`. A paused
  anonymous Campaign is not finished. A late guest response changes the frozen population like a member's would.

`lv_analytics_overview(p_campaign)` needs `analytics.read`. It returns everything a results page needs:
`{ ok, participant_count: {...}, participation_rate: {...}, questions: [{ question_id, position, kind, prompt, result }] }`,
where each `result` is the `answer_distribution` envelope (plus `summary` for rating questions) or that question's own
refusal (for example free text). A whole-Campaign refusal (`lv_policy_undecided`, `lv_lifecycle_invalid`) is returned as is.

## Launch API (000014–000017)

Status: on the launch branch, tested by `scripts/db-test-canonical.sh` (suites 14, 15, 16). Not applied to production.
Binding sources: `docs/v2/LAUNCH_PLAN.md` and the founder decisions of 2026-11-07 (recorded below as L-07…L-13).

### Grants (since 000014, LC-05)

No `lv_api` function is executable by `PUBLIC`. Every function is granted to `authenticated`. `anon` (signed out)
may call only: `lv_my_context` (answers `lv_unauthenticated`), `lv_plan_limits`, `lv_waitlist_status`,
`lv_capability_catalog`, `lv_hub_get`, `lv_hub_pages_get`, `lv_hub_reservation_status`, `lv_guest_campaign_get`,
`lv_guest_submit`, `lv_report_abuse`. **A signed-out call to anything else is refused by PostgREST with a
permission error (SQLSTATE 42501, HTTP 401/403), not an envelope.** The UI must not call signed-in operations
without a session. Service-only functions (`lv.billing_apply_event`, `lv.retention_sweep`) live in `lv`, are
executable only by `service_role`, and are never in `lv_api`.

### New error codes

| Code | Meaning |
|---|---|
| `lv_entitlement_required` | No active plan or Hub credit for a premium action. Adds `product` (a hint, e.g. `starter_hub`). |
| `lv_limit_reached` | A limit from the map is used up. Adds `limit` and `used` (and `reasons` for Quick Survey activation). |
| `lv_billing_unavailable` | Paid checkout is not live (`billing.provider_ready` false or no payment link). |
| `lv_price_unset` | A product has no price. **No longer returned for Campaign Plus** (founder priced it). |
| `lv_not_available` | Operation intentionally off (e.g. `lv_campaign_create` on a personal space). |
| `lv_confirmation_mismatch` | Typed confirmation wrong (slug for transfer/delete, `DELETE` for account delete). |
| `lv_reauth_required` | Destructive action needs a session issued within `security.reauth_seconds` (600). Adds `max_age_seconds`. Sign in again. |
| `lv_hub_gone` | `lv_hub_get` on a slug whose Hub was deleted within the 30-day quarantine. Neutral: never old data, never a new owner. |
| `lv_rate_limited` | Also: Quick Survey creation over `quick.create_per_hour` (20), abuse reports over `abuse.reports_per_minute`. |

`lv_beta_required` is no longer returned. `lv_gate_blocked` reasons gain `entitlement_required`, `survey_limit_reached`,
`too_many_questions`, `kind_not_allowed`, `blocked`, and the error carries `limit`, `used`, `limit_key` for the first
blocking limit.

### Entitlement map

One map, `lv.plan_limits(family, key, value)`. The backend evaluates the active entitlement; the UI only displays.

| Key | free | starter | team |
|---|---|---|---|
| `quick.max_active` | 5 | – | – |
| `quick.max_questions` | 10 | – | – |
| `quick.kinds` | rating, single_choice, multi_choice, yes_no, text | – | – |
| `roles.max_custom` | – | 3 | 6 |
| `pages.max_custom` | – | 3 | 10 (provisional, A-04) |
| `campaigns.max_active` | – | 15 | 15 (provisional, A-04) |
| `surveys.max_active` | – | 2 | 5 |
| `surveys.threshold` | – | `{op:"gt", value:0.5}` | `{op:"gte", value:0.2}` |
| `analytics.export` | – | true | true |
| `discover.min_members` | – | – | 700 |

Products (cents): `quick` (free, 0), `founding` (starter, waitlist grant, not purchasable), `starter_hub` 1300/month,
`team_hub` 2900/month, `campaign_starter` 1900 first 2 weeks + 1300/extra week, `campaign_plus` 3900 first 2 weeks +
1900/extra week (team), `hub_reservation` 2500/12 months (no family, grants no features).

A Hub's plan is its best active hub-scoped entitlement (team over starter). No active entitlement ⇒ premium writes
fail `lv_entitlement_required`: activate, schedule, resume, role create/update/assign, Hub invite create, pages update,
export. Reads, pausing, closing, archiving, member housekeeping and Hub update keep working; nothing is deleted.
Founding entitlements have no stored end: they end at `billing.launched_at` + 30 days once that policy is set.

**Survey gate.** Activating a `survey`-mode Campaign in a community Hub is allowed while fewer than
`surveys.max_active` active surveys have **not** met the family threshold. Threshold = unique accepted members who
took part ÷ accepted members; guests, duplicates and non-members never count; zero eligible ⇒ not met. A new Hub
can always activate its first surveys, so it never deadlocks; a survey that meets the threshold frees its slot.

### Context and plan limits

- `lv_my_context()` adds `entitlements: [Entitlement]`, `hub_credits: int`, `quick_surveys: { active, limit,
  question_limit }`, `waitlist: { status: "none"|"admitted"|"waitlisted", position?, joined_at? }`,
  `recent_participation: [{ campaign_title, hub_display_name (null for Quick Surveys), answered_on (UTC date),
  kind: "quick"|"hub" }]` (the caller's own, newest first, max 10, never answers). `hubs` lists
  community Hubs only and each gains `kind` and `plan: { family, product, state, starts_at, ends_at }`
  (`state`: `active`|`scheduled`|`expired`|`none`).
- `Entitlement = { id, product, family, scope: "account"|"hub", hub_id?, starts_at, ends_at?, state, source:
  "waitlist"|"billing"|"grant" }`. (The plan said `"whitelist"`; the founder renamed it **waitlist**.)
- `lv_plan_limits()` (signed out) → `{ ok, families: { free|starter|team: { key: value } }, products: [{ product,
  family, price_cents, interval: "none"|"month"|"weeks"|"year", first_period_weeks?, extra_week_cents?,
  period_months?, purchasable }] }`. Values are JSON (numbers, booleans, a list, a threshold object).

### Waitlist (founder: "waitlist", not "whitelist")

- `lv_waitlist_status()` (signed out) → `{ ok, seats_total, seats_taken, open, me?: { status, position?, joined_at? } }`.
- `lv_waitlist_join(p_contact_email?, p_intended_hub_name?, p_consent_version?)` → `{ ok, status: "admitted"|
  "waitlisted", position, already_joined, granted?: Entitlement }`. Sign-in required. **Deviation:** `p_note` is
  replaced by `p_intended_hub_name` and `p_consent_version` (final brief item 4). A contact email needs
  `p_consent_version` equal to policy `waitlist.consent_version` ("2026-11-07"), else `lv_invalid_input` with
  `consent_version`. Admission (first 50) is serialised by an advisory lock and proven by a two-connection race.
  Admitted ⇒ one Founding Hub credit (Starter family). Idempotent. The waitlist is never authorization.
  Seats are never re-issued (000017, NEW-08): deleting an admitted account does not free its seat, positions never
  repeat, and at most `waitlist.seats` Founding grants are ever issued. `seats_taken` counts seats issued.

### Quick Surveys (personal space)

- `lv_quick_survey_create(p_title, p_access "link"|"invite" = "link", p_anonymity = "anonymous", p_guests = true)`
  → `{ ok, campaign: CampaignSummary }`. Guests only with `link` (silently off for `invite`). Throttled:
  `lv_rate_limited` above 20 creations per hour.
- `lv_quick_survey_list()` → `{ ok, surveys: [CampaignSummary], active, limit, question_limit }` (history included).
- `CampaignSummary = { campaign_id, title, mode, anonymity, status, phase, access, guests, opens_at, closes_at,
  created_at, blocked, question_count, join_code }`.
- Edit, questions, schedule, activate, pause, close, results reuse `lv_campaign_*` / `lv_analytics_*`.
  A Quick Survey holds one of the 5 slots while scheduled, open or **paused**; closing or archiving frees it.
  `lv_campaign_archive` archives an open or paused Quick Survey in one call (closes it first). Activation beyond
  5 ⇒ `lv_limit_reached { limit: 5, used: 5 }`; an 11th question ⇒ `lv_limit_reached { limit: 10, used: 10 }`;
  a Quick Survey stays `mode: survey`; `lv_campaign_create` on the personal space ⇒ `lv_not_available`.
- Respondents: `lv_guest_campaign_get(p_join_code)` now also resolves for signed-in callers. It returns
  `campaign.access`, `campaign.guests_allowed`, `signed_in`, `sign_in_required`, `has_responded`, `can_respond`;
  `hub.name` is null for a personal space. Signed-in respondents answer with `lv_submit_response(campaign_id, …)`;
  guests with `lv_guest_submit`. A link survey without guests tells a signed-out visitor `sign_in_required: true`.
  `lv_campaign_get` works for eligible non-members (no `hub_id` for them).
- Campaign invites (only for `access = "invite"`): `lv_campaign_invite_create(p_campaign, p_max_uses?, p_expires_at?)`
  → `{ ok, invite: { invite_id, token, max_uses, uses, expires_at, revoked_at, created_at, state } }`;
  `lv_campaign_invite_list(p_campaign)` → `{ ok, invites, eligible }` (tokens shown to managers, like join codes);
  `lv_campaign_invite_revoke(p_token)`; `lv_campaign_invite_redeem(p_token)` → `{ ok, campaign_id, join_code,
  already_eligible }` or `lv_invalid_code`. Redeeming grants eligibility for that Campaign only — **never a Hub
  membership**; invited respondents never appear in member lists or totals.

### Abuse controls

- `lv_report_abuse(p_join_code, p_reason)` (signed out allowed) → `{ ok, received: true }` for known and unknown codes
  alike; `lv_rate_limited` above `abuse.reports_per_minute`.
- `lv_admin_campaign_block(p_campaign, p_reason)` / `lv_admin_campaign_unblock(p_campaign)`: platform administrators
  only (`lv_forbidden` otherwise). A blocked Campaign accepts no responses (`lv_closed`), is `lv_not_found` to
  respondents and guests, cannot be activated (`blocked` reason), and keeps all data. Managers see `blocked`,
  `blocked_reason` in `lv_campaign_get`.

### Hubs and accounts

- `lv_hub_create(p_slug, p_name)`: consumes one Hub credit (oldest valid first) or `lv_entitlement_required
  { product }`; attaches a hub entitlement of the credit's family; returns `{ ok, hub_id, slug, plan }`. A slug held
  by someone else's reservation, or quarantined after a deletion, is `lv_conflict`.
- `lv_hub_get(p_slug)` adds `hub.about`, `hub.accent`, a top-level `accents: [{ key, hex, label }]` (9 contrast-safe
  colours) and, for members, `membership.plan`. These shapes are stable (the UI normalises them). A quarantined slug answers `lv_hub_gone`.
- `lv_hub_update(p_hub, p_display_name?, p_visibility?, p_membership_mode?, p_about?, p_accent?)` → `{ ok, hub }`.
  Needs `hub.settings.manage`. `p_accent = ''` and `p_about = ''` clear.
- `lv_owner_transfer(p_hub, p_membership, p_confirm)` → `{ ok }`. Owner only, recent sign-in, `p_confirm` = slug,
  target an accepted member. The Owner role moves; the old Owner stays an ordinary member. **Not built:** explicit
  acceptance by the receiving member (spec section 6); the launch contract governs.
- `lv_hub_delete(p_hub, p_confirm)` → `{ ok }`. Owner only, recent sign-in, `p_confirm` = slug. Deletes the Hub's data
  (A-05). Keeps a tombstone (slug and time only); the slug is quarantined for `hub.deleted_slug_cooldown_days` (30):
  nobody can claim it, not even the former Owner, and reads answer `lv_hub_gone`. A later Hub gets a new id.
- `lv_hub_pages_get(p_hub)` (signed out for public Hubs) → `{ ok, pages: [Page], custom_slots: { used, limit } }`;
  non-managers see enabled pages only; defaults are Home and Campaigns.
- `lv_hub_pages_update(p_hub, p_pages)` → `{ ok, pages }`. Replaces the set. `Page = { key, kind, title, body?,
  position, enabled }`; kinds `home|campaigns|custom|shop|leaderboard|news|comments`; Home and Campaigns are always
  present and enabled; only `custom` counts against `pages.max_custom` (`lv_limit_reached { limit, used }`). Body is
  plain text (max 20000), rendered as text, never HTML.
- `lv_profile_update(p_display_name)` → `{ ok, account: { account_id, display_name } }`.
- `lv_account_delete(p_confirm)` → `{ ok }`. `p_confirm` must be `DELETE`; recent sign-in; `lv_owner_protected` while
  the account owns a community Hub. Deletes (founder decision): profile, identity links, memberships and roles, Hub
  invitations it created and its redemptions, Campaign invites it created, eligibility, credits, account
  entitlements, the waitlist entry and contact email, its personal space with its Quick Surveys, and its
  participation rows; scrubs audit rows naming it. Its identified submissions are irreversibly unlinked (no account,
  time coarsened to the UTC day) and their free-text answers deleted; structured answers and aggregates remain.
  Released anonymous results it took part in become withheld (the population changed).

**Personal spaces are never Hubs (LC-06).** Every Hub-scoped operation answers `lv_not_found` for a personal space id:
join, leave, member list/admit/reject/remove, role list/create/update/delete/assign/unassign, Hub invite
create/list/revoke, Hub update, pages get/update, owner transfer, Hub delete, billing summary, checkout for a Hub,
Discover. It has no slug, is never listed and cannot be reserved.

### Billing-ready

- `lv_checkout_start(p_product, p_hub?, p_weeks?, p_slug?)`: **Deviation:** `p_slug` is added for Hub Name
  Reservation. Order: unknown/unpurchasable product ⇒ `lv_invalid_input` (no price ⇒ `lv_price_unset`); then
  `lv_billing_unavailable` while `billing.provider_ready` is false; then validation (`p_hub` must be a community Hub
  you own, Campaign plans need `p_weeks` ≥ 2, a reservation needs a free slug); then a payment link for the product in
  `billing.payment_links` (else `lv_billing_unavailable`). Success: `{ ok, checkout_url, intent_id, amount_cents }`,
  where the URL carries `client_reference_id=<intent_id>`. Payment Links must enable Stripe Tax (automatic tax); no
  tax logic in SQL.
- `lv_billing_summary(p_hub)` → `{ ok, plan: { family, product, state, starts_at, ends_at }, limits, usage:
  { custom_roles, custom_pages, active_campaigns, active_surveys }, reservation?, billing_ready }`. Owner or
  `billing.view`.
- Service role only: `lv.billing_apply_event(p_provider, p_event_id, p_type, p_payload)` → `{ ok, duplicate,
  outcome: "applied"|"ignored"|"rejected" }`, idempotent on `(provider, event_id)`, logs no payload. Semantics
  (000017, compliance NEW-01 and NEW-02, founder F-08):
  - `checkout.session.completed` and `checkout.session.async_payment_succeeded` grant **only** when a checkout intent
    exists for the session (`client_reference_id`), `payment_status` is `paid` or `no_payment_required`, `currency` is
    `usd`, `amount_subtotal` (pre-tax) equals the intent's `amount_cents`, and the intent has not been used. Otherwise
    the event is recorded `rejected` (or `ignored` for an already-used intent) and grants nothing. Product, account,
    Hub, slug and weeks come from the intent only, never from metadata. A delayed payment grants on
    `async_payment_succeeded`, exactly once.
  - Grants: Hub credit (no `hub_id`) or hub entitlement, monthly to the period end; Campaign plans for exactly the
    intent's weeks; reservations for 12 months (renewal extends from the current expiry).
  - `invoice.paid` extends a subscription to the period end and records which payment paid it.
  - `customer.subscription.deleted` keeps access to the end of the paid period (no proration, nothing deleted). Only
    an explicit full refund of that subscription recorded first, followed by an immediate cancellation (`ended_at`),
    ends access at `ended_at`.
  - `charge.refunded`: a partial refund never revokes (recorded for support). A full refund revokes an unused Campaign
    credit or a Campaign window that has not started, and releases a reservation. A Campaign window that has started
    is kept (recorded for support). A Hub subscription refund never ends access by itself.
  - Other types are ignored.
  The webhook maps `amount_subtotal`, `currency`, `payment_status`, `mode` (checkout), `ended_at` (subscription
  deleted) and `amount`, `amount_refunded`, `refunded` (charge refunded). Until `billing.provider_ready` is true and
  payment links exist, none of this is reachable.
  Called by the `billing-webhook` Edge Function (Stripe signature verified, 503 while `STRIPE_WEBHOOK_SECRET` is unset).

### Hub Name Reservation

- `lv_hub_reservation_status(p_slug)` (signed out) → `{ ok, slug, state: "available"|"active"|"grace"|"released"|
  "taken", mine, expires_at?, grace_ends_at? }`. Dates only for the holder. `taken` covers existing Hubs, reserved
  words and quarantined slugs. ACTIVE for 12 months, GRACE 25 days, then RELEASED, derived from time. During ACTIVE and
  GRACE only the holder can create that Hub. A reservation grants no features and never exposes anyone's data.

### Analytics (strict, founder L-07, L-10, L-11; compliance LC-01, LC-02)

For **anonymous** Campaigns (results only once finished, population frozen at first release, cohort
`campaign.min_cohort` = 5):
- Cells below the cohort are merged into **one** withheld bucket `{ key: null, n: null, suppressed: true, reason:
  "withheld" }`; no per-option presence. If that bucket would be smaller than the cohort, the smallest published cells
  join it until it is not; if nothing is left, the whole question is withheld.
- Dominance: a cell equal to the question total withholds the whole question (`withheld: true, reason: "dominance"`).
- `answer_distribution` → `{ ok, metric, question_id, cells, withheld, reason }`.
- `rating_summary`: whenever anything in the question is withheld, `n` and `mean` are null with `suppressed: true`.
- `participation_rate`: withheld (`n`, `eligible_n`, `rate` null, `reason: "near_full_turnout"`) at 100% or when
  eligible minus respondents is below the cohort; `below_min_cohort` when respondents are below it.
- Free text (any Campaign): `answer_distribution` on a text question → `{ ok, metric, question_id, kind: "text", n,
  texts: [string], texts_withheld: false }` when the question has at least `campaign.min_cohort` answers, else
  `{ n: null, texts: null, texts_withheld: true }` (never an empty list as a stand-in). Random order on every call; no
  person, id, time or submission link; never counted into cells. `text_responses` is an alias (it also returns
  `responses` = `texts`). The overview uses the same shape for text questions.
- Guests: `participant_count.guest_n`, and the overview adds `guest_n` and `includes_guests` so results can say
  "includes unverified guest responses". Guests never count toward member thresholds or rates.
- `lv_analytics_overview` uses `text_responses` for text questions.
- `lv_analytics_export(p_campaign)` → `{ ok, campaign_id, generated_at, includes_guests, rows: [{ question_position,
  question, kind, key, n, suppressed, reason }], texts: [{ question_position, question, texts, texts_withheld }] }`.
  Free text is listed separately under `texts` (same rule as above), never in the aggregate `rows`. Same engine as the overview (no extra information by differencing);
  needs `analytics.export` and a Starter or Team family (`lv_entitlement_required` for Quick Surveys and expired Hubs).

Identified Campaigns keep live results with no cohort for structured questions.

### Discover

- `lv_discover_apply(p_hub)` → `{ ok, status: "submitted"|…, already_applied }` or `lv_gate_blocked { reasons:
  ["team_required", "members_below_minimum"], genuine_members, min_members }`. Needs `hub.settings.manage`. Genuine
  active members: accepted, email verified at KpnIdentity, took part in one of the Hub's Campaigns in the last
  `discover.active_window_days` (90). Quick Surveys and personal spaces are never eligible.

### Capabilities

`analytics.export` (group `analytics`) and `billing.view` (group `billing`) are added. The Owner role holds every
capability in the catalogue.

### Policies set at launch

`campaign.min_cohort` 5 (L-04), `participation.guest_rate_per_minute` 10 (L-05, L-11), `waitlist.seats` 50,
`waitlist.consent_version` "2026-11-07", `quick.create_per_hour` 20, `abuse.reports_per_minute` 20,
`security.reauth_seconds` 600, `hub.deleted_slug_cooldown_days` 30, `reservation.grace_days` 25,
`discover.active_window_days` 90, `retention.logs_days` 365 and `retention.guest_hash_days` 7 (L-13),
`billing.provider_ready` false, `billing.payment_links` null, `billing.launched_at` null.

### Reserved slugs

Every top-level UI route in `src/lib/reservedSlugs.ts` plus `waitlist`, `whitelist`, `surveys`, `s`, `brand`, `c`,
`j`, `licenses`, `__gallery`, `how-it-works`, `use-cases`, `quick`, `quick-surveys`, `q`, `builder`, `news`, `p`,
`reservation`, `reservations`, `signup`, `checkout`, `webhooks`. No customer name is reserved.

<!-- ---- track A: hardening ---- -->
## Hardening and API gaps (000018, build plan track A)

Status: branch `track-a`, tested by `scripts/db-test-canonical.sh` (suite `18_hardening`). Not applied to production.
Where this section differs from the sections above, it wins.

### Identity (LC-12)
`lv.caller_identity()` accepts only tokens with `aud = "authenticated"` (or an array holding it) **and**
`session_kind = "lunchvoice"` — exactly what the `session` function issues. Anything else is signed out
(`lv_unauthenticated` / anon permissions).

### Join codes and link tokens (LC-10)
- Every Campaign has `link_token` (32 lowercase hex, 128-bit CSPRNG). Managers get it in `lv_campaign_get.link_token`
  and Quick Survey summaries (`link_token`). Links and QR codes use `/c/<link_token>`; the 6-character `join_code` is
  for typing only.
- `lv_guest_campaign_get(p_join_code)` and `lv_guest_submit(p_join_code, …)` accept the join code **or** the link
  token. `lv_guest_campaign_get` now also returns `join_code` and `campaign.description`. Both are VOLATILE.
- Failed join-code lookups are limited per caller (account, or a daily-rotated IP hash) — `joincode.misses_per_minute`
  10 — and across all signed-out callers — `joincode.global_misses_per_minute` 300. Over the limit every code lookup
  answers `lv_rate_limited` (even a valid code). Link tokens are never limited. Unknown and unavailable codes still
  answer the same `lv_not_found`.

### Campaign description
- `lv_campaign_create(p_hub, p_title, p_mode, p_anonymity?, p_description?)` (≤ 2000 characters, trimmed).
- `lv_campaign_update(…, p_description?, p_access?)`: `p_description` NULL leaves it, `''` clears it.
- Returned as `description` in `lv_campaign_get.campaign`, `lv_campaign_list.campaigns[]`, `CampaignSummary` and
  `lv_guest_campaign_get.campaign`. Over 2000 ⇒ `lv_invalid_input`.

### Choice options are validated on the server
`lv_campaign_question_add` / `lv_campaign_question_update` refuse (`lv_invalid_input`, message explains) a
`single_choice`/`multi_choice` question unless `config.options` is an array of 2–10 strings, each non-empty (after
trimming), ≤ 200 characters, all different ignoring case and surrounding spaces, and `config.max`, if present, is an
integer from 1 to the option count. On update the effective kind and config (new or stored) are checked.

### Quick Survey access while draft
`lv_campaign_update(p_campaign, p_access => 'link'|'invite')`: Quick Surveys (personal space) only, draft only
(`lv_locked` after publishing). Switching to `invite` turns guests off (`audience = members`); switching to `link`
leaves guests off until `lv_campaign_set_participation`. On a Hub Campaign ⇒ `lv_invalid_input` and nothing in the
call is applied.

### Team role targeting
- `lv_campaign_set_audience_roles(p_campaign, p_roles uuid[])` → `{ ok, audience }`. NULL or `[]` ⇒ every member.
  Draft only (`lv_locked`); Quick Surveys ⇒ `lv_not_available`; roles must belong to the Hub (`lv_invalid_input`, ≤ 20);
  needs plan limit `campaigns.role_targeting = true` (Team) else `lv_entitlement_required { product: "team_hub" }`.
- `Audience = { scope: "all_members"|"roles", roles: [{ role_id, name }], role_targeting: boolean,
  available_roles?: [{ role_id, name, is_owner }] }`, in `lv_campaign_get.audience` for managers (`available_roles` for
  community Hubs); `lv_campaign_list` gives managers `audience_scope`.
- With `scope = "roles"` only accepted members holding a targeted role can see (`lv_campaign_get`, `lv_campaign_list`)
  and answer (`lv_forbidden`) the Campaign, and only they count in eligibility, participation rate and the survey
  threshold. Guests are unaffected. Managers always see it.
- Gate reasons added: `role_targeting_unavailable` (plan no longer includes it) and `audience_empty` (every targeted
  role was deleted; the audience never widens). The published version records `audience_roles`.

### Plan limits for campaign managers
`lv_hub_limits(p_hub)` → `{ ok, plan: { family, state }, limits: { key: value }, usage: { custom_roles, custom_pages,
active_campaigns, active_surveys, active_surveys_below_threshold } }` for any member with `campaign.manage`
(`lv_forbidden` otherwise, `lv_not_found` for non-members and personal spaces). No product, dates, reservation or
billing state. `lv_billing_summary` is unchanged.

### Campaign invites are stored hashed (NEW-05)
- `lv_campaign_invite_create` → `{ ok, invite: { invite_id, token, shown_once: true, prefix, max_uses, uses,
  expires_at, revoked_at, created_at, state } }`. The token is returned **only here**.
- `lv_campaign_invite_list` → invites with `invite_id` and `prefix` (first 6 characters), never `token`.
- `lv_campaign_invite_redeem(p_token)` and `lv_campaign_invite_revoke(p_token)` work by token hash (any case).
  New: `lv_campaign_invite_revoke_by_id(p_invite)` (campaign.manage).

### Owner transfer acceptance (supersedes "Not built" above)
- `lv_owner_transfer(p_hub, p_membership, p_confirm)` (same checks) now returns `{ ok, pending: true, offer }` and
  changes nothing: the Owner, the Owner role and every membership stay as they are. A new offer cancels the pending one.
- `OwnerOffer = { offer_id, hub_id, hub_slug, hub_name, membership_id, to_display_name, from_display_name, created_at,
  expires_at, state: "pending"|"accepted"|"declined"|"cancelled"|"expired" }`; offers last `hub.owner_offer_days` (7).
- Receiving member: `lv_my_context.owner_transfer_offers: [OwnerOffer]`; `lv_owner_transfer_accept(p_offer)` →
  `{ ok, accepted: true, hub_id, slug }` (the ownership and the Owner role move, the old Owner stays a member);
  `lv_owner_transfer_decline(p_offer)` → `{ ok, accepted: false }`. Someone else's offer ⇒ `lv_not_found`; closed,
  expired or superseded (the Owner changed) ⇒ `lv_lifecycle_invalid`; target no longer accepted ⇒ `lv_not_accepted`.
- Owner: `lv_owner_transfer_status(p_hub)` → `{ ok, offer | null }`; `lv_owner_transfer_cancel(p_hub)` →
  `{ ok, cancelled }`.

### Service-only
`lv.session_exchange_consume(p_key_hash, p_expires_at)` → boolean (TRUE first time). `service_role` only; used by the
`session` Edge Function (LC-13).
<!-- ---- end track A ---- -->

<!-- ---- track B: commerce ---- -->
## Track B: commerce, email, admin (000019)

Build plan decisions B-01 (server-created Stripe Checkout Sessions) and B-02 (provider-agnostic email outbox).
Everything stays fail closed until the founder supplies keys and sets `billing.provider_ready`.

### Grants

Every new `lv_api` function below is granted to `authenticated` only (none to `anon`, none to PUBLIC). The
`lv_admin_*` functions answer `lv_forbidden` to anyone who is not an active platform admin
(`lv.is_platform_admin`), and `lv_unauthenticated` without an account. The service-role functions live in `lv`
(never `lv_api`) and are granted to `service_role` only, with `usage on schema lv` and no table grants (LC-20).

### Billing config and checkout

- `lv_billing_config()` → `{ ok, provider_ready, checkout_available, products: { starter_hub, team_hub,
  campaign_starter, campaign_plus, hub_reservation: boolean }, portal_available }`. A product is on sale when it is
  purchasable in `lv.products`, `billing.provider_ready` is true, and either valid price IDs exist in
  `billing.stripe_prices` (Checkout Session) or a legacy link exists in `billing.payment_links`. Never returns a
  secret or a price ID. `portal_available` is true when the caller has a Stripe customer. The UI enables checkout
  buttons from this, never from its own copy.
- `lv_checkout_start(p_product, p_hub?, p_weeks?, p_slug?)` (replaced): same validation and order as before, plus a
  rate limit (`billing.intents_per_hour`, 20, ⇒ `lv_rate_limited`). Success with price IDs:
  `{ ok, intent_id, amount_cents, checkout: "session", mode: "subscription"|"payment" }` (no URL: the `checkout`
  Edge Function creates the session). With only a legacy link: `{ ok, intent_id, amount_cents, checkout: "link",
  checkout_url }` as before.
- `lv_billing_portal_check()` → `{ ok, account_id }` (the caller's own) or `lv_not_found` (no Stripe customer) /
  `lv_billing_unavailable`. Used by the Edge Function only.
- `lv_billing_summary(p_hub)` (replaced, additive): adds `subscription: { status, cancel_at_period_end,
  current_period_end, manageable } | null` (manageable only for the paying account) and `purchasable: { product:
  boolean }` for the four Hub and Campaign plans.
- Policy `billing.stripe_prices`: `starter_hub`, `team_hub`, `hub_reservation` → `"price_..."` or `{ "price":
  "price_..." }`; `campaign_starter`, `campaign_plus` → `{ "first": "price_...", "extra_week": "price_..." }`. A Campaign
  plan is one first-period line item plus the extra-week price with `quantity = weeks − first_period_weeks`, so the
  subtotal equals `lv.checkout_amount` exactly ($19 + $13/extra week; $39 + $19/extra week). Malformed entries are
  treated as not configured.

### `checkout` Edge Function (`POST /functions/v1/checkout`, `verify_jwt = false`)

Headers: `apikey: <anon key>`, `authorization: Bearer <LunchVoice session token>`.

- `{ action: "checkout", product, hub?, weeks?, slug?, return_path? }` → `200 { ok, url, intent_id }`. The function
  forwards the caller's token to `lv_checkout_start` (the database authenticates and authorises), reads the intent's
  context with the service role (`lv.checkout_session_context`), creates or reuses the account's Stripe customer
  (`lv.billing_customer_set`), creates the Checkout Session (`automatic_tax[enabled]=true`, `client_reference_id` and
  `metadata[intent_id]` = intent id, customer address collected for Stripe Tax, no promotion codes) and records the
  session id (`lv.checkout_intent_attach`). Subscription mode for `starter_hub`/`team_hub`; payment mode for Campaign
  plans and `hub_reservation`. `return_path` must be a same-site path; Stripe returns to
  `https://lunchvoice.com{return_path}?checkout=success|cancelled`. The redirect never grants: only the webhook does.
- `{ action: "portal", return_path? }` → `200 { ok, url }`: a Stripe Customer Portal session for the caller's own
  customer, or `404 lv_not_found`.
- Errors: `{ ok: false, error: { code, message } }` with 401 `lv_unauthenticated`, 403, 404, 409 `lv_conflict`,
  429 `lv_rate_limited`, 400 `lv_invalid_input`, 503 `lv_billing_unavailable` (no `STRIPE_SECRET_KEY`, no database
  URL, no price IDs, or the database said so), 502 `lv_billing_unavailable` (Stripe unreachable: "Nothing was
  charged"). Stripe's own error text is never returned.

### Webhook additions

`lv.billing_apply_event` is now a thin wrapper; the 000017 grant path is unchanged as `lv.billing_apply_event_core`
(no longer executable by anyone but the owner). The wrapper adds:

- `customer.subscription.updated`: records `status`, `cancel_at_period_end` and the period end in
  `lv.billing_subscriptions` for display. It never changes access; a cancellation at period end ends access through
  `customer.subscription.deleted` at that end, as before.
- After an applied subscription checkout: remembers the subscription (account, Hub, product) and the session's
  `customer`. `invoice.paid` (renewal) also updates the stored period end; `customer.subscription.deleted` marks it
  `canceled`.
- The webhook maps `customer` (checkout), `status` and `cancel_at_period_end` (subscription updated), and reads the
  payment intent of `invoice.paid` from `payments.data[0].payment.payment_intent` on newer API versions.

### Hub Name Reservation purchase

`lv_checkout_start('hub_reservation', null, null, slug)` for an available (or released) name, or for the caller's own
reservation in ACTIVE or GRACE (renewal, +12 months from the current expiry). Someone else's ACTIVE/GRACE
reservation, an existing Hub, a reserved word or a quarantined name ⇒ `lv_conflict`. UI: `/reserve?slug=`.

### Transactional email (B-02)

`lv.email_outbox (id, template, account_id, to_address, payload, status queued|sending|sent|failed|cancelled,
attempts, last_error, dedupe_key, next_attempt_at, locked_at, sent_at, provider_message_id, created_at)`. It never
holds an answer; a sent or failed message keeps no payload; finished rows are deleted after `email.retention_days`
(30). Rows cascade with `account_id`, so deleting an account deletes its mail.

| Template | Design | Enqueued when | To |
| --- | --- | --- | --- |
| `waitlist_joined` | E01 | a waitlist join that left a contact email with consent (none otherwise) | the contact email |
| `hub_created` | E03 | a community Hub is created | the Owner's verified email |
| `hub_invite` | E04 | `lv_invite_email_send` | the given address |
| `reservation_confirmed` | E05 | a reservation is bought or renewed | the holder's verified email |
| `reservation_expiring` | E05 | `email.reservation_reminder_days` (14) before expiry, once per period | holder |
| `reservation_grace` | E06 | the reservation entered GRACE, once per period | holder |
| `participation_receipt` | E07 | a member's participation in an **identified** Campaign (never anonymous, never guests); policy `email.participation_receipts` | respondent's verified email |
| `shop_order` | E08 | track C calls `lv.email_enqueue('shop_order', account, lv.account_email(account), payload, dedupe)` | buyer |

- `lv_invite_email_send(p_hub, p_code, p_to)` → `{ ok, queued, already_sent }`. Needs `admin.members.admit`; the code
  must be a live invite of that Hub (checked against its hash); rate-limited by `email.invites_per_hour` (30). Errors:
  `lv_forbidden`, `lv_invalid_code`, `lv_invalid_input`, `lv_rate_limited`. The audit never records the address.
- `lv.email_enqueue(p_template, p_account, p_to, p_payload, p_dedupe?) → uuid | null` (internal, for other tracks'
  definer functions): returns null for an unknown template, a bad address, a payload over 4 KB, or a seen dedupe key.
  Never raises. Payloads carry names, slugs, dates and ids only.
- Service role (the `email-dispatch` function): `lv.email_reservation_sweep()`, `lv.email_claim(limit)` (skip-locked;
  reclaims messages stuck in `sending` for 15 minutes), `lv.email_mark(id, 'sent'|'retry'|'failed', error?,
  provider_id?)` (retry backs off 2^attempts minutes up to `email.max_attempts`, 5), `lv.email_retention_sweep()`.
- `email-dispatch` Edge Function (`POST`, `verify_jwt = false`, bearer must equal `SUPABASE_SERVICE_ROLE_KEY` or
  `EMAIL_DISPATCH_SECRET`): sweeps reservations, then sends due mail through Resend when `RESEND_API_KEY` is set
  (idempotency key per message), otherwise claims nothing and leaves mail queued. Returns `{ ok, provider:
  "resend"|"none", claimed, sent, retried, failed, queued }`. Templates are code in
  `supabase/functions/_shared/email/templates.ts` (text + HTML, no images, no tracking).

### Platform admin console (`/admin`)

All return `lv_forbidden` to non-admins.

- `lv_admin_overview()` → `{ ok, waitlist: { seats_total, seats_taken, admitted, waitlisted, with_contact },
  reports_open, campaigns_blocked, discover_pending, billing: { provider_ready, events_7d, rejected_7d }, email:
  { queued, sent, failed } }`.
- `lv_admin_waitlist(p_limit = 50, p_offset = 0)` → `{ ok, total, entries: [{ entry_id, status, position, joined_at,
  has_contact_email, intended_hub_name }] }`. Never an address.
- `lv_admin_waitlist_contact(p_entry)` → `{ ok, entry_id, contact_email, consent_version }`; audited as
  `admin.waitlist_contact_viewed` (target = entry id, no address).
- `lv_admin_abuse_reports(p_status = 'open'|'actioned'|'dismissed'|'all')` → `{ ok, reports: [{ report_id, status,
  reason, created_at, campaign_id, campaign_title, join_code, blocked, hub_name, hub_slug, quick_survey,
  open_reports }] }` (latest 200; the reporter is never returned). Block/unblock through the existing
  `lv_admin_campaign_block` / `lv_admin_campaign_unblock`.
- `lv_admin_report_dismiss(p_report)` → `{ ok, status: "dismissed" }` (open reports only, else `lv_not_found`).
- `lv_admin_discover_list(p_status = 'submitted'|'approved'|'rejected'|'all')` → `{ ok, applications: [{
  application_id, status, hub_id, hub_slug, hub_name, genuine_members_at_apply, genuine_members_now, family,
  applied_at, decided_at, note }] }`.
- `lv_admin_discover_decide(p_application, p_approve, p_note?)` → `{ ok, status }`. Writes
  `lv.discover_applications.status` (`approved`/`rejected`; **track C reads this for the listing**) and
  `lv.discover_decisions` (who, when, note ≤ 500). A decision can be reversed. Nobody decides an application for a Hub
  they own or submitted (`lv_forbidden`).
- `lv_admin_billing_events(p_limit = 100)` → `{ ok, events: [{ id, type, outcome, reason, received_at }] }`. No
  payloads (none are stored) and no references.
- `lv_admin_email_outbox(p_limit = 50)` → `{ ok, counts: { status: n }, by_template: { template: n }, recent: [{ id,
  template, status, attempts, last_error, created_at, sent_at }] }`. No addresses, no payloads.

### Reserved slugs

`reserve` is added (the `/reserve` route). `admin` was already reserved.
<!-- ---- end track B: commerce ---- -->

<!-- ---- track C: community ---- -->
## Community and Discover (000020, track C)

Decisions C-01 (leaderboard) and C-02 (Shop and Hub points) from `docs/v2/BUILD_PLAN_2026-11-21.md`, plus C-02a
(governing agent; founder may override): all four add-on pages are in the Starter and Team families through map flags
`community.newsroom`, `community.comments`, `community.leaderboard`, `community.shop` (booleans in `lv.plan_limits`);
Team gets more Shop items (`shop.max_items` Starter 10, Team 50). No active plan: every community write fails closed with
`lv_entitlement_required`; reads, opting out and deleting keep working and nothing is deleted.

Every Hub-scoped function answers `lv_not_found` for a personal space (LC-06) and, for a private Hub, to a non-member.
For a public Hub, members-only features answer `lv_forbidden` to a signed-in non-member. A feature whose page is off
answers `lv_not_available { kind }`. Guests never post, comment, order or earn points (they have no account).

### New error codes

| Code | Meaning |
|---|---|
| `lv_insufficient_points` | Order refused: `{ balance, price }` |
| `lv_out_of_stock` | Order refused: the item has no stock left |

### Pages (replaced bodies, same signatures)

- `lv_hub_pages_get(p_hub)` adds `visibility` to each Page and `addons: { news|comments|leaderboard|shop: { enabled,
  allowed } }`. Visitors (public Hub, not a member) get Home, Campaigns, custom pages with `visibility: "public"` and the
  news page when a public post exists; never Shop, Leaderboard, Comments or a members-only page (or its body).
- `lv_hub_pages_update(p_hub, p_pages)`: `Page.visibility` `"members"` (default) | `"public"` (custom pages only; other
  kinds are stored as members). One page per non-custom kind. Enabling an add-on the plan lacks:
  `lv_entitlement_required { product, kind }`. Body is markdown-lite text (≤ 20000): the UI renders headings, lists,
  bold and http(s)/mailto links as text nodes, never HTML.

### Settings

- `lv_community_get(p_hub)` (members) → `{ ok, settings: { points_enabled, discover_category }, categories: [{ key,
  label }], addons, discover: { status: "none"|"submitted"|"approved"|"rejected" }, can: { post, moderate, shop,
  settings }, me: { leaderboard_opt_in, points|null } }`.
- `lv_community_update(p_hub, p_points_enabled?, p_discover_category?)` → same as get. `hub.settings.manage`. Category is
  one of the fixed keys (`sports_fitness`, `arts_culture`, `books_learning`, `neighbourhood`, `faith`, `clubs_hobbies`,
  `work_professional`, `health_wellbeing`, `environment`, `other`); `""` clears it.

### Newsroom

`NewsPost = { post_id, title, body, status: "draft"|"published", visibility: "members"|"public", pinned, published_at,
updated_at, author_name, comment_count|null }` (`comment_count` null for visitors).

- `lv_news_list(p_hub, p_include_drafts = false)` → `{ ok, posts, can_post }`. Signed out allowed (public posts of a
  public Hub). Drafts only for `community.post`. Order: drafts, pinned, newest.
- `lv_news_get(p_post)` → `{ ok, post, hub_id, can_post, comments_enabled }`. Signed out allowed for public posts.
- `lv_news_save(p_hub, p_title, p_body?, p_visibility = "members", p_post?)` → `{ ok, post }` (creates a draft or edits).
  `community.post`; public only on a public Hub; `community.posts_per_hour` (30).
- `lv_news_publish(p_post, p_publish = true)`, `lv_news_pin(p_post, p_pinned = true)` (published only;
  `community.max_pinned` 3 → `lv_limit_reached`), `lv_news_delete(p_post)` (also deletes its comments).

### Comments

`Comment = { comment_id, body, created_at, author_name, mine, hidden, reported_by_me, report_count? }` (`report_count`
for moderators only). Comments attach to a published news post or to the Hub's Comments page (`p_post` null); never to
Campaigns or answers.

- `lv_comment_list(p_hub, p_post?)` (members) → `{ ok, comments, can_moderate, can_comment, max_length }`. Hidden
  comments only for `community.moderate`.
- `lv_comment_add(p_hub, p_body, p_post?)` → `{ ok, comment_id }`. 1..`community.comment_max_length` (1000; over it:
  `lv_invalid_input { limit, used }`); `community.comments_per_minute` (5) → `lv_rate_limited`.
- `lv_comment_delete(p_comment)` (author or `community.moderate`), `lv_comment_hide(p_comment, p_hidden = true)`
  (`community.moderate`), `lv_comment_report(p_comment, p_reason)` → `{ ok, already_reported }` (once per member, not
  your own, `community.reports_per_hour` 20).

### Leaderboard (C-01)

- `lv_leaderboard_get(p_hub)` (members, page on) → `{ ok, me: { opted_in, campaigns }, entries: [{ rank, display_name,
  campaigns, me }] }`. Only opted-in accepted members; `campaigns` counts this Hub's Campaigns the member took part in
  that have ended (closed, archived or past close), so the board never moves while a Campaign is live. Dense rank. No
  answers, timings, Campaign ids or per-Campaign breakdown.
- `lv_leaderboard_opt(p_hub, p_opt_in)` → `{ ok, opted_in }`. Default off. Opting in needs the page and an active plan;
  opting out always works.

### Shop and Hub points (C-02)

- `lv_shop_get(p_hub)` (members, page on) → `{ ok, points_enabled, can_order, balance, can_manage, item_limit, items:
  [{ item_id, name, description, price_points, stock|null, active }], my_orders: [Order], campaign_points: [{
  campaign_id, title, status, points }]|null }` (`campaign_points` for `community.shop` only; inactive items too).
- `lv_shop_item_save(p_hub, p_name?, p_description?, p_price_points?, p_stock?, p_active?, p_item?)` → `{ ok, item }`.
  `community.shop`. Price 1..1,000,000 points; stock a number, NULL keeps it (no limit for a new item), -1 removes the
  limit. Active items ≤ `shop.max_items` (`lv_limit_reached`).
- `lv_shop_order_place(p_item)` → `{ ok, order, balance }`. Needs points on (`lv_not_available { kind: "points" }`),
  stock (`lv_out_of_stock`) and balance (`lv_insufficient_points`); `shop.orders_per_hour` 20. Balance and stock are
  exact under concurrency (advisory lock per member and Hub, item row lock).
- `lv_shop_order_list(p_hub, p_status?)` → `{ ok, orders: [Order + member_name] }` (`community.shop`).
- `lv_shop_order_update(p_order, p_status "fulfilled"|"cancelled")` → `{ ok, order }`. From `placed` only
  (`lv_lifecycle_invalid`); the Hub fulfils, the member or the Hub cancels; cancelling refunds and restores stock.
- `lv_campaign_points_set(p_campaign, p_points 0..1000)` → `{ ok, campaign_id, points }` (`community.shop`). Points are
  recorded on `lv.participation.points` / `reward_state = 'recorded'` by a trigger when someone takes part while points
  are on; changing the value never rewrites recorded points. For anonymous Campaigns the participation row has no
  submission link, so points never link a person to answers. Points have no cash value.
- `Order = { order_id, item_id, item_name, points, status: "placed"|"fulfilled"|"cancelled", created_at, updated_at,
  member_name? }`. Order email: `lv.community_order_notify(order, event)` is a no-op TODO hook for track B's
  `lv.email_enqueue`.

### Discover listing

- `lv_discover_list(p_query?, p_category?, p_limit = 24 (max 48), p_offset = 0)` → `{ ok, categories, hubs: [{ slug,
  name, about (≤ 280), accent, category, membership_mode, members_rounded }] }`. Signed out allowed. Lists community
  Hubs whose `lv.discover_applications.status = 'approved'` (set by track B's `lv_admin_discover_decide`), that are public
  and on the Team family right now. `members_rounded` = genuine active members rounded down to the nearest 100. No Hub
  id, owner or exact count. Search matches name, slug and About (LIKE wildcards are literal). Personal spaces and Quick
  Surveys never appear.

### Capabilities and policies

Capabilities `community.post`, `community.moderate`, `community.shop` (group `community`); the Owner role holds them.
Policies: `community.comment_max_length` 1000, `community.comments_per_minute` 5, `community.posts_per_hour` 30,
`community.max_pinned` 3, `community.reports_per_hour` 20, `shop.orders_per_hour` 20.

### Grants

Authenticated: every function above. Anon: `lv_discover_list`, `lv_news_list`, `lv_news_get` only (test 14's anon
allow-list includes them).
<!-- ---- end track C ---- -->

<!-- ---- staff panel (000023) ---- -->
## Staff panel (000023)

Every function below is `lv_admin_*`, granted to `authenticated` only (never `anon` or PUBLIC), and answers
`lv_forbidden` to anyone who is not an active platform admin ("staff"), `lv_unauthenticated` without an account.
Every staff action writes an audit event. Nothing here deletes customer data.

### New error code

- `lv_suspended`: the caller's account, or the Hub written to, is suspended. Message explains what still works.

### Staff management

- `lv_admin_staff_list()` → `{ ok, staff: [{ account_id, display_name, granted_at, granted_by_name, is_me }] }`
  (active staff only).
- `lv_admin_staff_add(p_email)` → `{ ok, account_id, already_staff, display_name? }`. Finds the account by a
  **verified** email (`lv.account_identities.email` with `email_verified_at`), case-insensitive, never by display
  name. No match ⇒ `lv_not_found` ("They need to sign in to LunchVoice once first"); two accounts share the verified
  email ⇒ `lv_conflict`; not an email ⇒ `lv_invalid_input`. Needs a recent sign-in (`lv_reauth_required`, LC-22).
  Audit `staff.added` (target = account id), plus `platform_admin.granted` from `lv.grant_platform_admin`.
- `lv_admin_staff_revoke(p_account)` → `{ ok }`. Yourself ⇒ `lv_conflict`; not staff ⇒ `lv_not_found`; the last
  active staff member ⇒ `lv_conflict` (counted under an advisory lock). Needs a recent sign-in. Audit `staff.revoked`
  (plus `platform_admin.revoked` from `lv.revoke_platform_admin`).

### Suspension

- `lv_admin_hub_suspend(p_hub, p_reason)` / `lv_admin_hub_unsuspend(p_hub)` → `{ ok, suspended }`. Reason 1–500
  characters (the Owner sees it). Unsuspending a Hub that is not suspended ⇒ `lv_not_found`. Audit `hub.suspended` /
  `hub.unsuspended`.
- `lv_admin_account_suspend(p_account, p_reason)` / `lv_admin_account_unsuspend(p_account)` → `{ ok, suspended }`.
  Yourself or another active staff member ⇒ `lv_conflict`. Audit `account.suspended` / `account.unsuspended`.
- Effects (enforced by one helper, `lv.assert_not_suspended(account, hub)`, called from BEFORE INSERT/UPDATE row
  triggers on every content table, so every current and future write path is covered; deletes are never guarded):
  - **Suspended Hub:** hidden from `lv_discover_list`; its Campaigns refuse responses (`lv_closed` for members and
    guests; `lv_guest_campaign_get` answers `lv_closed`); nobody can join; nothing new can be created or published in
    it (Campaigns, activation/resume, questions, invites, roles, pages, community settings, news, comments, shop
    items, orders, Discover applications, checkout for it, renaming) ⇒ `lv_suspended`. Reads, closing and pausing
    Campaigns, leaving, member management, Hub deletion and staff moderation keep working.
  - **Suspended account:** can sign in, read, leave Hubs, answer Campaigns and delete its Hubs and account, but
    cannot create a Hub or Quick Survey, create or publish Campaigns, invites, roles, pages, news, comments, shop
    items or orders, or start a checkout ⇒ `lv_suspended`.
- `lv_hub_get` adds `hub.suspension: { suspended: true, suspended_at, reason? }` while suspended (`reason` only for
  the Owner and staff). The UI shows members and visitors a neutral "This Hub is suspended" state and the Owner a
  notice with the reason.
- `lv_my_context` adds `suspension: { suspended: true, reason, suspended_at } | null`.

### Reports queue

- `lv_admin_reports(p_status = 'open'|'actioned'|'dismissed'|'all', p_type = 'all'|'survey'|'comment')` →
  `{ ok, items: [{ type, id, status, reasons[], report_count, created_at, hub_id, hub_name, hub_slug, quick_survey,
  hub_suspended, … }] }` (latest 300). Survey items add `campaign_id, campaign_title, join_code, blocked` (`id` = the
  abuse report id). Comment items are grouped per comment and add `comment_id, post_id, excerpt (280 chars), hidden,
  author_account_id, author_suspended` (`id` = comment id; up to 5 latest reasons). Reporters are never returned.
- Actions: survey dismiss `lv_admin_report_dismiss(p_report)` (000019); block/unblock
  `lv_admin_campaign_block/unblock` (000014); `lv_admin_comment_hide(p_comment, p_hidden = true)` → `{ ok, hidden }`
  (hiding marks the comment's reports actioned; audit `comment.hidden_by_staff` / `comment.shown_by_staff`);
  `lv_admin_comment_reports_dismiss(p_comment)` → `{ ok, status }` (open reports only, else `lv_not_found`; audit
  `comment_report.dismissed`); suspend Hub as above. Comment report decisions live in `lv.comment_report_reviews`.

### Lookup

- `lv_admin_hub_search(p_query)` (1–80 chars, slug or name, community Hubs, 25 results) → `{ ok, hubs: [{ hub_id,
  slug, name, created_at, visibility, membership_mode, plan, member_count, owner_account_id, owner_name, suspension:
  { reason, suspended_at } | null, open_reports }] }`.
- `lv_admin_account_search(p_email)` (an exact, full email; partial input ⇒ `lv_invalid_input`) → `{ ok, accounts:
  [{ account_id, display_name, created_at, hubs_owned, memberships, is_staff, suspension }] }`. The email is never
  echoed.
- `lv_admin_account_email_reveal(p_account)` → `{ ok, account_id, emails[] }` (verified emails). Audit
  `admin.email_revealed` (target = account id, no address).

### Audit viewer

- `lv_admin_audit(p_scope = 'staff'|'all', p_action = null (prefix), p_actor = null, p_limit = 100 (≤ 500),
  p_before = null (event id, for paging))` → `{ ok, events: [{ id, occurred_at, actor_account_id, actor_name, action,
  target, hub_slug }] }`. `staff` scope: `staff.*`, `admin.*`, `platform_admin.*`, suspensions, Campaign block/unblock,
  Discover decisions, report dismissals and staff comment hiding. The `detail` payload is never returned.

### Overview

`lv_admin_overview()` (replaced, additive) adds `comment_reports_open`, `hubs_suspended`, `accounts_suspended`,
`staff`.
<!-- ---- end staff panel ---- -->

## LunchVoice API, webhooks and Discord (000024, track D)

Spec: `docs/v2/API_AND_DISCORD_PLAN.md` (founder direction 2026-11-08, privacy decision D-01). No new error codes;
`lv_rate_limited` carries `retry_after` (seconds), `lv_forbidden` from a missing scope carries `missing: [scope]`.

### Entitlement map, capability, policies, reserved routes

- `lv.plan_limits` (team only): `api.enabled` true, `api.rate_per_minute` 60, `api.max_keys` 10,
  `webhooks.max_endpoints` 5. Starter and free have no rows, so the API fails closed for them.
- Capability `api.manage` (group `api`, "Manage API keys, webhooks and Discord"); every Owner role holds it.
- Policies: `discord.user_commands_per_minute` 10, `discord.guild_commands_per_minute` 60, `discord.code_minutes` 10,
  `discord.consent_version` "2026-11-08", `webhook.max_attempts` 8.
- Reserved slugs: `developers`, `connect`, `webhooks`.
- Suspension hook: when `lv.hub_is_suspended(uuid)` / `lv.account_is_suspended(uuid)` exist (staff panel, 000023),
  keys, webhook deliveries, key and endpoint creation and Discord facts stop for a suspended Hub or account.

### Signed-in functions (`lv_api`, `authenticated` only)

API keys (Owner or `api.manage`; create needs an active Team-family plan):
- `lv_api_keys_list(p_hub)` → `{ ok, enabled, rate_per_minute, max_keys, scopes: [{scope,label}], keys: [ApiKey] }`.
- `lv_api_key_create(p_hub, p_name, p_scopes text[])` → `{ ok, key: ApiKey, secret, shown_once: true }`. The secret
  `lvk_<12 hex>_<48 hex>` is returned once; the database stores its SHA-256 only. Errors: `lv_entitlement_required`
  (`product: team_hub`), `lv_limit_reached` (`limit`, `used`), `lv_invalid_input`.
- `lv_api_key_revoke(p_key)` → `{ ok, key }` (idempotent).
- `ApiKey = { key_id, name, prefix, scopes, created_at, last_used_at, revoked_at, created_by_name, active }`.
  Scopes: `campaigns:read`, `campaigns:write`, `invites:write`, `results:read`, `webhooks:manage`.

Webhooks (Owner or `api.manage`; create and update need Team):
- `lv_webhook_list(p_hub)` → `{ ok, enabled, events, max_endpoints, endpoints: [Endpoint] }`.
- `lv_webhook_create(p_hub, p_url, p_events text[] default all)` → `{ ok, endpoint, secret, shown_once: true }`
  (secret `lvwh_<48 hex>`; https only, no IP literal or internal host).
- `lv_webhook_update(p_endpoint, p_events?, p_enabled?)` → `{ ok, endpoint }`; `lv_webhook_delete(p_endpoint)` → `{ ok }`.
- `Endpoint = { endpoint_id, url, events, enabled, disabled_reason, created_at, consecutive_failures,
  recent_deliveries: [{ event, attempt, status_code, outcome, duration_ms, at }] }` (never a body).

Discord:
- `lv_discord_code_preview(p_code)` → `{ ok, kind: "link"|"connect", discord_username, expires_at, guild_name,
  hub?: { hub_id, name, slug }, consent_version, already_linked }`. A connect code is visible only to a manager
  (`hub.settings.manage` or Owner) of the named Hub, otherwise `lv_not_found`. Used or expired: `lv_invalid_code`.
- `lv_discord_link_confirm(p_code, p_consent_version, p_role_facts boolean default false)` → `{ ok, link }`. One link
  per account and per Discord user (`lv_conflict`). The Discord user id is a linked handle, never an identity key.
- `lv_discord_connect_confirm(p_code)` → `{ ok, connection_id, hub_id }`.
- `lv_discord_me()` → `{ ok, link: { discord_username, linked_at, consent_version, role_facts_consent } | null }`;
  `lv_discord_unlink()` → `{ ok, unlinked }`.
- `lv_discord_connections(p_hub)` → `{ ok, connections: [{ connection_id, guild_name, channel_id, auto_post,
  confirmed_at, disabled, role_rules }] }`; `lv_discord_connection_update(p_connection, p_auto_post?, p_remove
  default false)` → `{ ok, removed }` (removing also drops that server's membership rules for the Hub).
- Staff (`lv.is_platform_admin`): `lv_admin_discord_guilds()`, `lv_admin_discord_guild_disable(p_guild, p_disabled,
  p_reason?)`.

Account deletion (`lv_account_delete`, unchanged): the account's Discord link and API keys cascade with the account;
a trigger queues removal of every Discord role the bot granted that person.

### Service-role only (Edge Functions; never in `lv_api`)

- `lv.api_key_call(p_key_hash, p_op, p_args jsonb)`: the `api` function's single entry. Order: key hash → Team plan
  (`lv_entitlement_required`, 402) → suspension → creator still Owner or `api.manage` (`lv_forbidden`) → scope
  (`lv_forbidden` + `missing`) → rate limit (`lv_rate_limited` + `retry_after`) → the operation, run as the key's
  creator through the same `lv_api` function the app uses (transaction-local LunchVoice session claim with `iat` 0, so
  nothing that needs a recent sign-in can run), confined to the key's Hub. Writes are audited (`api.call`).
- `lv.webhook_sweep()`, `lv.webhook_claim(limit)`, `lv.webhook_mark(id, result, status_code, duration_ms, error)`.
- `lv.discord_interaction(p_command, p_ctx)`, `lv.discord_role_plan(guild, user)`, `lv.discord_roles_applied(guild,
  user, added[], removed[])`, `lv.discord_claim(limit)`, `lv.discord_mark(id, result, error)`.

### REST `/v1` (Edge Function `api`, `verify_jwt = false`)

`Authorization: Bearer lvk_…` (or `X-Api-Key`). Bodies are JSON objects; unknown fields are `lv_invalid_input`.
Responses use the envelope above; HTTP status: 200 ok, 400 invalid, 401 key, 402 plan, 403 forbidden/scope/suspended,
404 not found or outside the Hub, 409 state (gate, limits, lifecycle, withheld live results), 429 rate, 500.

| Method and path | Operation | Scope | Maps to |
| --- | --- | --- | --- |
| GET `/v1/hub` | hub.get | campaigns:read | key's Hub and scopes |
| GET `/v1/campaigns` | campaigns.list | campaigns:read | `lv_campaign_list` |
| POST `/v1/campaigns` | campaigns.create | campaigns:write | `lv_campaign_create` (title, mode, anonymity, description) |
| GET `/v1/campaigns/{id}` | campaigns.get | campaigns:read | `lv_campaign_get` |
| PATCH `/v1/campaigns/{id}` | campaigns.update | campaigns:write | `lv_campaign_update` (title, description; draft) |
| POST `/v1/campaigns/{id}/questions` | campaigns.questions.add | campaigns:write | `lv_campaign_question_add` |
| POST `/v1/campaigns/{id}/schedule` | campaigns.schedule | campaigns:write | `lv_campaign_schedule` |
| POST `/v1/campaigns/{id}/publish` | campaigns.publish | campaigns:write | `lv_campaign_activate` |
| POST `/v1/campaigns/{id}/close` | campaigns.close | campaigns:write | `lv_campaign_close` |
| POST `/v1/campaigns/{id}/invites` | campaigns.invites.create | invites:write | `lv_campaign_invite_create` |
| POST `/v1/invites` | invites.create | invites:write | `lv_invite_create` (Hub invite) |
| GET `/v1/campaigns/{id}/results` | results.get | results:read | `lv_analytics_overview` minus every free-text list (`texts_omitted: true`) |
| GET/POST `/v1/webhooks`, PATCH/DELETE `/v1/webhooks/{id}` | webhooks.* | webhooks:manage | the webhook functions above |

### Webhook delivery

`POST` with `LunchVoice-Event`, `LunchVoice-Delivery` (outbox id) and `LunchVoice-Signature: t=<unix>,v1=<hex
HMAC-SHA256(secret, t + "." + raw body)>`. Body `{ id (event id), type, created_at, hub_id, data: { campaign_id, title,
mode, anonymity, status, opens_at, closes_at, join_code, released_participants?, milestone? } }`. Events:
`campaign.published` (draft → active), `campaign.closed` (closed by a manager, or by time via the sweep; carries the
released count or null), `campaign.responses_milestone` (identified Campaigns only, at 10/25/50/100/250/500/1000/2500/
5000/10000 released responses). 2xx delivered; 408/409/425/429/5xx retried with backoff `30 s × 2^attempts` up to
`webhook.max_attempts`; other statuses failed; redirects not followed. 20 failed events in a row turn the endpoint off.
Deliveries pause (stay queued) while the Hub has no Team plan or is suspended. Payloads are emptied once delivered or
failed; the log keeps outcome, status and duration only.

### Discord bot (Edge Function `discord`, `verify_jwt = false`)

Ed25519 verification of `X-Signature-Ed25519` over `X-Signature-Timestamp + body` with `DISCORD_PUBLIC_KEY` (503 when
unset, 401 when wrong, 5-minute timestamp window). `/lunchvoice link | unlink | verify | connect hub | post campaign |
setup rule role [hub] [remove]`. D-01: `post` returns a card whose `answer_in_discord` is true only for identified
`poll` Campaigns with one `yes_no` or `single_choice` (≤ 5 options) question; anonymous cards carry only a link to
`/c/{join_code}`. An `answer` button click for an anonymous Campaign is refused (`lv_not_available`) before anything is
written; an identified answer goes through `lv_submit_response` as the linked person (duplicates answer
`{ ok, duplicate: true }`). Role facts (`waitlist_founding`, `hub_member` of a Hub the configuring person manages,
`team_hub` = owns a Team-family Hub) are computed only for linked people with `role_facts_consent`, in servers that
are not disabled; the bot removes only roles it granted. `POST /discord/dispatch` (service bearer) processes queued
role removals and auto-posts.


## Editing a paused Campaign (000027)

`lv_campaign_update` and the question functions (`lv_campaign_question_add` / `_update` / `_remove`) now also work on a
**paused** Campaign:

- Title, description and schedule: always.
- Mode, anonymity and questions: only while the Campaign has no answers (members or guests). Otherwise `lv_locked`
  ("This Campaign already has answers, so its mode and anonymity can no longer change…"). Setting the same value again
  is harmless.
- Running, closed and archived Campaigns remain `lv_locked`. The audience and guest settings stay draft-only.

`lv_campaign_get` (managers) adds `campaign.has_responses` (boolean).


## Guest names and Responses (000028)

- `lv_campaign_set_guest_names(p_campaign, p_mode)`: `off` (default), `optional` or `required`. Identified Campaigns only,
  and only while guest responses are on; allowed in a draft, or while paused before the first answer (otherwise
  `lv_locked`). On an anonymous Campaign it is `lv_not_available`. The database also refuses a name on an anonymous
  Campaign and refuses switching a Campaign with names on to anonymous (`lv_not_available`).
- `lv_guest_submit(p_join_code, p_guest_key, p_answers, p_guest_name)`: a new four-argument signature (callable signed out);
  the three-argument call stays and means "no name". A name is cleaned (control characters removed, spaces collapsed),
  at most 40 characters, ignored when names are off, `lv_invalid_input` when required and missing. Guests' names are
  typed by them and never verified.
- `lv_guest_campaign_get` adds `campaign.guest_names`; `lv_campaign_get` adds it for managers.
- `lv_campaign_responses(p_campaign, p_limit default 50, p_before default null)`: who answered and what, newest first, for
  identified Campaigns only and people with `analytics.read` (`lv_not_available` for anonymous ones). Rows:
  `{response_id, kind: member|guest, verified, name, at, answers[{question_id, prompt, kind, value}]}`; guests are
  `verified: false`. Opening the first page is audited as `campaign.responses_viewed`.

## Requested by the UI thread (2026-11-12): Hub card fields

The Hub card and profile header (`src/components/HubCard.tsx`, `src/ui/HubProfile.tsx`) and the share-preview Worker
(`workers/hub-card`) read these from `lv_hub_get(p_slug)` and `lv_discover_list` **when present**. Until the backend
sends them, the UI shows nothing in their place; it never estimates them.

| Field | Type | Meaning |
| --- | --- | --- |
| `hub.created_at` | timestamptz | When the Hub was created; shown as "Est. Nov 2026". Public Hubs only for signed-out callers. |
| `hub.online` | integer or absent | Members active in the last few minutes (the presence work in progress on another track). Absent when presence is off or the Hub is private. |
| `hub.tags` | text[] (max 4 shown) | Owner-chosen tags (also in progress on another track). |

No new error codes. The Worker calls `lv_hub_get` with the anon key and treats any `ok: false` or non-public Hub the
same (a neutral card), so private Hubs stay indistinguishable from missing ones.


## Sections, conditional sections and Creator plans (000041)

- **Families.** `creator_plus` ($5/month) and `creator_pro` ($15/month) are account-scoped entitlements (a check
  refuses them on a Hub). Products `creator_plus` and `creator_pro` exist with `purchasable = false` until their
  Stripe products do. `lv_plan_limits` still lists only `free`, `starter` and `team` families.
- **Feature keys.** `survey.branching` and `survey.branding` are `true` for `starter`, `team`, `creator_plus` and
  `creator_pro`. `lv.feature_allowed(hub, account, key)` = the Hub's active family OR the caller's active Creator family.
- **`lv_campaign_get`** (managers only) adds `features: { branching: boolean, branding: boolean }` for the caller here.
- **Section shape** (in a question's `config`, on the first question of a section):
  `section: { title: 1–120 chars, description?: ≤500 chars, show_if?: { question_id: uuid, any_of: [1–10 strings] } }`.
  Questions up to the next section start belong to it. For a yes/no source, `any_of` holds `"true"`/`"false"`;
  for a multiple choice source, any picked option matches.
- **Writes.** `lv_campaign_question_add` / `lv_campaign_question_update` return `lv_invalid_input` for a malformed
  section and `lv_entitlement_required` with `product: "creator_plus"` and `feature: "survey.branching"` when a new or
  changed section is saved without the feature. Removing a section is always allowed. A lapsed plan never changes a
  published survey: its rules keep working for respondents.
- **Publishing** (any move out of draft) returns `lv_invalid_input` with a plain sentence when a rule points at a
  missing or later question, a question people cannot pick an answer for, or an option that no longer exists.
- **Answers.** `lv_submit_response` and `lv_guest_submit` refuse (`lv_invalid_input`) an answer to a question whose
  section is not shown to that person, and require a required question only when its section is shown.

## Linked Questions: per-question rules, end survey, validator fix, Creator limits (000042)

Gated by the existing `survey.branching` feature (Creator Plus, or a Starter Hub and above). Enforced on the server;
the dev mock mirrors it. Skip-to jumps, answer piping and randomization are **not** in this release (see below).

- **Rule shape** (in a question's `config`): `show_if: { match: "all"|"any", conditions: [1–10 of { question_id: uuid, op, values?, min?, max? }] }`.
  `op` is `any_of` / `none_of` (choice, multi choice; yes/no uses `"true"`/`"false"`) with `values` (1–10 strings),
  or `at_least` (`min`) / `at_most` (`max`) / `between` (`min`, `max`) for a rating. A condition on a question the
  person did not see (or did not answer) is never met, "none of" included. Rules only look at **earlier** questions.
- **End survey**: `jumps: [{ when: <option or "true"/"false">, to: "end" }]` on a single-choice or yes/no question.
  After that answer, nothing later is shown. (`to` must be `"end"` in this release.)
- **Writes**: `lv_campaign_question_add` / `lv_campaign_question_update` check the shape (`lv_invalid_input`) and the plan
  (`lv_entitlement_required`, `product: "creator_plus"`, `feature: "survey.branching"`) whenever logic is added or
  changed; removing logic is always allowed. Elections refuse logic.
- **Publishing** (`draft → live`, and `paused → active`): `lv_invalid_input` with a plain sentence for a rule that looks
  forward or at a missing question, an option that no longer exists, a rating comparison on a non-rating question, or a
  skip on the wrong kind.
- **`lv.validate_answers`** (used by `lv_submit_response` and both `lv_guest_submit`): walks the path (section rules,
  question rules, end survey) and rejects an answer to a question the person was not shown ("answer given for a
  question this person was not shown"); a shown question is required unless optional.
- **SECURITY: answer validation for sectioned campaigns now applies every core check.** 000041's wrapper skipped the
  per-answer checks for Campaigns with sections. Now every shown answer goes through one per-kind function,
  `lv.check_answer_value(kind, config, value) → reason | null` (single choice in options; multi choice a non-empty,
  distinct list within the options and `max`; yes/no a boolean; rating a number in range; text a string up to 280
  characters), and **every** path rejects entries without a `question_id`, a `question_id` that is not in this Campaign
  and a question answered twice. `lv.answer_matches(kind, value, any_of)` is the matcher rules use. Elections and
  Campaigns without logic or sections otherwise still use the previously installed validator unchanged.
- **`lv_analytics_question(p_campaign, p_question, p_filter?)`** (needs `analytics.read`, same gates as every results call,
  logged): `{ ok, metric: "question_logic", question_id, filter, filter_withheld, seen, answered, seen_withheld, cells, withheld, texts?, texts_withheld? }`.
  `seen` is how many people's paths showed the question; `answered` how many answered it. `p_filter` is
  `{ question_id, any_of }` (a choice or yes/no question): only people who gave one of those answers. On an anonymous
  Campaign a count (or a group, or the people left outside a group) under `campaign.min_cohort` is withheld
  (`null` with `*_withheld`), never shown as zero. The Results page uses `seen`/`answered` ("N saw, M answered"); the
  filter control is a follow-up.
- **Quick Survey limits for Creator accounts** (the install only defined `free`): `lv.plan_limits` now has
  `quick.max_questions` and `quick.max_active` for `creator_plus` (30, 15) and `creator_pro` (100, 100), and
  `quick.kinds` / `quick.modes` copied from `free`. The question guard, the activation gate (`lv.capacity_check`) and
  `lv_quick_survey_list` use the larger of the free value and the owner's Creator family (`lv.quick_limit(hub, key)`).
  `lv_campaign_get` (managers, personal space) returns `campaign.question_limit`. `lv_my_context().quick_surveys` still
  shows the free numbers. Change a perk with one `update lv.plan_limits`.
- **Not built (follow-up)**: skip-to-question jumps, `{{q:id}}` piping, option and question randomization, filtering
  the Results page by an earlier answer (the API supports it), the full click-through path preview.

## Survey branding (000043)

Paid feature `survey.branding` (starter, team, creator_plus, creator_pro); `survey.remove_footer` (team, creator_pro). The
theme belongs to the survey, never to the Hub. A Hub Campaign may start from the Hub's color (a copy) or explicitly set
`follow_hub: true`; without it a later Hub change never changes the survey. Entitlement on save is
`lv.feature_allowed(hub, caller, key)`: the Hub's plan OR the caller's own Creator plan. A lapsed plan keeps the stored
row; `lv_campaign_theme` then answers `theme: null` and the player uses LunchVoice styling. Branding never touches
questions, answers or anonymity.

- `lv_campaign_branding_get(p_campaign)` (managers) -> `{ ok, branding: SurveyBranding | null, features: { branding, remove_footer }, hub: { kind, accent_hex } }`
- `lv_campaign_branding_set(p_campaign, p_branding)` (managers; `null` resets) -> `{ ok, branding }`.
  `SurveyBranding` = `{ follow_hub, color (#rrggbb, >= 4.5:1 on white), logo_path, cover_path, welcome_headline (<=120), thank_you (<=500), button_style: rounded|pill, hide_footer }`.
  Errors: `lv_entitlement_required` (with `product`, `feature`), `lv_invalid_input` (contrast, lengths, paths), `lv_locked` (archived), `lv_not_found`.
- `lv_campaign_theme(p_campaign)` (anon + authenticated; draft surveys only for managers) -> `{ ok, theme: { color, logo_path, cover_path, welcome_headline, thank_you, button_style, hide_footer } | null }`, color already resolved.
- Storage buckets `survey-logos` (1 MB) and `survey-covers` (3 MB), png/jpeg/webp only (no SVG). Object names
  `<campaign uuid>/<logo|cover>-<hex>.<png|jpg|webp>`. Write: Hub managers (owner of a personal space) with `survey.branding`;
  read: managers, or anyone for an image referenced by a published survey's active theme. The app loads images through
  the authenticated client as `blob:` URLs, so CSP needs no new origin.

### Survey branding v2: gradients and cosmetics (000048)

Additive to 000043; every rule above still holds (theme per survey, no Hub needed, `follow_hub` explicit, plan on save,
lapse falls back, player visibility rules, table closed to API roles). New `SurveyBranding` / `theme` fields:

- `style`: `solid` | `gradient` (default `solid`); `color2` (`#rrggbb`, kept only for a gradient); `gradient_angle`: `90` horizontal | `135` diagonal | `180` vertical.
- `banner_style`: `fill` (the color or gradient) | `pattern` | `logo` (logo only, LunchVoice ink behind it).
- `cosmetics`: `{ pattern: none|dots|grid|waves, progress_tint: bool, glow: bool }`. Corner style is the existing `button_style`.
- Save rules: text on a gradient is white, so BOTH colors must reach 4.5:1 on white (`lv_invalid_input` otherwise); a gradient needs `color2` and a first color (or `follow_hub`); unknown angle, banner, pattern or style are refused; a solid theme drops `color2`.

## Live results and individual responses by plan (000053)

Founder decision 2026-11-13: pro users see individual results from guests and signed-in people, and nothing is held back
for 4 or fewer answers. Entitlement key **`results.instant`** in `lv.plan_limits` (`true` for `team`, `creator_plus`,
`creator_pro`). It is resolved per survey, server side, as `lv.feature_allowed`: the Hub's active family (Team Hub,
Campaign Plus) OR the survey creator's own Creator plan (`campaigns.created_by`, else the Hub owner). The app never
computes it; it reads the flag below. Free Quick Survey, Starter Hub and Campaign Starter keep the waiting rules
unchanged: anonymous results wait for the survey to finish and for 5 answers; identified results show from the first
answer except free text (5).

- **`lv_campaign_get` / `lv_guest_campaign_get`** return `campaign.results_instant: boolean`. Managers get it for every
  survey; a respondent gets it only on an **anonymous** survey (identified surveys always say `false`, so a respondent never
  learns the creator's plan). The player shows "The creator can see results as they come in." before the first question
  when it is `true`.
- **`lv_analytics_query` / `lv_analytics_overview` / `lv_analytics_question`**: where `results.instant` holds they publish
  totals, distributions, rating means, seen/answered and free text from the first answer, while the survey is live and after
  it closes, for identified and anonymous surveys: no minimum, no complementary suppression, no frozen population,
  `texts_withheld: false`. Free text is shuffled and carries no metadata. **Filters on anonymous surveys stay refused**
  (`lv_invalid_input`) on every plan. `lv_analytics_export` is unchanged (Starter or Team, as before).
- **`lv_campaign_responses_anon(p_campaign, p_limit default 50, p_offset default 0)`** (authenticated; needs
  `analytics.read`): `{ ok, live, released, next_batch_at?, total?, responses: [{ response_id, answers: [{ question_id,
  prompt, kind, value }] }] }`. Anonymous surveys only (`lv_not_available` for identified ones: use
  `lv_campaign_responses`). Without `results.instant`: `lv_entitlement_required`, `error.product = "creator_plus"`.
  **Security: batches.** While the survey is open, rows are released in groups of `campaign.min_cohort` (5): only complete
  groups (`released = floor(n / 5) * 5`, `live: true`, `next_batch_at = released + 5`), so one arrival never adds one
  visible row; there is NO `total` while live. After the survey finishes every row is released and `total` is present. The
  group a submission belongs to is fixed when it is written (`lv.submissions.batch_no`, private), because anonymous rows keep
  no arrival time. Rows carry **no** account, name, kind, timestamp, receipt id, submission id or arrival order;
  `response_id` is an opaque 16-character key; order is a stable hash; page with `p_offset`. Every call is written to
  `lv.audit_events` (`campaign.responses_viewed`, `detail.anonymous = true`) and to `lv.analytics_query_log`.
  Free text on an open anonymous survey follows the same groups (`texts_withheld: true` until the first group).
- **Security: metadata keeps the anonymous rules.** `lv_analytics_summary`, `lv_analytics_premium` (responses per day, device,
  source), `lv_analytics_crosstab`, duration, quiz totals and webhook/Discord milestone counts stay behind "survey finished,
  minimum cohort, frozen population" on anonymous surveys even where `results.instant` holds. Live applies to answer results
  only: `lv_analytics_query`, `lv_analytics_overview`, `lv_analytics_question`, Trend points, export, per-question cells and NPS.
- Identified surveys keep `lv_campaign_responses` (names, `kind: member` shown as Account, `kind: guest` shown as Guest,
  unverified), unchanged.
- The REST API `results.get` and `released_participants` go through the same engine, so a Team Hub's results are live there
  too; the API still never returns free text.
- A lapsed plan returns the survey to the waiting rules at once (nothing is stored differently).

## Question types and the template gallery (000047)

Question kinds (`lv_campaign_question_add` / `_update`, `p_kind`): the five core kinds plus `face_scale`, `dropdown`, `number`,
`date` (Free), `nps`, `agree_scale`, `ranking`, `image_choice`, `slider`, `contact` (Plus: Starter Hub, Creator Plus) and
`agree_grid`, `file_upload`, `consent`, `signature`, `price_ladder`, `before_after` (Pro: Team Hub, Creator Pro). Plan keys are
`lv.plan_limits` `survey.kinds` per family; a person's personal space also counts the Hubs they own. A kind the plan does not
include answers `lv_entitlement_required` with `product` = `creator_plus` | `creator_pro`, `feature` = `survey.kinds`, `kind`.
`contact`, `file_upload`, `consent`, `signature` need an identified survey (`lv_invalid_input`, also checked when a survey leaves
draft or switches to anonymous).

Settings (all validated by `lv.question_config_problem` -> `lv.kind_config_problem`): `dropdown`/`ranking`/`image_choice`
`options` (2-50 / 2-10 / 2-6) and optional `images` (https only); `number` `min`/`max`/`integer`/`unit`; `date` `min`/`max`
(YYYY-MM-DD); `nps` `low_label`/`high_label`; `agree_scale`/`agree_grid`/`before_after` `points` (5|7), `labels`, `rows`,
`before_label`/`after_label`; `slider` `min`/`max`/`step`/`min_label`/`max_label`; `contact` `fields` (name, email, phone);
`file_upload` `max_mb` (1-10), `types` (image, pdf, doc); `consent` `statement`; `price_ladder` `prices` (rising), `currency`.

Answers (`lv.check_answer_value`, extending 000042 with every existing branch verbatim): face 1-5; dropdown/image choice one
option; number/date within bounds; nps 0-10; agree 1..points; ranking a full permutation; slider on a step; contact an object
with exactly the asked fields; grid `{statement: n}`; before/after `{before, after}`; file `{path, name, size, type}`;
consent `true`; signature a string; price a ladder price or `"none"`. `lv.kind_options` / `lv.kind_allows_jumps` /
`lv.kind_is_scale` also cover dropdown and image choice (single-pick) and face scale (1-5).

Results: `lv.question_cells` keys by kind (`ranking` counts first choices, `agree_grid` `"statement: n"`, `before_after`
`"before: n"` / `"after: n"`); contact, file and signature never become cells. NPS = % promoters - % detractors, computed from
published cells and withheld with them (minimum cohort).

**Quiz scoring (Pro).** The answer key is NOT in `config`: writers send `config.quiz = {correct: [...], points}` and a trigger
moves it into `lv.campaign_questions.quiz`, so no respondent, guest or public read can return it. Managers read it with
`lv_campaign_quiz(p_campaign)` -> `{quiz: {question_id: {correct, points}}}`; `quiz: null` clears it. Totals:
`lv_quiz_results(p_campaign)` -> `{withheld, max_points, attempts, average, best}`. The key is validated whenever the kind,
settings or key change, and only a choice kind may have one.

**File answers.** Private bucket `survey-uploads` (10 MB, images/PDF/Word/text only). Path `<survey>/<account>/<file>`. A signed-in
person may write only to their own folder, only while they could submit (access mode, invite or membership, not suspended or
blocked, survey open and identified), at most 5 files per person per survey. A file answer is accepted only from that
submitter (never a guest) and only if the object exists. Managers read through the storage policy.

`lv_kind_tier(p_campaign?)` -> `{tier: free|plus|pro, quiz}`. `/templates` is a reserved slug.

## Results analytics and Trends (000044)

All functions return the envelope. Results functions go through the same gate as `lv_analytics_query` (draft ->
`lv_lifecycle_invalid`; an open anonymous survey -> `lv_policy_undecided`; no `analytics.read` -> `lv_forbidden`). A null
count with `suppressed: true` is withheld, never zero.

- **Map.** `trends.max` (free 0, creator_plus 3, creator_pro 10, starter 3, team 5; Creator values provisional),
  `trends.max_pass` (1 for starter and team passes), `analytics.premium` (team, creator_pro), `analytics.export`
  (also creator_plus, creator_pro). `lv_analytics_export` now accepts a person's Creator plan for a personal-space survey.
- **`lv_analytics_summary(p_campaign)`** -> `{ responses: {n, suppressed, released}, completion: {rate, started, suppressed, measured},
  median_time: {bucket: lt_1m|1_3m|3_10m|gt_10m|null, measured, suppressed} }`. Completion needs started >= responses.
- **`lv_analytics_premium(p_campaign)`** (`lv_entitlement_required`, product `team_hub` or `creator_pro`) ->
  `{ over_time, device, source }`, each `{ cells: [{key, n, suppressed}], withheld, reason }`. Device is mobile/tablet/desktop/unknown,
  source link/qr/code/discord/unknown. Anonymous surveys: cells >= `campaign.min_cohort` with complementary suppression.
- **`lv_analytics_crosstab(p_campaign, p_row, p_col)`** (premium) -> `{ n, cells: [{row, col, n, suppressed}], withheld, reason }`;
  withheld whole on an anonymous survey unless every cell qualifies and no row or column sits in one cell.
  `lv_analytics_query(..., 'rating_summary', question)` returns `{ n, mean, suppressed }` for the star average.
- **Trends.** `lv_trend_list(p_hub null = personal space)` -> `{ trends, can_manage, limit: {max, used, over, can_create, can_add, product} }`;
  `lv_trend_get(p_trend)` -> `{ trend, runs: [{campaign_id, title, status, anonymity, run_at, finished, responses}], questions:
  [{key, kind, prompt, runs, points: [{campaign_id, question_id, state: released|withheld|no_answers|not_released|draft|absent, mean?, n?, options?: [{key, n, suppressed, share}]}]}], can_manage, limit }`;
  `lv_trend_create(p_hub, p_title, p_description, p_campaigns[])`, `lv_trend_update`, `lv_trend_delete` (grouping only),
  `lv_trend_add(p_trend, p_campaign)`, `lv_trend_remove`, `lv_trend_ask_again(p_campaign)` -> `{ campaign_id, trend_id, space }`,
  `lv_campaign_trend(p_campaign)` -> `{ trend, can_manage, can_ask_again, limit }`. Manage: `campaign.manage` (personal owner);
  read: `analytics.read`. Over the limit: reads work; create/add/ask again -> `lv_limit_reached`. Ask again also refuses
  `lv_locked` (blocked survey), `lv_suspended` and `lv_rate_limited` (`quick.create_per_hour`).
- **Respondent context (anon + authenticated).** `lv_response_context(p_receipt, p_source, p_seconds)` -> `{ recorded }` (once per
  receipt; only per-Campaign counters are stored, never the User-Agent, IP or a per-response row) and `lv_response_started(p_campaign)`
  (a vanity counter; completion is shown only when plausible). The device class is captured by a trigger on submissions.
