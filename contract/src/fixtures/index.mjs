import {
  ACCOUNT, CAMPAIGN, HUB, KEY, OFFER, QUESTION, ROLE, T, analytics, campaigns, capabilityCatalog, context, entitlements, fail, gateCases,
  gateStatus, hubPublic, id, ok, questionSet, receipt, roleRef, roles,
} from "./data.mjs";

const named = (name, schema, data, description) => ({ name, schema, data, ...(description ? { description } : {}) });

/** Schema-level fixtures: one file per area, each item validated against the named schema. */
export const fixtureFiles = {
  "identity.json": {
    description: "Account contexts for synthetic personas (owner of Hub One; surveyor; pending applicant).",
    items: [
      named("context.alex-owner", "Context", context.alex, "Owner of Hub One and plain member of Hub Two."),
      named("context.sam-surveyor", "Context", context.sam, "Member of Hub One with a custom Surveyor role."),
      named("context.priya-pending", "Context", context.priya, "No memberships; one pending application."),
      named("hub.one-public-visitor", "HubPublic", hubPublic.one),
      named("hub.two-private-pending", "HubPublic", hubPublic.twoAsPending),
    ],
  },
  "roles.json": {
    description: "Capability catalog and custom roles.",
    items: [
      named("capability-catalog", "CapabilityCatalog", capabilityCatalog, "Proposed vocabulary (decision D-02)."),
      named("role.surveyor", "Role", roles.surveyor),
      named("role.moderator", "Role", roles.moderator),
      named("role-list.hub-one", "RoleList", { hub_id: HUB.one, roles: [roles.surveyor, roles.moderator], slots: { used: 2, limit: 3 } }, "Starter: 3 custom role slots; Owner does not consume one."),
    ],
  },
  "entitlements.json": {
    description: "Synthetic entitlements. A null limit means the policy is undecided; it is never unlimited.",
    items: [
      named("entitlements.starter", "Entitlements", entitlements.starter),
      named("entitlements.team-with-undecided", "Entitlements", entitlements.team, "Team totals for pages and active Campaigns are undecided (D-06)."),
      ...[
        ["gate.starter-100-50-unmet", "starter", 100, 50],
        ["gate.starter-100-51-met", "starter", 100, 51],
        ["gate.team-100-19-unmet", "team", 100, 19],
        ["gate.team-100-20-met", "team", 100, 20],
        ["gate.starter-3-1-unmet", "starter", 3, 1],
        ["gate.starter-3-2-met", "starter", 3, 2],
        ["gate.team-3-0-unmet", "team", 3, 0],
        ["gate.team-3-1-met", "team", 3, 1],
        ["gate.zero-members-undecided", "team", 0, 0],
      ].map(([name, plan, m, r]) => named(name, "GateStatus", gateStatus(plan, m, r))),
    ],
  },
  "campaigns.json": {
    description: "One Campaign per lifecycle state, plus a question set.",
    items: [
      ...Object.entries(campaigns).map(([key, data]) => named(`campaign.${key}`, "Campaign", data)),
      named("question-set.active", "QuestionSet", questionSet),
    ],
  },
  "participation.json": {
    description: "Receipts.",
    items: [
      named("receipt.first", "Receipt", receipt),
      named("receipt.duplicate", "Receipt", { ...receipt, duplicate: true }),
      named("receipt-list", "ReceiptList", { receipts: [receipt] }),
    ],
  },
  "analytics.json": {
    description: "Privacy-safe aggregates. The applied example uses a TEST-ONLY cohort value; the real threshold is undecided (D-10).",
    items: [
      named("analytics.undecided", "AnalyticsResult", analytics.undecided, "Anonymous Campaign before D-10: no groups, policy undecided."),
      named("analytics.applied-fixture-only", "AnalyticsResult", analytics.appliedFixtureOnly, "Shows suppressed groups. min_cohort is a synthetic test value, not a policy."),
    ],
  },
  "gate-cases.json": {
    description: "Reference cases for the participation gate (integer arithmetic, no rounding). met=null means the bootstrap rule is undecided.",
    raw: true,
    items: gateCases,
  },
};

const errorExamples = [
  ["lv_unauthenticated", "Sign in to continue."],
  ["lv_forbidden", "You do not have permission to do that."],
  ["lv_not_member", "You are not a member of this Hub."],
  ["lv_not_found", "Not found."],
  ["lv_hub_mismatch", "That item belongs to a different Hub."],
  ["lv_quota_exceeded", "A limit has been reached.", { limit: 3, used: 3 }],
  ["lv_gate_unmet", "Participation requirement not met.", { numerator: 50, denominator: 100 }],
  ["lv_entitlement_missing", "This Hub's plan does not include that."],
  ["lv_lifecycle_invalid", "That is not allowed in the current state."],
  ["lv_conflict", "The data changed; reload and try again."],
  ["lv_policy_undecided", "This is not available yet."],
  ["lv_rate_limited", "Too many requests; try again shortly.", { retry_after_seconds: 60 }],
  ["lv_invalid_input", "Check the highlighted fields.", { fields: ["title"] }],
];
fixtureFiles["errors.json"] = {
  description: "One failure envelope per error code.",
  items: errorExamples.map(([code, message, details], i) => named(`error.${code}`, "LvFail", fail(code, message, details, 100 + i))),
};

/** Request/response pairs per operation, for mock adapters and contract tests. Responses are full envelopes. */
export const examples = [
  { operationId: "lv_my_context", name: "owner", request: {}, response: ok(context.alex, 1) },
  { operationId: "lv_my_context", name: "unauthenticated", request: {}, response: fail("lv_unauthenticated", "Sign in to continue.", undefined, 2) },
  { operationId: "lv_hub_public", name: "found", request: { slug: "synthetic-one" }, response: ok(hubPublic.one, 3) },
  { operationId: "lv_hub_public", name: "not-found", request: { slug: "no-such-hub" }, response: fail("lv_not_found", "Not found.", undefined, 4) },
  { operationId: "lv_join_hub", name: "pending", request: { hub_id: HUB.two }, response: ok({ status: "pending" }, 5) },
  { operationId: "lv_join_hub", name: "invite-code-unsupported", request: { hub_id: HUB.two, invite_code: "ABC123" }, response: fail("lv_policy_undecided", "Invite codes are not supported yet.", { reason: "invite_code_unsupported" }, 42) },
  { operationId: "lv_join_hub", name: "invite-required", request: { hub_id: HUB.two }, response: fail("lv_forbidden", "An invite code is required.", undefined, 6) },
  { operationId: "lv_decide_join", name: "accept", request: { hub_id: HUB.two, account_id: ACCOUNT.priya, decision: "accept" }, response: ok({ hub_id: HUB.two, account_id: ACCOUNT.priya, status: "accepted" }, 7) },
  { operationId: "lv_hub_public", name: "private-count-hidden", request: { slug: "synthetic-two" }, response: ok(hubPublic.twoAsPending, 40) },
  { operationId: "lv_member_count", name: "private-hub-hidden", request: { hub_id: HUB.two }, response: fail("lv_not_found", "Not found.", undefined, 41) },
  { operationId: "lv_member_count", name: "count", request: { hub_id: HUB.one }, response: ok({ hub_id: HUB.one, member_count: 40 }, 8) },
  { operationId: "lv_capability_catalog", name: "catalog", request: {}, response: ok(capabilityCatalog, 9) },
  { operationId: "lv_role_list", name: "two-roles", request: { hub_id: HUB.one }, response: ok({ hub_id: HUB.one, roles: [roles.surveyor, roles.moderator], slots: { used: 2, limit: 3 } }, 10) },
  { operationId: "lv_role_create", name: "ok", request: { hub_id: HUB.one, name: "Moderator", icon: "shield", capabilities: ["community.comments.moderate"] }, response: ok(roles.moderator, 11) },
  { operationId: "lv_role_create", name: "slots-full", request: { hub_id: HUB.one, name: "Fourth", capabilities: [] }, response: fail("lv_quota_exceeded", "Role slots are full.", { limit: 3, used: 3 }, 12) },
  { operationId: "lv_role_assign", name: "ok", request: { role_id: ROLE.surveyor, account_id: ACCOUNT.sam }, response: ok({ hub_id: HUB.one, account_id: ACCOUNT.sam, status: "accepted" }, 13) },
  { operationId: "lv_owner_transfer_start", name: "offer", request: { hub_id: HUB.one, to_account_id: ACCOUNT.sam }, response: ok({ offer_id: OFFER.one, hub_id: HUB.one, to_account_id: ACCOUNT.sam, expires_at: T.later }, 14) },
  { operationId: "lv_owner_transfer_start", name: "not-owner", request: { hub_id: HUB.one, to_account_id: ACCOUNT.sam }, response: fail("lv_forbidden", "Only the Owner can transfer ownership.", undefined, 15) },
  { operationId: "lv_role_create", name: "no-entitlement", request: { hub_id: HUB.one, name: "Moderator", capabilities: [] }, response: fail("lv_entitlement_missing", "This Hub has no plan that includes custom roles.", undefined, 43) },
  { operationId: "lv_role_create", name: "cannot-grant-unheld", request: { hub_id: HUB.one, name: "Escalate", capabilities: ["community.campaign.activate"] }, response: fail("lv_forbidden", "You cannot grant authority you do not hold.", { reason: "cannot_grant_unheld_capability", missing: ["community.campaign.activate"] }, 44) },
  { operationId: "lv_role_create", name: "ungrantable", request: { hub_id: HUB.one, name: "Nope", capabilities: ["hub.delete"] }, response: fail("lv_invalid_input", "Some capabilities cannot be granted.", { ungrantable: ["hub.delete"] }, 45) },
  { operationId: "lv_role_assign", name: "exceeds-authority", request: { role_id: ROLE.surveyor, account_id: ACCOUNT.priya }, response: fail("lv_forbidden", "You cannot grant authority you do not hold.", { reason: "role_exceeds_your_authority" }, 46) },
  { operationId: "lv_role_set_group", name: "enable-category", request: { role_id: ROLE.surveyor, category: "community", enabled: true }, response: ok(roles.surveyor, 47) },
  { operationId: "lv_owner_transfer_start", name: "policy-undecided", request: { hub_id: HUB.one, to_account_id: ACCOUNT.sam }, response: fail("lv_policy_undecided", "Ownership transfer is not available until its policy is set.", { missing: ["owner_transfer.reauth", "owner_transfer.offer_ttl_seconds"] }, 48) },
  { operationId: "lv_owner_transfer_start", name: "reauthentication-required", request: { hub_id: HUB.one, to_account_id: ACCOUNT.sam }, response: fail("lv_forbidden", "Sign in again to confirm this change.", { reason: "reauthentication_required" }, 49) },
  { operationId: "lv_owner_transfer_accept", name: "accepted", request: { offer_id: OFFER.one }, response: ok({ hub_id: HUB.one, owner_account_id: ACCOUNT.sam }, 50) },
  { operationId: "lv_owner_transfer_accept", name: "stale", request: { offer_id: OFFER.one }, response: fail("lv_lifecycle_invalid", "The Owner has changed since this offer was made.", { status: "superseded" }, 51) },
  { operationId: "lv_owner_transfer_cancel", name: "declined", request: { offer_id: OFFER.one }, response: ok({ done: true }, 52) },
  { operationId: "lv_entitlements", name: "starter", request: { hub_id: HUB.one }, response: ok(entitlements.starter, 16) },
  { operationId: "lv_entitlements", name: "team-undecided", request: { hub_id: HUB.two }, response: ok(entitlements.team, 17) },
  { operationId: "lv_gate_status", name: "starter-unmet", request: { hub_id: HUB.one, mode: "survey" }, response: ok(gateStatus("starter", 100, 50), 18) },
  { operationId: "lv_gate_status", name: "zero-members", request: { hub_id: HUB.two, mode: "survey" }, response: fail("lv_policy_undecided", "Bootstrap rule pending.", undefined, 19) },
  { operationId: "lv_campaign_create", name: "draft", request: { hub_id: HUB.one, mode: "survey", title: "Synthetic draft survey" }, response: ok(campaigns.draft, 20) },
  { operationId: "lv_campaign_create", name: "mode-undecided", request: { hub_id: HUB.one, mode: "election", title: "Synthetic election" }, response: fail("lv_policy_undecided", "That mode is not available yet.", undefined, 21) },
  { operationId: "lv_campaign_list", name: "all", request: { hub_id: HUB.one }, response: ok({ hub_id: HUB.one, campaigns: [campaigns.draft, campaigns.active] }, 22) },
  { operationId: "lv_campaign_questions", name: "active", request: { campaign_id: CAMPAIGN.active }, response: ok(questionSet, 23) },
  { operationId: "lv_campaign_activate", name: "ok", request: { campaign_id: CAMPAIGN.draft, idempotency_key: KEY.a }, response: ok({ campaign_id: CAMPAIGN.draft, state: "active", activated_at: T.base, expires_at: null, replay: false }, 24) },
  { operationId: "lv_campaign_activate", name: "replay", request: { campaign_id: CAMPAIGN.draft, idempotency_key: KEY.a }, response: ok({ campaign_id: CAMPAIGN.draft, state: "active", activated_at: T.base, expires_at: null, replay: true }, 25) },
  { operationId: "lv_campaign_activate", name: "quota", request: { campaign_id: CAMPAIGN.scheduled, idempotency_key: KEY.b }, response: fail("lv_quota_exceeded", "Active survey limit reached.", { limit: 2, used: 2 }, 26) },
  { operationId: "lv_campaign_activate", name: "gate-unmet", request: { campaign_id: CAMPAIGN.scheduled, idempotency_key: KEY.c }, response: fail("lv_gate_unmet", "Participation requirement not met.", { numerator: 50, denominator: 100 }, 27) },
  { operationId: "lv_campaign_close", name: "ok", request: { campaign_id: CAMPAIGN.active }, response: ok(campaigns.closed, 28) },
  { operationId: "lv_campaign_resolve", name: "found", request: { code: "SYN123" }, response: ok({ campaign_id: CAMPAIGN.active, hub_id: HUB.one, hub_slug: "synthetic-one", title: "Synthetic active survey", state: "active", anonymous: false, requires_account: true }, 29) },
  { operationId: "lv_campaign_resolve", name: "not-found", request: { code: "NOPE00" }, response: fail("lv_not_found", "No Campaign matches that code.", undefined, 30) },
  { operationId: "lv_submit_response", name: "ok", request: { campaign_id: CAMPAIGN.active, idempotency_key: KEY.a, answers: [{ question_id: QUESTION.rating, value: 4 }, { question_id: QUESTION.choice, value: "Option A" }] }, response: ok(receipt, 31) },
  { operationId: "lv_submit_response", name: "duplicate", request: { campaign_id: CAMPAIGN.active, idempotency_key: KEY.a, answers: [{ question_id: QUESTION.rating, value: 4 }] }, response: ok({ ...receipt, duplicate: true }, 32) },
  { operationId: "lv_submit_response", name: "closed", request: { campaign_id: CAMPAIGN.closed, idempotency_key: KEY.b, answers: [] }, response: fail("lv_lifecycle_invalid", "This Campaign is closed.", undefined, 33) },
  { operationId: "lv_my_receipts", name: "one", request: {}, response: ok({ receipts: [receipt] }, 34) },
  { operationId: "lv_analytics_query", name: "undecided", request: { campaign_id: CAMPAIGN.anonymousActive, metric: "participation" }, response: fail("lv_policy_undecided", "Anonymous results are not available until the privacy policy is set.", undefined, 35) },
  { operationId: "lv_analytics_query", name: "applied-fixture-only", request: { campaign_id: CAMPAIGN.active, metric: "answer_distribution", question_id: QUESTION.choice }, response: ok(analytics.appliedFixtureOnly, 36) },
];

export { id };
