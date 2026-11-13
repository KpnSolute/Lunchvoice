import { useState } from "react";
import { useIdentity } from "../identity/IdentityProvider";
import { SKIP, useLv } from "../lib/useLv";
import { describeError } from "../lib/errors";
import type { PremiumBlock, Question } from "../lib/lvApi";
import { Card } from "@/components/shadcn/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Eyebrow, Field, LoadingRows, Notice, SectionTitle } from "@/components/shadcn/blocks";
import { LinkButton } from "../components/ui";
import { LvBarChart, LvChartFrame, LvLineChart, LvWithheld } from "../components/charts/index";
import { DEVICE_LABEL, SOURCE_LABEL, shortDate } from "../lib/chartData";
import { ANON_MIN_ANSWERS } from "../config/privacy";

// Premium results (Team Hub and Creator Pro, enforced by the server): responses over time, device type, source and a
// cross-tab. Every number comes from the API; an anonymous survey only shows cells of at least 5 answers.

const CHOICE = new Set(["single_choice", "multi_choice", "yes_no"]);
const releasedCells = (b: PremiumBlock) => b.cells.filter((c) => !c.suppressed && c.n !== null && c.key !== null);

export function ResultsPremium({ campaignId, questions }: { campaignId: string; questions: Question[] }) {
  const { api } = useIdentity();
  const r = useLv(() => api.analyticsPremium(campaignId), [api, campaignId]);
  if (r.loading && !r.data) return <Card><LoadingRows rows={2} label="Loading more results" /></Card>;
  if (r.error) {
    if (r.error.code === "lv_entitlement_required") {
      return (
        <Card variant="well" data-testid="premium-locked">
          <Eyebrow>More results</Eyebrow>
          <p className="lv-m0">Responses over time, device type, where people came from and a cross-tab come with Team Hub or Creator Pro.</p>
          <div><LinkButton to="/pricing" variant="secondary">See plans</LinkButton></div>
        </Card>
      );
    }
    // A draft or still-open anonymous survey is already explained by the rest of the page.
    if (r.error.code === "lv_lifecycle_invalid" || r.error.code === "lv_policy_undecided") return null;
    return <Notice tone="error">{describeError(r.error)}</Notice>;
  }
  const d = r.data;
  if (!d) return null;
  const overTime = releasedCells(d.over_time);
  const device = releasedCells(d.device).map((c) => ({ key: c.key!, label: DEVICE_LABEL[c.key!] ?? c.key!, n: c.n, suppressed: false }));
  const source = releasedCells(d.source).map((c) => ({ key: c.key!, label: SOURCE_LABEL[c.key!] ?? c.key!, n: c.n, suppressed: false }));
  const choiceQs = questions.filter((q) => CHOICE.has(q.kind));
  return (
    <div className="lv-stack-16" data-testid="premium-results">
      <SectionTitle>More about who answered</SectionTitle>
      <Card>
        <LvChartFrame
          title="Responses over time"
          exportName="Responses over time"
          table={{ caption: "Responses per day", headers: ["Day", "Responses"], rows: d.over_time.cells.map((c) => [c.key ? shortDate(c.key) : "Withheld", c.suppressed || c.n === null ? "Withheld" : c.n]) }}
        >
          {d.over_time.withheld || overTime.length === 0 ? <LvWithheld what="responses in a day" /> : <LvLineChart points={overTime.map((c) => ({ label: shortDate(c.key!), value: c.n }))} label="Responses per day" />}
        </LvChartFrame>
      </Card>
      <div className="ui-grid-2">
        <Card>
          <LvChartFrame title="Device type" subtitle="Phone, tablet or computer. Never the exact device." exportName="Device type"
            table={{ caption: "Responses by device type", headers: ["Device", "Responses"], rows: d.device.cells.map((c) => [c.key ? DEVICE_LABEL[c.key] ?? c.key : "Withheld", c.suppressed || c.n === null ? "Withheld" : c.n]) }}>
            {d.device.withheld || device.length === 0 ? <LvWithheld what="responses per device type" /> : <LvBarChart data={device} label="Responses by device type" />}
          </LvChartFrame>
        </Card>
        <Card>
          <LvChartFrame title="Where people came from" subtitle="Link, QR code, join code or Discord." exportName="Source"
            table={{ caption: "Responses by source", headers: ["Source", "Responses"], rows: d.source.cells.map((c) => [c.key ? SOURCE_LABEL[c.key] ?? c.key : "Withheld", c.suppressed || c.n === null ? "Withheld" : c.n]) }}>
            {d.source.withheld || source.length === 0 ? <LvWithheld what="responses per source" /> : <LvBarChart data={source} label="Responses by source" />}
          </LvChartFrame>
        </Card>
      </div>
      {choiceQs.length >= 2 && <CrossTab campaignId={campaignId} questions={choiceQs} />}
    </div>
  );
}

function CrossTab({ campaignId, questions }: { campaignId: string; questions: Question[] }) {
  const { api } = useIdentity();
  const [row, setRow] = useState(questions[0]!.question_id);
  const [col, setCol] = useState(questions[1]!.question_id);
  const x = useLv(() => (row === col ? SKIP : api.analyticsCrosstab(campaignId, row, col)), [api, campaignId, row, col]);
  const d = x.data;
  const rows = d ? [...new Set(d.cells.map((c) => c.row))] : [];
  const cols = d ? [...new Set(d.cells.map((c) => c.col))] : [];
  const at = (rr: string, cc: string) => d?.cells.find((c) => c.row === rr && c.col === cc);
  const pick = (value: string, set: (v: string) => void, id: string, label: string) => (
    <Field label={label} htmlFor={id}>
      <Select value={value} onValueChange={set}>
        <SelectTrigger id={id}><SelectValue /></SelectTrigger>
        <SelectContent>{questions.map((q) => <SelectItem key={q.question_id} value={q.question_id}>{q.prompt}</SelectItem>)}</SelectContent>
      </Select>
    </Field>
  );
  return (
    <Card data-testid="crosstab">
      <h3 className="lv-q-result-title">Compare two questions</h3>
      <p className="ui-help lv-m0">Each cell counts people who gave both answers. On an anonymous survey every cell must reach {ANON_MIN_ANSWERS}, or the whole table is withheld.</p>
      <div className="ui-grid-2">{pick(row, setRow, "xt-row", "Rows")}{pick(col, setCol, "xt-col", "Columns")}</div>
      {row === col ? <Notice>Pick two different questions.</Notice>
        : x.error ? <Notice tone="error">{describeError(x.error)}</Notice>
        : !d ? <LoadingRows rows={2} label="Comparing" />
        : d.withheld ? (
          <LvWithheld what="answers in every cell" />
        ) : rows.length === 0 ? <p className="ui-muted lv-m0">No one has answered both yet.</p> : (
          <Table>
            <caption className="lv-sr-only">Answers to the row question against the column question</caption>
            <TableHeader><TableRow><TableHead />{cols.map((c) => <TableHead key={c} className="text-right">{c === "true" ? "Yes" : c === "false" ? "No" : c}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{rows.map((rr) => (
              <TableRow key={rr}>
                <TableCell>{rr === "true" ? "Yes" : rr === "false" ? "No" : rr}</TableCell>
                {cols.map((cc) => <TableCell key={cc} className="text-right font-[family-name:var(--lv-font-mono)]">{at(rr, cc)?.n ?? 0}</TableCell>)}
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
    </Card>
  );
}
