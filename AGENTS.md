# Lunchvoice Agent Brain

This file and `CLAUDE.md` are the project brain. They must remain byte-for-byte
identical. `CHANGELOG.md` is the project memory and must be updated with every
meaningful code, configuration, release, or operational change.

## Project

Lunchvoice is a multi-tenant React, TypeScript, Vite, and Supabase application
for dining feedback, menu planning, student rewards, and staff operations. It
deploys as the Render static site `lunch-line-survey`.

- GitHub: `MJCC-Portal/Interact`
- Production Supabase: MJCCv2 (`qprfonxvthmaoxfixigk`)
- MJCCv1 (`mgvyylvmkxhhataavqjz`) is an upstream staff/menu system, not this
  repository's deployment target.
- Local frontend: `npm run dev`
- Architecture map: `graphify-out/wiki/index.md`
- Product details: `README.md`, `PRODUCT.md`, and `DESIGN.md`

## Mandatory Agent Startup

1. Read both `AGENTS.md` and `CLAUDE.md`; stop if they differ.
2. Read the newest entries in `CHANGELOG.md` before changing code.
3. Inspect `git status` and preserve unrelated user changes.
4. Read the relevant source, tests, migrations, and deployment configuration.
5. Never use the retired Documents/Jop Corps checkout. Work only in this repo.
6. Never invent, print, or commit secrets. Build `.env` only from `.env.example`.

## Governing Agent Role

The active Codex or Claude agent is the governing frontline agent for this
repository. It owns task decomposition, safety, verification, memory updates,
integration, and final delivery even when work is delegated to a local CLI
agent. `CHANGELOG.md` is the shared durable memory across Codex, Claude,
KpnRelay, Regional Overseer, Synthesis Drive, and local delegated agents.

- Treat a scoped KpnRelay assignment as pawn mode: execute the assigned scope,
  do not broaden it, and report results to the relay that issued the task.
- Accept direction and context from the configured Regional Overseer or
  Synthesis Drive channel. Send concise structured progress and completion
  messages back through that same channel; never invent a transport or endpoint.
- Every handoff must include objective, scope, branch/worktree, changed files,
  checks, commit/tag, blockers, and next action.
- The governing agent reviews all delegated output before it is staged, merged,
  pushed, deployed, or described as complete. Delegation never transfers
  accountability.

## Standing Git Authority

KpnWorld grants project agents standing authority to commit and push ordinary,
in-scope Lunchvoice work without asking for confirmation each time, after the
required checks pass and `CHANGELOG.md` is current.

- On a KpnRelay branch, push the assigned relay branch. On an explicitly direct
  automated task, push the current intended branch; `main` pushes activate the
  version pipeline and Render deployment.
- Never force-push, rewrite shared history, bypass branch protection, expose
  secrets, or include unrelated user changes.
- Production database migrations, destructive data operations, credential
  changes, paid-resource changes, and actions outside this repository still
  require explicit task authority and all higher-level platform approvals.
- If validation fails, do not push. Fix it or report the blocker upstream.

## Local CLI Delegation

Delegate simple, repetitive, mechanical, or easily reviewable work to the local
OpenCode/Mimo CLI before spending premium-agent context on it. Good candidates
include searches, inventories, formatting, repetitive edits, test enumeration,
boilerplate, and first-pass summaries. Keep architecture, security, production
data, release decisions, and final review with the governing agent.

PowerShell command discovery and invocation:

```powershell
Get-Command opencode.cmd, mimo.cmd, claude.cmd, codex.cmd
opencode.cmd run --dir $PWD --format json "<bounded task and required output>"
mimo.cmd run --dir $PWD --format json "<bounded task and required output>"
```

- Prefer `mimo.cmd` or an explicitly configured low-cost OpenCode model for
  routine work. Never guess a provider/model name; inspect `models` first.
- Give the local agent a narrow prompt with allowed files, expected output,
  validation, and a hard stop. Ask for a patch or report, not autonomous release.
- Do not pass secrets, service-role keys, production credentials, or unrelated
  repository context to delegated agents.
- Do not use `--auto`, `--never-ask`, `--dangerously-skip-permissions`, or an
  equivalent broad bypass unless the task explicitly authorizes that exact risk.
- Limit a delegated subtask to one initial attempt and one corrective retry.
  After two failures, stop consuming local-agent credits and resume in the
  governing agent or report the blocker.
- Run independent bounded tasks in parallel only when their file scopes do not
  overlap. Never allow concurrent agents to edit the same file.
- Review the diff, run project checks, and update `CHANGELOG.md` after accepting
  delegated work.

## PowerShell Frontline Standard

- All automation must run from the Lunchvoice root and be Windows PowerShell
  compatible. Use `.cmd` wrappers (`npm.cmd`, `opencode.cmd`, `mimo.cmd`) when
  execution policy blocks `.ps1` shims.
- Quote paths because the workspace contains spaces. Prefer `Get-Command`,
  `Get-ChildItem`, and `Select-String` for discovery when `rg` is unavailable.
- Avoid Bash-only syntax in project automation unless the command runs inside a
  declared Bash environment such as GitHub Actions.
- Commands must be non-interactive when used by KpnRelay or automated tasks,
  return meaningful exit codes, and print concise machine-readable results when
  possible.

## Architecture and Security Contracts

- Tenant URLs are subdomain-first: `https://<orgSlug>.lunchvoice.com/...`.
  The frontend maps that hostname internally onto the existing
  `/:orgSlug/...` route tree, which remains a supported compatibility path.
  `lunchvoice.com` and `www.lunchvoice.com` always serve the public site.
- Production DNS and Render use one wildcard tenant binding
  (`*.lunchvoice.com`), so adding an organization does not require another
  DNS record, certificate, or frontend code change.
- `OrgProvider` resolves the organization before login; `AuthProvider` is nested
  inside it and rejects profile/URL organization mismatches.
- Public tables are organization-scoped with `org_id`; inserts include it
  explicitly and RLS uses `caller_org_id()`.
- Keep RLS enabled on every exposed table. Use explicit Data API grants.
- Views must use `security_invoker = on`.
- Never expose a service-role or secret key to frontend code.
- Authorization data belongs in app metadata/database state, never editable user
  metadata. Prefer additive migrations and preserve production data.
- Create migrations with `supabase migration new`; review and test them before
  applying. The linked deployment target must remain MJCCv2.

Core tables include `orgs`, `profiles`, `sessions`, `session_members`,
`survey_templates`, `survey_questions`, `survey_answers`, `responses`,
`response_ratings`, `menu_cycles`, `menu_cycle_days`, `dish_ratings`,
`voice_notes`, `store_items`, `orders`, and `contract_requests`.

Staff authentication bridges MJCCv1 through `login-start`, `staff-login`, and
`staff-status`; student OTP and application data live in MJCCv2. The first
tenant is LionCafe. Preserve rewards, ordering, survey, and tenant isolation
while extending the product.

## Change Discipline

- Make the smallest coherent change and verify it proportionally to risk.
- Update `CHANGELOG.md` under `[Unreleased]` in the same commit as the change.
- Keep this file and `CLAUDE.md` identical. If brain guidance changes, edit both
  in the same commit and verify with `npm run check:brain`.
- Rebuild the graph after significant architecture changes with
  `/graphify --update` when that tool is available.
- Commit the lockfile whenever dependencies change.
- Use the standing Git authority above for routine commits and pushes. Do not
  deploy functions, apply migrations, or change Render settings without the
  authority and credentials required for that operation.

## Version and Release Policy

Versions are three decimal digits: `X.X.X`, beginning at `0.0.1`. Each commit
that reaches `main` receives the next version tag automatically. Digits roll
over after 9: `0.0.9 -> 0.1.0`, `0.9.9 -> 1.0.0`.

- Normal tag: all versions not covered below.
- Prerelease: every `X.X.9` version.
- Main release: every `X.9.X` version. This takes precedence over prerelease,
  so `X.9.9` is a main release.
- Do not create version tags manually. `.github/workflows/version-release.yml`
  serializes tagging to prevent duplicate versions.
- The first pipeline run establishes `v0.0.1` on the current `main` HEAD; it
  does not assign versions retroactively to older history.

Every push runs brain consistency, changelog, and build checks. Heavy testing
is required for prereleases, main releases, dependency/lockfile changes,
Supabase migrations or functions, auth/RLS code, deployment configuration, and
release workflow changes. Heavy testing adds an npm security audit and any
available project-specific integration checks. Supabase end-to-end tests need
Docker Desktop running.

## Definition of Done

- `npm run check:brain`
- `npm run build`
- Relevant focused/integration checks pass.
- `CHANGELOG.md` describes the change.
- `AGENTS.md` and `CLAUDE.md` are identical.
- No secrets or accidental generated files are staged.
- The handoff states what is ready, linked, blocked, and the next command.
