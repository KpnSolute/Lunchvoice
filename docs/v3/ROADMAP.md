# LunchVoice V2.x and V3: what is deliberately not in V2

Source: the founder's Google Doc "LunchVoice — Innovation Concepts and Product Roadmap — 2026-11-11" (all four
addenda, read 2026-11-12). That document is a proposal, not an approved specification. This file records where each
idea is placed so no agent builds V3 work into V2, and so nothing below is advertised as available. Where the doc's
addenda conflict, the later one wins ("What we built and decided", 2026-11-11 to 12).

**Rule for every page and plan:** nothing in this file is shipped. Product pages, pricing and the Products menu must
not describe any of it as available (`src/config/products.json` is checked against this list).

## Still V2 (launch), not V3

These belong to V2 and are tracked in `docs/v2/V2_STATUS_2026-11-12.md`, not here:

- Quick Surveys, Hubs, Campaigns, roles, safe results, Discover, community pages, API, webhooks, the Discord bot.
- Feedback types (Poll, Rating, Yes/No, Open feedback, Election) and elections with election night (000036 to
  000038): applied to production 2026-11-12 with founder approval.
- Trends (a group of surveys) for Hubs and Campaign passes, and solo Creator plans for one person without a Hub:
  founder direction 2026-11-11 ("billing has not opened, so the plan structure changes now, before launch"); prices set
  2026-11-12 at $12 and $27 a month. Spec: `docs/v2/TRENDS_AND_CREATOR_PLANS.md`.
- The six product pages and site menu (live since PR #68).
- Closing launch gaps: deliver or remove the Team claims "enhanced Campaign modes" and "advanced analytics"; prove a
  real Checkout → webhook → entitlement → refund path.

## V2.x (after launch, validate before building more)

| Item | Notes |
| --- | --- |
| Hub Pulse | One featured question of the day or week per Hub, built on existing Campaigns/polls; no parallel voting store. Moved from V2 to V2.x on 2026-11-12 |
| Community goals | Shared, noncompetitive progress bar to a participation milestone; unique eligible participants; suppression so anonymous participation cannot be inferred |
| Weekly recaps | Creator-triggered first; automation only once scheduling and opt-in delivery are proven |
| Community Missions | Small pilot on existing campaign, poll and news records |
| Collective achievements | Simple, consent-safe milestones (the Hub badge catalog proposal in `docs/v2/handoffs/2026-11-12-site-and-hub-identity-prompt.md`) |
| Connected Communities, expanded | Discord slash-command expansion (results, election and Pulse commands, closing-soon posts, Voted role), attribution links, creator-approved recaps posted back |
| Manual idea-to-Campaign | Create a Campaign from a linked discussion; no ingestion of private messages |
| Two-option "battle" polls | Only if Campaign modes allow; tournaments are V3 |
| Community Radar (first-party) | Link attribution and completion by channel, from LunchVoice's own data only |
| Shareable result cards, Discover feed | Vertical cards for Instagram and TikTok |

## V3 (consumer): differentiated, multi-stage

| Item | What it is | Guardrails from the doc |
| --- | --- | --- |
| **Community Decision Engine** (centrepiece) | Turn a finished Campaign into a decision: evidence snapshot, 2 to 5 proposals, optional second vote, published decision with an accountable owner, action timeline, follow-up date | Eligible-voter scope, minimum counts, moderation, explicit decision authority, auditable status changes. Assists deliberation, never automatic governance |
| **Outcome Intelligence** | Link baseline Campaign, intervention and follow-up; show change, sample sizes, comparability and caveats | Association, never causation; suppressed aggregates never shown as zero; exports cannot undo anonymity |
| Live Consensus Rooms | Time-boxed moderated rooms: proposal cards, reactions, aggregate reveals | No group breakdowns below cohort thresholds; attendance never proof of an answer |
| Seasonal Community Quests | Multi-week goals and optional rewards | Points participation-neutral; no reward for a particular answer |
| Living Surveys | Creator-approved follow-up question suggestions; versioned research threads | Never edits a live survey; no profiling from anonymous answers |
| Feedback Passport | "Issues I follow" and decision updates on the existing account | Never joined to anonymous answers; no second profile system |
| Cross-Community Insights | Opt-in, threshold-safe benchmarks between Hubs | Only after comparability and privacy review |
| **AI layer** | Survey Copilot, open-text theme analysis, Decision Brief, Outcome Narrator, Recap Writer, Pulse Planner, moderation assist, translation, later "Ask your results" | Every AI feature sees only what the owner could already see; never presented as fact or as the final decision |
| Integrations | Cross-community distribution engine; Reddit only after Reddit grants commercial API access; Slack, Teams, Discourse | Integrations are not partnerships; no scraping, bulk DMs or stealth automation |
| Idea Forge, Community Memory, Matchmaking | Governance-grade idea intake; structured decision history; consented distribution directories | No archiving of whole servers; no cross-platform follower graph |

Proposed (not implemented) Decision Engine tables: `decision_sessions`, `decision_proposals`, `decision_votes`,
`decision_actions`, `outcome_measurements`, `decision_events`. Proposed integration tables:
`connected_platform_accounts`, `distribution_destinations`, `campaign_distributions`, `delivery_jobs`,
`integration_audit_events`. Any real migration follows the `lv`/`lv_api` model, RLS and entitlements.

## V3 Enterprise: LunchVoice Intelligence Network (separate program)

Not part of consumer V3 and not promised. Gate 0: V2 stable, Team claims delivered or corrected, real billing verified,
privacy tests passing, connectors authorized, pilots and a threat model.

| Code | Name | Phase |
| --- | --- | --- |
| E8 | Reality Check: research reliability diagnostics | Alpha |
| E6 | ProofChain: verifiable research provenance | Alpha |
| E1 | Echo: evidence gaps and follow-up drafts | Beta |
| E5 | Contradiction Engine | Beta |
| E4 | Agent Bridge: governed research for enterprise AI agents (API, MCP, webhooks, human approval) | Integration phase |
| E7 | Research Swarms: multi-perspective AI review | Advanced optional |
| E3 | Signal Mesh: privacy-preserving cross-community intelligence | Advanced optional |
| E2 | TwinLab: decision scenarios | Advanced optional; predictive digital twins and federated computing are V4 research |

## Non-goals at every stage

A general-purpose social network, chat or feed inside LunchVoice; a paid respondent panel; customer-specific code
(no Hub is pre-created or special-cased); invented predictions, uniqueness or partnership claims; marketing to or
data workflows for minors before counsel review.
