import type { ReactNode } from "react";
import { ANON_MIN_ANSWERS } from "@/config/privacy";

/** A summary number. value null means withheld or not measured; `note` says which. */
export function LvKpiCard({ label, value, note, withheld = false }: { label: string; value: ReactNode | null; note?: ReactNode; withheld?: boolean }) {
  return (
    <div className="lv-kpi" data-testid="kpi">
      <span className="lv-kpi-label">{label}</span>
      <span className="lv-kpi-value">
        {value === null ? <span className="lv-kpi-empty">{withheld ? "Withheld" : "Not measured"}</span> : value}
      </span>
      <span className="lv-kpi-note">{withheld ? `Fewer than ${ANON_MIN_ANSWERS} answers, so it is withheld, not zero.` : note}</span>
    </div>
  );
}
