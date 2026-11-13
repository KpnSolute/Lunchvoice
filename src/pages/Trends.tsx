import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import type { LvResult, TrendDetail, TrendLimit, TrendQuestion, TrendRun } from "../lib/lvApi";
import { Card } from "@/components/shadcn/card";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Badge } from "@/components/shadcn/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { EmptyState, Eyebrow, Field, LoadingRows, Notice, PageHeader, SectionTitle } from "@/components/shadcn/blocks";
import { Icon } from "../components/Icon";
import { LvChartFrame, LvLineChart, LvWithheld } from "../components/charts/index";
import { answerLabel, focusOption, shortDate, trendChange } from "../lib/chartData";
import { useHubCtx } from "./Hub";

// Trends: a survey asked again over time. One space per Trend (a Hub, or a person's Quick Surveys). Every number is a
// per-run aggregate from the API; answers are never joined across runs, and a withheld run is a gap, not zero.

interface Space {
  hubId: string | null;
  base: string;
  results: (id: string) => string;
  studio: (id: string) => string;
}
const hubSpace = (hub: { hub_id: string; slug: string }): Space => ({
  hubId: hub.hub_id, base: `/${hub.slug}`,
  results: (id) => `/${hub.slug}/campaigns/${id}/results`, studio: (id) => `/${hub.slug}/campaigns/${id}/studio`,
});
const MY_SPACE: Space = { hubId: null, base: "", results: (id) => `/surveys/${id}/results`, studio: (id) => `/surveys/${id}` };

export function HubTrends() { const { hub } = useHubCtx(); return <TrendsList space={hubSpace(hub)} />; }
export function HubTrendDetail() { const { hub } = useHubCtx(); const { trend = "" } = useParams(); return <TrendView space={hubSpace(hub)} id={trend} />; }
export function MyTrends() { return <div className="ui-page"><TrendsList space={MY_SPACE} /></div>; }
export function MyTrendDetail() { const { trend = "" } = useParams(); return <div className="ui-page"><TrendView space={MY_SPACE} id={trend} /></div>; }

function LimitNote({ limit }: { limit: TrendLimit }) {
  if (limit.max === 0) return <Notice>Trends come with a paid plan: Creator Plus or Creator Pro for your Quick Surveys, a Hub plan for a Hub. <Link to="/pricing">See plans</Link></Notice>;
  if (limit.over) return <Notice tone="warn">This space holds {limit.used} Trends but its plan allows {limit.max}. Nothing is deleted and every Trend stays readable; creating Trends and adding surveys waits until the count fits.</Notice>;
  return null;
}

function TrendsList({ space }: { space: Space }) {
  const { api } = useIdentity();
  const list = useLv(() => api.trendList(space.hubId), [api, space.hubId]);
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const d = list.data;

  async function create() {
    setBusy(true);
    const r = await api.trendCreate(space.hubId, title);
    setBusy(false);
    if (!r.ok) return toast.error(describeError(r.error));
    nav(`${space.base}/trends/${r.trend.trend_id}`);
  }
  return (
    <div className="lv-stack-16">
      <PageHeader eyebrow="Trends" title="Ask again, see what changed" sub="A Trend is a survey you run more than once. Each run keeps its own results; repeated questions are compared run by run." />
      {list.error && <Notice tone="error">{describeError(list.error)}</Notice>}
      {list.loading && !d && <LoadingRows rows={2} label="Loading Trends" />}
      {d && <LimitNote limit={d.limit} />}
      {d && d.can_manage && d.limit.can_create && (
        <Card>
          <Field label="Name a new Trend" htmlFor="trend-title" help={`${d.limit.used} of ${d.limit.max} used.`}>
            <Input id="trend-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Lunch satisfaction by term" />
          </Field>
          <div><Button variant="primary" onClick={create} disabled={busy || !title.trim()}>Create Trend</Button></div>
        </Card>
      )}
      {d && d.trends.length === 0 && d.limit.max > 0 && (
        <Card variant="well"><EmptyState icon={<Icon name="dashboard" size={22} />} title="No Trends yet">Create one, then add a finished survey to it and use Ask again for the next run.</EmptyState></Card>
      )}
      {d && d.trends.length > 0 && (
        <ul className="lv-trend-list" data-testid="trend-list">
          {d.trends.map((t) => (
            <li key={t.trend_id}>
              <Card>
                <div className="ui-spread">
                  <Link to={`${space.base}/trends/${t.trend_id}`}><strong>{t.title}</strong></Link>
                  <Badge>{t.run_count} {t.run_count === 1 ? "run" : "runs"}</Badge>
                </div>
                {t.description && <p className="ui-muted lv-m0">{t.description}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function runCount(r: TrendRun): string {
  if (r.responses.reason === "draft") return "Draft";
  if (!r.responses.released) return "Not released yet";
  return r.responses.n === null ? "Withheld" : `${r.responses.n} ${r.responses.n === 1 ? "answer" : "answers"}`;
}

function TrendView({ space, id }: { space: Space; id: string }) {
  const { api } = useIdentity();
  const q = useLv(() => api.trendGet(id), [api, id]);
  const nav = useNavigate();
  const d = q.data;
  const [busy, setBusy] = useState(false);

  async function act<T>(p: Promise<LvResult<T>>, done?: string): Promise<({ ok: true } & T) | null> {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) { toast.error(describeError(r.error)); return null; }
    if (done) toast.success(done);
    q.reload();
    return r;
  }
  if (q.error) return <Notice tone="error">{describeError(q.error)}</Notice>;
  if (!d) return <LoadingRows rows={3} label="Loading Trend" />;
  const lastFinished = [...d.runs].reverse().find((r) => r.finished);

  return (
    <div className="lv-stack-16" data-testid="trend-view">
      <PageHeader
        eyebrow={<Link to={`${space.base}/trends`}>Trends</Link>}
        title={d.trend.title}
        sub={d.trend.description ?? `${d.runs.length} ${d.runs.length === 1 ? "run" : "runs"}, oldest first.`}
        actions={d.can_manage && lastFinished && (
          <Button variant="primary" disabled={busy || !d.limit.can_add} data-testid="ask-again"
            onClick={async () => { const r = await act(api.trendAskAgain(lastFinished.campaign_id), "A draft copy is ready."); if (r) nav(space.studio(r.campaign_id)); }}>
            Ask again
          </Button>
        )}
      />
      <LimitNote limit={d.limit} />
      <Card>
        <SectionTitle>Runs</SectionTitle>
        <ol className="lv-trend-list" aria-label="Runs in time order" data-testid="trend-runs">
          {d.runs.map((r) => (
            <li key={r.campaign_id} className="lv-trend-run">
              <span>
                <Link to={space.results(r.campaign_id)}><strong>{r.title}</strong></Link>
                <span className="ui-muted lv-small"> {shortDate(r.run_at)}</span>
              </span>
              <span className="ui-spread">
                <Badge variant={r.responses.suppressed ? "outline" : "default"}>{runCount(r)}</Badge>
                {r.anonymity === "anonymous" && <Badge variant="outline">Anonymous</Badge>}
                {d.can_manage && <Button variant="quiet" size="sm" disabled={busy} onClick={() => void act(api.trendRemove(id, r.campaign_id), "Taken out of the Trend. The survey and its results stay.")}>Remove</Button>}
              </span>
            </li>
          ))}
        </ol>
        {d.can_manage && <AddRun space={space} detail={d} onAdd={(cid) => act(api.trendAdd(id, cid), "Added to the Trend.")} />}
      </Card>

      <SectionTitle>Repeated questions</SectionTitle>
      {d.questions.length === 0 ? (
        <Notice>Questions with the same type and wording in at least two runs are compared here. Text answers are never compared.</Notice>
      ) : d.questions.map((tq) => <TrendQuestionChart key={tq.key} tq={tq} runs={d.runs} />)}
      <p className="ui-help lv-m0">Each run is counted on its own. Answers are never matched to people across runs, and a run with fewer than 5 answers on an anonymous survey is withheld, not zero.</p>
    </div>
  );
}

function AddRun({ space, detail, onAdd }: { space: Space; detail: TrendDetail; onAdd: (id: string) => Promise<unknown> }) {
  const { api } = useIdentity();
  const options = useLv(async () => {
    if (space.hubId) { const r = await api.campaignList(space.hubId); return r.ok ? { ok: true as const, rows: r.campaigns } : r; }
    const r = await api.quickSurveyList();
    return r.ok ? { ok: true as const, rows: r.surveys } : r;
  }, [api, space.hubId]);
  const [pick, setPick] = useState("");
  const inTrend = new Set(detail.runs.map((r) => r.campaign_id));
  const rows = (options.data?.rows ?? []).filter((c) => !inTrend.has(c.campaign_id));
  if (!detail.limit.can_add) return null;
  return (
    <div className="ui-spread">
      <Select value={pick} onValueChange={setPick}>
        <SelectTrigger aria-label="Add a survey to this Trend"><SelectValue placeholder="Add a survey" /></SelectTrigger>
        <SelectContent>{rows.map((c) => <SelectItem key={c.campaign_id} value={c.campaign_id}>{c.title}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant="secondary" disabled={!pick} onClick={async () => { await onAdd(pick); setPick(""); }}>Add</Button>
    </div>
  );
}

function TrendQuestionChart({ tq, runs }: { tq: TrendQuestion; runs: TrendRun[] }) {
  const focus = tq.kind === "rating" ? "" : focusOption(tq.kind, tq.points);
  const isRating = tq.kind === "rating";
  const value = (i: number): number | null => {
    const p = tq.points[i]!;
    if (p.state !== "released") return null;
    if (isRating) return p.mean ?? null;
    const share = p.options?.find((o) => o.key === focus)?.share;
    return share == null ? null : Math.round(share * 100);
  };
  const points = tq.points.map((p, i) => ({ label: shortDate(runs.find((r) => r.campaign_id === p.campaign_id)?.run_at ?? ""), value: value(i), withheld: p.state === "withheld" }));
  const released = points.filter((p) => p.value !== null);
  const lastIdx = tq.points.map((_, i) => i).reverse().find((i) => value(i) !== null);
  const change = lastIdx === undefined ? null : trendChange(tq.kind, tq.points, lastIdx, focus ?? "true");
  const measure = isRating ? "average rating" : focus ? `share answering “${answerLabel(tq.kind, focus)}”` : "";
  const title = released.length === 0 ? tq.prompt
    : `${tq.prompt} ${isRating ? `${points[lastIdx!]!.value!.toFixed(2)} average` : `${points[lastIdx!]!.value}%`}${change && change.direction !== "none" ? `, ${change.text} since the last run` : ""}`;
  return (
    <Card>
      <LvChartFrame
        title={title}
        subtitle={measure ? `Change in ${measure}, run by run.` : undefined}
        exportName={tq.prompt}
        testId="trend-chart"
        table={{
          caption: `${tq.prompt}: ${measure || "per run"}`,
          headers: ["Run", isRating ? "Average" : "Share", "Change"],
          rows: tq.points.map((p, i) => {
            const run = runs.find((r) => r.campaign_id === p.campaign_id);
            const v = value(i);
            return [`${run?.title ?? ""} (${shortDate(run?.run_at ?? "")})`, v === null ? (p.state === "withheld" ? "Withheld" : p.state === "absent" ? "Not asked" : "Not shown") : isRating ? v.toFixed(2) : `${v}%`, trendChange(tq.kind, tq.points, i, focus ?? "true").text];
          }),
        }}
      >
        {released.length === 0 ? <LvWithheld /> : (
          <LvLineChart points={points} label={`${tq.prompt}, ${measure}`} domain={isRating ? [1, 5] : [0, 100]} decimals={isRating ? 2 : 0} />
        )}
      </LvChartFrame>
      {change && <p className="lv-trend-change" data-testid="trend-change">Latest: <small>{change.text}</small></p>}
      <Eyebrow>{tq.runs} of {runs.length} runs asked this</Eyebrow>
    </Card>
  );
}
