import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import type { Anonymity, SurveyAccess } from "../lib/lvApi";
import { Icon } from "../components/Icon";
import { campaignPhase, LinkButton } from "../components/ui";
import { StateScreen } from "../ui/StateScreen";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Switch } from "@/components/shadcn/switch";
import { Badge } from "@/components/shadcn/badge";
import { RadioCard, RadioGroup } from "@/components/shadcn/radio-group";
import { EmptyState, Field, LoadingRows, Notice, PageHeader, PhaseBadge, QuotaMeter, RowItem, RowList, ToggleRow } from "@/components/shadcn/blocks";
import {
  GuestsGroup,
  IdentityGroup,
  InvitesCard,
  LifecycleActions,
  ReadinessList,
  ShareCard,
  StudioHeader,
  useReadiness,
  useSaveState,
  type ScheduleState,
} from "./Studio";
import { QuestionWorkbench } from "./QuestionWorkbench";
import { ResultsView } from "./Results";
import { Player } from "./Player";

// Quick Surveys: free questions without a Hub (LAUNCH_PLAN founder direction 2). They live in the account's personal
// space and reuse the Campaign Studio, player and results. Limits come from the API: 5 active, 10 questions.

/* ------------------------------------------------------------------ /surveys */

export function SurveyList() {
  const { api } = useIdentity();
  const list = useLv(() => api.quickSurveyList(), [api]);
  const d = list.data;
  const groups = d
    ? [
        { title: "Live and scheduled", rows: d.surveys.filter((s) => ["open", "scheduled", "paused"].includes(campaignPhase(s))) },
        { title: "Drafts", rows: d.surveys.filter((s) => s.status === "draft") },
        { title: "Closed", rows: d.surveys.filter((s) => ["closed", "ended"].includes(campaignPhase(s))) },
      ].filter((g) => g.rows.length)
    : [];
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Quick Surveys"
        title="Ask without a Hub"
        sub="Free for everyone. Share a link, a QR code or a six-character code, or invite people by link."
        actions={<LinkButton to="/surveys/new" variant="primary" icon="plus">New Quick Survey</LinkButton>}
      />
      {list.error && <Notice tone="error">{describeError(list.error)}</Notice>}
      {list.loading && !d && <LoadingRows rows={3} />}
      {d && (
        <div className="lv-dash">
          <div className="lv-stack">
            {d.surveys.length === 0 ? (
              <Card variant="well">
                <EmptyState icon={<Icon name="survey" size={22} />} title="No Quick Surveys yet" action={<LinkButton to="/surveys/new" variant="primary">Create one</LinkButton>}>
                  Pick a title, add up to 10 questions, publish, and share. Answers stay private; you see totals.
                </EmptyState>
              </Card>
            ) : (
              groups.map((g) => (
                <Card key={g.title}>
                  <h2 className="lv-share-h">{g.title}</h2>
                  <RowList>
                    {g.rows.map((s) => (
                      <RowItem
                        key={s.campaign_id}
                        asChild={<Link to={`/surveys/${s.campaign_id}`} />}
                        title={s.title}
                        sub={`${s.access === "invite" ? "Invite only" : "Anyone with the link"} · ${s.anonymity} · ${s.question_count} ${s.question_count === 1 ? "question" : "questions"}`}
                        trailing={<PhaseBadge phase={campaignPhase(s)} />}
                      />
                    ))}
                  </RowList>
                </Card>
              ))
            )}
          </div>
          <aside className="lv-rail" aria-label="Limits">
            <Card>
              <h2 className="lv-share-h">Your free limits</h2>
              <QuotaMeter label="Active Quick Surveys" used={d.active} limit={d.limit} hint="Archiving a survey frees a slot." />
              <p className="lv-m0"><strong>{d.active} of {d.limit ?? "–"} active</strong></p>
              <p className="ui-muted lv-m0">Up to 10 questions each: rating, single choice, multiple choice, yes/no and short text.</p>
            </Card>
            <Card variant="dashed">
              <h2 className="lv-share-h">Need members and roles?</h2>
              <p className="ui-muted lv-m0">A Hub adds members, roles, pages, more modes and exports.</p>
              <LinkButton to="/pricing" variant="secondary" size="sm">Compare plans</LinkButton>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ /surveys/new */

export function NewSurvey() {
  const { api } = useIdentity();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [access, setAccess] = useState<SurveyAccess>("link");
  const [anonymity, setAnonymity] = useState<Anonymity>("anonymous");
  const [guests, setGuests] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const r = await api.quickSurveyCreate(title.trim(), access, anonymity, access === "link" && guests);
    setBusy(false);
    if (!r.ok) return setError(describeError(r.error));
    toast.success("Draft created. Add your questions.");
    nav(`/surveys/${r.campaign.campaign_id}`);
  }

  return (
    <div className="ui-page lv-narrow-page">
      <PageHeader eyebrow="New Quick Survey" title="What do you want to ask?" sub="It starts as a draft. Nobody sees it until you publish." actions={<LinkButton to="/surveys" variant="quiet">Cancel</LinkButton>} />
      <Card>
        <form className="lv-stack-24" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void create(); }}>
          <Field label="Title" htmlFor="qs-title" counter={{ value: title.length, max: 120 }}>
            <Input id="qs-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Book club: next month’s pick" autoFocus />
          </Field>

          <fieldset className="lv-fieldset">
            <legend className="lv-legend">Who can answer</legend>
            <RadioGroup value={access} onValueChange={(v) => setAccess(v as SurveyAccess)} aria-label="Who can answer" className="ui-grid-2">
              <RadioCard value="link" title="Anyone with the link" description="Link, QR code or six-character code. Never listed publicly." />
              <RadioCard value="invite" title="Invite only" description="Only people you send an invite link to. They sign in to answer." />
            </RadioGroup>
          </fieldset>

          <fieldset className="lv-fieldset">
            <legend className="lv-legend">Answers</legend>
            <RadioGroup value={anonymity} onValueChange={(v) => setAnonymity(v as Anonymity)} aria-label="Answers" className="ui-grid-2">
              <RadioCard value="anonymous" title="Anonymous" description="You see totals. Nobody, including you, can link an answer to a person." />
              <RadioCard value="identified" title="Identified" description="You can see who answered. People are told before they start." />
            </RadioGroup>
          </fieldset>

          {access === "link" && (
            <ToggleRow
              title="Allow guests"
              description="Guests answer without an account. Their answers are labelled as unverified in results."
              control={<Switch checked={guests} onCheckedChange={setGuests} aria-label="Allow guests" />}
            />
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <div className="ui-row"><Button type="submit" variant="primary" size="lg" disabled={!title.trim() || busy}>{busy ? "Creating…" : "Create draft"} <Icon name="arrow" size={16} /></Button></div>
        </form>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ /surveys/:id and /surveys/:id/results */

/**
 * The Quick Survey editor stays lightweight: Title → Questions → Who can respond → Publish, on one page. It reuses the
 * Studio's question workbench, identity and guest groups, checklist and lifecycle actions, not the full Studio.
 */
export function SurveyStudio() {
  const { id = "" } = useParams();
  const { api } = useIdentity();
  const detail = useLv(() => api.campaignGet(id), [api, id]);
  const list = useLv(() => api.quickSurveyList(), [api]);
  const ctx = useLv(() => api.myContext(), [api]);
  const save = useSaveState();
  const [title, setTitle] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const d = detail.data;
  useEffect(() => { if (d && title === null) setTitle(d.campaign.title); }, [d, title]);
  const questionLimit = ctx.data?.quick_surveys.question_limit ?? null;
  const schedule: ScheduleState = useMemo(() => ({ start: { mode: "now" }, end: { mode: "none" } }), []);
  const issues = useReadiness(d ?? null, title ?? d?.campaign.title ?? "", schedule, questionLimit);
  const reloadAll = () => { detail.reload(); list.reload(); };

  if (detail.loading && !d) return <div className="ui-page"><LoadingRows rows={4} label="Loading your survey" /></div>;
  if (detail.error && !d) return <div className="ui-page"><Notice tone="error">{describeError(detail.error)}</Notice></div>;
  if (!d) return null;
  const draft = d.campaign.status === "draft";

  function onTitle(v: string) {
    setTitle(v);
    if (timer.current) window.clearTimeout(timer.current);
    if (!v.trim()) return;
    timer.current = window.setTimeout(async () => { const r = await save.run(api.campaignUpdate(id, { title: v.trim() })); if (r.ok) detail.reload(); }, 600);
  }

  return (
    <div className="ui-page lv-studio-page" data-testid="quick-editor">
      <StudioHeader d={d} title={title ?? d.campaign.title} backTo="/surveys" crumb="Quick Surveys" resultsTo={`/surveys/${id}/results`} save={save} issues={issues} schedule={schedule} onChanged={reloadAll} quick />

      <ol className="lv-quick-steps">
        <li>
          <Card>
            <h2 className="lv-share-h"><span className="lv-step-n">1</span>Title</h2>
            <Field label="Title" htmlFor="qs-title-edit" counter={{ value: (title ?? "").length, max: 120 }} error={draft && !(title ?? "").trim() ? "Add a title." : undefined}>
              <Input id="qs-title-edit" value={title ?? ""} maxLength={120} disabled={!draft} onChange={(e) => onTitle(e.target.value)} aria-describedby="qs-title-edit-help" />
            </Field>
          </Card>
        </li>
        <li>
          <Card>
            <h2 className="lv-share-h"><span className="lv-step-n">2</span>Questions</h2>
            <QuestionWorkbench d={d} locked={!draft} limit={questionLimit} save={save} reload={detail.reload} />
          </Card>
        </li>
        <li>
          <div className="lv-stack-16">
            <h2 className="lv-share-h lv-step-h"><span className="lv-step-n">3</span>Who can respond</h2>
            <div className="lv-sections-2">
              <Card data-testid="audience-who">
                <h3 className="lv-qw-h">Access</h3>
                <p className="lv-m0"><strong>{d.campaign.access === "invite" ? "Invite only" : "Anyone with the link"}</strong></p>
                <p className="ui-muted lv-m0">{d.campaign.access === "invite" ? "Only people you send an invite link to. They sign in to answer." : "Link, QR code or six-character code. Never listed publicly."} Chosen when the survey was created.</p>
              </Card>
              <IdentityGroup d={d} save={save} reload={detail.reload} />
              <GuestsGroup d={d} save={save} reload={detail.reload} />
            </div>
          </div>
        </li>
        <li>
          <div className="lv-stack-16">
            <h2 className="lv-share-h lv-step-h"><span className="lv-step-n">4</span>{draft ? "Publish" : "Share"}</h2>
            <div className="lv-sections-2">
              {draft ? (
                <Card>
                  <ReadinessList issues={issues} />
                  <div className="ui-row"><LifecycleActions d={d} issues={issues} schedule={schedule} onChanged={reloadAll} quick /></div>
                </Card>
              ) : (
                <ShareCard d={d} />
              )}
              <Card>
                <h3 className="lv-qw-h">Your free slots</h3>
                <QuotaMeter label="Active Quick Surveys" used={list.data?.active ?? 0} limit={list.data?.limit ?? null} hint="Archiving a survey frees a slot." />
              </Card>
              {d.campaign.access === "invite" && <InvitesCard campaignId={id} disabled={draft} />}
            </div>
          </div>
        </li>
      </ol>
    </div>
  );
}

export function SurveyResults() {
  const { id = "" } = useParams();
  const { api } = useIdentity();
  const d = useLv(() => api.campaignGet(id), [api, id]);
  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Quick Survey results"
        title={d.data?.campaign.title ?? "Results"}
        actions={<LinkButton to={`/surveys/${id}`} variant="secondary">Open in Studio</LinkButton>}
      />
      <ResultsView campaignId={id} exportBlocked="Exports come with a Hub or Campaign plan. Quick Surveys show totals and charts here." />
    </div>
  );
}

/* ------------------------------------------------------------------ /s/:token (invite-only Quick Survey) */

export function SurveyInvite() {
  const { token = "" } = useParams();
  const { api, session } = useIdentity();
  const [state, setState] = useState<{ campaignId: string } | { error: string } | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!session || started.current) return;
    started.current = true;
    void api.campaignInviteRedeem(token).then((r) => setState(r.ok ? { campaignId: r.campaign_id } : { error: describeError(r.error) }));
  }, [api, session, token]);

  if (!session) {
    return (
      <StateScreen
        kind="ineligible"
        title="You’ve been invited to a survey."
        detail="This survey is invite only, so sign in first. You’ll come straight back here."
        action={<Button asChild variant="primary" size="lg"><Link to="/signin" state={{ from: `/s/${token}` }}>Sign in to answer</Link></Button>}
      />
    );
  }
  if (!state) return <div className="lv-player"><LoadingRows rows={3} label="Opening your invitation" /></div>;
  if ("error" in state)
    return <StateScreen kind="notfound" title="This invitation doesn’t work." detail={`${state.error} Ask the person who sent it for a new link.`} action={<Button asChild variant="secondary"><Link to="/me">Go to my home</Link></Button>} />;
  return (
    <>
      <Badge variant="ok" className="lv-invite-badge">Invitation accepted</Badge>
      <Player campaignId={state.campaignId} />
    </>
  );
}
