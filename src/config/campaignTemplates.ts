// Hub Campaign templates, grouped by what each plan is for. Picking one on /:hub/campaigns/new creates a draft with
// its questions already added; nothing is published until a manager says so.
//
//   Starter Hub  ongoing community life. 15 active Campaigns but only 2 active surveys, so these lean on polls,
//                ratings and feedback boxes, which are not surveys, and use a survey slot only when they say so.
//   Team Hub     audiences and depth. Role targeting (ask only some roles) is a Team feature; it needs identified
//                answers, so the targeted templates are identified. Team also allows 5 active surveys.
//   Time-bounded a fixed window with an end date already set, for Campaign Starter or Campaign Plus (Plus carries Team
//                features for the window) or any Hub plan.
//
// Display only: the backend evaluates the active entitlement and refuses anything the plan does not include. The picker
// uses `plan` to show what a template needs, never to decide what is allowed. Generic by rule: no customer is named,
// and the audience is adults. src/lib/campaignTemplates.test.ts enforces the shape.
import type { Anonymity, CampaignMode } from "../lib/lvApi";
import type { TemplateQuestion } from "./surveyTemplates";

export type CampaignTemplatePlan = "starter" | "team";
export type CampaignTemplateGroup = "starter" | "team" | "window";

export interface CampaignTemplate {
  id: string;
  /** The feature family the template needs. "team" templates use role targeting or Team limits. */
  plan: CampaignTemplatePlan;
  name: string;
  blurb: string;
  /** Why this plan: what the template shows off. One or two sentences. */
  focus: string;
  title: string;
  mode: CampaignMode;
  anonymity: Anonymity;
  /** Stored as the Campaign description (shown to people before they start). */
  description: string;
  questions: TemplateQuestion[];
  /** What this exercises, as short chips on the card. */
  uses: string[];
  /** Time-bounded: the end date is set this many days from now on the draft. The creator can change it. */
  windowDays?: number;
  /** Open the Audience step after creating, so the manager picks the roles (roles belong to each Hub). Team only. */
  targetsRoles?: boolean;
}

export const GROUP_LABEL: Record<CampaignTemplateGroup, string> = {
  starter: "Starter Hub",
  team: "Team Hub",
  window: "Time-bounded",
};

export const GROUP_BLURB: Record<CampaignTemplateGroup, string> = {
  starter: "Keep a community answering. Polls, ratings and feedback boxes are quick and do not use one of your 2 active surveys.",
  team: "Ask the right people and go deeper. Choose which roles can answer, run up to 5 surveys at once, and read advanced analytics.",
  window: "A fixed window that closes by itself. The end date is already set, and Campaign Plus adds Team features for the window.",
};

export const groupOf = (t: CampaignTemplate): CampaignTemplateGroup => (t.windowDays ? "window" : t.plan);

/** A Survey-mode Campaign counts toward the plan's active-survey limit; polls, ratings and feedback do not. */
export const usesSurveySlot = (t: CampaignTemplate) => t.mode === "survey";

export const CAMPAIGN_TEMPLATES: readonly CampaignTemplate[] = [
  /* ---------------------------------------------------------------- Starter Hub */
  {
    id: "weekly-poll",
    plan: "starter",
    name: "Weekly poll",
    blurb: "One question, answered in seconds.",
    focus: "Short polls get answered, so members form the habit. A poll does not count toward your 2 active surveys.",
    title: "What should we do next?",
    mode: "poll",
    anonymity: "anonymous",
    description: "A quick poll for members. Pick one.",
    questions: [{ kind: "single_choice", prompt: "What should we do next?", options: ["Social night", "Workshop", "Outdoor activity", "Something else"] }],
    uses: ["Poll", "Members only"],
  },
  {
    id: "yes-no-decision",
    plan: "starter",
    name: "Yes or no decision",
    blurb: "Put a proposal to the members.",
    focus: "The fastest way to settle something. One tap, and a clear total.",
    title: "Should we go ahead?",
    mode: "poll",
    anonymity: "anonymous",
    description: "Members: please vote yes or no on the proposal.",
    questions: [{ kind: "yes_no", prompt: "Should we go ahead with the proposal?" }],
    uses: ["Poll", "Members only"],
  },
  {
    id: "idea-shortlist",
    plan: "starter",
    name: "Idea shortlist",
    blurb: "Members pick their favourites from a list.",
    focus: "Turn a long list of ideas into a short one, with each member picking up to three.",
    title: "Which ideas should we pursue?",
    mode: "poll",
    anonymity: "anonymous",
    description: "Pick up to three ideas you would like us to pursue. Replace the placeholders with your own ideas.",
    questions: [{ kind: "multi_choice", prompt: "Which ideas should we pursue? Pick up to 3.", options: ["Idea A", "Idea B", "Idea C", "Idea D", "Idea E"], max: 3 }],
    uses: ["Poll", "Pick up to 3"],
  },
  {
    id: "rate-last-event",
    plan: "starter",
    name: "Rate the last event",
    blurb: "One score from 1 to 5.",
    focus: "A single rating is the easiest thing to answer and the easiest to compare over time.",
    title: "How was the last event?",
    mode: "rating",
    anonymity: "anonymous",
    description: "Tell us how the last event was.",
    questions: [{ kind: "rating", prompt: "How was it?" }],
    uses: ["Rating", "Members only"],
  },
  {
    id: "feedback-box",
    plan: "starter",
    name: "Feedback box",
    blurb: "An open question for anything on members' minds.",
    focus: "An always-open place to say anything. Export the released results to share with your committee.",
    title: "What should we know?",
    mode: "feedback",
    anonymity: "anonymous",
    description: "Anything on your mind, big or small. Answers are anonymous.",
    questions: [{ kind: "text", prompt: "What should we know?" }],
    uses: ["Feedback", "Export released results"],
  },
  {
    id: "monthly-member-survey",
    plan: "starter",
    name: "Monthly member survey",
    blurb: "Five questions to take the temperature of the group.",
    focus: "Your one regular survey. It uses one of your 2 active surveys, so close it when the month is done.",
    title: "Monthly member survey",
    mode: "survey",
    anonymity: "anonymous",
    description: "Five quick questions about how things are going. Takes about a minute.",
    questions: [
      { kind: "rating", prompt: "Overall, how happy are you with the group?" },
      { kind: "multi_choice", prompt: "What do you value most?", options: ["The people", "The events", "The communication", "The location", "The cost"] },
      { kind: "single_choice", prompt: "How often do you take part?", options: ["Every time", "Most of the time", "Sometimes", "Rarely"] },
      { kind: "yes_no", prompt: "Would you recommend us to a friend?" },
      { kind: "text", prompt: "What is one thing we should improve?", optional: true },
    ],
    uses: ["Survey: uses 1 of 2", "Export released results"],
  },

  /* ---------------------------------------------------------------- Team Hub */
  {
    id: "role-pulse",
    plan: "team",
    name: "Role pulse",
    blurb: "Ask one group how things are going.",
    focus: "Role targeting: only the roles you choose can answer. Targeted Campaigns are identified, so managers see who answered.",
    title: "Role pulse check",
    mode: "survey",
    anonymity: "identified",
    description: "A short check-in for one group. Answers are identified.",
    questions: [
      { kind: "rating", prompt: "How is your week going?" },
      { kind: "single_choice", prompt: "How is your workload right now?", options: ["Too light", "About right", "Too heavy"] },
      { kind: "yes_no", prompt: "Do you have what you need to do your part well?" },
      { kind: "text", prompt: "What would make next week better?", optional: true },
    ],
    uses: ["Role targeting", "Identified answers"],
    targetsRoles: true,
  },
  {
    id: "volunteer-shift-feedback",
    plan: "team",
    name: "Volunteer shift feedback",
    blurb: "Ask only the people who helped.",
    focus: "Send it to your volunteer role, so the people who were not there are never asked. Identified, so you can follow up.",
    title: "How was your shift?",
    mode: "survey",
    anonymity: "identified",
    description: "Thank you for helping. Tell us how the shift went.",
    questions: [
      { kind: "rating", prompt: "How was your shift?" },
      { kind: "yes_no", prompt: "Were your instructions clear?" },
      { kind: "multi_choice", prompt: "What would help next time?", options: ["Clearer instructions", "More people", "Better equipment", "A shorter shift", "A briefing beforehand"] },
      { kind: "text", prompt: "Anything we should change?", optional: true },
    ],
    uses: ["Role targeting", "Identified answers"],
    targetsRoles: true,
  },
  {
    id: "new-member-checkin",
    plan: "team",
    name: "New member check-in",
    blurb: "Check in with people in their first weeks.",
    focus: "Give new members a role, target it, and learn how welcome they feel before they drift away.",
    title: "How are you settling in?",
    mode: "survey",
    anonymity: "identified",
    description: "A short check-in for people who joined recently.",
    questions: [
      { kind: "rating", prompt: "How welcome do you feel?" },
      { kind: "yes_no", prompt: "Do you know who to ask for help?" },
      { kind: "multi_choice", prompt: "What would help you settle in?", options: ["A buddy", "Clearer information", "More introductions", "More events", "Easier sign-up"] },
      { kind: "text", prompt: "Anything we should know?", optional: true },
    ],
    uses: ["Role targeting", "Identified answers"],
    targetsRoles: true,
  },
  {
    id: "leads-input",
    plan: "team",
    name: "Ask the leads",
    blurb: "Gather priorities from your committee or team leads.",
    focus: "Target the role that holds your leads and collect their priorities before you plan the quarter.",
    title: "Priorities for next quarter",
    mode: "survey",
    anonymity: "identified",
    description: "For team leads: your priorities and capacity for the next quarter.",
    questions: [
      { kind: "multi_choice", prompt: "What are your top priorities? Pick up to 3.", options: ["Growing membership", "Better events", "Communication", "Fundraising", "Training", "Facilities"], max: 3 },
      { kind: "single_choice", prompt: "How much capacity does your team have?", options: ["Spare capacity", "About right", "Stretched", "Over capacity"] },
      { kind: "text", prompt: "What do you need from the committee?", optional: true },
    ],
    uses: ["Role targeting", "Identified answers"],
    targetsRoles: true,
  },
  {
    id: "quarterly-community-survey",
    plan: "team",
    name: "Quarterly community survey",
    blurb: "A fuller survey for the whole community.",
    focus: "Team allows 5 active surveys, so you can run a long one alongside your regular check-ins. Anonymous, to all members.",
    title: "Quarterly community survey",
    mode: "survey",
    anonymity: "anonymous",
    description: "Our quarterly survey. It takes about three minutes and answers are anonymous.",
    questions: [
      { kind: "rating", prompt: "Overall, how happy are you with the community?" },
      { kind: "rating", prompt: "How good is communication?" },
      { kind: "rating", prompt: "How good are the events?" },
      { kind: "multi_choice", prompt: "What do you value most?", options: ["The people", "The events", "The communication", "The location", "The cost", "The leadership"] },
      { kind: "single_choice", prompt: "How long have you been a member?", options: ["Under 6 months", "6 to 12 months", "1 to 3 years", "More than 3 years"] },
      { kind: "multi_choice", prompt: "What should we add? Pick up to 3.", options: ["More events", "Online meetups", "Training", "Social groups", "A newsletter", "A shop"], max: 3 },
      { kind: "yes_no", prompt: "Would you recommend us to a friend?" },
      { kind: "text", prompt: "What is one thing you would change?", optional: true },
    ],
    uses: ["Survey: Team allows 5", "All members"],
  },

  /* ---------------------------------------------------------------- time-bounded */
  {
    id: "event-week-feedback",
    plan: "starter",
    name: "Event week feedback",
    blurb: "Collect feedback for the week around an event.",
    focus: "Runs for 7 days and closes on its own, which is what Campaign Starter is for.",
    title: "Event week feedback",
    mode: "survey",
    anonymity: "anonymous",
    description: "Tell us how the event went. This closes in a week.",
    questions: [
      { kind: "rating", prompt: "Overall, how was the event?" },
      { kind: "multi_choice", prompt: "What worked well?", options: ["The venue", "The schedule", "The activities", "The people", "The food and drink"] },
      { kind: "yes_no", prompt: "Would you come again?" },
      { kind: "text", prompt: "What is one thing we should change?", optional: true },
    ],
    uses: ["Closes after 7 days", "Survey: uses 1 slot"],
    windowDays: 7,
  },
  {
    id: "launch-poll",
    plan: "starter",
    name: "Launch week poll",
    blurb: "Let people choose, then close the vote.",
    focus: "A one-week poll with a hard end date, so the result is settled by the deadline.",
    title: "Help us choose",
    mode: "poll",
    anonymity: "anonymous",
    description: "Vote for the option you like best. Voting closes in a week.",
    questions: [{ kind: "single_choice", prompt: "Which should we do first?", options: ["Option A", "Option B", "Option C"] }],
    uses: ["Closes after 7 days", "Poll"],
    windowDays: 7,
  },
  {
    id: "season-review",
    plan: "starter",
    name: "Season review",
    blurb: "Look back on a season, term or project.",
    focus: "Two weeks to answer, then the window closes and you keep the totals.",
    title: "Season review",
    mode: "survey",
    anonymity: "anonymous",
    description: "Look back on the season with us. This closes in two weeks.",
    questions: [
      { kind: "rating", prompt: "Overall, how was the season?" },
      { kind: "multi_choice", prompt: "What were the highlights?", options: ["The people", "The events", "The results", "The organisation", "The atmosphere"] },
      { kind: "single_choice", prompt: "Will you take part next season?", options: ["Definitely", "Probably", "Not sure", "Probably not"] },
      { kind: "rating", prompt: "How good was the organisation?" },
      { kind: "text", prompt: "What should we do differently next season?", optional: true },
    ],
    uses: ["Closes after 14 days", "Survey: uses 1 slot"],
    windowDays: 14,
  },
  {
    id: "call-for-ideas",
    plan: "starter",
    name: "Call for ideas",
    blurb: "Two weeks to collect suggestions.",
    focus: "An open call with a deadline, so ideas arrive now instead of someday.",
    title: "Call for ideas",
    mode: "feedback",
    anonymity: "anonymous",
    description: "Share your idea. The call closes in two weeks.",
    questions: [{ kind: "text", prompt: "What is your idea?" }],
    uses: ["Closes after 14 days", "Feedback"],
    windowDays: 14,
  },
  {
    id: "plus-role-checkin",
    plan: "team",
    name: "Two-week role check-in",
    blurb: "Ask one group for two weeks, with Team features.",
    focus: "Campaign Plus carries Team features for the window, including role targeting. Identified, and closes after 14 days.",
    title: "Two-week check-in",
    mode: "survey",
    anonymity: "identified",
    description: "A short check-in for one group. It closes in two weeks.",
    questions: [
      { kind: "rating", prompt: "How are things going?" },
      { kind: "single_choice", prompt: "How is the pace?", options: ["Too slow", "About right", "Too fast"] },
      { kind: "yes_no", prompt: "Do you have what you need?" },
      { kind: "text", prompt: "What is getting in the way?", optional: true },
    ],
    uses: ["Role targeting", "Closes after 14 days"],
    windowDays: 14,
    targetsRoles: true,
  },
];

export const campaignTemplateById = (id: string | null | undefined): CampaignTemplate | null =>
  CAMPAIGN_TEMPLATES.find((t) => t.id === id) ?? null;

export interface PlanView { family: string | null | undefined; state: string | null | undefined }

/**
 * Whether a template is offered as usable on this Hub. Display only. A "team" template needs the Team family, which
 * a Team Hub or an active Campaign Plus window provides; "starter" templates are open to every Hub. The backend still
 * decides, and refuses with lv_entitlement_required, so a stale or wrong answer here can never grant anything.
 */
export function templateOffered(t: CampaignTemplate, plan: PlanView | null | undefined): boolean {
  if (t.plan === "starter") return true;
  return plan?.family === "team" && plan.state === "active";
}
