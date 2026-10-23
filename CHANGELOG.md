# Changelog

This file is the durable project memory. Every meaningful code, configuration,
release, and operational change belongs here. Entries follow Keep a Changelog
categories and the repository's decimal `X.X.X` release policy.

## [Unreleased]

### Added

- Added the v2 execution-planning proposals (documentation only): a dated October 23-December 11, 2026
  roadmap with critical path, capacity assumptions, three scope options (A full, B launch-critical-first
  recommendation, C date shift) and candidate-deferral decision dates; data and migration, API and
  authorization, Campaign and entitlement, and privacy and operations plans; and a frontend experience plan
  mapping every flow to contracts, permissions, entitlements, responsive/accessibility requirements and
  evidence, with design artifacts marked pending and questions for the design manager. Recorded
  source-backed audit findings (dependency advisories, no PR checks, unprotected `main`, stale auth
  heavy-test path, platform-route collision). D-01 through D-12 remain undecided, D-12 (Winter Survey
  dates, operator, questionnaire, audience) stays open, and nothing is approved. No migration, secret,
  resource, deployment or production probe was performed.

- Recorded the founder's relayed schedule update (2026-10-23): MJCC Hub and Winter Survey launch
  December 11, 2026 as the first v2 beta (M1) and the v2 main public release is December 23, 2026 (M2),
  with the readiness go/no-go recommended for December 9 and final checks December 10. The roadmap
  window now spans October 23-December 23, adds R-26 (final checks/launch day) and R-27
  (stabilization/main release), a milestone mapping proposal, M1/M2 decision dates, and a two-day
  fallback-switch window after a December 9 no-go. The Winter Survey opening date is confirmed; its
  time/timezone, closing, operator, questionnaire, audience and anonymity stay open (D-12). Updated the
  spec, Definition of Done, implementation plan, index and both agent brain files (kept identical)
  to match; the earlier December 13 target is superseded. Documentation only; no production change.

- Recorded the founder's 2026-10-23 approvals in the roadmap (Dec 9 go/no-go with Dec 10 final checks, the
  M1/M2 split with Options A and C kept as contingency, and the non-production CI/dependency/staging-manifest
  work; the message's scope is flagged for explicit founder confirmation). Added the staging manifest with a
  cost envelope read from public vendor pages (nothing purchased or provisioned; figures to be re-verified) and
  the D-01 identity decision packet (options A-D, account-linking implications, contingency). Updated R-02 to R-05
  status: PR #5 (CI checks) and PR #4 (dependency remediation) are open, the baseline migration was shown not to
  replay cleanly on an empty database, and an isolated authorization verification was performed with results held
  privately. Documentation only; no production access, migration, secret, resource or deployment.

- Recorded the founder's DNS facts (2026-10-23: `kpnsolute.com` on Cloudflare, `lunchvoice.com` on GoDaddy with a
  planned move to Cloudflare, hosting on Render) in the staging manifest and resource map, proposed staging hostnames
  under `kpnsolute.com` so no production DNS change is needed before launch, and added a plain-language sign-in
  flow to the D-01 packet. Documentation only.

- Recorded three founder decisions (2026-10-23): a $50 per month staging cap, the founder as staging resource
  owner (ownership only, not permission for Claude to create resources), and approval of D-01 Option D (Supabase's
  built-in Google provider) as the contingency if the central issuer or staging spike is not ready by Nov 6. Updated
  the staging manifest, D-01 packet and roadmap. Documentation only.

- Linked the founder-designated Claude Design manager in the frontend handoff and
  both agent brains. Recorded the observed screen gaps, current signature direction,
  stale animated SVG export and unresolved branding attribution, with required
  artifact/version mapping and accessibility checks for Claude's experience plan.

- Organized the Claude planning handoff with `docs/README.md`, backend-first
  planning and roadmap proposition under `docs/backend/`, a frontend planning
  guide under `docs/frontend/`, and canonical architecture/resource mapping under
  `docs/archeture/`. Kept a v2 architecture pointer to preserve existing links.
  The resource map distinguishes source-backed services (including Supabase,
  Render, email and MJCC integration) from required/unselected resources.
- Updated both agent brain files identically and aligned active planning guidance
  to the founder's October 23-December 11, 2026 roadmap request. Launch aligns
  with MJCC Hub Winter Survey 2026 opening; its exact date/time still needs
  confirmation, and December 13 is recorded only as the earlier provisional target.
  Claude is asked to continue planning first; no session dispatch, implementation,
  resource provisioning, production change or deployment is claimed.

- Researched the v2 core against current Google, Supabase, and PostgreSQL primary
  documentation. Added a recommended OIDC federation spike, alternatives and
  identity-linking constraints, plus a five-PR core plan for verification,
  central identity, memberships, permissions, and atomic Campaign activation.
  Included a founder-review gate proposal, staging evidence requirements and
  milestone sequencing; no unresolved product policy was marked approved and
  no implementation, migration, provider configuration or deployment was performed.

- Added the authoritative LunchVoice v2 documentation suite under `docs/v2/`:
  product specification, source-backed current-state audit at main `0dbc343`,
  target architecture, implementation roadmap, and separate documentation/release
  acceptance criteria. Incorporated the founder's supplemental decisions for
  Hubs, central Google identity, multi-Hub membership, protected Owner/custom
  roles, Campaign modes and gates, guest/anonymity controls, Hub Builder, analytics,
  seasonal/subscription entitlements, annual name reservation, discovery and beta.
  Recorded remaining decisions explicitly, including both Campaign Plus prices.
- Updated identical agent brain files with v2 authority and Claude's implementation
  handoff after review/approval; corrected the repository identifier while
  preserving security, release, delegation, and production-operation governance.
  This is documentation only: no source, dependency, migration, production secret,
  function deployment, or runtime configuration change. The source audit records
  three high and two moderate dependency entries reported on 2026-10-23 as existing
  launch blockers, not a passing heavy release audit.

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
