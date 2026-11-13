import { useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ANON_MIN_ANSWERS } from "@/config/privacy";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { exportChartPng } from "./exportPng";
import type { ChartTable } from "./types";

export interface SeenCounts { seen: number | null; answered: number | null }

/**
 * The card every LunchVoice chart sits in: a title that states the finding, optional "N saw, M answered", the active
 * filter, a chart-type switcher slot, "Show data table", and PNG export. Pass a `table` and the chart always has an
 * accessible equivalent: hidden from sight until asked for, but present for screen readers.
 */
export function LvChartFrame({
  title, subtitle, seen, filterLabel, table, switcher, actions, exportName, children, testId,
}: {
  title: string;
  subtitle?: ReactNode;
  seen?: SeenCounts | null;
  filterLabel?: string | null;
  table?: ChartTable;
  switcher?: ReactNode;
  /** Extra buttons (for example a pin to a dashboard). */
  actions?: ReactNode;
  exportName?: string;
  children: ReactNode;
  testId?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [showTable, setShowTable] = useState(false);
  const [busy, setBusy] = useState(false);
  const tableId = useId();

  async function png() {
    if (!host.current) return;
    setBusy(true);
    try { await exportChartPng(host.current, title, exportName ?? title); toast.success("Chart saved as an image."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save the chart."); }
    finally { setBusy(false); }
  }

  return (
    <section className="lv-chart-frame" aria-label={title} data-testid={testId ?? "chart-frame"}>
      <header className="lv-chart-head">
        <h3 className="lv-chart-title">{title}</h3>
        {filterLabel && <Badge variant="accent" data-testid="chart-filter">{filterLabel}</Badge>}
      </header>
      {subtitle && <p className="lv-chart-sub">{subtitle}</p>}
      {seen && (
        <p className="ui-help lv-m0" data-testid="seen-line">
          {seen.seen === null || seen.answered === null
            ? `Withheld: fewer than ${ANON_MIN_ANSWERS} people saw or answered this, so counts could point at someone. It is not zero.`
            : `${seen.seen} saw, ${seen.answered} answered`}
        </p>
      )}
      <div ref={host} className="lv-chart-body" role="group" aria-describedby={table ? tableId : undefined}>
        {showTable && table ? null : children}
        {table && (
          <table id={tableId} className={showTable ? "lv-chart-table" : "lv-chart-table lv-sr-only"} data-testid="chart-table">
            <caption>{table.caption}</caption>
            <thead><tr>{table.headers.map((h, i) => <th key={h} scope="col" className={i > 0 ? "num" : undefined}>{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j} className="num">{c}</td>))}</tr>)}</tbody>
          </table>
        )}
      </div>
      <footer className="lv-chart-tools">
        {switcher}
        <span className="lv-chart-tools-end">
          {table && <Button variant="quiet" size="sm" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>{showTable ? "Show chart" : "Show data table"}</Button>}
          {!showTable && <Button variant="quiet" size="sm" onClick={png} disabled={busy}>{busy ? "Saving…" : "Save as image"}</Button>}
          {actions}
        </span>
      </footer>
    </section>
  );
}
