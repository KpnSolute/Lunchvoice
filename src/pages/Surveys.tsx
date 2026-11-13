import { useEffect, useMemo, useRef, useState } from "react";
import { SurveyBrandingPanel } from "./SurveyBranding"; // survey branding (000043)
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import type { Anonymity, CampaignDetailData, SurveyAccess } from "../lib/lvApi";
import type { SaveTracker } from "./QuestionWorkbench";
import { Icon } from "../components/Icon";
import { campaignPhase, LinkButton } from "../components/ui";
import { StateScreen } from "../ui/StateScreen";
import { SURVEY_TEMPLATES, TEMPLATE_CATEGORIES, templateById, templateConfig, type TemplateCategory } from "../config/surveyTemplates";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Switch } from "@/components/shadcn/switch";
import { Badge } from "@/components/shadcn/badge";
import { RadioCard, RadioGroup } from "@/components/shadcn/radio-group";
import { EmptyState, Field, LoadingRows, Notice, PageHeader, PhaseBadge, QuotaMeter, RowItem, RowList, Segmented, ToggleRow } from "@/components/shadcn/blocks";
import {
  DescriptionField,
  GuestsGroup,
  IdentityGroup,
  InvitesCard,
  LifecycleActions,
  ReadinessList,
  ShareCard,
  StudioHeader,
  editRules,
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

/** How many templates "All" lists before "Show all"; Blank is always first. */
const TEMPLATES_AT_FIRST = 5;

export function NewSurvey() {
  const { api } = useIdentity();
  const nav = useNavigate();
  // /surveys/new?template=event-feedback preselects a starter template (shareable, and kept through sign-in).
  const [params] = useSearchParams();
  const fromLink = templateById(params.get("template"));
  const [tplId, setTplId] = useState<string>(fromLink?.id ?? "blank");
  const tpl = templateById(tplId);
  const [cat, setCat] = useState<"All" | TemplateCategory>(fromLink?.category ?? "All");
  const [showAll, setShowAll] = useState(false);
  const [title, setTitle] = useState(fromLink?.title ?? "");
  const [access, setAccess] = useState<SurveyAccess>(fromLink?.defaults?.access ?? "link");
  const [anonymity, setAnonymity] = useState<Anonymity>(fromLink?.defaults?.anonymity ?? "anonymous");
  const [guests, setGuests] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Choosing a template fills the title unless the creator already typed their own.
  function pickTemplate(id: string) {
    const next = templateById(id);
    if (!title.trim() || title === tpl?.title) setTitle(next?.title ?? "");
    if (next?.defaults?.access) setAccess(next.defaults.access);
    if (next?.defaults?.anonymity) setAnonymity(next.defaults.anonymity);
    setTplId(id);
  }

  async function create() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await api.quickSurveyCreate(title.trim(), access, anonymity, access === "link" && guests);
    if (!r.ok) { setBusy(false); return setError(describeError(r.error)); }
    const id = r.campaign.campaign_id;
    // The draft exists now. Add the template's questions in order (positions start at 1); if one fails the creator
    // still lands in the editor with the draft and whatever was added.
    let failed = false;
    if (tpl) {
      for (const [i, q] of tpl.questions.entries()) {
        const added = await api.questionAdd(id, i + 1, q.kind, q.prompt, templateConfig(q));
        if (!added.ok) { failed = true; break; }
      }
    }
    setBusy(false);
    if (tpl && !failed) toast.success(`Draft created from “${tpl.name}”. Edit anything before you publish.`);
    else if (tpl) toast.warning("Draft created, but some template questions could not be added. Add the rest in the editor.");
    else toast.success("Draft created. Add your questions.");
    nav(`/surveys/${id}`);
  }

  // "All" opens on a short list so the title and the privacy choices are on screen without scrolling past every
  // template; a category, or "Show all", lists everything. The chosen template is always listed.
  const matching = SURVEY_TEMPLATES.filter((t) => cat === "All" || t.category === cat);
  const shortList = cat === "All" && !showAll ? matching.slice(0, TEMPLATES_AT_FIRST) : matching;
  const chosen = SURVEY_TEMPLATES.find((t) => t.id === tplId);
  const visibleTemplates = chosen && !shortList.includes(chosen) ? [...shortList, chosen] : shortList;
  const hiddenCount = matching.length - shortList.length;

  return (
    <div className="ui-page lv-narrow-page">
      <PageHeader eyebrow="New Quick Survey" title="What do you want to ask?" sub="It starts as a draft. Nobody sees it until you publish." actions={<LinkButton to="/surveys" variant="quiet">Cancel</LinkButton>} />
      <Card>
        <form className="lv-stack-24" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void create(); }}>
          <fieldset className="lv-fieldset" data-testid="template-picker">
            <legend className="lv-legend">Start from</legend>
            <Segmented<"All" | TemplateCategory>
              label="Template category"
              value={cat}
              onValueChange={setCat}
              options={[{ value: "All", label: "All" }, ...TEMPLATE_CATEGORIES.map((c) => ({ value: c, label: c }))]}
            />
            <RadioGroup value={tplId} onValueChange={pickTemplate} aria-label="Start from" className="ui-grid-2">
              <RadioCard value="blank" title="Blank" description="Write your own questions." />
              {/* The chosen template stays visible when the filter changes, so the selection never disappears. */}
              {visibleTemplates.map((t) => (
                <RadioCard key={t.id} value={t.id} title={t.name} description={`${t.blurb} ${t.questions.length} questions.`} />
              ))}
            </RadioGroup>
            {hiddenCount > 0 && (
              <Button type="button" variant="quiet" size="sm" onClick={() => setShowAll(true)} data-testid="templates-more">
                Show all {matching.length} templates <Icon name="chevron" size={14} />
              </Button>
            )}
          </fieldset>

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
  // 000042: the survey's own limit (a Creator plan raises it); the context still shows the free number.
  const questionLimit = d?.campaign.question_limit ?? ctx.data?.quick_surveys.question_limit ?? null;
  const schedule: ScheduleState = useMemo(() => ({ start: { mode: "now" }, end: { mode: "none" } }), []);
  const issues = useReadiness(d ?? null, title ?? d?.campaign.title ?? "", schedule, questionLimit);
  const reloadAll = () => { detail.reload(); list.reload(); };

  if (detail.loading && !d) return <div className="ui-page"><LoadingRows rows={4} label="Loading your survey" /></div>;
  if (detail.error && !d) return <div className="ui-page"><Notice tone="error">{describeError(detail.error)}</Notice></div>;
  if (!d) return null;
  const { draft, paused, edit, meaning } = editRules(d);

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
            {paused && <Notice>{meaning
              ? "Paused: nobody can answer while you edit. Change anything here, then press Resume. The questions lock once the first answer comes in."
              : "Paused: you can edit the title and description. The questions are locked because people have already answered; changing them would change what those answers mean."}</Notice>}
            <Field label="Title" htmlFor="qs-title-edit" counter={{ value: (title ?? "").length, max: 120 }} error={edit && !(title ?? "").trim() ? "Add a title." : undefined}>
              <Input id="qs-title-edit" value={title ?? ""} maxLength={120} disabled={!edit} onChange={(e) => onTitle(e.target.value)} aria-describedby="qs-title-edit-help" />
            </Field>
            <DescriptionField d={d} save={save} reload={detail.reload} />
          </Card>
        </li>
        <li>
          {/* survey branding (000043): the creator's own Creator plan entitles it; no Hub needed */}
          <SurveyBrandingPanel d={d} save={save} reload={detail.reload} />
        </li>
        <li>
          <Card>
            <h2 className="lv-share-h"><span className="lv-step-n">2</span>Questions</h2>
            <QuestionWorkbench d={d} locked={!meaning} limit={questionLimit} save={save} reload={detail.reload} />
          </Card>
        </li>
        <li>
          <div className="lv-stack-16">
            <h2 className="lv-share-h lv-step-h"><span className="lv-step-n">3</span>Who can respond</h2>
            <div className="lv-sections-2">
              <AccessCard d={d} save={save} reload={detail.reload} />
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

/* ---- track A: hardening ---- */

/** Quick Survey access (000018): link or invite, changeable while the survey is a draft. Invite only turns guests off. */
function AccessCard({ d, save, reload }: { d: CampaignDetailData; save: SaveTracker; reload: () => void }) {
  const { api } = useIdentity();
  const draft = d.campaign.status === "draft";
  const [value, setValue] = useState<SurveyAccess>(d.campaign.access ?? "link");
  useEffect(() => setValue(d.campaign.access ?? "link"), [d.campaign.access]);
  return (
    <Card data-testid="audience-who">
      <h3 className="lv-qw-h" id="qs-access-h">Access</h3>
      <RadioGroup
        value={value}
        disabled={!draft}
        aria-labelledby="qs-access-h"
        className="ui-grid-2"
        onValueChange={async (v) => {
          setValue(v as SurveyAccess);
          const r = await save.run(api.campaignDetailsUpdate(d.campaign.campaign_id, { access: v as SurveyAccess }));
          if (r.ok) reload(); else { setValue(d.campaign.access ?? "link"); toast.error(describeError(r.error)); }
        }}
      >
        <RadioCard value="link" title="Anyone with the link" description="Link, QR code or six-character code. Never listed publicly." />
        <RadioCard value="invite" title="Invite only" description="Only people you send an invite link to. They sign in to answer. Guests are turned off." />
      </RadioGroup>
      <p className="ui-help lv-m0">{draft ? "You can change this until you publish." : "Locked after publishing: it’s part of the published version."}</p>
    </Card>
  );
}
