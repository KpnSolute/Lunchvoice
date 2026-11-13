import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { describeError } from "../lib/errors";
import type { QuestionKind } from "../lib/lvApi";
import {
  clearSurveyDraft, draftConfig, draftProblem, emptyDraft, loadSurveyDraft, saveSurveyDraft, MAX_DRAFT_QUESTIONS,
  type DraftQuestion, type SurveyDraft,
} from "../lib/surveyDraft";
import { SURVEY_TEMPLATES, templateById, type SurveyTemplate } from "../config/surveyTemplates";
import { Icon } from "../components/Icon";
import { LinkButton } from "../components/ui";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { EmptyState, Field, LoadingRows, Notice, PageHeader } from "@/components/shadcn/blocks";

// F6: build a Quick Survey before signing in. Everything stays in this browser until Publish; Publish sends the
// visitor through sign-in and brings them back to /surveys/new?draft=resume, where ResumeVisitorDraft creates it.

const KIND_LABELS: { key: QuestionKind; label: string }[] = [
  { key: "rating", label: "Rating (1 to 5)" },
  { key: "single_choice", label: "Single choice" },
  { key: "multi_choice", label: "Multiple choice" },
  { key: "yes_no", label: "Yes or no" },
  { key: "text", label: "Short text" },
];
const isChoice = (k: QuestionKind) => k === "single_choice" || k === "multi_choice";

/** A template's title, privacy defaults and questions as a draft (the visitor can still edit all of it). */
function applyTemplate(d: SurveyDraft, t: SurveyTemplate): SurveyDraft {
  return {
    ...d,
    title: d.title.trim() ? d.title : t.title,
    access: t.defaults?.access ?? d.access,
    anonymity: t.defaults?.anonymity ?? d.anonymity,
    questions: t.questions.map((q) => ({ kind: q.kind, prompt: q.prompt, ...(q.options ? { options: [...q.options] } : {}), ...(q.max ? { max: q.max } : {}), ...(q.optional ? { optional: true } : {}) })),
  };
}

export function VisitorSurveyBuilder() {
  const nav = useNavigate();
  // /surveys/new?template=<id> (marketing links) starts from that template; a saved draft always wins.
  const [params] = useSearchParams();
  const [draft, setDraft] = useState<SurveyDraft>(() => {
    const saved = loadSurveyDraft();
    if (saved) return saved;
    const t = templateById(params.get("template"));
    return t ? applyTemplate(emptyDraft(), t) : emptyDraft();
  });
  const [shown, setShown] = useState(false);
  const patch = (p: Partial<SurveyDraft>) => setDraft((d) => ({ ...d, ...p }));
  useEffect(() => { saveSurveyDraft(draft); }, [draft]);

  const setQ = (i: number, p: Partial<DraftQuestion>) =>
    setDraft((d) => ({ ...d, questions: d.questions.map((q, j) => (j === i ? { ...q, ...p } : q)) }));
  const addQ = () =>
    setDraft((d) => (d.questions.length >= MAX_DRAFT_QUESTIONS ? d : { ...d, questions: [...d.questions, { kind: "rating", prompt: "" }] }));
  const fromTemplate = (id: string) => {
    const t = templateById(id);
    if (t) setDraft((d) => applyTemplate(d, t));
  };

  const problem = draftProblem(draft);
  function publish() {
    setShown(true);
    if (problem) return;
    saveSurveyDraft(draft);
    nav("/signin", { state: { from: "/surveys/new?draft=resume" } });
  }

  return (
    <div className="ui-page lv-narrow-page" data-testid="visitor-builder">
      <PageHeader
        eyebrow="Quick Survey"
        title="Build your survey first."
        sub="No account needed to start. You sign in when you press Publish, and your draft is waiting for you."
        actions={<LinkButton to="/" variant="quiet">Cancel</LinkButton>}
      />
      <Card>
        <form className="lv-stack-24" onSubmit={(e) => { e.preventDefault(); publish(); }} noValidate>
          <Field label="Start from a template (optional)" htmlFor="vb-template">
            <Select value="" onValueChange={fromTemplate}>
              <SelectTrigger id="vb-template" aria-label="Start from a template" data-testid="vb-template"><SelectValue placeholder="Choose a template" /></SelectTrigger>
              <SelectContent>
                {SURVEY_TEMPLATES.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Title" htmlFor="vb-title" counter={{ value: draft.title.length, max: 120 }} error={shown && !draft.title.trim() ? "Add a title." : undefined}>
            <Input id="vb-title" value={draft.title} maxLength={120} onChange={(e) => patch({ title: e.target.value })} placeholder="Book club: next month’s pick" data-testid="vb-title" />
          </Field>

          <section className="lv-stack-16" aria-labelledby="vb-questions-h">
            <h2 id="vb-questions-h" className="lv-share-h">Questions</h2>
            {draft.questions.length === 0 && (
              <EmptyState icon={<Icon name="survey" size={22} />} title="No questions yet">Add up to {MAX_DRAFT_QUESTIONS}: ratings, choices, yes or no, or short text.</EmptyState>
            )}
            {draft.questions.map((q, i) => (
              <Card key={i} variant="dashed" data-testid="vb-question">
                <div className="lv-stack-16">
                  <Field label={`Question ${i + 1}`} htmlFor={`vb-q-${i}`}>
                    <Input id={`vb-q-${i}`} value={q.prompt} maxLength={500} onChange={(e) => setQ(i, { prompt: e.target.value })} data-testid="vb-prompt" />
                  </Field>
                  <Field label="Type" htmlFor={`vb-k-${i}`}>
                    <Select value={q.kind} onValueChange={(v) => setQ(i, { kind: v as QuestionKind })}>
                      <SelectTrigger id={`vb-k-${i}`} aria-label={`Question ${i + 1} type`}><SelectValue /></SelectTrigger>
                      <SelectContent>{KIND_LABELS.map((k) => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  {isChoice(q.kind) && (
                    <Field label="Options, one per line" htmlFor={`vb-o-${i}`} help="2 to 10 different options.">
                      <Textarea id={`vb-o-${i}`} rows={4} value={(q.options ?? []).join("\n")} onChange={(e) => setQ(i, { options: e.target.value.split("\n") })} data-testid="vb-options" />
                    </Field>
                  )}
                  <div className="ui-row">
                    <Button type="button" variant="quiet" size="sm" onClick={() => setDraft((d) => ({ ...d, questions: d.questions.filter((_, j) => j !== i) }))}>Remove question {i + 1}</Button>
                  </div>
                </div>
              </Card>
            ))}
            <div className="ui-row">
              <Button type="button" variant="secondary" onClick={addQ} disabled={draft.questions.length >= MAX_DRAFT_QUESTIONS} data-testid="vb-add"><Icon name="plus" size={16} />Add a question</Button>
            </div>
          </section>

          {shown && problem && <Notice tone="error">{problem}</Notice>}
          <div className="ui-row">
            <Button type="submit" variant="primary" size="lg" data-testid="vb-publish">Publish <Icon name="arrow" size={16} /></Button>
          </div>
          <p className="ui-help lv-m0">Your draft stays in this browser. Publishing asks you to sign in first; answering surveys never does.</p>
        </form>
      </Card>
    </div>
  );
}

/** Signed in with a saved visitor draft: create it on the server, publish it, and land on its share page. */
export function ResumeVisitorDraft() {
  const { api } = useIdentity();
  const nav = useNavigate();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const d = loadSurveyDraft();
    if (!d || draftProblem(d)) { nav("/surveys/new", { replace: true }); return; }
    void (async () => {
      const r = await api.quickSurveyCreate(d.title.trim(), d.access, d.anonymity, d.access === "link" && d.guests);
      if (!r.ok) return setError(describeError(r.error));
      const id = r.campaign.campaign_id;
      for (const [i, q] of d.questions.entries()) {
        const added = await api.questionAdd(id, i + 1, q.kind, q.prompt.trim(), draftConfig(q));
        if (!added.ok) { toast.warning("Your draft was saved, but a question could not be added. Check it in the editor."); clearSurveyDraft(); return nav(`/surveys/${id}`, { replace: true }); }
      }
      clearSurveyDraft();
      const live = await api.campaignActivate(id);
      if (live.ok) toast.success("Published. Share the link below.");
      else toast.warning("Your draft is saved. Fix what is listed, then press Publish.");
      nav(`/surveys/${id}`, { replace: true });
    })();
  }, [api, nav]);

  if (error) {
    return (
      <div className="ui-page lv-narrow-page">
        <Notice tone="error" title="We couldn’t create your survey">{error} Your draft is still saved in this browser.</Notice>
        <div className="ui-row"><LinkButton to="/surveys/new" variant="secondary">Back to your draft</LinkButton></div>
      </div>
    );
  }
  return <div className="ui-page"><LoadingRows rows={3} label="Publishing your survey" /></div>;
}
