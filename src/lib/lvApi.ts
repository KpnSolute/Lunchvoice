// Typed client for the v2 `lv_api` functions. Shapes follow docs/backend/API_CONTRACT.md and the launch contract in
// docs/v2/LAUNCH_PLAN.md ("API contract"). Every expected application failure arrives as {ok:false,error}.

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
  | "lv_entitlement_required"
  | "lv_billing_unavailable"
  | "lv_price_unset"
  | "lv_not_available"
  | "lv_confirmation_mismatch"
  | "lv_hub_gone"
  | "lv_server_error";

export interface LvError {
  code: LvErrorCode;
  message: string;
  missing?: string[];
  reasons?: string[];
  /** lv_limit_reached */
  limit?: number;
  used?: number;
  /** lv_entitlement_required: the product that would unlock the action */
  product?: Product;
}

export type LvResult<T> = ({ ok: true } & T) | { ok: false; error: LvError };

/* ------------------------------------------------------------------ entitlements */

export type PlanFamily = "free" | "starter" | "team";
export type Product = "starter_hub" | "team_hub" | "campaign_starter" | "campaign_plus" | "hub_reservation" | "founding";
export type EntitlementState = "active" | "expired" | "scheduled";

export interface Entitlement {
  id: string;
  product: Product;
  family: PlanFamily;
  scope: "account" | "hub";
  hub_id?: string;
  starts_at: string;
  ends_at?: string | null;
  state: EntitlementState;
  source: "waitlist" | "billing" | "grant";
}

export interface HubPlan {
  family: PlanFamily;
  product: Product | null;
  ends_at: string | null;
  state: EntitlementState | "none";
}

export type LimitMap = Record<string, number | null>;

export interface PlanLimits {
  families: Record<PlanFamily, LimitMap>;
  products: { product: Product; family: PlanFamily; price_cents?: number | null; interval: string; purchasable: boolean }[];
}

/* ------------------------------------------------------------------ context */

export type BetaStatus = "none" | "pending" | "approved" | "rejected" | "consumed";
export type WaitlistState = "none" | "admitted" | "waitlisted";

export interface HubSummary {
  hub_id: string;
  slug: string;
  name: string;
  kind?: "community";
  is_owner: boolean;
  roles: { key: string; name: string }[];
  capabilities: string[];
  plan?: HubPlan;
}

export interface ParticipationItem {
  campaign_id: string;
  title: string;
  hub_name: string | null;
  answered_at: string;
}

export interface MyContext {
  account_id: string;
  display_name: string | null;
  email_verified: boolean;
  is_platform_admin: boolean;
  beta_status?: BetaStatus;
  hubs: HubSummary[];
  entitlements: Entitlement[];
  hub_credits: number;
  quick_surveys: { active: number; limit: number | null; question_limit: number | null };
  waitlist: { status: WaitlistState; position?: number };
  /** Contract request (not in LAUNCH_PLAN yet): recent answers, own account only. Hidden when absent. */
  recent_participation?: ParticipationItem[];
}

/* ------------------------------------------------------------------ hubs */

export type Visibility = "public" | "private";
export type MembershipMode = "open" | "approval" | "invite_only";

export interface HubInfo {
  hub_id: string;
  slug: string;
  name: string;
  visibility: Visibility;
  membership_mode: MembershipMode;
  member_count: number;
  about?: string | null;
  accent?: string | null;
  /** The fixed contrast-safe palette p_accent must come from. */
  accent_palette?: string[];
  plan?: HubPlan;
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

export type PageKind = "home" | "campaigns" | "custom" | "shop" | "leaderboard" | "news" | "comments";
export interface HubPage {
  key: string;
  kind: PageKind;
  title: string;
  body?: string | null;
  position: number;
  enabled: boolean;
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

/* ------------------------------------------------------------------ campaigns */

export type CampaignMode = "survey" | "poll" | "rating" | "feedback";
export type Anonymity = "anonymous" | "identified";
export type CampaignStatus = "draft" | "active" | "paused" | "closed" | "archived";
export type QuestionKind = "rating" | "single_choice" | "multi_choice" | "yes_no" | "text";
export type SurveyAccess = "link" | "invite";

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
  /** Quick Surveys only */
  access?: SurveyAccess;
  response_count?: number | null;
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
    audience?: "members" | "members_and_guests";
    /** Quick Surveys (personal space) */
    space?: "personal" | "community";
    access?: SurveyAccess;
    question_limit?: number | null;
  };
  questions: Question[];
  has_responded: boolean;
  receipt_id: string | null;
  can_respond: boolean;
  can_manage: boolean;
  join_code?: string;
  gate?: { ok: boolean; reasons: string[] };
}

export interface CampaignInvite {
  token: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  revoked?: boolean;
}

export interface Cell {
  key: string;
  n: number | null;
  suppressed: boolean;
  reason: "below_min_cohort" | "complementary" | null;
}

export type AnalyticsResult =
  | { metric: "participant_count"; n: number | null; suppressed: boolean; guest_n?: number | null; guest_suppressed?: boolean }
  | {
      metric: "answer_distribution";
      question_id: string;
      /** L-07: suppressed options arrive merged into one cell with key "withheld". */
      cells: Cell[];
      /** L-10 (contract request): free-text answers, unordered, no names or times; null/withheld until enough answers. */
      texts?: string[] | null;
      texts_withheld?: boolean;
    };

export interface ExportRow {
  question_id: string;
  prompt: string;
  answer: string;
  n: number | null;
  suppressed: boolean;
}

export interface SubmitReceipt {
  receipt_id: string;
  duplicate: boolean;
}

export interface Answer {
  question_id: string;
  value: unknown;
}

/* ------------------------------------------------------------------ waitlist, billing, reservation */

export interface WaitlistStatus {
  seats_total: number;
  seats_taken: number;
  open: boolean;
  me?: { status: WaitlistState; position?: number; joined_at?: string };
}

export interface BillingSummary {
  plan: { family: PlanFamily; product: Product | null; state: EntitlementState | "none"; starts_at: string | null; ends_at: string | null };
  limits: LimitMap;
  usage: { custom_roles: number; custom_pages: number; active_campaigns: number; active_surveys: number };
  reservation?: ReservationStatus | null;
}

export type ReservationState = "available" | "active" | "grace" | "released" | "taken";
export interface ReservationStatus {
  slug: string;
  state: ReservationState;
  expires_at?: string | null;
  grace_ends_at?: string | null;
  mine: boolean;
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
    /* ---- context, entitlements, waitlist ---- */
    myContext: () => call<MyContext>("lv_my_context"),
    planLimits: () => call<PlanLimits>("lv_plan_limits"),
    waitlistStatus: () => call<WaitlistStatus>("lv_waitlist_status"),
    // p_consent_version is sent only with a contact email (consent is required only then). Contract request: the
    // deployed lv_waitlist_join(p_contact_email, p_note) needs this parameter added before an email can be stored.
    waitlistJoin: (contactEmail?: string | null, note?: string | null, consentVersion?: string | null) =>
      call<{ status: Exclude<WaitlistState, "none">; position: number; granted?: Entitlement }>("lv_waitlist_join", {
        p_contact_email: contactEmail || null,
        p_note: note || null,
        ...(contactEmail ? { p_consent_version: consentVersion ?? null } : {}),
      }),

    /* ---- account ---- */
    profileUpdate: (displayName: string) =>
      call<{ account: { account_id: string; display_name: string | null } }>("lv_profile_update", { p_display_name: displayName }),
    accountDelete: (confirm: string) => call<object>("lv_account_delete", { p_confirm: confirm }),

    /* ---- hubs ---- */
    hubCreate: (slug: string, name: string) => call<{ hub_id: string; slug: string }>("lv_hub_create", { p_slug: slug, p_name: name }),
    // The backend returns the accent palette at the top level (`accents`) and the plan under `membership.plan`;
    // normalize both onto `hub` so pages read one shape.
    hubGet: (slug: string) =>
      call<{ hub: HubInfo; membership: (HubMembership & { plan?: HubPlan }) | null; accents?: string[] }>("lv_hub_get", { p_slug: slug }).then((r) => {
        if (!r.ok) return r;
        const hub: HubInfo = { ...r.hub, accent_palette: r.hub.accent_palette ?? r.accents, plan: r.hub.plan ?? r.membership?.plan };
        return { ...r, hub };
      }),
    hubUpdate: (
      hub: string,
      patch: { display_name?: string; visibility?: Visibility; membership_mode?: MembershipMode; about?: string; accent?: string },
    ) =>
      call<{ hub: HubInfo }>("lv_hub_update", {
        p_hub: hub,
        p_display_name: patch.display_name ?? null,
        p_visibility: patch.visibility ?? null,
        p_membership_mode: patch.membership_mode ?? null,
        p_about: patch.about ?? null,
        p_accent: patch.accent ?? null,
      }),
    ownerTransfer: (hub: string, membership: string, confirm: string) =>
      call<object>("lv_owner_transfer", { p_hub: hub, p_membership: membership, p_confirm: confirm }),
    hubDelete: (hub: string, confirm: string) => call<object>("lv_hub_delete", { p_hub: hub, p_confirm: confirm }),
    hubPagesGet: (hub: string) => call<{ pages: HubPage[]; custom_slots: { used: number; limit: number | null } }>("lv_hub_pages_get", { p_hub: hub }),
    hubPagesUpdate: (hub: string, pages: HubPage[]) => call<{ pages: HubPage[] }>("lv_hub_pages_update", { p_hub: hub, p_pages: pages }),
    memberList: (hub: string) => call<{ members: Member[] }>("lv_member_list", { p_hub: hub }),

    /* ---- Hub invitations ---- */
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

    /* ---- campaigns ---- */
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
    campaignUpdate: (campaign: string, patch: { title?: string }) => call<object>("lv_campaign_update", { p_campaign: campaign, p_title: patch.title ?? null }),
    questionUpdate: (question: string, patch: { prompt?: string; config?: object; position?: number }) =>
      call<object>("lv_campaign_question_update", { p_question: question, p_prompt: patch.prompt ?? null, p_config: patch.config ?? null, p_position: patch.position ?? null }),
    questionRemove: (question: string) => call<object>("lv_campaign_question_remove", { p_question: question }),
    setParticipation: (campaign: string, audience: "members" | "members_and_guests", guestLimit?: number | null) =>
      call<object>("lv_campaign_set_participation", { p_campaign: campaign, p_audience: audience, p_guest_limit: guestLimit ?? null }),
    schedule: (campaign: string, opensAt: string | null, closesAt: string | null) =>
      call<object>("lv_campaign_schedule", { p_campaign: campaign, p_opens_at: opensAt, p_closes_at: closesAt }),
    campaignPause: (campaign: string) => call<object>("lv_campaign_pause", { p_campaign: campaign }),
    campaignResume: (campaign: string) => call<object>("lv_campaign_resume", { p_campaign: campaign }),
    campaignArchive: (campaign: string) => call<object>("lv_campaign_archive", { p_campaign: campaign }),

    /* ---- Quick Surveys (personal space) ---- */
    quickSurveyCreate: (title: string, access: SurveyAccess, anonymity: Anonymity, guests = true) =>
      call<{ campaign: { campaign_id: string } & Partial<CampaignRow> }>("lv_quick_survey_create", {
        p_title: title,
        p_access: access,
        p_anonymity: anonymity,
        p_guests: access === "link" ? guests : false,
      }),
    quickSurveyList: () => call<{ surveys: CampaignRow[]; active: number; limit: number | null }>("lv_quick_survey_list"),
    campaignInviteCreate: (campaign: string, maxUses?: number | null, expiresAt?: string | null) =>
      call<{ invite: CampaignInvite }>("lv_campaign_invite_create", { p_campaign: campaign, p_max_uses: maxUses ?? null, p_expires_at: expiresAt ?? null }),
    campaignInviteList: (campaign: string) => call<{ invites: CampaignInvite[] }>("lv_campaign_invite_list", { p_campaign: campaign }),
    campaignInviteRevoke: (token: string) => call<object>("lv_campaign_invite_revoke", { p_token: token }),
    campaignInviteRedeem: (token: string) => call<{ campaign_id: string; join_code: string | null }>("lv_campaign_invite_redeem", { p_token: token }),

    /* ---- respond ---- */
    submit: (campaign: string, answers: Answer[]) =>
      call<SubmitReceipt>("lv_submit_response", { p_campaign: campaign, p_answers: answers }),
    // The guest read returns `phase` (not `status`) and no member fields; map it onto the member shape.
    guestCampaignGet: (joinCode: string) =>
      call<CampaignDetailData & { campaign: { phase?: string; guests_allowed?: boolean } }>("lv_guest_campaign_get", { p_join_code: joinCode }).then((r) => {
        if (!r.ok) return r;
        const ph = r.campaign.phase;
        const status = r.campaign.status ?? (ph === "closed" || ph === "ended" ? "closed" : ph === "paused" ? "paused" : ph === "draft" ? "draft" : "active");
        return {
          ...r,
          campaign: { ...r.campaign, status, audience: r.campaign.audience ?? (r.campaign.guests_allowed === false ? "members" : "members_and_guests") },
          has_responded: r.has_responded ?? false,
          receipt_id: r.receipt_id ?? null,
          can_manage: false,
          join_code: r.join_code ?? joinCode,
        } as LvResult<CampaignDetailData>;
      }),
    guestSubmit: (joinCode: string, guestKey: string, answers: Answer[]) =>
      call<SubmitReceipt>("lv_guest_submit", { p_join_code: joinCode, p_guest_key: guestKey, p_answers: answers }),

    /* ---- analytics ---- */
    analytics: (campaign: string, metric: "participant_count" | "answer_distribution", question?: string) =>
      call<AnalyticsResult>("lv_analytics_query", { p_campaign: campaign, p_metric: metric, p_question: question ?? null }),
    analyticsExport: (campaign: string) => call<{ rows: ExportRow[] }>("lv_analytics_export", { p_campaign: campaign }),

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

    /* ---- billing-ready (fails closed until the founder wires a provider) ---- */
    checkoutStart: (product: Product, hub?: string | null, weeks?: number | null) =>
      call<{ checkout_url: string }>("lv_checkout_start", { p_product: product, p_hub: hub ?? null, p_weeks: weeks ?? null }),
    billingSummary: (hub: string) => call<BillingSummary>("lv_billing_summary", { p_hub: hub }),
    reservationStatus: (slug: string) => call<ReservationStatus>("lv_hub_reservation_status", { p_slug: slug }),
    discoverApply: (hub: string) => call<{ status: "submitted" }>("lv_discover_apply", { p_hub: hub }),

    /* ---- abuse ---- */
    reportAbuse: (joinCode: string, reason: string) => call<object>("lv_report_abuse", { p_join_code: joinCode, p_reason: reason }),
  };
}

export type LvApi = ReturnType<typeof createLvApi>;

/** Active entitlement helper for display only; the backend decides what is allowed. */
export function activeFamily(plan: HubPlan | undefined | null): PlanFamily | null {
  if (!plan || plan.state !== "active") return null;
  return plan.family;
}
