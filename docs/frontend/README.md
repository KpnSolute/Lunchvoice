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
a requested next deliverable, not completed work.

Do not infer permission from a visible button, payment from a redirect, or
anonymity from hiding names. Label mock previews. Preserve LionCafe usability and
deep links until migration is approved. Asset upload formats/limits and storage
remain design work; this handoff does not invent a photo-timeline feature.
