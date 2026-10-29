# Frontend worker handoff

Canonical source: the master spec (2026-10-25) and `docs/frontend/FRONTEND.md`. The backend
worker has its own handoff; this file covers the frontend only.

## Location and state

- Worktree `~/projects/lunchvoice-wt/ui`, branch `feat/v2-ui`, based on
  `feat/v2-canonical-baseline`.
- Local only: nothing pushed, no PR, nothing deployed. Ask before pushing.

## Founder reset (do not relitigate)

- V1 is retired and not migrated. Do not restore v1 UI, `Gate`, `AuthProvider`, MJCC SSO,
  `/LionCafe` redirects or subdomain tenants.
- Do not build LionCafe, MJCC pages, questions, branding, routes or a December Campaign.
  The real manager creates it later through the public flow.

## Done

v1 removed; route shell; typed `lvApi`; mock transport; reserved-slug check with tests;
simulated sign-in (mock only); `/me` with Hub list, create Hub and join-by-code; Hub shell
and placeholder Campaign and analytics pages; frontend docs reset to v2.

## Next slice

1. Design system (`src/ui/`): tokens (light and dark), type, primitives, then a dev-only
   component gallery. Cover the list in `DESIGN.md`.
2. Wire the read APIs from `feat/v2-read-api` (`lv_hub_get`, `lv_campaign_list`,
   `lv_campaign_get`, `lv_member_list`, `lv_invite_list`, `lv_invite_preview`,
   `lv_beta_status`, expanded `lv_my_context`) once the backend thread says they are final.

## Rules

Use `lv_api` only. Mocks are dev-only with a replacement path. Entitlements and permissions
are enforced by the backend. Do not invent the Campaign Plus price. Suppressed is not zero.
Commit reviewable slices locally. Do not deploy or merge.

## Report format

Branch, commit, PR if opened, screenshots, design-system status, `lv_api` operations
wired, mocks remaining, tests, accessibility and mobile status, blockers, next slice.
