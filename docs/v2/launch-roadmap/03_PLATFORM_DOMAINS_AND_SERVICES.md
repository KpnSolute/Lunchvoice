# Platform domains and services: `auth`, `create`, `pay`, Discord, Stripe

Detail behind features A1 to A5, B1 to B8 and F1 to F5. The cost rule governs everything here (founder, 2026-11-13):
**no new Render custom domains; every hostname goes through Cloudflare; free tiers first.** The inventory
(`docs/ops/SERVICES_AND_DEPENDENCIES.md`) and the Cloudflare usage log are updated in the same commit as each change.

This file follows the founder handoff of 2026-11-13 (`handoffs/2026-11-13-v2-services-first-creator-dashboard.md`): one
creator home at `create.lunchvoice.com`, `pay.lunchvoice.com` as a first-party billing frontend over the existing
LunchVoice Stripe merchant, `/status` and `/support` instead of new hosts, no automatic charging, and no cutover of
`pay` before the new app, TLS, return URLs, signed webhooks and rollback are verified.

## 1. The hostnames

DNS read from Cloudflare on 2026-11-14 (zone `lunchvoice.com`, id `263aa4fede0236a03cd220e9721e2916`, F):

| Name | Record today | Notes |
| --- | --- | --- |
| `lunchvoice.com` | A `216.24.57.1`, proxied | Render. TXT: Google site verification, SPF (`secureserver.net`, `spf.protection.outlook.com`, `-all`), Microsoft verification. MX `lunchvoice-com.mail.protection.outlook.com` (Microsoft 365 mailboxes) |
| `www` | CNAME `interact-3npi.onrender.com`, proxied | Render custom domain, redirects to apex |
| `hub` | AAAA `100::`, proxied, Worker-owned | `lunchvoice-hub-card`; do not touch |
| `pay` | **CNAME `paylinks.commerce.godaddy.com`, proxied** (record id `7d595b034510797f5c6cc62dd2e26665`) | The old GoDaddy-era payment site. Leave until cutover |
| `send`, `rsend` | CNAME to `send.forge.rmta.net` and `rsend.forge.rmta.net`, DNS only | Email sending (Resend); do not touch |
| `resend._domainkey` | TXT DKIM | Resend; do not touch |
| `_dmarc` | TXT `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net` | Reports go to GoDaddy's aggregator |
| `autodiscover`, `email`, `_domainconnect` | proxied CNAMEs to GoDaddy and Microsoft names | Leftovers; see section 7 |
| `create`, `auth` | **none** | To create |

Target:

| Host | Purpose | Served by | Render domain? | Cost |
| --- | --- | --- | --- | --- |
| `lunchvoice.com`, `www` | Public: answer, join, Hubs, marketing | Render static site (existing) | yes (the only two) | existing |
| `create.lunchvoice.com` | The creator app: dashboard, studios, results, Trends, Decisions | Same Render build, via Cloudflare (section 3) | **no** | free |
| `pay.lunchvoice.com` | Billing: plan review, Stripe-hosted checkout hand-off, return, receipts, portal entry | Same Render build, via Cloudflare (section 3) | **no** | free |
| `auth.lunchvoice.com` | 30-day device session (cookie only, no pages) | Worker `workers/auth-session` on a Custom Domain | no | free (Workers) |
| `hub.lunchvoice.com` | Share-link previews for Hubs | Worker `lunchvoice-hub-card` (live) | no | free |
| `status`, `help`, `developers`, `api`, `discovery` | **Not created.** Launch uses `lunchvoice.com/status`, `/support`, `/developers` and `/discover` | n/a | no | $0 |

`status`, `help`, `developers`, `api` and `discovery` are reserved slugs so no Hub can take them (A2).

## 2. Why one build on three hostnames

One repository, one design system, one deploy, one set of tests (the handoff: "hostname-aware routing rather than
separate disconnected SPAs"). Each hostname is a different **doorway** into the same static files. The app decides what
to show by hostname (`src/lib/hostMode.ts`, spec A2). A respondent never sees the creator app and a creator never sees
a payment screen unless they go to pay.

## 3. Serving the same build on `create` and `pay` without a Render domain

Render's static site answers a request by its `Host`. It knows `lunchvoice.com`, `www.lunchvoice.com` and its default
address `interact-3npi.onrender.com`. A request for `create.lunchvoice.com` would be refused unless Cloudflare presents
the default address instead. Two ways, in order of preference:

**Option 1 (Default): Cloudflare rules, no code.** All free (10 of each rule type on the Free plan; A: confirm in the
dashboard).

1. DNS: `create` and `pay` as **proxied CNAMEs to `interact-3npi.onrender.com`** (same shape as `www` today, which already
   works, F).
2. **Origin Rule** per host: when the hostname equals `create.lunchvoice.com` (or `pay.lunchvoice.com`), override the
   `Host` header and the SNI to `interact-3npi.onrender.com`.
3. **URL Rewrite Rule** per host: when the path equals `/`, rewrite to `/app.html` (otherwise Render's rewrite for `/` would
   serve the prerendered landing page, which is for the public host). All other paths pass through; Render's own `/*`
   rewrite to `/app.html` handles app routes.
4. **Response Header Transform** per host: add `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store` for
   `/` and `/app.html` (HTML only; assets keep the long `immutable` cache from Render).
5. Everything else (CSP, HSTS, nosniff) comes from Render's headers, so there is nothing to keep in sync.

**Verification before anything depends on it** (agent, first hour of A3): `curl -sI https://create.lunchvoice.com/` returns
200 with the app shell; `/assets/<hash>.js` returns the asset with `immutable`; a deep link such as `/surveys/new` returns the
shell; the Render host is not exposed in any redirect (`Location`); TLS is Cloudflare's (Universal SSL covers one level of
subdomain at no cost). If the Origin Rule's host override is not available on the plan or Render rejects the request:

**Option 2 (fallback): a pass-through Worker.** `workers/edge-host/` on Custom Domains `create.lunchvoice.com` and
`pay.lunchvoice.com`: fetch `https://interact-3npi.onrender.com` with the same path and query, map `/` to `/app.html`
for these hosts, add the response headers above, pass bodies and streams through untouched. It counts against the Workers
free allowance (100,000 requests a day, A: confirm). Static assets would count as requests, so the Worker adds a
`Cache-Control` of one year to `/assets/*` and uses the Cache API; an alarm at 70% of the daily allowance is set (Cloudflare
usage notifications). If traffic ever exceeds it, the founder decides on the $5 Workers Paid plan; nothing is bought without a yes.

**Rollback (either option):** delete the two DNS records and rules. Nothing on `lunchvoice.com` changes.

**Cloudflare configuration through Composio** (toolkit `cloudflare_api_key`, re-connected 2026-11-14, F: lists all three
zones with DNS edit): DNS via `CLOUDFLARE_API_KEY_OVERWRITE_DNS_RECORD` or create; rules through the rulesets API. Record
every change in the Cloudflare usage log with the ids.

## 4. `create.lunchvoice.com`

- **What the person sees.** The creator dashboard (spec G6), studios, results, Trends, Decisions, billing entry. Public
  pages redirect to `lunchvoice.com`. The Hub Console stays on `lunchvoice.com/:hub/...` (Hub URLs are paths).
- **Sign-in.** The app signs in with KpnIdentity as today (callback `https://create.lunchvoice.com/auth/callback`, added to
  the allowed callback origins in KpnIdentity and to the `session` function's `LV_ALLOWED_ORIGINS`), and keeps the person
  signed in with the A1 device session: the browser asks `auth.lunchvoice.com` for a fresh short session on load. Because
  `localStorage` is per hostname, **the device cookie is what makes `lunchvoice.com` and `create.lunchvoice.com` feel like
  one sign-in**; this is why A1 ships in week 1 before any creator screen depends on it.
- **KpnIdentity change (needs approval).** Add `https://create.lunchvoice.com/auth/callback` and
  `https://pay.lunchvoice.com/auth/callback` to the allowed redirect URLs of the LunchVoice client (a KpnIdentity
  setting; each change approved one at a time, with a rollback note).
- **Caching.** HTML `no-store`; assets immutable; `version.json` `no-store` (existing update notice works on every host).
- **Fallback if a host misbehaves.** A Cloudflare Redirect Rule `create.lunchvoice.com/*` to
  `https://lunchvoice.com/surveys` (the creator routes still work on the public host in development of the mode switch).

## 5. `pay.lunchvoice.com`

- **What it is.** A first-party billing frontend: plan review, hand-off to **Stripe-hosted Checkout** (default; no card data
  or Stripe script on our pages, so `script-src 'self'` is unchanged), authenticated return, payment state, receipts,
  Customer Portal, cancel, downgrade, failed payment, refunds (spec B1 to B7).
- **Merchant.** The existing Stripe account whose dashboard name is **Lunchvoice**; Composio account `stripe_warnt-dread`.
  The other Stripe accounts (Aftercard, Papercliped Connect) are never used. Creator Plus and Pro prices
  (`price_1UbKmwGXQRJOc8XHsouE4eIN`, `price_1UbKmwGXQRJOc8XHu8uSf0fo`) are in `billing.stripe_prices`.
- **Return URLs.** Checkout success `https://pay.lunchvoice.com/return?session_id={CHECKOUT_SESSION_ID}`, cancel
  `https://pay.lunchvoice.com/`, portal return `https://create.lunchvoice.com/`. The `checkout` function accepts a return host
  **only from the allow-list** policy `billing.return_hosts` (`pay.lunchvoice.com`, `create.lunchvoice.com`,
  `lunchvoice.com`); anything else is refused (open-redirect defence). The return page asks the server for the session's
  status; it never trusts the query string.
- **Webhook.** **Unchanged:** Stripe → the `billing-webhook` Supabase function directly. (A proxy through `pay` was
  considered and dropped: it adds a moving part to the one path whose failure costs money.)
- **Cutover from GoDaddy (needs the founder's go-ahead, Thu 11-19).**
  1. Confirm with the founder whether any GoDaddy pay link or invoice still in circulation points at `pay.lunchvoice.com`
     (A: unknown). If yes, list them; each needs a replacement before the cutover.
  2. Stage on a temporary host `pay-next.lunchvoice.com` with the same rules (deleted after cutover) and run B3's e2e
     through real Stripe **test** state where available; otherwise the B2 live coupon run.
  3. Cutover: overwrite DNS record id `7d595b034510797f5c6cc62dd2e26665` to a proxied CNAME to `interact-3npi.onrender.com`;
     add the host's Origin, URL Rewrite and Response Header rules; verify the six checks of section 3.
  4. **Rollback:** overwrite the same record back to `paylinks.commerce.godaddy.com` (proxied); remove the rules.
     The previous values are in this file; do not delete the record before the founder confirms.
- **Security.** The pay host is in `auth.allowed_origins`; its routes require a session; every money action asks for a
  fresh authentication (`lv_reauth_required`); pages send `frame-ancestors 'none'` (existing); `noindex`.

## 6. `auth.lunchvoice.com`

- **What it is.** A Cloudflare Worker `workers/auth-session/` on a Worker Custom Domain: the only code that ever sees the
  device cookie. It has no pages. Design is `LAUNCH_PREP_PLAN_2026-11-13.md` section 3 and spec A1.
- **Deploy.** Same method as `workers/hub-card` (read its README first); secret `AUTH_WORKER_SHARED_SECRET` is set as a Worker
  secret and as a `session` function secret (both names only in docs); **the founder approves generating it**.
- **Verification list** (spec A1) is run before any creator screen relies on it.
- **Watch.** The Cloudflare Workers dashboard shows requests; the sliding refresh happens at most once per app load.

## 7. Email and DNS hygiene (small, free, worth doing in week 3)

1. **DMARC reports.** `rua` points at `dmarc_rua@onsecureserver.net` (GoDaddy's aggregator). **Default:** keep `p=quarantine`
   (a good setting), add a LunchVoice-owned report address, or turn on Cloudflare's free DMARC Management. Do not tighten to
   `reject` until reports show Resend and Microsoft 365 passing alignment (Resend signs with `resend._domainkey` so DKIM
   aligns). A change to a DNS record the founder owns is approved first.
2. **Proxied mail names.** `autodiscover`, `email` and `_domainconnect` are proxied CNAMEs; proxying breaks Outlook
   autodiscover and serves no web purpose. Set them to **DNS only** (A: confirm no one depends on them); no other change.
3. **SPF** includes `secureserver.net` and Microsoft; Resend uses its own return-path domain (`send`), so SPF for
   `lunchvoice.com` needs no Resend entry. Keep `-all`.
4. **Two mail systems.** Microsoft 365 handles human mailboxes (for example `admin@lunchvoice.com`), Resend handles
   transactional mail. Document which address is which in `SERVICES_AND_DEPENDENCIES.md`.
5. **Email volume.** Resend's free plan has a daily and a monthly cap (A: 100 a day and 3,000 a month at the time of
   writing; verify). Notifications and digests (E3, C7) can exceed it as the product grows. **Founder decision by 11-23:**
   keep the frequency caps and the free plan for launch, or take the paid plan (a recurring cost). Default: stay free,
   daily cap of 3 emails per person, digests weekly, billing and security mail exempt; set an alert at 80% of the daily cap.

## 8. Discord

- **Components.** Edge Function `discord` (Ed25519 interactions, fails closed without `DISCORD_PUBLIC_KEY`), the dispatch cron,
  the bot application, per-server connections, the account link. Secrets: `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`,
  `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` (existing, names only) and **new** `DISCORD_CLIENT_SECRET` for OAuth link (F1).
- **Week 3 live test (the proof).** In the LunchVoice community's own Discord server: install the bot with the minimum
  permissions (`applications.commands`, `bot`; Manage Roles only for rule roles), run every command, connect it to the
  Kitchen (K), exercise link, verify, role grant, a post, a decision announcement, revoked permission, re-grant. The
  agent drives it with the founder present; results go in `docs/ops/DISCORD_PROOF_2026-12-02.md`.
- **Brand.** Upload the new bot avatar and redo `public/brand/discord-banner.png` (the old file says "Ask your community.
  Hear every voice."; the approved tagline is "Make every voice count."). Founder uploads in the developer portal.
- **Privacy rules (unchanged, restated).** Discord never learns an anonymous answer or who answered an anonymous Campaign;
  anonymous Campaigns are answered in the LunchVoice player; role rules use receipts, not answers; a server sees only
  linked, consenting people; staff can disable any connection.

## 9. Services that run LunchVoice after this roadmap

Added to `SERVICES_AND_DEPENDENCIES.md`: Cloudflare rules (Origin, URL Rewrite, Response Header) for `create` and `pay`;
Workers `auth-session` (and `edge-host` only if Option 2 is needed); Turnstile; PostHog; Sentry; an uptime monitor with
a public status link shown on `/status`; the `billing_release` cron; the `notifications` fan-out cron; live-session state
cache. Each is logged in the Cloudflare usage log (section 6 there) with date, purpose and status.

**New secrets and keys (names only):** `AUTH_WORKER_SHARED_SECRET`, `TURNSTILE_SECRET`, `DISCORD_CLIENT_SECRET`, PostHog
project key (public), Sentry DSN (public), uptime monitor API key (if used). Each is created by the founder or with the
founder's explicit go-ahead; none is written in any file.

**Cost ledger delta (monthly, J):** Cloudflare rules, Workers (within free), Turnstile, PostHog (free tier), Sentry (free
tier), uptime monitor (free tier): **$0**. Decisions that could add cost, none taken without a yes: point-in-time recovery
(Supabase plan dependent), Resend paid plan, Workers Paid ($5) if the pass-through Worker is ever needed at volume, Supabase
compute upgrade if the load test (S-ops) says so.

## 10. Acceptance for this file

1. `curl -sI` checks on each host pass (section 3).
2. Sign in on `lunchvoice.com`, open `create.lunchvoice.com`: signed in without a prompt (A1).
3. Purchase of Creator Plus from `pay.lunchvoice.com`, grant visible on `create.lunchvoice.com`, receipt arrives (B1, B6).
4. `pay.lunchvoice.com` rollback rehearsed once on `pay-next` before the real record changes.
5. Discord proof document signed off.
6. Inventory, usage log and `RENDER_SETTINGS.md` updated; Render still has exactly two custom domains.
