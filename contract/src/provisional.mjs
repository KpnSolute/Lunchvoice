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
];
