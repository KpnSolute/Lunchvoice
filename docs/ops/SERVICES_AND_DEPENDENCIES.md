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
| **Render** | Hosts the website as a **static site** (free to host: Render's pricing page says "Deploy websites for free, forever"). Auto-deploys on every push to `main` once checks pass. Custom domains on it: `lunchvoice.com` and `www.lunchvoice.com` (redirects to the apex), both verified, **nothing else** | dashboard name **Lunchvoice**, service `srv-d92o4cmrnols73fkioa0`, default URL `interact-3npi.onrender.com` (`render.yaml` still says `lunch-line-survey`) | Composio toolkit `render` (active; it read the service and its domains today). The workspace is shared with the `kpnsolute-*`, `KpnCompute`, `MJCC-*` and other services. The Render MCP needs a workspace chosen first; pick it with the owner. External: dashboard.render.com | Verified 2026-11-13. The dashboard build command is `npm install; npm run build`, not the file's `npm ci && npm run build`; most of the file's headers are live, not all (section 2a) |
| **Supabase: Lunchvoice** | The whole backend: Postgres (`lv` private schema, `lv_api` the only exposed one), RLS, Storage, 7 Edge Functions. This is the MJCCv2 project and the only deployment target | project ref `qprfonxvthmaoxfixigk` | Composio toolkit `supabase`, alias **Lunchvoice**. MCP server `lunchvoice` (`.mcp.json`, token in gitignored `.mcp.env`). External: supabase.com/dashboard | Verified 2026-11-13 |
| **Supabase: KpnIdentity** | Shared KpnSolute sign-in (one account across LunchVoice, Aftercard, KpnCompute). Not this repo's deploy target | project ref `axzwdbizblfkspduqilj`, issuer `https://auth.kpnsolute.com` | Composio toolkit `supabase`, alias **KpnIdentity**. MCP server `kpnauth`. External: supabase.com/dashboard | Connection verified; settings B1 to B6 Confirm |
| **KpnAuth** (sign-in screen) | The branded front door people see when signing in | `auth.kpnsolute.com` | Separate repository (not this one). Hosting target Confirm | Confirm |
| **Cloudflare** | DNS for `lunchvoice.com`; the `lunchvoice-hub-card` Worker; planned home for every other edge need (see section 6) | Worker `lunchvoice-hub-card` (deployed, last changed 2026-11-12), custom domain `hub.lunchvoice.com` | Composio toolkit `cloudflare_api_key` shows **active but its token is rejected for zone and DNS calls** (error 9109 on 2026-11-13): reconnect it before any DNS work. Workers are readable and deployable through this session's Cloudflare MCP (works; marked deprecated in favour of the full Cloudflare API server). `cloudflare_mcp` and `cloudflare_browser_rendering` are also connected. External: dash.cloudflare.com | Workers verified 2026-11-13; DNS records, plan and HSTS setting Confirm (read DNS from outside in section 2a) |
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

## 2a. Hostnames, routing and cost

**Cost principle (founder, 2026-11-13): LunchVoice is built at the lowest possible cost.** What follows from it:

1. **No new Render custom domains.** Render includes a fixed number per workspace (2 on Hobby, 15 on Pro, 25 on Scale)
   and charges **$0.25 a month for each beyond that** (Render docs, read 2026-11-13). The LunchVoice site needs exactly
   two, `lunchvoice.com` and `www`, and stays at two. The workspace is shared with other KpnSolute services whose
   domains count against the same allowance.
2. **Every new hostname goes through Cloudflare**, which already fronts the site: a Worker on a Custom Domain (the
   `hub-card` pattern) or a Redirect Rule. Neither touches Render. Workers has a free tier with a daily request limit;
   check the zone's plan and that limit before a Worker carries real traffic.
3. Prefer free tiers. Any paid item is added to the cost ledger below, with who approved it.
4. **There is no wildcard DNS.** A made-up subdomain does not resolve (checked 2026-11-13), so every hostname is added
   on purpose. Hub URLs are paths (`lunchvoice.com/{hubSlug}`), not subdomains.

**Hostnames, read from outside on 2026-11-13** (public DNS and the HTTP answers; the Composio Cloudflare token cannot
read the zone, see section 2):

| Hostname | Today | Planned routing | Render domain? | Extra cost |
| --- | --- | --- | --- | --- |
| `lunchvoice.com` | Proxied by Cloudflare to Render, HTTP 200: the site | Unchanged | yes (1 of 2) | none |
| `www.lunchvoice.com` | Proxied, answers 301 to the apex | Unchanged | yes (2 of 2) | none |
| `hub.lunchvoice.com` | Cloudflare Worker `lunchvoice-hub-card`; the bare host redirects to `/discover` | Unchanged: Hub share previews | no | none |
| `auth.lunchvoice.com` | **Does not exist** (no DNS record) | Worker on a Custom Domain: the 30-day sign-in cookie proxy (week of 2026-11-16, `docs/v2/LAUNCH_PREP_PLAN_2026-11-13.md` section 3) | no | none |
| `create.lunchvoice.com` | **Does not exist** | A Cloudflare Redirect Rule to `lunchvoice.com/create`: no code, and sign-in stays on one host. If the creator app ever needs its own look at that address, a Worker that serves the same site through Render's default `onrender.com` address. Never a Render domain | no | none |
| `pay.lunchvoice.com` | Resolves through Cloudflare but answers **404**; what it was set up for is Confirm | A Worker: a stable address for the Stripe webhook and checkout and portal return handling, forwarding to the `billing-webhook` and `checkout` functions. Not Stripe's custom domain for hosted pages, which is a separate paid Stripe add-on (check its price before ever choosing it) | no | none |
| any other `<name>.lunchvoice.com` | Does not resolve | Stays unrouted | no | none |

`auth.kpnsolute.com` and the other `kpnsolute.com` hosts belong to KpnSolute's own sites, not to LunchVoice.

**Cost ledger** (target: as close to $0 recurring as the product allows; fill in the Confirm rows):

| Item | Cost model | Today | Action |
| --- | --- | --- | --- |
| Render static-site hosting | Free ("Deploy websites for free, forever") | Free | none |
| Render workspace plan | Per workspace, shared with other KpnSolute services; sets the included custom domains | Confirm the plan | Keep LunchVoice at 2 domains |
| Render custom domains beyond the allowance | $0.25 a month each | None added by LunchVoice | Never add one |
| Cloudflare DNS and Workers | The free plan includes Workers with a daily request limit | Confirm the plan | Check the limit before the sign-in Worker goes live |
| Supabase, Lunchvoice project | By plan; point-in-time recovery is a paid add-on | Confirm the plan; recovery is off | Decide cost against risk (prep plan) |
| Resend | Free tier, then per email | Confirm the plan | none |
| Stripe | Per-transaction fees; Stripe Tax and Stripe Billing add their own fees | Not live | Price it before turning on Tax and Billing |
| PostHog | Free tier (1M events a month) | Not adopted | Stay inside the free tier |
| Composio | By plan | Confirm the plan | none |
| Domain registration | Yearly | Confirm the registrar | none |

**Header check, read live 2026-11-13.** The site answers with the security headers from `render.yaml` (CSP, X-Frame-Options,
nosniff, Referrer-Policy, Permissions-Policy), with two differences from the file: HSTS is `max-age=31536000` **without**
`includeSubDomains`, and `/assets/*` and `/version.json` answer `public, max-age=0, s-maxage=300`, not the file's
`immutable` and `no-store`. The likely cause is Cloudflare's own HSTS and cache settings in front of Render (or the
Blueprint not applying path rules). Free Cloudflare fixes: a Cache Rule (long cache on `/assets/*`, bypass on
`/version.json`) and the HSTS setting. Needs the Cloudflare token reconnected. A prep item in the launch plan.

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
| 2026-11-13 | Decision: `create.lunchvoice.com` is a Cloudflare Redirect Rule (or a Worker), never a Render custom domain (cost principle, section 2a) | Planned |
| 2026-11-13 | Proposal: `pay.lunchvoice.com` is a Worker for the Stripe webhook and return handling, not Stripe's paid custom-domain add-on | Proposed (question Q13 in the launch plan) |
| 2026-11-13 | Proposal: Cloudflare Cache Rules for `/assets/*` and `/version.json`, and the HSTS include-subdomains setting | Proposed; needs the token reconnected |

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
2. Which Render workspace plan you are on (it sets how many custom domains are included: 2 Hobby, 15 Pro, 25 Scale;
   each extra is $0.25 a month). Also reconnect the Cloudflare connection in Composio (its token is rejected for DNS).
3. Stripe: test or live mode, which products exist, whether the two function secrets are set.
4. Whether `RESEND_API_KEY` and the three Discord secrets are set in Supabase.
5. The Google OAuth app rename and whether KpnIdentity settings B1 to B6 are applied.
6. Where KpnAuth is hosted and who deploys it.
7. PostHog account (and Sentry, Turnstile, uptime) when you want them.
