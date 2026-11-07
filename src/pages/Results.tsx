import { useState } from "react";
import { toast } from "sonner";
import { useIdentity } from "../identity/IdentityProvider";
import { useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import type { AnalyticsResult, ExportRow, LvError, Question } from "../lib/lvApi";
import { Icon } from "../components/Icon";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { DisabledAction, Eyebrow, LoadingRows, Metric, Notice, SectionTitle } from "@/components/shadcn/blocks";
import { ResultBars, TextAnswers, WITHHELD_EXPLAINER } from "@/components/shadcn/blocks/results";

// Shared results for Hub Campaigns and Quick Surveys. Aggregates only; withheld is its own state, never zero.

const KIND_LABEL: Record<string, string> = { rating: "Rating", single_choice: "Single choice", multi_choice: "Multiple choice", yes_no: "Yes / No", text: "Text" };

export function explainResultsError(e: Pick<LvError, "code" | "message">): string {
  if (e.code === "lv_policy_undecided") return "This survey is anonymous and still open. Results appear once it closes, so early answers can’t be matched to people.";
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
            <Metric value={c.suppressed ? null : c.n} label="Signed-in participants" hint={c.suppressed ? WITHHELD_EXPLAINER : "Unique people. Guests never count as members."} />
            {(c.guest_n ?? 0) > 0 || c.guest_suppressed ? (
              <Metric
                value={c.guest_suppressed ? null : c.guest_n}
                label="Guest responses"
                hint={c.guest_suppressed ? "Includes some unverified guest responses; the count is withheld." : `Includes ${c.guest_n} unverified guest responses.`}
              />
            ) : null}
          </div>
        ) : null}
      </Card>

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
      ) : d && d.cells.length > 0 ? (
        <ResultBars
          caption={q.prompt}
          cells={
            d.withheld && d.cells.length === 0
              ? [{ key: "withheld", label: "Withheld", n: null, suppressed: true }]
              : d.cells.map((x) => ({ key: x.key ?? "withheld", label: x.suppressed || x.key === null ? "Withheld" : label(q, x.key), n: x.n, suppressed: x.suppressed }))
          }
        />
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
