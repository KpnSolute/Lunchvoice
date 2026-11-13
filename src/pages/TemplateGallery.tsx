import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon, type IconName } from "../components/Icon";
import { LinkButton } from "../components/ui";
import { Card } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { Input } from "@/components/shadcn/input";
import { Eyebrow, Notice, Segmented } from "@/components/shadcn/blocks";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { categoryBySlug, categorySlug, SURVEY_TEMPLATES, templateById, templateUsable, TEMPLATE_CATEGORIES, type SurveyTemplate, type TemplateCategory } from "../config/surveyTemplates";
import { PLAN_LABEL, PLAN_UNLOCK, tierAllows, type PlanTier } from "../lib/questionKinds";
import { QuestionInput } from "../ui/QuestionControls";
import type { Question } from "../lib/lvApi";
import { templateConfig } from "../config/surveyTemplates";
import { TemplateQuestions } from "../components/TemplateQuestions";
import { Head, NotFoundPage } from "./Marketing";

// The public template gallery: /templates (search, category and plan filters), /templates/<category> and
// /templates/<template>. One data file (src/config/templates.json) feeds this, the Quick Survey picker and the
// search metadata. Using a template always goes through the same builder path: /surveys/new?template=<slug>.

const CATEGORY_ICON: Record<TemplateCategory, IconName> = {
  Customers: "star", "Teams and work": "roster", Events: "sparkle", Education: "bulb", Dining: "fork", Community: "globe",
  "Clubs and groups": "join", "Product and research": "dashboard", "Health and wellbeing": "sprout", Forms: "survey", Fun: "crown", Decisions: "check",
};
const PLAN_BADGE = { free: "neutral", plus: "accent", pro: "ink" } as const;
type PlanFilter = "all" | PlanTier;

/** The tier of the signed-in person (null when signed out or not known yet). */
function useMyTier(): PlanTier | null {
  const { api, session } = useIdentity();
  const q = useLv(() => (session ? api.kindTier() : Promise.resolve({ ok: true as const, tier: "free" as PlanTier, quiz: false })), [api, session?.token]);
  return session ? q.data?.tier ?? null : null;
}

export function PlanBadge({ plan, locked }: { plan: PlanTier; locked?: boolean }) {
  return (
    <Badge variant={PLAN_BADGE[plan]} data-testid={`plan-${plan}`}>
      {locked && <Icon name="lock" size={12} />}
      {PLAN_LABEL[plan]}
    </Badge>
  );
}

/** "Use this template", or what to do instead: the plan it needs, or a note that it is not ready. */
export function UseButton({ t, tier, size = "md" }: { t: SurveyTemplate; tier: PlanTier | null; size?: "sm" | "md" | "lg" }) {
  if (!templateUsable(t)) return <span className="ui-help lv-m0" data-testid="not-ready">Not ready to use yet</span>;
  if (tier !== null && !tierAllows(tier, t.plan))
    return <LinkButton to="/pricing" variant="secondary" size={size} icon="lock" data-testid="use-locked">Needs {PLAN_LABEL[t.plan]}: see plans</LinkButton>;
  return <LinkButton to={`/surveys/new?template=${t.id}`} variant="primary" size={size} icon="arrow" data-testid="use-this">Use this template</LinkButton>;
}

function Card1({ t, tier }: { t: SurveyTemplate; tier: PlanTier | null }) {
  const locked = tier !== null && !tierAllows(tier, t.plan);
  return (
    <Card data-testid="template-card" data-slug={t.id}>
      <div className="ui-spread">
        <span className="lv-mk-icon"><Icon name={CATEGORY_ICON[t.category]} size={22} /></span>
        <span className="ui-row"><PlanBadge plan={t.plan} locked={t.plan !== "free" && (tier === null || locked)} />{t.anonymity === "identified" && <Badge variant="outline">Identified</Badge>}</span>
      </div>
      <h2 className="lv-mk-card-title"><Link to={`/templates/${t.id}`}>{t.name}</Link></h2>
      <p className="lv-mk-card-body">{t.blurb}</p>
      <p className="ui-help lv-m0">{t.questions.length} {t.questions.length === 1 ? "question" : "questions"} · {t.category}</p>
      <div className="ui-row">
        <UseButton t={t} tier={tier} size="sm" />
        <LinkButton to={`/templates/${t.id}`} variant="quiet" size="sm">Preview</LinkButton>
      </div>
    </Card>
  );
}

/** /templates and /templates/<category>. */
export function TemplateGallery({ category }: { category?: TemplateCategory }) {
  const nav = useNavigate();
  const tier = useMyTier();
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState<PlanFilter>("all");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return SURVEY_TEMPLATES.filter((t) =>
      (!category || t.category === category) && (plan === "all" || t.plan === plan) &&
      (!needle || `${t.name} ${t.blurb} ${t.category}`.toLowerCase().includes(needle)));
  }, [q, plan, category]);
  return (
    <div className="lv-mk" data-testid="template-gallery">
      <Head
        eyebrow={category ?? "Templates"}
        title={category ? `${category} survey templates` : "Survey templates for any group"}
        sub={category ? "Preview every question, then use one and change anything you like." : `${SURVEY_TEMPLATES.length} ready-made surveys. Anonymous unless a template says otherwise. Nothing is published until you say so.`}
      />
      <div className="lv-stack-16">
        <div role="search" className="lv-tg-search">
          <label htmlFor="tg-q" className="lv-kc-sr">Search templates</label>
          <Input id="tg-q" type="search" placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <nav aria-label="Template categories" className="lv-tg-cats">
          <Link to="/templates" className="lv-tg-chip" aria-current={!category ? "page" : undefined}>All</Link>
          {TEMPLATE_CATEGORIES.map((c) => (
            <Link key={c} to={`/templates/${categorySlug(c)}`} className="lv-tg-chip" aria-current={category === c ? "page" : undefined}>{c}</Link>
          ))}
        </nav>
        <Segmented<PlanFilter> label="Plan" value={plan} onValueChange={setPlan}
          options={[{ value: "all", label: "All plans" }, { value: "free", label: "Free" }, { value: "plus", label: "Plus" }, { value: "pro", label: "Pro" }]} />
      </div>
      <p className="ui-help lv-m0" role="status" data-testid="template-count">{shown.length} {shown.length === 1 ? "template" : "templates"}</p>
      {shown.length === 0 ? (
        <Notice title="No templates match">Try a different word, or <button type="button" className="lv-link" onClick={() => { setQ(""); setPlan("all"); nav("/templates"); }}>clear the filters</button>.</Notice>
      ) : (
        <div className="lv-mk-grid" data-testid="template-grid">{shown.map((t) => <Card1 key={t.id} t={t} tier={tier} />)}</div>
      )}
      <div className="ui-row"><LinkButton to="/surveys/new" variant="secondary" size="lg" icon="arrow">Start from a blank survey</LinkButton></div>
    </div>
  );
}

/** A template's questions as real, working controls. Answers stay in this page and are never sent. */
function LivePreview({ t }: { t: SurveyTemplate }) {
  const qs: Question[] = t.questions.map((x, i) => ({ question_id: `p${i}`, position: i + 1, kind: x.kind, prompt: x.prompt, config: templateConfig(x) as Question["config"] }));
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  return (
    <div className="lv-tg-preview" data-testid="template-preview">
      <p className="ui-help lv-m0">Try it. Nothing you tap here is saved or sent.</p>
      {qs.slice(0, 5).map((q, i) => (
        <section key={q.question_id} className="lv-tg-q" aria-labelledby={`pq-${i}`}>
          <h3 id={`pq-${i}`} className="lv-q-title">{i + 1}. {q.prompt}{q.config.optional ? " (optional)" : ""}</h3>
          <QuestionInput q={q} value={answers[q.question_id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.question_id]: v }))} />
        </section>
      ))}
      {qs.length > 5 && <p className="ui-help lv-m0">{qs.length - 5} more questions are listed below.</p>}
    </div>
  );
}

/** /templates/<slug>: a category page or a template page. */
export function TemplateRoute() {
  const { slug } = useParams();
  const cat = categoryBySlug(slug);
  if (cat) return <TemplateGallery category={cat} />;
  const t = templateById(slug);
  if (!t) return <NotFoundPage />;
  return <TemplatePage t={t} />;
}

function TemplatePage({ t }: { t: SurveyTemplate }) {
  const tier = useMyTier();
  const siblings = SURVEY_TEMPLATES.filter((x) => x.category === t.category && x.id !== t.id).slice(0, 3);
  return (
    <div className="lv-mk" data-testid="template-page">
      <Head eyebrow={t.category} title={t.name} sub={t.blurb} />
      <div className="ui-row">
        <PlanBadge plan={t.plan} locked={t.plan !== "free" && (tier === null || !tierAllows(tier, t.plan))} />
        <Badge variant="outline">{t.anonymity === "identified" ? "Identified" : "Anonymous"}</Badge>
        <Badge variant="outline">{t.questions.length} {t.questions.length === 1 ? "question" : "questions"}</Badge>
      </div>
      <Notice tone={t.anonymity === "identified" ? "warn" : "info"} title={t.anonymity === "identified" ? "This survey records who answers" : "Anonymous by default"}>
        <span data-testid="template-intro">{t.intro}</span>
      </Notice>
      {t.plan !== "free" && <p className="ui-help lv-m0" data-testid="plan-note">{PLAN_UNLOCK[t.plan]}</p>}
      {!templateUsable(t) && <Notice tone="warn" title="Not ready to use yet">This template needs {t.flags.join(" and ")} questions, which are not built yet. You can read it, but it cannot be started today.</Notice>}
      <div className="ui-row"><UseButton t={t} tier={tier} size="lg" /><LinkButton to="/templates" variant="secondary" size="lg">All templates</LinkButton></div>
      <div className="lv-uc-layout">
        <Card><Eyebrow accent>Try it</Eyebrow><LivePreview t={t} /></Card>
        <Card><Eyebrow accent>All the questions</Eyebrow><TemplateQuestions questions={t.questions} testId="template-questions" /></Card>
      </div>
      {siblings.length > 0 && (
        <section className="lv-stack-16" aria-labelledby="tg-more">
          <h2 id="tg-more" className="lv-mk-card-title">More in {t.category}</h2>
          <div className="lv-mk-grid">{siblings.map((s) => <Card1 key={s.id} t={s} tier={tier} />)}</div>
        </section>
      )}
    </div>
  );
}

/** A strip of templates for a use-case page ("Recommended for {use case}"). */
export function RecommendedTemplates({ ids, useCase }: { ids: string[]; useCase: string }) {
  const tier = useMyTier();
  const list = ids.map((id) => templateById(id)).filter((t): t is SurveyTemplate => t !== null);
  if (!list.length) return null;
  return (
    <section className="lv-stack-16" aria-labelledby="uc-reco" data-testid="uc-recommended">
      <h2 id="uc-reco" className="lv-mk-card-title">Recommended for {useCase}</h2>
      <div className="lv-mk-grid">{list.map((t) => <Card1 key={t.id} t={t} tier={tier} />)}</div>
      <div className="ui-row"><LinkButton to="/templates" variant="quiet">See all templates</LinkButton></div>
    </section>
  );
}
