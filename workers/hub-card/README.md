# hub-card: share-link previews for Hubs

`hub.lunchvoice.com/<slug>` is the link the Share button copies. When Discord, Slack, iMessage, WhatsApp or X unfurl it,
this Worker answers with a small page carrying the Hub's name, member count, how to join, its about line and its
colour (Discord uses `theme-color` for the embed's side bar). Everyone else is redirected to `lunchvoice.com/<slug>`.

Why a Cloudflare Worker: lunchvoice.com is a static site on Render, which cannot vary HTML per Hub, and Supabase Edge
Functions rewrite `text/html` GET responses to `text/plain`. The domain's DNS is on Cloudflare.

Why a subdomain: lunchvoice.com points at Render with a proxied **A record**, and Cloudflare only runs this zone's
Workers in front of a Render site when the record is a proxied CNAME (O2O). So the Worker is attached to its own
Custom Domain, `hub.lunchvoice.com`, which never touches Render. The `lunchvoice.com/h/*` route is kept for the day the
apex becomes a CNAME; until then the app forwards `/h/<slug>` to `/<slug>`, so old links still open the Hub.

## Privacy

The Worker calls `lv_api.lv_hub_get` with the project's publishable key (in `wrangler.toml`; public by design) in the
`apikey` header, as a signed-out visitor. (Supabase
is retiring the legacy anon key; the Worker still accepts one as `SUPABASE_ANON_KEY` until then.) Private and missing Hubs get the
same neutral card, with no name or count. It logs nothing and stores nothing.

## Deploy

Deployed by the governing agent through the Cloudflare API (Composio), not by hand: upload the bundle
(`npx wrangler@4 deploy --dry-run --outdir <dir>` builds it), set the `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`
plain-text bindings, and attach the Custom Domain `hub.lunchvoice.com`. `wrangler deploy` from this folder does the same.

Check: `curl -s -A Discordbot https://hub.lunchvoice.com/kitchen | grep og:title`, then paste the link in Discord.

Tests: `npm run test:workers` (part of `npm run test:pr`).
