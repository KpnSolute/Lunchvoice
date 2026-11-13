import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { CHART, NUMBER_FONT, UI_FONT, chartAnimates } from "./theme";
import { LvWithheld } from "./LvWithheld";

/** Yes / no as one split bar: grey for no, amber for yes, counts on each side. */
export function LvSplitBar({ yes, no, label }: { yes: number | null; no: number | null; label: string }) {
  if (yes === null || no === null) return <LvWithheld />;
  const row = [{ name: "split", yes, no }];
  const animate = chartAnimates();
  return (
    <div className="lv-chart-plot" style={{ height: 96 }} role="img" aria-label={`${label}. Yes: ${yes}. No: ${no}.`} data-testid="split-bar">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={row} layout="vertical" margin={{ top: 8, right: 8, bottom: 8, left: 8 }} accessibilityLayer={false}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="name" hide />
          <Bar dataKey="yes" stackId="s" fill={CHART.accent} isAnimationActive={animate} radius={[8, 0, 0, 8]} maxBarSize={40}>
            <LabelList dataKey="yes" position="insideLeft" formatter={(v: unknown) => `Yes ${v}`} fill="#14110f" fontSize={13} fontFamily={NUMBER_FONT} fontWeight={700} />
          </Bar>
          <Bar dataKey="no" stackId="s" fill={CHART.grey} isAnimationActive={animate} radius={[0, 8, 8, 0]} maxBarSize={40}>
            <LabelList dataKey="no" position="insideRight" formatter={(v: unknown) => `No ${v}`} fill="#ffffff" fontSize={13} fontFamily={UI_FONT} fontWeight={700} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
