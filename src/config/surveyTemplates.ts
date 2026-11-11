// Starter templates for Quick Surveys. Picking one on /surveys/new creates a normal draft with these questions
// already added, so a first survey takes seconds instead of a blank page. Everything stays editable until publish.
//
// Rules: a template is generic (no customer, venue or organisation is named), written for adult audiences, and
// valid under the server's limits (at most 10 questions; choice questions need 2-10 different options). The test in
// src/lib/surveyTemplates.test.ts enforces them with the same questionConfigProblem the editor and the API use.
import type { Anonymity, QuestionKind, SurveyAccess } from "../lib/lvApi";

export const TEMPLATE_CATEGORIES = ["Customers", "Teams and work", "Events", "Community", "Decisions"] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export interface TemplateQuestion {
  kind: QuestionKind;
  prompt: string;
  /** Choice options (single_choice / multi_choice). */
  options?: string[];
  /** Most choices a person may pick on a multi_choice question (config.max). */
  max?: number;
  /** Free-text and similar questions people may skip. Stored as config.optional. */
  optional?: boolean;
}

export interface SurveyTemplate {
  /** URL-safe id used in /surveys/new?template=<id>. Never rename a published id: marketing links point at it. */
  id: string;
  category: TemplateCategory;
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
    category: "Events",
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
    category: "Teams and work",
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
    category: "Decisions",
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
    category: "Community",
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
    category: "Customers",
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
    category: "Teams and work",
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
    category: "Teams and work",
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
    category: "Decisions",
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
    category: "Community",
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
    category: "Customers",
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
  {
    id: "recommendation-check",
    category: "Customers",
    name: "Would you recommend us?",
    blurb: "A quick loyalty check with the reason behind the score.",
    title: "Would you recommend us?",
    questions: [
      { kind: "rating", prompt: "How likely are you to recommend us to a friend?" },
      { kind: "single_choice", prompt: "What is the main reason for your score?", options: ["Quality", "Price", "Service", "Convenience", "Something else"] },
      { kind: "text", prompt: "What is one thing we could do better?", optional: true },
    ],
  },
  {
    id: "support-satisfaction",
    category: "Customers",
    name: "Support satisfaction",
    blurb: "Was the problem solved, and how fast?",
    title: "How was the help you received?",
    questions: [
      { kind: "rating", prompt: "How satisfied are you with the help you received?" },
      { kind: "yes_no", prompt: "Was your issue resolved?" },
      { kind: "single_choice", prompt: "How long did it take?", options: ["Under an hour", "Same day", "A few days", "Longer"] },
      { kind: "text", prompt: "Anything we could have done better?", optional: true },
    ],
  },
  {
    id: "product-feedback",
    category: "Customers",
    name: "Product or app feedback",
    blurb: "What works, what is missing.",
    title: "Tell us about the product",
    questions: [
      { kind: "rating", prompt: "How satisfied are you with the product overall?" },
      { kind: "multi_choice", prompt: "What do you like most?", options: ["Setup", "Everyday use", "Speed", "Design", "Price", "Support"] },
      { kind: "yes_no", prompt: "Does it do what you expected?" },
      { kind: "text", prompt: "What is missing?", optional: true },
    ],
  },
  {
    id: "training-evaluation",
    category: "Teams and work",
    name: "Training evaluation",
    blurb: "Was the course worth it, and will people use it?",
    title: "How was the training?",
    questions: [
      { kind: "rating", prompt: "How useful was the training?" },
      { kind: "single_choice", prompt: "How was the length?", options: ["Too short", "About right", "Too long"] },
      { kind: "yes_no", prompt: "Will you use what you learned?" },
      { kind: "multi_choice", prompt: "What would improve it?", options: ["More examples", "More practice time", "Better materials", "The trainer", "The pace", "The venue or tools"] },
      { kind: "text", prompt: "Any other comments?", optional: true },
    ],
  },
  {
    id: "onboarding-checkin",
    category: "Teams and work",
    name: "New starter check-in",
    blurb: "Find out how a new person is settling in.",
    title: "How are you settling in?",
    questions: [
      { kind: "rating", prompt: "How welcome do you feel?" },
      { kind: "yes_no", prompt: "Do you know who to ask for help?" },
      { kind: "multi_choice", prompt: "What would help you settle in?", options: ["A buddy", "Clearer tasks", "Training", "More introductions", "Tools and access"] },
      { kind: "text", prompt: "Anything we should know?", optional: true },
    ],
  },
  {
    id: "event-rsvp",
    category: "Events",
    name: "Event RSVP",
    blurb: "Who is coming, with how many, and what they need.",
    title: "Will you join us?",
    // An RSVP is only useful if you can see who replied.
    defaults: { anonymity: "identified" },
    questions: [
      { kind: "single_choice", prompt: "Will you attend?", options: ["Yes", "Maybe", "No"] },
      { kind: "single_choice", prompt: "How many people are coming with you?", options: ["Just me", "1 more", "2 more", "3 or more"] },
      { kind: "multi_choice", prompt: "Any dietary needs?", options: ["Vegetarian", "Vegan", "Gluten-free", "Nut allergy", "None"] },
      { kind: "text", prompt: "Anything we should know?", optional: true },
    ],
  },
  {
    id: "speaker-feedback",
    category: "Events",
    name: "Speaker or session feedback",
    blurb: "Was the content right, and would people come back?",
    title: "How was the session?",
    questions: [
      { kind: "rating", prompt: "How was the session?" },
      { kind: "single_choice", prompt: "Was the content right for you?", options: ["Too basic", "About right", "Too advanced"] },
      { kind: "yes_no", prompt: "Would you attend another session by this speaker?" },
      { kind: "text", prompt: "What would you add or change?", optional: true },
    ],
  },
  {
    id: "volunteer-interest",
    category: "Community",
    name: "Volunteer interest",
    blurb: "Who can help, with what, and how much time.",
    title: "Could you help out?",
    // To follow up with volunteers you need to know who they are.
    defaults: { anonymity: "identified" },
    questions: [
      { kind: "multi_choice", prompt: "Where could you help?", options: ["Setting up", "Welcoming people", "Social media", "Fundraising", "Driving or logistics", "Clearing up"] },
      { kind: "single_choice", prompt: "How much time could you give?", options: ["An hour or two", "A few hours a month", "A few hours a week", "Not sure yet"] },
      { kind: "text", prompt: "Anything else you would like us to know?", optional: true },
    ],
  },
  {
    id: "neighbourhood-priorities",
    category: "Community",
    name: "Neighbourhood priorities",
    blurb: "What residents want looked at first.",
    title: "What should we focus on?",
    questions: [
      { kind: "rating", prompt: "How would you rate the neighbourhood today?" },
      { kind: "multi_choice", prompt: "What should we focus on first? Pick up to 3.", options: ["Safety", "Cleanliness", "Traffic and parking", "Green space", "Events", "Noise"], max: 3 },
      { kind: "yes_no", prompt: "Would you come to a community meeting about it?" },
      { kind: "text", prompt: "What is one thing you would change?", optional: true },
    ],
  },
  {
    id: "feature-vote",
    category: "Decisions",
    name: "Priority vote",
    blurb: "Let people pick what to do first.",
    title: "What should we do first?",
    questions: [
      { kind: "multi_choice", prompt: "Which would you use most? Pick up to 3.", options: ["Option A", "Option B", "Option C", "Option D", "Option E"], max: 3 },
      { kind: "text", prompt: "Anything we missed?", optional: true },
    ],
  },
];

export const templateById = (id: string | null | undefined): SurveyTemplate | null =>
  SURVEY_TEMPLATES.find((t) => t.id === id) ?? null;

/** The question config the API stores for one template question. */
export function templateConfig(q: TemplateQuestion): { options?: string[]; max?: number; optional?: true } {
  return {
    ...(q.options ? { options: q.options } : {}),
    ...(q.max ? { max: q.max } : {}),
    ...(q.optional ? { optional: true as const } : {}),
  };
}
