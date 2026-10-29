# LunchVoice v2 — frontend

LunchVoice is a multi-tenant SaaS for interactive community feedback. People sign in with
Google through KpnIdentity, create or join **Hubs**, and run **Campaigns** (surveys, polls,
ratings, elections and other modes) with privacy-safe analytics. Dining is one use case,
not the product.

V1 (the cafeteria app, its users, data and tenant model) is retired and is **not**
migrated. The canonical product definition is
`docs/v2/LunchVoice_v2_CANONICAL_MASTER_SPEC_2026-10-25.md` (owned by the backend thread).
The frontend contract is `docs/frontend/FRONTEND.md`.

## Local development

```bash
cp .env.example .env     # optional: with no Supabase env the UI runs on the dev-only mock API
npm install
npm run dev
```

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | the v2 `lv_api` backend. Without both, the in-memory mock is used |
| `VITE_LV_MOCK=1` | force the mock even when the variables are set |
| `VITE_KPNIDENTITY_ISSUER` | KpnIdentity issuer URL; enables the real sign-in flow when it exists |

The mock and the simulated sign-in are development tools. They must never be reachable in a
production build that has the real variables set (`src/lib/transport.ts`).

## Checks

```bash
npm run build         # tsc -b && vite build
npm run test:unit     # src/lib/*.test.ts
npm run test:scripts  # release-policy and bundle-check scripts
npm run check:bundle  # build contains the lv_api markers
npm run check:brain   # AGENTS.md and CLAUDE.md are byte-identical
```

## Rules for contributors

- All application data goes through `lv_api` functions. No direct table access.
- Never hardcode a customer Hub (no LionCafe, no MJCC). Customers create their own Hubs.
- Authorization is the backend's job. The UI hides or disables controls for clarity only.
- Update `CHANGELOG.md` with every meaningful change.
