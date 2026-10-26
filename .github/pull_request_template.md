## Summary

<!-- What changed and why, in two or three sentences. Link the roadmap slice or spec section. -->

## Scope

- [ ] One reviewable slice. Backend and UI changes are in separate PRs unless the contract change needs both.
- [ ] Base branch is `main`. A stacked PR names its parent PR here and is retargeted to `main` after the parent merges.

## Checks (all required)

- [ ] `npm run check:brain` (AGENTS.md and CLAUDE.md are byte-identical)
- [ ] `npm run test:pr` passes
- [ ] `bash scripts/db-test-canonical.sh` passes for any change under `supabase/` (new migrations have a rollback and tests)
- [ ] `CHANGELOG.md` has an entry under `[Unreleased]`

## v2 rules

- [ ] No v1 dependency, and nothing preserves, migrates or bridges v1
- [ ] No LionCafe, MJCC or other customer-specific Hub, owner, role, slug, route, copy or fixture
- [ ] Expected API failures return `{ok:false, error:{code, message}}`; `docs/backend/API_CONTRACT.md` is updated for any `lv_api` change
- [ ] Roles, capabilities and entitlements are enforced on the server, not only in the UI
- [ ] No mock or simulated sign-in can activate in a production build
- [ ] No secrets, tokens or generated files are included

## Production impact

<!-- State "None" or exactly what would change in production and what approval covers it. A merged PR never applies a migration or deploys by itself. -->
