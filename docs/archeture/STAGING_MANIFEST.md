# LunchVoice v2 staging manifest and cost estimate

Planning deliverable, 2026-10-23 (roadmap item **R-05**). Status: **proposal for founder approval.
Nothing in this document has been purchased, created, configured or connected.** Prices below
were read from the vendors' public pages and documentation on 2026-10-23 through web search;
they are **estimates to re-verify on the live pages before any purchase**, and several pages
disagree with their own snapshots. Companion documents: [resource map](RESOURCE_MAP.md),
[execution roadmap](../backend/EXECUTION_ROADMAP.md), [D-01 decision packet](../backend/D01_IDENTITY_DECISION_PACKET.md).

## 0. Founder decisions recorded (2026-10-23)

- **Monthly cap: $50 for staging.** (The duration was not stated; the proposal was 3 months, so this document keeps a
  3-month review point, after which the cap is re-confirmed.) Central identity hosting (S-5), production PITR and live
  billing fees are outside this cap and need their own decision.
- **Owner: the founder** for the staging resources. This records ownership, not permission for Claude to create or pay for
  anything; resources are still created only after explicit written permission (checklist item 7 in section 5), or by a person
  the founder names.
- **D-01 contingency (Option D) approved**: see the [D-01 packet](../backend/D01_IDENTITY_DECISION_PACKET.md).
- Still open from the checklist: Supabase organization/plan, domain/DNS owner, whether any sanitized data may be used
  (default no), and the permission to create resources.

## 1. Purpose and rules

Staging exists so identity, membership, permission, entitlement, migration and rehearsal work can be
proven **without production data, credentials or users**. The founder approved preparing this
manifest and its costs before anything is bought (2026-10-23 message); creating resources needs a
separate written approval.

1. Separate from production in every dimension: project, credentials, domains, OAuth clients, email
   sender, billing sandbox. No production secret ever appears in staging, CI logs, docs or PRs.
2. **Synthetic data only**, or sanitized data the founder explicitly approves in writing. No real student accounts.
3. Secrets are recorded by **name, purpose, owner, environment and secret-manager reference only**.
4. Every resource has a named owner (today: **unassigned**) and a teardown or pause plan.
5. A monthly spend cap is set before creation (section 5) and checked weekly.
6. Staging is provisioned by someone with the authority and credentials; Claude drafts and verifies, and
   does not create paid resources on its own.

## 2. Resource manifest

Owner "unassigned" means no person or vendor account is named in any repository document. "Needed by" is
tied to the [roadmap](../backend/EXECUTION_ROADMAP.md).

| # | Resource | Purpose | Candidate | Est. cost / month (public pages, 2026-10-23) | Owner | Needed by | Blocks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S-1 | Staging database + Auth | Hosted Supabase for identity linking, RLS, allow/deny and concurrency tests, migration rehearsal | New Supabase project. Alternative: a Supabase branch (billed hourly) | Pro plan is $25/month including $10 compute credit (covers one Micro project); an extra Micro project is about $10/month; a branch on Micro is about $0.01344/hour (about $9.81 if always on) and is **not** covered by credits or the spend cap. Incremental for staging: **about $10 (up to $25 if a new organization/plan is needed)** | Unassigned (database/hosting operator) | Oct 28 | R-04, R-06, R-07, R-19 |
| S-2 | Staging frontend host | Preview of the SPA against staging Supabase; operator rehearsal URL | Render static site / PR previews; custom domain such as `staging.<domain>` | Static sites are free to host; Hobby workspace includes 2 custom domains (extra $0.25 each per month); Pro workspace is $25/month with 15 domains; static PR previews are free; wildcard TLS is automatic. **$0 to $25** depending on domain slots in the current workspace plan (unverified) | Unassigned (hosting operator) | Nov 2 | R-11, R-21 |
| S-3 | Google OAuth client (test) | Real Google sign-in against staging; OIDC scenarios | New OAuth client in a Google Cloud project owned by the founder | **$0**. Identity-only scopes (`openid`, `email`, `profile`) do not trigger sensitive-scope review; displaying an app name/logo requires brand verification (needs domain, privacy policy and terms links) | Unassigned (Google Cloud project owner) | Oct 30 | R-06 |
| S-4 | Test Google accounts | Deterministic OIDC scenarios (new user, existing user, changed email, conflict) | 3-4 dedicated Google accounts owned by the founder | $0 | Founder | Oct 30 | R-06 |
| S-5 | Central identity staging | Staging counterpart of `auth.kpnsolute.com` (issuer, JWKS, callbacks) | **Undecided** (see D-01 packet; hosting and repository not named) | **TBD**: depends on D-01 (could be a Supabase Auth instance, a small server, or deferred) | Unassigned (identity service owner) | Oct 28 | R-06 |
| S-6 | Supabase custom OIDC provider config | Upstream OIDC login (option A) | Supabase Auth custom provider on S-1 | Free plan allows up to 3 custom providers; Pro and above unlimited. MAU: Pro includes 100,000, overage $0.00325 per MAU (staging usage negligible) | Same as S-1 | Nov 2 | R-06 |
| S-7 | Billing sandbox | Webhook, idempotency, event-order and checkout tests | Sandbox/test mode of the provider chosen under D-06 (undecided) | **$0** in test mode. For reference, live Stripe card processing is 2.9% + 30 cents per domestic transaction and Billing is about 0.7% of billing volume; other providers differ and are not priced here | Founder (provider decision, D-06) | Nov 6 | R-12 |
| S-8 | Transactional email (staging) | Waitlist, invite and reminder email tests; existing auth email hook | Azure Communication Services Email (already used by `send-email`) with a verified sender | About $0.00025 per email plus $0.00012 per MB (rates from Microsoft's pricing document; the pricing page itself showed no live numbers); staging volume well under **$1** | Unassigned (email operator) | Nov 9 | R-10, R-13 |
| S-9 | Scheduler for jobs | Activation, expiry, reminder and release jobs | Options: database scheduling on S-1 (availability on this project unverified), scheduled Edge Functions, or Render cron (priced by Render plan) | **TBD** (R-20 decision) | Unassigned | Nov 9 | R-13, R-20 |
| S-10 | Monitoring and alerts | Auth, job, event and latency alerts; privacy-safe logs | No vendor chosen | **TBD** (free tiers of common tools are unverified here) | Unassigned | Nov 16 | R-20 |
| S-11 | DNS and TLS | Staging hostnames, callback allowlist entries | Per the founder (2026-10-23): **`kpnsolute.com` DNS is on Cloudflare; `lunchvoice.com` is on GoDaddy** (founder wants to migrate it; hosting stays on Render). Proposal: put staging hostnames under `kpnsolute.com` (for example `auth-staging` and `lv-staging`) so no GoDaddy/production DNS change is needed before launch | Cloudflare DNS is free; GoDaddy renewal unchanged; Render issues TLS for custom domains | Founder (domain owner) | Oct 30 | R-06, R-11 |
| S-12 | CI | PR checks, script tests, Deno tests | GitHub Actions on the public repository | Standard hosted runners are free for public repositories (verify on GitHub's billing page); no paid minutes expected | Founder (repo admin) | Done (PR #5) | R-02 |
| S-13 | Restore-drill target | Prove backup restore into an isolated project | Temporary Supabase project, deleted after the drill | A few dollars prorated (hourly billing); one-time | Same as S-1 | Dec 1 | R-20 |
| S-14 | Local verification (already available) | Replay migrations, allow/deny tests | Docker + Supabase CLI/Deno via `npx` on the developer machine | $0 | Claude | Now | R-02b, R-04 |

Production items that are **not** staging but affect launch (each needs its own decision): Supabase point-in-time
recovery is a paid add-on (listed at about $100/month for 7 days of retention; Pro includes 7 days of daily backups
and enabling PITR replaces daily backups); production DNS/TLS for any new host; production OAuth consent
publishing and brand verification.

## 3. Rough cost envelope

| Scenario | Monthly | Notes |
| --- | --- | --- |
| Minimum | about **$10** | Extra Supabase Micro project; Render free; email under $1; everything else $0 |
| Likely | about **$25-$35** | Adds a Render workspace/domain cost or a new Supabase organization plan; scheduler/monitoring still TBD |
| High | about **$50** | Adds a paid Render workspace plus a small monitoring tool or always-on branch; identity service hosting TBD and **not** included |
| One-time | under **$5** | Restore drill project (prorated) |

Proposed cap for founder decision: **$50 per month for staging for 3 months (about $150 plus one-time drill)**, reviewed
weekly. Excluded: central identity hosting (S-5), billing provider live fees, production PITR, any paid
design/branding assets. These figures are estimates from public pages and **must be rechecked at purchase time**.

## 4. Environment manifest (names only; no values)

| Environment | Where | Data | Access | Teardown |
| --- | --- | --- | --- | --- |
| local | Developer machine: Node 22, Docker, `npx supabase`/`deno` | Synthetic fixtures | Claude, founder | Delete containers |
| ci | GitHub Actions | None (placeholder `VITE_*` values only) | PR authors | n/a |
| staging | S-1..S-11 | Synthetic or approved sanitized only | Founder, named operator, Claude (non-production credentials) | Pause/delete when idle after Dec 23 |
| production | Existing MJCCv2 + Render | Real | Separate authority | Not part of this manifest |

Secret and configuration **names** (values live only in the chosen secret manager; the secret manager itself is unselected):

| Name (proposed) | Purpose | Visible to browser? |
| --- | --- | --- |
| `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY` | Public client config | Yes (same as `VITE_SUPABASE_*` equivalents) |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Edge functions/jobs/tests only | **Never** |
| `STAGING_GOOGLE_OAUTH_CLIENT_ID`, `STAGING_GOOGLE_OAUTH_CLIENT_SECRET` | Provider configuration | Client ID only |
| `STAGING_IDENTITY_ISSUER_URL`, discovery/JWKS URLs | OIDC federation | No secret |
| `STAGING_BILLING_API_KEY`, `STAGING_BILLING_WEBHOOK_SECRET` | Sandbox billing | **Never** |
| `STAGING_ACS_CONNECTION_STRING`, `STAGING_MAIL_FROM` | Email | **Never** (connection string) |
| `STAGING_APP_ORIGINS` | Callback/return allowlist | No secret |

## 5. Approval checklist (founder)

1. Monthly cap and duration (proposed in section 3).
2. Owner for each resource S-1..S-11 (names or "founder").
3. Which Supabase organization/plan hosts S-1; whether a branch is preferred over a project.
4. Whether staging may use any sanitized production-derived data (default: no).
5. Domain for staging hostnames and who controls DNS.
6. The D-01 option (see [packet](../backend/D01_IDENTITY_DECISION_PACKET.md)) so S-5 and S-6 can be scoped.
7. Permission for Claude to create resources, or a named person who will create them from the manifest.

## 6. Evidence expected after creation

For each resource: creation date, owner, environment name, link/ID (no secrets), the approval it relied on, a smoke
test result, and the teardown plan. Staging is considered ready when the two-Hub fixture can be loaded, a Google sign-in
completes in S-1/S-2 using S-3/S-4, and the allow/deny suite runs against it from CI or a developer machine.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Pricing pages change or disagree (several snapshots differ) | Re-verify immediately before purchase; record the quote |
| Branch billing is outside the spend cap | Prefer a project for long-lived staging, or set a manual weekly check |
| Staging drifts from production | Rebuild from migrations and fixtures; never copy production data without approval |
| Credentials leak into a public repository | Names only in docs; CI secret scanning to be added in R-02b; the repository is public |
| Identity service hosting is unscoped | Resolve D-01 first; S-5 cost is open until then |

## 8. Sources (retrieved 2026-10-23; re-verify)

- Supabase [pricing](https://supabase.com/pricing), [compute](https://supabase.com/docs/guides/platform/manage-your-usage/compute), [branching usage](https://supabase.com/docs/guides/platform/manage-your-usage/branching), [custom OAuth/OIDC providers](https://supabase.com/docs/guides/auth/custom-oauth-providers), [monthly active users](https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users), [point-in-time recovery](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery), [backups](https://supabase.com/docs/guides/platform/backups)
- Render [pricing](https://render.com/pricing), [static sites](https://render.com/docs/static-sites), [custom domains](https://render.com/docs/custom-domains)
- Google [OAuth app verification overview](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview), [brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
- Microsoft [Azure Communication Services email pricing](https://learn.microsoft.com/en-us/azure/communication-services/concepts/email-pricing)
- Stripe [pricing](https://stripe.com/pricing) and [Billing pricing](https://stripe.com/billing/pricing) (reference only; provider undecided)
