// Pure logic for the hub-card Worker (workers/hub-card/worker.ts): which requests are link-preview bots, how a slug
// is checked, and the small HTML page chat apps read. No network, no globals; tested in card.test.ts.
//
// Privacy: the Worker asks lv_hub_get as a signed-out visitor, the same call the site makes. A private or missing Hub
// answers the same way there, so it answers the same way here: a neutral LunchVoice card, never a name or a count.

export const SITE = "https://lunchvoice.com";
/** The share host: a Worker Custom Domain. lunchvoice.com points at Render with an A record, which Cloudflare does not
 *  route through this zone's Workers (O2O needs a CNAME), so share links live on their own subdomain. */
export const SHARE_HOST = "https://hub.lunchvoice.com";
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/** `/<slug>` on the share host, or `/h/<slug>` on lunchvoice.com (any case, optional trailing slash), or null. */
export function slugFromPath(pathname: string): string | null {
  const m = /^\/(?:h\/)?([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  let raw: string;
  try { raw = decodeURIComponent(m[1]!).toLowerCase(); } catch { return null; }
  return SLUG_RE.test(raw) ? raw : null;
}

const BOTS = /discordbot|slackbot|slack-imgproxy|twitterbot|facebookexternalhit|facebot|linkedinbot|whatsapp|telegrambot|skypeuripreview|redditbot|embedly|pinterest|vkshare|applebot|googlebot|bingbot|mastodon|bluesky|iframely|quora link preview|outbrain|w3c_validator|zoombot|teams|microsoftpreview/i;
/** Link-preview crawlers get the card page; people are sent straight to the Hub. */
export const isPreviewBot = (ua: string | null) => Boolean(ua && BOTS.test(ua));

export interface HubFacts {
  name: string;
  slug: string;
  member_count: number;
  membership_mode: "open" | "approval" | "invite_only";
  about?: string | null;
  accent_hex?: string | null;
}

/** lv_hub_get's signed-out answer to the facts a card shows, or null when the Hub is private, missing or gone. */
export function factsFromHubGet(body: unknown): HubFacts | null {
  const b = body as { ok?: boolean; hub?: Record<string, unknown>; accents?: { key: string; hex: string }[] } | null;
  if (!b || b.ok !== true || !b.hub) return null;
  const h = b.hub;
  if (typeof h.name !== "string" || typeof h.slug !== "string" || typeof h.member_count !== "number") return null;
  if (h.visibility !== "public") return null;
  const mode = h.membership_mode === "open" || h.membership_mode === "approval" || h.membership_mode === "invite_only" ? h.membership_mode : "invite_only";
  const hex = (b.accents ?? []).find((a) => a.key === h.accent)?.hex ?? null;
  return { name: h.name, slug: h.slug, member_count: h.member_count, membership_mode: mode, about: typeof h.about === "string" ? h.about : null, accent_hex: hex && /^#[0-9a-f]{6}$/i.test(hex) ? hex : null };
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const JOIN: Record<HubFacts["membership_mode"], string> = { open: "Open to join", approval: "Ask to join", invite_only: "Invite only" };
const members = (n: number) => (n === 1 ? "1 member" : `${n.toLocaleString("en-US")} members`);

function clip(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function cardText(slug: string, hub: HubFacts | null): { title: string; description: string; color: string } {
  if (!hub) {
    return {
      title: "A Hub on LunchVoice",
      description: "Open it on LunchVoice to see what it is and how to join. LunchVoice: anonymous surveys and polls for any community.",
      color: "#FF9A18",
    };
  }
  const facts = `${members(hub.member_count)} · ${JOIN[hub.membership_mode]}`;
  return {
    title: clip(`${hub.name} on LunchVoice`, 70),
    description: clip(hub.about ? `${facts}. ${hub.about}` : `${facts}. Surveys, polls and results that never single anyone out.`, 200),
    color: hub.accent_hex ?? "#FF9A18",
  };
}

/** The page a chat app reads. People who land on it anyway are forwarded to the Hub at once. */
export function cardPage(slug: string, hub: HubFacts | null): string {
  const { title, description, color } = cardText(slug, hub);
  const target = `${SITE}/${slug}`;
  const e = escapeHtml;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${e(title)}</title>
<meta name="description" content="${e(description)}" />
<meta name="robots" content="noindex" />
<meta name="theme-color" content="${e(color)}" />
<link rel="canonical" href="${e(target)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="LunchVoice" />
<meta property="og:title" content="${e(title)}" />
<meta property="og:description" content="${e(description)}" />
<meta property="og:url" content="${e(`${SHARE_HOST}/${slug}`)}" />
<meta property="og:image" content="${SITE}/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="LunchVoice" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${e(title)}" />
<meta name="twitter:description" content="${e(description)}" />
<meta name="twitter:image" content="${SITE}/og-image.png" />
<meta http-equiv="refresh" content="0; url=${e(target)}" />
</head>
<body>
<p><a href="${e(target)}">Open ${e(hub?.name ?? "this Hub")} on LunchVoice</a></p>
</body>
</html>
`;
}
