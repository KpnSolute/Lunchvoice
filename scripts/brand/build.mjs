// Builds the whole LunchVoice brand kit from scripts/brand/logo.mjs: brand/lv-package/** and the icons, link-preview
// image and logo files in public/. Run with `npm run brand:build` (needs Playwright's Chromium, which the e2e tests
// already use). Output is deterministic: run it again after any change to logo.mjs, palette.mjs or the templates and
// commit the result. `npm run check:brand` then verifies what was written.
import { chromium } from "playwright";
import { mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLOR, CLEAR, MARK_BOX, TREATMENTS, horizontalSvg, iconSvg, markSmallSvg, markSvg, stackedSvg, wordmarkSvg } from "./logo.mjs";
import { TAGLINE, SITE, SOCIAL, colorSpecMarkdown } from "./palette.mjs";
import { guidelinesHtml, comparisonHtml } from "./guidelines.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PKG = join(root, "brand", "lv-package");
const PUB = join(root, "public");
const out = (...p) => { const f = join(PKG, ...p); mkdirSync(dirname(f), { recursive: true }); return f; };
const b64 = (rel) => readFileSync(join(root, rel)).toString("base64");

// The three brand fonts, embedded so templates render the same on any machine. SIL OFL 1.1 (public/licenses).
const FONT_CSS = `
@font-face { font-family: 'Bricolage Grotesque'; font-weight: 200 800; src: url(data:font/woff2;base64,${b64("node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2")}) format('woff2'); }
@font-face { font-family: 'Geist'; font-weight: 100 900; src: url(data:font/woff2;base64,${b64("node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2")}) format('woff2'); }
@font-face { font-family: 'Space Mono'; font-weight: 400; src: url(data:font/woff2;base64,${b64("node_modules/@fontsource/space-mono/files/space-mono-latin-400-normal.woff2")}) format('woff2'); }
@font-face { font-family: 'Space Mono'; font-weight: 700; src: url(data:font/woff2;base64,${b64("node_modules/@fontsource/space-mono/files/space-mono-latin-700-normal.woff2")}) format('woff2'); }
* { box-sizing: border-box; } html, body { margin: 0; padding: 0; }
.display { font-family: 'Bricolage Grotesque', sans-serif; font-weight: 800; font-variation-settings: 'opsz' 96; letter-spacing: -0.045em; line-height: 0.95; }
.ui { font-family: 'Geist', sans-serif; }
.mono { font-family: 'Space Mono', monospace; }
`;

/** Make an inline SVG fill a box of the given pixel height (or width), keeping its ratio. */
export const sized = (svg, { h, w }) => svg.replace(/ width="[\d.]+" height="[\d.]+"/, h ? ` height="${h}" style="display:block;width:auto"` : ` width="${w}" style="display:block;height:auto"`);
const dims = (svg) => { const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/); return { w: Number(m[1]), h: Number(m[2]) }; };

let browser;
async function shot(html, w, h, file, { transparent = true } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  if (file) writeFileSync(file, buf);
  return buf;
}
/** One SVG, alone, at an exact pixel size on a transparent canvas. */
const svgPng = (svg, w, h, file) => shot(`<div style="width:${w}px;height:${h}px">${svg.replace(/ width="[\d.]+" height="[\d.]+"/, ` width="${w}" height="${h}" style="display:block"`)}</div>`, w, h, file);

async function webp(pngBuf, file, quality = 0.9) {
  const page = await browser.newPage();
  const data = await page.evaluate(async ({ src, q }) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d").drawImage(img, 0, 0);
    return c.toDataURL("image/webp", q).split(",")[1];
  }, { src: `data:image/png;base64,${pngBuf.toString("base64")}`, q: quality });
  await page.close();
  writeFileSync(file, Buffer.from(data, "base64"));
}

/** A .ico holding PNG images (every current browser and Windows read PNG-in-ICO). */
function ico(entries) {
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const dir = entries.map(({ size, png }) => {
    const d = Buffer.alloc(16);
    d.writeUInt8(size >= 256 ? 0 : size, 0); d.writeUInt8(size >= 256 ? 0 : size, 1);
    d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6); d.writeUInt32LE(png.length, 8); d.writeUInt32LE(offset, 12);
    offset += png.length;
    return d;
  });
  return Buffer.concat([head, ...dir, ...entries.map((e) => e.png)]);
}

/* ------------------------------------------------------------------ templates */

const logoH = (treatment, h) => sized(horizontalSvg(treatment), { h });
const logoS = (treatment, h) => sized(stackedSvg(treatment), { h });
const tagline = (size, { split = true, light = false } = {}) => {
  const [a, b] = TAGLINE.split(/ (?=\S+$)/); // "Make every voice" + "count."
  const c1 = light ? COLOR.ink : COLOR.bone;
  // Amber is never used for text on a light surface (1.8:1); there the whole line is ink.
  const c2 = light ? COLOR.ink : COLOR.amber;
  return `<div class="display" style="font-size:${size}px;color:${c1}">${a}${split ? "<br>" : " "}<span style="color:${c2}">${b}</span></div>`;
};
const url = (size, color = "#C9C3BA") => `<div class="mono" style="font-size:${size}px;color:${color};letter-spacing:0.02em">${SITE}</div>`;
const guideBox = (s, label) => `<div style="position:absolute;left:${s.x}px;top:${s.y}px;width:${s.w}px;height:${s.h}px;outline:${Math.max(2, Math.round(s.w / 300))}px dashed #3fd0ff;outline-offset:-1px"><span class="mono" style="position:absolute;left:8px;top:6px;font-size:${Math.max(11, Math.round(s.h / 28))}px;color:#3fd0ff;background:rgba(0,0,0,.6);padding:2px 6px">${label}</span></div>`;

/** A branded card: logo, the tagline and the address, laid out inside the platform's safe area. */
function card({ w, h, safe, layout }) {
  const s = safe ?? { x: 0, y: 0, w, h };
  const pad = Math.round(Math.min(s.w, s.h) * (layout === "strip" ? 0.14 : 0.09));
  const inner = { w: s.w - 2 * pad, h: s.h - 2 * pad };
  let body;
  if (layout === "strip") {
    // Very wide and short (LinkedIn, the YouTube banner's safe band): logo left, tagline right, one line.
    const lh = Math.round(inner.h * 0.62);
    const logoW = lh * 4.4; // the horizontal logo is about 4.4 times as wide as it is tall
    const ts = Math.round(Math.min(inner.h * 0.4, (inner.w - logoW - pad) / 9.6));
    body = `<div style="display:flex;align-items:center;justify-content:space-between;height:100%;gap:${pad}px"><div style="flex:none">${logoH("on-dark", lh)}</div><div style="white-space:nowrap">${tagline(ts, { split: false })}</div></div>`;
  } else if (layout === "centre") {
    const lh = Math.round(Math.min(inner.h * 0.34, inner.w * 0.52));
    body = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:${Math.round(lh * 0.3)}px;text-align:center"><div>${logoS("on-dark", lh)}</div>${tagline(Math.round(Math.min(inner.w * 0.128, inner.h * 0.11)))}${url(Math.round(inner.w * 0.042))}</div>`;
  } else {
    const lh = Math.round(Math.min(inner.h * 0.11, inner.w * 0.09));
    const ts = Math.round(Math.min(inner.w * 0.125, inner.h * 0.2));
    body = `<div style="display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;height:100%"><div>${logoH("on-dark", lh)}</div>${tagline(ts)}<div style="display:flex;align-items:center;gap:${Math.round(lh * 0.4)}px"><i style="display:block;width:${Math.round(lh * 1.4)}px;height:${Math.max(3, Math.round(lh * 0.1))}px;background:${COLOR.amber}"></i>${url(Math.round(lh * 0.46))}</div></div>`;
  }
  return `<div style="position:relative;width:${w}px;height:${h}px;background:${COLOR.ink};overflow:hidden"><div style="position:absolute;left:${s.x + pad}px;top:${s.y + pad}px;width:${inner.w}px;height:${inner.h}px">${body}</div></div>`;
}

async function socialAssets() {
  for (const t of SOCIAL) {
    const html = t.kind === "avatar"
      ? `<div style="width:${t.w}px;height:${t.h}px">${sized(iconSvg({ shape: "maskable" }), { h: t.h })}</div>`
      : card(t);
    const name = `${t.id}_${t.w}x${t.h}`;
    const png = await shot(html, t.w, t.h, out("social", `${name}.png`), { transparent: false });
    if (t.w * t.h >= 1280 * 720) await webp(png, out("social", `${name}.webp`));
    if (t.safe) {
      const g = html.replace(/<\/div>$/, `${guideBox(t.safe, t.safeLabel)}</div>`);
      await shot(g, t.w, t.h, out("social", "guides", `${name}_safe-area.png`), { transparent: false });
    }
  }
}

async function videoAssets() {
  const outro = (w, h) => `<div style="width:${w}px;height:${h}px;background:${COLOR.ink};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(Math.min(w, h) * 0.07)}px;text-align:center"><div>${logoS("on-dark", Math.round(Math.min(w, h) * 0.3))}</div>${tagline(Math.round(Math.min(w, h) * 0.085))}${url(Math.round(Math.min(w, h) * 0.026))}</div>`;
  await shot(outro(1080, 1920), 1080, 1920, out("video", "outro-9x16_1080x1920.png"), { transparent: false });
  await shot(outro(1920, 1080), 1920, 1080, out("video", "outro-16x9_1920x1080.png"), { transparent: false });
  // Title card: logo and an amber rule; the title itself is added in the editor, in Bricolage Grotesque 800.
  const title = `<div style="position:relative;width:1920px;height:1080px;background:${COLOR.ink}"><div style="position:absolute;left:120px;top:110px">${logoH("on-dark", 84)}</div><i style="position:absolute;left:120px;bottom:150px;display:block;width:160px;height:8px;background:${COLOR.amber}"></i><div style="position:absolute;right:120px;bottom:138px">${url(26)}</div></div>`;
  await shot(title, 1920, 1080, out("video", "title-card_1920x1080.png"), { transparent: false });
  const titleEx = title.replace(/<\/div>$/, `<div class="display" style="position:absolute;left:120px;top:360px;font-size:150px;color:${COLOR.bone};max-width:1500px">Your title goes here</div></div>`);
  await shot(titleEx, 1920, 1080, out("video", "examples", "title-card-example_1920x1080.png"), { transparent: false });
  // Lower third: a transparent 1920 x 1080 frame with the bar in the title-safe lower left. Text is added in the editor.
  const bar = (text) => `<div style="position:relative;width:1920px;height:1080px"><div style="position:absolute;left:96px;bottom:108px;height:132px;min-width:760px;display:flex;align-items:center;gap:28px;padding:0 44px 0 0;background:${COLOR.ink};border-radius:18px;overflow:hidden"><i style="display:block;align-self:stretch;width:14px;background:${COLOR.amber}"></i>${sized(markSvg("on-dark"), { h: 76 })}${text}</div></div>`;
  await shot(bar(`<span style="width:520px"></span>`), 1920, 1080, out("video", "lower-third_1920x1080.png"));
  await shot(bar(`<div><div class="ui" style="font-size:40px;font-weight:600;color:${COLOR.bone};line-height:1.15">Name Surname</div><div class="mono" style="font-size:22px;color:#C9C3BA;margin-top:6px">Role, community</div></div>`), 1920, 1080, out("video", "examples", "lower-third-example_1920x1080.png"));
  for (const [name, c] of [["ink", COLOR.ink], ["amber", COLOR.amber], ["bone", COLOR.bone], ["page", COLOR.page]]) {
    for (const [w, h] of [[1920, 1080], [1080, 1920]]) await shot(`<div style="width:${w}px;height:${h}px;background:${c}"></div>`, w, h, out("video", "backgrounds", `background-${name}_${w}x${h}.png`), { transparent: false });
  }
  // Overlay logos, transparent.
  const over = [["logo-horizontal-on-dark", horizontalSvg("on-dark"), 1600], ["logo-horizontal-mono-light", horizontalSvg("mono-light"), 1600], ["logo-horizontal-mono-dark", horizontalSvg("mono-dark"), 1600], ["mark-on-dark", markSvg("on-dark"), 800], ["mark-on-light", markSvg("on-light"), 800]];
  for (const [n, s, w] of over) { const d = dims(s); await svgPng(s, w, Math.round((w * d.h) / d.w), out("video", "overlays", `lunchvoice-${n}_${w}.png`)); }
}

/* ------------------------------------------------------------------ main */

async function main() {
  for (const d of ["source-svg", "logo", "favicons", "app-icons", "social", "video", "canva", "documentation"]) rmSync(join(PKG, d), { recursive: true, force: true });
  rmSync(join(PKG, "README.txt"), { force: true });
  browser = await chromium.launch();

  // 1. Vector sources.
  const sources = {};
  for (const t of Object.keys(TREATMENTS)) {
    sources[`lunchvoice-logo-horizontal-${t}`] = horizontalSvg(t);
    sources[`lunchvoice-logo-stacked-${t}`] = stackedSvg(t);
    sources[`lunchvoice-mark-${t}`] = markSvg(t);
    sources[`lunchvoice-mark-small-${t}`] = markSmallSvg(t);
    sources[`lunchvoice-wordmark-${t}`] = wordmarkSvg(t);
  }
  sources["lunchvoice-icon"] = iconSvg({});
  sources["lunchvoice-icon-small"] = iconSvg({ small: true });
  sources["lunchvoice-icon-square"] = iconSvg({ shape: "square" });
  sources["lunchvoice-icon-maskable"] = iconSvg({ shape: "maskable" });
  for (const [n, s] of Object.entries(sources)) writeFileSync(out("source-svg", `${n}.svg`), s);

  // 2. Logo PNGs, transparent, by width.
  const widths = { "logo-horizontal": [400, 800, 1600, 3200], "logo-stacked": [300, 600, 1200, 2400], mark: [128, 256, 512, 1024, 2048], wordmark: [800, 1600] };
  for (const [n, s] of Object.entries(sources)) {
    const kind = Object.keys(widths).find((k) => n.startsWith(`lunchvoice-${k}-`) && !n.includes("mark-small"));
    if (!kind) continue;
    const d = dims(s);
    for (const w of widths[kind]) await svgPng(s, w, Math.round((w * d.h) / d.w), out("logo", `${n}_${w}.png`));
  }
  // The symbol centred on a square transparent canvas, for avatars and anywhere a square file is required.
  for (const t of ["on-light", "on-dark"]) {
    await shot(`<div style="width:1024px;height:1024px;display:grid;place-items:center">${sized(markSvg(t), { h: 640 })}</div>`, 1024, 1024, out("logo", `lunchvoice-mark-square-${t}_1024x1024.png`));
  }

  // 3. Icons. Under 48px the small-size symbol is used; from 48px the full mark.
  const SIZES = [16, 24, 32, 48, 64, 128, 180, 192, 256, 512, 1024];
  const iconPng = {};
  for (const s of SIZES) {
    iconPng[s] = await svgPng(iconSvg({ small: s < 48 }), s, s, out("app-icons", `lunchvoice-icon_${s}x${s}.png`));
    if (s <= 64) copyFileSync(out("app-icons", `lunchvoice-icon_${s}x${s}.png`), out("favicons", `favicon-${s}.png`));
  }
  const square180 = await svgPng(iconSvg({ shape: "square" }), 180, 180, out("favicons", "apple-touch-icon-180.png"));
  const mask192 = await svgPng(iconSvg({ shape: "maskable" }), 192, 192, out("app-icons", "lunchvoice-icon-maskable_192x192.png"));
  const mask512 = await svgPng(iconSvg({ shape: "maskable" }), 512, 512, out("app-icons", "lunchvoice-icon-maskable_512x512.png"));
  await svgPng(iconSvg({ shape: "square" }), 1024, 1024, out("app-icons", "lunchvoice-icon-square_1024x1024.png"));
  const icoBuf = ico([16, 32, 48].map((size) => ({ size, png: iconPng[size] })));
  writeFileSync(out("favicons", "favicon.ico"), icoBuf);
  await webp(iconPng[512], out("app-icons", "lunchvoice-icon_512x512.webp"), 0.95);

  // 4. Social and video.
  await socialAssets();
  await videoAssets();

  // 5. Link preview image (1200 x 630) and the Discord bot's avatar, from the same source.
  const og = `<div style="position:relative;width:1200px;height:630px;background:${COLOR.ink}"><div style="position:absolute;left:72px;top:64px">${logoH("on-dark", 58)}</div><div style="position:absolute;left:72px;top:232px">${tagline(96)}</div><div class="ui" style="position:absolute;left:72px;bottom:64px;font-size:22px;color:#C9C3BA">Anonymous surveys and polls for any community · ${SITE}</div></div>`;
  const ogPng = await shot(og, 1200, 630, out("social", "link-preview_1200x630.png"), { transparent: false });
  const discordIcon = await svgPng(iconSvg({ shape: "square" }), 1024, 1024);

  // 6. Canva folder: the handful of files to upload, under short names.
  const canva = [
    ["logo/lunchvoice-logo-horizontal-on-light_1600.png", "01-logo-primary-for-light-backgrounds.png"],
    ["logo/lunchvoice-logo-horizontal-on-dark_1600.png", "02-logo-primary-for-dark-backgrounds.png"],
    ["logo/lunchvoice-logo-stacked-on-light_1200.png", "03-logo-stacked-for-light-backgrounds.png"],
    ["logo/lunchvoice-logo-stacked-on-dark_1200.png", "04-logo-stacked-for-dark-backgrounds.png"],
    ["logo/lunchvoice-mark-on-light_1024.png", "05-symbol-for-light-backgrounds.png"],
    ["logo/lunchvoice-mark-on-dark_1024.png", "06-symbol-for-dark-backgrounds.png"],
    ["logo/lunchvoice-logo-horizontal-mono-light_1600.png", "07-logo-all-white.png"],
    ["logo/lunchvoice-logo-horizontal-mono-dark_1600.png", "08-logo-all-ink.png"],
    ["app-icons/lunchvoice-icon_1024x1024.png", "09-app-icon.png"],
    ["source-svg/lunchvoice-logo-horizontal-on-light.svg", "svg/logo-primary-for-light-backgrounds.svg"],
    ["source-svg/lunchvoice-logo-horizontal-on-dark.svg", "svg/logo-primary-for-dark-backgrounds.svg"],
    ["source-svg/lunchvoice-mark-on-light.svg", "svg/symbol-for-light-backgrounds.svg"],
    ["source-svg/lunchvoice-mark-on-dark.svg", "svg/symbol-for-dark-backgrounds.svg"],
    ["video/lower-third_1920x1080.png", "video/lower-third.png"],
    ["video/outro-9x16_1080x1920.png", "video/outro-vertical.png"],
    ["video/outro-16x9_1920x1080.png", "video/outro-wide.png"],
    ["video/title-card_1920x1080.png", "video/title-card.png"],
    ["social/instagram-square_1080x1080.png", "templates/instagram-square.png"],
    ["social/instagram-portrait_1080x1350.png", "templates/instagram-portrait.png"],
    ["social/instagram-reel_1080x1920.png", "templates/reel-or-short-cover.png"],
    ["social/youtube-thumbnail_1280x720.png", "templates/youtube-thumbnail.png"],
  ];
  for (const [from, to] of canva) copyFileSync(join(PKG, from), out("canva", to));

  // 7. Documentation: colour spec, comparison sheet, guidelines PDF.
  writeFileSync(out("documentation", "COLOR_SPEC.md"), colorSpecMarkdown(readFileSync(join(root, "src/ui/tokens.css"), "utf8")));
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}</style></head><body>${comparisonHtml(sources, sized, { iconSvg })}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out("documentation", "logo-comparison-sheet.png"), fullPage: true });
    await page.close();
  }
  {
    const img = (rel) => `data:image/png;base64,${readFileSync(join(PKG, rel)).toString("base64")}`;
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}</style></head><body>${guidelinesHtml({ sources, sized, img, tokens: readFileSync(join(root, "src/ui/tokens.css"), "utf8") })}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: out("documentation", "LunchVoice-Brand-Guidelines.pdf"), format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
    await page.close();
  }

  // Hand-written documents live in scripts/brand/docs and are copied in, so a rebuild never loses them.
  const DOCS = join(root, "scripts", "brand", "docs");
  copyFileSync(join(DOCS, "README.md"), join(PKG, "README.md"));
  for (const f of ["AUDIT.md", "BRAND_GUIDELINES.md", "TYPOGRAPHY.md", "SOCIAL_SPECS.md"]) copyFileSync(join(DOCS, f), out("documentation", f));
  for (const f of ["CANVA_SETUP.md", "COLORS.md", "FONTS.md"]) copyFileSync(join(DOCS, f), out("canva", f));
  copyFileSync(out("documentation", "LunchVoice-Brand-Guidelines.pdf"), out("canva", "LunchVoice-Brand-Guidelines.pdf"));

  // 8. The website's copies.
  copyFileSync(out("favicons", "favicon.ico"), join(PUB, "favicon.ico"));
  copyFileSync(out("favicons", "favicon-32.png"), join(PUB, "favicon-32.png"));
  writeFileSync(join(PUB, "apple-touch-icon-180.png"), square180);
  writeFileSync(join(PUB, "android-icon-192.png"), iconPng[192]);
  writeFileSync(join(PUB, "app-icon-512.png"), iconPng[512]);
  writeFileSync(join(PUB, "icon-maskable-192.png"), mask192);
  writeFileSync(join(PUB, "icon-maskable-512.png"), mask512);
  writeFileSync(join(PUB, "og-image.png"), ogPng);
  writeFileSync(join(PUB, "brand", "discord-icon.png"), discordIcon);
  for (const old of ["lunchvoice-lockup-dark.svg", "lunchvoice-wordmark.svg", "lunchvoice-mark.svg"]) rmSync(join(PUB, "brand", old), { force: true });
  for (const n of ["lunchvoice-logo-horizontal-on-light", "lunchvoice-logo-horizontal-on-dark", "lunchvoice-logo-stacked-on-light", "lunchvoice-logo-stacked-on-dark", "lunchvoice-mark-on-light", "lunchvoice-mark-on-dark", "lunchvoice-icon"]) {
    copyFileSync(out("source-svg", `${n}.svg`), join(PUB, "brand", `${n}.svg`));
  }

  await browser.close();
  console.log(JSON.stringify({ ok: true, clearSpaceUnit: CLEAR, markBox: MARK_BOX, package: "brand/lv-package", existsReadme: existsSync(join(PKG, "README.md")) }));
}

main().catch((e) => { console.error(e); process.exit(1); });
