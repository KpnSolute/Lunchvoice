// Badges: small icons with one meaning each, shown after a name the way Discord shows server and profile badges.
// A badge appears only when real data says so (never as decoration), and every badge has a tooltip and an accessible
// label, so meaning never depends on the icon or its colour alone.
import type { IconName } from "../components/Icon";

export type BadgeKey = "owner" | "founding" | "team" | "discover";

export interface BadgeDef {
  icon: IconName;
  label: string;
  /** One line shown in the tooltip and read by screen readers. */
  meaning: string;
  tone: "amber" | "green" | "indigo" | "ink";
}

export const BADGES: Record<BadgeKey, BadgeDef> = {
  owner: { icon: "crown", label: "Owner", meaning: "Created this Hub. The Owner is protected and can’t be removed.", tone: "amber" },
  founding: { icon: "sprout", label: "Founding Hub", meaning: "One of the first 50 Hubs on LunchVoice, from the founding waitlist.", tone: "green" },
  team: { icon: "star-fill", label: "Team Hub", meaning: "On the Team plan: more roles, pages and analytics.", tone: "indigo" },
  discover: { icon: "shield-check", label: "Listed on Discover", meaning: "Reviewed and approved by LunchVoice for the public Discover directory.", tone: "green" },
};

/** The Hub badges a Hub has earned, in display order, from the facts the backend sent. */
export function hubBadges(hub: { plan?: { family?: string | null; product?: string | null; state?: string | null } | null; listed?: boolean | null }): BadgeKey[] {
  const out: BadgeKey[] = [];
  if (hub.listed) out.push("discover");
  const active = hub.plan?.state === "active";
  if (active && hub.plan?.product === "founding") out.push("founding");
  if (active && hub.plan?.family === "team") out.push("team");
  return out;
}
