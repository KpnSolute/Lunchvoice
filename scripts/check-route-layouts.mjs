// Fails when a route in src/main.tsx has no entry in src/config/routes.json, or an entry has no route.
// The dev-only /__gallery route is exempt. Run: node scripts/check-route-layouts.mjs
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Collect full route paths from the JSX route table. Attributes may contain JSX, so scan with brace depth. */
export function extractRoutes(source) {
  const paths = [];
  const stack = [];
  let i = 0;
  while (i < source.length) {
    if (source.startsWith("</Route>", i)) { stack.pop(); i += 8; continue; }
    if (!source.startsWith("<Route", i) || /[A-Za-z]/.test(source[i + 6] ?? "")) { i++; continue; }
    let j = i + 6, depth = 0;
    for (; j < source.length; j++) {
      const c = source[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    const tag = source.slice(i + 6, j);
    const selfClosing = tag.trimEnd().endsWith("/");
    const attrs = tag.replace(/\{[^]*?\}(?=\s|\/|$)/g, "{}");
    const isIndex = /(^|\s)index(\s|\/|$)/.test(attrs);
    const pm = attrs.match(/\bpath="([^"]*)"/);
    const rel = isIndex ? "" : pm ? pm[1] : null;
    const parent = stack.filter((x) => x !== null).join("/");
    if (rel !== null) paths.push(rel === "*" ? "*" : "/" + [parent, rel].filter(Boolean).join("/"));
    if (!selfClosing) stack.push(rel);
    i = j + 1;
  }
  return [...new Set(paths)].filter((p) => p !== "/__gallery");
}

export function checkRoutes(source, registry) {
  const actual = new Set(extractRoutes(source));
  const listed = new Set(registry.routes.map((r) => r.path));
  const problems = [];
  for (const p of actual) if (!listed.has(p)) problems.push(`route ${p} has no entry in routes.json`);
  for (const p of listed) if (!actual.has(p)) problems.push(`routes.json lists ${p}, but no such route exists`);
  const layouts = /^L(1[01]|[1-9])$/;
  for (const r of registry.routes) if (!layouts.test(r.layout)) problems.push(`${r.path}: unknown layout ${r.layout}`);
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const problems = checkRoutes(readFileSync("src/main.tsx", "utf8"), JSON.parse(readFileSync("src/config/routes.json", "utf8")));
  if (problems.length) { console.error(problems.map((p) => "- " + p).join("\n")); process.exit(1); }
  console.log("Every route has a layout entry.");
}
