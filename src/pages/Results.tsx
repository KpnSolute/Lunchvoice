import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { CountUp } from "../ui/motion";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import type { AnalyticsResult, ExportRow, LvError, Question, ResponseRow } from "../lib/lvApi";
import { summarize } from "../ui/QuestionControls";
import { Icon } from "../components/Icon";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { DisabledAction, Eyebrow, LoadingRows, Metric, Notice, SectionTitle } from "@/components/shadcn/blocks";
import { ResultBars, TextAnswers, WITHHELD_EXPLAINER } from "@/components/shadcn/blocks/results";
import { ANON_MIN_ANSWERS } from "../config/privacy";

// Shared results for Hub Campaigns and Quick Surveys. Aggregates only; withheld is its own state, never zero.

const KIND_LABEL: Record<string, string> = { rating: "Rating", single_choice: "Single choice", multi_choice: "Multiple choice", yes_no: "Yes / No", text: "Text" };

export function explainResultsError(e: Pick<LvError, "code" | "message">): string {
  if (e.code === "lv_policy_undecided") return `This survey is anonymous and still open. Results appear once it closes with at least ${ANON_MIN_ANSWERS} answers, so early answers can’t be matched to people.`;
  if (e.code === "lv_lifecycle_invalid") return "No results yet. Publish it first; drafts never report results.";
  return describeError(e);
}

function label(q: Question, key: string) {
  if (q.kind === "yes_no") return key === "true" ? "Yes" : key === "false" ? "No" : key;
  if (q.kind === "rating") return `${key} ★`;
  return key;
}

/** `exportBlocked`: a reason string disables export with that reason; null enables it. */
export function ResultsView({ campaignId, exportBlocked }: { campaignId: string; exportBlocked: string | null }) {
  const { api } = useIdentity();
  const detail = useLv(() => api.campaignGet(campaignId), [api, campaignId]);
  const count = useLv(() => api.analytics(campaignId, "participant_count"), [api, campaignId]);
  const [exporting, setExporting] = useState(false);
  const c = count.data as Extract<AnalyticsResult, { metric: "participant_count" }> | null;
  const questions = detail.data?.questions ?? [];

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

      {detail.data?.campaign.anonymity === "identified" && <ResponsesCard campaignId={campaignId} questions={questions} />}

      <div className="ui-spread">
        <SectionTitle>Questions</SectionTitle>
        {exportBlocked ? (
          <DisabledAction variant="secondary" reason={exportBlocked}>Export CSV</DisabledAction>
        ) : (
          <Button variant="secondary" onClick={exportCsv} disabled={exporting}><Icon name="arrow" size={16} />{exporting ? "Exporting…" : "Export CSV"}</Button>
        )}
      </div>

      {detail.loading && !detail.data && <LoadingRows rows={3} />}
      {detail.error && <Notice tone="error">{describeError(detail.error)}</Notice>}
      {questions.map((q) => <QuestionResult key={q.question_id} campaignId={campaignId} q={q} />)}
      {detail.data && questions.length === 0 && <Notice>This survey has no questions yet.</Notice>}
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
              <strong>{r.name ?? (r.kind === "guest" ? "Guest (no name given)" : "Member")}</strong>
              <Badge variant={r.verified ? "ok" : "outline"}>{r.verified ? "Member" : "Guest, unverified"}</Badge>
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

function QuestionResult({ campaignId, q }: { campaignId: string; q: Question }) {
  const { api } = useIdentity();
  const r = useLv(() => api.analytics(campaignId, "answer_distribution", q.question_id), [api, campaignId, q.question_id]);
  const d = r.data as Extract<AnalyticsResult, { metric: "answer_distribution" }> | null;
  return (
    <Card>
      <div className="ui-spread">
        <h3 className="lv-q-result-title">{q.prompt}</h3>
        <Badge>{KIND_LABEL[q.kind] ?? q.kind}</Badge>
      </div>
      {r.loading && !d ? (
        <LoadingRows rows={2} label="Loading answers" />
      ) : r.error ? (
        <p className="ui-muted lv-m0">{explainResultsError(r.error)}</p>
      ) : q.kind === "text" ? (
        <TextAnswers texts={d?.texts_withheld ? null : (d?.texts ?? null)} />
      ) : d && (d.cells.length > 0 || d.withheld) ? (
        <>
        {d.withheld && d.cells.length === 0 && <p className="ui-muted lv-m0" data-testid="question-withheld">Withheld: this question has fewer than {ANON_MIN_ANSWERS} answers, so showing them could point at someone. It is not zero.</p>}
        <ResultBars
          caption={q.prompt}
          cells={
            d.withheld && d.cells.length === 0
              ? [{ key: "withheld", label: "Withheld", n: null, suppressed: true }]
              : d.cells.map((x) => ({ key: x.key ?? "withheld", label: x.suppressed || x.key === null ? "Withheld" : label(q, x.key), n: x.n, suppressed: x.suppressed }))
          }
        />
        </>
      ) : (
        <p className="ui-muted lv-m0">No answers yet.</p>
      )}
    </Card>
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
