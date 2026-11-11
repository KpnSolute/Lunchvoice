import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSeo, prerender, renderAppShell, renderPage, renderRootPage, robotsTxt, sitemapXml } from "./seo-prerender.mjs";

const seo = loadSeo(); // hand-written pages plus one per use case
const routes = JSON.parse(readFileSync("src/config/routes.json", "utf8")).routes;
const template = readFileSync("index.html", "utf8");

test("every indexable page is a real public route", () => {
  for (const p of seo.pages) {
    const r = routes.find((x) => x.path === p.path || (p.path.startsWith("/use-cases/") && x.path === "/use-cases/:slug"));
    assert.ok(r, `${p.path} is not in routes.json`);
    assert.equal(r.access, "public", `${p.path} must be public to be indexed`);
  }
});

test("titles and descriptions fit search result limits and are unique", () => {
  const titles = new Set();
  for (const p of seo.pages) {
    const full = p.path === "/" ? p.title : p.title + seo.titleSuffix;
    assert.ok(full.length <= 70, `${p.path} title is ${full.length} chars`);
    assert.ok(p.description.length >= 70 && p.description.length <= 200, `${p.path} description is ${p.description.length} chars`);
    assert.ok(!titles.has(full), `duplicate title ${full}`);
    titles.add(full);
  }
});

test("render.yaml rewrites every indexable page before the catch-all", () => {
  const yaml = readFileSync("render.yaml", "utf8");
  const catchAll = yaml.indexOf("source: /*");
  assert.ok(catchAll > 0 && yaml.includes("destination: /app.html"));
  for (const p of seo.pages.filter((x) => x.path !== "/")) {
    const at = yaml.indexOf(`source: ${p.path}\n        destination: ${p.path}/index.html`);
    assert.ok(at > 0 && at < catchAll, `missing rewrite for ${p.path}`);
  }
});

test("a page gets its own head and crawlable content", () => {
  const pricing = seo.pages.find((p) => p.path === "/pricing");
  const html = renderPage(template, seo, pricing);
  assert.match(html, /<title>Pricing: free Quick Surveys, Hubs from \$13\/month · LunchVoice<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/lunchvoice.com\/pricing" \/>/);
  assert.match(html, /<meta property="og:url" content="https:\/\/lunchvoice.com\/pricing" \/>/);
  assert.match(html, /<div id="root"><div class="lv-seo-fallback">.*<h1>Free to ask/);
  assert.ok(!html.includes("lv:seo-fallback"));
});

test("the theme pre-paint script is untouched (its CSP hash in render.yaml stays valid)", async () => {
  const { createHash } = await import("node:crypto");
  const script = template.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = createHash("sha256").update(script).digest("base64");
  assert.ok(readFileSync("render.yaml", "utf8").includes(`'sha256-${hash}'`));
});

test("the SPA shell has no static robots, canonical or fallback (safe if served for a public page)", () => {
  const html = renderAppShell(template, seo);
  assert.ok(!html.includes('name="robots"'), "a static noindex would drop public pages when host rules are out of order");
  assert.ok(!html.includes('property="og:url"'));
  assert.ok(!html.includes('rel="canonical"'));
  assert.match(html, /<div id="root"><\/div>/);
});

test("sitemap and robots", () => {
  const xml = sitemapXml(seo, "2026-11-08");
  assert.equal((xml.match(/<url>/g) ?? []).length, seo.pages.length);
  assert.ok(!xml.includes("/me<") && !xml.includes("/c/"));
  const robots = robotsTxt(seo);
  assert.match(robots, /Sitemap: https:\/\/lunchvoice.com\/sitemap.xml/);
  assert.match(robots, /Disallow: \/c\//);
  assert.match(robots, /Disallow: \/me\$\n/);
});

test("prerender writes every file", () => {
  const dir = mkdtempSync(join(tmpdir(), "lv-seo-"));
  writeFileSync(join(dir, "index.html"), template);
  prerender(dir, seo, "2026-11-08");
  for (const f of ["app.html", "sitemap.xml", "robots.txt", "pricing/index.html", "how-it-works/index.html"]) {
    assert.ok(existsSync(join(dir, f)), f);
  }
  assert.match(readFileSync(join(dir, "index.html"), "utf8"), /<h1>Every voice has a story/);
});

test("the root index.html is safe when a host serves it for every path", () => {
  const html = renderRootPage(template, seo, seo.pages.find((p) => p.path === "/"));
  assert.ok(!html.includes('rel="canonical"'), "a static canonical would mark every URL a copy of /");
  assert.ok(!html.includes('name="robots"'));
  assert.ok(!html.includes('property="og:url"'));
  assert.match(html, /<h1>Every voice has a story/);
});
