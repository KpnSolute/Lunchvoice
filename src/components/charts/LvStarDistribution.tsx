import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { CHART, NUMBER_FONT, UI_FONT, chartAnimates } from "./theme";
import { LvWithheld } from "./LvWithheld";
import type { ChartDatum } from "./types";

/**
 * A rating question: one column per star (1 to 5), count on top, and the average the server worked out. The average
 * is null when the server withholds it; then it says so instead of showing a number.
 */
export function LvStarDistribution({ data, mean, label, stars = 5 }: { data: ChartDatum[]; mean: number | null; label: string; stars?: number }) {
  const anyWithheld = data.some((d) => d.suppressed || d.n === null);
  const byStar = new Map(data.map((d) => [d.key, d]));
  // A star with no row at all had no answers (released, not withheld); a withheld star is never filled in.
  const rows = Array.from({ length: stars }, (_, i) => {
    const k = String(i + 1);
    const d = byStar.get(k);
    return { key: k, label: `${k} ★`, n: d ? (d.suppressed ? null : d.n) : anyWithheld ? null : 0 };
  });
  const shown = rows.filter((r) => r.n !== null);
  const peak = Math.max(0, ...shown.map((r) => r.n ?? 0));
  const animate = chartAnimates();
  if (data.length === 0) return <LvWithheld />;
  return (
    <div className="lv-star" data-testid="star-distribution">
      <div className="lv-star-mean" aria-live="polite">
        {mean === null ? (
          <><strong className="lv-star-num">Withheld</strong><span>Average not shown while any star has fewer than 5 answers.</span></>
        ) : (
          <><strong className="lv-star-num" data-testid="star-average">{mean.toFixed(2)}</strong><span>average out of {stars}</span></>
        )}
      </div>
      <div className="lv-chart-plot" style={{ height: 220 }} role="img" aria-label={`${label}. ${rows.map((r) => `${r.label}: ${r.n === null ? "withheld" : r.n}`).join(", ")}.`}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={shown} margin={{ top: 20, right: 8, bottom: 4, left: 8 }} accessibilityLayer={false} barCategoryGap={12}>
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: CHART.greyLight }} tick={{ fill: CHART.text, fontSize: 13, fontFamily: UI_FONT }} interval={0} />
            <YAxis type="number" hide domain={[0, Math.max(1, peak)]} />
            <Bar dataKey="n" radius={[6, 6, 0, 0]} isAnimationActive={animate} animationDuration={450} maxBarSize={44}>
              {shown.map((r) => <Cell key={r.key} fill={r.n === peak && peak > 0 ? CHART.accent : CHART.grey} />)}
              <LabelList dataKey="n" position="top" fill={CHART.text} fontSize={13} fontFamily={NUMBER_FONT} fontWeight={700} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {rows.some((r) => r.n === null) && <p className="lv-chart-note">Stars with fewer than 5 answers are withheld, not zero.</p>}
    </div>
  );
}
