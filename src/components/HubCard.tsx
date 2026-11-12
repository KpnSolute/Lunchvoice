// The Hub card: what a Hub looks like wherever it is shown outside itself (Discover, the share dialog, the home
// page). Banner in the Hub's colour, its mark, name, the numbers we actually have, the about line and one action.
// Optional fields (online, tags, created_at) render only when the backend sends them; nothing here is made up.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { MembershipMode } from "../lib/lvApi";
import { onAccent } from "../lib/accent";
import { HubMark } from "../ui/HubMark";
import { JOIN_LABEL, establishedLine, memberLine } from "../lib/hubShare";
import { BadgeRow } from "./IconBadge";
import type { BadgeKey } from "../config/badges";

export interface HubCardData {
  name: string;
  slug: string;
  accent_hex?: string | null;
  member_count?: number | null;
  /** Discover rounds member counts down ("700+"): pass that instead of member_count. */
  members_label?: string | null;
  about?: string | null;
  membership_mode?: MembershipMode | null;
  /** From the backend when presence ships; never estimated in the browser. */
  online?: number | null;
  tags?: string[] | null;
  created_at?: string | null;
  category?: string | null;
}

/** `to` makes the whole card one link (Discover, the home page); otherwise it is a plain card with an optional action. */
export function HubCard({ hub, action, compact, to, testId, badges = [] }: { hub: HubCardData; action?: ReactNode; compact?: boolean; to?: string; testId?: string; badges?: BadgeKey[] }) {
  const accent = hub.accent_hex ?? null;
  const est = establishedLine(hub.created_at);
  const props = {
    className: "lv-hcard",
    "data-compact": compact || undefined,
    "data-testid": testId ?? "hub-card",
    style: accent ? ({ "--hc-accent": accent, "--hc-on-accent": onAccent(accent) } as React.CSSProperties) : undefined,
  };
  const body = (
    <>
      <div className="lv-hcard-banner" aria-hidden="true" />
      <div className="lv-hcard-body">
        <span className="lv-hcard-mark"><HubMark name={hub.name} size={compact ? 56 : 68} /></span>
        <div className="lv-hcard-id">
          <strong className="lv-hcard-name">{hub.name}<BadgeRow kinds={badges} size={20} /></strong>
          <span className="lv-hcard-slug">lunchvoice.com/{hub.slug}</span>
        </div>
        <ul className="lv-hcard-stats" aria-label="About this Hub">
          {typeof hub.online === "number" && <li><i data-dot="online" aria-hidden="true" />{hub.online.toLocaleString("en-US")} online</li>}
          {(hub.members_label || typeof hub.member_count === "number") && <li><i data-dot="members" aria-hidden="true" />{hub.members_label ?? memberLine(hub.member_count!)}</li>}
          {hub.membership_mode && <li>{JOIN_LABEL[hub.membership_mode]}</li>}
          {hub.category && <li>{hub.category}</li>}
        </ul>
        {est && <span className="lv-hcard-est">{est}</span>}
        {hub.about && <p className="lv-hcard-about">{hub.about}</p>}
        {hub.tags && hub.tags.length > 0 && <ul className="lv-hcard-tags" aria-label="Tags">{hub.tags.slice(0, 4).map((t) => <li key={t}>{t}</li>)}</ul>}
        {action && <div className="lv-hcard-action">{action}</div>}
      </div>
    </>
  );
  return to ? <Link to={to} {...props}>{body}</Link> : <div {...props}>{body}</div>;
}
