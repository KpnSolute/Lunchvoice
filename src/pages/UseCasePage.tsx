import { Link, useParams } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { LinkButton } from "../components/ui";
import { Card } from "@/components/shadcn/card";
import { Eyebrow, Notice } from "@/components/shadcn/blocks";
import { templateHref, useCaseBySlug, type UseCase } from "../config/useCases";
import { templateById, type TemplateQuestion } from "../config/surveyTemplates";
import { Head, NotFoundPage } from "./Marketing";

// One page per use case (/use-cases/:slug). Content lives in src/config/useCases.json, which also feeds the search
// metadata and the sitemap, and its sample questions come straight from the template the button opens, so the page
// can never promise questions the template does not have.

const KIND_LABEL: Record<TemplateQuestion["kind"], string> = {
  rating: "Rating, 1 to 5",
  single_choice: "Choose one",
  multi_choice: "Choose any",
  yes_no: "Yes or no",
  text: "Short answer",
};

function Questions({ questions }: { questions: TemplateQuestion[] }) {
  return (
    <ol className="lv-uc-q" data-testid="uc-questions">
      {questions.map((q, i) => (
        <li key={q.prompt}>
          <span className="lv-uc-n" aria-hidden="true">{i + 1}</span>
          <div>
            <p className="lv-uc-prompt">{q.prompt}</p>
            <span className="lv-uc-kind">{KIND_LABEL[q.kind]}{q.optional ? " · optional" : ""}</span>
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

export function UseCasePage() {
  const { slug } = useParams();
  const u = useCaseBySlug(slug);
  const tpl = u ? templateById(u.templateId) : null;
  if (!u || !tpl) return <NotFoundPage />;
  const related = u.related.map(useCaseBySlug).filter((r): r is UseCase => r !== null);

  return (
    <div className="lv-mk" data-testid="use-case-page">
      <Head eyebrow="Use case" title={u.h1} sub={u.lede} />
      <div className="ui-row">
        <LinkButton to={templateHref(u)} variant="primary" size="lg" icon="arrow" data-testid="use-template">Use this template</LinkButton>
        <LinkButton to="/use-cases" variant="secondary" size="lg">See every use case</LinkButton>
      </div>
      <p className="ui-help lv-m0">Free with any account. Nothing is published until you say so, and you can edit every question.</p>

      <div className="lv-uc-layout">
        <Card>
          <Eyebrow accent>What you will ask</Eyebrow>
          <Questions questions={tpl.questions} />
        </Card>
        <div className="lv-stack-16">
          <Card>
            <Eyebrow accent>Why it works</Eyebrow>
            <ul className="lv-price-list" data-testid="uc-why">
              {u.why.map((w) => <li key={w}><Icon name="check" size={16} /><span>{w}</span></li>)}
            </ul>
            <p className="lv-mk-card-body">{u.setup}</p>
          </Card>
          {u.caveat && <Notice tone="info" title="Before you rely on it">{u.caveat}</Notice>}
        </div>
      </div>

      <section className="lv-stack-16" aria-labelledby="uc-more">
        <h2 id="uc-more" className="lv-mk-card-title">More ways to use LunchVoice</h2>
        <div className="lv-mk-grid">
          {related.map((r) => (
            <Card key={r.slug}>
              <span className="lv-mk-icon"><Icon name={r.icon as IconName} size={22} /></span>
              <h3 className="lv-mk-card-title"><Link to={`/use-cases/${r.slug}`}>{r.name}</Link></h3>
              <p className="lv-mk-card-body">{r.line}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
