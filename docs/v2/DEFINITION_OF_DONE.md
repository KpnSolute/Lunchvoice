# LunchVoice v2 Definition of Done

This document separates **documentation handoff** from **consumer launch**.
Use the confirmed requirements and decision register in
[PRODUCT_SPEC.md](PRODUCT_SPEC.md). Architecture proposals become implementation
contracts only after review; a TBD must not be silently converted into a default.

## Documentation phase acceptance

- [ ] Five linked documents cover confirmed requirements, current-source evidence,
  target architecture, dependency-ordered roadmap, and measurable acceptance.
- [ ] Founder-supplied supplemental decisions are incorporated; incomplete chat
  retrieval is disclosed rather than represented as a complete transcript.
- [ ] Prices, 3/6 role slots, 3 Starter custom pages, 15 Starter active Campaigns,
  2/5 Survey caps, >50%/>=20% gates, >=700-member application, 50 beta owners,
  annual $25 reservation/renewal, 25-day grace, and milestone dates agree.
- [ ] Campaign Plus base and extension prices remain explicitly TBD; unresolved
  gate, privacy, billing, calendar, and migration decisions have owners and gates.
- [ ] `AGENTS.md` and `CLAUDE.md` are byte-identical; existing security, release,
  delegation, and production-approval governance remains intact.
- [ ] CHANGELOG updated; docs links and required-topic coverage checked;
  `git diff --check`, brain consistency, build, and release-memory check pass.
- [ ] Feature branch pushed and PR opened targeting `main`; no merge/manual tag,
  production migration, secret modification, or deployment performed.
- [ ] Handoff reports PR URL, commit, source audit, validations, limitations, and
  blockers. Supplemental dependency audit findings are disclosed separately from
  the required documentation/light checks; no heavy-release pass is claimed.

Checkboxes are acceptance criteria, not assertions of execution. The PR records
actual results. A passing documentation handoff does not mean the product is ready.

## Evidence standard for implementation

For every relevant criterion below, attach automated tests or reproducible staging
evidence identifying build/commit, environment, fixtures, expected/actual outcome,
and reviewer. Use synthetic accounts in at least two Hubs; test direct APIs as
well as UI. Never use production users or secrets as disposable fixtures.
Compilation, screenshots alone, a migration file, or a visible tool catalog do
not demonstrate effective authorization or deployed behavior.

## Identity, membership, and authorization

- [ ] Central `auth.kpnsolute.com` Google OAuth/OIDC provides verified personal ID,
  email and name; state/nonce/PKCE as applicable, issuer/audience/signature/expiry,
  callback allowlists, replay, cancel/error recovery and logout are tested (D-01).
- [ ] One free account joins and switches between multiple Hubs without overwriting
  another membership or leaking data. Legacy MJCC identity/data mapping reconciles.
  Apple is explicitly later, without a misleading working Apple-login promise.
- [ ] Canonical `lunchvoice.com/{hubSlug}` works, including deep links; legacy
  subdomain/LionCafe links follow approved compatibility behavior.
- [ ] Public/private/approval-required/invite-only membership modes follow approved
  admission rules. Public visibility does not grant response permission.
- [ ] Only accepted valid members count; pending, invited, guest, removed and
  suspended states follow the documented count policy. Owner-configured member
  directory visibility is enforced at the API and UI.
- [ ] Starter allows exactly three custom roles; Team six; Owner consumes none.
  Concurrent fourth/seventh role creation is denied. Names/icons are configurable.
- [ ] Three required permission categories expose both individual and group-wide
  toggles. Tests cover each capability's allow/deny across Hub and resource scope.
- [ ] Only Owner can delete/transfer; a custom role/category toggle cannot confer
  either. Transfer is authenticated, auditable, atomic, and cannot strand the Hub
  or produce two owners. Role assignment cannot escalate the grantor.
- [ ] Revoked membership/roles lose access under the approved freshness policy.
  Forged client state, editable user metadata, cross-Hub IDs, and direct writes
  cannot bypass grants, RLS, lifecycle, or entitlement checks.

## Campaigns, quotas, and participation gates

- [ ] Surveys, polls, ratings, elections, feedback, and seasonal modes satisfy
  approved mode contracts and tier mapping; scheduling, QR/join codes, member/role
  targeting and analytics work for each applicable mode.
- [ ] D-04 explicitly defines initial allowances, measurement window/source,
  eligible population, zero-member policy, role targeting, scheduled/paused/expired
  slot use, close/reopen, mode change, and guest-to-member conversion effects.
- [ ] Starter's 15 total active Campaign cap and two active Survey-mode cap are
  enforced independently; Team's five-Survey cap and approved total cap are enforced.
  Test final available slot and simultaneous activations across modes.
- [ ] Additional Survey activation requires >50% Starter / >=20% Team participation
  **within** those caps. Gate success never creates a third Starter active survey.
- [ ] Scheduled activation and reopen call the same server checks as manual
  activation. Direct updates, mode changes, concurrent jobs, retries, and stale
  screens cannot bypass limits.
- [ ] Closing or expiry preserves historical responses. Survey revision changes
  cannot reinterpret old answers without version metadata.

Minimum gate fixtures (plus approved D-04 cases):

| Case | Required result |
| --- | --- |
| Starter, M=100, R=50 then R=51 | Fail then pass participation condition |
| Team, M=100, R=19 then R=20 | Fail then pass participation condition |
| Starter, M=3, R=1 then R=2 | Fail then pass; no percentage rounding bypass |
| Team, M=3, R=0 then R=1 | Fail then pass |
| M=0 | Approved explicit bootstrap outcome; no division error or accidental pass |
| Same member submits twice/retries | At most one qualifying respondent |
| Guests submit many responses | Neither eligible-member numerator nor membership total increases |
| Pending applicant participates | Cannot count as accepted eligible member |
| Two requests consume final slot | At most one activation succeeds |
| Gate passes but Survey cap already full | Additional Survey activation denied |
| Two Survey Campaigns plus 13 other modes on Starter | Total 15; another Campaign denied regardless of mode |

## Guests and anonymity

- [ ] Guest-enabled public Campaign works without a LunchVoice account; guest
  participation on an explicitly authorized private share also works. Disabled,
  expired, revoked, wrong-Hub, or forged shares fail without exposing content.
- [ ] Guests do not become members, count in member totals/gates, or automatically
  receive member perks. Abuse limits/deduplication and optional conversion match D-03.
- [ ] Authenticated anonymous participation works separately from guest access.
  Hub administrators cannot identify anonymous respondents through raw answers,
  IDs, joins, timestamps, logs, exports, comparisons, breakdowns or embeds.
- [ ] D-10 reporting thresholds and suppression apply consistently across UI,
  APIs, filters, exports and public publication; small-cohort/differencing cases
  are tested. Operational identity access follows a separate approved policy.

## Commercial lifecycle and namespace

- [ ] Free participant accounts, $13/month Starter and $29/month Team entitlements
  match all approved feature/role/page/Campaign quotas server-side.
- [ ] Campaign Starter and Plus are standalone seasonal purchases, not recurring
  Hub subscriptions. Starter costs $19/two weeks and $13/extra week; test $19,
  $32, and $45 examples. Plus base/extension prices are approved before checkout.
- [ ] Scheduled purchased windows start upon activation. Repeated activation or
  payment notifications do not restart the clock or extend access twice.
- [ ] Forged checkout success, duplicate/out-of-order events, payment failure,
  renewal, cancellation, chargeback, downgrade, and over-limit content match D-06.
- [ ] $25 buys 12 months of slug reservation; $25 renewal buys another 12 months.
  Campaign expiry does not cancel a still-valid reservation.
- [ ] Grace begins at reservation expiration and protects the slug for exactly
  25 calendar days under the approved timezone/boundary rules. Renewal in grace
  retains it; after grace without renewal, cancel reservation and release claim.
- [ ] Test just before/at expiration and grace deadline, leap-year anniversary,
  DST where relevant, delayed/retried release jobs, and renewal/reclaim races.
  Concurrent eligible claims produce one winner, never two owners.
- [ ] Reclaim grants a new customer no old private data. Test previous sessions,
  URLs, QR codes, private shares, exports and analytics embeds after reassignment.
  Private data remains bound to immutable Hub IDs under the retention policy.

## Builder, analytics, discovery, and beta

- [ ] Three-panel Builder has navigation, live preview, contextual settings,
  branding, desktop/mobile previews, and responsive controls.
- [ ] Home & Campaigns, Shop, Leaderboard, Newsroom, Comments, custom pages and
  external links follow approved content contracts. Starter custom-page quota
  is three; built-in versus custom counting and Team limits are documented.
- [ ] Page view, edit and publish permission are independent and server-enforced.
  Preview, published content and audience rules agree; rich content and external
  links are validated under the approved policy.
- [ ] Interactive responsive graphs cover real-time/history, Campaign comparisons,
  participation trends and breakdowns. Each metric has documented grain/window,
  counts, freshness, accessible representation, and member/guest separation.
- [ ] Authorized exports and Hub-page analytics embeds work; unauthorized/private
  data cannot be published, and unpublishing/revocation prevents later access.
- [ ] Discovery at `discovery.lunchvoice.com`: 699 valid accepted members cannot
  apply; 700 can apply; pending/unapproved applications never become listings.
  Approved review/delisting and privacy policies work.
- [ ] Public waitlist precedes beta admission. Maximum 50 beta Hub owners enforced
  atomically, including simultaneous 50th/51st admission and approved transfer,
  multiple-Hub and re-entry rules. No invented beta exemptions or pricing.

## Operational release gate

- [ ] Dependency high-severity release audit passes after separately reviewed
  remediation; remaining advisories are assessed and disclosed. Required checks
  run for PRs and include actual auth/RLS paths, not obsolete directory patterns.
- [ ] Brain/build/release checks plus appropriate integration, authorization,
  billing, concurrency, privacy, migration and end-to-end tests pass in the
  approved CI runtime. No secrets or accidental generated files are committed.
- [ ] Non-production migrations replay and reconcile IDs, row counts, response
  links, points, orders, menus, permissions and memberships; interrupted runs and
  rollback are rehearsed without losing newly accepted responses.
- [ ] Named MJCC operator completes the December Campaign journey in staging;
  LionCafe legacy compatibility, identity transition, and fallback are approved.
- [ ] Mobile/desktop keyboard navigation, focus, contrast, reduced motion,
  error/loading/empty states, and privacy disclosures pass acceptance review.
- [ ] Agreed performance/freshness/load objectives are measured; backup/restore,
  job retry/reconciliation, alerts, support ownership and rollback runbooks exist.
- [ ] Founder reviews unresolved risks and explicitly approves any deferred
  confirmed scope. November 12 remains proposed and December 13 remains a target;
  neither date waives acceptance criteria.
- [ ] Production migration/deployment authority is obtained separately. The
  documentation task itself has performed no production operation.
