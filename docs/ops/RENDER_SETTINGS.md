# Render settings for the LunchVoice site (the live truth)

`render.yaml` is **not connected** to Render (no Blueprint exists), so editing it changes nothing in production. The site's
routing, headers and build settings live inside the Render service and are changed through the Render API (Composio
toolkit `render`). This file records what they are, what was changed and when, and how to undo it. Changing Render
settings needs the founder's go-ahead.

## The service

| Item | Value |
| --- | --- |
| Dashboard name | **Lunchvoice** (static site; `render.yaml` still says `lunch-line-survey`, which is not used) |
| Service id | `srv-d92o4cmrnols73fkioa0`; default address `interact-3npi.onrender.com` |
| Source | GitHub `KpnSolute/Lunchvoice`, branch `main`, auto-deploy once checks pass; pull-request previews off |
| Build | `npm install; npm run build`, publish directory `dist` (not Docker) |
| Custom domains | `lunchvoice.com` and `www.lunchvoice.com` (redirects to the apex), both verified. Keep it at two: Render charges per domain beyond a plan's allowance (`SERVICES_AND_DEPENDENCIES.md` section 2a) |

## Header rules (8, all verified live 2026-11-13; they match `render.yaml`)

| Path | Header | Value |
| --- | --- | --- |
| `/*` | Content-Security-Policy | `default-src 'self'; script-src 'self' 'sha256-kU0Cb4JIx44Xq6Y1Z0qnsT36nfN1wDLltqHWX/KPdyQ='; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://qprfonxvthmaoxfixigk.supabase.co https://axzwdbizblfkspduqilj.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; manifest-src 'self'; worker-src 'self'; upgrade-insecure-requests` |
| `/*` | Strict-Transport-Security | `max-age=31536000; includeSubDomains` |
| `/*` | X-Content-Type-Options | `nosniff` |
| `/*` | Referrer-Policy | `strict-origin-when-cross-origin` |
| `/*` | Permissions-Policy | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()` |
| `/*` | X-Frame-Options | `DENY` |
| `/assets/*` | Cache-Control | `public, max-age=31536000, immutable` (Vite fingerprints every file there) |
| `/version.json` | Cache-Control | `no-store` (the update notice polls it) |

The theme pre-paint script's hash in the CSP must be recomputed if that script in `index.html` changes (runbook:
`docs/backend/PRODUCTION_RESET_RUNBOOK.md`). A new outside origin, such as the sign-in Worker `https://auth.lunchvoice.com`,
must be added to `connect-src` here, not in `render.yaml`.

## Rewrite rules (31, in this order; the first match wins)

| Priority | Source | Serves |
| --- | --- | --- |
| 0 to 10 | `/`, `/how-it-works`, `/use-cases`, `/pricing`, `/waitlist`, `/about`, `/discover`, `/support`, `/privacy`, `/terms`, `/guidelines` | each page's prerendered `index.html` |
| 11 to 20 | the ten `/use-cases/<slug>` pages | their prerendered `index.html` |
| 21 to 27 | `/products` and the six `/products/<slug>` pages | their prerendered `index.html` |
| 28 | `/templates` | `/templates/index.html` |
| 29 | `/templates/:slug` | `/templates/:slug/index.html` (covers all 12 category pages and 82 template pages) |
| 30 | `/*` | `/app.html`, the app shell for every route that is not a prerendered page |

**A new prerendered page needs a rewrite before `/*`**, or visitors without a trailing slash get the generic app shell
(and search engines see no page-specific title). Template and category pages are covered by rule 29. Any other new
indexable page needs its own rule or a placeholder rule like it. `npm run build` prerenders pages into `dist/<path>/index.html`
(`scripts/seo-prerender.mjs`); the pages only ever worked at the trailing-slash address until a rewrite existed.

## Change log

**2026-11-13, founder go-ahead ("Yes, apply it").** Found that production's rules were an old copy of the file's:
5 header rules (HSTS without `includeSubDomains`) and 29 rewrites, none for `/templates`, so the template gallery and all
95 of its pages served the generic app shell. Applied through the Render API:

1. Added rewrite `/templates/:slug` to `/templates/:slug/index.html` at priority 28 (rule `rdr-dbru9don74is738aoar0`), tested
   alone on live pages first, then added `/templates` to `/templates/index.html` at priority 28 (rule
   `rdr-dbru9l8n74is738ap2s0`). Order verified: both sit before `/*`.
2. Replaced the header rules (`RENDER_UPDATE_HEADERS`) with the 8 above: the 5 existing rules unchanged except HSTS, plus
   `X-Content-Type-Options`, the `/assets/*` cache rule and the `/version.json` no-store rule.

Verified live afterwards: `/templates`, a category page and template pages return their own titles; `/`, `/pricing`,
`/products/hubs`, `/use-cases/event-feedback-form`, `/how-it-works` unchanged; app routes (`/c/ABC123`, `/surveys/new`) and
unknown paths still get the app shell; all six headers match the file byte for byte; `/version.json` answers `no-store`
and the hashed asset answers `immutable`.

## Rollback

1. Delete the two added rules with `RENDER_DELETE_ROUTE` (ids above). Template pages then fall back to the app shell, as before.
2. Restore the previous headers with `RENDER_UPDATE_HEADERS` using only these 5 rules, all on `/*`: the same
   Content-Security-Policy, `Strict-Transport-Security: max-age=31536000`, `Referrer-Policy: strict-origin-when-cross-origin`,
   the same Permissions-Policy, and `X-Frame-Options: DENY`.

Note on HSTS: `includeSubDomains` makes a visitor's browser require HTTPS on every `lunchvoice.com` subdomain for a year.
Every current and planned hostname (`hub`, `pay`, `auth`, `create`) is served by Cloudflare over HTTPS, so none is affected.
There is no `preload`.

## Quick drift check

```bash
curl -sI https://lunchvoice.com | grep -iE "strict-transport|content-security|x-frame"
curl -sI https://lunchvoice.com/version.json | grep -i cache-control        # expect no-store
curl -s https://lunchvoice.com/templates/event-feedback | grep -o "<title>[^<]*"   # expect the template's own title
```
