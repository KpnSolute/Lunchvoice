import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { CHART, NUMBER_FONT, UI_FONT, chartAnimates } from "./theme";
import { LvWithheld } from "./LvWithheld";
import type { ChartDatum } from "./types";

export type BarOrientation = "bars" | "columns";

/**
 * Choice answers as bars: sorted by count, values on the bars, starting at zero. Grey bars, amber for the leader.
 * Withheld answers are never drawn as bars: they sit under the chart as one labelled line.
 */
export function LvBarChart({ data, orientation = "bars", label }: { data: ChartDatum[]; orientation?: BarOrientation; label: string }) {
  const released = data.filter((d) => !d.suppressed && d.n !== null);
  const withheld = data.length - released.length;
  const rows = [...released].sort((a, b) => (b.n ?? 0) - (a.n ?? 0));
  const top = rows[0]?.n ?? 0;
  const horizontal = orientation === "bars";
  const height = horizontal ? Math.max(120, rows.length * 44 + 16) : 260;
  const animate = chartAnimates();

  if (rows.length === 0) return <LvWithheld />;
  return (
    <div className="lv-chart-plot" style={{ height }} role="img" aria-label={`${label}. ${rows.map((r) => `${r.label}: ${r.n}`).join(", ")}.`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={rows} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 18, right: horizontal ? 44 : 8, bottom: 4, left: 0 }} accessibilityLayer={false} barCategoryGap={horizontal ? 10 : 14}>
          {horizontal ? (
            <>
              <XAxis type="number" hide domain={[0, "dataMax"]} />
              <YAxis type="category" dataKey="label" width={112} tickLine={false} axisLine={false} tick={{ fill: CHART.text, fontSize: 13, fontFamily: UI_FONT }} interval={0} />
            </>
          ) : (
            <>
              <XAxis type="category" dataKey="label" tickLine={false} axisLine={{ stroke: CHART.greyLight }} tick={{ fill: CHART.text, fontSize: 12, fontFamily: UI_FONT }} interval={0} />
              <YAxis type="number" hide domain={[0, "dataMax"]} />
            </>
          )}
          <Bar dataKey="n" radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} isAnimationActive={animate} maxBarSize={32}>
            {rows.map((r, i) => <Cell key={r.key} fill={i === 0 && rows.length > 1 && r.n === top ? CHART.accent : CHART.grey} />)}
            <LabelList dataKey="n" position={horizontal ? "right" : "top"} fill={CHART.text} fontSize={13} fontFamily={NUMBER_FONT} fontWeight={700} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {withheld > 0 && <p className="lv-chart-note" data-testid="chart-withheld-note">Other answers are withheld: fewer than 5 answers each. They are not zero.</p>}
    </div>
  );
}
