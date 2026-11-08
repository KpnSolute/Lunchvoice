// Build step: make the public pages readable by search engines and link previews without JavaScript.
//
// The app is a client-rendered SPA, so every URL used to answer with the same empty <div id="root"> and the
// title "LunchVoice". After `vite build` this script reads src/config/seo.json and writes:
//   dist/index.html            the landing page, with its own head and a static content fallback
//   dist/<path>/index.html     one file per indexable page in seo.json (render.yaml rewrites to these)
//   dist/app.html              the generic SPA shell for every other route (Hubs, account, players): noindex
//   dist/sitemap.xml           the indexable pages only
//   dist/robots.txt            allows the public site, keeps private, admin and respondent routes out of crawls
// The fallback inside #root is plain HTML; React replaces it on mount, so users never interact with it.
// Run: node scripts/seo-prerender.mjs [distDir]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const FALLBACK_MARK = "<!--lv:seo-fallback-->";

/** Routes crawlers never need: sign-in, account, the respondent players and shared invite links. Exact paths end in
 * "$" so a Hub whose slug merely starts with "me" or "join" is not caught by the prefix match. */
export const DISALLOW = ["/auth/", "/signin$", "/me$", "/settings$", "/create$", "/join$", "/j/", "/c/", "/s/", "/surveys$", "/surveys/", "/reserve$", "/admin$"];

export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function pageTitle(seo, page) {
  return page.path === "/" ? page.title : page.title + seo.titleSuffix;
}

export function pageUrl(seo, path) {
  return seo.siteUrl + (path === "/" ? "/" : path);
}

function replaceTag(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`seo-prerender: index.html has no tag matching ${pattern}`);
  return html.replace(pattern, replacement);
}

function setMetaContent(html, attr, key, value) {
  const re = new RegExp(`(<meta ${attr}="${key.replace(/[:.]/g, "\\$&")}" content=")[^"]*(")`);
  return replaceTag(html, re, `$1${escapeHtml(value)}$2`);
}

/** Static content for crawlers that do not run JavaScript: the page's heading, a summary and site links. */
export function fallbackHtml(seo, page) {
  const links = seo.pages
    .map((p) => `<li><a href="${escapeHtml(p.path)}">${escapeHtml(p.h1)}</a></li>`)
    .join("");
  return (
    `<div class="lv-seo-fallback">` +
    `<p><a href="/">${escapeHtml(seo.siteName)}</a></p>` +
    `<main><h1>${escapeHtml(page.h1)}</h1><p>${escapeHtml(page.body)}</p></main>` +
    `<nav aria-label="Site"><ul>${links}</ul></nav>` +
    `</div>`
  );
}

export function renderPage(template, seo, page) {
  const title = pageTitle(seo, page);
  const url = pageUrl(seo, page.path);
  let html = template;
  html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  html = replaceTag(html, /(<link rel="canonical" href=")[^"]*(")/, `$1${escapeHtml(url)}$2`);
  html = setMetaContent(html, "name", "description", page.description);
  html = setMetaContent(html, "name", "robots", "index, follow, max-image-preview:large");
  html = setMetaContent(html, "property", "og:title", title);
  html = setMetaContent(html, "property", "og:description", page.description);
  html = setMetaContent(html, "property", "og:url", url);
  html = setMetaContent(html, "name", "twitter:title", title);
  html = setMetaContent(html, "name", "twitter:description", page.description);
  if (!html.includes(FALLBACK_MARK)) throw new Error("seo-prerender: index.html has no fallback marker in #root");
  return html.replace(FALLBACK_MARK, fallbackHtml(seo, page));
}

/** The shell for every non-public route: no canonical, noindex, empty #root. */
export function renderAppShell(template, seo) {
  let html = template;
  html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(seo.siteName)}</title>`);
  html = replaceTag(html, /\s*<link rel="canonical" href="[^"]*" \/>/, "");
  html = setMetaContent(html, "name", "robots", "noindex");
  return html.replace(FALLBACK_MARK, "");
}

export function sitemapXml(seo, lastmod) {
  const urls = seo.pages
    .map((p) =>
      `  <url><loc>${escapeHtml(pageUrl(seo, p.path))}</loc><lastmod>${lastmod}</lastmod>` +
      `<changefreq>${p.changefreq}</changefreq><priority>${Number(p.priority).toFixed(1)}</priority></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(seo) {
  return ["User-agent: *", "Allow: /", ...DISALLOW.map((p) => `Disallow: ${p}`), "", `Sitemap: ${seo.siteUrl}/sitemap.xml`, ""].join("\n");
}

export function prerender(distDir, seo, lastmod = new Date().toISOString().slice(0, 10)) {
  const template = readFileSync(join(distDir, "index.html"), "utf8");
  const written = [];
  const write = (rel, content) => {
    const file = join(distDir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    written.push(rel);
  };
  write("app.html", renderAppShell(template, seo));
  for (const page of seo.pages) {
    write(page.path === "/" ? "index.html" : join(page.path.slice(1), "index.html"), renderPage(template, seo, page));
  }
  write("sitemap.xml", sitemapXml(seo, lastmod));
  write("robots.txt", robotsTxt(seo));
  return written;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dist = process.argv[2] ?? "dist";
  const seo = JSON.parse(readFileSync("src/config/seo.json", "utf8"));
  const written = prerender(dist, seo);
  console.log(JSON.stringify({ ok: true, files: written.length, pages: seo.pages.length }));
}
