# LunchVoice v2 product specification

Status: authoritative v2 target for review and approval; not shipped behavior.
Product authority: founder. Implementation owner after approval: Claude.
Recorded: 2026-10-23. Roadmap/readiness window: **October 23-December 11, 2026**.
Launch aligns with the start of **MJCC Hub Winter Survey 2026**; exact opening
date/time is unconfirmed. December 13 was the earlier provisional target.

## Authority and reading order

Read this document, [CURRENT_STATE_AUDIT.md](CURRENT_STATE_AUDIT.md),
[ARCHITECTURE.md](ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md),
and [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md) together. This suite governs
v2 product intent; `AGENTS.md` and `CLAUDE.md` retain operational, security,
release, and delegation governance. Legacy `README.md`, `PRODUCT.md`, and
`DESIGN.md` are current-product context and reusable design guidance, not the
authoritative v2 feature list.

Sources: the founder's 2026-10-23 execution request and explicit supplemental
requirements in the documentation task, alongside the accessible final exchanges
of **Launch readiness assessment**, conversation
`6adaac36-a254-83ea-a718-226a6f4df1e7`. The chat reader exposed only five exchanges,
reference markers instead of assistant bodies, and no older-page cursor. The
founder supplied the missing finalized decisions directly; those are recorded
here without claiming that the full original chat was retrieved.

**Confirmed** requirements below are founder decisions. **Proposed** labels mark
engineering recommendations, not founder commitments. **Undecided (D-xx)** marks
questions that must be resolved before dependent behavior ships. Neither code
defaults nor a price in another tier settle an undecided policy.

## Vision and domain (V2-01)

LunchVoice evolves from a food-service survey app into a consumer community and
interactive feedback platform. Customizable **Hubs** replace the tenant-facing
organization model. **Campaigns** replace standalone surveys as the broader
product concept; surveys become a Campaign mode. A Hub is the community and
authorization boundary, not a mutable slug. A registered account can join
multiple Hubs. A membership is an accepted account-to-Hub relationship.

Preserve Miami Job Corps / LionCafe as the first operational use case, including
menus, surveys, response history, points/streaks, rewards, orders, and staff
operations where applicable. Support the planned **December MJCC Campaign**,
named **MJCC Hub Winter Survey 2026** and serving as the launch event,
without destructive migration. Exact Campaign date, operator, content, and
legacy feature placement need D-12. Approval of this documentation is not
permission to deploy or modify production.

## Confirmed entitlements and milestones

| ID | Product/rule | Confirmed requirement |
| --- | --- | --- |
| V2-02 | Participation account | Free; one identity can join multiple Hubs |
| V2-03 | Identity | Central KpnSolute Identity at `auth.kpnsolute.com`; Google OAuth/OIDC first, Apple later |
| V2-04 | Hub URL | Canonical `lunchvoice.com/{hubSlug}` |
| V2-05 | Starter Hub | **$13/month**, **3 custom role slots**, **3 custom page slots**, **15 simultaneously active Campaigns**, subject to mode-specific limits |
| V2-06 | Team Hub | **$29/month**, **6 custom role slots**, expanded community pages, advanced analytics and Campaign modes |
| V2-07 | Owner | Protected Owner role does not consume a custom role slot |
| V2-08 | Survey-mode caps | Starter **2** simultaneously active Survey-mode Campaigns; Team **5** |
| V2-09 | Participation gates | Starter **>50%** unique eligible Hub-member participation; Team **>=20%**, to unlock an additional survey |
| V2-10 | Campaign Starter | Standalone seasonal purchase: **$19 for the first 2 weeks**, **+$13 for each additional week** |
| V2-11 | Campaign Plus | Standalone seasonal Team-equivalent purchase; **base price and extension pricing TBD** |
| V2-12 | Campaign windows | Can be scheduled; purchased windows begin when activated |
| V2-13 | Name reservation | Campaign Pass customers: **$25 for 12 months**, renewed for **$25 for another 12 months**, independent of Campaign access expiry |
| V2-14 | Name grace | **25 calendar days from reservation expiration**, then cancel reservation and release exclusive slug claim |
| V2-15 | Discovery | Hubs with **at least 700 valid members** may apply at `discovery.lunchvoice.com`; approval is not guaranteed |
| V2-16 | Beta | Public waitlist first; maximum **50 beta Hub owners** |
| V2-17 | Milestones | **November 12, 2026** proposed waitlist/internal prototype milestone; roadmap **October 23-December 11, 2026**; launch at **MJCC Hub Winter Survey 2026** opening, exact date/time TBD |

The 15-Campaign allowance and two-Survey cap are separate constraints. Team's
total active Campaign cap, exact custom page allocation, advanced-mode matrix,
and Campaign Starter feature mapping remain D-06/D-08. Do not infer unlimited
Team Campaigns or treat the seasonal tiers as recurring Hub subscriptions.
Currency, tax, provider, refunds, trial terms, and subscription failure policies
are D-06. The 25-day rule applies to name reservations; it does not establish
subscription or Campaign grace periods.

## Identity and account journeys (V2-02, V2-03)

- Build centralized KpnSolute Identity; LunchVoice redirects there for login.
  Google OAuth/OIDC is first; Apple is a later phase, not a launch prerequisite.
- Identity provides a verified personal ID, email, and name for LunchVoice
  account mapping. A stable verified identity key, not email alone, links accounts.
- One account can belong to multiple Hubs. Switching Hub must select an accepted
  membership and permissions rather than rewrite a single profile's tenant.
- Migrate existing MJCC authentication and data safely. Preserve identity-to-data
  continuity; do not merge accounts solely because unverified emails match.
- Free participation accounts do not confer creator entitlements. Anyone may
  create a Hub after subscribing, subject to the beta owner cap during beta.
  Campaign Pass purchase and name reservation are separate seasonal journeys.

D-01 must settle the central issuer/client contract, subject/personal-ID mapping,
callback origins, session bridge, account linking, logout/recovery, and legacy
auth transition. This spec does not claim central identity is already deployed.

## Hubs and membership (V2-04, V2-15)

Hub membership supports **public, private, approval-required, and invite-only**
options. Public Hub visibility never automatically grants participation. Owner
settings control member-directory visibility. Only **accepted members** count
toward the Hub membership total. Pending applicants, invitations, and guests do
not count. D-05 must define what makes an accepted member valid, how suspensions
and departures affect totals, and exact admission behavior for each option.

Hubs with at least 700 valid members may apply for discovery listing; **699 is
ineligible, 700 is eligible to apply**, and application is not approval. The
directory lives at `discovery.lunchvoice.com`. Moderation/approval workflow,
ranking, visibility of private Hubs, reapplication, and falling below eligibility
remain D-05. This is not a 700-member cap and not the existing in-Hub survey list.

Canonical Hub URLs use paths. Existing subdomain and LionCafe links need a tested
compatibility/redirect plan; do not remove them merely to change terminology.
Reserve platform route names and avoid collisions with login, pricing, discovery,
and account routes. Exact namespace rules and redirects are D-09.

## Roles and fine-grained permissions (V2-07, V2-18)

Starter has three custom role slots; Team has six. The protected Owner role is
additional and never consumes a slot. Each custom role has a configurable name,
icon, and individually configurable permissions in three categories:

1. **Administration**
2. **Hub Appearance & Structure**
3. **Community & Campaigns**

Each category needs group-wide enable/disable controls as well as individual
controls. Group toggles may change only delegable permissions; they must not
grant ownership-only operations. Only the Owner can delete the Hub or transfer
ownership, and transfer must be secure. All checks are server-side, including
direct API calls, exports, scheduled work, and database access.

Proposed capability vocabulary for D-02 review:

| Category | Example independent capabilities |
| --- | --- |
| Administration | settings, membership admission/removal, directory visibility, role management, billing, slug renewal |
| Hub Appearance & Structure | branding, navigation, page editing, page publishing, page audience management |
| Community & Campaigns | draft/edit, activate/schedule/close, audience targeting, moderate, analytics view/export/publish, shop/newsroom/leaderboard management |

The complete permission catalog, default role templates, multiple-role union or
deny precedence, custom icons, delegation rules, and secure transfer procedure
remain D-02. A role name is not authority. Role edits cannot escalate the editor
or bypass the protected Owner. Ownership transfer must not leave zero or two
effective owners. Deletion requires separate authorization and retention rules;
this documentation phase does not perform it.

## Campaigns, anonymity, and guests (V2-19)

Campaign modes include **surveys, polls, ratings, elections, feedback, and seasonal
activities**. Campaigns support scheduling, QR/join codes, targeting by membership
or role, and analytics. Exact mode-by-tier availability, election procedures,
vote editing, timing, and mode-specific data contracts remain D-08; never imply
that a basic poll already satisfies election requirements.

Anonymity and authentication are independent dimensions:

| Participation context | Membership consequence | Identity disclosure |
| --- | --- | --- |
| Signed-in, eligible member | Existing membership remains | Anonymous Campaign must hide respondent identity from Hub administrators |
| Signed-in nonmember | Does not imply membership | Audience rules decide eligibility; anonymity still enforced |
| Guest, explicitly enabled | No account or membership created by participation | No automatic member perks; apply Campaign privacy policy |

Creators may enable guest access without a LunchVoice account, including for
**privately shared Campaigns when explicitly authorized**. A public page alone
does not authorize guest responses. A private share must be scoped to its
Campaign and approved audience rather than grant Hub access. Guest responses
do not increase membership totals or automatically earn member perks. Exact
deduplication, access-token lifespan, abuse controls, and optional conversion
to membership remain D-03.

Anonymous responses must not reveal respondent identity to Hub administrators
through raw API fields, joins, drill-downs, exports, embedded analytics, or
small-cohort breakdowns. D-10 defines reporting thresholds and operational access.
Keep identity/eligibility receipts separate from administrator-visible answers;
the implementation must test the privacy boundary, not only hide a display name.

## Survey activation gates (V2-08, V2-09)

Starter can have at most **two** active Survey-mode Campaigns; Team at most
**five**. Starter's broader active Campaign cap remains **15**. Meeting a
participation threshold does **not** raise the mode cap. The gate unlocks an
additional survey activation only within applicable caps and valid entitlements.

Let `M` be the approved eligible Hub-member denominator and `R` unique eligible
Hub members who participated in the approved measurement window/scope:

- Starter: `R / M > 0.50`, or `2 * R > M` for `M > 0`.
- Team: `R / M >= 0.20`, or `5 * R >= M` for `M > 0`.
- For 100 eligible members: Starter 50 fails/51 passes; Team 19 fails/20 passes.
  For three members: Starter needs two and Team needs one.
- Duplicate votes or retries never count as additional unique members. Guests
  do not qualify as Hub-member respondents and cannot inflate either count.
- Do not round percentages before enforcing a threshold. Zero-member Hubs need
  an approved bootstrap policy; never divide by zero or silently declare success.

**D-04 remains blocking:** initial allowances; whether the prior, all, or selected
Campaigns supply participation; window length; snapshot versus changing eligible
membership; role-targeted denominator; suspension/leave effects; slot consumption
for scheduled, paused, expired, or reopened Campaigns; and guest-to-member
conversion attribution. Define the additional-activation algorithm before
coding it. Do not invent a paid bypass or interpret closing an unengaged survey
as automatically clearing its gate.

Enforce quota, gate, entitlement, schedule, and audience atomically on the server.
Concurrent activations must not exceed either cap. Reopening and scheduled
activation use the same gate; changing mode cannot evade quotas. The UI displays
active counts, gate scope, numerator/denominator, unmet requirement, and a useful
next action. Existing participation must not be destroyed to free a slot.

## Commerce and seasonal windows (V2-05, V2-06, V2-10 through V2-12)

Hub subscriptions are recurring; Campaign Starter and Campaign Plus are
standalone seasonal purchases. Both use shared server-side entitlement
enforcement. Free accounts remain free to participate. A browser checkout
redirect never constitutes proof of payment.

Campaign Starter price is `19 + 13 * extra_weeks`: $19 for two weeks, $32 for
three, $45 for four. Windows can be scheduled and start on activation, not
automatically at payment. The implementation must persist activation and expiry
once, so retries do not reset the purchased clock. D-08 must define scheduled
activation failure, pause/resume, unused purchases, maximum duration, timezone,
late extensions, and overlap. Campaign Plus is Team-equivalent seasonally;
base and extension prices remain TBD. Do not create a purchasable placeholder
Plus SKU or copy Starter's extension price into Plus.

D-06 defines currency/tax/provider, scope of billing ownership, proration,
downgrades, cancellation, failure/recovery, refunds/chargebacks, and data access
after expiry. Repeated or out-of-order provider events must not duplicate grants
or periods. Never delete responses or private Hub data to resolve an over-limit
or unpaid state. Billing integration details follow provider selection.

## Annual name reservation (V2-13, V2-14)

Campaign Pass customers may purchase an available Hub slug for $25 for 12 months.
Renewal is $25 for another 12 months. Reservation remains valid when Campaign
access expires; the two clocks and entitlements are independent.

| State | Namespace behavior |
| --- | --- |
| Reserved | Exclusive claim for the 12-month term |
| Grace | Starts at reservation expiration; claim remains protected and renewable for 25 calendar days |
| Renewed | Same customer retains claim for another 12-month term |
| Released | After 25 days without renewal, reservation is canceled; another eligible customer may claim the slug |

No early release during grace. D-09 must choose timezone, expiration instant,
anniversary/leap-day treatment, calendar-day boundary, reminder cadence, renewal
term anchoring, and renewal-versus-release race behavior. Do not substitute
business days or an undocumented fixed-hour approximation.

Release removes the exclusive namespace claim, **not** data ownership. A new
claimant must never receive the former owner's memberships, private Campaigns,
answers, analytics, billing, permissions, or tokens. Authorization uses immutable
Hub IDs, not reusable names. Test old links, QR codes, cached pages, private
shares, sessions, and embedded analytics after reassignment. Historical-link
behavior, reservation-only landing page, subscription slug rights, disputes,
transfer, and retention remain D-09/D-10.

## Hub Builder and pages (V2-20)

Hub Builder provides customizable branding, navigation, pages, and live desktop
and mobile previews. Its **three-panel layout** contains page navigation, live
preview, and contextual settings. On narrow screens, preserve all three functions
through a usable responsive layout rather than squeezing desktop columns.

Supported surfaces: **Home & Campaigns, Shop, Leaderboard, Newsroom, Comments,
custom pages, and external links**. Starter has three custom page slots; Team
has expanded community pages. Page visibility and editing permissions are
independent: being able to view a page does not allow editing, and editing does
not automatically authorize public publication. D-11 defines built-in versus
custom slot counting, Team allocation, content blocks, drafts/publishing,
external-link policy, and per-page audiences.

Required journeys also need public pricing, waitlist/beta status, Hub discovery,
Hub landing, account/Hub switcher, Campaign participation/receipt, creator
workspace, membership/role settings, billing/reservation, and support/privacy
surfaces. Exact route names beyond the confirmed Hub/discovery hosts are
implementation choices subject to namespace review. Reuse legacy dining pages
where appropriate; do not equate an existing rewards store with a complete v2 Shop.

## Analytics and privacy (V2-21)

Provide interactive, responsive, state-of-the-art graphs, real-time and historical
results, Campaign comparisons, participation trends, breakdowns, and authorized
exports. Authorized creators may embed or publish analytics in Hub pages.
Team includes advanced analytics; precise Starter/Team boundaries remain D-06.

Define the grain, eligible population, unique-member numerator, time window,
timezone, exclusions, freshness, and guest/member split for each metric. Graphs
need useful filters, accessible labels/table alternatives, meaningful loading and
empty states, and mobile behavior. Do not compare incompatible Campaign question
versions as if their values share a scale. D-10 sets reporting thresholds,
small-cohort suppression, export restrictions, retention/deletion, and permitted
operational access. Anonymous identity stays hidden from Hub administrators in
every reporting surface, including published embeds. Public embeds need explicit
authorization and must not make underlying private responses readable.

## Beta and release (V2-16, V2-17)

Start with a **public waitlist**. Admit at most **50 beta Hub owners**; this is
not 50 responses, 50 members, or an unqualified 50-Hub limit. Admission must be
atomic. D-07 defines unique-owner counting, multiple owned Hubs, transfer effects,
invitations, re-entry, and beta pricing. Do not invent exemptions or free beta terms.

November 12, 2026 is a **proposed** waitlist/internal prototype milestone.
The founder's latest direction requests a roadmap through **December 11, 2026**
and aligns launch with **MJCC Hub Winter Survey 2026** opening. December 13 is the
earlier provisional target, not a confirmed survey date. Claude must confirm the
event schedule and reconcile readiness with it. Preserve and rehearse this survey
as an operational acceptance journey; dates do not waive migration safety.

## Decision register

Founder owns product resolution; Claude proposes options and records impacts.
Central identity owners approve their service contract. Resolve each dependency
with date, decision, owner, and acceptance-test changes before it ships.

| ID | Still undecided | Blocks |
| --- | --- | --- |
| D-01 | Central identity protocol/client/session contract, stable personal-ID mapping, linking, recovery/logout, legacy migration steps | Identity cutover |
| D-02 | Full capability catalog, defaults, role composition/delegation, icon policy, secure owner transfer procedure | RBAC and owner operations |
| D-03 | Guest proof/deduplication, private share lifespan/revocation, abuse limits, consent and conversion | Guest release |
| D-04 | Initial survey allowances, measurement window/scope, eligible snapshots, zero-member behavior, active-state counting and reopen/mode changes | Survey activation gates |
| D-05 | Valid-member definition beyond acceptance, admission option details, discovery review/ranking/delisting, directory field privacy | Discovery/membership finalization |
| D-06 | Team total Campaign/page caps, tier feature matrix, currency/tax/provider, billing ownership, downgrade/failure/refund policies | Commerce and plan enforcement |
| D-07 | Beta unique-owner accounting, transfer/multiple-Hub handling, waitlist admission and beta commercial terms | Beta admission |
| D-08 | Campaign mode contracts/tier mapping, seasonal expiry/extension timing, Plus base/extension prices and season length | Seasonal checkout and advanced modes |
| D-09 | Namespace/redirects, reservation calendar boundaries/renewal anchoring, reminders, subscription slug rights and safe reclaims | Slug lifecycle |
| D-10 | Analytics thresholds/export/retention, anonymous identity protection and operational-access policy | Analytics and privacy release |
| D-11 | Page slot counting, Team page allocation, content blocks, draft/publish and audience details | Builder finalization |
| D-12 | Legacy feature placement/cutover, December MJCC Campaign date/content/operator, compatibility schedule | Operational migration |

Unresolved decisions block dependent behavior, not independent work. Campaign
Plus may be documented as planned/TBD, but cannot be sold until its prices and
terms are approved. Any launch deferral of a confirmed capability needs an
explicit founder decision rather than a silent scope reduction.
