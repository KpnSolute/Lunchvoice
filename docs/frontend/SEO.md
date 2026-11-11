# Search engine optimisation (SEO)

LunchVoice is a client-rendered React app. Without help, every URL answers with the same empty page titled
"LunchVoice", which search engines and link previews (Slack, iMessage, LinkedIn, X) cannot read. This is how the
public site is made discoverable.

## What is in place

| Piece | Where | What it does |
| --- | --- | --- |
| Page metadata | `src/config/seo.json` | The single source: site URL, and for each indexable page its title, description, heading, summary text, sitemap frequency and priority. |
| Prerender | `scripts/seo-prerender.mjs` (runs in `npm run build`) | Writes `dist/<page>/index.html` per page with its own `<title>`, description, canonical URL, Open Graph and Twitter tags, plus a static content fallback inside `#root` that React replaces on mount. Also writes `sitemap.xml`, `robots.txt` and `app.html`. |
| Routing | `render.yaml` (mirror it in the Render dashboard, see below) | Rewrites each public page to its prerendered file before the catch-all; every other route gets `app.html`, the SPA shell. Neither `dist/index.html` nor `app.html` carries a static canonical or robots tag, so a missing or misordered host rule never marks a public page `noindex`; the app sets both per path. |
| Runtime head | `src/ui/Seo.tsx` | Keeps title, description, canonical and robots correct during client-side navigation. Anything not in `seo.json` is `noindex`. |
| Structured data | `index.html` (`application/ld+json`) | Organization, WebSite and SoftwareApplication with the Free, Starter Hub and Team Hub offers. |
| Share image | `public/og-image.png` (1200×630) | Used by Open Graph and Twitter cards. |
| Manifest | `public/site.webmanifest` | App name and icons. |
| Guard | `scripts/seo-prerender.test.mjs` (in `npm run test:pr`) | Every indexed page is a public route, titles fit result limits and are unique, `render.yaml` rewrites every page, the theme script's CSP hash is still valid. |

**Indexed:** `/`, `/how-it-works`, `/use-cases`, `/pricing`, `/waitlist`, `/about`, `/discover`, `/support`,
`/privacy`, `/terms`, `/guidelines`, and one page per entry in `src/config/useCases.json` (`/use-cases/<slug>`). The
use-case pages are merged into the page list by `loadSeo()` in `scripts/seo-prerender.mjs` and by `src/ui/Seo.tsx`.

**Never indexed:** account and sign-in routes, Quick Surveys, respondent players (`/c/`, `/s/`), invite links and
every Hub. A Hub belongs to its customer; making Hubs findable is the Discover feature's job (Team plan, 700 genuine
active members, approved), and would be an explicit, opt-in change.

## Adding or changing a public page

1. Add or edit its entry in `src/config/seo.json` (for a use case, add it to `src/config/useCases.json` instead) (title ≤ 70 characters with the suffix; description 70–200,
   ideally ≤ 160 so Google shows it whole).
2. Add a matching rewrite to `render.yaml` above the `/*` catch-all.
3. `npm run test:pr`.

If you change the theme script in `index.html`, recompute its CSP hash in `render.yaml` (the test fails otherwise).

## Owner actions (outside the repository)

These need the founder's accounts and cannot be done from code:

0. **Render rewrite rules.** The service's rules live in the Render dashboard (it is not synced from `render.yaml`),
   and the dashboard still had the single rule `/* -> /index.html` when SEO shipped. Until it matches `render.yaml`,
   `/pricing` and the other public pages are served the landing HTML (still safe: `dist/index.html` carries no static
   canonical or robots, and the app sets both once it runs, which Google renders). In Render → the static site →
   *Redirects/Rewrites*, make the rules match `render.yaml` in order: one `Rewrite` per public page
   (`/how-it-works -> /how-it-works/index.html`, and so on for each page in `seo.json`), then change the last rule to
   `/* -> /app.html`. Rules apply top to bottom, so `/*` must be last. Check with `curl -s https://lunchvoice.com/pricing | grep "<title>"`, which should print the
   Pricing title.
1. **Google Search Console** (search.google.com/search-console): add the *Domain* property `lunchvoice.com`, verify it
   with the DNS TXT record it gives you at the domain registrar, then submit `https://lunchvoice.com/sitemap.xml`
   under *Sitemaps*. Use *URL inspection → Request indexing* for `/` and `/pricing` to speed up the first crawl.
2. **Bing Webmaster Tools** (bing.com/webmasters): *Import from Google Search Console* (one click once step 1 is done).
   Bing also feeds DuckDuckGo, Yahoo and Ecosia.
3. **Confirm the canonical host.** All URLs assume `https://lunchvoice.com` (no `www`). In Render, make `lunchvoice.com`
   the primary custom domain and redirect `www.lunchvoice.com` to it. If the site lives elsewhere, change `siteUrl` in
   `seo.json` and the URLs in `index.html`.
4. **Google Business Profile / social profiles**: optional, but listing the site on LinkedIn, X and Product Hunt
   creates the first inbound links, which is what moves a new domain in rankings.
5. Check previews with the Facebook Sharing Debugger, the LinkedIn Post Inspector and Google's Rich Results Test.

## What moves rankings next

The technical layer above makes the site crawlable; ranking comes from content and links. In order of payoff:

- **Pages per use case** (for example "anonymous employee survey", "club election", "event feedback form",
  "school lunch survey") each with its own `seo.json` entry, real copy and a Quick Survey call to action.
- **Templates gallery** (public, indexable sample surveys) once the backend exposes templates signed out.
- **Comparison pages** ("LunchVoice vs Google Forms / SurveyMonkey") focused on anonymity and live results.
- **Inbound links** from launch posts, directories and the first Hub owners.
