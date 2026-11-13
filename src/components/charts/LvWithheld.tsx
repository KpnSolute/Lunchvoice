import { ANON_MIN_ANSWERS } from "@/config/privacy";

/** The withheld state: labelled, explained, never a number and never zero. */
export function LvWithheld({ what = "answers", compact = false, testId = "chart-withheld" }: { what?: string; compact?: boolean; testId?: string }) {
  return (
    <div className={`lv-chart-withheld${compact ? " is-compact" : ""}`} role="status" data-testid={testId}>
      <strong>Withheld: fewer than {ANON_MIN_ANSWERS} {what}</strong>
      {!compact && <span>Showing a smaller group could point at someone. It is not zero.</span>}
    </div>
  );
}
