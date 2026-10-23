# LunchVoice v2 — Product, Architecture and Delivery Specification
**Version:** 1.0 · **Prepared:** 2026-10-23 · **Status:** founder-approved requirements with explicitly identified open decisions · **Target:** 2026-12-13, launch subject to gates.
**Authoritative handoff:** This document governs v2 planning. Existing MJCC implementation remains operational until migration is proven. It is NOT evidence of production readiness.

## 1. Product mission, users and scope
LunchVoice is a consumer-facing community, Campaign and feedback intelligence platform. Any account holder may join eligible Hubs; anyone may visit public Hub surfaces; Hub owners can publish Campaigns and manage branding, pages, member roles, currency, analytics and moderation. A configurable Campaign may accept guest responses without account or Hub membership. The first migrated Hub is LionCafe/MJCC, not a second duplicate tenant. Keep dining-specific functionality as an optional specialized experience, not a universal requirement.

Vocabulary: **KpnSolute Identity** = cross-product login; **Account** = platform principal; **Hub** = independent community; **Member** = accepted account-to-Hub relationship; **Role** = Hub-defined grants; **Campaign** = multi-mode activity; **Session** = participation window; **Page** = Hub content surface; **Hub currency** = isolated reward ledger; **Guest** = unauthenticated respondent, never a member; **Reservation** = time-limited exclusive slug entitlement. Existing `orgs` and `org_id` may be retained as backing identifiers through migration; terminology visible to consumers becomes Hub.

## 2. Founder-approved commercial contracts
| Product | Price | Entitlements |
| --- | --- | --- |
| Starter Hub | $13/month per Hub | 3 configurable role slots; 3 custom pages plus required Home; 15 simultaneously active Campaigns total, subject also to Survey-mode limit; core charts and rewards |
| Team Hub | $29/month per Hub | 6 configurable role slots; supported page types; enhanced modes, segment access, advanced analytics; Team overall Campaign cap **OPEN** |
| Campaign Starter | $19 for up to first 2 weeks, then $13 per additional week | Seasonal Starter-equivalent feature bundle, but a single purchased Campaign Pass; see composition note |
| Campaign Plus | **OPEN base and extension price** | Seasonal Team-equivalent feature bundle (NOT a Team recurring subscription, NOT an add-on) |
| Hub Name Reservation | $25 / 12 months | Optional for Campaign Starter/Plus customers; protects available `lunchvoice.com/{slug}` while pass inactive |

One Hub subscription covers one Hub; participant accounts are free. Creation of a billed Hub is available to any account holder once verified subscription payment is active, with no application requirement. During the capped beta, up to 50 Hub owners receive invitation-based beta entitlements; clearly disclose any charge. Entitlements, plan limits, tax, receipts, invoices, cancellations, billing retry, renewal and failed-payment states are server-side; never infer access from client flags. Do not automatically charge beta accounts without consent. Billing provider is **OPEN**. No silent data deletion on downgrade or expired pass.

**Seasonal name reservation:** 12 calendar months from purchase; annual renewal $25. On expiration enter **GRACE** for exactly 25 calendar days; existing holder may renew at $25; during grace name cannot be claimed by anyone else. If no successful renewal by grace deadline, atomically cancel reservation and release name. Reservation states ACTIVE → GRACE → RELEASED (retain history). Ownership/reservation uniqueness locked transactionally, normalized case-insensitive slug and reserved-name validation. Losing slug does not transfer or expose Hub data, does not delete content, and does not grant new owner the old Hub. Display exact UTC expiration and grace deadline in account timezone. Renewals before expiry extend from existing expiry; renewals during grace extend from prior expiry **proposed, confirm customer-facing billing disclosure**. No entitlement to active Campaigns from reservation alone.

**Campaign duration examples:** Starter 2 weeks $19, 3 weeks $32, 4 weeks $45, 6 weeks $71 (pre-tax). Activation window begins scheduled start; expiration closes responses, preserves permitted results. Plus amounts remain OPEN; never manufacture them. Distinguish auto-renew Hub subscriptions from prepaid scheduled passes.

## 3. Survey engagement gating (source-of-truth rules)
Starter: at most **2 concurrently active Survey-mode Campaigns**; to activate another qualifying Survey, **strictly more than 50%** of Hub's eligible members must have participated. Team/seasonal Plus: at most **5** concurrently active Survey-mode Campaigns; threshold **at least 20%**. Survey caps coexist with Starter's 15 simultaneous *all-mode* Campaign limit, whichever is tighter. Team all-mode Campaign cap remains OPEN. Draft/scheduled/closed/archived are not active, but activation including scheduled transitions must pass checks transactionally. Existing active slots are provisioned to start a Hub; no gate before initial capacity use. Subsequently require (a) free slot and (b) engagement qualification from a prior eligible Survey. Suggested deterministic v1 computation: most recently closed qualifying Survey, snapshot eligible active accepted members at launch, unique eligible authenticated member respondents; exclude guests/bots/pending/banned; threshold by comparison count > 0.5 * denominator Starter, >=0.2 * denominator Team. Avoid indefinite deadlock for zero-member or very new Hubs: maintain startup allowance and display clear remediation, manual policy exceptions only by platform-authorized process. **OPEN:** whether gate is evaluated on most recently completed Survey or rolling window, and whether new surveys count as 'created' versus 'activated'. Engineering must not silently choose this commercially material interpretation; default recommendation is gate activation. Audit exact denominator/numerator and prevent duplicate credit.

## 4. Identity and migration
Canonical central authentication entrypoint: `https://auth.kpnsolute.com`. Google OAuth first, Apple deferred. Implement standard OIDC authorization code + PKCE, strict issuer/audience/nonce/state/redirect validation, server exchange, rotating signing keys and secure token/session lifecycle. LunchVoice stores external `issuer + sub` to stable internal account ID; sync verified email and name as profile attributes, NEVER treat matching email or client-provided user ID as proof of access. No secret on frontend. Global account can join multiple Hubs; current one-`profile.org_id` model must be redesigned without implicit sign-out across Hubs. Define unlink/link, account recovery, logout and breach revocation policy. Preserve MJCC staff SSO and legacy student OTP during migration until tested replacement, preserve data and upstream MJCCv1 permissions. Do not deploy central identity without separate authority and a backward-compatible migration.

## 5. Hubs, routes and membership
Canonical Hub route: `https://lunchvoice.com/{hubSlug}`; root is consumer marketing/discovery. Reserve system prefixes (auth, api, admin, discover, pricing, etc.), normalize unicode/case and redirect old `/{orgSlug}` + `{orgSlug}.lunchvoice.com` links without breaking QR entry. Existing wildcard subdomain tenancy is compatibility, not new canonical. Discovery is `https://discovery.lunchvoice.com`; minimum **700 valid accepted active members** allows application, not auto-feature. Moderation and authenticity review required.

Membership lifecycle: none → pending/ invited → accepted → left/removed/banned; only accepted active members count. Independently model Hub profile visibility (public, unlisted, hidden), membership entry (open, approval, invite), page visibility (public/member/role) and Campaign response eligibility. Hub may be visible to outsiders while interaction stays blocked. Hub owner chooses member-directory visibility: public, members, moderators, hidden, subject to individual privacy/safety controls. Guests never become members and never count for discovery/thresholds; public or invited private Campaign links may allow guest replies ONLY when owner enables it per Campaign; invitation to a private Campaign never leaks private Hub pages.

## 6. Role-based access controls
Owner is protected system authority, not paid custom role slot; transfer ownership via recent reauth + recipient acceptance + audit. Owner-only deletion, transfer and billing-owner operations are non-delegable. Starter 3 / Team 6 **custom** role slots; Everyone and Member are platform baselines, not slots. Custom roles have unique Hub-scoped IDs, icons, names and member assignments. Permission groups are UI convenience only; each atomic permission is independently settable. Aggregate grants across multiple roles (logical OR), with hard-deny platform and content security invariants; enforce on every backend write and sensitive read, never UI only. Owner cannot give admin a bypass of platform policy or anonymous respondent linkage.

**Administration**: configure Hub; manage roles; assign roles; approve members; kick/ban; moderate; view audit log.
**Appearance & Structure**: edit branding, navigation, pages, publication, page access; configure currency/rewards/shop; public/private/invite controls.
**Community & Campaigns**: create/edit/publish/pause/close Campaigns; choose eligible roles; post and moderate content; view private analytics; publish approved graph widgets; manage events/elections.
Default deny, role changes versioned and audited; test unauthorized direct RPC/API and stale permissions.

## 7. Campaigns, guests and privacy
Modes: Survey, Poll, Rating, Open Feedback, Election, Seasonal (scheduling applies to each; do not duplicate engines). Campaign state machine draft → scheduled → active ↔ paused → closed → archived. Distinguish Campaign from Session and question template. Audience: public guest, any authenticated user, Hub member, specific roles, invitation, private premium-member groups when supported. Response identity mode: attributed or anonymous, independent of requiring login. Secure/restricted Campaign needs an account unless an explicit scoped guest invitation is configured. Guest entry creates a scoped response token, not an account or member; rate limits/CAPTCHA/abuse defenses; one-person-one-vote cannot be strongly guaranteed for unauthenticated guests. For high-integrity elections prohibit guests by default, require explicit documented exception.

Anonymous participation: store verification/dedupe and reward eligibility separately from content answers; do not expose recoverable subject mapping to Hub admins, analytics, logs, export or embeds; protect timestamps/small cohorts/role filters. Anonymous means responses are not linked to user name in accessible results, with explicit disclosure of platform-side minimal metadata for abuse enforcement. Currency issuance is transactional and Hub-scoped, based on completion, never answer content.

## 8. Hub Builder, media, rewards and analytics
Hub Builder = left pages/navigation; center responsive live preview; right selected-page settings. Core Home/Campaigns page excluded from Starter's 3 custom page quota; Team has all supported page types, page-count fair-use limit **OPEN**. Page types: Shop, Leaderboard, Newsroom, Comments, custom safe-block pages, links. No arbitrary user JS/HTML. Draft/publish workflow, permissions, versioning and preview tests.

State-of-the-art means **correctness, privacy, exploration and accessibility**, not just animated charts: live counts, unique vs total submissions, completion/dropoff, trend series, distribution, segment and session comparison, filters, export, shareable graph widgets embedded in pages with permission checks at query time, accessible tabular equivalents, labels, loading/empty/error states and reproducible calculations. Team gets enhanced segmentation; exact free/basic vs Team widget matrix must be finalized. Hub rewards/currency ledger: immutable credited/debited transactions, per-Hub balances, idempotent issuance and redemption, fraud and refund handling; never global convertible value by accident.

## 9. Proposed target architecture / API / data model
Keep React/TypeScript/Vite + Supabase/Postgres as migration baseline unless evidence demands change. Introduce services/modules incrementally:
- `accounts`, `external_identities`, `hub_memberships` separated from legacy `profiles`; KpnSolute Identity outside LunchVoice's database is canonical auth authority.
- `hubs` (or backward-compatible `orgs`), `hub_slugs`/reservation ownership ledger, `hub_invites`, `hub_roles`, `hub_role_grants`, `hub_member_roles`, `hub_pages`/revisions, `hub_settings`.
- `plans`, `plan_entitlements`, `subscriptions`, `campaign_passes`, `slug_reservations`, `payment_events` (idempotent webhook receipt).
- `campaigns`, `campaign_sessions`, `campaign_audiences`, `participation_claims`, `response_records`, `question_answers`, `guest_tokens`; segregate anonymous answer storage and respondent proofs.
- `hub_currency_ledger`, `reward_items`, `redemptions`, `moderation_events`, `audit_events`, `discovery_applications`, `analytics_publications`.

**Illustrative API contracts, not existing endpoints:** `POST /api/hubs` (requires verified paid entitlement), `POST /api/hubs/:id/join`, `PUT /api/hubs/:id/roles/:roleId`, `POST /api/campaigns/:id/activate` (transactionally checks slots + participation), `POST /api/campaigns/:id/guest-tokens`, `POST /api/campaigns/:id/responses`, `GET /api/campaigns/:id/analytics`, `POST /api/slug-reservations`, `POST /api/billing/webhooks`; design idempotency keys, permission boundary and error schema before implementation. No production API assumed to exist merely because listed here.

**Migration:** inventory current live schema, snapshots/restore rehearsal, design additive migrations, map LionCafe org→Hub, preserve old IDs/QR/session links, avoid duplicating profiles or currency, backfill membership, test RLS for two disjoint Hubs + guests, run shadow reads and rollback rehearsal. Keep staff bridge until explicit acceptance. Production migrations, live auth changes, billing activation and domain changes require separate authorization.

## 10. Current code vs target gap audit (repo source inspected 2026-10-23; live deployment not certified)
| Workstream | Existing evidence | v2 delta | Status |
| --- | --- | --- | --- |
| Frontend | `src/main.tsx`: marketing, legacy redirects, wildcard host→org route; Vite app | canonical `/{hubSlug}`, consumer navigation, Hub Builder | REDESIGN |
| Organization | `src/org/OrgProvider.tsx` reads `orgs` by slug; tenantBrand | Hub profile, visibility, joining, directory, custom pages | REDESIGN |
| Identity | `src/auth/AuthProvider.tsx` Supabase session + single org profile/mismatch sign-out | central OIDC and multi-Hub accounts | REPLACE/MIGRATE |
| MJCC bridge | README + `supabase/functions/staff-sso`, `staff-status` and login | transition with permission parity and rollback | PRESERVE |
| Campaign lifecycle | README + Content Central, `sessions`, `survey_templates`, `responses`, `join_session`, `submit_response` | Campaign aggregate, modes, audience/guest, engagement gates | EXTEND/REDESIGN |
| Rewards | `store_items`, `orders`, `redeem_item`, point/streak logic | generic Hub currency ledger, isolation, fraud audit | EXTEND |
| Reports | Content Central results and charts; `src/components/charts.tsx` | analytics platform, export policy, embeddable ACL graphs | EXTEND/REDESIGN |
| Tenant RLS | `org_id` convention, `caller_org_id` per AGENTS | joinable multi-Hub authorization; guest-only access, anonymous separation | SECURITY REWRITE |
| Pages/roles | No implementation proof of consumer Hub Builder/6 custom RBAC roles in inspected files | new page schema, role grants, permission editor | NEW / VERIFY |
| Pricing/reservations | No subscription/slug reservation implementation proof in inspected source | billing, plan entitlements, seasonal passes, grace jobs | NEW / VERIFY |
| OAuth | README documents email OTP + MJCC staff SSO | auth.kpnsolute.com and Google OAuth | NEW |
| Delivery | `render.yaml` static Render site; `package.json` check:brain/build/audit scripts; CHANGELOG says CloudEvents not deployed | CI unit/integration/E2E, restore/load/accessibility/monitoring | EXPAND |
| Discover | existing marketing home, org lookup | discovery application, review, 700 threshold | NEW |

**Evidence limits:** source audit is representative, not a full runtime/database audit. Do NOT label missing feature as absent until all source/migrations and deployed services searched. Do NOT label existing feature functional until tested. Previously captured `MULTI_TENANT_PLAN.md` is historical design, not the v2 authority. Verify git/Render/Supabase reality in Phase 0.

## 11. Execution phases, ownership, dependencies and dates
**Phase 0 (Oct 23–28):** Claude governing agent inventories full repo, deployed commit, Supabase migrations, route map, workflows, tests, license/assets and actual production configuration; produces evidence ledger, risk register, approved design token kit, work-breakdown + issues. No live writes.
**Phase 1 (Oct 29–Nov 12):** consumer landing + 50-owner waitlist, frozen UX map/Hub Builder prototype, identity design and OIDC mock, schema contracts, CI/security baseline; demonstrate static preview, do not claim full v2.
**Phase 2 (Nov 13–25):** secure identity integration; additive Hub/membership/RBAC migration; subscriptions and reservation engine with fake provider; Campaign eligibility and guest access; test parallel tenant boundaries.
**Phase 3 (Nov 26–Dec 5):** verified provider sandbox billing; builder, rewards, analytics, Discover review, MJCC migrated rehearsal; capped invited beta.
**Phase 4 (Dec 6–12):** accessibility/mobile/device testing, threats and abuse, performance, backup-restore, rollback, end-to-end purchase→create→join→respond→export tests, support/policies; release candidate.
**Dec 13:** conditional GO/NO-GO. No launch with critical security, data-loss, anonymity, isolation, payment or identity defect. If not ready, ship safe waitlist/pilot rather than claim full production.

Agent responsibilities: Claude = governing architecture, backend/infrastructure coordination, evidence and release review; UI agent = component system/Hub Builder/mobile; API/data agent = Postgres/RLS/RPC/billing/identity integration; QA/security agent = threat model, automated E2E and privacy; owner = commercial and unresolved policy approvals. No delegations bypass review. PRs small and CI-gated.

## 12. Definition of Done, objective gates
Every work item: testable acceptance criteria, UI+API paths, migration+rollback, automated tests, error/empty/loading states, mobile/a11y, permission tests, logging without PII/secrets, updated docs/CHANGELOG, green build/CI, reviewed diff and merged PR.
Required `npm run check:brain`, `npm run build`, relevant focused tests and `npm audit --audit-level=high`; add test suites where missing, not assume that build is E2E. Validate both agent files byte-for-byte identical.

**Release integration evidence:**
1. New Google account via auth.kpnsolute.com, issuer/sub mapped safely; session/logout/revoke and multi-Hub switching correct; legacy MJCC access remains.
2. Paid Starter and Team purchase/cancel/downgrade and failure/retry enforce permissions server-side. No phantom entitlement on failed webhook. Beta billing disclosure clear.
3. New Hub creator gets canonical slug, Owner, memberships, 3/6 roles, page caps, effective permissions; unauthorized direct API calls denied.
4. Public/hidden/invite/approval Hubs show right visitor, member, mod and admin UI; count matches accepted active members; directory setting enforced.
5. Survey 2/5 concurrency, 50% strict versus 20% inclusive threshold boundary tests, member denominator snapshot and scheduled activation race safety; overall 15 Starter Campaign cap.
6. Logged-in and guest public/private-invited Campaigns have correct eligibility; guests never counted as members and cannot access private pages. Duplicate vote abuse tests documented.
7. Anonymous answers cannot be tied to usernames via Hub admin API, exports, analytics, timestamps or graph embeds; privacy thresholds and restricted elections tested.
8. Hub currency and redemptions transactional, isolated; repeated webhooks/submissions do not double-award.
9. $25/12-month slug protected while pass idle; renew at active/grace; 25-day deadline crossing releases atomically; old Hub data never exposed to new claimant.
10. Discover applicant ≥700 verified active members, review/denial flow, fraud guards; hidden Hub stays hidden.
11. Analytics source metrics reconcile against DB truth, correct cross-segment visibility, chart rendering + table alternatives, exports and embeds enforce ACL.
12. Test migration rehearsal (row totals, checksums/IDs, old QR aliases), actual backup restore, rollback, availability and deploy smoke, load budget and incident response.
13. Re-run MJCC December seasonal campaign end-to-end using compatible accounts, without production data loss.
14. Final GO/NO-GO signed by owner with linked CI logs, coverage report, performance/a11y results, security findings, deployment artifact SHA and rollback procedure.

## 13. Decisions requiring founder signoff, not guesses
Campaign Plus base and extra-week price; Team total concurrent Campaign allowance; survey unlock exact history window/qualifying unit; Starter page and Team page fair-use boundaries; guest response retention and abuse limits; analytics small-cohort threshold and export scopes; reservation renewal date anchor; refund, tax, cancellation, billing retry, reservation reminder schedule; moderation/underage user policy. Treat suggested engineering defaults as proposals, not locked policies. Document each in `docs/v2/DECISIONS.md` before production billing or enforcement rollout.
