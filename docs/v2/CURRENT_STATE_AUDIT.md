# Current state audit

Audit date: 2026-10-23. Repository: `KpnSolute/Lunchvoice`.
Baseline: `main` at `0dbc343227bdb8f3cd5745f59c0247ae84841aec`.
Scope: checked-out source, all 17 migration files inventoried, relevant SQL,
auth/functions, routes, package scripts, hooks, and release/deployment configuration.
This is a static implementation/readiness audit, not a production verification or
a comprehensive vulnerability assessment. No production connection, migration,
function deployment, DNS change, or payment action was performed.

## Summary

The repository contains a working-shaped, buildable dining application with an
organization-scoped database model. That is a reusable v2 foundation. It does
not contain the v2 Hub/commerce/identity platform described in
[PRODUCT_SPEC.md](PRODUCT_SPEC.md). Renaming organizations to Hubs or adding
pricing copy would not implement membership, authorization, or entitlements.

"Present" below means source exists, not that its deployment or live behavior was
verified. "Absent" means no implementing route/schema/function was found in the
reviewed repository; external services may exist outside this scope.

## Implemented versus required

| Requirement | Source evidence | Assessment and v2 work |
| --- | --- | --- |
| Hub tenant boundary | `src/org/OrgProvider.tsx`; `0002_orgs_table.sql`; `0003_org_id_columns.sql` | Partial foundation: slug lookup and org-scoped data; no creator onboarding, lifecycle, membership join table, or Hub commercial model |
| Tenant routing | `src/main.tsx` (`tenantSlugFromHostname`, `RootEntry`, `LionCafeRedirect`) | Subdomain root mapping, path tree, legacy redirects exist; v2 canonical URL is path-based `lunchvoice.com/{hubSlug}`; preserve/test legacy deep links; wildcard DNS is documented, not checked live |
| Central Google OIDC | `src/routes/Login.tsx`; `src/lib/supabase.ts`; `supabase/functions/login-start/index.ts`, `supabase/functions/staff-sso/index.ts`, `supabase/functions/_shared/staffAccess.ts` | Absent: email OTP and MJCC one-time staff bridge are current paths; no `auth.kpnsolute.com` or Google OIDC integration found |
| Identity/membership separation | `src/auth/AuthProvider.tsx` (`loadProfile`); `0003_org_id_columns.sql`; `0006_rls_rewrite.sql` (`caller_org_id`) | Redesign: one profile has one `org_id`; changing URL to another org signs the user out; not a multi-Hub membership model |
| Fine-grained RBAC | `src/main.tsx` (`Gate`); `AuthProvider.tsx` (`isAdmin`); `0006_rls_rewrite.sql` | Partial: admin/student checks and tenant RLS; no 3/6 custom-role quotas, protected Owner, ownership transfer, named/icon roles, grouped/individual permission editor or capability checks |
| Guest participation | `src/main.tsx` gates join/survey routes; `0001_baseline.sql` requires response `student_id`; `0007_rpc_org_aware.sql` requires membership and `auth.uid()` | Absent: anonymous-looking UI is still authenticated participation; needs a separate controlled guest submission path |
| Survey authoring and sessions | `src/routes/admin/ContentCentral.tsx`; `src/routes/student/Survey.tsx`; `0001_baseline.sql`; `20260706153000_add_flame_slider_question_types.sql` | Present: templates/questions, publish, session launch, QR/code, duration, results; adapt domain and authorization |
| Starter/Team active limits and participation gates | `ContentCentral.tsx` (`launchSession`, `toggleSession`); `0006_rls_rewrite.sql`; `0007_rpc_org_aware.sql` | Absent: direct session insert/update; no Starter 15-total-Campaign cap, 2/5 Survey-mode caps, or >50%/>=20% additional-survey activation gates |
| Response uniqueness | `20260716140000_survey_tracking_integrity.sql`; `20260717033000_drop_redundant_responses_unique.sql` | Present migration for one response per student/session and org-scoped join codes; preserve equivalent guest/member idempotency |
| Survey discovery | `src/routes/student/Surveys.tsx`; `20260715191639_session_discovery_access.sql` | Present within-org Available Surveys and code-only access; not public 700-member Hub discovery |
| Campaigns | Routes, types, migrations, and functions inventory | Survey/rating/feedback components are reusable; absent unified Campaign entity, polls/elections/seasonal contracts, role targeting, purchased activation windows, extension logic, Plus season model |
| Starter/Team subscriptions | `package.json`; functions/schema inventory | Absent billing provider integration, verified billing events, subscription state, server entitlements |
| Annual slug reservation | `0002_orgs_table.sql` only provides unique slug/name | Absent payment, annual term, renewal, 25-calendar-day grace, release job, and safe reuse |
| 50-creator beta | Routes/schema inventory; marketing contact form | Absent admission counter, invitation/waitlist, and atomic capacity control; contact requests are leads |
| Analytics | `src/routes/admin/Dashboard.tsx`, `ContentCentral.tsx`, `src/components/charts.tsx`; `0004_views.sql` | Partial: dish averages, counts, 14-day response trend, ideas, session/template results; lacks generalized Campaign comparison, plan-aware exports/embeds, privacy thresholds, and approved member denominators |
| Hub Builder/pages | `src/routes/marketing/Home.tsx`, `NotFoundOrg.tsx`; `src/main.tsx` | Partial legacy pages only; no three-panel builder, custom navigation/branding previews, 3-page Starter quota, independent page view/edit/publish policy or Newsroom/custom-page publishing |
| Legacy dining | `MenuPage.tsx`, `Rate.tsx`, `Voice.tsx`, `Store.tsx`, `Orders.tsx`; admin store/orders/roster | Present and must be preserved through migration; v2 plan placement remains D-12 |
| Menu interoperability | `src/lib/mjccMenuApi.ts`, `menuWorkbook.ts`; `supabase/functions/menu-sync/index.ts`; `20260804170000_kpnsolute_event_receipts.sql` | Present pull/workbook paths and signed-event receiver source; latest changelog explicitly says event migration/deployment was not applied in that change |

All migration names in this document are under `supabase/migrations/`.
See [implementation plan](IMPLEMENTATION_PLAN.md) for dependencies and ownership.

The founder's supplemental decisions also require public/private/approval-required/
invite-only membership, owner-configured directories, accepted-member counting,
and discovery applications at >=700 valid members with separate approval. None
is implemented by the current single-profile organization model. Guests and
anonymous respondents require distinct controls: the existing schema stores
student IDs with responses, so hiding names cannot satisfy the v2 requirement
that Hub administrators cannot identify anonymous respondents. Privately shared
guest Campaigns and restricted analytics exports/embeds need new access paths.

Existing Shop-like rewards and Voice comments can inform v2 community pages but
do not establish the full Shop/Leaderboard/Newsroom/Comments product contracts.
Apple authentication is a later phase, not an omitted current launch requirement.

## Database and authorization implications

- `0001_baseline.sql` models students, survey sessions, answers, rewards, and orders.
  It says it captures an existing live schema; it is not permission to rerun the
  baseline against production. `0002` seeds LionCafe; `0003` backfills 14 tables.
- `0004_views.sql` uses `security_invoker = on`; the later
  `20260705145345_anonymize_student_roster.sql` removes names/emails from the
  roster view. Response rows still carry an authenticated student's ID. Do not
  promise irreversible anonymity from this presentation change.
- `0006_rls_rewrite.sql` scopes policies through `caller_org_id()` and `is_admin()`.
  `0009_drop_legacy_policies.sql` removes earlier permissive policies. Replaying
  only the baseline or only the tenant migration is not an adequate RLS test.
- `0008_handle_new_user_org.sql` reads `raw_user_meta_data.org_id` and falls back
  to LionCafe. V2 must replace this implicit tenant assignment with verified
  membership provisioning. A full authorization review must inspect effective
  grants and field updates, not assume existing policies meet the new RBAC model.
- `0007_rpc_org_aware.sql` derives the org server-side and checks active/closing
  state for code join/submission. The later discovery RPC also checks `opens_at`.
  Unify lifecycle checks across entry points; do not infer consistent opening-time
  enforcement from the discovery path alone.
- Session membership (`session_members`) is not community membership. It cannot
  silently become the denominator for the founder's member participation gates.
- `survey_answers.value` is the active answer representation; the tracking
  migration explicitly marks `text_value`, `numeric_value`, and `option_values`
  as reserved/unpopulated by the current client. Analytics must use actual data.
- The signed menu receipt table is service-role-only, with explicit revokes and
  an atomic projection function. Reuse its idempotency discipline conceptually,
  but do not route billing events through the menu function.

## Automation and governance

| File | Observed behavior | Consequence |
| --- | --- | --- |
| `.github/workflows/version-release.yml` | Trigger is push to `main` only; Node 22.12.0; install, brain/release checks, build; conditional heavy audit; serial tags/releases | No checked-in PR workflow. A PR without checks is not a passing CI run. Do not merge this task or manually tag |
| `scripts/release-policy.mjs` | Every pending release commit must include CHANGELOG; risk patterns select heavy tests | Current pattern includes `src/contexts/Auth` but actual provider is `src/auth/AuthProvider.tsx`; flag for future CI correction so auth edits cannot miss the intended heavy gate |
| `package.json` | `test:light` = brain + build; `test:heavy` adds `npm audit --audit-level=high` | No dedicated frontend unit/E2E runner script found; compilation is not behavioral coverage |
| `.githooks/pre-push` | Can deploy functions when a diff includes `supabase/functions/` | Operational hazard for future branches; inspect before push. This docs-only branch changes no function; install lifecycle scripts were not run |
| `render.yaml` | Static site build and SPA rewrite | Runtime settings, secrets, DNS, and live deployment were not queried |
| `AGENTS.md`, `CLAUDE.md` | Initially identical; retain standing Git authority, production boundary, release policy, and change discipline | Update together; correct stale repository identifier `MJCC-Portal/Interact` to `KpnSolute/Lunchvoice`; distinguish v2 targets from current contracts |

Only one dedicated test file was found by filename inventory:
`supabase/functions/_shared/kpnsoluteWebhooks.test.ts`. This is not coverage for
OIDC, RBAC, guest responses, billing, quota concurrency, or namespace release.

## Validation and launch blockers

The baseline build and brain consistency check passed locally on Node 24.22.1.
CI pins 22.12.0, so this does not claim exact CI-runtime parity. Dependencies were
installed from the unchanged lockfile using `npm ci --ignore-scripts`, avoiding
the postinstall hook configuration. No environment secrets were needed for the
build; no signed-in application smoke test or local database replay was performed.
OpenCode/Mimo command wrappers were unavailable in this shell; the governing
agent performed the inventory directly.

A supplemental `npm audit --json` on 2026-10-23 returned five affected dependency
entries: three high (`nanoid`, `source-map-js`, `vite`) and two moderate
(`react-router`, `react-router-dom`). This is registry advisory evidence, not
proof of exploitability in the deployed app. The earlier changelog's clean
high-severity gate is historical and cannot establish current release readiness.
Relevant advisory references include
[nanoid](https://github.com/advisories/GHSA-2v37-7h3g-55p8),
[source-map-js](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), and
[Vite](https://github.com/advisories/GHSA-587h-7wmj-h5pm).
The required light validation for this documentation scope passes; the existing
dependency state would fail the heavy release audit. Remediation and regression
testing belong to a separate implementation change, before release.

Launch is blocked by missing v2 domains above, unresolved D-01 through D-12,
the dependency audit, absent behavioral coverage, unverified identity-provider
contract, and lack of staging/migration/cutover proof. This documentation PR
establishes the handoff, not launch approval. It does not alter production.
