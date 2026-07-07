// Dependency-free chart primitives for the admin portal.
// Single accent-hue series everywhere (no legends needed); values wear text
// tokens, marks wear the accent; hairline grid; thin marks with rounded data ends.

// Bucket ISO timestamps into a per-day series covering the trailing `days` window.
export function dailyTrend(timestamps: string[], days = 14): { label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const t of timestamps) counts.set(t.slice(0, 10), (counts.get(t.slice(0, 10)) ?? 0) + 1);
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

// Horizontal bars: identity + magnitude. `max` defaults to the largest value.
export function Bars({
  items,
  max,
  format = (v: number) => String(v),
}: {
  items: { label: string; value: number; hint?: string }[];
  max?: number;
  format?: (v: number) => string;
}) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="chart-bars">
      {items.map((it) => (
        <div key={it.label + (it.hint ?? "")} className="chart-bar-row" title={`${it.label}: ${format(it.value)}`}>
          <span className="chart-bar-label">
            {it.label}
            {it.hint && <small>{it.hint}</small>}
          </span>
          <span className="chart-bar-track">
            <b style={{ width: `${Math.max(2, (it.value / top) * 100)}%` }} />
          </span>
          <em className="chart-bar-value mono">{format(it.value)}</em>
        </div>
      ))}
    </div>
  );
}

// Distribution columns, e.g. counts per rating 1..5. Labels on the caps.
export function DistributionColumns({
  buckets,
  labels,
}: {
  buckets: number[];
  labels: string[];
}) {
  const top = Math.max(1, ...buckets);
  return (
    <div className="chart-cols" role="img" aria-label={buckets.map((b, i) => `${labels[i]}: ${b}`).join(", ")}>
      {buckets.map((count, i) => (
        <div key={i} className="chart-col" title={`${labels[i]}: ${count}`}>
          <em className="mono">{count || ""}</em>
          <b style={{ height: `${Math.max(count ? 6 : 2, (count / top) * 100)}%` }} className={count ? "" : "empty"} />
          <span>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

// Time trend: 2px line + 10% area wash + end dot with surface ring.
export function TrendLine({
  points,
  height = 120,
  formatLabel = (d: string) => d,
}: {
  points: { label: string; value: number }[];
  height?: number;
  formatLabel?: (label: string) => string;
}) {
  if (points.length === 0) return <p className="muted">No data yet.</p>;
  const w = 600;
  const padX = 6;
  const padTop = 14;
  const padBottom = 22;
  const top = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length > 1 ? (w - padX * 2) / (points.length - 1) : 0;
  const x = (i: number) => padX + i * stepX;
  const y = (v: number) => padTop + (1 - v / top) * (height - padTop - padBottom);
  const line = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const area = `${padX},${height - padBottom} ${line} ${x(points.length - 1)},${height - padBottom}`;
  const last = points[points.length - 1];
  // sparse x labels: first, middle, last
  const labelIdx = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);

  return (
    <svg className="chart-trend" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" role="img"
      aria-label={points.map((p) => `${formatLabel(p.label)}: ${p.value}`).join(", ")}>
      <line x1={padX} x2={w - padX} y1={height - padBottom} y2={height - padBottom} className="grid" />
      <polygon points={area} className="wash" />
      <polyline points={line} className="stroke" />
      {points.map((p, i) => (
        <circle key={p.label} cx={x(i)} cy={y(p.value)} r={points.length > 20 ? 3 : 4.5} className="dot">
          <title>{`${formatLabel(p.label)}: ${p.value}`}</title>
        </circle>
      ))}
      <text x={x(points.length - 1)} y={y(last.value) - 9} textAnchor="end" className="val">{last.value}</text>
      {points.map((p, i) =>
        labelIdx.has(i) ? (
          <text key={`l${p.label}`} x={x(i)} y={height - 6}
            textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="tick">
            {formatLabel(p.label)}
          </text>
        ) : null
      )}
    </svg>
  );
}
