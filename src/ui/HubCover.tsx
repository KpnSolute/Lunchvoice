import type { ReactNode } from "react";
import { HubMark } from "./HubMark";
import { onAccent } from "../lib/accent";

/** The Hub's cover band for participants (L10): ink, or the Hub's contrast-checked accent. */
export function HubCover({ name, slug, pills, action, accent }: { name: string; slug: string; pills?: ReactNode; action?: ReactNode; accent?: string | null }) {
  // `accent` is a hex from the backend's contrast-safe palette (resolved from the Hub's accent key in lvApi).
  return (
    <header className="lv-cover" style={accent ? { background: accent, color: onAccent(accent) } : undefined}>
      <div className="lv-cover-inner">
        <HubMark name={name} size={72} />
        <div className="lv-cover-text">
          <span className="lv-eyebrow-mono">Participant Hub</span>
          <h1 className="lv-cover-name">{name}</h1>
          <span className="lv-row-sub" style={{ color: "inherit", opacity: 0.7 }}>lunchvoice.com/{slug}</span>
        </div>
        <div className="lv-cover-side">
          {pills}
          {action}
        </div>
      </div>
    </header>
  );
}

export { onAccent } from "../lib/accent";
