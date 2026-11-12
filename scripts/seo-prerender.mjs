// Build step: make the public pages readable by search engines and link previews without JavaScript.
//
// The app is a client-rendered SPA, so every URL used to answer with the same empty <div id="root"> and the
// title "LunchVoice". After `vite build` this script reads src/config/seo.json and writes:
//   dist/index.html            the landing page and static fallback; no canonical/robots, as hosts serve it for any path
//   dist/<path>/index.html     one file per indexable page in seo.json (render.yaml rewrites to these)
//   dist/app.html              the generic SPA shell for every other route; the app sets noindex at runtime
//   dist/sitemap.xml           the indexable pages only
//   dist/robots.txt            allows the public site, keeps private, admin and respondent routes out of crawls
// The fallback inside #root is plain HTML; React replaces it on mount, so users never interact with it.
// Run: node scripts/seo-prerender.mjs [distDir]
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const FALLBACK_MARK = "<!--lv:seo-fallback-->";

/** Routes crawlers never need: sign-in, account, the respondent players and shared invite links. Exact paths end in
 * "$" so a Hub whose slug merely starts with "me" or "join" is not caught by the prefix match. */
export const DISALLOW = ["/auth/", "/signin$", "/me$", "/settings$", "/create$", "/join$", "/j/", "/c/", "/s/", "/surveys$", "/surveys/", "/reserve$", "/admin$"];

/**
 * Indexable pages = the hand-written ones in seo.json (including /products), one page per product in products.json
 * and one per use case in useCases.json (each file is also the source of its page). Everything downstream reads seo.pages, so this is the one merge point.
 */
export function useCasePage(u, template) {
  const questions = (template?.questions ?? []).map((q) => q.prompt).join(" ");
  return {
    path: `/use-cases/${u.slug}`,
    title: u.title,
    description: u.description,
    h1: u.h1,
    body: `${u.lede}${questions ? ` Sample questions: ${questions}` : ""}`,
    changefreq: "monthly",
    priority: 0.7,
  };
}

/** One indexable page per product in products.json (the same file the /products/<slug> page renders). */
export function productPage(p) {
  return {
    path: `/products/${p.slug}`,
    title: p.title,
    description: p.description,
    h1: p.h1,
    body: `${p.lede} ${p.points.map((x) => `${x.title}. ${x.body}`).join(" ")}`,
    changefreq: "monthly",
    priority: 0.8,
  };
}

export function loadSeo(root = ".") {
  const seo = JSON.parse(readFileSync(join(root, "src/config/seo.json"), "utf8"));
  const { useCases } = JSON.parse(readFileSync(join(root, "src/config/useCases.json"), "utf8"));
  const { products } = JSON.parse(readFileSync(join(root, "src/config/products.json"), "utf8"));
  return { ...seo, pages: [...seo.pages, ...products.map(productPage), ...useCases.map((u) => useCasePage(u, null))], useCases, products };
}

export function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function pageTitle(seo, page) {
  return page.path === "/" ? page.title : page.title + seo.titleSuffix;
}

export function pageUrl(seo, path) {
  return seo.siteUrl + (path === "/" ? "/" : path);
}

// Replacements are functions, never strings: in a replacement string "$1" means "group 1", so a description such as
// "from $13/month" became group 1 plus "3/month" and broke every link preview (live until 2026-11-12).
function replaceTag(html, pattern, replacement) {
  if (!pattern.test(html)) throw new Error(`seo-prerender: index.html has no tag matching ${pattern}`);
  return html.replace(pattern, typeof replacement === "function" ? replacement : () => replacement);
}

function setMetaContent(html, attr, key, value) {
  const re = new RegExp(`(<meta ${attr}="${key.replace(/[:.]/g, "\\$&")}" content=")[^"]*(")`);
  return replaceTag(html, re, (_m, open, close) => `${open}${escapeHtml(value)}${close}`);
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
  html = replaceTag(html, /(<link rel="canonical" href=")[^"]*(")/, (_m, open, close) => `${open}${escapeHtml(url)}${close}`);
  html = setMetaContent(html, "name", "description", page.description);
  html = setMetaContent(html, "name", "robots", "index, follow, max-image-preview:large");
  html = setMetaContent(html, "property", "og:title", title);
  html = setMetaContent(html, "property", "og:description", page.description);
  html = setMetaContent(html, "property", "og:url", url);
  html = setMetaContent(html, "name", "twitter:title", title);
  html = setMetaContent(html, "name", "twitter:description", page.description);
  if (!html.includes(FALLBACK_MARK)) throw new Error("seo-prerender: index.html has no fallback marker in #root");
  return html.replace(FALLBACK_MARK, () => fallbackHtml(seo, page));
}

/**
 * The landing page is dist/index.html, which a host also serves for any path its rewrite rules do not map (a Render
 * service whose dashboard rules predate render.yaml rewrites everything to /index.html). So it must be safe at any
 * URL: no static canonical, robots or og:url, which would otherwise declare every Hub and page a copy of "/".
 * src/ui/Seo.tsx sets the right values for the actual path once the app runs.
 */
export function renderRootPage(template, seo, page) {
  let html = renderPage(template, seo, page);
  html = replaceTag(html, /\s*<link rel="canonical" href="[^"]*" \/>/, "");
  html = replaceTag(html, /\s*<meta name="robots" content="[^"]*" \/>/, "");
  html = replaceTag(html, /\s*<meta property="og:url" content="[^"]*" \/>/, "");
  return html;
}

/**
 * The shell for every other route (Hubs, account, players). It carries no static robots, canonical or og:url: hosts
 * have served it for public pages too when their rewrite rules were incomplete or out of order, and a static
 * "noindex" there makes Google drop a public page without running the app. src/ui/Seo.tsx sets noindex for every
 * path that is not in seo.json, and robots.txt keeps the private routes out of crawls.
 */
export function renderAppShell(template, seo) {
  let html = template;
  html = replaceTag(html, /<title>[^<]*<\/title>/, `<title>${escapeHtml(seo.siteName)}</title>`);
  html = replaceTag(html, /\s*<link rel="canonical" href="[^"]*" \/>/, "");
  html = replaceTag(html, /\s*<meta name="robots" content="[^"]*" \/>/, "");
  html = replaceTag(html, /\s*<meta property="og:url" content="[^"]*" \/>/, "");
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
    if (page.path === "/") write("index.html", renderRootPage(template, seo, page));
    else write(join(page.path.slice(1), "index.html"), renderPage(template, seo, page));
  }
  write("sitemap.xml", sitemapXml(seo, lastmod));
  write("robots.txt", robotsTxt(seo));
  return written;
}

/** Every `destination:` of a rewrite rule in render.yaml (the files the host is told to serve). */
export function rewriteDestinations(yaml) {
  return [...yaml.matchAll(/^\s*destination:\s*(\/\S+)\s*$/gm)].map((m) => m[1]);
}

/**
 * A host rewrite that points at a file the build did not write answers 200 with an empty body: a blank page
 * (production, 2026-11-11, every /use-cases/<slug>). So the build fails when an indexable page or a render.yaml
 * rewrite destination has no non-empty file in dist/.
 */
export function missingOutputs(distDir, seo, yaml) {
  const expected = new Set([
    ...seo.pages.map((p) => (p.path === "/" ? "/index.html" : `${p.path}/index.html`)),
    ...rewriteDestinations(yaml),
  ]);
  return [...expected].filter((rel) => {
    const file = join(distDir, rel.slice(1));
    return !existsSync(file) || statSync(file).size === 0;
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const dist = process.argv[2] ?? "dist";
  const seo = loadSeo();
  const written = prerender(dist, seo);
  const missing = missingOutputs(dist, seo, readFileSync("render.yaml", "utf8"));
  if (missing.length > 0) {
    console.error(JSON.stringify({ ok: false, error: "prerendered route has no output file", missing }));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, files: written.length, pages: seo.pages.length }));
}
