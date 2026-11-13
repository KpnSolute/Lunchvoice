# Lunchvoice Agent Brain

This file and `CLAUDE.md` are the project brain. They must remain byte-for-byte
identical. `CHANGELOG.md` is the project memory and must be updated with every
meaningful code, configuration, release, or operational change.

## Project

LunchVoice v2 is a multi-tenant SaaS platform for interactive community
feedback, built by KpnSolute. Customers create **Hubs** and run **Campaigns**
(surveys, polls, ratings, ideas, elections) with privacy-safe analytics.
Dining is one customer use case, not the product.

- LunchVoice v1 is **retired**. Its users, responses, menus, rewards, orders,
  staff access, tenant model and UI are not part of v2 and are never migrated,
  backfilled, aliased, mapped or bridged. Git history is the archive.
- LunchVoice builds the platform, not customer Hubs. Never pre-create, seed,
  hardcode or special-case LionCafe, Miami Job Corps or MJCC (no Hub, owner,
  role, page, Campaign, slug, route or fixture). A customer creates `lioncafe`
  through the same public `lv_hub_create` flow as any other free slug. No code
  path may say "if MJCC" or "if LionCafe".
- Identity: Google, then KpnIdentity (`auth.kpnsolute.com`), then LunchVoice.
  A person is the verified `(issuer, subject)` pair; email is never an identity
  key. LunchVoice owns authorization, memberships, roles and entitlements.
- Canonical spec: `docs/v2/LunchVoice_v2_CANONICAL_MASTER_SPEC_2026-10-25.md`.
  Read it before implementing anything. The founder direction of 2026-11-07
  (Quick Surveys, whitelist launch) and the launch definition of done live in
  `docs/v2/LAUNCH_PLAN.md`, which wins where it differs. Worker handoffs live in
  `docs/v2/handoffs/`. Product detail is `docs/v2/PRODUCT_SPEC.md`; the
  identity boundary is `docs/v2/IDENTITY_CONTRACT.md`. Every service and
  dependency that runs LunchVoice, and where it lives in Composio or outside
  it, is in `docs/ops/SERVICES_AND_DEPENDENCIES.md` (update it with any
  change); the launch decisions log is `docs/v2/LAUNCH_PREP_PLAN_2026-11-13.md`.
  Cloudflare Workers is the edge platform for LunchVoice's needs (founder,
  2026-11-13): use it without asking, and log each use in that inventory.
  Build LunchVoice at the lowest possible cost: add no Render custom domains
  (each beyond the plan's allowance costs money) and route every new hostname
  (auth, create, pay) through Cloudflare; see section 2a of that inventory.
  The site deploys as a Render static site, not Docker, and `render.yaml` is not
  connected to Render (no Blueprint): production routing and headers live in the
  Render service, so change them through the Render API, not by editing the file.
- Supabase refs: Lunchvoice `qprfonxvthmaoxfixigk`, KpnIdentity
  `axzwdbizblfkspduqilj`. Production is not mutated without the approvals below.
- GitHub: `KpnSolute/Lunchvoice`. Local frontend: `npm run dev`.
- Architecture map: none yet. The v1 map was deleted with the v1 code; rebuild
  the v2 graph with `/graphify` when that tool is available.

## Canonical Pricing and Entitlements

One authoritative entitlement map. Never hardcode plan behavior separately in
UI and API; the backend evaluates the active entitlement.

- Free participant: $0. Participation is always free.
- Starter Hub: $13/month. 3 custom roles, 3 custom Hub pages, 15 active
  Campaigns, 2 active Survey-mode Campaigns, more than 50% unique-eligible-member
  participation to unlock a survey replacement.
- Team Hub: $29/month. 6 custom roles, expanded community pages, enhanced
  modes, advanced role targeting and analytics, 5 active surveys, at least 20%
  threshold, Discover eligibility at 700 genuine active members.
- Campaign Starter: Starter family, time-bounded. $19 for the first 2 weeks,
  $13 per additional week.
- Campaign Plus: Team family, time-bounded. $39 for the first 2 weeks, $19 per
  additional week (founder, 2026-11-07).
- Creator Plus: $5/month; Creator Pro: $15/month (founder, 2026-11-12). Per-person plans (account-scoped
  entitlements): the perks go with the person into their personal space and every Hub they edit. Sections and
  conditional sections (`survey.branching`) and survey branding (`survey.branding`) start at Creator Plus and
  Starter Hub (founder, 2026-11-13). Live results (`results.instant`) are approved for Creator Plus, Creator Pro,
  Team Hub and Campaign Plus: totals and charts from the first answer, anonymous individual answers in groups of 5
  (founder, 2026-11-13); elections keep the waiting rules until the creator-controlled setting is built. Results
  visibility is the creator's choice: Team Hub and Creator Pro creators may choose live results for elections and any
  survey type, and respondents are always told before they answer (founder, 2026-11-13; design in
  `docs/v2/LAUNCH_PREP_PLAN_2026-11-13.md`, not built yet). Trends allowance: Creator Plus 5, Creator Pro 10 (founder, 2026-11-13). Other Creator perks are not approved yet.
- Free Quick Survey: $0 for any signed-in account. 5 active surveys, 10
  questions, core kinds, link or invite-only; lives in a personal space that is
  never a Hub. The launch waitlist is never authorization.
- Taxes are calculated by Stripe Tax, never by our own code. Cancelling a Hub
  plan keeps access to the end of the paid period and deletes nothing.
- Hub Name Reservation ("Reserve your Hub URL"): $25 per 12 months, $25 renewal,
  25-day grace (ACTIVE, GRACE, RELEASED). Grants no features.
- The Owner is protected and does not consume a custom-role slot.
- Thresholds count unique eligible members only: no guests, duplicates or bots.
- Expired paid access fails closed for premium actions and never deletes
  customer data.

## Mandatory Agent Startup

1. Read both `AGENTS.md` and `CLAUDE.md`; stop if they differ.
2. Read the canonical master spec and the newest entries in `CHANGELOG.md`
   before changing code.
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
- Work is split between a UI thread and a backend thread. The backend owns
  migrations, RLS, `lv_api`, identity, entitlements and the shared and backend
  docs (including this file). The UI owns the frontend and its docs. Coordinate
  contract changes through `docs/backend/API_CONTRACT.md`.

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
  A passing local test never authorizes deploying or mutating production.
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

## Frontend Design Protocol

Applies whenever a task creates or changes UI a person sees. Backend, SQL, Edge Function, documentation-only and
infrastructure tasks skip it. It sits inside the startup, scope and Git rules above; it never widens them.

1. Inspect the components the change touches and the component map in `docs/frontend/design-system/README.md`.
2. Follow the `design-system` skill (tokens from `src/ui/tokens.css` only; reuse before building).
3. Follow `frontend-design` when creating a screen or flow, or significantly polishing one.
4. Follow `design-element-authoring` only when a genuinely new reusable component or design standard is needed.
5. Check light, dark and high contrast at 390, 768 and 1280, keyboard focus and reduced motion; look at a screenshot.
6. Register reusable components at `/__gallery` and in the component map; `npm run check:design` must pass.
7. Confirm no global standard changed silently. New token values, brand, type or global rules need founder approval
   (`docs/frontend/design-system/DESIGN_EXTENSIONS.md`).

The skills live in `.agents/skills/` (Codex) and `.claude/skills/` (Claude Code), kept identical by
`npm run skills:sync`. Both agents load them automatically from their descriptions; to call one explicitly, Claude Code
uses `/design-system`, `/frontend-design`, `/design-element-authoring` and Codex uses `$design-system` (or `/skills`).

## Architecture and Security Contracts

- Hub URLs are path-based: `https://lunchvoice.com/{hubSlug}`. There is no
  subdomain-per-tenant scheme. The immutable Hub id is separate from its slug;
  authorization uses the id, never the slug.
- The frontend uses `lv_api` only. It never reads or writes application tables
  directly, and mocks are development-only.
- The database schema is a fresh SaaS model: schemas `lv` (private) and
  `lv_api` (the only exposed surface). The canonical chain is
  `supabase/migrations/0000NN_v2_*.sql`, installed on a blank database and
  proven by `scripts/db-test-canonical.sh`, which also rehearses every rollback
  in `supabase/rollbacks/`. Do not add migrations that reference v1 tables.
- Application failures return `{ok:false, error:{code, message, ...}}`. Only
  truly unexpected faults are exceptions. The error codes are listed in
  `docs/backend/API_CONTRACT.md`.
- Reserved route names live in `lv.reserved_slugs` and are enforced by the
  database; no customer name is ever reserved. Concurrent slug claims must be
  safe.
- Keep RLS enabled on every exposed table. Use explicit Data API grants. Views
  must use `security_invoker = on`. Never expose a service-role or secret key to
  frontend code.
- Authorization data belongs in database state, never in editable user
  metadata. Enforce roles, capabilities and entitlements on the server; UI
  disabling is not authorization.
- Anonymous means the creator-facing data cannot resolve the respondent. Keep
  eligibility proof and answers separate. Suppressed or withheld analytics are
  never reported as zero.
- Guests do not create membership, do not count toward member totals or
  thresholds, and cannot see private Hub content.
- Never delete responses or private data to resolve an over-limit or unpaid
  state. A released slug must never expose a prior owner's data.
- Create migrations with `supabase migration new` or the numbered canonical
  convention; review and test them before applying. Applying anything to
  production needs the approved runbook (`docs/backend/PRODUCTION_RESET_RUNBOOK.md`)
  and explicit owner approval.

## Change Discipline

- Make the smallest coherent change and verify it proportionally to risk.
- Update `CHANGELOG.md` under `[Unreleased]` in the same commit as the change.
- Keep this file and `CLAUDE.md` identical. If brain guidance changes, edit both
  in the same commit and verify with `npm run check:brain`.
- Never write documentation that tells an agent to preserve, migrate, backfill
  or bridge v1, or that treats LionCafe or MJCC as an existing v2 tenant.
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
available project-specific integration checks. Database changes also require a
passing `scripts/db-test-canonical.sh`, which needs Docker.

## Definition of Done

- `npm run check:brain`
- `npm run build`
- Relevant focused/integration checks pass (`scripts/db-test-canonical.sh` for
  database work).
- `CHANGELOG.md` describes the change.
- `AGENTS.md` and `CLAUDE.md` are identical.
- No v1 dependency, customer-specific hardcoding or secret is introduced, and no
  generated file is staged by accident.
- The handoff states what is ready, linked, blocked, and the next command.
