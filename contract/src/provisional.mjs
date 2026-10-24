// Provisional implementation choices: behaviour that exists so the system is usable and testable, but that is NOT
// approved production policy. Each entry names the open decision it depends on and the operations it affects.
// Single source: assemble.mjs derives each operation's `x-provisional`, the OpenAPI `x-provisional-register`,
// generated/provisional.json and generated/PROVISIONAL.md from this list, and the contract check fails if an
// entry names an unknown operation. Merging a migration that implements one of these does NOT approve it: applying
// it to production requires the decision to be recorded in the decision register first.
//
// The canonical decision register (D-01..D-14) lives in the docs PR chain, not in this checkout; this list is the
// extract the register owner should reconcile.

export const PROVISIONAL = [
  {
    id: "P-01",
    decisions: ["D-05"],
    summary: "Rejecting a pending application deletes it (the audit trail keeps the event), so the person may apply again immediately. No cool-down, reason or block list.",
    ops: ["lv_decide_join"],
  },
  {
    id: "P-02",
    decisions: ["D-05"],
    summary: "A removed member cannot rejoin by themselves (lv_forbidden). Whether removal is permanent, time-limited or reversible by an admin is undecided; there is no reinstate operation.",
    ops: ["lv_join_hub", "lv_remove_member"],
  },
  {
    id: "P-03",
    decisions: ["D-09"],
    summary: "The existence, name and join mode of a private Hub are visible to anyone who knows its slug (needed for the private-Hub gate). Its member count is hidden from non-members.",
    ops: ["lv_hub_public", "lv_member_count"],
  },
  {
    id: "P-04",
    decisions: ["D-05", "D-09"],
    summary: "Membership defaults: a Hub created by the backfill is private and invite-only. These are database column defaults, not MJCC's settings, and must be set explicitly for every real Hub before launch.",
    ops: ["lv_hub_public", "lv_join_hub"],
  },
  {
    id: "P-05",
    decisions: ["D-05"],
    summary: "Invite codes are unsupported: a supplied code is refused with lv_policy_undecided (details.reason = invite_code_unsupported), even for an account that holds an account-bound invitation. Account-bound invitations (status invited) are accepted by calling lv_join_hub without a code. Code generation, redemption, expiry and revocation are undecided.",
    ops: ["lv_join_hub"],
  },
  {
    id: "P-06",
    decisions: ["D-05"],
    summary: "Every legacy member of an organization becomes an accepted member of its Hub (backfill, signup mirror, repair), including students who have never used v2. Whether legacy accounts count as valid members for gates and discovery is undecided.",
    ops: ["lv_my_context", "lv_member_count"],
  },
  {
    id: "P-07",
    decisions: ["D-02"],
    summary: "Delegation: nobody can grant a capability they do not hold, and a non-Owner can edit, assign, unassign or delete a role only if they hold every capability that role carries. The founder has not decided how far role managers may reach (for example whether they may manage peers or lesser roles they only partly cover).",
    ops: ["lv_role_create", "lv_role_update", "lv_role_delete", "lv_role_assign", "lv_role_unassign", "lv_role_set_capability"],
  },
  {
    id: "P-08",
    decisions: ["D-02"],
    summary: "Enabling a whole capability category on a role requires holding every capability in it; there is no partial group grant. Disabling a category needs only authority over the role.",
    ops: ["lv_role_set_group"],
  },
  {
    id: "P-09",
    decisions: ["D-02"],
    summary: "A non-Owner can remove or suspend only a member whose capabilities are within their own. Whether peers or lesser roles may act on each other is undecided.",
    ops: ["lv_remove_member", "lv_suspend_member"],
  },
  {
    id: "P-10",
    decisions: ["D-02"],
    summary: "A member may hold several roles. Role assignments are dropped automatically when a membership stops being accepted (suspended, removed, left) and do not return on reinstatement. The Owner holds no roles (authority is direct); becoming Owner dissolves existing assignments.",
    ops: ["lv_role_assign", "lv_suspend_member", "lv_remove_member", "lv_leave_hub", "lv_owner_transfer_accept", "lv_my_context"],
  },
  {
    id: "P-11",
    decisions: ["D-01", "D-02"],
    summary: "Owner transfer reauthentication (required method and maximum age) and offer lifetime are UNDECIDED and unset in the database, so lv_owner_transfer_start/accept fail closed with lv_policy_undecided. When set, the database checks the amr claim of the access token; that does not prove the Google or central-identity reauthentication flow, which is a separate integration (D-01) with its own verification.",
    ops: ["lv_owner_transfer_start", "lv_owner_transfer_accept"],
  },
  {
    id: "P-12",
    decisions: ["D-06"],
    summary: "Custom role slots (Starter 3, Team 6, Owner excluded) are confirmed numbers, but they are read from entitlement grants and no real grant exists: a Hub without an active grant cannot create roles, a plan whose allowance is undecided (campaign plans, manual) answers lv_policy_undecided, and what happens when a downgrade leaves more roles than slots is undefined.",
    ops: ["lv_role_create", "lv_role_list"],
  },
  {
    id: "P-13",
    decisions: ["D-02"],
    summary: "The capability vocabulary (27 ids in Administration, Hub Appearance & Structure, Community & Campaigns) is a proposal. `community.moderate` was renamed `community.comments.moderate`. Ids may change before launch; the roles migration seeds them from a table, not code.",
    ops: ["lv_capability_catalog", "lv_role_create", "lv_role_set_capability", "lv_role_set_group"],
  },
  {
    id: "P-14",
    decisions: ["D-06"],
    summary: "Which Campaign states consume an active-Campaign slot is UNDECIDED (only active? also scheduled?). Activation fails closed (lv_policy_undecided, missing quota.consuming_states) until set. The `used` numbers shown in lv_entitlements and lv_campaign_activation_status count Campaigns that are currently active only.",
    ops: ["lv_campaign_activate", "lv_campaign_activation_status", "lv_entitlements"],
  },
  {
    id: "P-15",
    decisions: ["D-04", "D-05"],
    summary: "The participation gate's measurement window, eligible population, and which survey it first applies to (for example the second active survey) are UNDECIDED and unset. Only the comparisons are confirmed (Starter strictly above 50%, Team at least 20%, unique eligible accepted members, exact integers). Test values are illustrative and not policy.",
    ops: ["lv_gate_status", "lv_campaign_activate", "lv_campaign_activation_status"],
  },
  {
    id: "P-16",
    decisions: ["D-04"],
    summary: "Gate result when the eligible population is empty (bootstrap) is UNDECIDED; it fails closed with missing gate.bootstrap rather than defaulting to met or unmet.",
    ops: ["lv_gate_status", "lv_campaign_activate"],
  },
  {
    id: "P-17",
    decisions: ["D-06"],
    summary: "Team page and active-Campaign totals are UNDECIDED and stay null (never unlimited). Because activation needs a decided total, a Team-only Hub cannot activate any Campaign until D-06 sets it.",
    ops: ["lv_entitlements", "lv_campaign_activate"],
  },
  {
    id: "P-18",
    decisions: ["D-06", "D-07"],
    summary: "Beta, manual and Campaign-plan grants carry no decided limits, so they activate nothing: beta access is not assumed to be a free paid tier. A Hub with no active grant gets lv_entitlement_missing.",
    ops: ["lv_entitlements", "lv_campaign_activate", "lv_gate_status"],
  },
  {
    id: "P-19",
    decisions: ["D-08", "D-12"],
    summary: "Lifecycle rules chosen for testability: only drafts are editable; a Campaign expires when its closing time passes and cannot be reopened; a closed one can reopen until then; scheduling reserves nothing and every check is repeated when it opens; the scheduler must still hold the capability. Only survey mode exists. Nothing defines the Winter Survey opening time, timezone, closing, operator, questionnaire, audience or anonymity (D-12). The job that runs scheduled activations and expiry is an operator function with no scheduler configured.",
    ops: ["lv_campaign_create", "lv_campaign_update", "lv_campaign_schedule", "lv_campaign_activate", "lv_campaign_close"],
  },
];
