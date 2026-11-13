import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { CHART, NUMBER_FONT, UI_FONT, chartAnimates } from "./theme";
import { LvWithheld } from "./LvWithheld";

export interface LinePoint { label: string; value: number | null; withheld?: boolean }

/**
 * A value over time. A null value is a gap, never a zero: withheld and unmeasured points break the line and the note
 * under the chart says so. `domain` fixes the scale (a 1 to 5 rating); otherwise the scale starts at zero.
 */
export function LvLineChart({ points, label, domain, decimals = 0 }: { points: LinePoint[]; label: string; domain?: [number, number]; decimals?: number }) {
  const shown = points.filter((p) => p.value !== null);
  const gaps = points.length - shown.length;
  const animate = chartAnimates();
  if (shown.length === 0) return <LvWithheld />;
  return (
    <div className="lv-chart-plot" style={{ height: 240 }} role="img"
      aria-label={`${label}. ${points.map((p) => `${p.label}: ${p.value === null ? "withheld" : p.value.toFixed(decimals)}`).join(", ")}.`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={points} margin={{ top: 20, right: 16, bottom: 4, left: 0 }} accessibilityLayer={false}>
          <CartesianGrid stroke={CHART.greyLight} vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: CHART.greyLight }} tick={{ fill: CHART.muted, fontSize: 12, fontFamily: UI_FONT }} interval="preserveStartEnd" />
          <YAxis width={36} tickLine={false} axisLine={false} domain={domain ?? [0, "auto"]} allowDecimals={false}
            tick={{ fill: CHART.muted, fontSize: 12, fontFamily: NUMBER_FONT }} />
          <Line type="monotone" dataKey="value" stroke={CHART.accent} strokeWidth={3} connectNulls={false} isAnimationActive={animate} animationDuration={450}
            dot={{ r: 5, fill: CHART.accent, stroke: CHART.surface, strokeWidth: 2 }} activeDot={{ r: 6 }}
            label={{ position: "top", fill: CHART.text, fontSize: 12, fontFamily: NUMBER_FONT, fontWeight: 700, formatter: (v: unknown) => (typeof v === "number" ? v.toFixed(decimals) : "") }} />
        </LineChart>
      </ResponsiveContainer>
      {gaps > 0 && <p className="lv-chart-note" data-testid="chart-gap-note">{gaps === 1 ? "One point is" : `${gaps} points are`} withheld (fewer than 5 answers). A gap is not zero.</p>}
    </div>
  );
}
