# Changelog

This file is the durable project memory. Every meaningful code, configuration,
release, and operational change belongs here. Entries follow Keep a Changelog
categories and the repository's decimal `X.X.X` release policy.

## [Unreleased]

### Fixed

- Production build: `src/lib/reservedSlugs.test.ts` imports `node:test`, and `tsc -b` type-checks everything under
  `src/`, but `@types/node` was only present transitively through `vite`. A cold Render install resolved it as missing
  and the deploy build failed. Declared `@types/node` in `devDependencies` and committed the lockfile.

### Fixed

- `AGENTS.md`/`CLAUDE.md`: the architecture-map line pointed at `graphify-out/wiki/index.md`, deleted with the v1 map.
  It now says no map exists yet and names `/graphify` as the way to rebuild the v2 one. Both files stay identical.
- Restored the `database` PR job ("Canonical v2 database suite") that PR #26 added and a later squash-merge dropped:
  it runs `scripts/db-test-canonical.sh` against a throwaway Postgres container. Verified locally: 356 checks, 0 failed,
  slug race and rollback rehearsal included.

### Removed (v1 residue)

- Deleted `graphify-out/`: 34 generated files that mapped the v1 app (`Menu_Data_&_Student_Pages`, `Auth_&_App_Shell`,
  `Admin_&_DB_Types`, `Edge_Function_HTTP_Utils`, `Home()`, and a `graph.json` whose v1 vocabulary outweighs everything
  else in the repo). Regenerate it with `/graphify` once the v2 architecture settles; `AGENTS.md` still points at
  `graphify-out/wiki/index.md`, so that reference is dangling until the backend thread regenerates or drops it.
- Deleted `time-log.md`, the v1 work log that opens with the `MJCC-Portal/Interact` clone. Git history keeps it.
- Renamed the package from `lunch-line-survey` to `lunchvoice` and synced the lockfile; the name was the retired
  product's.
- `render.yaml`: replaced the v1 route comment (`/join`, `/survey/:id`, `/admin/*`) with the v2 routes. The service
  `name` stays `lunch-line-survey` on purpose - it is the existing Render service identifier and renaming it here would
  provision a new service, so that change belongs in the Render dashboard.
- `index.html`: `og:title` was `Lunch Voice`; it now matches the brand, `LunchVoice`.

### Frontend baseline rebased onto `main` (`uiv2`)

- The v2 frontend branch is rebased onto `main` at `d45b449` and renamed `uiv2`. Conflicts were resolved in `main`'s
  favour for everything the backend thread owns (`AGENTS.md`, `CLAUDE.md`, `docs/backend/*`, `docs/v2/PRODUCT_SPEC.md`,
  `scripts/db-test-canonical.sh`, `supabase/tests/*`), because the branch copies were older and still pointed the brain
  at the retired repo; the v2 `.env.example` template and this changelog's UI entries were kept.
- Added `scripts/check-customer-names.mjs`, a source guard that fails on `LionCafe`, `MCC`-style customer names,
  `Miami` or `Job Corps` anywhere under `src/`, including tests and fixtures. Wired into `test:pr` and `test:light` so
  CI enforces it.
- `src/lib/reservedSlugs.test.ts` fixtures renamed to synthetic names (`acme-test`, `example-hub`) so the test no longer
  needs a customer name to prove that a business name is not reserved.
- Removed the `edge-functions` Deno job from `.github/workflows/pr-checks.yml`. It ran
  `deno test supabase/functions/_shared/`, but v2 has no `supabase/functions` directory, so it failed on every pull
  request for code that does not exist. Overlaps the intent of draft PR #27; land one or the other, not both.

### Security

- The dev mock API and the simulated sign-in no longer ship in production bundles: they are gated on `import.meta.env.DEV`, a
  production build without Supabase configuration fails closed, and `scripts/check-bundle.mjs` now fails on dev-only strings.
  Adopted the backend's v2 `AGENTS.md`/`CLAUDE.md`; removed `public/tenants`, `legacy/`, the v1 `.env.example` values and
  `docs/backend/DATA_AND_MIGRATION_PLAN.md`.

### Added (read APIs and screens)

- Typed client now covers the full `lv_api` contract (hub get, members, invites, campaigns, submit, analytics, beta). Screens:
  public Hub landing (readable signed out), Campaign list, Campaign Studio (add questions, publish, close, share code),
  respondent player (one question per screen, anonymity notice, receipt), results with explicit "Withheld" states, Members and
  Invitations, `/pricing` from `src/config/pricing.ts` (Campaign Plus has no price; checkout disabled), placeholder
  `/discover`, `/billing`, `/settings`. Create Hub handles `lv_beta_required` with a beta application.
  Walked in the browser against the dev mock (create Hub, publish Campaign, respond, results); no console errors.

### Documentation

- Frontend docs reset to the v2 canonical master spec (2026-10-25): `README.md`, `PRODUCT.md` and `DESIGN.md` rewritten for the
  Hub/Campaign SaaS (Hybrid design direction, canonical pricing, Campaign Plus has no numeric price, Hub Name Reservation);
  new `docs/frontend/FRONTEND.md` (routes, boundaries, mock-to-real replacement table, work order, acceptance test) and
  `docs/frontend/HANDOFF.md`; `MULTI_TENANT_PLAN.md` (v1 plan) removed; history keeps it. `discover` added to the reserved slugs;
  `lioncafe` and `mjcc-admin` removed from them so no customer name is special-cased (regression test added).
  `AGENTS.md`, `CLAUDE.md` and the spec/API contract remain with the backend thread.

### Changed

- **v2 frontend reset (branch `feat/v2-ui`).** Removed every v1 screen and its support code: student/cafeteria routes,
  Content Central and the other admin screens, the `/LionCafe` and subdomain redirects, `AuthProvider`/`Gate`, the MJCC staff
  SSO callback, the organization provider, menu/QR/workbook libraries and the v1 `public.*` types. `src/index.css` was trimmed
  to the shared tokens, buttons, forms, cards, pills and chart styles. Unused dependencies `fflate`, `qrcode` and
  `@types/qrcode` were dropped. Legacy behaviour lives in Git history only. No database, deployment or MJCC data was touched.
- `scripts/check-bundle.mjs` and its test now require `lv_api` markers instead of v1 Supabase markers.
- `AGENTS.md` / `CLAUDE.md` still describe v1 and are intentionally unchanged here (they must stay byte-identical); updating
  them is pending an owner decision on v2 agent notes.

### Added

- v2 frontend foundation: routes `/`, `/signin`, `/me`, `/:hub`, `/:hub/campaigns`, `/:hub/campaigns/:id`, `/:hub/analytics`;
  `src/lib/lvApi.ts` typed client over the 13 `lv_api` functions; `src/lib/reservedSlugs.ts` (system-path reservation, mirrored
  to the backend) with `npm run test:unit`; `src/identity/IdentityProvider.tsx` (simulated sign-in in mock mode only, since the
  KpnIdentity issuer does not exist yet); an in-memory mock transport used when no Supabase env is set.

- Added the canonical v2 fresh-install baseline: `supabase/migrations/000001_v2_core.sql` through `000006_v2_platform.sql`
  (core identity/Hubs/memberships, authorization, campaigns, participation, privacy analytics, platform), each with a matching
  `supabase/rollbacks/*.down.sql`. A **blank database plus these six files is a complete LunchVoice v2 installation**; the
  legacy `public/` migrations in the same directory are v1 and are not part of it. Identity is `(issuer, subject)` with
  `UNIQUE(identity_issuer, identity_subject)`; there is no auth-user-keyed identity, no legacy-auth-user synthesis, no
  `public.profiles` mirror trigger and no dependency on `public.orgs`. For an anonymous Campaign the submission stores no
  account and the participation stores no submission, enforced by triggers, so there is no stored join path from a person to
  their answers. Tables live in schema `lv` and are never exposed; the whole API surface is 13 `lv_api` functions.
- Added `scripts/db-test-canonical.sh`, a fresh-install runner that applies only the canonical migrations to a throwaway
  Postgres, runs every suite, then applies and reverses the full baseline. It **fails on a zero-check run** rather than
  reporting a false green.
- Added tests: `supabase/tests/setup.sql` plus `01_identity` (25), `02_authorization` (28), `03_privacy` (26),
  `04_analytics` (22), `05_acceptance` (50) and `06_concurrency` (11). **162 checks executed, 0 failed**, and the full
  baseline applies to a blank database and rolls back completely.
- Added `docs/backend/PRODUCTION_RESET_RUNBOOK.md`: the not-approved, not-executed procedure for resetting the v1 database,
  including what is destroyed (137 users, 72 responses, 639 answers, 803 ratings, 14 orders), what is preserved, the
  dependency of all six live Edge Functions on `profiles`/`orgs`, how the first v2 administrator and MJCC Hub are created, how
  to prove no old student data survived, and the fact that there is **no rollback** after the schema drop.

### Changed

- **Founder reset, 2026-10-25 (supersedes every earlier entry that preserves, migrates or special-cases v1 or LionCafe).**
  LunchVoice v1 is retired and nothing is preserved, migrated, backfilled, mapped or bridged; LunchVoice builds the platform
  and never a customer Hub. No Hub, owner, role, page, Campaign, slug or fixture for LionCafe or MJCC exists in product code,
  migrations or tests; a customer creates `lioncafe` through the public `lv_hub_create` flow. The earlier entries below that
  mention creating the MJCC Hub, a Dec 11 MJCC launch or a v1 staff-permission fix are historical and no longer apply.
- Added the canonical spec to the repo as `docs/v2/LunchVoice_v2_CANONICAL_MASTER_SPEC_2026-10-25.md`, and the split worker
  prompts as `docs/v2/handoffs/UI_WORKER.md` and `docs/v2/handoffs/BACKEND_WORKER.md`.
- Rewrote `AGENTS.md` and `CLAUDE.md` (byte-identical) as v2-only: SaaS boundary, identity, one entitlement map (Starter $13/mo,
  Team $29/mo, Campaign Starter $19 for 2 weeks plus $13 per week, Campaign Plus price unset and fail-closed, Hub Name
  Reservation $25 per 12 months with 25-day grace), `lv_api`-only frontend, error contract, privacy rules and thread ownership.
- Rewrote `docs/backend/EXECUTION_ROADMAP.md` to the spec's 14-slice backend order with the entitlement map and the audit of the
  migration chain. Amended `docs/v2/PRODUCT_SPEC.md` (now subordinate to the master spec; MJCC preservation, subdomain/LionCafe
  compatibility and Campaign-Pass-only reservation wording replaced) and `docs/backend/PRODUCTION_RESET_RUNBOOK.md` (the reset
  no longer creates any Hub).
- Audit of migrations 000001-000007: no v1 table dependency, no seed. Fixed two issues: tests created `lioncafe` as their sample
  Hub (now a synthetic Hub), and a draft reserved-slug list carried `mjcc-admin` and `lioncafe-admin` (removed; no customer name
  is reserved). Added a test that no customer name is reserved and that no Hub exists before a customer creates one.

- Added `supabase/migrations/000008_v2_error_envelope.sql` (with rollback and `08_error_contract` tests). All 13 `lv_api` write
  functions now return `{ok:false, error:{code, message, ...}}` for every expected failure; bodies moved to `lv.api_*` behind
  thin wrappers; `lv_gate_blocked` carries `reasons`; caller-caused database rule violations map to `lv_invalid_input`,
  `lv_conflict` or `lv_not_found`; real faults stay exceptional as `lv_server_error` with no detail. `lv_hub_create` now
  validates slug format and display name itself (no raw constraint errors) and writes a `hub.created` audit event. For anonymous
  Campaigns the submission and answer timestamps are coarsened to the day so they never equal the participation timestamp (the
  stored join path found in the spec audit). Existing tests that expected raises now assert error codes.
- Added a two-connection slug race to `scripts/db-test-canonical.sh`: two clients claim one slug at once; exactly one wins, the
  other gets `lv_conflict` and keeps its approval. Suite is now 228 checks plus the race, 0 failed, rollback rehearsal passing.

### Removed

- **v1 removed from the repository (founder authorization 2026-10-26).** Deleted the v1 Edge Functions (`login-start`,
  `staff-login`, `staff-sso`, `staff-status`, `menu-sync`, `send-email` and `_shared`), `supabase/keepalive.sql`, the tracked
  `supabase/.temp/linked-project.json`, `legacy/`, `public/tenants/`, `scripts/check-email-setup.mjs`, the `deploy:functions` and
  `check:email` scripts, the MJCC menu bridge and tenant-map settings in `.env.example`, and all 20 v1 migrations from
  `supabase/migrations/`. The active migration directory now contains only `000001`-`000008`, so `supabase db reset` or `db push`
  produces only the v2 schema; `scripts/db-test-canonical.sh` fails if any other file appears there. Git history keeps v1.
  Not touched here (UI branch owns them): `src/` v1 frontend, `scripts/check-bundle.mjs` and `scripts/release-policy*`.
- **Live production not yet reset.** The backend session's Supabase connector and the local CLI login cannot see project
  `qprfonxvthmaoxfixigk`, so the destructive live steps (drop v1 schema, delete v1 users, retire v1 functions and secrets,
  install v2, deploy v2) are blocked on access and have not been run. See `docs/backend/PRODUCTION_RESET_RUNBOOK.md`.
- Removed `MULTI_TENANT_PLAN.md` and `docs/backend/DATA_AND_MIGRATION_PLAN.md`, which planned v1 org-to-Hub continuity and a data
  migration. Git history keeps them.

### Added

- **Roadmap slices 7, 8, 10 and 11 (branch `feat/v2-collab-participation-api`, stacked on `feat/v2-read-api`; not applied to
  production).** Split with the backend thread: this branch owns migrations `000010`-`000019`; slices 4, 5, 6, 9, 12 and 13 stay
  with the backend thread. Each migration has a rollback and a test suite; documented append-only in `docs/backend/API_CONTRACT.md`.
  - `000010_v2_roles_members.sql`: capability catalogue with groups; custom roles with name and icon; `lv_role_list/create/update/
    delete`, `lv_member_role_assign/unassign`, `lv_hub_join`, `lv_member_leave/admit/reject/remove`. No escalation anywhere (nobody
    grants, edits, deletes, assigns or removes past their own capabilities); Owner role untouchable; the Owner never uses a custom
    slot. Custom-role slots read `lv.custom_role_limit()`, which fails closed until policy `roles.max_custom_per_hub` is set; slice 9
    should replace that body with the entitlement map. Members can leave and rejoin (`left` status); removal stays permanent.
    `lv_invite_redeem` now re-admits someone who left.
  - `000011_v2_campaign_lifecycle.sql`: statuses `paused` and `archived`; Scheduled and Ended are derived from the window
    (`lv.campaign_phase`), so scheduled Campaigns hold their slot from publication and no background job is needed. Publishing writes
    an immutable `lv.campaign_versions` row (questions, participation settings, limit in force). New `lv_campaign_update`,
    `lv_campaign_question_update/remove`, `lv_campaign_schedule`, `lv_campaign_pause/resume` (resume re-checks the cap),
    `lv_campaign_archive`, `lv_campaign_versions`; `lv_campaign_close` now also closes paused or scheduled Campaigns and refuses drafts.
  - `000012_v2_participation_modes.sql`: guest participation (`audience = 'members_and_guests'`) through `lv_guest_campaign_get` and
    `lv_guest_submit` by join code, signed out. Guests never create memberships or count toward member totals; dedup by a hashed
    client key; per-Campaign total and per-minute rate limits, failing closed until policy `participation.guest_rate_per_minute` is set.
    `lv_campaign_set_participation` (draft only).
  - `000013_v2_analytics.sql`: anonymous results publish once finished (closed, archived or past `closes_at`; paused is not finished);
    guests counted apart (`guest_n`) and included in the frozen release population; new `participation_rate` and `rating_summary`
    metrics; `multi_choice` counted per option; `lv_analytics_overview`; `lv.campaign_member_participation()` for the survey unlock
    threshold in slice 9.
  - Tests: `10_roles_members` (46 checks), `11_campaign_lifecycle` (39), `12_participation_modes` (23), `13_analytics` (20).
    `scripts/db-test-canonical.sh`: 356 checks, 0 failed, slug race passing, full apply and rollback rehearsal passing.
  - Not done here: ownership transfer (slice 6), entitlement-driven limits (slice 9), election-mode guest rules (no election mode
    exists yet), true parallel races for the new advisory locks, and `lv_campaign_list/get` still return the stored status (the UI
    derives the phase; folding `phase` into those reads is left to the read-API owner).

- Added `supabase/migrations/000007_v2_read_api.sql` (with rollback and `07_read_api` tests): read API for the v2 frontend
  (`lv_hub_get`, `lv_campaign_list`, `lv_campaign_get`, `lv_member_list`, `lv_invite_list`, `lv_invite_preview`, `lv_beta_status`),
  richer `lv_my_context` (roles, capabilities, platform-admin and beta state), a completed reserved-slug list enforced by a
  trigger, and a no-double-hyphen slug rule. Documented in `docs/backend/API_CONTRACT.md`.

### Added

- Added the canonical v2 fresh-install baseline: `supabase/migrations/000001_v2_core.sql` through `000006_v2_platform.sql`
  (core identity/Hubs/memberships, authorization, campaigns, participation, privacy analytics, platform), each with a matching
  `supabase/rollbacks/*.down.sql`. A **blank database plus these six files is a complete LunchVoice v2 installation**; the
  legacy `public/` migrations in the same directory are v1 and are not part of it. Identity is `(issuer, subject)` with
  `UNIQUE(identity_issuer, identity_subject)`; there is no auth-user-keyed identity, no legacy-auth-user synthesis, no
  `public.profiles` mirror trigger and no dependency on `public.orgs`. For an anonymous Campaign the submission stores no
  account and the participation stores no submission, enforced by triggers, so there is no stored join path from a person to
  their answers. Tables live in schema `lv` and are never exposed; the whole API surface is 13 `lv_api` functions.
- Added `scripts/db-test-canonical.sh`, a fresh-install runner that applies only the canonical migrations to a throwaway
  Postgres, runs every suite, then applies and reverses the full baseline. It **fails on a zero-check run** rather than
  reporting a false green.
- Added tests: `supabase/tests/setup.sql` plus `01_identity` (25), `02_authorization` (28), `03_privacy` (26),
  `04_analytics` (22), `05_acceptance` (50) and `06_concurrency` (11). **162 checks executed, 0 failed**, and the full
  baseline applies to a blank database and rolls back completely.
- Added `docs/backend/PRODUCTION_RESET_RUNBOOK.md`: the not-approved, not-executed procedure for resetting the v1 database,
  including what is destroyed (137 users, 72 responses, 639 answers, 803 ratings, 14 orders), what is preserved, the
  dependency of all six live Edge Functions on `profiles`/`orgs`, how the first v2 administrator and MJCC Hub are created, how
  to prove no old student data survived, and the fact that there is **no rollback** after the schema drop.

### Changed

- **Architecture: LunchVoice v2 starts fresh; D-01 Option D withdrawn.** Google → KpnIdentity → LunchVoice is now the only
  identity path, and the old student dataset is explicitly not migrated. Old student accounts, responses, answers, ratings,
  points, reward history and legacy memberships do not carry into v2; the old production database is v1 / retirement-pending.
  Identity is the `(issuer, subject)` pair with `UNIQUE(identity_issuer, identity_subject)`; email is never the identity key.
  Hubs get independent v2 identities and no longer depend on `public.orgs`; `public.profiles` is not the v2 identity model and
  `role`, `is_staff`, `org_id` and `mjcc_username` are absent from the canonical schema. The legacy survey bridge is removed.
  Recorded in `docs/backend/D01_IDENTITY_SUPERSESSION_2026-10-25.md`, which supersedes parts of the D-01 packet
  (`docs/backend/D01_IDENTITY_DECISION_PACKET.md`), `docs/v2/PRODUCT_SPEC.md` (V2-02), `docs/backend/DATA_AND_MIGRATION_PLAN.md`
  (§2 principle 4) and `docs/backend/EXECUTION_ROADMAP.md`, all of which were amended in the same change so no authoritative
  document still mandates Option D or v1 data continuity.
- **Schedule risk recorded, not softened:** with no fallback, Dec 11 depends on a KpnIdentity issuer that does not yet exist.
  Architecture correctness takes priority over retaining Option D.

### Added

- Added `docs/v2/IDENTITY_CONTRACT.md`: what crosses from KpnIdentity into LunchVoice (`iss`, `sub`, `email`,
  `email_verified`, `name`, `picture`, nonce), the token/session trust model, validation and fail-closed rules, account-linking
  rules (no email merging), verified-vs-unverified behaviour, and the explicit statement that email is not the identity key.
- Added `docs/v2/KPNIDENTITY_SCHEMA_V1.md`: a minimal identity schema (`kpni.profiles`, `kpni.oauth_clients`,
  `kpni.oauth_redirect_uris`, `kpni.security_events`), the Supabase-managed vs application-table split, and the deliberate
  exclusions (MFA, grants, tenancy, billing) that would otherwise make an oversized IAM platform.
- Added `docs/v2/LUNCHVOICE_SCHEMA_V2.md`: the canonical fresh-install schema and its six baseline migrations, the
  `accounts → hub_memberships → membership_roles → role_capabilities` model, and the anonymity boundary.
- Added `docs/backend/V2_MIGRATION_CLASSIFICATION.md`: KEEP / REDESIGN / REMOVE for all 11 prototype migrations with reasons
  and destinations, plus the ported non-SQL assets. Nothing in the prototype stack was deleted.

### Notes

- The prototype stack (`feat/v2-hub-invitations` and the other 10 v2 branches) is unchanged and remains the research record.
  The canonical baseline is built on `feat/v2-canonical-baseline` off `main`, not on the prototype branch.
- No production database was read, written or wiped in this change.

### Added

- Fixed the project-scoped Supabase MCP server failing to start in the Claude desktop app on Windows with WSL (`.mcp.json`). The app launches `bash` from Windows with the
  `\\wsl.localhost\...` repository folder as the working directory, which Windows does not support, so the relative `scripts/mcp/supabase.sh` was never found
  ("Connection closed"). The server is now started by absolute path (`$HOME/projects/lunchvoice/scripts/mcp/supabase.sh`), which assumes the checkout lives there.
  The wrapper, token handling and read/write setting are unchanged. No secret, migration or database change.
- Added pull-request validation (`.github/workflows/pr-checks.yml`). Previously the only
  workflow ran on pushes to `main`, so a PR could merge with no automated checks. The new
  workflow runs on `pull_request`, has read-only permissions and no secrets, and cannot tag,
  release, deploy or push. It runs `check:brain`, new script tests (`node --test scripts/*.test.mjs`),
  the production build, a bundle smoke check, and Deno tests for
  `supabase/functions/_shared/`; it requires a `CHANGELOG.md` update in every PR and runs
  `npm audit --audit-level=high` when the PR touches dependency, auth, org, migration,
  function, workflow or hook paths. Builds now use placeholder (non-secret)
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`: without them `src/lib/supabase.ts` throws
  at load and the bundler drops the whole app, so a green build proved little;
  `scripts/check-bundle.mjs` now fails if the bundle lacks the app and Supabase client.
  Added `release-policy.mjs pr <base>` mode and npm scripts `test:pr`, `test:scripts`,
  `check:bundle`. `test:light`, `test:heavy` and `version-release.yml` are unchanged.
  Branch protection (making these checks required) is a separate founder decision; no
  repository setting was changed.
- Added project-scoped MCP server setup (`scripts/mcp/`): the Supabase MCP server now starts through
  `scripts/mcp/supabase.sh`, which loads secrets only from a gitignored, owner-only `.mcp.env` (never from the
  global shell), is scoped to one project with `--project-ref`, starts **read-only** by default, and pins
  `@supabase/mcp-server-supabase@0.13.0` instead of `@latest`. `.mcp.json`, `.cursor/mcp.json` and
  `.vscode/mcp.json` call the wrapper and contain no secrets; `.vscode/mcp.json` now uses VS Code's documented
  `servers` root (it previously used `mcpServers`). Also added a generic `with-env.sh` wrapper for future servers,
  `doctor.sh` (checks the setup and confirms the project ref exists for the token using one read-only API request),
  `.mcp.env.example`, a README, and 6 tests (`scripts/mcp.test.mjs`). `SUPABASE_ACCESS_TOKEN` was removed from
  `.env.example` (it moves to `.mcp.env`). Render MCP is documented but not enabled: its HTTP transport needs an API
  key in the process environment and no key scoping is documented. No secret, migration, resource or deployment.
- Added a signed KpnSolute CloudEvents receiver to the existing `menu-sync`
  function for MJCC menu-day and menu-cycle events. It verifies Standard
  Webhooks signatures against the raw request body, enforces the tenant-to-org
  mapping, and atomically deduplicates and projects menu data into Lunchvoice.
  The existing pull/manual synchronization remains available as a fallback.
- Added the service-role-only event receipt/projection migration and bounded
  CloudEvent request bodies to 256 KiB. Source verification passed Deno check,
  the independent signature test, `check:brain`, and the production build. No
  migration, secret, function deployment, or live subscription was applied.

### Fixed

- Restricted self-service writes to `public.profiles` (migration
  `20261023225534_restrict_profile_self_service_columns`, **applied to production on 2026-10-23** with the
  founder's authorization through the project MCP server, then recorded here with the same version). API roles
  (`anon`, `authenticated`) can no longer INSERT or UPDATE profile rows at table level; signed-in users may update
  only `email` and `display_name` (the app's only client-side profile write, `src/routes/Login.tsx`). Production
  already restricted UPDATE to those two columns, but that grant was never recorded in the migrations, so fresh
  replays did not match; this codifies it. A `BEFORE UPDATE` trigger additionally rejects changes to privileged
  columns (role, staff flag, points, streak, last survey date, org, MJCC username) by any role other than the
  database owner roles and the service role. Profiles are still created by `handle_new_user()` (SECURITY DEFINER,
  owned by `postgres`); points/streak changes still happen in SECURITY DEFINER RPCs; Edge Functions use the service
  role. Verified on a throwaway database replay first, then in production via catalog checks (privileges, trigger,
  unchanged profile counts).
- Fixed the heavy-test selector in `scripts/release-policy.mjs`: it matched
  `src/contexts/Auth`, a directory that does not exist, so a commit touching only
  `src/auth/AuthProvider.tsx` or `src/org/OrgProvider.tsx` skipped the heavy release
  gate. The patterns now live in `scripts/release-patterns.mjs` (covering `src/auth/`,
  `src/org/`, `src/lib/supabase`, `supabase/config.toml`, `.githooks/` and the release
  scripts besides the earlier paths) with regression tests.

- Remediated the three high-severity dependency advisories reported by `npm audit`
  on 2026-10-23 (`vite` 8.1.3 -> 8.3.5, `nanoid` 3.3.17 -> 3.3.20, `source-map-js`
  1.2.1 -> 1.2.2, with the matching `rolldown` 1.1.4 -> 1.2.15 and `postcss`
  8.5.25 -> 8.5.31 updates) by refreshing `package-lock.json` only; `package.json`
  ranges are unchanged and `react-router-dom` moved within 6.x (6.30.4 -> 6.30.6).
  `npm audit --audit-level=high` now exits 0, so the heavy release gate passes
  again. Two moderate `react-router` / `react-router-dom` advisories remain: their fix
  requires React Router 7 (major). Assessment: the app is a client-side SPA with no
  server rendering or hydration, so the `deserializeErrors()` advisory has no
  reachable path; every `<Navigate>`/`navigate()` target in `src/` begins with a fixed
  prefix (`/${org.slug}`, `/LionCafe`, a relative path, or `/`), so the backslash
  open-redirect advisory has no user-controlled leading segment today. This is a
  read-through of the call sites, not a proof; the React Router 7 migration remains
  a separate, scheduled change. Verified with placeholder `VITE_SUPABASE_*`
  values (see below) that the production bundle still contains the same app and
  Supabase client code (519 kB -> 517 kB). No migration, secret or deployment.
- Discovered that `npm run build` without `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` succeeds but produces a near-empty bundle (`src/lib/supabase.ts`
  throws at module load, so the bundler drops everything after it), meaning a "passing
  build" in an environment without those variables proves little. The CI change
  tracks this separately.

- Updated the locked PostCSS toolchain to remove the high-severity source-map
  path-disclosure advisory found by the release audit. Two moderate React
  Router advisories remain because their upstream fix requires the separate
  React Router 7 migration; the high-severity release gate is clean.

- Fixed the Supabase MCP server failing with a permission error in every
  local AI tool (Claude Code, Cursor, VS Code). `.mcp.json`,
  `.cursor/mcp.json`, and `.vscode/mcp.json` all pointed at the hosted
  `mcp.supabase.com` endpoint; the two IDE configs sent no `Authorization`
  header at all, and none had ever been committed, so a fresh clone had no
  working Supabase MCP access regardless of tool. Switched all three to the
  local `npx`-spawned `@supabase/mcp-server-supabase` server, scoped to this
  project via `--project-ref=qprfonxvthmaoxfixigk` and authenticated with
  `SUPABASE_ACCESS_TOKEN` (documented in `.env.example`, same Supabase
  account as KpnCompute). Verified full read/write access to the live
  project via the Management API directly (19 public tables reachable)
  before committing the config.

- Fixed `single_choice`/`yes_no` answers being double-counted in Content
  Central's Results tab: they were tallied correctly as choice-bar options
  but also pushed into the free-text bucket, inflating "Open comments" and
  showing structured picks (e.g. "Yes", "Too small") as if they were quoted
  student comments. Only genuine open-text answers land in the text bucket
  now.
- Fixed the dead "Continue with MJCC" staff sign-in button: `MJCC_STAFF_SSO_URL`
  pointed at `mjcc.kpncompute.com`, whose apex domain no longer resolves in
  DNS. The live portal moved to `mjcc.kpnsolute.com` (confirmed reachable,
  same underlying Render service) — updated the constant and the matching
  README reference. Backend edge functions were unaffected; they already call
  the stable `mjcc-managements.onrender.com` URL directly.
- Applied the `responses`/`join_code` tracking-integrity migration to MJCCv2
  (unique constraint on `responses(session_id, student_id)`, org-scoped
  `join_code`, reserved-column comments). While applying it, found and
  dropped a second, untracked unique constraint on the same `responses`
  columns that predated this change and wasn't recorded in any migration
  file — both enforced the same thing, so the untracked one was removed.
- Applied `20260706153000_add_flame_slider_question_types.sql`, which had
  been written and committed but never actually run against MJCCv2 — the
  `survey_questions.type` check constraint was silently missing `flame` and
  `slider` even though the Question Editor UI already offered both as answer
  types, so creating either would have failed with a database error.
- Made the session duration dropdown reflect what's actually saved:
  previously it always showed a hardcoded "30 minutes" default regardless of
  the session's real `closes_at`, so clicking "Set duration" without
  deliberately changing the dropdown could silently shrink a session that
  was set to close much later. It now seeds from the session's persisted
  duration (mapped to the closest preset) on load.

- Stopped "Set duration" from silently reopening a closed survey session to
  students — it now only updates the auto-lock time, never `is_active`.
  Reopening a session is exclusively a Close/Reopen action, and that action
  (along with Remove/Show in Available) now requires a confirmation naming the
  live student-facing consequence before it fires.
- Stopped every session-card action (Close/Reopen, Set duration, Available
  toggle) from reloading the whole Content Central tab and resetting scroll to
  the top — these now patch local state instead of a full refetch.
- Added a unique constraint on `responses(session_id, student_id)` to close a
  check-then-insert race in `submit_response` that could double-award points
  on a double-submit or retry. Confirmed zero existing duplicate rows before
  applying.
- Re-scoped `sessions.join_code` uniqueness from global to per-`org_id`,
  matching the org-scoped design of the rest of the schema; prevents a
  spurious insert failure if two different orgs happen to generate the same
  join code.
- Fixed double-encoded UTF-8 (mojibake) on the student Surveys page that
  rendered `Loading…` and `·` as garbled characters.
- Replaced the ambiguous "fixed survey" session label with "No linked survey"
  so staff can tell an intentionally template-less session from a broken
  join.
- Made staff sessions expire only after 60 minutes of real inactivity across
  open Lunchvoice tabs, then return staff to the MJCC-backed admin login instead
  of silently dropping them into the student flow.
- Replaced blank legacy dish-idea rows with ranked tag bubbles sourced from
  dynamic survey answers categorized as Ideas, legacy survey ideas, and visible
  Student Voice ideas. Empty answers are ignored and repeated ideas show their
  combined request count.
- Replaced the separate Lunchvoice staff-password flow with a one-time MJCC
  single-sign-on handoff. Staff sessions are now provisioned in MJCCv2 only
  after KpnCompute confirms the live LionCafe role grant, and persisted sessions
  continue to recheck that same grant.
- Fixed Student Voice submissions by sending the authenticated student ID and
  visible status required by the tenant-scoped database insert policy.
- Replaced the displayed-row count with exact Student Voice totals and kind
  counts, refreshed through database events, browser focus, and five-second
  polling. The admin dashboard now includes those totals and Student Voice
  ideas alongside survey ideas.
- Allowed HTTPS tenant subdomains through the staff Edge Function CORS checks
  and stopped transient staff-status failures from signing sudo staff out. Only
  a confirmed upstream access revocation now ends the local session.
- Made Content Central results refresh from database changes, browser focus,
  and a five-second polling fallback. Response totals and trends now use the
  response records directly, including submissions without dynamic answers.
- Disambiguated the admin results embeds from `survey_answers` to
  `survey_questions` and `responses`, preventing PostgREST `PGRST201` errors
  when duplicate database foreign-key relationships are present.

### Added

- Added the project-scoped Supabase MCP skeleton at `.mcp.json`, targeting
  MJCCv2 (`qprfonxvthmaoxfixigk`) without storing credentials in the repository.

- Added a dedicated "Sessions" tab in Content Central, separate from "Launch,"
  with search by title/join code, Active/Closed grouping with counts, a
  visually distinct "Live controls" cluster on each card so staff can tell
  read-only info from student-facing actions, and the QR code now renders
  directly under its own button instead of below three unrelated controls.
- Added a campus-compatible KpnCompute launch path, a short-lived SSO callback,
  and staff QR destination controls for either the Render campus URL or the
  public Lunchvoice URL. QR codes can now be downloaded as high-resolution PNG
  images for flyers. The KpnCompute bridge, MJCCv2 functions, and Interact
  frontend were deployed and verified fail-closed for anonymous/forged access.
- Added three clear student survey access paths: QR links that survive sign-in
  or sign-up and open the intended survey, code entry on the Surveys page, and
  an optional staff-controlled Available surveys list.
- Added an authenticated, tenant-scoped `join_available_session` RPC plus staff
  launch/session controls for opting sessions into student discovery.
- Added wildcard hostname routing so any subscribed organization can use
  `<orgSlug>.lunchvoice.com` while the root and `www` hosts remain the public
  Lunch Voice site. Existing `/:orgSlug` URLs remain compatible.
- Added governing-agent rules for Codex and Claude, including KpnRelay pawn
  operation, Regional Overseer/Synthesis Drive handoffs, standing routine push
  authority, bounded OpenCode/Mimo delegation, credit safeguards, and
  PowerShell-first frontline automation.
- Added staff controls to edit store-item details, stock, point cost, and
  visibility, plus guarded permanent deletion for items without order history.
- Added a one-time, per-staff Content Central tutorial covering survey creation,
  questions, publishing, launching, and results, with an optional replay button.
- Added configurable survey durations for both launch and active-session
  management, ranging from 15 minutes to one week with a manual-close option.
- Established identical `AGENTS.md` and `CLAUDE.md` project-brain instructions.
- Added automatic sequential commit tagging and milestone release automation.
- Added light/heavy test classification and project-brain consistency checks.
- Added the project-specific work-session time log.

### Changed

- Restricted session reads so code-only sessions stay hidden until a student
  joins, while discoverable active sessions and each student's joined history
  remain accessible under RLS.
- Reset the repository package version baseline to `0.0.1` for the new release
  sequence. Historical commits remain untagged; automation begins at current
  `main`.
- Enabled the Windows WSL and Virtual Machine Platform features and staged a
  per-user Docker Desktop installation for isolated local Supabase testing.

## [0.0.1] - Unreleased

- Initial version-policy baseline.
