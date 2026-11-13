import { accentHex, normalizePalette, type AccentOption } from "./accent";
// Typed client for the v2 `lv_api` functions. Shapes follow docs/backend/API_CONTRACT.md and the launch contract in
// docs/v2/LAUNCH_PLAN.md ("API contract"). Every expected application failure arrives as {ok:false,error}.
/* ---- track C: community ---- */
import { communityApi } from "./communityApi";
/* ---- end track C ---- */
/* ---- track D: api + discord ---- */
import { integrationsApi } from "./integrationsApi";
import { brandingApi, type BrandingStorage } from "./surveyBrandingApi"; // survey branding (000043)
/* ---- end track D ---- */

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
  | "lv_server_error"
  /* ---- track C: community ---- */
  | "lv_insufficient_points"
  | "lv_out_of_stock";

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
  /** 000035: public billing state: on or off, the launch date and when Founding access ends. */
  billing?: { open: boolean; launch_at: string | null; founding_ends_at: string | null };
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
  /** 000018 (track A): ownership offers waiting for this account's answer. */
  owner_transfer_offers?: OwnerOffer[];
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
  /** The palette KEY (e.g. "teal"), as stored by lv_hub_update (000015). */
  accent?: string | null;
  /** Derived in lvApi: the hex for `accent`, or null. */
  accent_hex?: string | null;
  /** The fixed contrast-safe palette p_accent must come from: { key, label, hex } objects (lv_hub_get `accents`). */
  accent_palette?: AccentOption[];
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

export interface QuestionConfig {
  /** Choice questions: the answer options. */
  options?: string[];
  /** Multiple choice: the most options a person may pick (enforced by the player). */
  max?: number;
  /** A person may skip this question (backend honours it since 000017). */
  optional?: boolean;
  /** 000041: this question starts a section. Questions up to the next section start belong to it. */
  section?: SectionConfig | null;
  /** 000042 Linked Questions: show this question only when the rule is met (rules only look back). */
  show_if?: LogicRule | null;
  /** 000042: single choice or yes/no answers that skip forward to a question, or to the end ("end"). */
  jumps?: LogicJump[];
  /** 000042: show the options in a stable random order per person; keep_last pins the last one ("Other", "None"). */
  shuffle?: boolean;
  keep_last?: boolean;
  [key: string]: unknown;
}

/** 000042: one condition on an earlier answer. any_of/none_of: choice and yes/no ("true"/"false");
 *  at_least/at_most/between: rating (min/max). An unanswered or hidden source never meets a condition. */
export type ConditionOp = "any_of" | "none_of" | "at_least" | "at_most" | "between";
export interface LogicCondition { question_id: string; op: ConditionOp; values?: string[]; min?: number; max?: number }
export interface LogicRule { match: "all" | "any"; conditions: LogicCondition[] }
/** `when` is an option (or "true"/"false"); `to` is a later question id or "end". */
export interface LogicJump { when: string; to: string }
/** 000042: per-question results on a survey with logic. Counts are null when withheld (anonymous, under 5). */
export interface QuestionLogicResult {
  metric: "question_logic";
  question_id: string;
  filter: LogicFilter | null;
  /** The filter group is under 5 (or leaves fewer than 5 outside it): nothing about it may be shown. */
  filter_withheld?: boolean;
  seen: number | null;
  answered: number | null;
  seen_withheld: boolean;
  cells: Cell[];
  withheld?: boolean;
  texts?: string[] | null;
  texts_withheld?: boolean;
}
/** Only respondents whose answer to an earlier choice or yes/no question is one of any_of. */
export interface LogicFilter { question_id: string; any_of: string[] }

/** 000041: show the section only when an earlier choice or yes/no answer is one of any_of ("true"/"false" for yes/no). */
export interface SectionRule { question_id: string; any_of: string[] }
export interface SectionConfig { title: string; description?: string | null; show_if?: SectionRule | null; /** 000042: random question order inside the section */ shuffle?: boolean }

export interface Question {
  question_id: string;
  position: number;
  kind: QuestionKind;
  prompt: string;
  config: QuestionConfig;
}

export type GuestNamesMode = "off" | "optional" | "required";

/** One person's answer in the Responses view (identified Campaigns only, 000028). */
export interface ResponseRow {
  response_id: string;
  kind: "member" | "guest";
  /** false for guests: their name is typed by them and never verified. */
  verified: boolean;
  name: string | null;
  at: string;
  answers: { question_id: string; prompt: string; kind: string; value: unknown }[];
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
    /** 000018 (track A) */
    description?: string | null;
    /** 000028: whether guests are asked for a name (identified Campaigns only). Managers and the guest view get it. */
    guest_names?: GuestNamesMode;
    /** 000027 (managers only): someone has answered, so a paused Campaign's mode, anonymity and questions stay locked. */
    has_responses?: boolean;
  };
  questions: Question[];
  /** 000041 (managers only): survey features this person may use here (their Hub's plan or their Creator plan). */
  features?: { branching: boolean; branding: boolean };
  has_responded: boolean;
  receipt_id: string | null;
  can_respond: boolean;
  can_manage: boolean;
  join_code?: string;
  /** Managers only: the activation gate with the limit in force when one is reached (000014 gate_evaluate). */
  gate?: { ok: boolean; reasons: string[]; family?: string | null; limit?: number; used?: number; limit_key?: string };
  blocked?: boolean;
  /** 000018 (track A, managers only): the 128-bit link token for links and QR codes (LC-10) and the member audience. */
  link_token?: string;
  audience?: CampaignAudience;
}

/** A public Hub's open guest Campaign, as lv_hub_public_poll returns it (000046). Never results or counts. */
export interface PublicPoll {
  title: string;
  description: string | null;
  mode: CampaignMode;
  anonymity: Anonymity;
  closes_at: string | null;
  question_count: number;
  /** Opens the guest player at /c/<link_token>. */
  link_token: string;
}

export interface CampaignInvite {
  /** Shown once, only in the lv_campaign_invite_create result (000018, NEW-05). */
  token?: string;
  /** 000018: listing shows the invite id and a 6-character prefix instead of the token. */
  invite_id?: string;
  prefix?: string;
  state?: InviteState;
  shown_once?: boolean;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  revoked?: boolean;
}

export interface Cell {
  /** null for the merged withheld bucket in the real API. */
  key: string | null;
  n: number | null;
  suppressed: boolean;
  reason: "below_min_cohort" | "complementary" | null;
}

export type AnalyticsResult =
  | { metric: "participant_count"; n: number | null; suppressed: boolean; guest_n?: number | null; guest_suppressed?: boolean }
  | {
      metric: "answer_distribution";
      question_id: string;
      /** L-07: suppressed options arrive merged into one cell (key null in the real API, "withheld" in the mock). */
      cells: Cell[];
      /** The whole question is withheld: `cells` is empty and nothing about it may be shown (never as zero). */
      withheld?: boolean;
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
  /** Survey branding images (000043); absent where uploads are not available. */
  storage?: BrandingStorage;
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
    ...createCommerceApi(transport, call), // track B: commerce (block at the end of this file)
    ...createStaffApi(call), // staff panel (block at the end of this file)
    /* ---- context, entitlements, waitlist ---- */
    myContext: () => call<MyContext>("lv_my_context"),
    planLimits: () => call<PlanLimits>("lv_plan_limits"),
    waitlistStatus: () => call<WaitlistStatus>("lv_waitlist_status"),
    // lv_waitlist_join(p_contact_email, p_intended_hub_name, p_consent_version) (000014). p_consent_version is sent
    // only with a contact email (consent is required only then).
    waitlistJoin: (contactEmail?: string | null, intendedHubName?: string | null, consentVersion?: string | null) =>
      call<{ status: Exclude<WaitlistState, "none">; position: number; granted?: Entitlement }>("lv_waitlist_join", {
        p_contact_email: contactEmail || null,
        p_intended_hub_name: intendedHubName || null,
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
      call<{ hub: HubInfo; membership: (HubMembership & { plan?: HubPlan }) | null; accents?: unknown }>("lv_hub_get", { p_slug: slug }).then((r) => {
        if (!r.ok) return r;
        // Founder bug: the palette arrives as objects; painting them as colours gave blank swatches. Normalise here.
        const palette = normalizePalette(r.hub.accent_palette ?? r.accents);
        const hub: HubInfo = { ...r.hub, accent_palette: palette, accent_hex: accentHex(r.hub.accent, palette), plan: r.hub.plan ?? r.membership?.plan };
        return { ...r, hub };
      }),
    // lv_hub_public_poll(p_slug) (000046), signed out allowed: a public Hub's latest open Campaign that guests may
    // answer, or null. Private, missing and suspended Hubs answer null too.
    hubPublicPoll: (slug: string) => call<{ poll: PublicPoll | null }>("lv_hub_public_poll", { p_slug: slug }),
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

    /* ---- reporting people and Hubs (000029) ---- */
    reportAccount: (hub: string, target: { membership?: string; comment?: string }, reason: string, details: string) =>
      call<{ duplicate?: boolean; report_id?: string }>("lv_report_account", { p_hub: hub, p_membership: target.membership ?? null, p_comment: target.comment ?? null, p_reason: reason, p_details: details || null }),
    reportHub: (slug: string, reason: string, details: string) =>
      call<{ duplicate?: boolean; report_id?: string }>("lv_report_hub", { p_slug: slug, p_reason: reason, p_details: details || null }),
    myReports: () => call<{ reports: MyReport[] }>("lv_my_reports"),

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
    // lv_campaign_update(p_campaign, p_title, p_mode, p_anonymity, p_opens_at, p_closes_at, p_clear_schedule) (000011):
    // draft only; NULL leaves a field unchanged; p_clear_schedule removes both window ends.
    campaignUpdate: (
      campaign: string,
      patch: { title?: string; mode?: CampaignMode; anonymity?: Anonymity; opensAt?: string; closesAt?: string; clearSchedule?: boolean },
    ) =>
      call<object>("lv_campaign_update", {
        p_campaign: campaign,
        p_title: patch.title ?? null,
        p_mode: patch.mode ?? null,
        p_anonymity: patch.anonymity ?? null,
        p_opens_at: patch.opensAt ?? null,
        p_closes_at: patch.closesAt ?? null,
        p_clear_schedule: patch.clearSchedule ?? false,
      }),
    questionUpdate: (question: string, patch: { prompt?: string; config?: object; position?: number; kind?: QuestionKind }) =>
      call<object>("lv_campaign_question_update", {
        p_question: question,
        p_position: patch.position ?? null,
        p_kind: patch.kind ?? null,
        p_prompt: patch.prompt ?? null,
        p_config: patch.config ?? null,
      }),
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
    // lv_quick_survey_delete(p_campaign) (000045): the creator deletes a Quick Survey and every answer to it. Refused
    // (lv_locked) while staff review it; anything not the caller's Quick Survey is lv_not_found.
    quickSurveyDelete: (campaign: string) => call<{ deleted: true }>("lv_quick_survey_delete", { p_campaign: campaign }),
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
    // 000028: always the four-argument call; the name is null unless the creator asked for one.
    guestSubmit: (joinCode: string, guestKey: string, answers: Answer[], guestName: string | null = null) =>
      call<SubmitReceipt>("lv_guest_submit", { p_join_code: joinCode, p_guest_key: guestKey, p_answers: answers, p_guest_name: guestName }),
    campaignSetGuestNames: (campaign: string, mode: GuestNamesMode) =>
      call<{ guest_names: GuestNamesMode }>("lv_campaign_set_guest_names", { p_campaign: campaign, p_mode: mode }),
    campaignResponses: (campaign: string, limit = 50, before: string | null = null) =>
      call<{ responses: ResponseRow[]; total: number }>("lv_campaign_responses", { p_campaign: campaign, p_limit: limit, p_before: before }),

    /* ---- analytics ---- */
    analytics: (campaign: string, metric: "participant_count" | "answer_distribution", question?: string) =>
      call<AnalyticsResult>("lv_analytics_query", { p_campaign: campaign, p_metric: metric, p_question: question ?? null }),
    /** 000042: seen/answered counts and the distribution, optionally only for people who gave an earlier answer. */
    analyticsQuestion: (campaign: string, question: string, filter: LogicFilter | null = null) =>
      call<QuestionLogicResult>("lv_analytics_question", { p_campaign: campaign, p_question: question, p_filter: filter }),
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
    // lv_role_list (000010/000014): custom_slots is { used, limit } (limit null = undecided, fails closed).
    roleList: (hub: string) => call<{ roles: Role[]; custom_slots: { used: number; limit: number | null } }>("lv_role_list", { p_hub: hub }),
    // lv_role_create returns { ok, role } (000010).
    roleCreate: (hub: string, name: string, icon: string, capabilities: string[]) =>
      call<{ role: Role }>("lv_role_create", { p_hub: hub, p_name: name, p_icon: icon, p_capabilities: capabilities }),
    roleUpdate: (role: string, patch: { name?: string; icon?: string; capabilities?: string[] }) =>
      call<object>("lv_role_update", { p_role: role, p_name: patch.name ?? null, p_icon: patch.icon ?? null, p_capabilities: patch.capabilities ?? null }),
    roleDelete: (role: string) => call<object>("lv_role_delete", { p_role: role }),

    /* ---- billing-ready (fails closed until the founder wires a provider) ---- */
    checkoutStart: (product: Product, hub?: string | null, weeks?: number | null, slug?: string | null) =>
      call<{ checkout_url: string }>("lv_checkout_start", { p_product: product, p_hub: hub ?? null, p_weeks: weeks ?? null, p_slug: slug ?? null }),
    billingSummary: (hub: string) => call<BillingSummary>("lv_billing_summary", { p_hub: hub }),
    reservationStatus: (slug: string) => call<ReservationStatus>("lv_hub_reservation_status", { p_slug: slug }),
    discoverApply: (hub: string) => call<{ status: "submitted" }>("lv_discover_apply", { p_hub: hub }),

    /* ---- abuse ---- */
    reportAbuse: (joinCode: string, reason: string) => call<object>("lv_report_abuse", { p_join_code: joinCode, p_reason: reason }),

    /* ---- track A: hardening ---- */
    // lv_campaign_create(..., p_description) (000018).
    campaignCreateDescribed: (hub: string, title: string, mode: CampaignMode, anonymity: Anonymity, description: string | null) =>
      call<{ campaign_id: string }>("lv_campaign_create", { p_hub: hub, p_title: title, p_mode: mode, p_anonymity: anonymity, p_description: description }),
    // lv_campaign_update(p_campaign, p_description?, p_access?) (000018): draft only; '' clears the description; access
    // is for Quick Surveys only and switching to invite turns guests off.
    campaignDetailsUpdate: (campaign: string, patch: { description?: string; access?: SurveyAccess }) =>
      call<object>("lv_campaign_update", { p_campaign: campaign, p_description: patch.description ?? null, p_access: patch.access ?? null }),
    // NULL or [] = every member; Team family only (lv_entitlement_required { product: "team_hub" } otherwise).
    campaignSetAudienceRoles: (campaign: string, roles: string[] | null) =>
      call<{ audience: CampaignAudience }>("lv_campaign_set_audience_roles", { p_campaign: campaign, p_roles: roles && roles.length ? roles : null }),
    hubLimits: (hub: string) => call<HubLimits>("lv_hub_limits", { p_hub: hub }),
    campaignInviteRevokeById: (invite: string) => call<object>("lv_campaign_invite_revoke_by_id", { p_invite: invite }),
    ownerTransferStatus: (hub: string) => call<{ offer: OwnerOffer | null }>("lv_owner_transfer_status", { p_hub: hub }),
    ownerTransferCancel: (hub: string) => call<{ cancelled: boolean }>("lv_owner_transfer_cancel", { p_hub: hub }),
    ownerTransferAccept: (offer: string) => call<{ accepted: true; hub_id: string; slug: string }>("lv_owner_transfer_accept", { p_offer: offer }),
    ownerTransferDecline: (offer: string) => call<{ accepted: false }>("lv_owner_transfer_decline", { p_offer: offer }),
    /* ---- track C: community ---- */
    ...communityApi(call),
    /* ---- end track C ---- */
    /* ---- track D: api + discord ---- */
    ...integrationsApi(call),
    /* ---- end track D ---- */
    ...brandingApi(transport, call), // survey branding (000043)
  };
}

export type LvApi = ReturnType<typeof createLvApi>;

/** Active entitlement helper for display only; the backend decides what is allowed. */
export function activeFamily(plan: HubPlan | undefined | null): PlanFamily | null {
  if (!plan || plan.state !== "active") return null;
  return plan.family;
}

/* ---- track A: hardening ---- */

/** 000018: who among the Hub's members a Campaign is for. Guests are never affected by roles. */
export interface CampaignAudience {
  scope: "all_members" | "roles";
  roles: { role_id: string; name: string }[];
  /** The Hub's plan includes role targeting (Team family). */
  role_targeting: boolean;
  /** Managers of community Hubs: every role of the Hub. */
  available_roles?: { role_id: string; name: string; is_owner: boolean }[];
}

/** 000018 lv_hub_limits: limits and usage for anyone with campaign.manage. No billing data. */
export interface HubLimits {
  plan: { family: PlanFamily | null; state: EntitlementState | "none" };
  limits: Record<string, unknown>;
  usage: { custom_roles: number; custom_pages: number; active_campaigns: number; active_surveys: number; active_surveys_below_threshold: number };
}

/** 000018: an ownership transfer waiting for the receiving member. */
export interface OwnerOffer {
  offer_id: string;
  hub_id: string;
  hub_slug: string;
  hub_name: string;
  membership_id: string;
  to_display_name: string | null;
  from_display_name: string | null;
  created_at: string;
  expires_at: string;
  state: "pending" | "accepted" | "declined" | "cancelled" | "expired";
}

/** The rule lv.question_config_problem (000018) enforces, shared by the editor and the dev mock. */
export function questionConfigProblem(kind: string, config: unknown): string | null {
  if (config !== null && config !== undefined && (typeof config !== "object" || Array.isArray(config))) return "Question settings must be an object.";
  if (kind !== "single_choice" && kind !== "multi_choice") return null;
  const c = (config ?? {}) as { options?: unknown; max?: unknown };
  if (!Array.isArray(c.options) || c.options.length < 2 || c.options.length > 10) return "A choice question needs 2 to 10 options.";
  if (c.options.some((o) => typeof o !== "string" || !o.trim())) return "Every option needs text.";
  const opts = c.options as string[];
  if (opts.some((o) => o.length > 200)) return "Keep each option to 200 characters.";
  if (new Set(opts.map((o) => o.trim().toLowerCase())).size < opts.length) return "Options must all be different.";
  if (c.max !== undefined && c.max !== null && (typeof c.max !== "number" || !Number.isInteger(c.max) || c.max < 1 || c.max > opts.length))
    return "The most choices a person can pick must be between 1 and the number of options.";
  return null;
}

/** A 32-character hex link token (LC-10) rather than a 6-character join code. */
export const isLinkToken = (code: string) => /^[0-9a-fA-F]{32}$/.test(code.trim());
/* ---- track B: commerce ---- */
// Checkout (Stripe Checkout Sessions created server-side by the `checkout` Edge Function), the Customer Portal,
// the billing config read, Hub invites by email and the platform admin console (000019). Shapes follow
// docs/backend/API_CONTRACT.md, section "Track B: commerce, email, admin".

// Edge Functions are reached through the same transport (declaration merging keeps LvTransport one interface).
export interface LvTransport {
  invoke?(fn: string, body: Record<string, unknown>): Promise<unknown>;
}

export type PurchasableProduct = "starter_hub" | "team_hub" | "campaign_starter" | "campaign_plus" | "hub_reservation";

export interface BillingConfig {
  provider_ready: boolean;
  checkout_available: boolean;
  products: Partial<Record<PurchasableProduct, boolean>>;
  portal_available: boolean;
}

export interface SubscriptionState {
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  manageable: boolean;
}

/** lv_billing_summary as of 000019 (adds subscription and purchasable). */
export type BillingSummaryV2 = BillingSummary & {
  subscription?: SubscriptionState | null;
  billing_ready?: boolean;
  purchasable?: Partial<Record<PurchasableProduct, boolean>>;
};

export interface CheckoutRequest {
  product: PurchasableProduct;
  hub?: string | null;
  weeks?: number | null;
  slug?: string | null;
  /** Same-site path Stripe returns to (`?checkout=success|cancelled` is appended). */
  returnPath?: string;
}

export interface AdminOverview {
  waitlist: { seats_total: number; seats_taken: number; admitted: number; waitlisted: number; with_contact: number };
  reports_open: number;
  campaigns_blocked: number;
  discover_pending: number;
  billing: { provider_ready: boolean; events_7d: number; rejected_7d: number };
  email: { queued: number; sent: number; failed: number };
}
export interface AdminWaitlistEntry {
  entry_id: string;
  status: "admitted" | "waitlisted";
  position: number;
  joined_at: string;
  has_contact_email: boolean;
  intended_hub_name: string | null;
}
export interface AdminReport {
  report_id: string;
  status: "open" | "actioned" | "dismissed";
  reason: string;
  created_at: string;
  campaign_id: string | null;
  campaign_title: string | null;
  join_code: string | null;
  blocked: boolean;
  hub_name: string | null;
  hub_slug: string | null;
  quick_survey: boolean;
  open_reports: number;
}
export interface AdminDiscoverApplication {
  application_id: string;
  status: "submitted" | "approved" | "rejected";
  hub_id: string;
  hub_slug: string;
  hub_name: string;
  genuine_members_at_apply: number;
  genuine_members_now: number;
  family: PlanFamily | null;
  applied_at: string;
  decided_at: string | null;
  note: string | null;
}
export interface AdminBillingStatus {
  open: boolean;
  launch_at: string | null;
  founding_ends_at: string | null;
  launch_passed_billing_off: boolean;
  price_gaps: string[];
  founding_hubs: number;
  paying_hubs: number;
  events_7d: number;
  applied_7d: number;
  rejected_7d: number;
}
export interface AdminBillingEvent { id: number; type: string; outcome: "applied" | "ignored" | "rejected"; reason: string | null; received_at: string }
export interface AdminOutbox {
  counts: Record<string, number>;
  by_template: Record<string, number>;
  recent: { id: string; template: string; status: string; attempts: number; last_error: string | null; created_at: string; sent_at: string | null }[];
}

type Caller = <T>(fn: string, args?: Record<string, unknown>) => Promise<LvResult<T>>;

function createCommerceApi(transport: LvTransport, call: Caller) {
  const invoke = async <T>(fn: string, body: Record<string, unknown>): Promise<LvResult<T>> => {
    if (!transport.invoke) return { ok: false, error: { code: "lv_billing_unavailable", message: "Checkout is not available here." } };
    try {
      return normalize<T>(await transport.invoke(fn, body));
    } catch (e) {
      return { ok: false, error: { code: "lv_server_error", message: e instanceof Error ? e.message : String(e) } };
    }
  };
  return {
    billingConfig: () => call<BillingConfig>("lv_billing_config"),
    billingSummaryV2: (hub: string) => call<BillingSummaryV2>("lv_billing_summary", { p_hub: hub }),
    /** Starts a Stripe Checkout Session; on success redirect the browser to `url`. */
    checkout: (r: CheckoutRequest) =>
      invoke<{ url: string; intent_id: string }>("checkout", {
        action: "checkout", product: r.product, hub: r.hub ?? null, weeks: r.weeks ?? null, slug: r.slug ?? null, return_path: r.returnPath ?? "/me",
      }),
    /** Opens the Stripe Customer Portal for the caller's own subscription. */
    billingPortal: (returnPath: string) => invoke<{ url: string }>("checkout", { action: "portal", return_path: returnPath }),
    inviteEmailSend: (hub: string, code: string, to: string) =>
      call<{ queued: boolean; already_sent: boolean }>("lv_invite_email_send", { p_hub: hub, p_code: code, p_to: to }),

    adminOverview: () => call<AdminOverview>("lv_admin_overview"),
    adminWaitlist: (limit = 50, offset = 0) => call<{ total: number; entries: AdminWaitlistEntry[] }>("lv_admin_waitlist", { p_limit: limit, p_offset: offset }),
    adminWaitlistContact: (entry: string) => call<{ entry_id: string; contact_email: string | null }>("lv_admin_waitlist_contact", { p_entry: entry }),
    adminAbuseReports: (status: "open" | "actioned" | "dismissed" | "all" = "open") => call<{ reports: AdminReport[] }>("lv_admin_abuse_reports", { p_status: status }),
    adminReportDismiss: (report: string) => call<object>("lv_admin_report_dismiss", { p_report: report }),
    adminCampaignBlock: (campaign: string, reason: string) => call<object>("lv_admin_campaign_block", { p_campaign: campaign, p_reason: reason }),
    adminCampaignUnblock: (campaign: string) => call<object>("lv_admin_campaign_unblock", { p_campaign: campaign }),
    adminDiscoverList: (status: "submitted" | "approved" | "rejected" | "all" = "submitted") =>
      call<{ applications: AdminDiscoverApplication[] }>("lv_admin_discover_list", { p_status: status }),
    adminDiscoverDecide: (application: string, approve: boolean, note?: string | null) =>
      call<{ status: "approved" | "rejected" }>("lv_admin_discover_decide", { p_application: application, p_approve: approve, p_note: note ?? null }),
    adminBillingStatus: () => call<AdminBillingStatus>("lv_admin_billing_status"),
    adminBillingSet: (action: "schedule" | "clear" | "open" | "pause", launchAt: string | null = null, confirm: string | null = null) =>
      call<Omit<AdminBillingStatus, "price_gaps" | "founding_hubs" | "paying_hubs" | "events_7d" | "applied_7d" | "rejected_7d">>("lv_admin_billing_set", { p_action: action, p_launch_at: launchAt, p_confirm: confirm }),
    adminBillingEvents: (limit = 100) => call<{ events: AdminBillingEvent[] }>("lv_admin_billing_events", { p_limit: limit }),
    adminEmailOutbox: (limit = 50) => call<AdminOutbox>("lv_admin_email_outbox", { p_limit: limit }),
  };
}
/* ---- end track B: commerce ---- */

/* ---- track C: community ---- */
// Declaration merging: 000020 adds page visibility, the add-on plan flags and new error extras.
export interface HubPage {
  /** Custom pages only: "public" shows the page to visitors while the Hub is public. */
  visibility?: "members" | "public";
}
export interface LvError {
  /** lv_insufficient_points */
  balance?: number;
  price?: number;
  /** lv_not_available / lv_entitlement_required for an add-on page */
  kind?: string;
}
export type { AddonKind, AddonState, CommentRow, CommunityInfo, DiscoverHub, LeaderboardEntry, NewsPost, ShopData, ShopItem, ShopOrder } from "./communityApi";
/* ---- end track C ---- */

/* ---- staff panel (000023) ---- */
// Staff management, suspension, the unified reports queue, lookup and the audit viewer. All lv_admin_* calls answer
// lv_forbidden to non-staff. Shapes: docs/backend/API_CONTRACT.md, section "Staff panel (000023)".

export interface HubSuspension { suspended: true; suspended_at: string; reason?: string }
export interface AccountSuspension { suspended: true; reason: string; suspended_at: string }
// Declaration merging: lv_hub_get and lv_my_context carry the suspension state when there is one.
export interface HubInfo { suspension?: HubSuspension }
export interface MyContext { suspension?: AccountSuspension | null }

export interface StaffMember { account_id: string; display_name: string; granted_at: string; granted_by_name: string | null; is_me: boolean }
export interface AdminReportItem {
  type: "survey" | "comment" | "person" | "hub";
  id: string;
  status: "open" | "actioned" | "dismissed";
  reasons: string[];
  report_count: number;
  created_at: string;
  hub_id: string | null;
  hub_name: string | null;
  hub_slug: string | null;
  quick_survey: boolean;
  hub_suspended: boolean;
  campaign_id?: string | null;
  campaign_title?: string | null;
  join_code?: string | null;
  blocked?: boolean;
  comment_id?: string;
  post_id?: string | null;
  excerpt?: string;
  hidden?: boolean;
  author_suspended?: boolean;
  author_account_id?: string;
  /** 000029: reports about people and Hubs (staff only). */
  details?: string | null;
  staff_note?: string | null;
  target_account_id?: string | null;
  target_name?: string | null;
  target_suspended?: boolean | null;
  target_open_reports?: number | null;
}
export interface MyReport { report_id: string; kind: "person" | "hub"; label: string; reason: string; status: "open" | "actioned" | "dismissed"; created_at: string }
export interface AdminHubRow {
  hub_id: string; slug: string; name: string; created_at: string; visibility: string; membership_mode: string;
  plan: { family: PlanFamily | null; product: string | null; state: string; ends_at?: string | null };
  member_count: number; owner_account_id: string; owner_name: string | null;
  suspension: { reason: string; suspended_at: string } | null; open_reports: number;
}
export interface AdminAccountRow {
  account_id: string; display_name: string; created_at: string; hubs_owned: number; memberships: number; is_staff: boolean;
  suspension: { reason: string; suspended_at: string } | null;
  /** 000029: open reports about this account. */
  open_reports?: number;
}
export interface AdminAuditEvent { id: number; occurred_at: string; actor_account_id: string | null; actor_name: string | null; action: string; target: string | null; hub_slug: string | null }
export interface AdminOverviewV2 extends AdminOverview {
  comment_reports_open: number;
  hubs_suspended: number;
  accounts_suspended: number;
  staff: number;
}

function createStaffApi(call: Caller) {
  return {
    adminOverviewV2: () => call<AdminOverviewV2>("lv_admin_overview"),
    adminStaffList: () => call<{ staff: StaffMember[] }>("lv_admin_staff_list"),
    adminStaffAdd: (email: string) => call<{ account_id: string; already_staff: boolean; display_name?: string }>("lv_admin_staff_add", { p_email: email }),
    adminStaffRevoke: (account: string) => call<object>("lv_admin_staff_revoke", { p_account: account }),
    adminHubSuspend: (hub: string, reason: string) => call<{ suspended: boolean }>("lv_admin_hub_suspend", { p_hub: hub, p_reason: reason }),
    adminHubUnsuspend: (hub: string) => call<{ suspended: boolean }>("lv_admin_hub_unsuspend", { p_hub: hub }),
    adminAccountSuspend: (account: string, reason: string) => call<{ suspended: boolean }>("lv_admin_account_suspend", { p_account: account, p_reason: reason }),
    adminAccountUnsuspend: (account: string) => call<{ suspended: boolean }>("lv_admin_account_unsuspend", { p_account: account }),
    adminReports: (status: "open" | "actioned" | "dismissed" | "all" = "open", type: "survey" | "comment" | "person" | "hub" | "all" = "all") =>
      call<{ items: AdminReportItem[] }>("lv_admin_reports", { p_status: status, p_type: type }),
    adminCommentHide: (comment: string, hidden = true) => call<{ hidden: boolean }>("lv_admin_comment_hide", { p_comment: comment, p_hidden: hidden }),
    adminCommentReportsDismiss: (comment: string) => call<object>("lv_admin_comment_reports_dismiss", { p_comment: comment }),
    adminUserReportDecide: (report: string, status: "actioned" | "dismissed", note = "") =>
      call<{ status: string }>("lv_admin_user_report_decide", { p_report: report, p_status: status, p_note: note || null }),
    adminHubSearch: (query: string) => call<{ hubs: AdminHubRow[] }>("lv_admin_hub_search", { p_query: query }),
    adminAccountSearch: (email: string) => call<{ accounts: AdminAccountRow[] }>("lv_admin_account_search", { p_email: email }),
    adminAccountEmailReveal: (account: string) => call<{ account_id: string; emails: string[] }>("lv_admin_account_email_reveal", { p_account: account }),
    adminAudit: (scope: "staff" | "all" = "staff", action?: string | null, actor?: string | null, limit = 100) =>
      call<{ events: AdminAuditEvent[] }>("lv_admin_audit", { p_scope: scope, p_action: action || null, p_actor: actor || null, p_limit: limit, p_before: null }),
  };
}
/* ---- end staff panel ---- */

/* ---- track D: api + discord ---- */
export type { ApiKey, ApiKeyList, ApiScope, DiscordCodePreview, DiscordConnection, DiscordLink, WebhookEndpoint, WebhookEvent, WebhookList } from "./integrationsApi";
/* ---- end track D ---- */
