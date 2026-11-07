import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import type { Anonymity, CampaignMode, HubInfo, HubMembership } from "../lib/lvApi";
import { Icon } from "../components/Icon";
import { campaignPhase, LinkButton, type Phase } from "../components/ui";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Input } from "@/components/shadcn/input";
import { Badge } from "@/components/shadcn/badge";
import { RadioCard, RadioGroup } from "@/components/shadcn/radio-group";
import { EmptyState, Eyebrow, Field, LoadingRows, Notice, PageHeader, PhaseBadge, Segmented } from "@/components/shadcn/blocks";
import { can, useHubCtx } from "./Hub";
import { Player } from "./Player";
import { StudioView } from "./Studio";
import { ResultsView } from "./Results";

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
          options={[{ value: "all", label: "All" }, { value: "open", label: "Live" }, { value: "scheduled", label: "Scheduled" }, { value: "draft", label: "Drafts" }, { value: "closed", label: "Closed" }]}
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
                <div className="ui-spread"><PhaseBadge phase={campaignPhase(c)} /><Eyebrow>{c.mode}</Eyebrow></div>
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

const MODES: { key: CampaignMode; label: string; body: string }[] = [
  { key: "survey", label: "Survey", body: "Several questions, one screen at a time." },
  { key: "poll", label: "Poll", body: "One choice question, fast to answer." },
  { key: "rating", label: "Rating", body: "A score from 1 to 5." },
  { key: "feedback", label: "Feedback", body: "An open answer." },
];

export function NewCampaign() {
  const { hub } = useHubCtx();
  const { api } = useIdentity();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<CampaignMode>("survey");
  const [anonymity, setAnonymity] = useState<Anonymity>("anonymous");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const r = await api.campaignCreate(hub.hub_id, title.trim(), mode, anonymity);
    setBusy(false);
    if (r.ok) { toast.success("Draft created"); nav(`/${hub.slug}/campaigns/${r.campaign_id}/studio`); }
    else setError(describeError(r.error));
  }

  return (
    <div className="lv-stack-16">
      <PageHeader eyebrow="New Campaign" title="Start a Campaign" sub="It starts as a draft. Nothing is visible to members until you publish it." />
      <Card>
        <form className="lv-stack-24" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void create(); }}>
          <Field label="Title" htmlFor="c-title" counter={{ value: title.length, max: 120 }}>
            <Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Which night works for the social?" maxLength={120} autoFocus />
          </Field>
          <fieldset className="lv-fieldset">
            <legend className="lv-legend">Mode</legend>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as CampaignMode)} aria-label="Mode" className="ui-grid-2">
              {MODES.map((m) => <RadioCard key={m.key} value={m.key} title={m.label} description={m.body} />)}
              <RadioCard value="election" title="Election" description="Ranked options with a ballot." disabled badge={<Badge>Coming with M2</Badge>} />
            </RadioGroup>
          </fieldset>
          <fieldset className="lv-fieldset">
            <legend className="lv-legend">Answers</legend>
            <RadioGroup value={anonymity} onValueChange={(v) => setAnonymity(v as Anonymity)} aria-label="Answers" className="ui-grid-2">
              <RadioCard value="anonymous" title="Anonymous" description="Answers can’t be traced to a person." />
              <RadioCard value="identified" title="Identified" description="Managers can see who answered." />
            </RadioGroup>
          </fieldset>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="ui-row"><Button type="submit" variant="primary" disabled={!title.trim() || busy}>{busy ? "Creating…" : "Create draft"} <Icon name="arrow" size={16} /></Button></div>
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
          <div className="ui-row"><PhaseBadge phase={phase} /><Badge variant={d.campaign.anonymity === "anonymous" ? "ok" : "neutral"}>{d.campaign.anonymity}</Badge><Eyebrow>{d.campaign.mode}</Eyebrow></div>
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
      <Player campaignId={id} embedded />
    </div>
  );
}

/* ------------------------------------------------------------------ studio and results */

export function Studio() {
  const { hub } = useHubCtx();
  const { id = "" } = useParams();
  return <StudioView campaignId={id} backTo={`/${hub.slug}/campaigns`} crumb={`${hub.name} / Campaigns`} resultsTo={`/${hub.slug}/campaigns/${id}/results`} />;
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
