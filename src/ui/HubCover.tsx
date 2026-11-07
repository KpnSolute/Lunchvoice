import type { ReactNode } from "react";
import { HubMark } from "./HubMark";

/** The Hub's cover band for participants (L10): ink, or the Hub's contrast-checked accent. */
export function HubCover({ name, slug, pills, action, accent }: { name: string; slug: string; pills?: ReactNode; action?: ReactNode; accent?: string | null }) {
  // accent comes only from the backend's fixed contrast-safe palette (lv_hub_get accent_palette).
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

/** Ink or white text on a Hub accent, whichever has more contrast (WCAG relative luminance). */
export function onAccent(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? "#14110f" : "#ffffff";
}
