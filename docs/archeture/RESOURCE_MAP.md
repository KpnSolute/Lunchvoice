# LunchVoice v2 resource and dependency map

Recorded 2026-10-23 from repository evidence and the founder's target. **Existing**
means referenced in source/configuration, not verified live access or deployment.
**Required** means needed for the target. **Undecided** means vendor, instance or
owner is unselected. Nothing is provisioned by this map.

## Systems

| Resource | Evidence/status | Needed for v2 | Ownership and readiness evidence |
| --- | --- | --- | --- |
| GitHub `KpnSolute/Lunchvoice` | Existing repo; PR #2 contains this handoff | Reviewed branches, PR CI, migration history and releases | Maintainer; Claude planning/implementation; verify protection/checks |
| Supabase MJCCv2 `qprfonxvthmaoxfixigk` | App target in `supabase/config.toml` and brain files | Postgres, Auth integration, RLS, functions, Realtime, additive v2 model | Project operator to confirm; deployed schema/grants/history still unverified |
| Supabase MJCCv1 `mgvyylvmkxhhataavqjz` | Upstream staff/menu system in governance and functions | Compatibility during migration; not LunchVoice's deployment target | Upstream owner to confirm; supported API and transition proof |
| Render `lunch-line-survey` | `render.yaml`: static build, `dist`, SPA rewrite | Frontend hosting, staging/routing and rollback | Hosting operator to confirm; verify isolation, preview and live settings |
| KpnCompute/MJCC | Staff bridge/menu code references `mjcc.kpnsolute.com` and configured API base | Existing staff/menu continuity | Service owner to confirm; handoff, grants and API compatibility tests |
| KpnSolute Identity `auth.kpnsolute.com` | Required; integration absent from app | Verified personal ID, Google login, OIDC/session mapping; Apple later | Identity owner/repo/hosting TBD; issuer/JWKS/callback/linking proof |
| Google OAuth/OIDC client | Required for central identity | Clients, consent/branding, callbacks and identity claims | Identity owner; environment-specific configuration and login/revocation tests |
| Domain/DNS/TLS | Current hosts/routing in source; live records uninspected | Hub path URLs, discovery/auth hosts, old-link compatibility | Founder-stated 2026-10-23 (not independently verified): `kpnsolute.com` DNS on Cloudflare; `lunchvoice.com` on GoDaddy with a planned move to Cloudflare; hosting on Render. Live records still uninspected; ownership, TLS, routing and callback evidence needed |
| Azure Communication Services Email | `supabase/functions/send-email/index.ts` | Preserve OTP; decide invite/waitlist/renewal delivery | Email operator to confirm; verified sender, delivery/retry/error tests |
| KpnSolute menu events | Signed receiver and receipt migration source; deployment unverified | Preserve menu projection and manual fallback | Producer/consumer owners to confirm; signature/replay/tenant tests |
| Billing provider | Undecided; implementation absent | Subscriptions, seasonal purchases/extensions, annual renewals and reconciliation | Founder selects terms/provider; operator and sandbox lifecycle tests required |
| Scheduled workers | Required v2 jobs absent | Activation, expiry, reminders, 25-day grace release and retry | Scheduler/hosting TBD; owner, timing/concurrency/replay tests |
| Asset/object storage | Branding/page asset design required; upload policy unestablished | Approved types/sizes, scoped upload/read/delete and retention | Provider/owner TBD; evaluate existing platform; no blanket media feature assumed |
| Analytics/exports/publication | Dining charts/views exist | Scoped history/live metrics, suppression, export and aggregate embeds | App/privacy owner to assign; accuracy and disclosure tests; no external vendor assumed |
| Discovery/beta administration | Required; contact form is only a lead form | Waitlist, 50-owner admission, >=700-member application and approval | Founder names reviewer/operator; boundary and permission tests |
| Monitoring/support | Complete v2 operations unverified | Auth/job/event errors, freshness/latency, alert routing, audit retention | Operator/vendor TBD; tested alerts, privacy-safe logs and incident playbook |
| Backup/restore/migration | Recovery proof not collected | Isolated fixtures, reconciliation, restore drill, rollback | Database operator; rehearsal evidence without production experiments |
| MJCC Hub Winter Survey 2026 | Confirmed launch event; schedule/content/operator unknown | Opening/closing times, questions, audience, staffing and fallback | Founder/MJCC operator; event details and rehearsal sign-off required |

## Environments and tools

| Resource | Boundary | Evidence needed |
| --- | --- | --- |
| Local Node/npm/Git and TypeScript/Vite | Development only | Pinned versions, clean install/build and synthetic fixtures |
| Supabase CLI/Docker test environment | Isolated database/auth tests | Replayable migrations and allow/deny/concurrency tests; no production credentials |
| CI | Existing Node 22.12.0 release workflow; PR checks missing | Auth/RLS paths covered; PRs never deploy/tag; advisory remediation |
| Staging | Non-production identity/data/payment/event resources | Environment manifest, test accounts, sandbox integration and migration rehearsal |
| Production | Preserve MJCCv2/Render/upstream services | Separate authority, approved config/migration/rollback and survey launch decision |

Documentation builds used Node 24.22.1, not exact CI-runtime parity. OpenCode/Mimo
wrappers were unavailable in the inspected shell; recheck in Claude's environment
and preserve delegation policy. A resource listed here is not a purchased service.

## Configuration and secret boundaries

Inventory names, purpose, owner, environment and secret-manager reference only;
never secret values in documentation, issues, PRs or browser bundles.

- Public frontend configuration: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` (existing variable name), `VITE_MJCC_MENU_API_BASE`.
  These do not replace authenticated sessions or RLS.
- Server integration: Supabase credentials, MJCCv1/MJCCv2 overrides,
  `LUNCHVOICE_SSO_SECRET`, `APP_ORIGINS`, `KPNCOMPUTE_API_BASE`.
- Email: `SEND_EMAIL_HOOK_SECRET`, ACS endpoint/key or connection string,
  sender and `MAIL_FROM_NAME`.
- Menu events: `KPNSOLUTE_EVENTS_SIGNING_SECRET`, `KPNSOLUTE_TENANT_ORG_MAP`,
  optional manual-sync token and menu API settings.
- Future identity/billing: approved issuer/client settings, server client secrets,
  verification material and webhook secrets; exact names follow integration design.
- `SUPABASE_ACCESS_TOKEN` is developer-tool access, not a browser runtime credential.

## Dependency chain and next action

Identity contract -> account mapping -> accepted memberships -> permissions ->
shared entitlements -> Campaign lifecycle -> privacy-safe analytics/publication.
Builder can use reviewed mock contracts while backend planning proceeds.
Billing/jobs/reservation clocks require integration evidence before sales/release.
Staging, recovery and the event operator are December 9 readiness-review dependencies
(MJCC beta launch December 11; main public release December 23).

Claude must assign a dated roadmap item to every unassigned owner, unknown
environment, undecided provider and missing proof. Live verification is subject
to task scope; provisioning, paid resources, production configuration, secrets,
migrations and deployment require their applicable separate authority.
