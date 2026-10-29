// Charts: SVG only, one accent series, hairline grid. Every chart offers a data
// table, focusable points, and a freshness label. A withheld value is never 0.

import { useId, useState, type ReactNode } from "react";
import { Icon } from "./components/Icon";
import { Button } from "./components/controls";

export interface ChartDatum {
  label: string;
  value: number | null;
  hint?: string;
  withheld?: boolean;
}

function useAgo(iso?: string) {
  if (!iso) return "Updated just now";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Updated just now";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return `Updated ${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `Updated ${m} min ago`;
  return `Updated ${Math.round(m / 60)} h ago`;
}

export function ChartFrame({
  title,
  sub,
  freshness,
  children,
  table,
  empty,
  error,
  action,
}: {
  title: string;
  sub?: string;
  freshness?: string;
  children: ReactNode;
  table: ReactNode;
  empty?: boolean;
  error?: string | null;
  action?: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const id = useId();
  return (
    <section className="s-card chart-card" aria-labelledby={id}>
      <div className="chart-head">
        <div className="stack stack-sm">
          <h3 className="t-title" id={id}>
            {title}
          </h3>
          {sub && <p className="t-small muted">{sub}</p>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="chart-freshness">{useAgo(freshness)}</span>
          <Button size="sm" variant="quiet" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
            <Icon name={showTable ? "campaign" : "builder"} size={15} />
            {showTable ? "Chart" : "Table"}
          </Button>
          {action}
        </div>
      </div>
      {error ? (
        <div className="notice notice-error">
          <Icon name="alert" size={16} />
          <span className="t-small">{error}</span>
        </div>
      ) : empty ? (
        <p className="t-small muted">No data yet. Values appear once responses arrive.</p>
      ) : showTable ? (
        <div>{table}</div>
      ) : (
        children
      )}
    </section>
  );
}

/** Horizontal bars. A withheld bar is striped and says "Withheld", never 0. */
export function Bars({
  items,
  format = (v) => String(v),
  max,
  withheldLabel = "Withheld",
}: {
  items: ChartDatum[];
  format?: (v: number) => string;
  max?: number;
  withheldLabel?: string;
}) {
  const reported = items.filter((i) => !i.withheld && i.value !== null).map((i) => i.value as number);
  const top = max ?? Math.max(1, ...reported);
  return (
    <div className="chart-bars" role="list">
      {items.map((it) => {
        const value = it.value;
        const withheld = it.withheld || value === null;
        return (
          <div className="chart-bar-row" key={it.label} role="listitem" title={`${it.label}: ${withheld ? withheldLabel : format(value!)}`}>
            <span className="chart-bar-label">
              {it.label}
              {it.hint && <small>{it.hint}</small>}
            </span>
            <span className="chart-bar-track">
              <b
                data-withheld={withheld || undefined}
                style={{ width: withheld ? "100%" : `${Math.max(3, (value! / top) * 100)}%` }}
              />
            </span>
            <em className="chart-bar-value mono">{withheld ? withheldLabel : format(value!)}</em>
          </div>
        );
      })}
    </div>
  );
}

/** Distribution columns with labels on the caps; a withheld column is striped. */
export function DistributionColumns({ items }: { items: ChartDatum[] }) {
  const top = Math.max(1, ...items.map((i) => (i.withheld || i.value === null ? 0 : i.value)));
  return (
    <div className="chart-cols" role="img" aria-label={items.map((i) => `${i.label}: ${i.withheld || i.value === null ? "withheld" : i.value}`).join(", ")}>
      {items.map((it) => {
        const withheld = it.withheld || it.value === null;
        return (
          <div key={it.label} className="chart-col" title={`${it.label}: ${withheld ? "Withheld" : it.value}`}>
            <em className="mono">{withheld ? "—" : it.value}</em>
            <b
              className={withheld ? "empty" : ""}
              style={{ height: withheld ? "100%" : `${Math.max(6, ((it.value as number) / top) * 100)}%` }}
            />
            <span>{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** 2px line, 10% wash, end dot with a surface ring. Points are focusable. */
export function TrendLine({
  points,
  height = 140,
  formatLabel = (d) => d,
}: {
  points: { label: string; value: number }[];
  height?: number;
  formatLabel?: (label: string) => string;
}) {
  const [focus, setFocus] = useState<number | null>(null);
  if (points.length === 0) return <p className="t-small muted">No data yet.</p>;
  const w = 600;
  const padX = 8;
  const padTop = 16;
  const padBottom = 24;
  const top = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length > 1 ? (w - padX * 2) / (points.length - 1) : 0;
  const x = (i: number) => padX + i * stepX;
  const y = (v: number) => padTop + (1 - v / top) * (height - padTop - padBottom);
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const last = points[points.length - 1];
  const labels = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);

  return (
    <div style={{ position: "relative" }}>
      {/* role=group, not img: the points are focusable, and an img may not contain controls. */}
      <svg className="chart-trend" viewBox={`0 0 ${w} ${height}`} role="group" aria-label={`Trend: ${points.map((p) => `${formatLabel(p.label)}, ${p.value}`).join("; ")}`}>
        <line x1={padX} x2={w - padX} y1={height - padBottom} y2={height - padBottom} className="grid" />
        <polygon points={`${padX},${height - padBottom} ${line} ${x(points.length - 1)},${height - padBottom}`} className="wash" />
        <polyline points={line} className="stroke" />
        {points.map((p, i) => (
          <g key={p.label}>
            <circle
              cx={x(i)}
              cy={y(p.value)}
              r={focus === i ? 7 : 5}
              className="dot"
              tabIndex={0}
              role="button"
              aria-label={`${formatLabel(p.label)}: ${p.value}`}
              onFocus={() => setFocus(i)}
              onBlur={() => setFocus(null)}
              onMouseEnter={() => setFocus(i)}
              onMouseLeave={() => setFocus(null)}
            />
            {focus === i && (
              <text x={x(i)} y={y(p.value) - 12} textAnchor="middle" className="val">
                {p.value}
              </text>
            )}
          </g>
        ))}
        <text x={x(points.length - 1)} y={y(last.value) - (focus === points.length - 1 ? 26 : 11)} textAnchor="end" className="val">
          {last.value}
        </text>
        {points.map((p, i) =>
          labels.has(i) ? (
            <text
              key={`l-${p.label}`}
              x={x(i)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              className="tick"
            >
              {formatLabel(p.label)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/** Participation: participated / eligible remainder / withheld remainder. */
export function StackedParticipation({
  participating,
  eligible,
  withheld = 0,
}: {
  participating: number;
  eligible: number;
  withheld?: number;
}) {
  const remainder = Math.max(0, eligible - participating - withheld);
  const total = Math.max(1, participating + withheld + remainder);
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="stack stack-sm">
      <div className="chart-stack" role="img" aria-label={`${participating} participated, ${withheld} withheld, ${remainder} have not answered`}>
        {participating > 0 && <span data-kind="participated" style={{ width: pct(participating) }} />}
        {withheld > 0 && <span data-kind="withheld" style={{ width: pct(withheld) }} />}
        {remainder > 0 && <span data-kind="eligible" style={{ width: pct(remainder) }} />}
      </div>
      <div className="row" style={{ gap: 16 }}>
        <Legend kind="participated" label={`${participating} answered`} />
        {withheld > 0 && <Legend kind="withheld" label={`${withheld} withheld`} />}
        <Legend kind="eligible" label={`${remainder} not yet`} />
      </div>
    </div>
  );
}

function Legend({ kind, label }: { kind: string; label: string }) {
  const bg =
    kind === "participated"
      ? "linear-gradient(90deg, var(--lv-accent-deep), var(--lv-accent-light))"
      : kind === "withheld"
        ? "repeating-linear-gradient(135deg, color-mix(in srgb, var(--lv-text) 26%, transparent) 0 4px, transparent 4px 8px)"
        : "color-mix(in srgb, var(--lv-text) 18%, transparent)";
  return (
    <span className="row t-small subtle" style={{ gap: 6 }}>
      <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 4, background: bg, display: "inline-block" }} />
      {label}
    </span>
  );
}

/** Bucket ISO timestamps into a trailing window. */
export function dailyTrend(timestamps: string[], days = 14): { label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const t of timestamps) {
    const key = t.slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: { label: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ label: key, value: counts.get(key) ?? 0 });
  }
  return out;
}

export function shortDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} style={{ textAlign: j === 0 ? "left" : "right" }}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
