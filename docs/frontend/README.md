# Frontend planning and backend contracts

Start with [backend planning](../backend/README.md), then develop UI work against
reviewed identity, membership, permission and Campaign contracts. Follow the
[product spec](../v2/PRODUCT_SPEC.md), [source audit](../v2/CURRENT_STATE_AUDIT.md)
and [roadmap proposition](../backend/ROADMAP_PROPOSITION.md).

| Workstream | Reusable source | Target/dependency |
| --- | --- | --- |
| Entry/login/Hub switching | Main routes, Login, AuthProvider, OrgProvider | Central login, canonical paths, accepted memberships and denied states |
| Participation | Survey, Surveys, Join, rating and Voice screens | Mode-specific content, QR/code, schedules/audiences, guests, anonymity and duplicate handling |
| Creator workspace | ContentCentral | Campaign lifecycle, server-derived quota/gate states, custom roles and protected Owner |
| Hub Builder | Layout and branding references | Navigation/live preview/contextual settings, mobile/desktop previews, drafts/publishing and quotas |
| Community | Existing menu/store/orders/Voice where applicable | Home & Campaigns, Shop, Leaderboard, Newsroom, Comments, custom pages and links |
| Analytics | Dashboard, results and charts | History/live comparisons, exports/embeds, suppression and permissions |
| Commerce/public entry | Marketing/contact | Pricing, seasonal access, renewal/grace, public waitlist, beta and discovery |
| MJCC Winter Survey | LionCafe routes/data | Approved questionnaire/audience, event times, mobile flow, operator controls and fallback |

Claude should create `docs/frontend/EXPERIENCE_PLAN.md` with screen inventory,
navigation, reusable components, API dependencies, permissions, accessibility,
loading/empty/error states, responsive behavior and acceptance evidence. That is
a requested deliverable. A first draft now exists as a proposal in
[EXPERIENCE_PLAN.md](EXPERIENCE_PLAN.md); its design artifacts remain **pending**
because the design manager's downloadable handoff is not yet delivered.

## Design manager and handoff source

The founder designated the [LunchVoice v2 audit and directions Claude Design
project](https://claude.ai/design/p/c84776c9-8b75-446a-a3d0-9e573582e749?file=LunchVoice+v2+Signature.dc.html)
as the design manager. Open it in the authenticated Chrome browser. WSL filesystem
access alone does not establish browser access; report an access blocker if needed.
Use this project for visual direction, screen references and design handoff assets.
The product spec remains authoritative for product rules; log conflicts rather than
silently importing older tenant terminology or prototype entitlements.

Observed in Chrome on October 23, 2026:

- The chat reports core platform, Hub, survey and workspace screens, but identifies
  missing and partial pages. Most screens reportedly still use an earlier flat style;
  samples 7d-7f use the newer tactile direction. This is the design chat's inventory,
  not an independent verification of every screen or implementation completeness.
- Missing/partial work includes plan selection, account settings, discovery,
  privacy/terms, custom pages, news detail, results, people/roles, branding,
  redemptions, moderation, billing, themes, emails and printable QR material.
  Reconcile this inventory against all v2 Campaign modes and backend contracts.
- The visible Signature demo describes `lv-signature.jsx`: a short tail (84px max)
  targets the CTA edge, the lettering loops smoothly every 6 seconds, ghost strokes
  trail it, and an amber endpoint pulses. Calm/default/lively periods are 9/6/4 seconds.
  Reduced-motion mode is specified as a static finished signature and dot.
- The latest chat explicitly says `solute-signature-animated.svg` still has the old
  drifting motion and long line. Do not use that export as the latest animation.
  The raw static SVG is reported unchanged; the lettering is a stand-in pending a
  real signature. The component/export contents have not yet been audited locally.
- Platform LunchVoice branding versus KpnSolute attribution is an unresolved conflict
  raised in that chat; retain the requested signature direction and record the
  attribution decision for founder review.

In `EXPERIENCE_PLAN.md`, map each required screen to its current design artifact,
design status, source date/version, reusable assets, responsive/accessibility states,
backend dependencies and acceptance criteria. Verify downloaded handoff contents
before integration; do not equate prototype claims with tested production code.
Include reduced-motion behavior, CTA alignment across breakpoints and visual review
in acceptance evidence. Record missing screens as design-manager work in the roadmap.

Do not infer permission from a visible button, payment from a redirect, or
anonymity from hiding names. Label mock previews. Preserve LionCafe usability and
deep links until migration is approved. Asset upload formats/limits and storage
remain design work; this handoff does not invent a photo-timeline feature.
