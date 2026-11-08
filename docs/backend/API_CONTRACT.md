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
