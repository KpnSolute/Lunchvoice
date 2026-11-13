import type { TemplateQuestion } from "../config/surveyTemplates";

import { kindInfo } from "../lib/questionKinds";

const KIND_LABEL: Partial<Record<TemplateQuestion["kind"], string>> = {
  rating: "Rating, 1 to 5",
  single_choice: "Choose one",
  multi_choice: "Choose any",
  yes_no: "Yes or no",
  text: "Short answer",
};
const labelOf = (k: TemplateQuestion["kind"]) => KIND_LABEL[k] ?? kindInfo(k)?.label ?? k;

/** The questions a template will create, as the person will see them. Shared by use-case pages and the Campaign picker. */
export function TemplateQuestions({ questions, testId }: { questions: TemplateQuestion[]; testId?: string }) {
  return (
    <ol className="lv-uc-q" data-testid={testId}>
      {questions.map((q, i) => (
        <li key={q.prompt}>
          <span className="lv-uc-n" aria-hidden="true">{i + 1}</span>
          <div>
            <p className="lv-uc-prompt">{q.prompt}</p>
            <span className="lv-uc-kind">
              {labelOf(q.kind)}
              {q.max ? ` · up to ${q.max}` : ""}
              {q.optional ? " · optional" : ""}
            </span>
            {q.options && (
              <ul className="lv-uc-opts" aria-label="Options">
                {q.options.map((o) => <li key={o}>{o}</li>)}
              </ul>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
