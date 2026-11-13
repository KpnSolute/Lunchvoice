import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ANON_MIN_ANSWERS } from "../config/privacy";
import { rulesProblem } from "../lib/sections";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { describeError, describeGate } from "../lib/errors";
import type { Anonymity, CampaignDetailData, GuestNamesMode, QuestionKind, CampaignInvite, CampaignMode, LvResult, Question } from "../lib/lvApi";
import { readiness, type ReadinessIssue, type StudioSection } from "../lib/readiness";
import { Icon } from "../components/Icon";
import { campaignPhase, LinkButton } from "../components/ui";
import { QuestionInput } from "../ui/QuestionControls";
import { kindLabel, QuestionWorkbench, type SaveTracker } from "./QuestionWorkbench";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Textarea } from "@/components/shadcn/textarea";
import { Checkbox } from "@/components/shadcn/checkbox";
import { Switch } from "@/components/shadcn/switch";
import { RadioCard, RadioGroup } from "@/components/shadcn/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/shadcn/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/shadcn/alert-dialog";
import { CopyField, Eyebrow, Field, LoadingRows, Notice, PhaseBadge, QuotaMeter, Segmented, ToggleRow } from "@/components/shadcn/blocks";
import { QrCode } from "@/components/shadcn/blocks/qr";

/**
 * Campaign Studio: Details | Questions | Audience | Schedule | Review, freely navigable. Every field maps to a real
 * lv_api field (lv_campaign_update: title, mode, anonymity, opens_at/closes_at; lv_campaign_set_participation:
 * audience; questions). Changes autosave in the draft with a visible save state. Publishing is gated by the readiness
 * checklist and re-validated by the server.
 */

export { KINDS } from "./QuestionWorkbench";
const KIND_KEYS = ["rating", "single_choice", "multi_choice", "yes_no", "text"];

/* ------------------------------------------------------------------ save state */

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Counts in-flight saves: "Saving…" while any runs, then "Draft saved" or "Error saving". */
export function useSaveState(): SaveTracker & { status: SaveStatus; error: string | null } {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(0);
  const failed = useRef(false);
  const run = useCallback(async <T extends LvResult<object>>(p: Promise<T>): Promise<T> => {
    inflight.current++;
    setStatus("saving");
    const r = await p;
    inflight.current--;
    if (!r.ok) { failed.current = true; setError(describeError(r.error)); }
    if (inflight.current === 0) {
      setStatus(failed.current ? "error" : "saved");
      if (!failed.current) setError(null);
      failed.current = false;
    }
    return r;
  }, []);
  return { run, status, error };
}

/** What a Campaign's status allows (000027). A paused Campaign can be edited: title, description and schedule always,
 *  mode, anonymity and questions only until the first answer (they would change what existing answers mean). */
export function editRules(d: CampaignDetailData) {
  const draft = d.campaign.status === "draft";
  const paused = d.campaign.status === "paused";
  return { draft, paused, edit: draft || paused, meaning: draft || (paused && !d.campaign.has_responses) };
}

export function SaveIndicator({ status, error, paused = false }: { status: SaveStatus; error: string | null; paused?: boolean }) {
  const text = status === "saving" ? "Saving…" : status === "saved" ? (paused ? "Saved" : "Draft saved") : status === "error" ? "Error saving" : "All changes save automatically";
  return (
    <span className="lv-save" data-status={status} role="status" aria-live="polite" title={error ?? undefined} data-testid="save-state">
      <span className="lv-save-dot" aria-hidden="true" />
      {text}
      {status === "error" && error && <span className="sr-only">: {error}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ schedule model */

export interface ScheduleState {
  start: { mode: "now" } | { mode: "at"; at: string | null };
  end: { mode: "none" } | { mode: "at"; at: string | null };
}
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
function scheduleOf(d: CampaignDetailData): ScheduleState {
  return {
    start: d.campaign.opens_at ? { mode: "at", at: d.campaign.opens_at } : { mode: "now" },
    end: d.campaign.closes_at ? { mode: "at", at: d.campaign.closes_at } : { mode: "none" },
  };
}
export const startsLater = (s: ScheduleState) => s.start.mode === "at" && !!s.start.at && new Date(s.start.at).getTime() > Date.now();

/** Gate reasons from lv_campaign_get that are not already covered by the local checklist. */
export function gateMessages(d: CampaignDetailData): { key: string; message: string }[] {
  const skip = new Set(["no_questions", "not_draft", "already_closed", "too_many_questions"]);
  const reasons = (d.gate?.reasons ?? []).filter((r) => !skip.has(r));
  const out = reasons.map((r, i) => ({ key: r, message: describeGate([r])[0] ?? r, i }));
  if (d.gate?.limit !== undefined && d.gate.used !== undefined && out.length)
    out[0] = { ...out[0], message: `${out[0].message} (${d.gate.used} of ${d.gate.limit} in use.)` };
  return out.map(({ key, message }) => ({ key, message }));
}

export function useReadiness(d: CampaignDetailData | null, title: string, schedule: ScheduleState, questionLimit: number | null): ReadinessIssue[] {
  return useMemo(
    () => (d ? readiness({ title, questions: d.questions, start: schedule.start, end: schedule.end, questionLimit, gateMessages: gateMessages(d), sectionProblem: rulesProblem(d.questions) }) : []),
    [d, title, schedule, questionLimit],
  );
}

/* ------------------------------------------------------------------ the Studio */

const SECTIONS: { key: StudioSection; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "questions", label: "Questions" },
  { key: "audience", label: "Audience" },
  { key: "schedule", label: "Schedule" },
  { key: "review", label: "Review" },
];

export function StudioView({ campaignId, backTo, crumb, resultsTo, hubId, hubName }: { campaignId: string; backTo: string; crumb: string; resultsTo: string; hubId: string; hubName: string }) {
  const { api } = useIdentity();
  const detail = useLv(() => api.campaignGet(campaignId), [api, campaignId]);
  const save = useSaveState();
  // Quick-create (NewCampaign) can open the Studio on a section with a starting question type, e.g. a poll opens on
  // Questions with a single-choice question ready to type.
  const [params] = useSearchParams();
  const startSection = params.get("section");
  const startKind = params.get("new");
  const [section, setSection] = useState<StudioSection>(
    startSection && ["details", "questions", "audience", "schedule", "review"].includes(startSection) ? (startSection as StudioSection) : "details",
  );
  const [title, setTitle] = useState<string | null>(null);
  const [sched, setSched] = useState<ScheduleState | null>(null);
  const d = detail.data;

  useEffect(() => { if (d && title === null) setTitle(d.campaign.title); }, [d, title]);
  useEffect(() => { if (d && sched === null) setSched(scheduleOf(d)); }, [d, sched]);
  const schedule = sched ?? { start: { mode: "now" }, end: { mode: "none" } };
  const issues = useReadiness(d ?? null, title ?? d?.campaign.title ?? "", schedule, null);

  if (detail.loading && !d) return <LoadingRows rows={4} label="Loading the Studio" />;
  if (detail.error && !d) return <Notice tone="error">{describeError(detail.error)}</Notice>;
  if (!d) return null;

  const { draft, meaning } = editRules(d);
  const bySection = (s: StudioSection) => issues.filter((i) => i.section === s).length;

  return (
    <div className="lv-studio2" data-testid="studio">
      <StudioHeader
        d={d}
        title={title ?? d.campaign.title}
        backTo={backTo}
        crumb={crumb}
        resultsTo={resultsTo}
        save={save}
        issues={issues}
        schedule={schedule}
        onChanged={detail.reload}
        onShowReview={() => setSection("review")}
      />

      <Tabs value={section} onValueChange={(v) => setSection(v as StudioSection)} className="lv-studio-tabs">
        <TabsList aria-label="Studio sections" data-testid="studio-sections">
          {SECTIONS.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>
              {s.label}
              {draft && s.key !== "review" && bySection(s.key) > 0 && (
                <span className="lv-tab-flag" aria-label={`${bySection(s.key)} to fix`}>{bySection(s.key)}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="details">
          <DetailsSection d={d} title={title ?? ""} setTitle={setTitle} save={save} reload={detail.reload} />
        </TabsContent>
        {/* forceMount: the workbench stays mounted (hidden) on other tabs, so a new question that is not saved yet
            (for example while its options are still invalid) is not lost by switching sections. */}
        <TabsContent value="questions" forceMount className="data-[state=inactive]:hidden">
          <QuestionWorkbench d={d} locked={!meaning} limit={null} save={save} reload={detail.reload} initialKind={startKind && KIND_KEYS.includes(startKind) ? (startKind as QuestionKind) : undefined} />
        </TabsContent>
        <TabsContent value="audience">
          <div className="lv-sections-2">
            <WhoCanParticipate hubName={hubName} d={d} save={save} reload={detail.reload} />
            <IdentityGroup d={d} save={save} reload={detail.reload} />
            <GuestsGroup d={d} save={save} reload={detail.reload} />
          </div>
        </TabsContent>
        <TabsContent value="schedule">
          <ScheduleSection d={d} schedule={schedule} setSchedule={setSched} save={save} reload={detail.reload} entitlement={<HubEntitlement hubId={hubId} d={d} />} />
        </TabsContent>
        <TabsContent value="review">
          <ReviewSection d={d} title={title ?? d.campaign.title} schedule={schedule} issues={issues} goTo={setSection} audienceLabel={audienceLabel(d, hubName)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ header */

export function StudioHeader({
  d,
  title,
  backTo,
  crumb,
  resultsTo,
  save,
  issues,
  schedule,
  onChanged,
  onShowReview,
  quick,
}: {
  d: CampaignDetailData;
  title: string;
  backTo: string;
  crumb: string;
  resultsTo: string;
  save: ReturnType<typeof useSaveState>;
  issues: ReadinessIssue[];
  schedule: ScheduleState;
  onChanged: () => void;
  onShowReview?: () => void;
  quick?: boolean;
}) {
  const phase = campaignPhase(d.campaign);
  return (
    <header className="lv-studio-head">
      <Button asChild variant="secondary" size="icon" aria-label="Back">
        <Link to={backTo}><Icon name="back" size={18} /></Link>
      </Button>
      <div className="lv-studio-title">
        <span className="lv-row-sub">{crumb}</span>
        <h1 data-testid="studio-title">{title || "Untitled"}</h1>
        <div className="ui-row"><PhaseBadge phase={phase} />{editRules(d).edit && <SaveIndicator status={save.status} error={save.error} paused={d.campaign.status === "paused"} />}</div>
      </div>
      <div className="lv-studio-actions">
        <PreviewButton d={d} title={title} />
        {/* The Quick Survey flow publishes from its own Publish step; its header carries lifecycle actions afterwards. */}
        {!(quick && d.campaign.status === "draft") && <LifecycleActions d={d} issues={issues} schedule={schedule} onChanged={onChanged} onShowReview={onShowReview} quick={quick} />}
        {d.campaign.status !== "draft" && <LinkButton to={resultsTo} variant="secondary" icon="voice">Results</LinkButton>}
      </div>
      {d.campaign.status === "draft" && <BlockerSummary issues={issues} />}
    </header>
  );
}

/** Screen-reader text that the disabled publish button points at with aria-describedby. */
function BlockerSummary({ issues }: { issues: ReadinessIssue[] }) {
  return (
    <p id="publish-blockers" className="sr-only">
      {issues.length ? `Can’t publish yet. ${issues.length === 1 ? "One thing" : `${issues.length} things`} to fix: ${issues.map((i) => i.message).join(" ")}` : "Ready to publish."}
    </p>
  );
}

/* ------------------------------------------------------------------ lifecycle */

export function LifecycleActions({
  d,
  issues,
  schedule,
  onChanged,
  onShowReview,
  quick,
}: {
  d: CampaignDetailData;
  issues: ReadinessIssue[];
  schedule: ScheduleState;
  onChanged: () => void;
  onShowReview?: () => void;
  quick?: boolean;
}) {
  const { api } = useIdentity();
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const id = d.campaign.campaign_id;
  const status = d.campaign.status;

  async function act(fn: () => Promise<LvResult<object>>, done: string) {
    if (busy) return;
    setBusy(true);
    setServerError(null);
    const r = await fn();
    setBusy(false);
    if (r.ok) { toast.success(done); onChanged(); return; }
    const msg = describeError(r.error);
    setServerError(msg);
    toast.error(msg);
  }

  if (status === "draft") {
    const later = startsLater(schedule);
    const opens = schedule.start.mode === "at" ? schedule.start.at : null;
    const closes = schedule.end.mode === "at" ? schedule.end.at : null;
    const blocked = issues.length > 0;
    return (
      <>
        <Button
          variant="primary"
          disabled={blocked || busy}
          aria-describedby="publish-blockers"
          data-testid="publish"
          onClick={() => act(() => (opens || closes ? api.schedule(id, opens, closes) : api.campaignActivate(id)), later ? "Scheduled" : "Published")}
        >
          {busy ? (later ? "Scheduling…" : "Publishing…") : later ? "Schedule" : "Publish"}
        </Button>
        {blocked && onShowReview && <Button variant="quiet" size="sm" onClick={onShowReview}>{issues.length} to fix</Button>}
        {serverError && <p className="lv-field-error lv-m0 lv-wide" role="alert">{serverError}</p>}
      </>
    );
  }
  const live = status === "active";
  return (
    <>
      {live && <Button variant="secondary" disabled={busy} onClick={() => act(() => api.campaignPause(id), "Paused")}>Pause</Button>}
      {status === "paused" && <Button variant="ink" disabled={busy} onClick={() => act(() => api.campaignResume(id), "Resumed")}>Resume</Button>}
      {(live || status === "paused") && (
        <ConfirmAction
          trigger={<Button variant="secondary" disabled={busy}>Close</Button>}
          title={quick ? "Close this survey?" : "Close this Campaign?"}
          body={`Nobody can answer after it closes. Results stay. Anonymous results become visible once it’s closed, for questions with at least ${ANON_MIN_ANSWERS} answers.`}
          action="Close"
          onConfirm={() => act(() => api.campaignClose(id), "Closed")}
        />
      )}
      {quick && (live || status === "paused") && (
        <ConfirmAction
          trigger={<Button variant="quiet" disabled={busy}>Archive</Button>}
          title="Close and archive this survey?"
          body="Nobody can answer after this. It leaves your list and frees one of your active Quick Survey slots. Results are kept."
          action="Close and archive"
          onConfirm={() => act(async () => { const c = await api.campaignClose(id); return c.ok ? api.campaignArchive(id) : c; }, "Archived. One slot is free again.")}
        />
      )}
      {status === "closed" && (
        <ConfirmAction
          trigger={<Button variant="quiet" disabled={busy}>Archive</Button>}
          title={quick ? "Archive this survey?" : "Archive this Campaign?"}
          body="It leaves your lists. Its results are kept."
          action="Archive"
          onConfirm={() => act(() => api.campaignArchive(id), "Archived")}
        />
      )}
      {serverError && <p className="lv-field-error lv-m0 lv-wide" role="alert">{serverError}</p>}
    </>
  );
}

/* ------------------------------------------------------------------ preview (never submits) */

export function PreviewButton({ d, title }: { d: CampaignDetailData; title: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="secondary" data-testid="preview">Preview</Button></DialogTrigger>
      <DialogContent className="lv-preview-dialog">
        <DialogHeader>
          <DialogTitle>Preview: {title || "Untitled"}</DialogTitle>
          <DialogDescription>This is what respondents see. Nothing you pick here is sent.</DialogDescription>
        </DialogHeader>
        <PreviewRunner questions={d.questions} anonymous={d.campaign.anonymity === "anonymous"} />
      </DialogContent>
    </Dialog>
  );
}

function PreviewRunner({ questions, anonymous }: { questions: Question[]; anonymous: boolean }) {
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  if (questions.length === 0) return <Notice>Add a question to preview it.</Notice>;
  if (step === -1)
    return (
      <div className="lv-stack-16">
        <p className="lv-m0">{questions.length} {questions.length === 1 ? "question" : "questions"} · {anonymous ? "Anonymous: answers aren’t linked to names." : "Identified: the creator sees who answered."}</p>
        <div className="ui-row"><Button variant="primary" onClick={() => setStep(0)}>Start preview</Button></div>
      </div>
    );
  if (step >= questions.length)
    return (
      <div className="lv-stack-16">
        <Notice tone="ok" title="Preview finished">Nothing was sent. Respondents would see a thank-you screen here.</Notice>
        <div className="ui-row"><Button variant="secondary" onClick={() => { setAnswers({}); setStep(-1); }}>Start again</Button></div>
      </div>
    );
  const q = questions[step];
  const v = answers[q.question_id];
  const answered = v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);
  return (
    <div className="lv-stack-16">
      <span className="lv-row-sub">{step + 1} / {questions.length} · {q.config.optional ? "Optional" : "Required"}</span>
      <h3 className="lv-q-title lv-q-title-preview">{q.prompt}</h3>
      <QuestionInput q={q} value={v} onChange={(x) => setAnswers((a) => ({ ...a, [q.question_id]: x }))} />
      <div className="ui-row">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
        <Button variant="ink" disabled={!answered && !q.config.optional} onClick={() => setStep((s) => s + 1)}>{step === questions.length - 1 ? "Finish" : "Next"}</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sections */

const MODES: { key: CampaignMode; label: string; body: string }[] = [
  { key: "survey", label: "Survey", body: "Several questions, one screen at a time. Counts toward the plan’s active-survey limit." },
  { key: "poll", label: "Poll", body: "One quick choice question." },
  { key: "rating", label: "Rating", body: "A score from 1 to 5." },
  { key: "feedback", label: "Feedback", body: "An open answer." },
];

function DetailsSection({ d, title, setTitle, save, reload }: { d: CampaignDetailData; title: string; setTitle: (t: string) => void; save: SaveTracker; reload: () => void }) {
  const { api } = useIdentity();
  const { draft, paused, edit, meaning } = editRules(d);
  const timer = useRef<number | null>(null);
  function onTitle(v: string) {
    setTitle(v);
    if (timer.current) window.clearTimeout(timer.current);
    if (!v.trim()) return;
    timer.current = window.setTimeout(async () => {
      const r = await save.run(api.campaignUpdate(d.campaign.campaign_id, { title: v.trim() }));
      if (r.ok) reload();
    }, 600);
  }
  return (
    <Card>
      <h2 className="lv-share-h">Details</h2>
      {paused && <Notice>{meaning
        ? "Paused: you can edit everything here. Changes apply when you resume. Mode, anonymity and questions lock once the first answer comes in."
        : "Paused: you can edit the title, description and schedule. Mode, anonymity and questions are locked because people have already answered; changing them would change what those answers mean."}</Notice>}
      {!draft && !paused && <Notice>Published details can’t change. Each published version stays exactly as respondents saw it.</Notice>}
      <Field label="Title" htmlFor="studio-title-input" counter={{ value: title.length, max: 120 }} error={edit && !title.trim() ? "Add a title." : undefined}>
        <Input id="studio-title-input" value={title} maxLength={120} disabled={!edit} onChange={(e) => onTitle(e.target.value)} aria-describedby="studio-title-input-help" />
      </Field>
      <DescriptionField d={d} save={save} reload={reload} />
      <fieldset className="lv-fieldset">
        <legend className="lv-legend">Mode</legend>
        <RadioGroup
          value={d.campaign.mode}
          disabled={!meaning}
          aria-label="Mode"
          className="ui-grid-2"
          onValueChange={async (v) => { const r = await save.run(api.campaignUpdate(d.campaign.campaign_id, { mode: v as CampaignMode })); if (r.ok) reload(); }}
        >
          {MODES.map((m) => <RadioCard key={m.key} value={m.key} title={m.label} description={m.body} />)}
        </RadioGroup>
      </fieldset>
    </Card>
  );
}

/** Who among the Hub's members can answer: everyone, or (Team plan, 000018) members holding chosen roles. */
function WhoCanParticipate({ hubName, d, save, reload }: { hubName: string; d: CampaignDetailData; save: SaveTracker; reload: () => void }) {
  const { api } = useIdentity();
  const draft = d.campaign.status === "draft";
  const aud = d.audience;
  const [scope, setScope] = useState<"all_members" | "roles">(aud?.scope ?? "all_members");
  const [picked, setPicked] = useState<string[]>(() => aud?.roles.map((r) => r.role_id) ?? []);
  useEffect(() => { setScope(aud?.scope ?? "all_members"); setPicked(aud?.roles.map((r) => r.role_id) ?? []); }, [aud?.scope, aud?.roles]);
  // "Specific roles" is offered only when the plan allows it (or a draft already uses it, so it can be undone).
  const offered = Boolean(aud && (aud.role_targeting || aud.scope === "roles"));
  // FB-01 (000022): role targeting is for identified Campaigns only; the server refuses it on anonymous ones.
  const anonymous = d.campaign.anonymity === "anonymous";
  async function persist(nextScope: "all_members" | "roles", nextRoles: string[]) {
    setScope(nextScope);
    setPicked(nextRoles);
    if (nextScope === "roles" && nextRoles.length === 0) return; // nothing to save until a role is picked
    const r = await save.run(api.campaignSetAudienceRoles(d.campaign.campaign_id, nextScope === "roles" ? nextRoles : null));
    if (r.ok) reload(); else toast.error(describeError(r.error));
  }
  return (
    <Card data-testid="audience-who">
      <h2 className="lv-share-h" id="audience-who-h">Who can participate?</h2>
      {offered ? (
        <>
          <RadioGroup
            value={scope}
            disabled={!draft}
            aria-labelledby="audience-who-h"
            className="ui-grid-2"
            onValueChange={(v) => void persist(v as "all_members" | "roles", v === "roles" ? picked : [])}
          >
            <RadioCard value="all_members" title={`All members of ${hubName}`} description="Every accepted member can answer." />
            <RadioCard
              value="roles"
              title="Specific roles"
              disabled={anonymous && scope !== "roles"}
              description={anonymous
                ? "Only for identified Campaigns. An anonymous Campaign goes to all members, so no answer can be traced to one person."
                : "Only members holding one of the roles you pick. Only they count toward participation."}
            />
          </RadioGroup>
          {scope === "roles" && (
            <fieldset className="lv-fieldset" data-testid="audience-roles">
              <legend className="lv-legend">Roles</legend>
              {(aud?.available_roles ?? []).map((r) => (
                <label key={r.role_id} className="ui-row">
                  <Checkbox
                    checked={picked.includes(r.role_id)}
                    disabled={!draft}
                    onCheckedChange={(on) => void persist("roles", on ? [...picked, r.role_id] : picked.filter((x) => x !== r.role_id))}
                    aria-label={r.name}
                  />
                  <span>{r.name}</span>
                </label>
              ))}
              {picked.length === 0 && <p className="lv-field-error lv-m0" role="status">Pick at least one role.</p>}
              {aud && !aud.role_targeting && <p className="ui-help lv-m0">This Hub’s plan no longer includes role targeting. Switch back to all members to publish.</p>}
            </fieldset>
          )}
        </>
      ) : (
        <div className="lv-fact" role="group" aria-label="Participants">
          <Icon name="roster" size={20} />
          <div>
            <strong>Members of {hubName}</strong>
            <p className="ui-muted lv-m0">Every accepted member can answer. Choosing members by role comes with the Team plan.</p>
          </div>
        </div>
      )}
      <p className="ui-help lv-m0">Guests are separate: turn guest responses on below. Roles never limit guests.</p>
    </Card>
  );
}

export function IdentityGroup({ d, save, reload }: { d: CampaignDetailData; save: SaveTracker; reload: () => void }) {
  const { api } = useIdentity();
  const { draft, paused, meaning } = editRules(d);
  // Optimistic: show the choice at once; roll back if the server refuses.
  const namesOn = (d.campaign.guest_names ?? "off") !== "off";
  const [value, setValue] = useState<Anonymity>(d.campaign.anonymity);
  useEffect(() => setValue(d.campaign.anonymity), [d.campaign.anonymity]);
  return (
    <Card data-testid="audience-identity">
      <h2 className="lv-share-h" id="identity-h">How are responses recorded?</h2>
      <RadioGroup
        value={value}
        disabled={!meaning}
        aria-labelledby="identity-h"
        className="ui-grid-2"
        onValueChange={async (v) => {
          setValue(v as Anonymity);
          const r = await save.run(api.campaignUpdate(d.campaign.campaign_id, { anonymity: v as Anonymity }));
          if (r.ok) reload(); else setValue(d.campaign.anonymity);
        }}
      >
        <RadioCard
          value="anonymous"
          title="Anonymous"
          disabled={(d.audience?.scope === "roles" || namesOn) && value !== "anonymous"}
          description={namesOn
            ? "Not while guests give a name: turn guest names off first, so no answer can be traced to a typed name."
            : d.audience?.scope === "roles"
            ? "Not with specific roles: switch Who can participate back to all members first, so no answer can be traced to one person."
            : "You see totals only. Nobody, including you, can link an answer to a person. Small groups are withheld."}
        />
        <RadioCard value="identified" title="Identified" description="You can see who answered and what they said. People are told before they start." />
      </RadioGroup>
      <p className="ui-help lv-m0">{draft ? "You can change this until you publish." : paused && meaning ? "You can change this while paused, until the first answer comes in." : "Locked: respondents were promised this when they answered."}</p>
    </Card>
  );
}

export function GuestsGroup({ d, save, reload }: { d: CampaignDetailData; save: SaveTracker; reload: () => void }) {
  const { api } = useIdentity();
  const { draft, meaning } = editRules(d);
  const names: GuestNamesMode = d.campaign.guest_names ?? "off";
  const identified = d.campaign.anonymity === "identified";
  const invite = d.campaign.access === "invite";
  const on = d.campaign.audience === "members_and_guests";
  return (
    <Card data-testid="audience-guests">
      <ToggleRow
        title="Allow guest responses"
        description={d.campaign.access
          ? "People without an account may answer from the link or code. Guests never count as members."
          : "People without an account may respond when the Campaign’s access mode allows it. Guests never become Hub members."}
        control={
          <Switch
            aria-label="Allow guest responses"
            checked={on && !invite}
            disabled={!draft || invite}
            onCheckedChange={async (v) => { const r = await save.run(api.setParticipation(d.campaign.campaign_id, v ? "members_and_guests" : "members")); if (r.ok) reload(); }}
          />
        }
      />
      {invite && <p className="ui-help lv-m0">This survey is invite only, so everyone signs in. Guests can’t respond.</p>}
      {!invite && on && <p className="ui-help lv-m0">Guests answer through the link, QR or join code. Results label their answers as unverified.</p>}
      {on && !invite && (
        <div className="lv-stack-8" data-testid="guest-names">
          <h3 className="lv-qw-h" id="guest-names-h">Ask guests for a name</h3>
          {identified ? (
            <>
              <RadioGroup
                value={names}
                disabled={!meaning}
                aria-labelledby="guest-names-h"
                className="ui-grid-2"
                onValueChange={async (v) => { const r = await save.run(api.campaignSetGuestNames(d.campaign.campaign_id, v as GuestNamesMode)); if (r.ok) reload(); }}
              >
                <RadioCard value="off" title="No name" description="Guests answer without giving one." />
                <RadioCard value="optional" title="Optional" description="Guests may type a name, like a nickname." />
                <RadioCard value="required" title="Required" description="Guests must type a name to answer." />
              </RadioGroup>
              <p className="ui-help lv-m0">Guests type their own name and it is never verified, so Responses labels it “Guest, unverified”.</p>
            </>
          ) : (
            <p className="ui-help lv-m0">Names are only for identified surveys. An anonymous survey never stores who answered.</p>
          )}
        </div>
      )}
      {!draft && !(on && !invite) && <p className="ui-help lv-m0">Locked after publishing: it’s part of the published version.</p>}
    </Card>
  );
}

function ScheduleSection({
  d,
  schedule,
  setSchedule,
  save,
  reload,
  entitlement,
}: {
  d: CampaignDetailData;
  schedule: ScheduleState;
  setSchedule: (s: ScheduleState) => void;
  save: SaveTracker;
  reload: () => void;
  entitlement: React.ReactNode;
}) {
  const { api } = useIdentity();
  const { edit } = editRules(d);
  const issues = readiness({ title: "x", questions: [{ kind: "rating", prompt: "x", config: {} }], start: schedule.start, end: schedule.end });

  // Save a valid window to the draft. The backend can only clear both ends at once, so clearing one end clears
  // and then sets the other.
  async function persist(next: ScheduleState) {
    setSchedule(next);
    const bad = readiness({ title: "x", questions: [{ kind: "rating", prompt: "x", config: {} }], start: next.start, end: next.end });
    if (bad.length || !edit) return;
    const opens = next.start.mode === "at" ? next.start.at : null;
    const closes = next.end.mode === "at" ? next.end.at : null;
    const id = d.campaign.campaign_id;
    const needsClear = (!opens && d.campaign.opens_at) || (!closes && d.campaign.closes_at);
    if (needsClear) {
      const r = await save.run(api.campaignUpdate(id, { clearSchedule: true }));
      if (!r.ok) return;
    }
    if (opens || closes) await save.run(api.campaignUpdate(id, { opensAt: opens ?? undefined, closesAt: closes ?? undefined }));
    reload();
  }
  const startAt = schedule.start.mode === "at" ? schedule.start.at : null;
  const endAt = schedule.end.mode === "at" ? schedule.end.at : null;
  const err = (key: string) => issues.find((i) => i.key === key)?.message;

  return (
    <div className="lv-sections-2">
      <Card data-testid="schedule">
        <h2 className="lv-share-h">When does it run?</h2>
        {!edit && <Notice>Published: the window is part of the published version. Pause it from the top to change it.</Notice>}
        <Field label="Start">
          <Segmented<"now" | "at">
            label="Start"
            value={schedule.start.mode}
            disabled={!edit}
            onValueChange={(m) => void persist({ ...schedule, start: m === "now" ? { mode: "now" } : { mode: "at", at: startAt } })}
            options={[{ value: "now", label: "Immediately" }, { value: "at", label: "Scheduled" }]}
          />
        </Field>
        {schedule.start.mode === "at" && (
          <Field label="Start time" htmlFor="sched-start" error={err("start")}>
            <Input id="sched-start" type="datetime-local" disabled={!edit} value={toLocal(startAt)} onChange={(e) => void persist({ ...schedule, start: { mode: "at", at: fromLocal(e.target.value) } })} aria-describedby="sched-start-help" />
          </Field>
        )}
        <Field label="End">
          <Segmented<"none" | "at">
            label="End"
            value={schedule.end.mode}
            disabled={!edit}
            onValueChange={(m) => void persist({ ...schedule, end: m === "none" ? { mode: "none" } : { mode: "at", at: endAt } })}
            options={[{ value: "none", label: "No end" }, { value: "at", label: "Scheduled" }]}
          />
        </Field>
        {schedule.end.mode === "at" && (
          <Field label="End time" htmlFor="sched-end" error={err("end") ?? err("window") ?? err("end-past")}>
            <Input id="sched-end" type="datetime-local" disabled={!edit} value={toLocal(endAt)} onChange={(e) => void persist({ ...schedule, end: { mode: "at", at: fromLocal(e.target.value) } })} aria-describedby="sched-end-help" aria-invalid={Boolean(err("window") ?? err("end-past")) || undefined} />
          </Field>
        )}
        <p className="ui-help lv-m0">{schedule.end.mode === "none" ? "With no end, it runs until you close it." : "It stops taking answers at the end time."} A scheduled Campaign holds its slot from the moment it’s published.</p>
      </Card>
      {entitlement}
    </div>
  );
}

/** Real limits from the API: lv_hub_limits (anyone with campaign.manage, 000018), else the gate's own numbers. */
function HubEntitlement({ hubId, d }: { hubId: string; d: CampaignDetailData }) {
  const { api } = useIdentity();
  const s = useLv(() => api.hubLimits(hubId), [api, hubId]);
  const lim = (k: string) => (s.data?.limits[k] ?? null) as number | null;
  return (
    <Card data-testid="entitlement">
      <h2 className="lv-share-h">Plan limits</h2>
      {s.data ? (
        <>
          <QuotaMeter label="Active Campaigns" used={s.data.usage.active_campaigns} limit={lim("campaigns.max_active")} />
          <QuotaMeter label="Active surveys" used={s.data.usage.active_surveys} limit={lim("surveys.max_active")} hint="Only survey-mode Campaigns count here." />
        </>
      ) : d.gate?.limit !== undefined && d.gate.used !== undefined ? (
        <QuotaMeter label="In use" used={d.gate.used} limit={d.gate.limit} />
      ) : (
        <p className="ui-muted lv-m0">{s.loading ? "Checking your plan…" : "Your plan’s limits aren’t visible to you. Publishing checks them."}</p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ review */

export function ReadinessList({ issues, goTo }: { issues: ReadinessIssue[]; goTo?: (s: StudioSection) => void }) {
  return (
    <div className="lv-stack-8" data-testid="readiness">
      <h3 className="lv-qw-h" id="readiness-h">{issues.length ? `${issues.length} ${issues.length === 1 ? "thing" : "things"} to fix before publishing` : "Ready to publish"}</h3>
      {issues.length === 0 ? (
        <p className="lv-ready-ok lv-m0"><Icon name="check" size={16} /> Everything needed is in place. The server checks again when you publish.</p>
      ) : (
        <ul className="lv-checklist lv-checklist-issues" aria-labelledby="readiness-h">
          {issues.map((i) => (
            <li key={i.key}>
              <span aria-hidden="true">!</span>
              <span>{i.message}</span>
              {goTo && i.section !== "review" && <Button variant="quiet" size="sm" onClick={() => goTo(i.section)}>Fix in {i.section[0].toUpperCase() + i.section.slice(1)}</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null);

export function ReviewSection({
  d,
  title,
  schedule,
  issues,
  goTo,
  audienceLabel,
  extra,
}: {
  d: CampaignDetailData;
  title: string;
  schedule: ScheduleState;
  issues: ReadinessIssue[];
  goTo?: (s: StudioSection) => void;
  audienceLabel: string;
  extra?: React.ReactNode;
}) {
  const startAt = schedule.start.mode === "at" ? schedule.start.at : null;
  const endAt = schedule.end.mode === "at" ? schedule.end.at : null;
  const guests = d.campaign.audience === "members_and_guests" && d.campaign.access !== "invite";
  const draft = d.campaign.status === "draft";
  return (
    <div className="lv-sections-2">
      <Card data-testid="review-summary">
        <h2 className="lv-share-h">Summary</h2>
        {d.campaign.mode === "poll" && d.questions[0] && (
          <div className="lv-poll-summary" data-testid="poll-summary">
            <Eyebrow accent>Poll</Eyebrow>
            <strong>{d.questions[0].prompt}</strong>
            <span className="ui-muted">{(d.questions[0].config.options ?? []).join(" · ") || kindLabel(d.questions[0].kind)}{d.questions.length > 1 ? ` · plus ${d.questions.length - 1} more` : ""}</span>
          </div>
        )}
        <dl className="lv-kv">
          <dt>Title</dt><dd>{title || "—"}</dd>
          <dt>Mode</dt><dd>{MODES.find((m) => m.key === d.campaign.mode)?.label ?? d.campaign.mode}</dd>
          <dt>Questions</dt><dd>{d.questions.length} ({d.questions.filter((q) => !q.config.optional).length} required)</dd>
          <dt>Who can participate</dt><dd>{audienceLabel}</dd>
          <dt>Responses</dt><dd>{d.campaign.anonymity === "anonymous" ? "Anonymous" : "Identified"}</dd>
          <dt>Guests</dt><dd>{guests ? "Allowed" : "Not allowed"}</dd>
          <dt>Starts</dt><dd>{fmt(startAt) ?? "When published"}</dd>
          <dt>Ends</dt><dd>{fmt(endAt) ?? "When you close it"}</dd>
        </dl>
        <p className="ui-help lv-m0">
          {d.campaign.anonymity === "anonymous"
            ? "Privacy: results show totals only. A group too small to stay anonymous is withheld, never shown as zero. Written answers appear only once enough people have answered."
            : "Privacy: this is identified, so you’ll see who answered. People are told before they start."}
        </p>
        {d.questions.length > 0 && (
          <ol className="lv-review-qs">{d.questions.map((q) => <li key={q.question_id}>{q.prompt} <span className="ui-muted">· {kindLabel(q.kind)}{q.config.optional ? " · optional" : ""}</span></li>)}</ol>
        )}
      </Card>
      <div className="lv-stack-16">
        {draft ? <Card><ReadinessList issues={issues} goTo={goTo} /></Card> : <ShareCard d={d} />}
        {extra}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sharing */

export function ShareCard({ d, shareBase = "https://lunchvoice.com" }: { d: CampaignDetailData; shareBase?: string }) {
  const open = d.campaign.audience === "members_and_guests" && d.join_code && d.campaign.access !== "invite";
  // LC-10: links and QR codes carry the 128-bit link token; the 6-character code is for typing only.
  const url = `${shareBase}/c/${d.link_token ?? d.join_code}`;
  return (
    <Card data-testid="share">
      <h2 className="lv-share-h">Share</h2>
      {open ? (
        <>
          <CopyField label="Direct link" value={url} />
          <QrCode value={url} label={`QR code for ${d.campaign.title}`} size={180} />
          <ul className="lv-facts"><li><span>Join code</span><strong className="lv-code">{d.join_code}</strong></li></ul>
          <p className="ui-help lv-m0">Anyone with the link, QR or code can answer. It’s never listed publicly.</p>
        </>
      ) : d.campaign.access === "invite" ? (
        <p className="ui-muted lv-m0">Invite only: send the invite links. Each person signs in to answer.</p>
      ) : (
        <p className="ui-muted lv-m0">Members answer from the Hub’s Campaigns page. Guest responses were off when it was published, so there’s no public link.</p>
      )}
    </Card>
  );
}

export function InvitesCard({ campaignId, shareBase = "https://lunchvoice.com", disabled }: { campaignId: string; shareBase?: string; disabled: boolean }) {
  const { api } = useIdentity();
  const list = useLv(() => api.campaignInviteList(campaignId), [api, campaignId]);
  const [maxUses, setMaxUses] = useState("");
  const [fresh, setFresh] = useState<CampaignInvite | null>(null);
  async function create() {
    const r = await api.campaignInviteCreate(campaignId, maxUses ? Number(maxUses) : null);
    if (!r.ok) return toast.error(describeError(r.error));
    setFresh(r.invite);
    list.reload();
  }
  return (
    <Card>
      <h2 className="lv-share-h">Invite links</h2>
      <p className="ui-muted lv-m0">Each link lets signed-in people answer this survey only.</p>
      <div className="lv-invite-form">
        <Field label="Max uses" htmlFor="ci-max" help="Leave empty for no limit.">
          <Input id="ci-max" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ""))} placeholder="No limit" aria-describedby="ci-max-help" />
        </Field>
        <Button variant="ink" onClick={create}><Icon name="plus" size={16} />Create link</Button>
      </div>
      {disabled && <p className="ui-help lv-m0">Links work once the survey is published.</p>}
      {fresh?.token && (
        <>
          <CopyField label="New invite link" value={`${shareBase}/s/${fresh.token}`} />
          <p className="ui-help lv-m0">Copy it now: for safety the full link is shown only once.</p>
        </>
      )}
      {(list.data?.invites.length ?? 0) > 0 && (
        <ul className="lv-facts">
          {list.data!.invites.map((i) => (
            <li key={i.invite_id ?? i.prefix}>
              <span className="ui-mono">{i.prefix ?? "······"}… · {i.uses}{i.max_uses ? `/${i.max_uses}` : ""} used{i.state && i.state !== "active" ? ` · ${i.state}` : ""}</span>
              {i.invite_id && i.state !== "revoked" && (
                <Button variant="quiet" size="sm" onClick={async () => { const r = await api.campaignInviteRevokeById(i.invite_id!); if (r.ok) { toast.success("Link revoked"); list.reload(); } else toast.error(describeError(r.error)); }}>Revoke</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ConfirmAction({ trigger, title, body, action, onConfirm }: { trigger: React.ReactNode; title: string; body: string; action: string; onConfirm: () => Promise<unknown> | unknown }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void onConfirm()}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ---- track A: hardening ---- */

/** The review line for who can answer, from the real audience. */
export function audienceLabel(d: CampaignDetailData, hubName: string): string {
  if (d.audience?.scope === "roles") {
    const names = d.audience.roles.map((r) => r.name);
    return names.length ? `Members of ${hubName} with the role ${names.join(", ")}` : "No one yet: pick a role";
  }
  return `Members of ${hubName}`;
}

/** Description (000018): optional, up to 2000 characters, autosaved in the draft like the title. */
export function DescriptionField({ d, save, reload }: { d: CampaignDetailData; save: SaveTracker; reload: () => void }) {
  const { api } = useIdentity();
  const { edit } = editRules(d);
  const [value, setValue] = useState(d.campaign.description ?? "");
  const timer = useRef<number | null>(null);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => () => { if (timer.current) { window.clearTimeout(timer.current); void api.campaignDetailsUpdate(d.campaign.campaign_id, { description: latest.current.trim() }); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function onChange(v: string) {
    setValue(v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      timer.current = null;
      const r = await save.run(api.campaignDetailsUpdate(d.campaign.campaign_id, { description: v.trim() }));
      if (r.ok) reload();
    }, 600);
  }
  return (
    <Field label="Description" htmlFor="studio-description" counter={{ value: value.length, max: 2000 }} help="Optional. Respondents see it before they start.">
      <Textarea id="studio-description" value={value} maxLength={2000} disabled={!edit} onChange={(e) => onChange(e.target.value)} aria-describedby="studio-description-help" data-testid="studio-description" />
    </Field>
  );
}
