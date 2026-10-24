import { any, arr, bool, enm, int, nullable, num, obj, ref, str } from "../lib.mjs";

/** Campaign lifecycle, participation, receipts and privacy-safe analytics. */
export const campaignSchemas = {
  CampaignMode: enm(["survey", "poll", "rating", "feedback", "election", "seasonal"], {
    description: "Only survey is in scope for M1. Other modes are M2 and their contracts are decision D-08.",
  }),
  CampaignState: enm(["draft", "scheduled", "active", "closed", "expired"]),
  GuestAccess: enm(["off", "link"], { description: "link requires decision D-03 (guest proof). Until decided the server rejects it with lv_policy_undecided." }),
  Campaign: obj({
    id: ref("Uuid"),
    hub_id: ref("Uuid"),
    mode: ref("CampaignMode"),
    state: ref("CampaignState"),
    title: str({ minLength: 1, maxLength: 120 }),
    anonymous: bool(),
    guest_access: ref("GuestAccess"),
    opens_at: nullable(ref("Timestamp")),
    closes_at: nullable(ref("Timestamp")),
    activated_at: nullable(ref("Timestamp")),
    expires_at: nullable(ref("Timestamp")),
    legacy_session_id: nullable(ref("Uuid")),
    join_code: nullable(str()),
  }),
  CampaignList: obj({ hub_id: ref("Uuid"), campaigns: arr(ref("Campaign")) }),
  CampaignListRequest: obj({ hub_id: ref("Uuid"), state: ref("CampaignState") }, ["state"]),
  CampaignRef: obj({ campaign_id: ref("Uuid") }),
  CampaignCreateRequest: obj(
    {
      hub_id: ref("Uuid"),
      mode: ref("CampaignMode"),
      title: str({ minLength: 1, maxLength: 120 }),
      anonymous: bool(),
      guest_access: ref("GuestAccess"),
      opens_at: nullable(ref("Timestamp")),
      closes_at: nullable(ref("Timestamp")),
    },
    ["anonymous", "guest_access", "opens_at", "closes_at"],
  ),
  CampaignScheduleRequest: obj({ campaign_id: ref("Uuid"), opens_at: ref("Timestamp"), closes_at: nullable(ref("Timestamp")) }, ["closes_at"]),
  ActivateRequest: obj({ campaign_id: ref("Uuid"), idempotency_key: ref("Uuid") }),
  ActivationResult: obj({
    campaign_id: ref("Uuid"),
    state: ref("CampaignState"),
    activated_at: ref("Timestamp"),
    expires_at: nullable(ref("Timestamp")),
    replay: bool(),
  }),

  QuestionType: enm(["rating", "text", "single_choice", "multi_choice", "yes_no", "flame", "slider", "nps", "ranking"], {
    description:
      "rating, text, single_choice, multi_choice, yes_no, flame and slider exist in production today (survey_questions_type_check). nps and ranking are v2 additions (M2 unless the Winter Survey questionnaire needs them; D-12).",
  }),
  Question: obj({
    id: ref("Uuid"),
    position: int({ minimum: 1 }),
    type: ref("QuestionType"),
    prompt: str({ minLength: 1 }),
    help_text: nullable(str()),
    required: bool(),
    options: arr(str()),
    scale_min: int(),
    scale_max: int(),
  }),
  QuestionSet: obj({ campaign_id: ref("Uuid"), revision: int({ minimum: 1 }), questions: arr(ref("Question")) }),
  QuestionInput: obj(
    { type: ref("QuestionType"), prompt: str({ minLength: 1 }), help_text: nullable(str()), required: bool(), options: arr(str()), scale_min: int(), scale_max: int() },
    ["help_text", "required", "options", "scale_min", "scale_max"],
  ),
  CampaignUpdateRequest: obj(
    { campaign_id: ref("Uuid"), title: str({ minLength: 1, maxLength: 120 }), anonymous: bool(), questions: arr(ref("QuestionInput")) },
    ["title", "anonymous", "questions"],
  ),

  CampaignResolveRequest: obj({ code: str({ minLength: 1, maxLength: 64 }) }),
  CampaignResolveResult: obj({
    campaign_id: ref("Uuid"),
    hub_id: ref("Uuid"),
    hub_slug: ref("Slug"),
    title: str(),
    state: ref("CampaignState"),
    anonymous: bool(),
    requires_account: bool(),
  }),
  Answer: obj({ question_id: ref("Uuid"), value: any("Any JSON value valid for the question type.") }),
  SubmitResponseRequest: obj({ campaign_id: ref("Uuid"), answers: arr(ref("Answer")), idempotency_key: ref("Uuid") }),
  Receipt: obj({
    id: ref("Uuid"),
    campaign_id: ref("Uuid"),
    duplicate: bool(),
    points: nullable(int({ minimum: 0 })),
    submitted_at: ref("Timestamp"),
  }),
  ReceiptList: obj({ receipts: arr(ref("Receipt")) }),

  AnalyticsMetric: enm(["participation", "completion", "answer_distribution"]),
  AnalyticsQuery: obj({ campaign_id: ref("Uuid"), metric: ref("AnalyticsMetric"), question_id: ref("Uuid") }, ["question_id"]),
  AnalyticsGroup: obj({
    key: str(),
    n: nullable(int({ minimum: 0 })),
    suppressed: bool(),
    value: nullable(num()),
  }),
  AnalyticsResult: obj({
    campaign_id: ref("Uuid"),
    metric: ref("AnalyticsMetric"),
    total_participants: nullable(int({ minimum: 0 })),
    groups: arr(ref("AnalyticsGroup")),
    freshness_at: ref("Timestamp"),
    policy: obj({
      status: enm(["applied", "undecided"]),
      min_cohort: nullable(int({ minimum: 1, description: "null until decision D-10 sets the threshold. No default is invented." })),
    }),
  }),
};
