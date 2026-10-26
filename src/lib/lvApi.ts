// Typed client for the v2 `lv_api` functions. Shapes follow the backend thread's
// answers (2026-10-26); read operations marked PLANNED do not exist yet.

export type LvErrorCode =
  | "lv_unauthenticated"
  | "lv_forbidden"
  | "lv_not_found"
  | "lv_invalid_input"
  | "lv_closed"
  | "lv_conflict"
  | "lv_invalid_code"
  | "lv_unverified_email"
  | "lv_lifecycle_invalid"
  | "lv_policy_undecided"
  | "lv_gate_blocked"
  | "lv_locked"
  | "lv_owner_protected"
  | "lv_server_error";

export interface LvError {
  code: LvErrorCode;
  message: string;
  missing?: string[];
}

export type LvResult<T> = ({ ok: true } & T) | { ok: false; error: LvError };

export interface HubSummary {
  hub_id: string;
  slug: string;
  name: string;
  is_owner: boolean;
}

export interface MyContext {
  account_id: string;
  display_name: string | null;
  email_verified: boolean;
  hubs: HubSummary[];
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

export type QuestionKind = string;

export interface LvTransport {
  rpc(fn: string, args?: Record<string, unknown>): Promise<unknown>;
}

// Backend plans to normalize raised Postgres exceptions into {ok:false}; until
// then a thrown transport error is mapped here so screens see one shape.
function normalize<T>(raw: unknown): LvResult<T> {
  if (raw && typeof raw === "object" && "ok" in raw) return raw as LvResult<T>;
  return { ok: false, error: { code: "lv_server_error", message: "Unexpected response" } };
}

export function createLvApi(transport: LvTransport) {
  const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<LvResult<T>> => {
    try {
      return normalize<T>(await transport.rpc(fn, args));
    } catch (e) {
      return { ok: false, error: { code: "lv_server_error", message: e instanceof Error ? e.message : String(e) } };
    }
  };
  return {
    myContext: () => call<MyContext>("lv_my_context"),
    hubCreate: (slug: string, name: string) => call<{ hub_id: string }>("lv_hub_create", { p_slug: slug, p_name: name }),
    betaApply: (note?: string) => call<{ application_id: string }>("lv_beta_apply", { p_note: note ?? null }),
    inviteCreate: (hub: string, maxUses?: number, expiresAt?: string) =>
      call<{ invite_id: string; code: string }>("lv_invite_create", {
        p_hub: hub,
        p_max_uses: maxUses ?? null,
        p_expires_at: expiresAt ?? null,
      }),
    inviteRedeem: (code: string) => call<{ hub_id: string }>("lv_invite_redeem", { p_code: code }),
    inviteRevoke: (invite: string) => call<object>("lv_invite_revoke", { p_invite: invite }),
    campaignCreate: (hub: string, title: string, mode: string, anonymity: "anonymous" | "identified" = "anonymous") =>
      call<{ campaign_id: string }>("lv_campaign_create", {
        p_hub: hub,
        p_title: title,
        p_mode: mode,
        p_anonymity: anonymity,
      }),
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
    submit: (campaign: string, answers: unknown) =>
      call<SubmitReceipt>("lv_submit_response", { p_campaign: campaign, p_answers: answers }),
    analytics: (campaign: string, metric: "participant_count" | "answer_distribution", question?: string) =>
      call<AnalyticsResult>("lv_analytics_query", { p_campaign: campaign, p_metric: metric, p_question: question ?? null }),
  };
}

export type LvApi = ReturnType<typeof createLvApi>;
