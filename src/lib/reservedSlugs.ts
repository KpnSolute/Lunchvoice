// Top-level paths that can never be a Hub slug. Mirrors the list sent to the
// backend thread; lv_hub_create remains the authority.
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // live routes
  "me", "api", "analytics", "campaigns", "signin", "signout", "login", "logout", "auth", "callback", "oauth", "sso",
  "join", "invite", "invites", "discover", "discovery", "pricing", "waitlist", "beta",
  // static / system
  "assets", "static", "public", "favicon.ico", "robots.txt", "sitemap.xml", "manifest.webmanifest", ".well-known",
  "index.html",
  // near-term features
  "studio", "hubs", "hub", "explore", "search", "new", "create", "settings", "account", "billing", "notifications",
  "admin", "dashboard", "campaign", "survey", "surveys", "results", "reports", "members", "roles", "shop",
  "leaderboard", "newsroom", "comments", "pages",
  // brand / ops
  "lunchvoice", "kpnsolute", "kpnidentity", "kpn", "www", "app", "status", "docs", "help", "support", "about",
  "terms", "privacy", "blog", "legal", "security", "contact",
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export type SlugProblem = "format" | "reserved" | null;

export function slugProblem(raw: string): SlugProblem {
  const slug = raw.toLowerCase();
  if (RESERVED_SLUGS.has(slug)) return "reserved";
  if (!SLUG_RE.test(slug) || slug.includes("--")) return "format";
  return null;
}
