// Typed client for the v2 `lv_api` functions. Shapes follow docs/backend/API_CONTRACT.md.
// Every expected application failure arrives as {ok:false,error} (migration 000008).

export type LvErrorCode =
  | "lv_unauthenticated"
  | "lv_forbidden"
  | "lv_not_found"
  | "lv_invalid_input"
  | "lv_conflict"
  | "lv_closed"
  | "lv_locked"
  | "lv_gate_blocked"
  | "lv_lifecycle_invalid"
  | "lv_invalid_code"
  | "lv_unverified_email"
  | "lv_beta_required"
  | "lv_policy_undecided"
  | "lv_owner_protected"
  | "lv_owner_immutable"
  | "lv_hub_mismatch"
  | "lv_not_accepted"
  | "lv_anonymity_violation"
  | "lv_limit_reached"
  | "lv_rate_limited"
  | "lv_server_error";

export interface LvError {
  code: LvErrorCode;
  message: string;
  missing?: string[];
  reasons?: string[];
}

export type LvResult<T> = ({ ok: true } & T) | { ok: false; error: LvError };

export type BetaStatus = "none" | "pending" | "approved" | "rejected" | "consumed";

export interface HubSummary {
  hub_id: string;
  slug: string;
  name: string;
  is_owner: boolean;
  roles: { key: string; name: string }[];
  capabilities: string[];
}

export interface MyContext {
  account_id: string;
  display_name: string | null;
  email_verified: boolean;
  is_platform_admin: boolean;
  beta_status: BetaStatus;
  hubs: HubSummary[];
}

export interface HubInfo {
  hub_id: string;
  slug: string;
  name: string;
  visibility: "public" | "private";
  membership_mode: "open" | "approval" | "invite_only";
  member_count: number;
}

export interface HubMembership {
  is_owner: boolean;
  roles: { key: string; name: string }[];
  capabilities: string[];
  active_campaigns: number;
}

export interface Member {
  membership_id: string;
  account_id: string;
  display_name: string | null;
  status: "accepted" | "pending";
  accepted_at: string | null;
  is_owner: boolean;
  roles: { key: string; name: string }[];
}

export type InviteState = "active" | "revoked" | "expired" | "exhausted";

export interface Invite {
  invite_id: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  state: InviteState;
}

export type CampaignMode = "survey" | "poll" | "rating" | "feedback";
export type Anonymity = "anonymous" | "identified";
export type CampaignStatus = "draft" | "active" | "closed";
export type QuestionKind = "rating" | "single_choice" | "multi_choice" | "yes_no" | "text";

export interface CampaignRow {
  campaign_id: string;
  title: string;
  mode: CampaignMode;
  anonymity: Anonymity;
  status: CampaignStatus;
  opens_at: string | null;
  closes_at: string | null;
  created_at: string;
  question_count: number;
  has_responded: boolean;
  join_code?: string;
}

export interface Question {
  question_id: string;
  position: number;
  kind: QuestionKind;
  prompt: string;
  config: { options?: string[] } & Record<string, unknown>;
}

export interface CampaignDetailData {
  campaign: {
    campaign_id: string;
    hub_id: string;
    title: string;
    mode: CampaignMode;
    anonymity: Anonymity;
    status: CampaignStatus;
    revision: number;
    opens_at: string | null;
    closes_at: string | null;
  };
  questions: Question[];
  has_responded: boolean;
  receipt_id: string | null;
  can_respond: boolean;
  can_manage: boolean;
  join_code?: string;
  gate?: { ok: boolean; reasons: string[] };
}

export interface Cell {
  key: string;
  n: number | null;
  suppressed: boolean;
  reason: "below_min_cohort" | "complementary" | null;
}

export type AnalyticsResult =
  | { metric: "participant_count"; n: number | null; suppressed: boolean }
  | { metric: "answer_distribution"; question_id: string; cells: Cell[] };

export interface SubmitReceipt {
  receipt_id: string;
  duplicate: boolean;
}

export interface Answer {
  question_id: string;
  value: unknown;
}

export interface LvTransport {
  rpc(fn: string, args?: Record<string, unknown>): Promise<unknown>;
}

function normalize<T>(raw: unknown): LvResult<T> {
  if (raw && typeof raw === "object" && "ok" in raw) return raw as LvResult<T>;
  return { ok: false, error: { code: "lv_server_error", message: "Unexpected response" } };
}

export function createLvApi(transport: LvTransport) {
  const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<LvResult<T>> => {
    try {
      return normalize<T>(await transport.rpc(fn, args));
    } catch (e) {
      // Expected failures are always {ok:false,error}; an exception is a genuine server fault.
      return { ok: false, error: { code: "lv_server_error", message: e instanceof Error ? e.message : String(e) } };
    }
  };
  return {
    myContext: () => call<MyContext>("lv_my_context"),
    betaStatus: () => call<{ status: BetaStatus; applied_at?: string; decided_at?: string }>("lv_beta_status"),
    betaApply: (note?: string) => call<{ application_id: string }>("lv_beta_apply", { p_note: note ?? null }),

    hubCreate: (slug: string, name: string) => call<{ hub_id: string; slug: string }>("lv_hub_create", { p_slug: slug, p_name: name }),
    hubGet: (slug: string) => call<{ hub: HubInfo; membership: HubMembership | null }>("lv_hub_get", { p_slug: slug }),
    memberList: (hub: string) => call<{ members: Member[] }>("lv_member_list", { p_hub: hub }),

    inviteCreate: (hub: string, maxUses?: number, expiresAt?: string) =>
      call<{ invite_id: string; code: string; shown_once: boolean }>("lv_invite_create", {
        p_hub: hub,
        p_max_uses: maxUses ?? null,
        p_expires_at: expiresAt ?? null,
      }),
    inviteList: (hub: string) => call<{ invites: Invite[] }>("lv_invite_list", { p_hub: hub }),
    invitePreview: (code: string) =>
      call<{ hub: { hub_id: string; slug: string; name: string }; already_member: boolean }>("lv_invite_preview", { p_code: code }),
    inviteRedeem: (code: string) => call<{ hub_id: string; already_member: boolean }>("lv_invite_redeem", { p_code: code }),
    inviteRevoke: (invite: string) => call<object>("lv_invite_revoke", { p_invite: invite }),

    campaignList: (hub: string) => call<{ campaigns: CampaignRow[] }>("lv_campaign_list", { p_hub: hub }),
    campaignGet: (campaign: string) => call<CampaignDetailData>("lv_campaign_get", { p_campaign: campaign }),
    campaignCreate: (hub: string, title: string, mode: CampaignMode, anonymity: Anonymity = "anonymous") =>
      call<{ campaign_id: string }>("lv_campaign_create", { p_hub: hub, p_title: title, p_mode: mode, p_anonymity: anonymity }),
    questionAdd: (campaign: string, position: number, kind: QuestionKind, prompt: string, config: object = {}) =>
      call<{ question_id: string }>("lv_campaign_question_add", {
        p_campaign: campaign,
        p_position: position,
        p_kind: kind,
        p_prompt: prompt,
        p_config: config,
      }),
    campaignActivate: (campaign: string) => call<object>("lv_campaign_activate", { p_campaign: campaign }),
    campaignClose: (campaign: string) => call<object>("lv_campaign_close", { p_campaign: campaign }),

    submit: (campaign: string, answers: Answer[]) =>
      call<SubmitReceipt>("lv_submit_response", { p_campaign: campaign, p_answers: answers }),
    analytics: (campaign: string, metric: "participant_count" | "answer_distribution", question?: string) =>
      call<AnalyticsResult>("lv_analytics_query", { p_campaign: campaign, p_metric: metric, p_question: question ?? null }),

    /* ---- membership ---- */
    hubJoin: (hub: string) => call<{ membership_id: string; status: "accepted" | "pending" }>("lv_hub_join", { p_hub: hub }),
    memberLeave: (hub: string) => call<object>("lv_member_leave", { p_hub: hub }),
    memberAdmit: (membership: string) => call<object>("lv_member_admit", { p_membership: membership }),
    memberReject: (membership: string) => call<object>("lv_member_reject", { p_membership: membership }),
    memberRemove: (membership: string) => call<object>("lv_member_remove", { p_membership: membership }),
    memberRoleAssign: (membership: string, role: string) => call<object>("lv_member_role_assign", { p_membership: membership, p_role: role }),
    memberRoleUnassign: (membership: string, role: string) => call<object>("lv_member_role_unassign", { p_membership: membership, p_role: role }),

    /* ---- roles ---- */
    capabilityCatalog: () =>
      call<{ groups: { key: string; label: string; capabilities: { key: string; label: string }[] }[] }>("lv_capability_catalog"),
    roleList: (hub: string) => call<{ roles: Role[]; custom_slots: number | null; slots_used: number }>("lv_role_list", { p_hub: hub }),
    roleCreate: (hub: string, name: string, icon: string, capabilities: string[]) =>
      call<{ role_id: string }>("lv_role_create", { p_hub: hub, p_name: name, p_icon: icon, p_capabilities: capabilities }),
    roleUpdate: (role: string, patch: { name?: string; icon?: string; capabilities?: string[] }) =>
      call<object>("lv_role_update", { p_role: role, p_name: patch.name ?? null, p_icon: patch.icon ?? null, p_capabilities: patch.capabilities ?? null }),
    roleDelete: (role: string) => call<object>("lv_role_delete", { p_role: role }),

    /* ---- campaign lifecycle ---- */
    campaignUpdate: (campaign: string, patch: { title?: string }) => call<object>("lv_campaign_update", { p_campaign: campaign, p_title: patch.title ?? null }),
    questionUpdate: (question: string, patch: { prompt?: string; config?: object; position?: number }) =>
      call<object>("lv_campaign_question_update", { p_question: question, p_prompt: patch.prompt ?? null, p_config: patch.config ?? null, p_position: patch.position ?? null }),
    questionRemove: (question: string) => call<object>("lv_campaign_question_remove", { p_question: question }),
    setParticipation: (campaign: string, anonymity: Anonymity, audience: "members" | "members_and_guests", guestLimit?: number | null) =>
      call<object>("lv_campaign_set_participation", { p_campaign: campaign, p_anonymity: anonymity, p_audience: audience, p_guest_limit: guestLimit ?? null }),
    schedule: (campaign: string, opensAt: string | null, closesAt: string | null) =>
      call<object>("lv_campaign_schedule", { p_campaign: campaign, p_opens_at: opensAt, p_closes_at: closesAt }),
    campaignPause: (campaign: string) => call<object>("lv_campaign_pause", { p_campaign: campaign }),
    campaignResume: (campaign: string) => call<object>("lv_campaign_resume", { p_campaign: campaign }),
    campaignArchive: (campaign: string) => call<object>("lv_campaign_archive", { p_campaign: campaign }),
    campaignVersions: (campaign: string) => call<{ versions: { revision: number; created_at: string; note?: string }[] }>("lv_campaign_versions", { p_campaign: campaign }),

    /* ---- guests ---- */
    guestCampaignGet: (joinCode: string) => call<CampaignDetailData>("lv_guest_campaign_get", { p_join_code: joinCode }),
    guestSubmit: (joinCode: string, guestKey: string, answers: Answer[]) =>
      call<SubmitReceipt>("lv_guest_submit", { p_join_code: joinCode, p_guest_key: guestKey, p_answers: answers }),

    /* ---- no backend yet: fail closed with an honest code ----------------
       Each of these names the function it expects. Do not fake a success. */
    pending: (fn: string) =>
      call<never>(fn).then(() => ({ ok: false as const, error: { code: "lv_server_error" as const, message: `TODO(real: ${fn}) is not available yet.` } })),
  };
}

export interface Role {
  role_id: string;
  key: string;
  name: string;
  icon: string;
  capabilities: string[];
  member_count: number;
  is_owner?: boolean;
}

/* Contract gaps (docs/frontend/CONTRACT_REQUESTS.md): no lv_api function exists yet.
   The UI renders these as "Not available yet" rather than pretending. */
export const PENDING_API = {
  hubUpdate: "lv_hub_update",
  hubDomainRestriction: "lv_hub_domain_restriction",
  hubDelete: "lv_hub_delete",
  ownerTransfer: "lv_owner_transfer",
  reservationStatus: "lv_hub_reservation_status",
  billingSummary: "lv_billing_summary",
  discoverApply: "lv_discover_apply",
  profileUpdate: "lv_profile_update",
  accountDelete: "lv_account_delete",
  waitlistStatus: "lv_waitlist_status",
  waitlistJoin: "lv_waitlist_join",
  exportResults: "lv_analytics_export",
} as const;


export type LvApi = ReturnType<typeof createLvApi>;
