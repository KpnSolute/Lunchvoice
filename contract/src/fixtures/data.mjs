// Deterministic synthetic data for the contract. Nothing here is real: no real people, Hubs, survey content or
// policy values. Hub names are deliberately generic; MJCC/LionCafe settings are NOT modelled here.
// Identifiers are fixed so mock adapters, SQL tests and screenshots stay stable between builds.

const pad = (n) => n.toString(16).padStart(12, "0");
export const id = (group, n) => `00000000-0000-4000-8${String(group).padStart(3, "0")}-${pad(n)}`;

export const HUB = { one: id(1, 1), two: id(1, 2) };
export const ACCOUNT = { alex: id(2, 1), sam: id(2, 2), priya: id(2, 3), jordan: id(2, 4) };
export const ROLE = { surveyor: id(3, 1), moderator: id(3, 2) };
export const CAMPAIGN = { draft: id(4, 1), scheduled: id(4, 2), active: id(4, 3), closed: id(4, 4), expired: id(4, 5), anonymousActive: id(4, 6) };
export const QUESTION = { rating: id(5, 1), choice: id(5, 2), text: id(5, 3) };
export const RECEIPT = { first: id(6, 1) };
export const OFFER = { one: id(7, 1) };
export const KEY = { a: id(8, 1), b: id(8, 2), c: id(8, 3) };

export const T = {
  base: "2026-11-02T15:00:00Z",
  later: "2026-11-09T15:00:00Z",
  end: "2026-11-16T15:00:00Z",
};

export const requestId = (n) => `req_${String(n).padStart(4, "0")}`;
export const ok = (data, n = 1) => ({ ok: true, data, request_id: requestId(n) });
export const fail = (code, message, details, n = 1) => ({ ok: false, error: details === undefined ? { code, message } : { code, message, details }, request_id: requestId(n) });

export const roleRef = {
  surveyor: { id: ROLE.surveyor, name: "Surveyor", icon: "clipboard" },
  moderator: { id: ROLE.moderator, name: "Moderator", icon: "shield" },
};

export const surveyorCaps = ["community.campaign.draft", "community.campaign.activate", "community.campaign.close", "community.analytics.view"];
export const moderatorCaps = ["community.comments.moderate", "admin.members.admit"];

export const context = {
  alex: {
    account: { id: ACCOUNT.alex, display_name: "Alex Rivera" },
    memberships: [
      { hub_id: HUB.one, slug: "synthetic-one", name: "Synthetic Hub One", status: "accepted", roles: [], capabilities: [], is_owner: true },
      { hub_id: HUB.two, slug: "synthetic-two", name: "Synthetic Hub Two", status: "accepted", roles: [], capabilities: [], is_owner: false },
    ],
    pending: [],
  },
  sam: {
    account: { id: ACCOUNT.sam, display_name: "Sam Lee" },
    memberships: [{ hub_id: HUB.one, slug: "synthetic-one", name: "Synthetic Hub One", status: "accepted", roles: [roleRef.surveyor], capabilities: surveyorCaps, is_owner: false }],
    pending: [],
  },
  priya: {
    account: { id: ACCOUNT.priya, display_name: "Priya Shah" },
    memberships: [],
    pending: [{ hub_id: HUB.two, slug: "synthetic-two", name: "Synthetic Hub Two", status: "pending" }],
  },
};

export const hubPublic = {
  one: { hub_id: HUB.one, slug: "synthetic-one", name: "Synthetic Hub One", visibility: "public", membership_mode: "approval", member_count: 40, viewer: { status: "none", can_join: true } },
  twoAsPending: { hub_id: HUB.two, slug: "synthetic-two", name: "Synthetic Hub Two", visibility: "private", membership_mode: "invite_only", member_count: null, viewer: { status: "pending", can_join: false } },
};

export const roles = {
  surveyor: { id: ROLE.surveyor, hub_id: HUB.one, name: "Surveyor", icon: "clipboard", capabilities: surveyorCaps, assigned_count: 1 },
  moderator: { id: ROLE.moderator, hub_id: HUB.one, name: "Moderator", icon: "shield", capabilities: moderatorCaps, assigned_count: 0 },
};

export const capabilityCatalog = {
  capabilities: [
    ...["admin.settings.edit", "admin.members.admit", "admin.members.remove", "admin.members.suspend", "admin.directory.visibility", "admin.roles.manage", "admin.billing.view", "admin.billing.manage", "admin.slug.renew", "admin.discovery.apply"].map((c) => ({ id: c, category: "administration", delegable: true })),
    ...["structure.branding.edit", "structure.navigation.edit", "structure.pages.edit", "structure.pages.publish", "structure.pages.audience", "structure.currency.edit"].map((c) => ({ id: c, category: "structure", delegable: true })),
    ...["community.campaign.draft", "community.campaign.activate", "community.campaign.close", "community.campaign.audience", "community.comments.moderate", "community.analytics.view", "community.analytics.export", "community.analytics.publish", "community.shop.manage", "community.newsroom.manage", "community.leaderboard.manage"].map((c) => ({ id: c, category: "community", delegable: true })),
  ],
  owner_only: ["hub.delete", "hub.transfer_ownership"],
};

export const entitlements = {
  starter: {
    hub_id: HUB.one,
    plan_code: "starter",
    grants: [{ source: "synthetic", plan_code: "starter", valid_from: T.base, valid_to: null }],
    limits: { roles: { used: 2, limit: 3 }, pages: { used: 1, limit: 3 }, active_total: { used: 3, limit: 15 }, active_survey: { used: 1, limit: 2 } },
    undecided: [],
  },
  team: {
    hub_id: HUB.two,
    plan_code: "team",
    grants: [{ source: "synthetic", plan_code: "team", valid_from: T.base, valid_to: null }],
    limits: { roles: { used: 0, limit: 6 }, pages: { used: 0, limit: null }, active_total: { used: 0, limit: null }, active_survey: { used: 0, limit: 5 } },
    undecided: ["pages", "active_total"],
  },
};

/** Integer gate rule (never rounds): Starter 2R > M, Team 5R >= M, and M must be > 0. M = 0 is undecided. */
export function gateMet(plan, members, responders) {
  if (members === 0) return null;
  return plan === "starter" ? 2 * responders > members : 5 * responders >= members;
}

export const gateCases = [
  ["starter", 100, 50], ["starter", 100, 51], ["team", 100, 19], ["team", 100, 20],
  ["starter", 3, 1], ["starter", 3, 2], ["team", 3, 0], ["team", 3, 1],
  ["starter", 0, 0], ["team", 0, 0],
].map(([plan, members, responders]) => ({ plan, eligible_members: members, unique_responders: responders, met: gateMet(plan, members, responders) }));

export const gateStatus = (plan, members, responders) => ({
  scope: "Synthetic fixture: eligible accepted members and unique responders in the illustrative window",
  numerator: responders,
  denominator: members,
  met: gateMet(plan, members, responders),
  next_action:
    members === 0
      ? "Bootstrap policy pending. Activation of additional surveys is unavailable."
      : gateMet(plan, members, responders)
        ? "Participation condition met. Quotas and entitlement are still checked by the server."
        : "More unique eligible members need to participate.",
  policy_version: "gate-policy-fixture-v1",
});

const campaign = (key, overrides) => ({
  id: CAMPAIGN[key], hub_id: HUB.one, mode: "survey", state: "draft", title: "Synthetic survey", anonymous: false, guest_access: "off",
  opens_at: null, closes_at: null, activated_at: null, expires_at: null, legacy_session_id: null, join_code: null, legacy_historical: false, ...overrides,
});
export const campaigns = {
  draft: campaign("draft", { title: "Synthetic draft survey" }),
  scheduled: campaign("scheduled", { state: "scheduled", title: "Synthetic scheduled survey", opens_at: T.later, closes_at: T.end }),
  active: campaign("active", { state: "active", title: "Synthetic active survey", opens_at: T.base, closes_at: T.end, activated_at: T.base, join_code: "SYN123" }),
  closed: campaign("closed", { state: "closed", title: "Synthetic closed survey", opens_at: T.base, closes_at: T.later, activated_at: T.base }),
  expired: campaign("expired", { state: "expired", title: "Synthetic expired survey", opens_at: T.base, closes_at: T.later, activated_at: T.base, expires_at: T.later }),
  /** Archived record of a historical legacy session (synthetic ids): closed, identified, no times invented. */
  legacyArchive: { ...campaign("closed", { title: "Historical survey (legacy session)", join_code: "HIST1" }), id: id(4, 9), state: "closed", legacy_session_id: id(9, 1), legacy_historical: true },
  anonymousActive: campaign("anonymousActive", { state: "active", title: "Synthetic anonymous survey", anonymous: true, opens_at: T.base, activated_at: T.base, join_code: "ANON99" }),
};

export const questionSet = {
  campaign_id: CAMPAIGN.active,
  revision: 1,
  questions: [
    { id: QUESTION.rating, position: 1, type: "rating", prompt: "Synthetic question: how satisfied are you?", help_text: null, required: true, options: [], scale_min: 1, scale_max: 5 },
    { id: QUESTION.choice, position: 2, type: "single_choice", prompt: "Synthetic question: pick one.", help_text: null, required: true, options: ["Option A", "Option B", "Option C"], scale_min: 1, scale_max: 5 },
    { id: QUESTION.text, position: 3, type: "text", prompt: "Synthetic question: anything else?", help_text: "Leave out names and personal details.", required: false, options: [], scale_min: 1, scale_max: 5 },
  ],
};

/** Reward policy is undecided (D-12): receipts carry reward_state "unset" and points null, never an invented amount. */
export const receipt = { id: RECEIPT.first, campaign_id: CAMPAIGN.active, duplicate: false, points: null, reward_state: "unset", submitted_at: T.later };
/** Illustrative only: what a receipt looks like once SOME reward policy has been decided. The amount is a placeholder, not a policy. */
export const receiptRecordedExample = { ...receipt, points: 1, reward_state: "recorded" };

/** Test-only cohort value used to show suppressed rendering. The real thresholds and controls are undecided (D-10). */
export const FIXTURE_ONLY_MIN_COHORT = 3;
const window = { from: T.base, to: T.end };
const population = "Distinct accepted Hub members who submitted (member) and distinct guest grants that submitted (guest), counted separately and never added together. Responses are final answers only.";
export const analytics = {
  /** Anonymous Campaign, illustrative policy (cohort 3, complementary suppression on): one cell suppressed by size, the smallest remaining one withheld so it cannot be derived from the total. */
  suppressedExample: {
    campaign_id: CAMPAIGN.anonymousActive,
    metric: "answer_distribution",
    question_id: QUESTION.choice,
    population,
    window,
    freshness_at: T.end,
    participants: { member: { n: 12, suppressed: false, reason: null }, guest: { n: 0, suppressed: false, reason: null } },
    groups: [
      { key: "Option A", audience: "member", n: 7, suppressed: false, reason: null, value: 0.5833 },
      { key: "Option B", audience: "member", n: null, suppressed: true, reason: "complementary", value: null },
      { key: "Option C", audience: "member", n: null, suppressed: true, reason: "below_min_cohort", value: null },
    ],
    policy: { status: "applied", min_cohort: FIXTURE_ONLY_MIN_COHORT, complementary_suppression: true },
  },
  /** Anonymous Campaign with fewer participants than the (illustrative) minimum: nothing is shown, and nothing is shown as zero. */
  belowMinimumExample: {
    campaign_id: CAMPAIGN.anonymousActive,
    metric: "participation",
    question_id: null,
    population,
    window,
    freshness_at: T.end,
    participants: { member: { n: null, suppressed: true, reason: "below_min_participants" }, guest: { n: 0, suppressed: false, reason: null } },
    groups: [],
    policy: { status: "applied", min_cohort: FIXTURE_ONLY_MIN_COHORT, complementary_suppression: true },
  },
  /** Identified (non-anonymous) Campaign without guests: no privacy policy is required and exact counts are shown. */
  identifiedExample: {
    campaign_id: CAMPAIGN.active,
    metric: "participation",
    question_id: null,
    population,
    window: { from: T.base, to: null },
    freshness_at: T.later,
    participants: { member: { n: 8, suppressed: false, reason: null }, guest: { n: 0, suppressed: false, reason: null } },
    groups: [],
    policy: { status: "not_required", min_cohort: null, complementary_suppression: null },
  },
};
