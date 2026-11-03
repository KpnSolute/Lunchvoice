import type { ReactNode } from "react";
import { HubMark } from "./HubMark";

/** The Hub's cover band for participants (L10). Hub colors come later, contrast-checked; until then the cover is ink. */
export function HubCover({ name, slug, pills, action }: { name: string; slug: string; pills?: ReactNode; action?: ReactNode }) {
  return (
    <header className="lv-cover">
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
