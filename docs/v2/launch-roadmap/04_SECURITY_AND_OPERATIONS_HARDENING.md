# Security and operations hardening before launch

What must be true on Friday 2026-12-11 for LunchVoice to take payments and hold other people's answers. Items are numbered
**S-xx** so a gate report can say "S-14 pass". Owner is the QA and Security agent unless another is named; the governing
agent reviews each result. Nothing here needs a new paid service; costs that might arise are flagged.

Two kinds of risk dominate this product: (1) **privacy of answers** (a leaked or inferable anonymous answer destroys the
product's one promise) and (2) **money and access** (a wrong grant, a double charge, a stolen session). Items are ordered
accordingly.

Labels: **F** observed, **J** judgment, **A** to confirm. "Evidence" is what the report must contain.

## 1. Gate rule

**G-sec (part of G3 and G4):** zero open BLOCKER or HIGH findings; every S-item marked *launch* is pass or has a written
founder acceptance; every *drill* in section 10 has been run once and recorded. MEDIUM findings get an owner and a date
(before or after launch). The compliance review (`docs/compliance/LAUNCH_COMPLIANCE_REVIEW.md`) is re-run on the week-3 freeze
commit and again on the release candidate.

## 2. Privacy of answers (the product promise)

| ID | Requirement | How it is proven | Week | Launch |
| --- | --- | --- | --- | --- |
| S-01 | Anonymous answers cannot be linked to a person by any API, join, export, timing or log | Generator-based differencing test (C4) plus a "join audit" script that, for every table reachable from `lv_api`, proves no path from an eligibility receipt, roll, notification or points row to an anonymous answer. Includes the election ballot table (D1). Evidence: script output committed | 2 | yes |
| S-02 | Every reporting surface uses the one suppression engine | Grep gate in CI: no new function in `lv_api` or an Edge Function reads `lv.responses`/`lv.answers` for output except through the analytics core. Evidence: the CI rule and a list of allowed readers | 2 | yes |
| S-03 | Small groups are withheld, never zero; complementary cells are covered | pgTAP: 1, 4, 5, 6 response cases for each dimension (C4) and snapshot (C3) | 2 | yes |
| S-04 | No timestamps, order or ids that identify anonymous answers | Table review: anonymous answer rows carry no `created_at` finer than the day, a random id, no account column; response order is shuffled in every output | 2 | yes |
| S-05 | Guest identifiers are hashed and expire | Rate-limit hashes kept 7 days and then purged; salt rotated; test of the purge job | 3 | yes |
| S-06 | Retention matches policy | Jobs and tests for: logs 12 months, counters 13 months, notifications 90 days, device sessions after expiry, webhook delivery logs 30 days | 3 | yes |
| S-07 | Staff cannot read anonymous answers or ballots, and every staff read of personal data is audited with a reason | No policy grants staff access to answer or ballot tables; admin lookups write `lv.audit_events` with `reason` | 3 | yes |
| S-08 | Account deletion removes what F-05 says and nothing else breaks | Fixture deletion test: profile, links, memberships, invites, settings, waitlist entry and that account's free-text answers removed; aggregates and unlinked structured answers remain | 3 | yes |

## 3. Application security

| ID | Requirement | How | Week | Launch |
| --- | --- | --- | --- | --- |
| S-10 | Every `lv_api` function is `security definer` only where needed, has a fixed `search_path`, and checks the caller | Supabase advisors on both projects (security) clean; a query listing every function in `lv_api` with its security mode, `search_path` setting and execute grants; `anon` may execute only the public read set | 1 | yes |
| S-11 | RLS on every exposed table; the Data API exposes `lv_api` only | Query of `pg_class.relrowsecurity` across `lv`; PostgREST schema setting read through Management API; a scripted `anon` and `authenticated` probe of every table name returns 404 or empty | 1 | yes |
| S-12 | Each Edge Function authenticates itself (all have `verify_jwt = false`) | A test calls each function with no credentials, a wrong credential and a replayed old one and expects 401 or 403, never 200 or 500: `session` (KpnIdentity ID token), `checkout` (LunchVoice session), `billing-webhook` (Stripe signature, 5-minute tolerance), `email-dispatch` and `webhook-dispatch` (service secret), `api` (API key), `discord` (Ed25519 and timestamp) | 1 | yes |
| S-13 | CORS and origins are allow-lists | `LV_ALLOWED_ORIGINS` and `auth.allowed_origins` list exact origins; test with a hostile origin | 1 | yes |
| S-14 | No injection or script in user text | Fuzz the markdown-lite renderer and every place a name, title, bio, nickname, comment, news post or decision is shown; grep gate: `dangerouslySetInnerHTML` appears only in an allow-listed file; `href` values validated (https, mailto only) | 3 | yes |
| S-15 | Uploads are safe | Logo, cover and answer uploads: allow png, jpeg, webp (no SVG); sniff the real type server-side; size caps as built (1, 3, 10 MB); buckets private; signed URLs short-lived; a file answer must belong to the submitter's own path (built, re-test) | 3 | yes |
| S-16 | No open redirects | Sign-in `returnTo` accepts only paths or the three platform hosts; `checkout` return hosts from the allow-list (spec in `03_` section 5) | 1 | yes |
| S-17 | Outbound webhooks cannot reach our network | The SSRF suite in G2: private, loopback, link-local, metadata and IPv6-mapped addresses refused at connect time; DNS rebinding; redirects; timeouts; size cap | 3 | yes |
| S-18 | Rate limits at every write | Per account, per IP hash, per Hub: Quick Survey creation, comments (10 a minute), reports, invites, order creation, API keys per key; Turnstile on guest and sign-up paths (A5); a load script proves limits return `lv_rate_limited` and do not fall over | 3 | yes |
| S-19 | Clickjacking and framing | `frame-ancestors 'none'` everywhere except the one `/embed/*` path if C8 ships (Render path rule documented) | 3 | yes |
| S-20 | Security headers verified live on all three hosts | `curl -sI` for CSP, HSTS (`includeSubDomains`, no `preload`), nosniff, Referrer-Policy, Permissions-Policy, X-Frame-Options; CSP hash for the theme script recomputed after any `index.html` change; CSP gains only: `auth.lunchvoice.com`, the PostHog host, `challenges.cloudflare.com` | 3 | yes |
| S-21 | Subdomain hygiene | No dangling CNAME: after the `pay` cutover no record points at GoDaddy for a service we no longer use; every third-party CNAME is on a list with its owner | 3 | yes |
| S-22 | A coordinated-disclosure door | `public/.well-known/security.txt` (contact `admin@lunchvoice.com`, expiry date within 12 months, policy link) and a short `/security` section on `/support`; response promise 3 business days. Founder confirms the mailbox | 3 | yes |

## 4. Identity and sessions

| ID | Requirement | How | Week | Launch |
| --- | --- | --- | --- | --- |
| S-30 | 30-day device sessions are rotating, single-use and revocable | A1 tests (rotation, reuse revokes the family, revoke-all, cap of 10) | 1 | yes |
| S-31 | Step-up for dangerous actions | `lv_reauth_required` on billing change, owner transfer, Hub delete, account delete, API key create and data export; a refreshed device session does not satisfy it | 1 | yes |
| S-32 | Staff accounts are protected | Two-factor on every staff identity at KpnIdentity (B-series settings approved by the founder); staff routes check the `staff` capability server-side; staff actions are audited with a reason | 3 | yes |
| S-33 | KpnIdentity hardened | Settings B1 to B6 applied (email confirmation, Resend SMTP, 12-character passwords, leaked-password check, security emails, current password to change) one approval each; K1 to K10 on the sign-in screen | 3 | yes |
| S-34 | Supabase key generations | Callers switched to the new publishable and secret keys; legacy anon and service-role keys disabled after verification (do not wait for early 2027) | 3 | yes |
| S-35 | Founder and operator accounts have two-factor | A checklist, ticked by the founder: GitHub, Render, Cloudflare, Supabase (both orgs), Stripe, Google (Cloud and Workspace), Discord, Resend, Composio, the domain registrar, the uptime monitor, PostHog, Sentry. Evidence: the founder's confirmation, not screenshots | 1 | yes |

## 5. Money

| ID | Requirement | How | Week | Launch |
| --- | --- | --- | --- | --- |
| S-40 | A grant needs a matching intent, paid status, USD and an equal subtotal; metadata never trusted | Suite 36 extended for account scope (B1) | 1 | yes |
| S-41 | Webhooks are verified and idempotent | Signature with tolerance; duplicate, out-of-order and replayed events grant nothing twice; unknown event types ignored and logged | 1 | yes |
| S-42 | No double purchase | A second Creator subscription refused; a Hub already on the same family refused; a pending intent expires after 24 hours | 1 | yes |
| S-43 | Refund and dispute paths work | B2 live refund; a Stripe dispute notification creates an audit row and a staff alert (the `charge.dispute.created` event handled: entitlement stays, staff alerted) | 1 | yes |
| S-44 | Test artefacts removed | The 100% coupon expires and is deleted after B2; no test price is left purchasable; the Stripe webhook secret is rotated if it was ever printed | 1 | yes |
| S-45 | Radar and 3-D Secure on | Stripe account settings read through Composio; founder confirms in the dashboard | 1 | yes |
| S-46 | Taxes | Stripe Tax is on and the products carry a software tax code (founder); the founder registers for tax collection where required (Stripe Tax calculates and reports, it does not register us); the legal operator name appears on receipts | 2 | yes |
| S-47 | Billing release is armed and audited, never automatic | B8 tests; nobody is charged without purchasing | 1 | yes |

## 6. Edge, infrastructure and supply chain

| ID | Requirement | How | Week | Launch |
| --- | --- | --- | --- | --- |
| S-50 | Secrets are not in the repository or its history | Secret scanner (gitleaks) over full history; `.env` built only from `.env.example`; `.mcp.env` ignored; findings are rotated, not just deleted | 1 | yes |
| S-51 | Least privilege on tokens | Supabase Management API tokens (one per project), Render API key, Stripe restricted keys where possible, Composio connections: list, scope, owner, expiry; rotate after launch week; no token shared between the two Supabase projects | 3 | yes |
| S-52 | Dependencies are clean and pinned | `npm audit --audit-level=high` zero; lockfile committed; Dependabot on for npm and GitHub Actions; Actions pinned to commit SHAs; Deno imports pinned | 1 | yes |
| S-53 | `main` is protected enough | Required checks (`pr-checks`) on `main`, no force pushes, deploy only after checks (Render "after checks pass" is on, F). The standing push authority stays; the protection exists so a bad push cannot skip tests | 1 | yes |
| S-54 | Cloudflare account safety | Two-factor, API tokens scoped to the zone and Workers, no Global API key in use, audit log reviewed, "Always Use HTTPS" and Automatic HTTPS Rewrites on, minimum TLS 1.2 | 1 | yes |
| S-55 | Bot protection | Turnstile (A5); Cloudflare's free bot fight mode on the proxied hosts; a rule that blocks known abusive scanners on `/auth/*` only if false positives are zero | 3 | no |
| S-56 | Pen-test pass | A two-pass checklist run by the QA agent against the OWASP ASVS Level 2 items that apply (authentication, session, access control, validation, cryptography at rest and in transit, error handling, API, files, configuration) with the three hosts and the Edge Functions in scope; findings triaged | 3 | yes |

## 7. Reliability and operations

| ID | Requirement | How | Week | Launch |
| --- | --- | --- | --- | --- |
| S-60 | Backups and a rehearsed restore | Decide point-in-time recovery (founder; A: depends on the Supabase plan; cost shown before approval). Either way, **restore a backup into a scratch project and run the canonical checks and a row-count comparison** (drill DR-01). Recovery time and loss window written down | 1 and 3 | yes |
| S-61 | Monitoring and alerts | Sentry on the site and Edge Functions (free tier; no personal data, no answers, no tokens; `beforeSend` scrubs); an uptime monitor on `/`, `create.`, `pay.`, the `session` function and the Stripe webhook health; alerts to the founder's email and phone; Supabase log alerts for function 5xx spikes; Stripe's failed-webhook emails; Resend bounce and complaint webhook (below) | 3 | yes |
| S-62 | Email deliverability and suppression | Resend bounce and complaint events received by `email-dispatch` (or a new `resend-webhook` function with signature check) mark the address undeliverable and stop sending; the SPF, DKIM and DMARC checks of `03_` section 7 pass | 3 | yes |
| S-63 | Load and soak | k6 (free) scripts: 300 simulated live-session joins, 50 submissions a second for 5 minutes on a link survey, results reads at 100 a second, 200 concurrent Hub page loads; targets: error rate under 0.5%, submit p95 under 400 ms, state call p95 under 200 ms; database CPU under 70%; connection pool not exhausted. The result decides whether the Supabase plan needs more compute (founder decision with cost) | 3 | yes |
| S-64 | Rollback is rehearsed | Site: Render "rollback to previous deploy" tried once; headers and rewrites rollback (`RENDER_SETTINGS.md`) tried once; DNS rollback of `pay` and `create` tried on a staging host; every migration's rollback is rehearsed by the canonical suite (built) | 3 | yes |
| S-65 | Incident response | A one-page runbook `docs/ops/INCIDENT_RESPONSE.md`: severities, who decides (founder), first 15 minutes, status page update, customer message templates, evidence preservation, breach rules (notify affected people and authorities within the legal window; counsel) | 3 | yes |
| S-66 | Status page | `/status` shows the monitor's public state and the last incident; no new hostname | 3 | yes |
| S-67 | Data migrations are safe | Every production migration follows the runbook (history row, hash in changelog, verify); after G3 only security or blocker migrations, each with a rollback rehearsed | 3 | yes |

## 8. Abuse, safety and legal

| ID | Requirement | How | Owner | Week | Launch |
| --- | --- | --- | --- | --- | --- |
| S-70 | Abuse handling works end to end | E6 drills; response targets: report triaged within 24 hours, appeals within 72 | QA, staff | 3 | yes |
| S-71 | Illegal content process | A written process for child-safety material and other illegal content: remove, preserve, report to the proper authority as required, never forward the material; `report` category routes to staff immediately; counsel reviews | founder | 3 | yes |
| S-72 | Minors | F-11: no marketing to minors; terms require users to be at least 13 (16 where the law says so), asked at sign-up in KpnIdentity; schools appear only as adult administrators' use case; no minors-data workflows until counsel | founder, counsel | 2 | yes |
| S-73 | Legal documents are real | Privacy Policy, Terms, Guidelines, refund policy (F-08), cookie statement (the device cookie and `localStorage` are strictly necessary; no tracking cookies), subprocessor list (Supabase, Render, Cloudflare, Stripe, Resend, Discord, PostHog, Sentry, Google, the uptime monitor), data-processing terms for Team Hubs. The "Legal text pending review" placeholders are replaced with counsel-reviewed text and the legal operator is named (F-12). **If the legal operator or counsel review is not ready by 12-02, billing stays closed (B8 unarmed) and the founder decides** | founder, counsel | 2 to 3 | yes |
| S-74 | Accessibility statement | A page stating the WCAG 2.2 AA target, how to report a barrier, and known gaps; the week-4 audit (`05_`) supplies the facts | UI | 4 | yes |
| S-75 | Contact points work | `admin@lunchvoice.com` (support and security), `privacy` request path through Account → Privacy, abuse report path, DMCA contact on the legal page; each is tested by sending to it | founder | 3 | yes |

## 9. Data protection details

- **Export and deletion** (G3, S-08) satisfy access and erasure requests (GDPR and US state laws) for the data we can link.
- **Anonymous answers are not personal data of a person we can identify** only while S-01 to S-04 hold; any change to those tables
  needs the governing agent's review.
- **Processors:** the list in S-73 is the subprocessor list; each has its own terms accepted by the founder.
- **Regions:** the Lunchvoice database runs in `us-west-2` (F: Composio project list), KpnIdentity in `us-east-1`; the privacy
  text says data is processed in the United States.
- **Logs:** application logs contain ids, never answers, tokens or emails; Sentry and PostHog are configured to the same rule;
  a grep of recent logs for `@` and `eyJ` (a token prefix) runs as a check.

## 10. Try-out drills (run once each before the freeze, recorded in `docs/ops/DRILLS_2026-12.md`)

"Try out on our end" means we cause the failure on purpose, in a safe place, and write down what happened.

| # | Drill | Who | Safe place | Pass when |
| --- | --- | --- | --- | --- |
| DR-01 | Restore a backup | Backend and founder | A scratch Supabase project | The restored database passes the canonical checks and counts match; time taken recorded |
| DR-02 | Refund a real purchase | Founder with Edge | Live, $13 with the 100% coupon | Entitlement ends, audit row exists, receipt and refund email arrive (B2) |
| DR-03 | Fail a payment | Edge | Replay a recorded `invoice.payment_failed` event | Banner appears, 7-day grace, then Free limits; nothing deleted |
| DR-04 | Steal a session | QA | Two browsers | Revoke-all kills both within one refresh; reuse of an old refresh credential revokes the family |
| DR-05 | Leak an API key | QA | A test Hub | Revoking the key stops it immediately; the log shows the last use |
| DR-06 | Take the bot's permission away | Edge and founder | The community Discord server | The Integrations tab shows a clear error; re-granting recovers; no token in any message |
| DR-07 | Report and appeal | QA | Test accounts | Content hidden, reporter informed, appeal from a signed link reaches the queue |
| DR-08 | Delete an account | QA | Fixture account | Exactly the F-05 list is removed; the export before deletion is complete |
| DR-09 | Release a Hub name | Backend | Time-travel in a test database | A claimant after release sees none of the prior holder's data |
| DR-10 | Downgrade | Backend | Fixture Hub on Team | Over-limit items stay readable; no data deleted; premium actions refused |
| DR-11 | Break the site on purpose | Governing | Render | A bad deploy is rolled back in under 10 minutes; the headers rollback works |
| DR-12 | Webhook outage | Edge | Disable the function for 30 minutes in a test project | Stripe retries are processed in order afterwards; no double grant |
| DR-13 | Page the founder | Governing | Uptime monitor | A forced failure produces an alert on the founder's phone within 3 minutes |
| DR-14 | Flood | QA | k6 against a test Hub | Rate limits answer `lv_rate_limited`; the site stays up (S-63) |

## 11. What the founder must do for security (short list)

1. Two-factor on every account in S-35 and confirm in writing.
2. Confirm the Supabase plan and the backup decision (S-60).
3. Approve KpnIdentity settings B1 to B6, one at a time (S-33).
4. Name the legal operator; engage counsel for S-71 to S-73.
5. Set the Stripe tax code and registrations (S-46); confirm Radar (S-45).
6. Confirm `admin@lunchvoice.com` receives mail and who reads it (S-22, S-75).
7. Decide Resend plan versus the free caps (`03_` section 7).
8. Be reachable for DR-02, DR-13 and the G4 call.
