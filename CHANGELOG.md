# Changelog

This file is the durable project memory. Every meaningful code, configuration,
release, and operational change belongs here. Entries follow Keep a Changelog
categories and the repository's decimal `X.X.X` release policy.

## [Unreleased]

### Added

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
