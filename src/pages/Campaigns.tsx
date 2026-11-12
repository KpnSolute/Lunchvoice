import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { CountUp } from "../ui/motion";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import type { Anonymity, CampaignMode, HubInfo, HubMembership } from "../lib/lvApi";
import { ELECTION_TYPE, FEEDBACK_TYPES, SURVEY_TYPE, hubHasElections, startingKind } from "../config/feedbackTypes";
import { Icon } from "../components/Icon";
import { campaignPhase, LinkButton, modeLabel, type Phase } from "../components/ui";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Badge } from "@/components/shadcn/badge";
import { Switch } from "@/components/shadcn/switch";
import { RadioCard, RadioGroup } from "@/components/shadcn/radio-group";
import { EmptyState, Field, LoadingRows, Notice, PageHeader, PhaseBadge, Segmented, ToggleRow } from "@/components/shadcn/blocks";
import { can, useHubCtx } from "./Hub";
import { Player } from "./Player";
import { StudioView } from "./Studio";
import { ResultsView } from "./Results";
import { CampaignTemplatePicker, CampaignTemplateSummary } from "./CampaignTemplatePicker";
import { campaignTemplateById, groupOf, templateOffered } from "../config/campaignTemplates";
import { templateConfig } from "../config/surveyTemplates";

/** Why export is off for this Hub, or null when the API should be asked. Display only; the backend decides. */
export function exportBlockedReason(hub: HubInfo, membership: HubMembership | null): string | null {
  if (!can(membership, "analytics.export")) return "Exporting needs the export permission from the Hub Owner.";
  if (hub.plan && hub.plan.state !== "active") return "Exports are a paid feature. This Hub’s plan isn’t active, so exports are locked. Your results are kept.";
  return null;
}

/* ------------------------------------------------------------------ list */

type Filter = "all" | "open" | "scheduled" | "draft" | "closed";

export function Campaigns() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const list = useLv(() => api.campaignList(hub.hub_id), [api, hub.hub_id]);
  const manage = can(membership, "campaign.manage");
  const [filter, setFilter] = useState<Filter>("all");
  const rows = (list.data?.campaigns ?? []).filter((c) => {
    const p = campaignPhase(c);
    if (filter === "all") return true;
    if (filter === "closed") return p === "closed" || p === "ended" || p === "archived";
    if (filter === "open") return p === "open" || p === "paused";
    return p === filter;
  });

  return (
    <div className="lv-stack-16">
      <div className="ui-spread">
        <Segmented<Filter>
          label="Filter Campaigns"
          value={filter}
          onValueChange={setFilter}
          options={[{ value: "all", label: "All" }, { value: "open", label: "Open" }, { value: "scheduled", label: "Scheduled" }, { value: "draft", label: "Drafts" }, { value: "closed", label: "Closed" }]}
        />
        {manage && <LinkButton to={`/${hub.slug}/campaigns/new`} variant="primary" icon="plus">New Campaign</LinkButton>}
      </div>

      {list.loading && !list.data && <LoadingRows rows={3} />}
      {list.error && <Notice tone="error">{describeError(list.error)}</Notice>}
      {list.data && rows.length === 0 && (
        <Card variant="well">
          <EmptyState
            icon={<Icon name="survey" size={22} />}
            title={filter === "all" ? "No Campaigns yet" : "Nothing here"}
            action={manage && filter === "all" ? <LinkButton to={`/${hub.slug}/campaigns/new`} variant="primary">Create the first one</LinkButton> : undefined}
          >
            {manage ? "A Campaign is one set of questions with a lifecycle: draft, scheduled, open, closed." : "When a manager publishes a Campaign it appears here, ready to answer."}
          </EmptyState>
        </Card>
      )}
      {rows.length > 0 && (
        <div className="ui-grid-2">
          {rows.map((c) => (
            <Link key={c.campaign_id} to={`/${hub.slug}/campaigns/${c.campaign_id}`} className="lv-campaign-card">
              <Card className="lv-campaign-card-inner">
                <div className="ui-spread"><PhaseBadge phase={campaignPhase(c)} /><span className="ui-muted lv-small">{modeLabel(c.mode)}</span></div>
                <h3 className="lv-campaign-title">{c.title}</h3>
                <div className="ui-row">
                  <Badge variant={c.anonymity === "anonymous" ? "ok" : "neutral"}>{c.anonymity}</Badge>
                  <span className="ui-muted lv-small">{c.question_count} {c.question_count === 1 ? "question" : "questions"}</span>
                  {c.has_responded && <Badge variant="ink">Answered</Badge>}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ new */


export function NewCampaign() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const nav = useNavigate();
  // /:hub/campaigns/new?template=<id> preselects a template (only if this Hub's plan offers it).
  const [params] = useSearchParams();
  const linked = campaignTemplateById(params.get("template"));
  const startTpl = linked && templateOffered(linked, hub.plan) ? linked : null;
  const [tplId, setTplId] = useState<string>(startTpl?.id ?? "blank");
  const tpl = campaignTemplateById(tplId);
  const [title, setTitle] = useState(startTpl?.title ?? "");
  const [mode, setMode] = useState<CampaignMode>("survey");
  const [anonymity, setAnonymity] = useState<Anonymity>("anonymous");
  // Elections come from the Hub's plan (lv_hub_limits: modes.election), never from a hardcoded plan name.
  const limits = useLv(() => api.hubLimits(hub.hub_id), [api, hub.hub_id]);
  const elections = hubHasElections(limits.data?.limits as Record<string, unknown> | undefined);
  const election = mode === "election";
  const [pollKind, setPollKind] = useState<"single_choice" | "yes_no">("single_choice");
  const [ratingTemplate, setRatingTemplate] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Choosing a template fills the title unless the creator already typed their own.
  function pickTemplate(id: string) {
    const next = campaignTemplateById(id);
    if (!title.trim() || title === tpl?.title) setTitle(next?.title ?? "");
    setTplId(id);
  }

  // A template creates the draft with its description and questions, sets the end date for a time-bounded one, and
  // lands on the step that needs a decision next (Audience for a role-targeted template, otherwise Review).
  async function createFromTemplate(t: NonNullable<typeof tpl>) {
    setBusy(true);
    setError(null);
    const r = await api.campaignCreateDescribed(hub.hub_id, title.trim(), t.mode, t.anonymity, t.description);
    if (!r.ok) { setBusy(false); return setError(describeError(r.error)); }
    const id = r.campaign_id;
    let failed = false;
    for (const [i, q] of t.questions.entries()) {
      const added = await api.questionAdd(id, i + 1, q.kind, q.prompt, templateConfig(q));
      if (!added.ok) { failed = true; break; }
    }
    let closes: Date | null = null;
    if (t.windowDays && !failed) {
      const at = new Date(Date.now() + t.windowDays * 86_400_000);
      const u = await api.campaignUpdate(id, { closesAt: at.toISOString() });
      if (u.ok) closes = at; else failed = true;
    }
    setBusy(false);
    if (failed) toast.warning("Draft created, but part of the template could not be added. Check the questions and the schedule.");
    else if (closes) toast.success(`Draft created from “${t.name}”. It closes on ${closes.toLocaleDateString(undefined, { day: "numeric", month: "short" })}; change it under Schedule.`);
    else toast.success(`Draft created from “${t.name}”. Edit anything before you publish.`);
    nav(`/${hub.slug}/campaigns/${id}/studio?section=${t.targetsRoles ? "audience" : "review"}`);
  }

  async function create() {
    if (busy) return;
    if (tpl) return createFromTemplate(tpl);
    setBusy(true);
    setError(null);
    const r = await api.campaignCreate(hub.hub_id, title.trim(), mode, election ? "anonymous" : anonymity);
    if (!r.ok) { setBusy(false); return setError(describeError(r.error)); }
    const studio = `/${hub.slug}/campaigns/${r.campaign_id}/studio`;
    // Fast paths: a poll opens on Questions with its first question ready to type; a rating can start from the
    // "How was it?" template (a real question, saved now); feedback starts with a short-text question.
    if (mode === "rating" && ratingTemplate) {
      const q = await api.questionAdd(r.campaign_id, 1, "rating", "How was it?", {});
      setBusy(false);
      toast.success(q.ok ? "Draft created with “How was it?”" : "Draft created");
      return nav(`${studio}?section=questions`);
    }
    setBusy(false);
    toast.success("Draft created");
    if (mode === "poll") return nav(`${studio}?section=questions&new=${pollKind}`);
    const start = startingKind(mode);
    if (start) return nav(`${studio}?section=questions&new=${start}`);
    nav(studio);
  }

  return (
    <div className="lv-stack-16">
      <PageHeader eyebrow="New Campaign" title="Start a Campaign" sub="It starts as a draft. Nothing is visible to members until you publish it." />
      <Card>
        <form className="lv-stack-24" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void create(); }}>
          <CampaignTemplatePicker value={tplId} onChange={pickTemplate} plan={hub.plan} hubSlug={hub.slug} initialGroup={startTpl ? groupOf(startTpl) : "starter"} />
          <Field label="Title" htmlFor="c-title" counter={{ value: title.length, max: 120 }}>
            <Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Which night works for the social?" maxLength={120} autoFocus />
          </Field>
          {tpl && <CampaignTemplateSummary t={tpl} />}
          {!tpl && (
          <fieldset className="lv-fieldset">
            <legend className="lv-legend">Feedback type</legend>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as CampaignMode)} aria-label="Feedback type" className="ui-grid-2">
              {FEEDBACK_TYPES.map((m) => <RadioCard key={m.key} value={m.key} title={m.label} description={m.body} />)}
              <RadioCard value="election" title={ELECTION_TYPE.label} description={ELECTION_TYPE.body} disabled={!elections}
                badge={elections ? undefined : <Badge>Starter and Team</Badge>} />
              <RadioCard value="survey" title={SURVEY_TYPE.label} description={SURVEY_TYPE.body} />
            </RadioGroup>
          </fieldset>
          )}
          {!tpl && election && (
            <Notice tone="info" title="How elections work">
              Each question is a race and its options are the candidates. Voting is always a secret ballot: no names, no guests, and
              results appear only after the election ends. Members vote, or hand out one-time ballot codes to people without accounts.
            </Notice>
          )}
          {!tpl && mode === "poll" && (
            <Field label="Start with">
              <Segmented<"single_choice" | "yes_no">
                label="Start with"
                value={pollKind}
                onValueChange={setPollKind}
                options={[{ value: "single_choice", label: "Choice question" }, { value: "yes_no", label: "Yes / No" }]}
              />
            </Field>
          )}
          {!tpl && mode === "rating" && (
            <ToggleRow
              title="Start from “How was it?”"
              description="One rating question from 1 to 5, ready to publish. You can change the wording."
              control={<Switch checked={ratingTemplate} onCheckedChange={setRatingTemplate} aria-label="Start from How was it?" />}
            />
          )}
          {!tpl && !election && (
          <fieldset className="lv-fieldset">
            <legend className="lv-legend">Answers</legend>
            <RadioGroup value={anonymity} onValueChange={(v) => setAnonymity(v as Anonymity)} aria-label="Answers" className="ui-grid-2">
              <RadioCard value="anonymous" title="Anonymous" description="Answers can’t be traced to a person." />
              <RadioCard value="identified" title="Identified" description="Managers can see who answered." />
            </RadioGroup>
          </fieldset>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <div className="ui-row"><Button type="submit" variant="primary" disabled={!title.trim() || busy}>{busy ? "Creating…" : !tpl && mode === "poll" ? "Create poll" : !tpl && election ? "Create election" : "Create draft"} <Icon name="arrow" size={16} /></Button></div>
        </form>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ detail */

const LIFECYCLE: Phase[] = ["draft", "scheduled", "open", "closed"];

export function CampaignDetail() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const { id = "" } = useParams();
  const detail = useLv(() => api.campaignGet(id), [api, id]);

  if (detail.loading && !detail.data) return <LoadingRows rows={3} label="Loading Campaign" />;
  if (detail.error) return <Notice tone="error">{describeError(detail.error)}</Notice>;
  const d = detail.data;
  if (!d) return null;
  const phase = campaignPhase(d.campaign);

  return (
    <div className="lv-stack-16">
      <div className="ui-spread">
        <div className="lv-stack-8">
          <div className="ui-row"><PhaseBadge phase={phase} /><Badge variant={d.campaign.anonymity === "anonymous" ? "ok" : "neutral"}>{d.campaign.anonymity === "anonymous" ? "Anonymous" : "Identified"}</Badge><span className="ui-muted lv-small">{modeLabel(d.campaign.mode)}</span></div>
          <h1 className="lv-detail-title">{d.campaign.title}</h1>
        </div>
        {d.can_manage && (
          <div className="ui-row">
            <LinkButton to={`/${hub.slug}/campaigns/${id}/studio`} variant="ink">Open Studio</LinkButton>
            {phase !== "draft" && <LinkButton to={`/${hub.slug}/campaigns/${id}/results`} variant="secondary">Results</LinkButton>}
          </div>
        )}
      </div>
      {d.can_manage && (
        <div className="lv-lifecycle" aria-label="Lifecycle">
          {LIFECYCLE.map((p, i) => (
            <span key={p} className="lv-lifecycle-step">
              <span data-on={p === phase || (p === "open" && phase === "paused") || (p === "closed" && (phase === "ended" || phase === "archived")) || undefined}>{p.toUpperCase()}</span>
              {i < LIFECYCLE.length - 1 && <i aria-hidden="true">→</i>}
            </span>
          ))}
        </div>
      )}
      {d.can_manage && d.campaign.mode === "election" && <BallotCodes campaignId={id} finished={phase === "closed" || phase === "ended" || phase === "archived"} />}
      {d.can_manage && phase !== "draft" && <LiveResponses campaignId={id} anonymous={d.campaign.anonymity === "anonymous"} live={phase === "open"} />}
      <Player campaignId={id} embedded />
    </div>
  );
}

/**
 * 000037: one-time ballot codes for voters without accounts (a school, an event). Codes are shown once and stored only
 * as hashes; once codes exist, members vote with a code too (one voter list). Turnout appears only after the end.
 */
function BallotCodes({ campaignId, finished }: { campaignId: string; finished: boolean }) {
  const { api } = useIdentity();
  const status = useLv(() => api.electionBallotStatus(campaignId), [api, campaignId]);
  const [count, setCount] = useState("30");
  const [group, setGroup] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = Number(count);
  const valid = Number.isInteger(n) && n >= 1 && n <= 500;

  async function create() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const r = await api.electionBallotCodesCreate(campaignId, n, group.trim() || null);
    setBusy(false);
    if (!r.ok) return setError(describeError(r.error));
    setCodes(r.codes);
    status.reload();
    toast.success(`${r.codes.length} ballot codes created${r.group ? ` for ${r.group}` : ""}`);
  }
  function download() {
    if (!codes) return;
    const url = URL.createObjectURL(new Blob([`ballot_code\n${codes.join("\n")}\n`], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ballot-codes.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  const s = status.data;
  return (
    <Card data-testid="ballot-codes">
      <h2 className="lv-share-h">Ballot codes</h2>
      <p className="ui-muted lv-m0">
        For voters without an account. Give each voter one code; it works once. Once you create codes, everyone votes with a
        code, including members.
      </p>
      {s && (
        <p className="lv-m0" data-testid="ballot-status">
          <strong>{s.issued}</strong> issued{s.used_visible && s.used !== null ? <> · <strong>{s.used}</strong> used</> : " · turnout appears after the election ends"}
        </p>
      )}
      {s && s.groups.some((g) => g.label) && (
        <p className="ui-muted lv-m0" data-testid="ballot-groups">
          {s.groups.map((g) => `${g.label ?? "No group"}: ${g.issued}`).join(" · ")}
        </p>
      )}
      <p className="ui-help lv-m0">Groups power “How each group voted” on election night. A vote keeps only its group, never its code, and groups with too few voters are combined.</p>
      {!finished && (
        <div className="ui-row">
          <Field label="How many codes" htmlFor="ballot-count">
            <Input id="ballot-count" type="number" min={1} max={500} value={count} onChange={(e) => setCount(e.target.value)} className="lv-w-140" />
          </Field>
          <Field label="Voter group (optional)" htmlFor="ballot-group">
            <Input id="ballot-group" value={group} maxLength={40} onChange={(e) => setGroup(e.target.value)} placeholder="Grade 9, Homeroom 4B…" list="lv-ballot-groups" />
            <datalist id="lv-ballot-groups">{(s?.groups ?? []).filter((g) => g.label).map((g) => <option key={g.label!} value={g.label!} />)}</datalist>
          </Field>
          <Button variant="secondary" onClick={() => void create()} disabled={!valid || busy}>{busy ? "Creating…" : "Create codes"}</Button>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {codes && (
        <>
          <Notice tone="warn" title="Save these codes now">They are shown only once. Copy or download them before you leave this page.</Notice>
          <ol className="lv-ballot-codes" data-testid="ballot-code-list">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ol>
          <div className="ui-row">
            <Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(codes.join("\n")); toast.success("Codes copied"); }}>Copy all</Button>
            <Button variant="quiet" onClick={download}>Download CSV</Button>
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * A live-feeling response counter for managers. It polls lv_analytics_query(participant_count) every 20s while the
 * page is visible. Privacy rules hold: a withheld count is never a number (and never zero), and anonymous Campaigns
 * only report once closed, so they say so instead.
 */
function LiveResponses({ campaignId, anonymous, live }: { campaignId: string; anonymous: boolean; live: boolean }) {
  const { api } = useIdentity();
  const q = useLv(() => api.analytics(campaignId, "participant_count"), [api, campaignId]);
  const [at, setAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (q.data || q.error) setAt(Date.now()); }, [q.data, q.error]);
  const reload = useRef(q.reload);
  reload.current = q.reload;
  useEffect(() => {
    if (!live) return;
    const poll = window.setInterval(() => { if (document.visibilityState === "visible") reload.current(); }, 20_000);
    const clock = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => { window.clearInterval(poll); window.clearInterval(clock); };
  }, [live]);
  const c = q.data && q.data.metric === "participant_count" ? q.data : null;
  const ago = Math.max(0, Math.round((now - at) / 1000));
  return (
    <Card size="sm" className="lv-live" data-testid="live-responses">
      <div className="ui-spread">
        <span className="lv-live-head">{live && <span className="lv-live-dot" aria-hidden="true" />}{live ? "Live" : "Responses"}</span>
        <span className="ui-muted lv-small">{q.loading && !c ? "Checking…" : ago < 5 ? "Updated just now" : `Updated ${ago}s ago`}</span>
      </div>
      {q.error ? (
        <p className="lv-m0">{q.error.code === "lv_policy_undecided" || anonymous ? "Anonymous: counts appear when the Campaign closes, so early answers can’t be matched to people." : describeError(q.error)}</p>
      ) : c ? (
        <p className="lv-live-count lv-m0" aria-live="polite">
          {c.suppressed || c.n === null ? <><strong>Fewer than 5</strong> signed-in responses so far · the exact number is withheld</> : <><strong><CountUp value={c.n} /></strong> signed-in {c.n === 1 ? "response" : "responses"}</>}
          {c.guest_suppressed ? " · some guest responses (count withheld)" : c.guest_n ? ` · includes ${c.guest_n} unverified guest responses` : ""}
        </p>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ studio and results */

export function Studio() {
  const { hub } = useHubCtx();
  const { id = "" } = useParams();
  return <StudioView campaignId={id} backTo={`/${hub.slug}/campaigns`} crumb={`${hub.name} / Campaigns`} resultsTo={`/${hub.slug}/campaigns/${id}/results`} hubId={hub.hub_id} hubName={hub.name} />;
}

export function Results() {
  const { hub, membership } = useHubCtx();
  const { api } = useIdentity();
  const { id = "" } = useParams();
  const d = useLv(() => api.campaignGet(id), [api, id]);
  return (
    <div className="lv-stack-16">
      <PageHeader
        eyebrow="Results"
        title={d.data?.campaign.title ?? "Results"}
        actions={<LinkButton to={`/${hub.slug}/campaigns/${id}`} variant="secondary">Open Campaign</LinkButton>}
      />
      <ResultsView campaignId={id} exportBlocked={exportBlockedReason(hub, membership)} />
    </div>
  );
}
