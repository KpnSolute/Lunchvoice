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

## Architecture and Security Contracts

- Tenant routing is path-based: `/:orgSlug/...`.
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
- Do not deploy functions, apply migrations, change Render settings, or push
  releases without the authority and credentials required for that operation.

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
