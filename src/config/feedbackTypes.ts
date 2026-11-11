// Feedback types (founder direction 2026-11-11): what a Campaign or Quick Survey asks. Stored as the Campaign's `mode`.
// Display only. Which types a plan may use comes from the entitlement map (lv_plan_limits), never from this file.
import type { CampaignMode, PlanLimits } from "../lib/lvApi";

export const FEEDBACK_TYPES: { key: CampaignMode; label: string; body: string }[] = [
  { key: "survey", label: "Survey", body: "Several questions, one screen at a time." },
  { key: "poll", label: "Poll", body: "One choice question, fast to answer." },
  { key: "rating", label: "Rating", body: "A score from 1 to 5." },
  { key: "feedback", label: "Open feedback", body: "An answer in their own words." },
];

/** Shown as "coming soon" until the election model ships; it is never a relabelled poll. */
export const ELECTION_PREVIEW = { label: "Election", body: "One vote per person in each race, with a secret ballot." };

export function feedbackTypeLabel(mode: string): string {
  return FEEDBACK_TYPES.find((t) => t.key === mode)?.label ?? mode;
}

/** The feedback types a free Quick Survey may use, as published by lv_plan_limits (free.quick.modes). */
export function freeFeedbackTypes(limits: PlanLimits | null | undefined): CampaignMode[] {
  const raw = (limits?.families?.free as Record<string, unknown> | undefined)?.["quick.modes"];
  return Array.isArray(raw) ? (raw.filter((m) => FEEDBACK_TYPES.some((t) => t.key === m)) as CampaignMode[]) : ["survey"];
}
