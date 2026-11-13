import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { describeError } from "../lib/errors";
import { questionConfigProblem, type CampaignDetailData, type LvResult, type Question, type QuestionConfig, type QuestionKind } from "../lib/lvApi";
import { hasOptions, MAX_OPTIONS, MIN_OPTIONS } from "../lib/readiness";
import { CORE_KINDS, defaultConfig, IDENTIFIED_ONLY, KIND_INFO, kindPlan, PLAN_LABEL, PLAN_UNLOCK, tierAllows, type PlanTier } from "../lib/questionKinds";
import { useLv } from "../lib/useLv";
import { KindSettings, QuizSettings } from "./KindSettings";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { QuestionInput } from "../ui/QuestionControls";
import { describeRule } from "../lib/sections";
import { SectionPanel } from "./SectionPanel";
import { LogicPanel } from "./LogicPanel";
import { describeLogicRule, pathLengths } from "../lib/logic";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Switch } from "@/components/shadcn/switch";
import { Badge } from "@/components/shadcn/badge";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { AnswerTile, StudioRail } from "../ui/StudioRail";
import { duplicateConfig, duplicatePrompt } from "../lib/studio";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/shadcn/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Eyebrow, Field, Notice, ToggleRow } from "@/components/shadcn/blocks";

/**
 * The question workbench: an outline with ONE "Add question", the editor for the selected question, and a live
 * respondent preview. Shared by the Campaign Studio and the Quick Survey editor. Every change autosaves through the
 * caller's `save` tracker; the backend validates again on publish.
 */

export const KINDS: { key: QuestionKind; label: string; plan: PlanTier }[] = KIND_INFO.map((k) => ({ key: k.kind, label: k.label, plan: k.plan }));
export const kindLabel = (k: string) => KINDS.find((x) => x.key === k)?.label ?? k;
const TEXT_WARNING = "Text answers can identify people. We only show them once enough people have answered.";

export interface SaveTracker {
  run: <T extends LvResult<object>>(p: Promise<T>) => Promise<T>;
}

/** Positions are unique per Campaign (campaign_questions_position_key), so new ones go after the highest. */
const nextPosition = (qs: Question[]) => (qs.length ? Math.max(...qs.map((q) => q.position)) + 1 : 1);

export function QuestionWorkbench({
  initialKind,
  d,
  locked,
  limit,
  save,
  reload,
  layout,
  themePanel,
}: {
  d: CampaignDetailData;
  locked: boolean;
  limit: number | null;
  save: SaveTracker;
  reload: () => void;
  /** The kind a brand-new question starts as (poll quick-create: single choice; feedback: text). */
  initialKind?: QuestionKind;
  /** "pro": the Creator studio (rail, canvas, properties). Anything else is the simple outline editor. */
  layout?: "pro";
  /** Pro only: the survey's Theme tab content (the existing branding panel). */
  themePanel?: ReactNode;
}) {
  const { api } = useIdentity();
  const qs = d.questions;
  // 000047: which question types this person may save here. Until it answers, only the free ones.
  const tierQ = useLv(() => api.kindTier(d.campaign.campaign_id), [api, d.campaign.campaign_id]);
  const tier: PlanTier = tierQ.data?.tier ?? "free";
  const [sel, setSel] = useState<string>(() => qs[0]?.question_id ?? (locked ? "" : "new"));
  const [sheet, setSheet] = useState(false);
  // Save race (track A): a new question keeps ONE editor from its first keystroke to after the reload that brings
  // it back. The created id waits in `pendingId` until it is in `qs`, and `aliases` keeps the editor's React key, so
  // nothing typed while the create was in flight is lost and the selection never jumps.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState(0);
  const aliases = useRef<Record<string, string>>({});
  const arrived = pendingId !== null && qs.some((q) => q.question_id === pendingId);
  const effectiveSel = arrived && sel === "new" ? pendingId! : sel;
  const atLimit = limit !== null && qs.length >= limit;
  const current = qs.find((q) => q.question_id === effectiveSel) ?? null;
  const index = current ? qs.indexOf(current) : -1;

  useEffect(() => {
    if (!arrived) return;
    setSel((s) => (s === "new" ? pendingId! : s));
    setPendingId(null);
  }, [arrived, pendingId]);

  // Keep a valid selection when questions change (removal, reload).
  useEffect(() => {
    if (sel === "new" || qs.some((q) => q.question_id === sel)) return;
    setSel(qs[0]?.question_id ?? (locked ? "" : "new"));
  }, [qs, sel, locked]);

  // Reorder without colliding with the unique position: park one question, then swap.
  async function swap(a: Question, b: Question) {
    const park = nextPosition(qs) + 1000;
    const pa = a.position; // read once: the objects may change as each update lands
    const pb = b.position;
    for (const step of [
      () => api.questionUpdate(a.question_id, { position: park }),
      () => api.questionUpdate(b.question_id, { position: pa }),
      () => api.questionUpdate(a.question_id, { position: pb }),
    ]) {
      const r = await save.run(step());
      if (!r.ok) { toast.error(describeError(r.error)); break; }
    }
  }
  async function moveTo(from: number, to: number) {
    if (from === to || to < 0 || to >= qs.length) return;
    const order = [...qs];
    const dir = to > from ? 1 : -1;
    for (let i = from; i !== to; i += dir) {
      await swap(order[i], order[i + dir]);
      [order[i], order[i + dir]] = [order[i + dir], order[i]];
    }
    reload();
  }

  function onCreated(id: string) {
    aliases.current[id] = `new-${newKey}`;
    setPendingId(id);
  }

  async function duplicate(q: Question) {
    const r = await save.run(api.questionAdd(d.campaign.campaign_id, nextPosition(qs), q.kind, duplicatePrompt(q.prompt), duplicateConfig(q)));
    if (!r.ok) return void toast.error(describeError(r.error));
    setPendingId(r.question_id);
    setSel("new");
    reload();
    toast.success("Question duplicated");
  }
  async function remove(q: Question) {
    const r = await save.run(api.questionRemove(q.question_id));
    if (r.ok) { toast.success("Question removed"); reload(); } else toast.error(describeError(r.error));
  }
  const [panelSheet, setPanelSheet] = useState(false);

  const outline = (
    <OutlineList
      qs={qs}
      sel={effectiveSel}
      locked={locked}
      atLimit={atLimit}
      limit={limit}
      onSelect={(id) => { setSel(id); setSheet(false); }}
      onAdd={() => { setNewKey((k) => k + 1); setSel("new"); setSheet(false); }}
      onMove={moveTo}
    />
  );

  if (layout === "pro") {
    const rail = (
      <StudioRail
        qs={qs} sel={effectiveSel} locked={locked} atLimit={atLimit} limit={limit}
        onSelect={(id) => { setSel(id); setSheet(false); }}
        onAdd={() => { setNewKey((k) => k + 1); setSel("new"); setSheet(false); }}
        onMove={moveTo} onDuplicate={duplicate} onDelete={remove}
      />
    );
    const hasRules = qs.some((x) => x.config.show_if || x.config.jumps?.length || x.config.section?.show_if);
    const properties = (
      <>
        {current && <SectionPanel key={`sec-${current.question_id}`} q={current} n={index + 1} qs={qs} locked={locked} allowed={d.features?.branching ?? false} save={save} reload={reload} />}
        {current && <LogicPanel key={`logic-${current.question_id}`} q={current} qs={qs} locked={locked} allowed={d.features?.branching ?? false} save={save} reload={reload} />}
        {hasRules && <PathSummary qs={qs} />}
      </>
    );
    return (
      <div className="lv-qw-host">
        <div className="lv-qw lv-qw-pro" data-testid="question-workbench" data-layout="pro">
          <div className="lv-rail-wrap">{rail}</div>
          <section className="lv-qw-editor lv-qw-pro-editor" aria-label="Question editor">
            {locked && <Notice>Published questions can’t change. Close it to stop answers.</Notice>}
            {current ? (
              <QuestionEditor pro key={aliases.current[current.question_id] ?? current.question_id} q={current} n={index + 1} locked={locked} save={save} reload={reload} campaignId={d.campaign.campaign_id} nextPos={nextPosition(qs)} onCreated={onCreated} tier={tier} anonymity={d.campaign.anonymity} />
            ) : effectiveSel === "new" && !locked ? (
              atLimit ? (
                <Notice tone="warn" title={`This survey has ${qs.length} of ${limit} questions`}>Remove a question to add another.</Notice>
              ) : (
                <QuestionEditor pro key={`new-${newKey}`} q={null} initialKind={initialKind} n={qs.length + 1} locked={false} save={save} reload={reload} campaignId={d.campaign.campaign_id} nextPos={nextPosition(qs)} onCreated={onCreated} tier={tier} anonymity={d.campaign.anonymity} />
              )
            ) : (
              <Card variant="well"><p className="lv-m0">{qs.length ? "Pick a question to see it." : "This survey has no questions."}</p></Card>
            )}
          </section>
          <aside className="lv-pro-panel" aria-label="Properties">
            <div className="lv-pro-panel-trigger">
              <Button variant="secondary" block onClick={() => setPanelSheet(true)} data-testid="open-properties"><Icon name="settings" size={16} /> Question properties</Button>
            </div>
            <Sheet open={panelSheet} onOpenChange={setPanelSheet}>
              <SheetContent side="bottom" className="lv-pro-sheet">
                <SheetTitle>Question properties</SheetTitle>
                <SheetDescription className="sr-only">Logic, sections and the survey theme.</SheetDescription>
                <ProPanelTabs properties={properties} themePanel={themePanel} />
              </SheetContent>
            </Sheet>
            <div className="lv-pro-panel-wide"><ProPanelTabs properties={properties} themePanel={themePanel} /></div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="lv-qw-host">
    <div className="lv-qw" data-testid="question-workbench">
      <div className="lv-qw-outline-trigger">
        <Sheet open={sheet} onOpenChange={setSheet}>
          <SheetTrigger asChild>
            <Button variant="secondary" block>
              <Icon name="menu" size={16} /> Questions · {qs.length} {current ? `— editing ${index + 1}` : effectiveSel === "new" ? "— new question" : ""}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetTitle>Questions · {qs.length}</SheetTitle>
            <SheetDescription className="sr-only">Pick a question to edit, reorder, or add one.</SheetDescription>
            {outline}
          </SheetContent>
        </Sheet>
      </div>
      <section className="lv-qw-outline" aria-label="Question outline">{outline}</section>

      <section className="lv-qw-editor" aria-label="Question editor">
        {locked && <Notice>Published questions can’t change. Close it to stop answers.</Notice>}
        {current ? (
          <QuestionEditor key={aliases.current[current.question_id] ?? current.question_id} q={current} n={index + 1} locked={locked} save={save} reload={reload} campaignId={d.campaign.campaign_id} nextPos={nextPosition(qs)} onCreated={onCreated} tier={tier} anonymity={d.campaign.anonymity} />
        ) : effectiveSel === "new" && !locked ? (
          atLimit ? (
            <Notice tone="warn" title={`This survey has ${qs.length} of ${limit} questions`}>Remove a question to add another.</Notice>
          ) : (
            <QuestionEditor key={`new-${newKey}`} q={null} initialKind={initialKind} n={qs.length + 1} locked={false} save={save} reload={reload} campaignId={d.campaign.campaign_id} nextPos={nextPosition(qs)} onCreated={onCreated} tier={tier} anonymity={d.campaign.anonymity} />
          )
        ) : (
          <Card variant="well"><p className="lv-m0">{qs.length ? "Pick a question to see it." : "This survey has no questions."}</p></Card>
        )}
        {/* A sibling, not a wrapper: wrapping the editor would remount it when a new question is created (save race). */}
        {current && <SectionPanel key={`sec-${current.question_id}`} q={current} n={index + 1} qs={qs} locked={locked} allowed={d.features?.branching ?? false} save={save} reload={reload} />}
        {/* 000042 Linked Questions: show-only-if and end-survey, a sibling like the section panel. */}
        {current && <LogicPanel key={`logic-${current.question_id}`} q={current} qs={qs} locked={locked} allowed={d.features?.branching ?? false} save={save} reload={reload} />}
        {qs.some((x) => x.config.show_if || x.config.jumps?.length || x.config.section?.show_if) && <PathSummary qs={qs} />}
      </section>
    </div>
    </div>
  );
}

function ProPanelTabs({ properties, themePanel }: { properties: ReactNode; themePanel?: ReactNode }) {
  return (
    <Tabs defaultValue="question" className="lv-pro-tabs">
      <TabsList aria-label="Studio panel">
        <TabsTrigger value="question">Question</TabsTrigger>
        {themePanel && <TabsTrigger value="theme">Theme</TabsTrigger>}
      </TabsList>
      <TabsContent value="question"><div className="lv-stack-16">{properties}</div></TabsContent>
      {themePanel && <TabsContent value="theme">{themePanel}</TabsContent>}
    </Tabs>
  );
}

/** How many questions one person answers: the shortest and longest path through the rules. */
function PathSummary({ qs }: { qs: Question[] }) {
  const p = pathLengths(qs);
  return (
    <Card variant="well" data-testid="path-summary">
      <p className="lv-m0">{p.min === p.max ? `Everyone answers ${p.max} questions.` : `People answer between ${p.min} and ${p.max} questions, depending on their answers.`}{p.exact ? "" : " (estimated)"}</p>
    </Card>
  );
}

function OutlineList({
  qs,
  sel,
  locked,
  atLimit,
  limit,
  onSelect,
  onAdd,
  onMove,
}: {
  qs: Question[];
  sel: string;
  locked: boolean;
  atLimit: boolean;
  limit: number | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onMove: (from: number, to: number) => void;
}) {
  const drag = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const onKey = (e: KeyboardEvent, i: number) => {
    if (locked || !e.altKey) return;
    if (e.key === "ArrowUp") { e.preventDefault(); onMove(i, i - 1); }
    if (e.key === "ArrowDown") { e.preventDefault(); onMove(i, i + 1); }
  };
  return (
    <div className="lv-stack-8">
      <h3 className="lv-qw-h">Questions · {qs.length}{limit !== null ? ` of ${limit}` : ""}</h3>
      {!locked && qs.length > 1 && <p className="ui-help lv-m0">Drag to reorder, or focus a question and press Alt with the arrow keys.</p>}
      <ol className="lv-outline" data-testid="question-outline">
        {qs.map((q, i) => (
          <Fragment key={q.question_id}>
          {q.config.section && (
            <li className="lv-outline-section" data-testid="outline-section">
              <span className="lv-outline-section-title">{q.config.section.title || "Untitled section"}</span>
              {q.config.section.show_if && <small>{describeRule(q.config.section.show_if, qs)}</small>}
            </li>
          )}
          <li
            className="lv-outline-li"
            data-over={over === i || undefined}
            draggable={!locked}
            onDragStart={(e: DragEvent) => { drag.current = i; e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e: DragEvent) => { if (drag.current !== null) { e.preventDefault(); setOver(i); } }}
            onDragLeave={() => setOver(null)}
            onDrop={(e: DragEvent) => { e.preventDefault(); const from = drag.current; drag.current = null; setOver(null); if (from !== null) onMove(from, i); }}
          >
            {!locked && <span className="lv-drag" aria-hidden="true">⋮⋮</span>}
            <button type="button" className="lv-outline-item" aria-current={sel === q.question_id ? "true" : undefined} onClick={() => onSelect(q.question_id)} onKeyDown={(e) => onKey(e, i)}>
              <span className="lv-outline-n">{String(i + 1).padStart(2, "0")}</span>
              <span className="lv-outline-text">
                <span>{q.prompt}</span>
                <small>{kindLabel(q.kind)}{q.config.optional ? " · optional" : ""}</small>
                {q.config.show_if && <small className="lv-outline-rule" data-testid="outline-rule">{describeLogicRule(q.config.show_if, qs)}</small>}
                {q.config.jumps?.some((j) => j.to === "end") && <small className="lv-outline-rule">Ends the survey on {q.config.jumps.filter((j) => j.to === "end").map((j) => (q.kind === "yes_no" ? (j.when === "true" ? "Yes" : "No") : j.when)).join(", ")}</small>}
              </span>
            </button>
            {!locked && (
              <span className="lv-outline-move">
                <Button variant="quiet" size="icon-sm" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => onMove(i, i - 1)}><Icon name="chevron" size={14} className="lv-rot180" /></Button>
                <Button variant="quiet" size="icon-sm" aria-label={`Move question ${i + 1} down`} disabled={i === qs.length - 1} onClick={() => onMove(i, i + 1)}><Icon name="chevron" size={14} /></Button>
              </span>
            )}
          </li>
          </Fragment>
        ))}
        {sel === "new" && !locked && !atLimit && (
          <li className="lv-outline-li"><span className="lv-outline-item" aria-current="true"><span className="lv-outline-n">{String(qs.length + 1).padStart(2, "0")}</span><span className="lv-outline-text"><span>New question</span><small>Not saved yet: type the question text</small></span></span></li>
        )}
      </ol>
      {!locked && (
        <button type="button" className="lv-add" onClick={onAdd} disabled={atLimit} data-testid="add-question">
          <Icon name="plus" size={16} /> {atLimit ? `Limit of ${limit} questions reached` : "Add question"}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ editor */

/** `cfg` holds the settings of the v2 kinds (min, step, points, rows, fields, quiz...), see KindSettings. */
type Draft = { kind: QuestionKind; prompt: string; options: string[]; optional: boolean; max: number | null; cfg: Record<string, unknown> };
// Keys this editor owns. Everything else in a question's settings (sections, rules, jumps...) passes through untouched.
const OWNED = ["min", "max", "step", "integer", "unit", "low_label", "high_label", "points", "labels", "rows", "before_label", "after_label", "min_label", "max_label", "fields", "max_mb", "types", "statement", "prices", "currency", "images", "quiz"];
const fromQuestion = (q: Question | null, start: QuestionKind = "single_choice"): Draft => ({
  kind: q?.kind ?? start,
  prompt: q?.prompt ?? "",
  options: q ? (q.config.options ?? []) : hasOptions(start) ? ["", ""] : [],
  optional: Boolean(q?.config.optional),
  max: q?.kind === "multi_choice" && typeof q?.config.max === "number" ? q.config.max : null,
  cfg: q ? Object.fromEntries(Object.entries(q.config).filter(([k]) => OWNED.includes(k) && !(k === "max" && q.kind === "multi_choice"))) : defaultConfig(start),
});
function toConfig(base: QuestionConfig | undefined, d: Draft): QuestionConfig {
  const rest = Object.fromEntries(Object.entries(base ?? {}).filter(([k]) => k !== "options" && k !== "optional" && !OWNED.includes(k)));
  const quizOk = d.kind === "single_choice" || d.kind === "multi_choice";
  const own = Object.fromEntries(Object.entries(d.cfg).filter(([k]) => (k === "quiz" ? quizOk : k !== "quiz")));
  const opts = d.options.map((o) => o.trim()).filter(Boolean);
  return {
    ...rest,
    ...own,
    // Empty rows are editor-only; the server stores the non-empty, different options (000018, 000047).
    ...(hasOptions(d.kind) ? { options: opts } : {}),
    ...(d.kind === "multi_choice" && d.max !== null && d.max <= opts.length ? { max: d.max } : {}),
    ...(d.optional ? { optional: true } : {}),
  };
}

function QuestionEditor({
  initialKind,
  q,
  n,
  locked,
  save,
  reload,
  campaignId,
  nextPos,
  onCreated,
  tier,
  anonymity,
  pro,
}: {
  tier: PlanTier;
  anonymity: "anonymous" | "identified";
  pro?: boolean;
  q: Question | null;
  n: number;
  locked: boolean;
  save: SaveTracker;
  reload: () => void;
  campaignId: string;
  nextPos: number;
  onCreated: (id: string) => void;
  initialKind?: QuestionKind;
}) {
  const { api } = useIdentity();
  const [draft, setDraft] = useState<Draft>(() => fromQuestion(q, initialKind));
  const [pendingKind, setPendingKind] = useState<QuestionKind | null>(null);
  const [preview, setPreview] = useState<unknown>(undefined);
  const timer = useRef<number | null>(null);
  const creating = useRef(false);
  const dirtyWhileCreating = useRef(false);
  const createdId = useRef<string | null>(null);
  const qRef = useRef(q);
  qRef.current = q;
  const latest = useRef(draft);
  latest.current = draft;
  const tierRef = useRef(tier);
  tierRef.current = tier;

  // Debounced autosave of the whole draft. A new question is created once it has a question text.
  function schedule(next: Draft, delay = 600) {
    setDraft(next);
    if (locked) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; void persist(); }, delay);
  }
  async function persist(): Promise<void> {
    const d = latest.current;
    if (!d.prompt.trim()) return; // the backend refuses an empty question text; the checklist says so
    if (!tierAllows(tierRef.current, kindPlan(d.kind))) return; // a preview of a type this plan does not include
    if (IDENTIFIED_ONLY.includes(d.kind) && anonymity === "anonymous") return;
    const base = qRef.current?.config;
    const config = toConfig(base, d);
    // The server refuses invalid options (000018); the editor shows why and saves once they are valid.
    if (questionConfigProblem(d.kind, config)) return;
    const id = qRef.current?.question_id ?? createdId.current;
    if (!id) {
      // Create exactly once. Edits made while the create is in flight are saved to the new question right after.
      if (creating.current) { dirtyWhileCreating.current = true; return; }
      creating.current = true;
      const r = await save.run(api.questionAdd(campaignId, nextPos, d.kind, d.prompt.trim(), config));
      creating.current = false;
      if (!r.ok) return void toast.error(describeError(r.error));
      createdId.current = r.question_id;
      onCreated(r.question_id);
      if (dirtyWhileCreating.current || latest.current !== d) {
        dirtyWhileCreating.current = false;
        await persist();
        return;
      }
      reload();
      return;
    }
    const r = await save.run(api.questionUpdate(id, { prompt: d.prompt.trim(), kind: d.kind, config }));
    if (!r.ok) toast.error(describeError(r.error));
    else reload();
  }
  useEffect(() => () => { if (timer.current) { window.clearTimeout(timer.current); void persist(); } }, []); // flush on unmount

  function changeKind(kind: QuestionKind) {
    if (kind === draft.kind) return;
    const drops = hasOptions(draft.kind) && !hasOptions(kind) && draft.options.some((o) => o.trim());
    if (drops) return setPendingKind(kind);
    const keepsOptions = hasOptions(kind);
    // Settings belong to a kind: a new kind starts from its own defaults (a quiz carries over between the two choice kinds).
    const quiz = (kind === "single_choice" || kind === "multi_choice") && draft.cfg.quiz ? { quiz: draft.cfg.quiz } : {};
    schedule({ ...draft, kind, options: keepsOptions && draft.options.length === 0 ? ["", ""] : draft.options, max: kind === "multi_choice" ? draft.max : null, cfg: { ...defaultConfig(kind), ...quiz } }, 0);
  }
  const setOption = (i: number, v: string) => schedule({ ...draft, options: draft.options.map((o, j) => (j === i ? v : o)) });
  const moveOption = (from: number, to: number) => {
    if (to < 0 || to >= draft.options.length) return;
    const o = [...draft.options];
    const [x] = o.splice(from, 1);
    o.splice(to, 0, x);
    schedule({ ...draft, options: o }, 300);
  };
  const filled = draft.options.filter((o) => o.trim()).length;
  const optionProblem = hasOptions(draft.kind) && filled >= MIN_OPTIONS ? questionConfigProblem(draft.kind, toConfig(undefined, draft)) : null;
  const settingsProblem = !hasOptions(draft.kind) ? questionConfigProblem(draft.kind, toConfig(undefined, draft)) : null;
  const needs = kindPlan(draft.kind);
  const locksKind = !tierAllows(tier, needs);
  const wrongSurvey = IDENTIFIED_ONLY.includes(draft.kind) && anonymity === "anonymous";
  const previewQ: Question = useMemo(
    () => ({ question_id: q?.question_id ?? "preview", position: n - 1, kind: draft.kind, prompt: draft.prompt, config: toConfig(q?.config, { ...draft, options: draft.options.filter((o) => o.trim()) }) }),
    [draft, q, n],
  );

  const kindExtras = (
    <>
      <KindSettings kind={draft.kind} n={n} cfg={draft.cfg} set={(cfg) => schedule({ ...draft, cfg })} locked={locked} />
      {settingsProblem && !locksKind && <p className="lv-field-error lv-m0" role="status" data-testid="settings-problem">{settingsProblem}</p>}
      {(draft.kind === "single_choice" || draft.kind === "multi_choice") && (
        <QuizSettings kind={draft.kind} n={n} options={draft.options.map((o) => o.trim()).filter(Boolean)} cfg={draft.cfg} locked={locked} allowed={tierAllows(tier, "pro")} set={(cfg) => schedule({ ...draft, cfg })} />
      )}
      {locksKind && (
        <Notice tone="warn" title={`${PLAN_LABEL[needs]} question type: preview only`}>
          <span data-testid="kind-locked">{kindLabel(draft.kind)} is a {PLAN_LABEL[needs]} type. {PLAN_UNLOCK[needs]} You can try it out below; it will not be saved.</span>{" "}
          <Link to="/pricing" className="lv-link">See plans</Link>
        </Notice>
      )}
      {wrongSurvey && !locksKind && (
        <Notice tone="warn" title="Needs an identified survey"><span data-testid="kind-identified">{kindLabel(draft.kind)} collects who someone is, so it only works when the survey is identified. Change who can see answers in the survey details.</span></Notice>
      )}
    </>
  );

  if (pro) {
    const typeGroups: { label: string; kinds: QuestionKind[] }[] = [
      { label: "Choose", kinds: ["single_choice", "multi_choice", "yes_no", "dropdown", "image_choice", "ranking"] },
      { label: "Rate", kinds: ["rating", "face_scale", "nps", "agree_scale", "slider", "agree_grid", "before_after"] },
      { label: "Write and enter", kinds: ["text", "number", "date", "price_ladder"] },
      { label: "People and files", kinds: ["contact", "consent", "signature", "file_upload"] },
    ];
    const promptInvalid = !draft.prompt.trim() && (Boolean(q) || draft.options.some((o) => o.trim()));
    return (
      <div className="lv-qw-edit lv-qw-edit-pro">
        <Card className="lv-canvas" data-testid="canvas">
          <div className="lv-canvas-bar">
            <Eyebrow>Question {String(n).padStart(2, "0")}{q ? "" : " · new"}</Eyebrow>
            <div className="lv-canvas-controls">
              <Select value={draft.kind} onValueChange={(v) => changeKind(v as QuestionKind)} disabled={locked}>
                <SelectTrigger aria-label="Question type" data-testid="type-picker"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {typeGroups.map((g) => (
                    <SelectGroup key={g.label}>
                      <SelectLabel>{g.label}</SelectLabel>
                      {g.kinds.map((k) => <SelectItem key={k} value={k}>{kindLabel(k)}{kindPlan(k) !== "free" && !tierAllows(tier, kindPlan(k)) ? ` · ${PLAN_LABEL[kindPlan(k)]}` : ""}</SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <label className="lv-canvas-req">
                <Switch checked={!draft.optional} disabled={locked} aria-label="Required" onCheckedChange={(on) => schedule({ ...draft, optional: !on }, 0)} />
                <span>{draft.optional ? "Optional" : "Required"}</span>
              </label>
            </div>
          </div>
          <Field
            label="Question"
            htmlFor={`prompt-${n}`}
            counter={{ value: draft.prompt.length, max: 200 }}
            error={promptInvalid ? (q ? "A question needs a question text." : "Type the question text to save this question.") : undefined}
          >
            <Input className="lv-canvas-prompt" id={`prompt-${n}`} value={draft.prompt} maxLength={200} disabled={locked} onChange={(e) => schedule({ ...draft, prompt: e.target.value })} placeholder="Type your question" aria-invalid={promptInvalid || undefined} autoFocus={!q} />
          </Field>

          {hasOptions(draft.kind) && (
            <fieldset className="lv-fieldset" aria-describedby={`opts-${n}-note`}>
              <legend className="lv-legend">Answers</legend>
              <ol className="lv-ans-list" data-testid="option-rows">
                {draft.options.map((o, i) => (
                  <li
                    key={i}
                    draggable={!locked}
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(i)); e.dataTransfer.effectAllowed = "move"; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); moveOption(Number(e.dataTransfer.getData("text/plain")), i); }}
                  >
                    <AnswerTile index={i}>
                      <Input
                        value={o}
                        aria-label={`Option ${i + 1}`}
                        maxLength={80}
                        disabled={locked}
                        aria-invalid={!o.trim() || undefined}
                        onChange={(e) => setOption(i, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); moveOption(i, i - 1); }
                          if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); moveOption(i, i + 1); }
                        }}
                        placeholder={`Answer ${i + 1}`}
                      />
                      {!locked && (
                        <span className="lv-option-tools">
                          <Button variant="quiet" size="icon-sm" aria-label={`Move option ${i + 1} up`} disabled={i === 0} onClick={() => moveOption(i, i - 1)}><Icon name="chevron" size={14} className="lv-rot180" /></Button>
                          <Button variant="quiet" size="icon-sm" aria-label={`Move option ${i + 1} down`} disabled={i === draft.options.length - 1} onClick={() => moveOption(i, i + 1)}><Icon name="chevron" size={14} /></Button>
                          <Button variant="quiet" size="icon-sm" aria-label={`Remove option ${i + 1}`} onClick={() => schedule({ ...draft, options: draft.options.filter((_, j) => j !== i) }, 300)}>✕</Button>
                        </span>
                      )}
                    </AnswerTile>
                  </li>
                ))}
              </ol>
              {!locked && (
                <div className="lv-btn-row">
                  <Button variant="secondary" size="sm" disabled={draft.options.length >= MAX_OPTIONS} onClick={() => schedule({ ...draft, options: [...draft.options, ""] }, 600)} data-testid="add-option">
                    <Icon name="plus" size={14} />Add more answers
                  </Button>
                </div>
              )}
              <p id={`opts-${n}-note`} className={filled < MIN_OPTIONS ? "lv-field-error lv-m0" : "ui-help lv-m0"} role={filled < MIN_OPTIONS ? "status" : undefined}>
                {filled < MIN_OPTIONS ? "Add at least two answers." : `${filled} answers · up to ${MAX_OPTIONS}. Reorder by dragging, or Alt with the arrow keys.`}
              </p>
              {optionProblem && <p className="lv-field-error lv-m0" role="status" data-testid="option-problem">{optionProblem}</p>}
              {(filled < MIN_OPTIONS || optionProblem) && !locked && <p className="ui-help lv-m0">Changes to this question save once the answers are valid.</p>}
            </fieldset>
          )}

          {draft.kind === "multi_choice" && (
            <Field label="Most choices a person can pick" htmlFor={`max-${n}`}>
              <Select value={draft.max === null ? "any" : String(draft.max)} onValueChange={(v) => schedule({ ...draft, max: v === "any" ? null : Number(v) }, 0)} disabled={locked}>
                <SelectTrigger id={`max-${n}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any number</SelectItem>
                  {Array.from({ length: Math.max(0, filled - 1) }, (_, i) => i + 1).map((k) => <SelectItem key={k} value={String(k)}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          )}

          {draft.kind === "yes_no" && (
            <div className="lv-ans-list lv-ans-list-fixed" aria-label="Answers people pick from">
              <AnswerTile index={0}><span>Yes</span></AnswerTile>
              <AnswerTile index={1}><span>No</span></AnswerTile>
            </div>
          )}
          {draft.kind === "rating" && (
            <div className="lv-ans-list lv-ans-list-fixed lv-ans-list-rating" aria-label="Answers people pick from">
              {[1, 2, 3, 4, 5].map((k, i) => <AnswerTile key={k} index={i}><span>{k} ★</span></AnswerTile>)}
            </div>
          )}
          {draft.kind === "text" && (
            <>
              <div className="lv-canvas-textbox" aria-hidden="true">People type their answer here.</div>
              <Notice tone="warn">{TEXT_WARNING}</Notice>
            </>
          )}

          {kindExtras}
          {!CORE_KINDS.includes(draft.kind as never) && (
            <div className="lv-canvas-live" data-testid="kind-preview">
              <Eyebrow>What people see</Eyebrow>
              <QuestionInput q={previewQ} value={preview} onChange={setPreview} />
            </div>
          )}

          {!locked && q && (
            <div className="lv-btn-row">
              <RemoveQuestion n={n} onRemove={async () => { const r = await save.run(api.questionRemove(q.question_id)); if (r.ok) { toast.success("Question removed"); reload(); } else toast.error(describeError(r.error)); }} />
            </div>
          )}
        </Card>

        <AlertDialog open={pendingKind !== null} onOpenChange={(o) => !o && setPendingKind(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Change to {pendingKind ? kindLabel(pendingKind) : ""}?</AlertDialogTitle>
              <AlertDialogDescription>That type has no options, so the {filled} {filled === 1 ? "option" : "options"} on this question will be removed.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep {kindLabel(draft.kind)}</AlertDialogCancel>
              <AlertDialogAction onClick={() => { if (pendingKind) schedule({ ...draft, kind: pendingKind, options: [], max: null, cfg: defaultConfig(pendingKind) }, 0); setPendingKind(null); }}>Change type</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="lv-qw-edit">
      <Card>
        <div className="ui-spread">
          <Eyebrow>Question {String(n).padStart(2, "0")}{q ? "" : " · new"}</Eyebrow>
          <Badge variant={draft.optional ? "neutral" : "ink"}>{draft.optional ? "Optional" : "Required"}</Badge>
        </div>
        <Field label="Type" htmlFor={`kind-${n}`}>
          <Select value={draft.kind} onValueChange={(v) => changeKind(v as QuestionKind)} disabled={locked}>
            <SelectTrigger id={`kind-${n}`}><SelectValue /></SelectTrigger>
            <SelectContent>{KINDS.map((k) => <SelectItem key={k.key} value={k.key}>{k.label}{k.plan !== "free" && !tierAllows(tier, k.plan) ? ` · ${PLAN_LABEL[k.plan]}` : ""}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        {/* A new question saves only once it has question text. Say so on the field as soon as anything else has been
            filled in (founder bug report: options were typed, the example placeholder looked like a question, and nothing
            saved). The placeholder no longer reads like a real question. */}
        <Field
          label="Question"
          htmlFor={`prompt-${n}`}
          counter={{ value: draft.prompt.length, max: 200 }}
          error={
            !draft.prompt.trim() && (q || draft.options.some((o) => o.trim()))
              ? q ? "A question needs a question text." : "Type the question text to save this question."
              : undefined
          }
        >
          <Input id={`prompt-${n}`} value={draft.prompt} maxLength={200} disabled={locked} onChange={(e) => schedule({ ...draft, prompt: e.target.value })} placeholder="Type your question" aria-invalid={!draft.prompt.trim() && (Boolean(q) || draft.options.some((o) => o.trim())) || undefined} aria-describedby={`prompt-${n}-help`} autoFocus={!q} />
        </Field>

        {hasOptions(draft.kind) && (
          <fieldset className="lv-fieldset" aria-describedby={`opts-${n}-note`}>
            <legend className="lv-legend">Options</legend>
            <ol className="lv-options-edit" data-testid="option-rows">
              {draft.options.map((o, i) => (
                <li
                  key={i}
                  draggable={!locked}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(i)); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); moveOption(Number(e.dataTransfer.getData("text/plain")), i); }}
                >
                  {!locked && <span className="lv-drag" aria-hidden="true">⋮⋮</span>}
                  <Input
                    value={o}
                    aria-label={`Option ${i + 1}`}
                    maxLength={80}
                    disabled={locked}
                    aria-invalid={!o.trim() || undefined}
                    onChange={(e) => setOption(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); moveOption(i, i - 1); }
                      if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); moveOption(i, i + 1); }
                    }}
                    placeholder={`Option ${i + 1}`}
                  />
                  {!locked && (
                    <span className="lv-option-tools">
                      <Button variant="quiet" size="icon-sm" aria-label={`Move option ${i + 1} up`} disabled={i === 0} onClick={() => moveOption(i, i - 1)}><Icon name="chevron" size={14} className="lv-rot180" /></Button>
                      <Button variant="quiet" size="icon-sm" aria-label={`Move option ${i + 1} down`} disabled={i === draft.options.length - 1} onClick={() => moveOption(i, i + 1)}><Icon name="chevron" size={14} /></Button>
                      <Button variant="quiet" size="icon-sm" aria-label={`Remove option ${i + 1}`} onClick={() => schedule({ ...draft, options: draft.options.filter((_, j) => j !== i) }, 300)}>✕</Button>
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {!locked && (
              <div className="ui-row">
                <Button variant="secondary" size="sm" disabled={draft.options.length >= MAX_OPTIONS} onClick={() => schedule({ ...draft, options: [...draft.options, ""] }, 600)} data-testid="add-option">
                  <Icon name="plus" size={14} />Add option
                </Button>
              </div>
            )}
            <p id={`opts-${n}-note`} className={filled < MIN_OPTIONS ? "lv-field-error lv-m0" : "ui-help lv-m0"} role={filled < MIN_OPTIONS ? "status" : undefined}>
              {filled < MIN_OPTIONS ? "Add at least two options." : `${filled} options · up to ${MAX_OPTIONS}. Reorder by dragging, or Alt with the arrow keys.`}
            </p>
            {optionProblem && <p className="lv-field-error lv-m0" role="status" data-testid="option-problem">{optionProblem}</p>}
            {(filled < MIN_OPTIONS || optionProblem) && !locked && <p className="ui-help lv-m0">Changes to this question save once the options are valid.</p>}
          </fieldset>
        )}

        {draft.kind === "multi_choice" && (
          <Field label="Most choices a person can pick" htmlFor={`max-${n}`}>
            <Select value={draft.max === null ? "any" : String(draft.max)} onValueChange={(v) => schedule({ ...draft, max: v === "any" ? null : Number(v) }, 0)} disabled={locked}>
              <SelectTrigger id={`max-${n}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any number</SelectItem>
                {Array.from({ length: Math.max(0, filled - 1) }, (_, i) => i + 1).map((k) => <SelectItem key={k} value={String(k)}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        )}

        {draft.kind === "text" && <Notice tone="warn">{TEXT_WARNING}</Notice>}

        {kindExtras}

        <ToggleRow
          title="Required"
          description={draft.optional ? "People can skip this question." : "People must answer this question to submit."}
          control={<Switch checked={!draft.optional} disabled={locked} aria-label="Required" onCheckedChange={(on) => schedule({ ...draft, optional: !on }, 0)} />}
        />

        {!locked && q && (
          <div className="ui-row">
            <RemoveQuestion n={n} onRemove={async () => { const r = await save.run(api.questionRemove(q.question_id)); if (r.ok) { toast.success("Question removed"); reload(); } else toast.error(describeError(r.error)); }} />
          </div>
        )}
      </Card>

      <Card variant="well" className="lv-qw-preview" aria-label="Respondent preview">
        <Eyebrow>What people see</Eyebrow>
        <h2 className="lv-q-title lv-q-title-preview">{draft.prompt || "Your question"}</h2>
        <QuestionInput q={previewQ} value={preview} onChange={setPreview} />
        <p className="ui-help lv-m0">{draft.optional ? "Optional: people can skip it." : "Required: people answer it to submit."}</p>
      </Card>

      <AlertDialog open={pendingKind !== null} onOpenChange={(o) => !o && setPendingKind(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change to {pendingKind ? kindLabel(pendingKind) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>That type has no options, so the {filled} {filled === 1 ? "option" : "options"} on this question will be removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep {kindLabel(draft.kind)}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingKind) schedule({ ...draft, kind: pendingKind, options: [], max: null, cfg: defaultConfig(pendingKind) }, 0); setPendingKind(null); }}>Change type</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RemoveQuestion({ n, onRemove }: { n: number; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button variant="quiet" onClick={() => setOpen(true)}>Remove question</Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove question {n}?</AlertDialogTitle>
          <AlertDialogDescription>It’s a draft, so nobody has answered it yet.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onRemove}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
