// A 21-question role survey (Linked Questions acceptance case, 000042). 21 questions; staff and leadership
// take different paths. Used by the unit tests; e2e/linkedquestions.test.mjs and supabase/tests/42_linked_questions.sql
// build the same survey.
import type { Question, QuestionKind, QuestionConfig } from "../lvApi";

export const ROLES = ["Food service staff", "Lead", "Manager", "Center leadership", "Department head", "Corporate"];
export const STAFF = ROLES.slice(0, 3);
export const LEADERS = ROLES.slice(3);

const q = (n: number, kind: QuestionKind, prompt: string, config: QuestionConfig = {}): Question =>
  ({ question_id: `q${n}`, position: n, kind, prompt, config });
const anyOf = (id: string, values: string[]) => ({ match: "all" as const, conditions: [{ question_id: id, op: "any_of" as const, values }] });

export function centerSurvey(): Question[] {
  return [
    q(1, "single_choice", "What is your role?", { options: ROLES }),
    q(2, "multi_choice", "Which parts did you try?", { show_if: anyOf("q1", STAFF), options: ["Guides", "Guest food request", "Menu planner", "Reports"] }),
    q(3, "rating", "How clear were the guides?", { show_if: anyOf("q2", ["Guides"]) }),
    q(4, "rating", "How easy was the guest food request?", { show_if: anyOf("q2", ["Guest food request"]) }),
    q(5, "rating", "How easy was your first week?", { show_if: anyOf("q1", STAFF) }),
    q(6, "yes_no", "Did you hit a problem?", { show_if: anyOf("q1", STAFF) }),
    q(7, "text", "What went wrong?", { show_if: anyOf("q6", ["true"]) }),
    q(8, "rating", "How useful is the menu planner?", { show_if: anyOf("q1", STAFF) }),
    q(9, "single_choice", "How often do you use it?", { show_if: anyOf("q1", STAFF), options: ["Daily", "Weekly", "Rarely", "Other"] }),
    q(10, "rating", "How clear are the reports?", { show_if: anyOf("q1", STAFF) }),
    q(11, "text", "What would make your shift easier?", { optional: true, show_if: anyOf("q1", STAFF) }),
    q(12, "rating", "How well does it fit your center?", { show_if: anyOf("q1", LEADERS) }),
    q(13, "single_choice", "Which area needs most help?", { options: ["Menus", "Staffing", "Waste"], show_if: anyOf("q1", LEADERS) }),
    q(14, "rating", "How clear are the dashboards?", { show_if: anyOf("q1", LEADERS) }),
    q(15, "yes_no", "Would you roll it out further?", { show_if: anyOf("q1", LEADERS) }),
    q(16, "text", "Where would you roll it out first?", { show_if: { match: "all", conditions: [{ question_id: "q1", op: "any_of", values: LEADERS }, { question_id: "q15", op: "any_of", values: ["true"] }] } }),
    q(17, "rating", "How confident are you in the data?", { show_if: anyOf("q1", LEADERS) }),
    q(18, "multi_choice", "Which reports do you read?", { options: ["Daily", "Weekly", "Monthly"], show_if: anyOf("q1", LEADERS) }),
    q(19, "rating", "How likely are you to recommend it?", { show_if: anyOf("q1", LEADERS) }),
    q(20, "text", "What should corporate standardise?", { show_if: anyOf("q1", ["Corporate"]) }),
    q(21, "text", "Anything else?", { optional: true }),
  ];
}
