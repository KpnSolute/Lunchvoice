# Data and migration plan

Planning deliverable, 2026-10-23. Status: proposal; no migration has been written,
reviewed against a live database or applied. Table and column names are
**illustrative** engineering recommendations. Confirmed requirements live in
[PRODUCT_SPEC.md](../v2/PRODUCT_SPEC.md); scheduling is in the
[execution roadmap](EXECUTION_ROADMAP.md) (items R-04, R-07, R-19).

Evidence base: the 17 files under `supabase/migrations/` at `main`
`0dbc343227bdb8f3cd5745f59c0247ae84841aec`. **Migration files do not prove the
deployed state of MJCCv2.** Live schema, grants, applied-migration history and
data volumes are unverified; checking them needs separate explicit authority.

## 1. Current capability classification

Legend: **Impl** implemented in source; **Part** partially implemented; **Missing**;
**Ext** depends on an external resource; **Unv** unverified in production.

| Capability | Class | Evidence | v2 treatment |
| --- | --- | --- | --- |
| Org-scoped data (`org_id`), slug lookup | Impl (Unv live) | `0002`, `0003`, `OrgProvider` | **Reuse**: org becomes Hub compatibility key |
| RLS via `caller_org_id()` / `is_admin()` | Part | `0006`, `0009` | **Adapt**: becomes membership-based; keep as legacy shim |
| One profile = one org | Impl (wrong shape for v2) | `profiles.org_id` NOT NULL | **Replace** with memberships |
| Email OTP login | Impl, Ext (Azure email) | `login-start`, `send-email` | Keep as legacy path during transition |
| MJCC staff bridge | Impl, Ext (MJCCv1) | `staff-login`, `staff-sso`, `staff-status` | Keep; must not restore revoked v2 rights |
| Central Google OIDC | Missing, Ext | no `auth.kpnsolute.com` integration | **Build** (R-06) |
| Surveys/templates/questions/sessions | Impl | `0001`, flame/slider migration | **Adapt** into Survey-mode Campaigns |
| Response uniqueness per student/session | Impl | `20260716140000`, `20260717033000` | **Reuse**; equivalent for guests |
| Join codes (org-scoped) | Impl | tracking-integrity migration | **Reuse** |
| Discovery of in-org surveys | Impl | `20260715191639` | Keep; not Hub discovery |
| Points, streaks, rewards, orders | Impl | `profiles.points/streak`, `store_items`, `orders`, `redeem_item` | **Preserve** per Hub (see 3.4) |
| Menu cycles, ratings, voice notes | Impl | `0001`, `20260705234139` | **Preserve** as LionCafe dining features |
| Signed menu events | Impl source, Unv deploy | `20260804170000`, `menu-sync` | Preserve; do not route billing through it |
| Multi-Hub membership, roles, entitlements, reservations, waitlist, discovery, guests | Missing | none | **Build** |
| Billing provider | Missing, Ext | none | Undecided (D-06) |
| Scheduled workers | Missing, Ext | none | Undecided (R-20) |

## 2. Principles

1. **Additive and reversible until sign-off.** Expand, backfill, dual-read, switch,
   then contract. The contract (drop/rename) phase happens only after parity sign-off
   and is a separate PR with separate authority.
2. **Stable IDs.** `orgs.id` is reused as the Hub ID. `auth.users.id` is retained as
   the account ID. `sessions.id`, `survey_templates.id`, `responses.id`, `orders.id` keep their UUIDs.
3. **Authorization by immutable ID**, never by slug. A slug is an address that can be
   released and reassigned; data is bound to the Hub ID.
4. **No destructive data operation** in any phase. Never delete responses or private
   data to resolve an over-limit state.
5. **No production changes from this plan.** Rehearsals run on isolated databases with
   synthetic or explicitly approved sanitized data.
6. **Use `supabase migration new`** for every migration (repository rule) and keep the
   timestamped filename convention used since `20260705`.

## 3. Source-to-target mapping

### 3.1 Accounts and identity

| Source | Target | Rule |
| --- | --- | --- |
| `auth.users.id` | `accounts.id` (or `auth.users.id` used directly) | UUID retained; nothing re-keyed |
| (none) | `account_identities(account_id, issuer, subject, verified_email, created_at)` unique `(issuer, subject)` | Stable key is issuer+subject, never email alone |
| `profiles.email`, `display_name` | `accounts` profile attributes | Attributes, not permission grants |
| `profiles.mjcc_username`, `auth.users.app_metadata.staff/mjcc_user_id` | `account_legacy_links(account_id, kind, external_id)` | Preserves staff continuity; read-only after migration |

**Linking rules (to be proven in R-06):** never merge accounts only because emails match
and are unverified; link only on verified identity evidence; conflicts go to a reviewed
recovery path, not silent duplication or merging. Existing provisioning links by
email (`staffAccess.ts`); the spike must show whether that path is acceptable or must change.

### 3.2 Hubs and membership

| Source | Target | Rule |
| --- | --- | --- |
| `orgs` (id, slug, name, auth_provider) | `hubs` (id = `orgs.id`, name, owner_account_id, membership_mode, status) | LionCafe keeps its ID |
| `orgs.slug` | `hub_slugs(hub_id, slug_lower, claimed_by_generation, state, reserved_until, grace_until)` | Unique active claim on `lower(slug)`; existing `orgs_slug_lower_idx` informs the constraint |
| `profiles.org_id` per profile | `hub_memberships(hub_id, account_id, status)` unique `(hub_id, account_id)` | Each existing profile becomes an **accepted** membership in its org |
| Legacy admin designation (`profiles.role`) and `is_staff` | role assignment in the Hub (see 3.3) | Who becomes Owner of LionCafe is **D-12** and must be named by the founder |

`profiles.org_id` remains in place as a read-compatible column until the contract phase.
Hub switching never edits it; it selects among accepted memberships.

### 3.3 Roles and permissions

| Source | Target |
| --- | --- |
| `profiles.role` ('student','admin') | `hub_roles`, `hub_role_assignments`, `hub_role_capabilities`; protected Owner flagged on the Hub, not a role row that consumes a slot |
| `is_admin()` | compatibility function delegating to the capability evaluator for the legacy Hub |

Initial mapping for LionCafe (proposed, needs D-02/D-12): legacy admins keep a role with the
capability set they effectively hold today; no one gains Owner-only rights without founder naming the Owner.

### 3.4 Points, streaks, rewards, orders

Today points and streak live on `profiles` (one row per account **and** per org, because
profile is org-bound). In v2 an account has memberships in many Hubs, so these must be
Hub-scoped:

- `hub_member_stats(hub_id, account_id, points, streak, best_streak, last_survey_date)`
  backfilled one-to-one from `profiles`.
- A `points_ledger` (append-only) is introduced for new activity; the backfill writes one
  opening-balance entry per existing member so balances reconcile.
- `store_items`, `orders`, `redeem_item` stay bound to their original Hub (`org_id`).
  Historical orders are never re-attributed.

### 3.5 Surveys to Campaigns

| Source | Target | Rule |
| --- | --- | --- |
| `sessions` | `campaigns` (mode = survey) with **`campaigns.id = sessions.id`** | Preserves FKs from `responses`, `session_members` |
| `survey_templates`, `survey_questions` | campaign revision tables (`campaign_revisions`) | Immutable published revision; legacy rows become revision 1 |
| `sessions.join_code`, `opens_at`, `closes_at`, `is_active` | campaign lifecycle fields | `is_active` is replaced by an explicit lifecycle state; mapping table in the Campaign plan |
| `session_members` | `campaign_participants` | Not community membership; never the gate denominator |
| `survey_answers.value` | unchanged | Active representation; `text_value`, `numeric_value`, `option_values` are documented as reserved and unpopulated by the client; analytics must not assume them |

Mapping **does not rewrite** historical responses. Legacy responses stay attributable to the
student ID (they were collected as identified-by-system responses); they are flagged
`legacy_identified = true` so analytics and exports never present them as anonymous.

### 3.6 Responses and the anonymity split (new Campaigns)

Legacy `responses.student_id` is NOT NULL. For anonymous v2 Campaigns, identity must not live next to
answers visible to Hub administrators (see [privacy plan](PRIVACY_AND_OPERATIONS_PLAN.md)):
`participation_receipts(campaign_id, account_id|guest_proof, submitted_at)` is separate from
`campaign_responses` carrying no account reference. This is new tables only; legacy data is not altered.

## 4. Phases

| Phase | Content | Reversible? | Gate |
| --- | --- | --- | --- |
| P0 Baseline | Replay all 17 migrations on a clean local/staging DB; record row counts of a synthetic LionCafe fixture | n/a | Replay passes in CI |
| P1 Expand | Add new tables/columns/functions only; no behaviour change; deny-by-default policies on new tables | Yes (drop new objects) | Allow/deny suite green |
| P2 Backfill | Idempotent scripts create accounts mapping, memberships, hub_member_stats, campaigns (id = session id), opening-balance ledger | Yes (truncate new tables) | Reconciliation (section 6) clean |
| P3 Dual-read/dual-write | App reads new model, writes both old and new for responses/orders/points | Yes (flag off) | Parity report 7 consecutive rehearsal days; interruption tests |
| P4 Switch | Routing and auth use memberships; legacy shim kept | Yes (flag) | Operator acceptance (R-21) |
| P5 Contract | Retire legacy columns/paths | **No** | Signed parity + separate production authority; not scheduled before the Winter Survey closes |

**Freeze window (Recommendation):** no P3-P5 step runs on production while the Winter
Survey is open. During that period the legacy submission path must remain functional.

## 5. Fixtures

Synthetic only; never production users.

- **Hub fixture:** LionCafe-shaped Hub with N students, M admin staff, K sessions, responses with
  ratings/answers, points/streak, rewards, orders, menu cycles with days.
- **Second Hub fixture:** different slug, one student also a member of LionCafe (multi-Hub), one pending applicant.
- **Edge accounts:** OTP-only user; MJCC staff user; user with changed email and same subject; conflicting-account pair; revoked staff.
- **Data oddities:** rows whose `org_id` differs from their parent's `org_id` (foreign keys exist, e.g. `org_id references orgs(id)` and the baseline references, but nothing enforces parent/child Hub agreement), duplicate join codes across orgs, sessions with `opens_at` in the future. Note `src/types/db.ts` declares `Relationships: []` for generated types; that is a typing gap, not evidence of missing constraints.

## 6. Reconciliation queries (must be scripted and re-runnable)

For every table: before/after row counts per Hub; for responses: count per session and
per student; answers per response; ratings per response; points: sum of `profiles.points` per org
equals sum of ledger opening balances plus post-cutover activity; orders count and total token cost;
menu cycles and days per Hub; every response's `session_id` maps to exactly one campaign; every
`student_id` has a membership in the campaign's Hub; no membership or role crosses Hubs; no account has two effective Owners or zero for a Hub; counts of auth users linked versus unlinked. Reports are stored with the run's commit, environment and fixture version.

## 7. Compatibility and rollback

- Legacy URLs: `/:orgSlug/*`, subdomain mapping and `LionCafeRedirect` stay until redirect parity passes (R-11).
- Legacy login must not recreate admin rights after a v2 revocation: staff provisioning
  (`provisionLunchvoiceStaff`) must consult v2 role state before upserting `role`.
- Rollback per phase: P1-P4 revert by feature flag and dropping additive objects; newly accepted responses
  during dual-write exist in both models so rollback loses none. P5 is irreversible, hence its separate authority.
- Interruption: every backfill is idempotent (`on conflict do nothing`/upsert with natural keys) and
  records a checkpoint; reruns converge.

## 8. Slug and reuse safety

Authorization and storage key on Hub ID. Release removes the exclusive slug claim only; a new
claimant receives none of the previous Hub's memberships, Campaigns, answers, analytics, billing, permissions or tokens. Slug history keeps a generation counter; shares, QR codes and embed tokens
encode the Hub ID and generation and fail on mismatch. See the privacy plan for the test list.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Deployed MJCCv2 differs from migration files | Read-only parity check with explicit authority before P2 on any real data |
| `0001_baseline.sql` states it captures an existing live schema | Never replay baseline against production; use it only on clean databases |
| Child rows may disagree with their parent's Hub (FKs do not enforce this) | Reconciliation queries check Hub agreement; v2 adds composite constraints or validation triggers so cross-Hub references are impossible |
| Dual-write divergence | Parity report; flag-gated reads; alert on mismatch |
| Postgres minor upgrade/extension drift | Confirm staging version and extension inventory before replay (architecture notes) |
