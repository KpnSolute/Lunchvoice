import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { CountUp } from "../ui/motion";
import { SKIP, useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import type { AnalyticsResult, ExportRow, LvError, Question, RatingSummary, ResponseRow } from "../lib/lvApi";
import { summarize } from "../ui/QuestionControls";
import { Icon } from "../components/Icon";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { DisabledAction, Eyebrow, LoadingRows, Metric, Notice, SectionTitle, Segmented } from "@/components/shadcn/blocks";
import { TextAnswers, WITHHELD_EXPLAINER } from "@/components/shadcn/blocks/results";
import { LvBarChart, LvChartFrame, LvKpiCard, LvSplitBar, LvStarDistribution, LvWithheld } from "../components/charts/index";
import { answerLabel, dataTable, findingTitle, percent, TIME_BUCKET, toData } from "../lib/chartData";
import { ResultsPremium } from "./ResultsPremium";
import { TrendPanel } from "./TrendPanel";
import { ANON_MIN_ANSWERS } from "../config/privacy";
import { PresentMode } from "../ui/PresentMode";

// Shared results for Hub Campaigns and Quick Surveys. Aggregates only; withheld is its own state, never zero.

const KIND_LABEL: Record<string, string> = { rating: "Rating", single_choice: "Single choice", multi_choice: "Multiple choice", yes_no: "Yes / No", text: "Text" };

export function explainResultsError(e: Pick<LvError, "code" | "message">): string {
  if (e.code === "lv_policy_undecided") return `This survey is anonymous and still open. Results appear once it closes with at least ${ANON_MIN_ANSWERS} answers, so early answers can’t be matched to people.`;
  if (e.code === "lv_lifecycle_invalid") return "No results yet. Publish it first; drafts never report results.";
  return describeError(e);
}

/** `exportBlocked`: a reason string disables export with that reason; null enables it. */
export function ResultsView({ campaignId, exportBlocked }: { campaignId: string; exportBlocked: string | null }) {
  const { api } = useIdentity();
  const detail = useLv(() => api.campaignGet(campaignId), [api, campaignId]);
  const count = useLv(() => api.analytics(campaignId, "participant_count"), [api, campaignId]);
  const [exporting, setExporting] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const c = count.data as Extract<AnalyticsResult, { metric: "participant_count" }> | null;
  const questions = detail.data?.questions ?? [];
  // 000042: on a survey where people take different paths, each question also says how many saw it.
  const hasPaths = questions.some((q) => q.config.show_if || q.config.jumps?.length || q.config.section?.show_if);

  async function exportCsv() {
    setExporting(true);
    const r = await api.analyticsExport(campaignId);
    setExporting(false);
    if (!r.ok) return toast.error(explainResultsError(r.error));
    downloadCsv(`${detail.data?.campaign.title ?? "results"}.csv`, r.rows);
    toast.success("Exported released totals. Withheld cells stay withheld.");
  }

  return (
    <div className="lv-stack-16">
      <Card variant="ink" aria-live="polite">
        <div className="ui-spread">
          <Eyebrow accent>Participation</Eyebrow>
          {detail.data && <Badge variant="accent">{detail.data.campaign.anonymity}</Badge>}
        </div>
        {count.loading && !c ? (
          <LoadingRows rows={1} label="Counting" />
        ) : count.error ? (
          <p className="lv-m0">{explainResultsError(count.error)}</p>
        ) : c ? (
          <div className="ui-grid-2">
            <Metric value={c.suppressed || c.n === null ? null : <CountUp value={c.n} />} label="Signed-in participants" hint={c.suppressed ? WITHHELD_EXPLAINER : "Unique people. Guests never count as members."} />
            {(c.guest_n ?? 0) > 0 || c.guest_suppressed ? (
              <Metric
                value={c.guest_suppressed || c.guest_n == null ? null : <CountUp value={c.guest_n} />}
                label="Guest responses"
                hint={c.guest_suppressed ? "Includes some unverified guest responses; the count is withheld." : `Includes ${c.guest_n} unverified guest responses.`}
              />
            ) : null}
          </div>
        ) : null}
      </Card>

      <SummaryCards campaignId={campaignId} />

      <TrendPanel campaignId={campaignId} />

      {detail.data?.campaign.anonymity === "identified" && <ResponsesCard campaignId={campaignId} questions={questions} />}

      <div className="ui-spread">
        <SectionTitle>Questions</SectionTitle>
        <div className="lv-btn-row">
        {detail.data && questions.length > 0 && (
          <Button variant="primary" onClick={() => setPresenting(true)} data-testid="present"><Icon name="arrow" size={16} />Present</Button>
        )}
        {exportBlocked ? (
          <DisabledAction variant="secondary" reason={exportBlocked}>Export CSV</DisabledAction>
        ) : (
          <Button variant="secondary" onClick={exportCsv} disabled={exporting}><Icon name="arrow" size={16} />{exporting ? "Exporting…" : "Export CSV"}</Button>
        )}
        </div>
      </div>
      {presenting && detail.data && (
        <PresentMode campaignId={campaignId} title={detail.data.campaign.title} anonymity={detail.data.campaign.anonymity} joinCode={detail.data.join_code ?? null} questions={questions} onClose={() => setPresenting(false)} />
      )}

      {detail.loading && !detail.data && <LoadingRows rows={3} />}
      {detail.error && <Notice tone="error">{describeError(detail.error)}</Notice>}
      {questions.map((q) => <QuestionResult key={q.question_id} campaignId={campaignId} q={q} showSeen={hasPaths} />)}
      {detail.data && questions.length === 0 && <Notice>This survey has no questions yet.</Notice>}

      {/* TODO(hub-dashboard): "Pin to Hub dashboard" belongs on each chart frame (LvChartFrame `actions`) once a Hub dashboard exists. */}
      {questions.length > 0 && <ResultsPremium campaignId={campaignId} questions={questions} />}
    </div>
  );
}

/** Responses, completion rate and median time. Every plan. A withheld or unmeasured card says which, never zero. */
function SummaryCards({ campaignId }: { campaignId: string }) {
  const { api } = useIdentity();
  const r = useLv(() => api.analyticsSummary(campaignId), [api, campaignId]);
  const d = r.data;
  if (!d) return null;
  return (
    <div className="lv-kpi-row" data-testid="summary-cards">
      <LvKpiCard label="Responses" value={d.responses.n === null ? null : d.responses.n} withheld={d.responses.suppressed} />
      <LvKpiCard
        label="Completion rate"
        value={d.completion.rate === null ? null : percent(d.completion.rate)}
        withheld={d.completion.suppressed}
        note={d.completion.rate !== null ? `${d.responses.n} of ${d.completion.started} who started` : "Measured for people who open the survey after this feature launched."}
      />
      <LvKpiCard
        label="Median time"
        value={d.median_time.bucket ? TIME_BUCKET[d.median_time.bucket] ?? d.median_time.bucket : null}
        withheld={d.median_time.suppressed}
        note={d.median_time.bucket ? `From ${d.median_time.measured} timed answers, shown as a range.` : "Not enough timed answers yet."}
      />
    </div>
  );
}

/** Who answered and what (identified Campaigns only, 000028). Guests carry the name they typed, labelled unverified. */
function ResponsesCard({ campaignId, questions }: { campaignId: string; questions: Question[] }) {
  const { api } = useIdentity();
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(questions.map((q) => [q.question_id, q]));
  async function load(before: string | null) {
    setBusy(true);
    const r = await api.campaignResponses(campaignId, 20, before);
    setBusy(false);
    if (!r.ok) { setError(explainResultsError(r.error)); return; }
    setError(null);
    setTotal(r.total);
    setRows((prev) => (before ? [...prev, ...r.responses] : r.responses));
  }
  useEffect(() => { void load(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [api, campaignId]);
  return (
    <Card data-testid="responses">
      <div className="ui-spread">
        <h3 className="lv-q-result-title">Responses</h3>
        {total !== null && <Badge>{total} {total === 1 ? "response" : "responses"}</Badge>}
      </div>
      <p className="ui-help lv-m0">This survey is identified, so you can see who answered and what they said. Guests type their own name; it is never verified.</p>
      {error && <Notice tone="error">{error}</Notice>}
      {!error && !busy && rows.length === 0 && <p className="ui-muted lv-m0">No responses yet.</p>}
      <ul className="lv-resp-list">
        {rows.map((r) => (
          <li key={r.response_id} className="lv-resp" data-testid="response-row">
            <div className="lv-resp-head">
              <strong>{r.name ?? (r.kind === "guest" ? "Guest (no name given)" : "Account")}</strong>
              <Badge variant={r.verified ? "ok" : "outline"}>{r.verified ? "Account" : "Guest, unverified"}</Badge>
              <span className="ui-muted lv-small">{new Date(r.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
            </div>
            <dl className="lv-resp-answers">
              {r.answers.map((a) => {
                const q = byId.get(a.question_id);
                return (
                  <div key={a.question_id}>
                    <dt>{a.prompt}</dt>
                    <dd>{q ? summarize(q, a.value) : String(a.value ?? "")}</dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ul>
      {busy && <LoadingRows rows={1} label="Loading responses" />}
      {!busy && total !== null && rows.length < total && (
        <Button variant="secondary" onClick={() => void load(rows[rows.length - 1]?.at ?? null)}>Show more</Button>
      )}
    </Card>
  );
}

type ChartKind = "stars" | "split" | "bars" | "columns";
const CHART_OPTIONS: Record<string, { value: ChartKind; label: string }[]> = {
  rating: [{ value: "stars", label: "Stars" }, { value: "bars", label: "Bars" }],
  yes_no: [{ value: "split", label: "Split" }, { value: "bars", label: "Bars" }],
  single_choice: [{ value: "bars", label: "Bars" }, { value: "columns", label: "Columns" }],
  multi_choice: [{ value: "bars", label: "Bars" }, { value: "columns", label: "Columns" }],
};

function QuestionResult({ campaignId, q, showSeen }: { campaignId: string; q: Question; showSeen: boolean }) {
  const { api } = useIdentity();
  const r = useLv(() => api.analytics(campaignId, "answer_distribution", q.question_id), [api, campaignId, q.question_id]);
  const rating = useLv(() => (q.kind === "rating" ? api.ratingSummary(campaignId, q.question_id) : SKIP), [api, campaignId, q.question_id, q.kind]);
  // 000042: on a survey where people take different paths, the chart also says how many saw the question.
  const seen = useLv(() => (showSeen ? api.analyticsQuestion(campaignId, q.question_id) : SKIP), [api, campaignId, q.question_id, showSeen]);
  const options = CHART_OPTIONS[q.kind];
  const [kind, setKind] = useState<ChartKind | null>(null);
  const d = r.data as Extract<AnalyticsResult, { metric: "answer_distribution" }> | null;
  const mean = (rating.data as RatingSummary | null)?.mean ?? null;
  const filter = seen.data?.filter ? "Filtered" : null;

  if (r.loading && !d) return <Card><LoadingRows rows={2} label="Loading answers" /></Card>;
  if (r.error) return <Card><h3 className="lv-q-result-title">{q.prompt}</h3><p className="ui-muted lv-m0">{explainResultsError(r.error)}</p></Card>;
  if (q.kind === "text") {
    return (
      <Card>
        <div className="ui-spread"><h3 className="lv-q-result-title">{q.prompt}</h3><Badge>{KIND_LABEL.text}</Badge></div>
        {showSeen && seen.data && <SeenOnly seen={seen.data.seen} answered={seen.data.answered} />}
        <TextAnswers texts={d?.texts_withheld ? null : (d?.texts ?? null)} />
      </Card>
    );
  }
  if (!d || (d.cells.length === 0 && !d.withheld)) {
    return <Card><h3 className="lv-q-result-title">{q.prompt}</h3><p className="ui-muted lv-m0">No answers yet.</p></Card>;
  }
  const data = d.withheld && d.cells.length === 0 ? [] : toData(q.kind, d.cells);
  const current: ChartKind = kind ?? options?.[0]?.value ?? "bars";
  const title = findingTitle(q.kind, q.prompt, data, mean);
  const yes = data.find((x) => x.key === "true");
  const no = data.find((x) => x.key === "false");
  const asBars = data.map((x) => ({ ...x, label: x.suppressed ? "Other answers" : answerLabel(q.kind, x.key) }));
  return (
    <Card>
      <LvChartFrame
        title={title}
        subtitle={<><Badge>{KIND_LABEL[q.kind] ?? q.kind}</Badge></>}
        seen={showSeen && seen.data ? { seen: seen.data.seen, answered: seen.data.answered } : null}
        filterLabel={filter}
        table={dataTable(q.prompt, q.kind, data)}
        exportName={q.prompt}
        testId="question-chart"
        switcher={options && (
          <Segmented<ChartKind> label={`Chart type for ${q.prompt}`} value={current} onValueChange={setKind} options={options} />
        )}
      >
        {data.length === 0 ? (
          <LvWithheld />
        ) : current === "stars" ? (
          <LvStarDistribution data={data} mean={mean} label={q.prompt} />
        ) : current === "split" ? (
          <LvSplitBar yes={yes?.suppressed ? null : (yes?.n ?? 0)} no={no?.suppressed ? null : (no?.n ?? 0)} label={q.prompt} />
        ) : (
          <LvBarChart data={asBars} orientation={current === "columns" ? "columns" : "bars"} label={q.prompt} />
        )}
      </LvChartFrame>
    </Card>
  );
}

function SeenOnly({ seen, answered }: { seen: number | null; answered: number | null }) {
  return (
    <p className="ui-help lv-m0" data-testid="seen-line">
      {seen === null || answered === null ? `Withheld: fewer than ${ANON_MIN_ANSWERS} people saw or answered this, so counts could point at someone. It is not zero.` : `${seen} saw, ${answered} answered`}
    </p>
  );
}

function downloadCsv(name: string, rows: ExportRow[]) {
  // Quote every cell, and neutralise spreadsheet formulas (a cell starting with = + - @ tab or CR) (NEW-07).
  const esc = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const body = ["question,answer,responses", ...rows.map((r) => [esc(r.prompt), esc(r.answer), r.suppressed || r.n === null ? "withheld" : String(r.n)].join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[^\w.-]+/g, "-");
  a.click();
  URL.revokeObjectURL(url);
}
