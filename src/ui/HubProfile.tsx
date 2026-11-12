// The top of every Hub page: a banner in the Hub's colour, its mark overlapping the banner, the name, the facts we
// have (address, members, how to join, visibility) and the page's actions. Visitors get the full height; members in
// the workspace get the compact one so the work starts higher up.
import type { ReactNode } from "react";
import type { HubInfo } from "../lib/lvApi";
import { HubMark } from "./HubMark";
import { JOIN_LABEL, establishedLine, memberLine } from "../lib/hubShare";
import { BadgeRow } from "../components/IconBadge";
import { hubBadges, type BadgeKey } from "../config/badges";

/** `owner` adds the crown for the person viewing their own Hub. Hub badges come from the plan the backend sent. */
export function HubProfile({ hub, actions, compact, owner, children }: { hub: HubInfo & { created_at?: string | null; online?: number | null }; actions?: ReactNode; compact?: boolean; owner?: boolean; children?: ReactNode }) {
  const est = establishedLine(hub.created_at);
  const badges: BadgeKey[] = [...hubBadges(hub), ...(owner ? (["owner"] as BadgeKey[]) : [])];
  return (
    <header className="lv-hprofile" data-compact={compact || undefined} data-testid="hub-profile">
      <div className="lv-hprofile-banner" aria-hidden="true" />
      <div className="lv-hprofile-row">
        <span className="lv-hprofile-mark"><HubMark name={hub.name} size={compact ? 72 : 96} /></span>
        <div className="lv-hprofile-id">
          <h1 className="lv-hprofile-name">{hub.name}<BadgeRow kinds={badges} size={compact ? 22 : 24} /></h1>
          <ul className="lv-hprofile-facts" aria-label="Hub facts">
            <li className="lv-hprofile-slug">lunchvoice.com/{hub.slug}</li>
            {typeof hub.online === "number" && <li><i data-dot="online" aria-hidden="true" />{hub.online.toLocaleString("en-US")} online</li>}
            <li><i data-dot="members" aria-hidden="true" />{memberLine(hub.member_count)}</li>
            <li>{JOIN_LABEL[hub.membership_mode]}</li>
            <li>{hub.visibility === "public" ? "Public" : "Private"}</li>
            {est && <li>{est}</li>}
          </ul>
        </div>
        {actions && <div className="lv-hprofile-actions">{actions}</div>}
      </div>
      {!compact && hub.about && <p className="lv-hprofile-about">{hub.about}</p>}
      {children}
    </header>
  );
}
