// Cloudflare Worker on the Custom Domain hub.lunchvoice.com (and the route lunchvoice.com/h/*; see README.md). Chat apps that unfurl a Hub's share link get a
// card with the Hub's name, member count, how to join and its colour; everyone else is sent to lunchvoice.com/<slug>.
// It reads the public lv_api.lv_hub_get with the public publishable key (apikey header only), exactly as a signed-out visitor would.
import { cardPage, factsFromHubGet, isPreviewBot, slugFromPath, SITE } from "./card";

// SUPABASE_PUBLISHABLE_KEY (sb_publishable_...) replaces the legacy anon key, which Supabase retires; either is accepted.
interface Env { SUPABASE_URL: string; SUPABASE_PUBLISHABLE_KEY?: string; SUPABASE_ANON_KEY?: string }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const slug = slugFromPath(url.pathname);
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { allow: "GET, HEAD" } });
    if (!slug) return Response.redirect(url.pathname === "/" ? `${SITE}/discover` : `${SITE}/`, 302);
    if (!isPreviewBot(req.headers.get("user-agent"))) return Response.redirect(`${SITE}/${slug}`, 302);

    let facts = null;
    const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY;
    if (key) try {
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/lv_hub_get`, {
        method: "POST",
        headers: { apikey: key, "content-type": "application/json", "content-profile": "lv_api", "accept-profile": "lv_api" },
        body: JSON.stringify({ p_slug: slug }),
        cf: { cacheTtl: 300, cacheEverything: false },
      } as RequestInit);
      if (r.ok) facts = factsFromHubGet(await r.json());
    } catch { /* the neutral card below */ }

    return new Response(req.method === "HEAD" ? null : cardPage(slug, facts), {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; img-src https://lunchvoice.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        "referrer-policy": "strict-origin-when-cross-origin",
      },
    });
  },
};
