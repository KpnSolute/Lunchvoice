# Changelog

This file is the durable project memory. Every meaningful code, configuration,
release, and operational change belongs here. Entries follow Keep a Changelog
categories and the repository's decimal `X.X.X` release policy.

## [Unreleased]

### Fixed

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
