import type { LvError } from "./lvApi";

// One place that turns an lv_api error code into something a person can act on.
// Never parse Postgres text; an unknown code falls back to the server message.
const COPY: Record<string, string> = {
  lv_unauthenticated: "Sign in to continue.",
  lv_forbidden: "You don't have access to this.",
  lv_not_found: "We couldn't find that.",
  lv_invalid_input: "Some details need fixing.",
  lv_conflict: "That is already taken.",
  lv_closed: "This Campaign isn't accepting responses right now.",
  lv_locked: "This Campaign is published and can no longer be edited.",
  lv_gate_blocked: "This Campaign can't be activated yet.",
  lv_lifecycle_invalid: "That action doesn't apply to the current state.",
  lv_invalid_code: "That invite code isn't valid, or it has been used up.",
  lv_policy_undecided: "This Campaign is anonymous and still open, so results appear once it closes.",
  lv_owner_protected: "The Owner can't be removed or leave.",
  lv_owner_immutable: "Ownership can't be changed here.",
  lv_hub_mismatch: "Something didn't match. Reload and try again.",
  lv_not_accepted: "That invitation hasn't been accepted yet.",
  lv_anonymity_violation: "That answer would break the anonymity promise.",
  lv_limit_reached: "You've reached this plan's limit.",
  lv_rate_limited: "Too many attempts. Wait a moment and try again.",
  lv_unverified_email: "Verify your email at KpnIdentity to continue.",
  lv_beta_required: "Creating a Hub needs a Hub credit.",
  lv_entitlement_required: "This needs an active plan. Your data is kept; premium actions are locked until a plan is active.",
  lv_billing_unavailable: "Billing opens soon. Nothing can be bought yet, and nothing has been charged.",
  lv_price_unset: "Campaign Plus doesn't have a price yet, so it can't be bought.",
  lv_not_available: "This isn't available yet.",
  lv_hub_gone: "This Hub is no longer available.",
  lv_reauth_required: "For your safety, sign in again, then try this once more.",
  lv_confirmation_mismatch: "The confirmation text didn't match. Type it exactly as shown.",
  lv_server_error: "Something went wrong on our side. Try again.",
};

export const GATE_REASONS: Record<string, string> = {
  no_questions: "Add at least one question first.",
  limit_reached: "This plan's active-Campaign limit is reached.",
  limit_undefined: "This plan's limit isn't set yet.",
  not_draft: "Only a draft can be activated.",
  already_closed: "This Campaign is already closed.",
  team_family_required: "Discover is for Hubs on the Team plan.",
  members_below_700: "Discover needs at least 700 genuine active members. Guests don't count.",
};

export function describeError(error: Pick<LvError, "code" | "message"> & Partial<Pick<LvError, "limit" | "used">>): string {
  if (error.code === "lv_limit_reached" && typeof error.limit === "number") {
    return `You've reached this plan's limit (${error.used ?? error.limit} of ${error.limit}).`;
  }
  return COPY[error.code] ?? error.message ?? "Something went wrong.";
}

export function describeGate(reasons: string[] | undefined): string[] {
  return (reasons ?? []).map((r) => GATE_REASONS[r] ?? r);
}
