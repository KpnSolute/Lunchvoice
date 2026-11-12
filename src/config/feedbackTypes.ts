// Feedback types (founder direction 2026-11-11). Product vocabulary:
//   Poll, Rating, Yes/No, Open feedback and Election are feedback types. A Survey combines several questions.
// Stored as the Campaign's `mode`. Display only: which types a plan may use comes from the entitlement map
// (lv_plan_limits / lv_hub_limits), never from this file.
import type { CampaignMode, PlanLimits } from "../lib/lvApi";

export interface FeedbackType { key: CampaignMode; label: string; body: string }

/** The single-purpose types, in the order the pickers show them. */
export const FEEDBACK_TYPES: FeedbackType[] = [
  { key: "poll", label: "Poll", body: "One choice question, fast to answer." },
  { key: "rating", label: "Rating", body: "A score from 1 to 5." },
  { key: "yes_no", label: "Yes/No", body: "One yes-or-no question." },
  { key: "feedback", label: "Open feedback", body: "An answer in their own words." },
];

/** A Survey is a combination of the types above. */
export const SURVEY_TYPE: FeedbackType = { key: "survey", label: "Survey", body: "Combine several of these: polls, ratings, yes/no and open questions." };

/** Elections are a Hub feature (Starter and Team), with a secret ballot. */
export const ELECTION_TYPE: FeedbackType = { key: "election", label: "Election", body: "Races with candidates. One vote per person in each race, secret ballot." };

const ALL: FeedbackType[] = [...FEEDBACK_TYPES, SURVEY_TYPE, ELECTION_TYPE];

export function feedbackTypeLabel(mode: string): string {
  return ALL.find((t) => t.key === mode)?.label ?? mode;
}

/** The question kind a new Campaign of this type starts with in the editor (null: the creator picks). */
export function startingKind(mode: CampaignMode): string | null {
  return mode === "poll" ? "single_choice" : mode === "rating" ? "rating" : mode === "yes_no" ? "yes_no" : mode === "feedback" ? "text" : mode === "election" ? "single_choice" : null;
}

/** The feedback types a free Quick Survey may use, as published by lv_plan_limits (free.quick.modes). */
export function freeFeedbackTypes(limits: PlanLimits | null | undefined): CampaignMode[] {
  const raw = (limits?.families?.free as Record<string, unknown> | undefined)?.["quick.modes"];
  return Array.isArray(raw) ? (raw.filter((m) => ALL.some((t) => t.key === m)) as CampaignMode[]) : ["survey"];
}

/** Whether a Hub's plan includes elections (lv_hub_limits: modes.election). */
export function hubHasElections(limits: Record<string, unknown> | null | undefined): boolean {
  return limits?.["modes.election"] === true;
}
