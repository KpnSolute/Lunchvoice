// What a Hub's share link and invite message say. Pure, so the card, the share dialog and the link-preview function
// (supabase/functions/_shared/hubCard.ts) cannot drift apart; unit-tested in hubShare.test.ts.
import type { MembershipMode } from "./lvApi";

export const SITE = "https://lunchvoice.com";

/**
 * The link people paste into Discord, Slack or a text. `/h/<slug>` is served by the hub-card function, which gives
 * chat apps a preview with the Hub's name, member count and colour, then sends people on to `/<slug>`. Until that
 * function is live the app itself forwards `/h/<slug>` to `/<slug>`, so the link always works.
 */
export const hubShareUrl = (slug: string) => `${SITE}/h/${slug}`;
export const hubPageUrl = (slug: string) => `${SITE}/${slug}`;

export const JOIN_LABEL: Record<MembershipMode, string> = {
  open: "Open to join",
  approval: "Ask to join",
  invite_only: "Invite only",
};

export function memberLine(count: number): string {
  return count === 1 ? "1 member" : `${count.toLocaleString("en-US")} members`;
}

/** The message the "Copy invite" button puts on the clipboard. */
export function inviteMessage(hub: { name: string; slug: string; membership_mode: MembershipMode }): string {
  const ask = hub.membership_mode === "invite_only" ? "Take a look at" : hub.membership_mode === "approval" ? "Ask to join" : "Join";
  return `${ask} ${hub.name} on LunchVoice: ${hubShareUrl(hub.slug)}`;
}

/** "Est. Nov 2026" from an ISO date, or null when the backend did not send one. Never guessed. */
export function establishedLine(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  return `Est. ${d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}`;
}
