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
  {
    id: "P-20",
    decisions: ["D-05", "D-12"],
    summary: "Duplicate rule: one response per person per Campaign, decided by person and independent of the idempotency key. A second attempt (same key, new key, different answers) returns the ORIGINAL receipt with duplicate = true and stores nothing; the first answers win. Whether a person may ever resubmit or amend is undecided.",
    ops: ["lv_submit_response"],
  },
  {
    id: "P-21",
    decisions: ["D-12"],
    summary: "Reopening a closed Campaign does NOT let a person who already responded respond again; people who had not responded may. Whether reopening should allow a new response is undecided and there is deliberately no code path for it.",
    ops: ["lv_submit_response", "lv_campaign_activate"],
  },
  {
    id: "P-22",
    decisions: ["D-03"],
    summary: "Guests: no public entry point exists. The storage and a scoped, revocable grant exist and are tested internally, but guest proof, how grants are issued, their lifespan and abuse limits are undecided, and guest_access = link cannot be set. Guests never become members, never get a reward and never see Hub data.",
    ops: ["lv_submit_response", "lv_campaign_create", "lv_campaign_resolve"],
  },
  {
    id: "P-23",
    decisions: ["D-10", "D-12"],
    summary: "Anonymous Campaign storage: answers carry no account and no reference to the receipt, only a calendar date; database guards refuse to write either link. Residual risk: someone with direct database access (not the API roles) can still correlate rows through transaction metadata. Retention, who may have such access, and whether this meets the Winter Survey's anonymity promise are undecided.",
    ops: ["lv_submit_response", "lv_my_receipts"],
  },
  {
    id: "P-24",
    decisions: ["D-12"],
    summary: "Rewards: no points are invented. Receipts say reward_state unset (points null) until a reward policy is decided; a recorded reward is only a number on the receipt and changes no legacy or v2 balance. Applying rewards to the points ledger is undecided.",
    ops: ["lv_submit_response", "lv_my_receipts"],
  },
  {
    id: "P-25",
    decisions: ["D-12"],
    summary: "Audience: any accepted member of the Campaign's Hub may respond. Narrower audiences (roles, groups, invitations) are undecided and not implemented.",
    ops: ["lv_submit_response", "lv_campaign_resolve"],
  },
  {
    id: "P-26",
    decisions: ["D-12"],
    summary: "Answer limits chosen for safety: at most 100 answers, text up to 2000 characters, optional questions may be left out, a required question needs a non-empty answer. The real questionnaire is undecided.",
    ops: ["lv_submit_response"],
  },
  {
    id: "P-27",
    decisions: ["D-03"],
    summary: "Join-code resolution has no rate limiting or lockout, and private-Hub codes resolve only for accepted members. Abuse limits for public codes are undecided.",
    ops: ["lv_campaign_resolve"],
  },
  {
    id: "P-28",
    decisions: ["D-10"],
    summary: "Anonymous (and guest-bearing) analytics need THREE undecided policy values before anything is shown: a cell threshold (analytics.min_cohort), a minimum participant total (analytics.min_participants) and the disclosure controls (analytics.disclosure_controls). Approving a number alone does not settle D-10; the other controls, retention and export rules remain open.",
    ops: ["lv_analytics_query"],
  },
  {
    id: "P-29",
    decisions: ["D-10", "D-12"],
    summary: "Anonymous results are served only after the Campaign has finished, never live, to stop a trickle of new responses revealing individual answers. Whether live anonymous results should ever be shown is undecided.",
    ops: ["lv_analytics_query"],
  },
  {
    id: "P-30",
    decisions: ["D-10"],
    summary: "Single release: the first release of sensitive results freezes the participant counts; if responses change afterwards (for example after a reopening) the results become unavailable rather than risk differencing between two releases. How repeat releases, corrections and late responses should work is undecided.",
    ops: ["lv_analytics_query", "lv_campaign_activate"],
  },
  {
    id: "P-31",
    decisions: ["D-10"],
    summary: "Restricted query shapes: one Campaign, one metric, optionally one question. No filters, no cross-tabulation, no time slicing, no per-response timestamps, no free-text or ranking results. These stay closed until small-group disclosure rules for each shape are approved.",
    ops: ["lv_analytics_query"],
  },
  {
    id: "P-32",
    decisions: ["D-10"],
    summary: "Complementary suppression is a configurable control, not a decided rule: when set, a single suppressed cell in a partitioning distribution also withholds the smallest remaining cell. Whether to also round, bucket or hide totals is undecided.",
    ops: ["lv_analytics_query"],
  },
  {
    id: "P-33",
    decisions: ["D-10", "D-03"],
    summary: "Members and guests are separate populations with separate thresholds and are never combined into one number. Whether guest results may be shown to the Hub at all is undecided.",
    ops: ["lv_analytics_query"],
  },
  {
    id: "P-34",
    decisions: ["D-10"],
    summary: "Identified (non-anonymous) Campaigns without guests are shown with exact counts and no privacy policy, because the Hub already holds who answered. Whether identified aggregates need any minimum is undecided.",
    ops: ["lv_analytics_query"],
  },
  {
    id: "P-35",
    decisions: ["D-06", "D-10"],
    summary: "Export and embed are blocked: no operation exports or embeds results, raw or aggregate, until retention, format and small-group rules are decided and an entitlement is defined.",
    ops: ["lv_analytics_export", "lv_analytics_embed_create", "lv_analytics_embed_revoke"],
  },
  {
    id: "P-36",
    decisions: ["D-07"],
    summary: "The public waitlist is closed until the founder decides four things: waitlist.open, the consent wording (waitlist.consent_version), the retention period (waitlist.retention) and the removal channel (waitlist.removal). Opening alone is not enough. Who is admitted and the confirmed 50-beta-owner cap are separate, unimplemented decisions; joining the waitlist promises nothing.",
    ops: ["lv_waitlist_join"],
  },
  {
    id: "P-37",
    decisions: ["D-07"],
    summary: "Waitlist consent and legal wording are undecided. Each sign-up stores the version of the approved wording that was shown, but engineering has not written or approved any wording; see contract/WAITLIST_PROPOSAL.md for a proposal that needs founder and legal review.",
    ops: ["lv_waitlist_join"],
  },
  {
    id: "P-38",
    decisions: ["D-10"],
    summary: "Waitlist retention and removal are undecided. The table holds the email address (personal data) with a deletion date from the retention policy, no API access and no read-back operation; an operator purge and an operator removal function exist and are tested. The throttle ledger holds salted hashes only and is cleared after 7 days. How long to keep addresses, who may export them and how people request removal are founder decisions.",
    ops: ["lv_waitlist_join"],
  },
  {
    id: "P-39",
    decisions: ["D-09"],
    summary: "The waitlist throttle values (5 attempts per address per origin per day, 30 per origin per hour) are PROVISIONAL TEST VALUES, not approved. They count only the caller's own attempts, so they cannot reveal prior submissions by others.",
    ops: ["lv_waitlist_join"],
  },
  {
    id: "P-40",
    decisions: ["D-09"],
    summary: "A Hub's v2 display name is stored separately from the legacy organization name and never overwrites it. Who may rename, and the naming and reserved-word rules, are undecided (D-09); only length and control characters are checked.",
    ops: ["lv_hub_settings_update", "lv_hub_public", "lv_my_context"],
  },
  {
    id: "P-41",
    decisions: ["D-09"],
    summary: "Trusted network identity for the waitlist is NOT configured (waitlist.trusted_ip unset), so every caller shares one throttle bucket. When set it uses the entry N places from the right of a named proxy header, which only holds if the production edge (Render/Supabase/Cloudflare) is verified to append the real client address there; a browser-supplied value is never trusted. The header name and hop count must be confirmed against the live edge before the list opens.",
    ops: ["lv_waitlist_join"],
  },
  {
    id: "P-42",
    decisions: ["D-12", "D-04"],
    summary: "Legacy bridge scope: only HISTORICAL legacy survey sessions (not live, not menu-rating, no ambiguity) become archived, closed Campaigns marked legacy_historical. They never consume a quota slot, never count toward the participation gate, cannot be activated, reopened, edited or answered. Live sessions stay in the legacy app until a separately authorized cutover; menu-rating sessions stay legacy-only.",
    ops: ["lv_campaign_activate", "lv_campaign_list", "lv_campaign_activation_status"],
  },
  {
    id: "P-43",
    decisions: ["D-12"],
    summary: "Nothing is invented for archived records: they are identified (legacy responses kept the respondent id), guest access is off, opening and closing times are copied exactly as stored (a session with a backwards window is held as ambiguous, not repaired), the question set is revision 1 exactly as the legacy template stands today (the legacy app lets templates be edited, so the set may differ from what respondents saw), and points are recorded as awarded, not re-applied.",
    ops: ["lv_campaign_list", "lv_my_receipts", "lv_campaign_questions"],
  },
  {
    id: "P-44",
    decisions: ["D-10", "D-12"],
    summary: "Results for archived legacy sessions are unavailable (policy-pending) regardless of any analytics policy: there is no evidence of what respondents were told about anonymity or publication, so none is assumed.",
    ops: ["lv_analytics_query"],
  },
  {
    id: "P-45",
    decisions: ["D-12"],
    summary: "Ambiguous legacy records (no template, missing template, no questions, impossible scale or prompt length, title length, backwards time window, empty or colliding join code) are never mapped, repaired or discarded: they are listed with a reason for a human decision. Responses by students without an account or from another organization are held back and listed, not dropped.",
    ops: ["lv_campaign_list"],
  },
  {
    id: "P-46",
    decisions: ["D-12"],
    summary: "Legacy transition: legacy RPCs, login and surveys keep running untouched. The bridge is repeatable and per-session atomic; responses and answers that arrive later are picked up by the next sync; reconciliation reports drift (for example a mapped session live again). Rolling the bridge back deletes only the derived archive; every legacy row and every native v2 Campaign is unaffected. Nothing schedules the sync.",
    ops: [],
  },
];
