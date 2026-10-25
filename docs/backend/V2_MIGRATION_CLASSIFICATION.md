# v2 prototype migration classification

2026-10-25. Every prototype migration in `feat/v2-hub-invitations` classified
**KEEP / REDESIGN / REMOVE**, with the reason and where the good part goes in the
canonical baseline.

Source: `/home/ogdev/projects/lunchvoice-wt/contract`,
branch `feat/v2-hub-invitations`, commit `ebfb5d3`. Line counts are from that
tree. **Nothing is deleted** — the prototype stack stays untouched as research
history; this table is the traceability record for what was ported.

Legend: **KEEP** = logic ported essentially intact · **REDESIGN** = concept kept,
structure rewritten · **REMOVE** = not ported, with reason.

## Summary

| Migration | Lines | Verdict | Destination |
| --- | --- | --- | --- |
| `20261024000100_v2_identity_hubs_memberships` | 703 | **REDESIGN** | `000001_v2_core` |
| `20261024000200_v2_roles_capabilities_owner_transfer` | 926 | **REDESIGN** | `000002_v2_authorization` |
| `20261024000300_v2_entitlements_campaign_lifecycle` | 830 | **REDESIGN** | `000003_v2_campaigns` |
| `20261024000400_v2_participation_receipts` | 426 | **KEEP (core) / REMOVE (guest)** | `000004_v2_participation` |
| `20261024000500_v2_privacy_safe_analytics` | 285 | **KEEP (core)** | `000005_v2_privacy_analytics` |
| `20261024000600_v2_waitlist_hub_settings` | 345 | **REDESIGN** | `000006_v2_platform` |
| `20261024000700_v2_legacy_bridge` | 659 | **REMOVE** | — |
| `20261024000800_v2_identity_first` | 354 | **KEEP (identity) / REMOVE (org glue)** | `000001_v2_core` |
| `20261024000900_v2_beta_self_service` | 241 | **REDESIGN** | `000006_v2_platform` |
| `20261024001000_v2_hub_invitations` | 206 | **KEEP** | `000006_v2_platform` |
| `20261024001100_v2_kpn_identity_link` | 101 | **KEEP (logic) / REDESIGN (plumbing)** | `000001_v2_core` |

Totals: 5,076 prototype lines → approximately 1,600 canonical lines. The reduction
is almost entirely legacy glue and org coupling, not product logic.

---

## Detail

### `20261024000100` — accounts, Hubs, memberships — **REDESIGN**

**Kept:** `accounts` table shape; `hub_memberships` with
`status ∈ {pending, accepted, removed, suspended}`; the "removed members cannot
rejoin" rule; `lv_hub_public`, `lv_my_context`, `lv_join_hub`,
`lv_decide_join`, `lv_remove_member`, `lv_suspend_member`, `lv_member_count`,
`lv_members_list`; the membership event log (`hub_membership_events`) and its
audit trigger; `policy` key/value table with fail-closed semantics.

**Rewritten:** (a) `account_identities` is keyed by `auth_user_id` with
`provider text default 'legacy'` — replaced by `(identity_issuer,
identity_subject)`; (b) `hubs.id` **references `public.orgs(id)`** — 44 `org_id`
references in this file — replaced by independent Hub identity with its own
slug; (c) `backfill_org_hub`, `reconcile_org_hub`, `repair_org_hub`,
`profiles_sync_v` trigger and `sync_profile` — all removed, they exist only to
carry v1 org data into v2; (d) `current_account_id()` reads
`auth.uid()` — replaced by claim-derived resolution.

**Removed:** the `AFTER INSERT` trigger on `public.profiles`. It mirrors legacy
signups into v2, which is meaningless under fresh-start and dangerous (a v1
signup would silently create a v2 account).

### `20261024000200` — roles, capabilities, Owner transfer — **REDESIGN**

**Kept:** `roles`, `role_capabilities`, `has_capability`, `held_capabilities`,
`lv_capability_catalog`, `lv_role_create`, `lv_role_update`, `lv_role_delete`,
`lv_role_list`, `lv_role_set_capability`, `lv_role_assign`, `lv_role_unassign`;
the Owner-protection triggers (`protect_hub_owner`, `protect_owner_membership`,
`role_assignments_no_owner`); role-slot limits (`roles_enforce_slots`,
`enforce_role_slots`) as an entitlement hook.

**Rewritten:** `role_assignments` → `membership_roles` keyed on
`membership_id` so cross-Hub leakage is structurally impossible.

**Deferred, not removed:** Owner transfer (`lv_owner_transfer_start/accept/cancel`,
`owner_transfer_offers`, `reauth_state`). It works, but it depends on a reauth
policy that is still undecided (roadmap open decision). The canonical baseline
keeps `hubs.owner_account_id` and the protection triggers, and leaves transfer
for a follow-up migration once the policy exists. **Owner transfer is therefore
absent from the baseline — this is a deliberate scope cut, not an oversight.**

### `20261024000300` — entitlements, Campaigns, activation gate — **REDESIGN**

**Kept:** `campaigns` (mode, anonymity, audience, status, scheduling, revision);
`campaign_questions`; the atomic activation path (`lv_campaign_activate`,
`activate_campaign`, `activation_checks`, `gate_evaluate`); `lv_campaign_create`,
`lv_campaign_update`, `lv_campaign_schedule`, `lv_campaign_close`,
`lv_campaign_get`, `lv_campaign_list`; `new_join_code`; draft-only question
locking.

**Rewritten:** `entitlement_grants` / `plan_limit` / `entitlement_summary` are
reduced to the *activation gate* only. Plan semantics (Starter vs Team, three
months, quota numbers) are still undecided, and the prototype encodes specific
numbers that were never approved. The baseline enforces known numeric caps and
**fails closed where a cap is undefined**, rather than inventing one.

**Removed:** `campaign_participation` (moved and redesigned into 004, where it
belongs as the participation ledger).

### `20261024000400` — participation, receipts — **KEEP (core)**

**This is the best migration in the stack and the reason the privacy direction
survives.** Kept essentially intact: `campaign_participation` with
`receipt_id`, `idempotency_key`, `reward_state`, `points`;
`campaign_answers` + `campaign_answer_values`; `submit_core` /
`lv_submit_response` as the single atomic submission path;
`validate_answers`; the two anonymity triggers `check_answers` and
`check_participation_link`; `lv_my_receipts`; the advisory lock on
`lv_submit:<campaign>:<account>`.

**The anonymity property preserved:** for an anonymous Campaign the answers row
stores `account_id = NULL` and the participation row stores
`response_id = NULL`. There is therefore **no stored join path in either
direction**, enforced by trigger. Canonical baseline keeps this verbatim.

**Removed:** guest participation (`campaign_guest_grants`, `submit_guest`,
`lv_campaign_resolve` guest paths). Guest participation depends on D-03
(dedup, token lifespan, abuse controls) which is undecided, and it widens the
anonymity surface. Baseline supports members only; guests come back as their own
migration when D-03 is answered.

### `20261024000500` — privacy-safe analytics — **KEEP (core)**

**Kept:** `analytics_core`, `suppress_cells`, `analytics_policy_state`,
`analytics_releases`, `analytics_query_log`, `lv_analytics_query`.
`suppress_cells` is careful in a way worth preserving: it returns **NULL, never
0**, handles the single-cell case, and suppresses a *complementary* cell when
exactly one cell is already suppressed so arithmetic cannot reconstruct it.

**Rewritten:** reads `campaign_answers`/`campaign_answer_values` directly under
the canonical names; the prototype's join through `campaign_participation`
`response_id` is dropped, which is safe because that column is NULL for
anonymous Campaigns anyway and dropping it removes a tempting path.

### `20261024000600` — waitlist, Hub settings — **REDESIGN**

**Kept:** `lv_hub_settings_update`, `hub_settings_events`, `clean_text`.

**Deferred:** the whole waitlist (`waitlist`, `waitlist_attempts`,
`purge_expired_waitlist`, `waitlist_delete_after_idx`). It is gated on four
undecided policy questions (open/closed, consent wording, retention, removal
channel) and it is not needed for the Dec 11 path. Porting it now would carry an
undecided policy into the baseline.

### `20261024000700` — legacy bridge — **REMOVE**

659 lines removed in full: `legacy_session_map`, `legacy_answer_map`,
`legacy_question_map`, `legacy_response_map`, `legacy_inventory`,
`legacy_map_session`, `legacy_copy_answers`, `legacy_copy_response`,
`legacy_reconcile`, `legacy_unmap_org`, `legacy_bridge_issues`.

**Reason:** the directive removes the requirement — old student survey history
does not need to survive into v2. I checked for a non-student operational
dependency and found none: every entry point is operator-only and its sole
purpose is to copy legacy `sessions`/`responses` rows into v2 Campaigns. There is
no report, billing path, export or staff workflow that reads it. Removed
deliberately, not by oversight.

### `20261024000800` — identity-first — **KEEP (identity) / REMOVE (org glue)**

**Kept:** the whole identity model — `policy 'identity.trusted_issuers'` with
fail-closed semantics; `caller_identity()` reading verified claims;
`ensure_account()` creating one account per `(issuer, subject)` under an
advisory lock; `account_identities_issuer_subject_idx`; `platform_admins` with
audited `grant_platform_admin` / `revoke_platform_admin` and
`platform_admin_events`; the rule that the first registered person is never an
administrator; Hub-owned `slug`/`display_name` (`hub_slug`, `hub_name`).

**Removed:** `fill_identity_columns()` and the `urn:lunchvoice:legacy-auth-user`
issuer synthesis; the `auth_user_id` column and its unique index — under
fresh-start there are no legacy auth users to synthesise from.

**This migration is the strongest evidence that the direction and the prototype
agree**: it already states identity is `(issuer, subject)` from a verified token,
not a local auth user. Migration 11 completed it.

### `20261024000900` — beta application and self-service Hub creation — **REDESIGN**

**Kept:** `beta_applications` (+ events), `lv_beta_apply`,
`lv_beta_my_application`, `lv_beta_applications_list`, `lv_beta_decide`;
platform-reviewer decision rules (nobody decides their own application;
repeating a decision changes nothing); `lv_hub_create` creating Hub + Owner
membership + beta grant + consuming approval in one transaction.

**Rewritten:** `beta_terms` and reserved-slug handling reduced to the
`reserved_slugs` table with the check enforced; the specific terms, the
three-month start date and the quota are undecided, so the baseline **fails
closed** on subscription when terms are unset rather than assuming values.

### `20261024001000` — Hub invitations — **KEEP**

Ported essentially intact: `hub_invites`, `hub_invite_redemptions`,
`lv_invite_create`, `lv_invite_list`, `lv_invite_preview`, `lv_invite_redeem`,
`lv_invite_revoke`, `invite_hash`, `invite_status`. The security posture is
preserved: 80 random bits, only the hash stored, code shown once, unknown /
expired / revoked / exhausted all answer identically, use-limit enforced under a
row lock, an existing member consumes no use, redeeming never grants a role or
Owner.

### `20261024001100` — KpnIdentity link — **KEEP (logic) / REDESIGN (plumbing)**

**Kept:** the `caller_identity()` validation logic verbatim — issuer
allow-list, UUID subject requirement, refusal of a malformed KpnIdentity link
rather than falling back to the synthetic session email, and the rule that a
session-level `email_verified` cannot promote an unverified KpnIdentity email.
Also kept: `ensure_account()` idempotency under
`pg_advisory_xact_lock('lv_account:'||issuer||'|'||subject)`.

**Rewritten:** the prototype stores `external_issuer`/`external_subject` as
*extra* columns alongside the legacy `issuer`/`subject`, because it was patching
an auth-user-keyed table. Canonical collapses to a single
`(identity_issuer, identity_subject)` pair on `account_identities` — one key, no
duality. The `app_metadata`-carrying `kpn_issuer`/`kpn_subject` duplication is
removed: the token's own `iss`/`sub` are the identity, and a second copy in
server-set metadata is redundant.

## Ported non-SQL assets

| Asset | Source | Treatment |
| --- | --- | --- |
| `scripts/db-test.sh` (throwaway container, suite runner, rollback harness, race runner) | `feat/v2-hub-invitations` | **KEEP** — ported, adapted to the canonical file set |
| `supabase/tests/setup.sql`, `setup_after.sql` (`t.check`, `t.code`, `t.q`, `t.as_pg`, `t.as_anon`) | same | **KEEP** — ported |
| Race tests 1–27 | same | **Port as applicable**; races tied to waitlist/legacy/guest are dropped with their features |
| Rollback pattern (`supabase/rollbacks/*.down.sql`, reverse-order rehearsal) | same | **KEEP** |
| `contract/` build + `validate.mjs` (76-operation OpenAPI contract) | `feat/api-contract-v0` | **KEEP** — ported for schema cross-checking; operations for removed features dropped |
| `19_kpn_link.sql` | `feat/v2-hub-invitations` | **KEEP** — becomes the identity test suite |
| `17_beta.sql`, `18_invites.sql` | same | **KEEP** |
| `09_campaigns.sql`, `10_gate.sql`, `11_participation.sql`, `12_analytics.sql` | same | **KEEP** |
| `14_legacy_bridge_*`, `13_waitlist_settings.sql` | same | **Not ported** (features removed/deferred) |

## Things I could not classify as pure wins

- **Owner transfer** — built and tested in the prototype, deferred here for an
  undecided reauth policy. If the policy is settled, porting it is
  low-risk mechanical work.
- **Waitlist** — built and tested, deferred for undecided policy, not because of
  a technical problem.
- **Entitlement numbers** — the prototype encodes plan limits that were never
  approved. The baseline deliberately does not inherit those numbers.
