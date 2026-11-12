# hub-card: share-link previews for Hubs

`lunchvoice.com/h/<slug>` is the link the Share button copies. When Discord, Slack, iMessage, WhatsApp or X unfurl it,
this Worker answers with a small page carrying the Hub's name, member count, how to join, its about line and its
colour (Discord uses `theme-color` for the embed's side bar). Everyone else is redirected to `lunchvoice.com/<slug>`.

Why a Cloudflare Worker: lunchvoice.com is a static site on Render, which cannot vary HTML per Hub, and Supabase Edge
Functions rewrite `text/html` GET responses to `text/plain`. The domain's DNS is on Cloudflare, so a Worker route on
`/h/*` runs in front of Render and leaves every other path alone.

Until it is deployed the link still works: the app forwards `/h/<slug>` to `/<slug>`; previews just show the generic
LunchVoice card.

## Privacy

The Worker calls `lv_api.lv_hub_get` with the publishable key in the `apikey` header, as a signed-out visitor. (Supabase
is retiring the legacy anon key; the Worker still accepts one as `SUPABASE_ANON_KEY` until then.) Private and missing Hubs get the
same neutral card, with no name or count. It logs nothing and stores nothing.

## Deploy (founder, once)

```bash
cd workers/hub-card
npx wrangler@4 login
npx wrangler@4 secret put SUPABASE_PUBLISHABLE_KEY   # paste the publishable key (sb_publishable_...), never a secret key
npx wrangler@4 deploy
```

Check: `curl -s -A Discordbot https://lunchvoice.com/h/<a public hub> | grep og:title`, then paste the link in Discord.

Tests: `npm run test:workers` (part of `npm run test:pr`).
