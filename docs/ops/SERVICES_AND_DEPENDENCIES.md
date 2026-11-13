# LunchVoice services and dependencies log

Everything that runs LunchVoice, what it does, and where to find or manage it: in Composio, in an MCP server, or outside
(a dashboard you log into). Written 2026-11-13 for launch planning. Update it in the same commit as any change to a
service, a deploy target, a secret name or a dependency.

**No secret values live here.** Secrets are named, never shown. The Supabase *publishable* key is public by design and
ships in the website's JavaScript; no other key belongs in the repository. Account emails and IDs are left out on
purpose: look them up in the dashboard or in Composio.

How each row was checked:

- **Verified 2026-11-13**: read live today (Composio connection list, Supabase and Cloudflare tools).
- **Repo**: read from files in this repository; the live service was not queried.
- **Confirm**: not knowable from the repo or the tools; the founder (or whoever owns the account) confirms.

## 1. Request path, in one picture

```
visitor ──► Cloudflare (DNS for lunchvoice.com, proxied)
              ├─► Render static site "lunch-line-survey"  ──► the React app (HTML/JS/CSS from /dist)
              │        browser then calls:
              │          • Supabase "Lunchvoice" (qprfonxvthmaoxfixigk): Data API (lv_api functions) + 7 Edge Functions
              │          • KpnIdentity (Supabase project axzwdbizblfkspduqilj, issuer auth.kpnsolute.com): sign-in
              └─► hub.lunchvoice.com ─► Cloudflare Worker "lunchvoice-hub-card" ─► Supabase (lv_hub_get): share-link previews
Stripe, Resend and Discord talk to Supabase Edge Functions (checkout / billing-webhook, email-dispatch, discord).
```

## 2. Services

| Service | What it does for LunchVoice | Identifier (non-secret) | Where to find it | Status |
| --- | --- | --- | --- | --- |
| **GitHub** | Source of truth, pull requests, CI (`pr-checks`, `version-release`: tags every `main` commit `X.X.X`) | `KpnSolute/Lunchvoice` | Composio toolkit `github` (three connections, all the same GitHub user; use the default). External: github.com | Verified 2026-11-13 |
| **Render** | Hosts the website as the static site `lunch-line-survey` (build `npm ci && npm run build`, publish `dist`, security headers and rewrites in `render.yaml`). A push to `main` deploys it. Wildcard tenant host `*.lunchvoice.com` is bound here (brain files) | service `lunch-line-survey` | Composio toolkit `render` (active). The Render MCP needs a workspace chosen first; pick it with the owner, never guess. External: dashboard.render.com | Connection verified; service state Confirm |
| **Supabase: Lunchvoice** | The whole backend: Postgres (`lv` private schema, `lv_api` the only exposed one), RLS, Storage, 7 Edge Functions. This is the MJCCv2 project and the only deployment target | project ref `qprfonxvthmaoxfixigk` | Composio toolkit `supabase`, alias **Lunchvoice**. MCP server `lunchvoice` (`.mcp.json`, token in gitignored `.mcp.env`). External: supabase.com/dashboard | Verified 2026-11-13 |
| **Supabase: KpnIdentity** | Shared KpnSolute sign-in (one account across LunchVoice, Aftercard, KpnCompute). Not this repo's deploy target | project ref `axzwdbizblfkspduqilj`, issuer `https://auth.kpnsolute.com` | Composio toolkit `supabase`, alias **KpnIdentity**. MCP server `kpnauth`. External: supabase.com/dashboard | Connection verified; settings B1 to B6 Confirm |
| **KpnAuth** (sign-in screen) | The branded front door people see when signing in | `auth.kpnsolute.com` | Separate repository (not this one). Hosting target Confirm | Confirm |
| **Cloudflare** | DNS for `lunchvoice.com`; the `lunchvoice-hub-card` Worker; planned home for every other edge need (see section 6) | Worker `lunchvoice-hub-card` (deployed, last changed 2026-11-12), custom domain `hub.lunchvoice.com` | Composio toolkits `cloudflare_api_key` (active), `cloudflare_mcp`, `cloudflare_browser_rendering`. This session's Cloudflare MCP (Workers and bindings; marked deprecated in favour of the full Cloudflare API server). External: dash.cloudflare.com | Verified 2026-11-13 |
| **Resend** | Transactional email only (waitlist, Hub created, invites, reservation, orders). Domains `lunchvoice.com` and `kpnsolute.com` are verified, sending enabled, open and click tracking off | domains above | Composio toolkit `resend` (the account is shared with other KpnSolute products). External: resend.com | Domains verified 2026-11-13; `RESEND_API_KEY` set in Supabase? Confirm |
| **Stripe** | Checkout Sessions, Customer Portal, webhooks, Stripe Tax. Billing fails closed until keys are set (`lv_billing_unavailable`) | Stripe account whose dashboard name is **Lunchvoice** | Composio toolkit `stripe` has three accounts (**Lunchvoice**, Aftercard, Papercliped Connect): LunchVoice must always use the one named Lunchvoice. External: dashboard.stripe.com | Connection verified; test or live mode, products and keys Confirm |
| **Discord** | The LunchVoice bot: `/lunchvoice` commands, campaign posting. First-class pairing ("Discord is for discussion. LunchVoice is for deciding.") | application and guild IDs in function secrets | **Not in Composio.** External: discord.com/developers (bot avatar and banner are uploaded there by hand) | Function deployed; secrets and portal Confirm |
| **Google Cloud (OAuth app)** | The "Continue with Google" sign-in that KpnIdentity uses. The app is still to be renamed "KpnSolute" | OAuth client under the KpnSolute Google project | **Not in Composio.** External: console.cloud.google.com | Confirm |
| **Domain registrar** | Owns the `lunchvoice.com` registration; nameservers point at Cloudflare | none in the repo | External only | Confirm which registrar |
| **Google Workspace docs** | Founder specs: "Project Profile - LunchVoice V2", "Survey Templates and Survey UI", "Trends and Creator Plans", the roadmap | read by title | Composio toolkits `googledocs`, `googledrive`, `gmail` (Gmail has two accounts: pass the account explicitly) | Verified 2026-11-13 |
| **Google Search Console** | SEO for the public pages and `/templates` | `lunchvoice.com` property | Composio toolkit `google_search_console` | Connection verified; property Confirm |
| **Canva** | Brand kit ("LunchVoice Brand Kit" folder) for social and video | none | Composio toolkit `canva`. The kit page itself is finished by hand | Connection verified |

### Planned, not adopted yet

| Service | Why | Needs |
| --- | --- | --- |
| **PostHog Cloud** (free tier) | Product analytics, cookieless, events only (founder brief 2026-11-12) | Owner creates the account and connects it in Composio; CSP gains PostHog's domain |
| **Cloudflare Workers for edge needs** | Session cookie proxy, share images and anything else at the edge (decision D-01 in `docs/v2/LAUNCH_PREP_PLAN_2026-11-13.md`) | Nothing more: standing approval, each use logged in section 6 |
| **Sentry** (free) | Error tracking | Account, DSN, CSP |
| **Cloudflare Turnstile** | Invisible bot check on sign-up and guest answers | Site key in the Cloudflare dashboard, CSP, server verification |
| **Uptime monitor** (UptimeRobot or Better Stack) | Alerts and a status page | Account |
| **Tremendous or Tango Card** | Respondent rewards, v2.1 only | After launch |

## 3. Supabase Edge Functions (deployed, Verified 2026-11-13)

All seven are `ACTIVE`, with `verify_jwt` off (`supabase/config.toml`). Merging to `main` does **not** redeploy them:
Render deploys the website, functions are deployed separately.

| Function | Job | Version | Last deployed |
| --- | --- | --- | --- |
| `session` | Exchanges a KpnIdentity ID token for a LunchVoice session (single-use) | 15 | 2026-11-08 |
| `checkout` | Creates Stripe Checkout Sessions; fails closed without keys | 13 | 2026-11-08 |
| `billing-webhook` | Receives Stripe events, grants and revokes entitlements, idempotent | 13 | 2026-11-08 |
| `email-dispatch` | Sends the transactional outbox through Resend | 14 | 2026-11-11 |
| `api` | The public REST API and API keys | 9 | 2026-11-08 |
| `discord` | Discord interactions and campaign posting | 11 | 2026-11-10 |
| `webhook-dispatch` | Outbound webhooks to Hub-owned endpoints | 9 | 2026-11-08 |

Edge Functions run Deno and import `jose` (`supabase/functions/deno.json`) plus `postgres` for direct database calls.

## 4. Database facts that matter for operations

- **Applied migrations** (Verified 2026-11-13): `000001` to `000053`, except `000009` (a gap) and `000049` (reserved for
  device sessions, not built). Production also runs seven migrations that are **not on `main`**: `000029` to `000032`
  and `000036` to `000038` (open PRs #59 and #73). Reconcile before launch (see the prep plan).
- **Backups** (from `CHANGELOG.md`): one daily physical backup; point-in-time recovery is **off**. Decide before launch.
- **Storage buckets** (Verified 2026-11-13): `survey-logos` (1 MB), `survey-covers` (3 MB), `survey-uploads` (10 MB), all
  private, reads and writes only through RLS helper functions.
- **Migration apply procedure**: Supabase Management API, one transaction per file, then correct the history version
  (`docs/backend/PRODUCTION_RESET_RUNBOOK.md`). The founder's standing rule: apply once tests pass; record each apply
  in `CHANGELOG.md`.

## 5. Secrets and configuration (names only)

| Name | Where it is set | Used by | Notes |
| --- | --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Render environment (build time) | the website | Public by design. A build without them fails closed |
| `VITE_KPNIDENTITY_ISSUER` | Render environment (build time) | sign-in | e.g. `https://auth.kpnsolute.com` |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DB_URL` | Supabase function secrets (the last is automatic) | Edge Functions | |
| `LV_ALLOWED_ORIGINS` | Supabase function secrets | `session` CORS allow-list | defaults to the two lunchvoice.com origins |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Supabase function secrets | `checkout`, `billing-webhook` | Not set means billing stays closed. Confirm |
| `RESEND_API_KEY` | Supabase function secrets | `email-dispatch` | Not set means mail stays queued. Confirm |
| `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `DISCORD_GUILD_ID` | Supabase function secrets | `discord` | Confirm |
| `LUNCHVOICE_SUPABASE_ACCESS_TOKEN`, `KPNIDENTITY_SUPABASE_ACCESS_TOKEN`, `RENDER_API_KEY` | gitignored `.mcp.env` (per developer) | MCP servers `lunchvoice`, `kpnauth`, Render | Never share one token between the two Supabase servers |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | `workers/hub-card/wrangler.toml` `[vars]` | hub-card Worker | Public by design |

## 6. Cloudflare usage log

Every use of Cloudflare for LunchVoice is recorded here (founder instruction 2026-11-13: use Workers for LunchVoice's
edge needs without asking each time, and log each use). This does not cover a paid plan change, changing nameservers or
the registrar, or touching another product's Workers: the same account also holds `papercliped-*` and `kpnsolute-*`
Workers, which are not LunchVoice's.

| Date | Use | Status |
| --- | --- | --- |
| 2026-11-12 | `lunchvoice-hub-card` Worker on custom domain `hub.lunchvoice.com`: share-link previews for Hubs | Live, Verified 2026-11-13 |
| 2026-11-13 | Decision: the 30-day sign-in cookie is served by a Worker on `auth.lunchvoice.com` | Planned, builds the week of 2026-11-16 |

## 7. JavaScript dependencies (`package.json`, Node 22.12 or newer; lockfile `package-lock.json`)

Where to find any of them: npmjs.com. Versions are exactly what `package.json` says; `npm ci` installs the lockfile's.
`npm audit --audit-level=high` reported no high findings at the last check (2026-11-13).

**Shipped to the browser**

| Package | Used for |
| --- | --- |
| `react`, `react-dom` 18.3 | the interface |
| `react-router-dom` 6.30 | routing |
| `@supabase/supabase-js` 2 | Data API calls and the browser client |
| `radix-ui` | accessible primitives (dialogs, tabs, menus) under the shadcn components |
| `class-variance-authority`, `cn` | component variants and class joining |
| `lucide-react` | icons |
| `sonner` | toasts, including the "new version ready" notice |
| `recharts` 3.10.1 | charts, loaded lazily, wrapped by our `Lv*` chart components |
| `qrcode` | QR codes for sharing and Present mode |
| `input-otp` | one-time-code field |
| `tw-animate-css` | animation utilities |
| `@fontsource-variable/bricolage-grotesque`, `@fontsource-variable/geist`, `@fontsource/space-mono` | fonts, **self-hosted** (no font CDN; the CSP allows `font-src 'self'` only) |

**Build and test only**

| Package | Used for |
| --- | --- |
| `vite` 8, `@vitejs/plugin-react`, `typescript` 5.6 | build and types |
| `tailwindcss` 4, `@tailwindcss/vite` | styling |
| `tsx` | runs the TypeScript unit and function tests |
| `playwright` | the browser (e2e) suite |
| `jose` | token handling in tests and Edge Functions |
| `shadcn` 4.23 | component generator (also wired as the `shadcn` MCP server) |
| `@types/*` | type definitions |

## 8. Tooling around the code

| Tool | Used for | Where |
| --- | --- | --- |
| GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`) | PR checks and the version and tag pipeline | `.github/workflows/` |
| Docker with `postgres:15-alpine` | the canonical database suite (`scripts/db-test-canonical.sh`), rollback rehearsal | local and CI |
| Supabase CLI 2.x | migrations and local database | `~/bin/supabase` |
| `wrangler` 4 (via `npx`) | builds the Worker bundle (deploys go through the Cloudflare API in Composio) | `workers/hub-card/` |
| Playwright Chromium | the e2e suite | `npx playwright install chromium` |
| `ctx7` CLI (Context7) and `gh` | current library docs; GitHub from the terminal | CLI |
| Composio | one place for the connections above; used by agents to read and change services | composio dashboard; toolkits listed in section 2 |
| MCP servers in this repo | `lunchvoice` (Supabase), `kpnauth` (Supabase), `shadcn` | `.mcp.json` |

## 9. Open items for the founder (nothing here blocks planning)

1. Which registrar holds `lunchvoice.com`, and who can log in.
2. Which Render workspace the service lives in (pick it in the Render MCP once).
3. Stripe: test or live mode, which products exist, whether the two function secrets are set.
4. Whether `RESEND_API_KEY` and the three Discord secrets are set in Supabase.
5. The Google OAuth app rename and whether KpnIdentity settings B1 to B6 are applied.
6. Where KpnAuth is hosted and who deploys it.
7. PostHog account (and Sentry, Turnstile, uptime) when you want them.
