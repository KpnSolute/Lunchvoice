// Starter templates for Quick Surveys. Picking one on /surveys/new creates a normal draft with these questions
// already added, so a first survey takes seconds instead of a blank page. Everything stays editable until publish.
//
// Rules: a template is generic (no customer, venue or organisation is named), written for adult audiences, and
// valid under the server's limits (at most 10 questions; choice questions need 2-10 different options). The test in
// src/lib/surveyTemplates.test.ts enforces them with the same questionConfigProblem the editor and the API use.
import type { Anonymity, QuestionKind, SurveyAccess } from "../lib/lvApi";

export interface TemplateQuestion {
  kind: QuestionKind;
  prompt: string;
  /** Choice options (single_choice / multi_choice). */
  options?: string[];
  /** Free-text and similar questions people may skip. Stored as config.optional. */
  optional?: boolean;
}

export interface SurveyTemplate {
  /** URL-safe id used in /surveys/new?template=<id>. Never rename a published id: marketing links point at it. */
  id: string;
  name: string;
  /** One line shown on the picker card. */
  blurb: string;
  /** Suggested title; the creator can change it. */
  title: string;
  questions: TemplateQuestion[];
  /** Settings the picker applies with the template (the creator can still change them). Omitted = leave as they are. */
  defaults?: { access?: SurveyAccess; anonymity?: Anonymity };
}

export const SURVEY_TEMPLATES: readonly SurveyTemplate[] = [
  {
    id: "event-feedback",
    name: "Event feedback",
    blurb: "How it went, what to keep, what to change.",
    title: "How was the event?",
    questions: [
      { kind: "rating", prompt: "Overall, how was the event?" },
      { kind: "multi_choice", prompt: "What worked well?", options: ["Venue", "Schedule", "Speakers or activities", "Food and drink", "People I met", "Value for money"] },
      { kind: "yes_no", prompt: "Would you come to the next one?" },
      { kind: "text", prompt: "What is one thing we should change?", optional: true },
    ],
  },
  {
    id: "team-pulse",
    name: "Team pulse check",
    blurb: "A quick, honest read on how the week is going.",
    title: "Weekly team pulse",
    questions: [
      { kind: "rating", prompt: "How was your week?" },
      { kind: "single_choice", prompt: "How is your workload right now?", options: ["Too light", "About right", "Too heavy"] },
      { kind: "yes_no", prompt: "Do you have what you need to do your job well?" },
      { kind: "text", prompt: "What would make next week better?", optional: true },
    ],
  },
  {
    id: "group-decision",
    name: "Pick a time or option",
    blurb: "Let the group choose, then see the totals.",
    title: "When should we meet?",
    questions: [
      { kind: "single_choice", prompt: "Which time works best for you?", options: ["Weekday evening", "Saturday morning", "Saturday afternoon", "Sunday afternoon"] },
      { kind: "yes_no", prompt: "Can you make it if your first choice is not picked?" },
    ],
  },
  {
    id: "suggestion-box",
    name: "Suggestion box",
    blurb: "An open, anonymous place for ideas.",
    title: "Got an idea? Tell us.",
    questions: [
      { kind: "text", prompt: "What is your idea?" },
      { kind: "single_choice", prompt: "What is it about?", options: ["Something we do", "Something we should start", "Something we should stop", "Something else"] },
      { kind: "yes_no", prompt: "Would you help make it happen?" },
    ],
  },
  {
    id: "service-feedback",
    name: "Service feedback",
    blurb: "For a shop, canteen, class or any service people use.",
    title: "How did we do?",
    questions: [
      { kind: "rating", prompt: "Overall, how was your visit?" },
      { kind: "multi_choice", prompt: "What stood out?", options: ["Quality", "Speed", "Friendliness", "Value", "Cleanliness", "Choice"] },
      { kind: "single_choice", prompt: "How often do you use us?", options: ["First time", "Occasionally", "Weekly", "Most days"] },
      { kind: "text", prompt: "Anything else we should know?", optional: true },
    ],
  },
  {
    id: "meeting-feedback",
    name: "Meeting or workshop feedback",
    blurb: "Find out if the session was worth everyone's time.",
    title: "How useful was this session?",
    questions: [
      { kind: "rating", prompt: "How useful was this session?" },
      { kind: "single_choice", prompt: "How was the pace?", options: ["Too slow", "About right", "Too fast"] },
      { kind: "yes_no", prompt: "Did you leave with a clear next step?" },
      { kind: "text", prompt: "What should we do differently next time?", optional: true },
    ],
  },
  {
    id: "employee-survey",
    name: "Anonymous employee survey",
    blurb: "Honest feedback with no names attached.",
    title: "Employee feedback survey",
    questions: [
      { kind: "rating", prompt: "Overall, how satisfied are you working here?" },
      { kind: "single_choice", prompt: "How likely are you to still be here in a year?", options: ["Very likely", "Likely", "Unsure", "Unlikely"] },
      { kind: "multi_choice", prompt: "Which of these would improve your work most?", options: ["Clearer priorities", "Better tools", "More flexibility", "Recognition", "Training and growth", "Communication from leadership"] },
      { kind: "yes_no", prompt: "Do you feel comfortable raising concerns?" },
      { kind: "text", prompt: "What is one thing we should start, stop or change?", optional: true },
    ],
  },
  {
    id: "committee-vote",
    name: "Club or committee vote",
    blurb: "A one-person-one-vote ballot for a decision or a chair.",
    title: "Committee vote",
    // A ballot should only reach the people you invited, and each signed-in account answers once.
    defaults: { access: "invite", anonymity: "anonymous" },
    questions: [
      { kind: "single_choice", prompt: "Which candidate do you vote for?", options: ["Candidate A", "Candidate B", "Candidate C", "Abstain"] },
      { kind: "yes_no", prompt: "Do you approve the proposed budget for next year?" },
    ],
  },
  {
    id: "member-questionnaire",
    name: "Member questionnaire",
    blurb: "Learn what your members want before you plan.",
    title: "Member questionnaire",
    questions: [
      { kind: "multi_choice", prompt: "Which activities interest you?", options: ["Social events", "Workshops", "Volunteering", "Sports or outdoors", "Fundraising", "Online meetups"] },
      { kind: "single_choice", prompt: "How often can you take part?", options: ["Weekly", "Monthly", "A few times a year", "Rarely"] },
      { kind: "single_choice", prompt: "What time suits you best?", options: ["Weekday mornings", "Weekday evenings", "Weekends", "No preference"] },
      { kind: "yes_no", prompt: "Would you like to help organise something?" },
      { kind: "text", prompt: "Anything else we should know?", optional: true },
    ],
  },
  {
    id: "menu-feedback",
    name: "Menu and dining feedback",
    blurb: "For canteens, cafés and catered events.",
    title: "How was the food?",
    questions: [
      { kind: "rating", prompt: "How was your meal today?" },
      { kind: "multi_choice", prompt: "What should we serve more of?", options: ["Hot meals", "Vegetarian or vegan", "Healthier options", "Snacks", "Breakfast", "Drinks"] },
      { kind: "single_choice", prompt: "How was the portion size?", options: ["Too small", "About right", "Too big"] },
      { kind: "yes_no", prompt: "Would you recommend it to a friend?" },
      { kind: "text", prompt: "Any dish we should bring back or drop?", optional: true },
    ],
  },
];

export const templateById = (id: string | null | undefined): SurveyTemplate | null =>
  SURVEY_TEMPLATES.find((t) => t.id === id) ?? null;

/** The question config the API stores for one template question. */
export function templateConfig(q: TemplateQuestion): { options?: string[]; optional?: true } {
  return { ...(q.options ? { options: q.options } : {}), ...(q.optional ? { optional: true as const } : {}) };
}
