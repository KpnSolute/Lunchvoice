import { ANON_MIN_ANSWERS } from "@/config/privacy";

/** The withheld state: labelled, explained, never a number and never zero. */
export function LvWithheld({ what = "answers", compact = false }: { what?: string; compact?: boolean }) {
  return (
    <div className={`lv-chart-withheld${compact ? " is-compact" : ""}`} role="status" data-testid="chart-withheld">
      <strong>Withheld: fewer than {ANON_MIN_ANSWERS} {what}</strong>
      {!compact && <span>Showing a smaller group could point at someone. It is not zero.</span>}
    </div>
  );
}
