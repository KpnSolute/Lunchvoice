# Lunchvoice Agent Brain

This file and `CLAUDE.md` are the project brain. They must remain byte-for-byte
identical. `CHANGELOG.md` is the project memory and must be updated with every
meaningful code, configuration, release, or operational change.

## Project

Lunchvoice is a multi-tenant React, TypeScript, Vite, and Supabase application
for dining feedback, menu planning, student rewards, and staff operations. It
deploys as the Render static site `lunch-line-survey`.

- GitHub: `KpnSolute/Lunchvoice`
- Production Supabase: MJCCv2 (`qprfonxvthmaoxfixigk`)
- MJCCv1 (`mgvyylvmkxhhataavqjz`) is an upstream staff/menu system, not this
  repository's deployment target.
- Local frontend: `npm run dev`
- Architecture map: `graphify-out/wiki/index.md`
- Product details: `README.md`, `PRODUCT.md`, and `DESIGN.md`

## LunchVoice v2 Product Authority and Handoff

Start at `docs/README.md`; Claude continues planning in `docs/backend/README.md`
before frontend planning. Backend docs belong in `docs/backend/`, frontend docs
in `docs/frontend/`, and cross-system architecture/resources in `docs/archeture/`.
The canonical design is `docs/archeture/ARCHITECTURE.md`; its resource inventory
is `docs/archeture/RESOURCE_MAP.md`. The authoritative v2 target includes `docs/v2/`:
`PRODUCT_SPEC.md`, `CURRENT_STATE_AUDIT.md`, `ARCHITECTURE.md`,
`IMPLEMENTATION_PLAN.md`, and `DEFINITION_OF_DONE.md`. Read it before v2 work.
The product spec records confirmed founder decisions; architecture proposals and
the D-01 through D-12 decision register must not be treated as approved defaults.
Legacy product documents and the architecture contracts below describe the
current system and compatibility obligations, not the complete v2 vision.

- V2 is a consumer community and feedback platform: customizable Hubs and
  Campaigns, central `auth.kpnsolute.com` Google identity (Apple later), one
  account across multiple Hubs, free participant accounts, fine-grained roles,
  explicitly authorized guests, and protected anonymous responses.
- Target canonical Hub URLs are `lunchvoice.com/{hubSlug}`. Existing subdomain
  and LionCafe links must remain compatible until a tested transition is approved.
  Preserve tenant isolation, verified authority, RLS, grants, and secret handling
  while replacing single-org profiles with membership-based authorization.
- Entitlements are enforced server-side. Starter is $13/month with 3 custom roles,
  3 custom pages, 15 active Campaigns and at most 2 active Survey-mode Campaigns;
  Team is $29/month with 6 custom roles and at most 5 active Survey-mode Campaigns.
  Owner is protected and outside role slots. Additional-survey gates are >50%
  Starter and >=20% Team eligible-member participation, within caps. Read the
  decision register before choosing the remaining gate/counting rules.
- Seasonal Campaign Starter is $19/two weeks plus $13/extra week; Campaign Plus
  is Team-equivalent with base and extension prices undecided. Name reservation
  is $25/12 months, renewable for $25/12 months, with 25 calendar days of grace
  from expiry before release. Slug reuse must never transfer private Hub data.
- At least 700 valid accepted members permits a discovery application, not
  automatic listing. Public waitlist precedes a maximum 50 beta Hub owners.
  November 12, 2026 remains a proposed prototype/waitlist milestone. Claude must
  develop the October 23-December 11, 2026 execution roadmap using
  `docs/backend/ROADMAP_PROPOSITION.md`. Launch aligns with the start of MJCC Hub
  Winter Survey 2026, subject to the Definition of Done; confirm its opening date
  and time. December 13 was the earlier provisional target, not a verified event date.
- Preserve MJCC/LionCafe and support its planned December Campaign through a
  non-destructive migration with reconciliation and rollback evidence.
- Claude implements after specification review and approval. The documentation
  phase is feature-branch/PR work only: no main merge, manual tag, production
  migration, production secret change, or deployment. Existing standing authority
  and production boundaries remain in force for later explicitly scoped tasks.

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
