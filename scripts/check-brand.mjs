// Verifies the brand kit (brand/lv-package) and the brand files the site ships (public/). Run: npm run check:brand.
// It checks what can be checked without a browser: every required file exists; every PNG is a real PNG whose pixel
// size matches its name; logos and icons that must be transparent are; the ICO holds 16, 32 and 48; every SVG parses
// and uses only palette colours; the live LvMark draws exactly the master geometry; and no retired tagline remains.
// Rendering and looking at the files is done by `npm run brand:build`, which writes the comparison sheet.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { COLOR, GEOMETRY } from "./brand/logo.mjs";
import { TAGLINE, HOME_LINES, RETIRED_LINES, SOCIAL } from "./brand/palette.mjs";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const PKG = join(root, "brand", "lv-package");
const errors = [];
const fail = (m) => errors.push(m);
const rel = (f) => relative(root, f).replaceAll("\\", "/");

function walk(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) out.push(...walk(f));
    else out.push(f);
  }
  return out;
}

/** Width, height, colour type, and whether any pixel is not fully opaque (PNG, 8-bit, non-interlaced). */
export function pngInfo(buf) {
  try { return pngInfoUnsafe(buf); } catch { return null; }
}
function pngInfoUnsafe(buf) {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  let trns = false;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "tRNS") trns = true;
    off += 12 + len;
  }
  let translucent = trns;
  if (ctype === 6 && depth === 8 && interlace === 0) {
    const raw = inflateSync(Buffer.concat(idat));
    const stride = w * 4;
    let prev = Buffer.alloc(stride), p = 0;
    for (let y = 0; y < h && !translucent; y++) {
      const ft = raw[p++], line = Buffer.from(raw.subarray(p, p + stride)); p += stride;
      for (let x = 0; x < stride; x++) {
        const a = x >= 4 ? line[x - 4] : 0, b = prev[x], c = x >= 4 ? prev[x - 4] : 0;
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        line[x] = (line[x] + (ft === 1 ? a : ft === 2 ? b : ft === 3 ? (a + b) >> 1 : ft === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0)) & 255;
      }
      for (let x = 3; x < stride; x += 4) if (line[x] < 255) { translucent = true; break; }
      prev = line;
    }
  }
  return { w, h, ctype, translucent };
}

// 1. Required files.
const REQUIRED = [
  "README.md",
  "documentation/LunchVoice-Brand-Guidelines.pdf", "documentation/COLOR_SPEC.md", "documentation/TYPOGRAPHY.md", "documentation/AUDIT.md",
  "documentation/SOCIAL_SPECS.md", "documentation/logo-comparison-sheet.png",
  "canva/CANVA_SETUP.md", "favicons/favicon.ico", "favicons/apple-touch-icon-180.png",
  "video/outro-9x16_1080x1920.png", "video/outro-16x9_1920x1080.png", "video/lower-third_1920x1080.png", "video/title-card_1920x1080.png",
  "social/link-preview_1200x630.png",
];
for (const kind of ["logo-horizontal", "logo-stacked", "mark", "mark-small", "wordmark"]) {
  for (const t of ["on-light", "on-dark", "mono-dark", "mono-light"]) REQUIRED.push(`source-svg/lunchvoice-${kind}-${t}.svg`);
}
for (const s of [16, 24, 32, 48, 64, 128, 180, 192, 256, 512, 1024]) REQUIRED.push(`app-icons/lunchvoice-icon_${s}x${s}.png`);
for (const s of SOCIAL) REQUIRED.push(`social/${s.id}_${s.w}x${s.h}.png`);
for (const f of REQUIRED) if (!existsSync(join(PKG, f))) fail(`missing: brand/lv-package/${f}`);
for (const f of ["favicon.ico", "favicon-32.png", "apple-touch-icon-180.png", "android-icon-192.png", "app-icon-512.png", "icon-maskable-192.png", "icon-maskable-512.png", "og-image.png"]) {
  if (!existsSync(join(root, "public", f))) fail(`missing: public/${f}`);
}

// 2. PNGs: real, named size matches, transparency where it must be.
const files = walk(PKG);
const mustBeTransparent = (f) => /\/(logo|video\/overlays)\//.test(rel(f)) || /lower-third_/.test(f) || /lunchvoice-icon_\d+x\d+\.png$/.test(f) || /favicons\/favicon-\d+\.png$/.test(f);
const mustBeOpaque = (f) => /\/(social|video\/backgrounds)\//.test(rel(f)) && !/\/guides\//.test(rel(f)) || /outro|title-card|square_|maskable/.test(basename(f));
for (const f of files.filter((x) => x.endsWith(".png"))) {
  const info = pngInfo(readFileSync(f));
  if (!info) { fail(`not a PNG: ${rel(f)}`); continue; }
  const m = basename(f).match(/_(\d+)x(\d+)\.png$/) ?? basename(f).match(/_(\d+)\.png$/);
  if (m) {
    if (m[2] && (info.w !== +m[1] || info.h !== +m[2])) fail(`${rel(f)} is ${info.w} x ${info.h}, named ${m[1]} x ${m[2]}`);
    if (!m[2] && info.w !== +m[1]) fail(`${rel(f)} is ${info.w} wide, named ${m[1]}`);
  }
  if (mustBeTransparent(f) && !info.translucent) fail(`${rel(f)} should have a transparent background`);
  if (mustBeOpaque(f) && info.translucent) fail(`${rel(f)} should be fully opaque`);
}
for (const [f, w, h] of [["public/og-image.png", 1200, 630], ["public/apple-touch-icon-180.png", 180, 180], ["public/android-icon-192.png", 192, 192], ["public/app-icon-512.png", 512, 512], ["public/icon-maskable-512.png", 512, 512], ["public/favicon-32.png", 32, 32]]) {
  const info = existsSync(join(root, f)) ? pngInfo(readFileSync(join(root, f))) : null;
  if (info && (info.w !== w || info.h !== h)) fail(`${f} is ${info.w} x ${info.h}, expected ${w} x ${h}`);
}

// 3. ICO: 16, 32 and 48, each a PNG.
for (const f of [join(PKG, "favicons", "favicon.ico"), join(root, "public", "favicon.ico")]) {
  if (!existsSync(f)) continue;
  const b = readFileSync(f), n = b.length >= 6 ? b.readUInt16LE(4) : 0, sizes = [];
  for (let i = 0; i < n; i++) {
    const e = 6 + 16 * i;
    if (e + 16 > b.length) { fail(`${rel(f)} is cut short`); break; }
    const size = b[e] || 256, len = b.readUInt32LE(e + 8), at = b.readUInt32LE(e + 12);
    sizes.push(size);
    const info = at + len <= b.length ? pngInfo(b.subarray(at, at + len)) : null;
    if (!info || info.w !== size) fail(`${rel(f)}: entry ${size} is not a complete ${size}px PNG`);
  }
  if (sizes.join() !== "16,32,48") fail(`${rel(f)} holds ${sizes.join(", ")}; expected 16, 32, 48`);
}
if (existsSync(join(PKG, "favicons", "favicon.ico")) && !readFileSync(join(PKG, "favicons", "favicon.ico")).equals(readFileSync(join(root, "public", "favicon.ico")))) {
  fail("public/favicon.ico differs from brand/lv-package/favicons/favicon.ico: run npm run brand:build");
}

// 4. SVGs: parse, have a viewBox, use only palette colours, and contain no text that a font would have to draw.
const PALETTE = new Set(Object.values(COLOR).map((c) => c.toUpperCase()).concat(["#000", "#FFF", "#000000"]));
const svgs = [...files.filter((x) => x.endsWith(".svg")), ...readdirSync(join(root, "public", "brand")).filter((n) => n.endsWith(".svg")).map((n) => join(root, "public", "brand", n))];
for (const f of svgs) {
  const s = readFileSync(f, "utf8");
  if (!/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(s) || !s.trimEnd().endsWith("</svg>")) fail(`${rel(f)} is not a standalone SVG`);
  const vb = s.match(/viewBox="([\d.\- ]+)"/);
  if (!vb || vb[1].split(" ").length !== 4 || vb[1].split(" ").slice(2).some((v) => !(Number(v) > 0))) fail(`${rel(f)} has no usable viewBox`);
  const opens = (s.match(/<(?!\/)(?!\?)[a-zA-Z]+[^>]*?(?<!\/)>/g) ?? []).length, closes = (s.match(/<\/[a-zA-Z]+>/g) ?? []).length;
  if (opens !== closes) fail(`${rel(f)}: ${opens} open tags, ${closes} close tags`);
  for (const c of s.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? []) if (!PALETTE.has(c.toUpperCase())) fail(`${rel(f)} uses ${c}, which is not a brand colour`);
  if (/<text\b/.test(s)) fail(`${rel(f)} uses live text; the wordmark must be outlines`);
  if (/<image\b|data:image/.test(s)) fail(`${rel(f)} embeds a raster image`);
}
for (const n of ["lunchvoice-lockup-dark.svg", "lunchvoice-wordmark.svg", "lunchvoice-mark.svg", "lunchvoice-icon-full.svg", "lunchvoice-icon-simple.svg"]) {
  if (existsSync(join(root, "public", "brand", n)) || existsSync(join(PKG, "source-svg", n))) fail(`retired file is back: ${n}`);
}

// 5. The live logo component draws the master geometry, exactly.
{
  const tsx = readFileSync(join(root, "src", "components", "LvMark.tsx"), "utf8");
  const need = [GEOMETRY.L, GEOMETRY.V, GEOMETRY.bubble, GEOMETRY.smile, ...GEOMETRY.dots.map(([x, y]) => `cx="${x}" cy="${y}" r="${GEOMETRY.dotRadius}"`)];
  for (const g of need) if (!tsx.includes(g)) fail(`src/components/LvMark.tsx does not match scripts/brand/logo.mjs (missing ${g.slice(0, 40)}...)`);
  if (!tsx.includes('viewBox="40 4 338 373"')) fail("src/components/LvMark.tsx must use the cropped viewBox 40 4 338 373");
}

// 6. Taglines: the current one is used, no retired one remains in a current asset or page.
{
  const texts = [
    ...files.filter((x) => /\.(md|svg|txt)$/.test(x) && !/AUDIT\.md$/.test(x)),
    join(root, "index.html"), join(root, "src", "config", "seo.json"), join(root, "src", "pages", "Landing.tsx"), join(root, "public", "site.webmanifest"),
    ...readdirSync(join(root, "public", "brand")).filter((n) => n.endsWith(".svg")).map((n) => join(root, "public", "brand", n)),
  ];
  for (const f of texts) {
    const s = readFileSync(f, "utf8").replace(/\s+/g, " ");
    for (const line of RETIRED_LINES) {
      const re = new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      // A guideline may name a retired line in order to retire it; that is the only allowed mention.
      if (re.test(s) && !/(retired|not to be used|replaced|never)/i.test(s.slice(Math.max(0, s.search(re) - 200), s.search(re) + 200))) fail(`${rel(f)} still uses "${line}"`);
    }
  }
  const seo = readFileSync(join(root, "src", "config", "seo.json"), "utf8");
  if (!seo.includes(TAGLINE)) fail(`src/config/seo.json does not use the tagline "${TAGLINE}"`);
  // The home page headline rotates between the approved lines; the second line is used nowhere else that ships.
  const hero = readFileSync(join(root, "src", "lib", "heroLine.ts"), "utf8").replace(/",\s*accent:\s*"/g, " ");
  for (const line of HOME_LINES) if (!hero.includes(line)) fail(`src/lib/heroLine.ts is missing the home line "${line}"`);
  const homeOnly = HOME_LINES.filter((l) => l !== TAGLINE);
  const shipped = [join(root, "index.html"), join(root, "src", "config", "seo.json"),
    ...files.filter((x) => /\.svg$/.test(x)), ...readdirSync(join(root, "public", "brand")).filter((n) => n.endsWith(".svg")).map((n) => join(root, "public", "brand", n))];
  for (const f of shipped) for (const line of homeOnly) if (readFileSync(f, "utf8").includes(line)) fail(`${rel(f)} uses the home-page-only line "${line}"`);
}

// 7. The manifest lists the maskable icons.
{
  const m = JSON.parse(readFileSync(join(root, "public", "site.webmanifest"), "utf8"));
  for (const s of ["192x192", "512x512"]) if (!m.icons.some((i) => i.sizes === s && i.purpose === "maskable")) fail(`site.webmanifest has no maskable ${s} icon`);
}

if (errors.length) {
  console.error(`check:brand found ${errors.length} problem(s):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, files: files.length, svgs: svgs.length, pngs: files.filter((x) => x.endsWith(".png")).length }));
