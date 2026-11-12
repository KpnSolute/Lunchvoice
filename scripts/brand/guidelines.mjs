// The brand guidelines PDF and the logo comparison sheet, as HTML that scripts/brand/build.mjs prints with Chromium.
// Every picture in them is the real asset (the generated SVG or PNG), never a redrawn approximation.
import { COLOR, CLEAR, MARK_BOX } from "./logo.mjs";
import { TAGLINE, SITE, SOCIAL, contrast, hexToRgb, rgbToHsl, readThemes } from "./palette.mjs";

const BG = { page: COLOR.page, white: COLOR.white, ink: COLOR.ink, amber: COLOR.amber, bone: COLOR.bone };
const LABEL = { "on-light": "Full colour, for light backgrounds", "on-dark": "Full colour, for dark backgrounds", "mono-dark": "One colour, ink", "mono-light": "One colour, white" };
const USE_ON = { "on-light": ["page", "white", "bone"], "on-dark": ["ink"], "mono-dark": ["white", "amber"], "mono-light": ["ink", "amber"] };

export function comparisonHtml(sources, sized, { iconSvg }) {
  const tile = (svg, bg, h, cap) => `<figure style="margin:0"><div style="background:${BG[bg]};height:${h + 72}px;min-width:${h + 72}px;padding:36px;display:flex;align-items:center;justify-content:center;border:1px solid #cfcdc8">${sized(svg, { h })}</div><figcaption class="mono" style="font-size:12px;color:#4A4540;margin-top:6px">${cap}</figcaption></figure>`;
  const row = (title, items) => `<h2 class="ui" style="font-size:18px;font-weight:600;margin:34px 0 12px">${title}</h2><div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-end">${items.join("")}</div>`;
  const kinds = [["logo-horizontal", "Primary horizontal logo", 84], ["logo-stacked", "Stacked logo", 170], ["mark", "Symbol", 120], ["mark-small", "Small-size symbol (under 48px)", 64], ["wordmark", "Wordmark", 44]];
  let h = `<div style="padding:40px 44px;background:#F6F5F2;width:1600px"><h1 class="display" style="font-size:44px;margin:0 0 4px">LunchVoice logo comparison sheet</h1><p class="ui" style="margin:0;color:#4A4540;font-size:15px">Every variant, generated from one vector source (scripts/brand/logo.mjs), on the backgrounds it is approved for.</p>`;
  for (const [k, title, hh] of kinds) {
    const items = [];
    for (const t of Object.keys(USE_ON)) for (const bg of USE_ON[t]) items.push(tile(sources[`lunchvoice-${k}-${t}`], bg, hh, `${t} on ${bg}`));
    h += row(title, items);
  }
  const sizes = [16, 24, 32, 48, 64, 128, 180, 192, 256];
  const icons = (bg) => sizes.map((s) => `<figure style="margin:0;text-align:center"><div style="background:${BG[bg]};padding:14px;display:grid;place-items:center;border:1px solid #cfcdc8">${sized(iconSvg({ small: s < 48 }), { h: s })}</div><figcaption class="mono" style="font-size:12px;color:#4A4540;margin-top:6px">${s}px</figcaption></figure>`);
  h += row("Icon, at every small size, on light", icons("page")) + row("Icon, on dark", icons("ink")) + row("Icon, on white", icons("white"));
  h += row("Icon shapes", [tile(iconSvg({}), "page", 150, "rounded (general use)"), tile(iconSvg({ shape: "square" }), "page", 150, "square (iOS rounds it)"), tile(iconSvg({ shape: "maskable" }), "page", 150, "maskable (Android may crop to a circle)")]);
  return h + "</div>";
}

const css = `
@page { size: A4; margin: 0; }
body { font-family: 'Geist', sans-serif; color: ${COLOR.ink}; font-size: 10.5pt; line-height: 1.5; }
.pg { width: 210mm; height: 297mm; padding: 18mm 18mm 16mm; page-break-after: always; position: relative; overflow: hidden; background: #fff; }
.pg.ink { background: ${COLOR.ink}; color: ${COLOR.bone}; }
h1 { font-family: 'Bricolage Grotesque'; font-weight: 800; font-variation-settings: 'opsz' 96; letter-spacing: -0.04em; line-height: 1; font-size: 30pt; margin: 0 0 4mm; }
h2 { font-size: 12.5pt; font-weight: 600; margin: 7mm 0 2mm; }
p { margin: 0 0 3mm; max-width: 150mm; }
.num { font-family: 'Space Mono'; font-size: 8.5pt; color: #6A645E; margin-bottom: 2mm; }
.foot { position: absolute; left: 18mm; right: 18mm; bottom: 9mm; display: flex; justify-content: space-between; font-family: 'Space Mono'; font-size: 7.5pt; color: #6A645E; }
.ink .foot, .ink .num { color: #A39D94; }
.grid { display: grid; gap: 5mm; }
.tile { border: 0.3mm solid #DAD8D4; border-radius: 3mm; padding: 7mm; display: flex; align-items: center; justify-content: center; }
.cap { font-size: 8.5pt; color: #4A4540; margin-top: 1.5mm; }
table { border-collapse: collapse; width: 100%; font-size: 8.8pt; }
th, td { text-align: left; padding: 1.6mm 2mm; border-bottom: 0.2mm solid #DAD8D4; vertical-align: top; }
th { font-weight: 600; color: #4A4540; }
code, .m { font-family: 'Space Mono'; font-size: 8.3pt; }
.sw { display: inline-block; width: 6mm; height: 6mm; border-radius: 1.2mm; border: 0.2mm solid #DAD8D4; vertical-align: middle; }
ul { margin: 0 0 3mm; padding-left: 5mm; max-width: 155mm; } li { margin-bottom: 1mm; }
.no { position: relative; } .no::after { content: ""; position: absolute; left: 6%; right: 6%; top: 50%; border-top: 0.7mm solid #C2382B; transform: rotate(-18deg); }
`;

export function guidelinesHtml({ sources, sized, img, tokens }) {
  const S = (n) => sources[`lunchvoice-${n}`];
  const T = readThemes(tokens).light;
  let n = 0;
  const page = (title, body, cls = "") => `<section class="pg ${cls}"><div class="num">${String(++n).padStart(2, "0")}</div><h1>${title}</h1>${body}<div class="foot"><span>LunchVoice brand guidelines</span><span>${SITE}</span></div></section>`;
  const tile = (svg, bg, h, cap, extra = "") => `<div><div class="tile ${extra}" style="background:${BG[bg]};min-height:${h + 16}mm">${sized(svg, { h: `${h}mm` })}</div>${cap ? `<div class="cap">${cap}</div>` : ""}</div>`;
  const X = CLEAR, b = MARK_BOX;
  // Construction diagram: the mark with its clear-space box drawn around it.
  const construct = `<svg viewBox="${-X - 6} ${-X - 6} ${b.w + 2 * X + 12} ${b.h + 2 * X + 12}" style="height:78mm;display:block"><rect x="${-X}" y="${-X}" width="${b.w + 2 * X}" height="${b.h + 2 * X}" fill="none" stroke="#3A7BD5" stroke-width="2" stroke-dasharray="10 8"/><rect x="0" y="0" width="${b.w}" height="${b.h}" fill="none" stroke="#3A7BD5" stroke-width="1.5"/>${S("mark-on-light").replace(/<svg[^>]*>|<\/svg>|<title>.*?<\/title>/gs, "")}<g font-family="Space Mono" font-size="20" fill="#3A7BD5"><text x="${b.w / 2 - 8}" y="${-X / 2 + 6}">x</text><text x="${-X / 2 - 6}" y="${b.h / 2}">x</text><text x="${b.w + X / 2 - 6}" y="${b.h / 2}">x</text><text x="${b.w / 2 - 8}" y="${b.h + X / 2 + 6}">x</text></g><rect x="${218 - b.x}" y="0" width="160" height="${X}" fill="#3A7BD5" opacity="0.18"/></svg>`;
  const swatch = (name, hex, fg, use) => { const rgb = hexToRgb(hex); const hsl = rgbToHsl(rgb); return `<tr><td><span class="sw" style="background:${hex}"></span></td><td><b>${name}</b></td><td class="m">${hex}</td><td class="m">${rgb.join(", ")}</td><td class="m">${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%</td><td>${fg}</td><td>${use}</td></tr>`; };
  const pair = (label, fg, bg) => { const r = contrast(fg, bg); return `<tr><td><span style="display:inline-block;padding:1mm 3mm;border-radius:1.2mm;background:${bg};color:${fg};font-weight:600;border:0.2mm solid #DAD8D4">Aa</span></td><td>${label}</td><td class="m">${r}:1</td><td>${r >= 4.5 ? "Text and icons" : r >= 3 ? "Large text and icons only" : "Not for text"}</td></tr>`; };

  const pages = [];
  pages.push(`<section class="pg ink"><div style="position:absolute;left:18mm;top:22mm">${sized(S("logo-horizontal-on-dark"), { h: "16mm" })}</div><div style="position:absolute;left:18mm;bottom:52mm"><div style="font-family:'Bricolage Grotesque';font-weight:800;font-variation-settings:'opsz' 96;letter-spacing:-0.045em;line-height:0.95;font-size:54pt">Brand<br>guidelines</div><p style="margin-top:8mm;color:#C9C3BA;max-width:120mm">How LunchVoice looks, in one place: the logo, the colours, the type, and how to use them on the site, in the app, on social media and in video.</p></div><div class="foot"><span>Version 1.0 · November 2026</span><span>${SITE}</span></div></section>`);

  pages.push(page("Who we are", `
    <p>LunchVoice is a surveys and feedback platform for any community: clubs, teams, events, classrooms, workplaces and online communities. People answer anonymously or by name, and the community sees what was decided.</p>
    <p>The name is one word with a capital L and a capital V: <b>LunchVoice</b>. Never "Lunch Voice", "Lunchvoice" or "LUNCHVOICE" in running text.</p>
    <h2>Tagline</h2>
    <div style="font-family:'Bricolage Grotesque';font-weight:800;font-variation-settings:'opsz' 96;letter-spacing:-0.045em;font-size:34pt;line-height:1;margin:2mm 0 4mm">${TAGLINE}</div>
    <p>This is the one tagline. It appears beside or below the logo in marketing, never inside the logo file. The logo always works without it.</p>
    <p>The home page headline alternates: each visitor is shown either "Make every voice count." or "Every voice has a story. Hear it.", and keeps that one on later visits. The second line belongs to the home page only. Retired, not to be used on anything new: "Smart feedback. Better cafeterias." LunchVoice is not a cafeteria product; dining is one of many uses.</p>
    <h2>Character</h2>
    <ul><li><b>Ink anchors.</b> Most of what you see is ink on a calm neutral, or bone on ink.</li><li><b>Amber is the accent.</b> One amber thing per screen or graphic: the thing that matters most.</li><li><b>Confident, not loud.</b> Big, tight display type; plain words; no stock photos, no invented numbers, no emoji standing in for icons.</li></ul>`));

  pages.push(page("The logo", `
    <p>The logo is the LV symbol and the LunchVoice wordmark. The symbol is an L and a V, an amber speech bubble with three dots, and an amber smile beneath. It was not redrawn for this kit: the shapes are the approved ones, now kept in one file from which every version is generated.</p>
    <div class="grid" style="grid-template-columns:1.5fr 1fr;margin-top:4mm">${tile(S("logo-horizontal-on-light"), "page", 22, "Primary horizontal logo. Use this first.")}${tile(S("logo-stacked-on-light"), "page", 30, "Stacked logo, for centred and square layouts.")}</div>
    <div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin-top:5mm">${tile(S("mark-on-light"), "page", 24, "Symbol, when the name is already nearby.")}${tile(S("wordmark-on-light"), "page", 9, "Wordmark alone, rarely.")}${tile(sources["lunchvoice-icon"], "page", 24, "Icon: the symbol in white on an amber tile.")}</div>
    <h2>The wordmark</h2>
    <p>Bricolage Grotesque, weight 800, optical size 96, tracking -0.03em, converted to outlines so it looks the same everywhere. Do not retype it in another font.</p>`));

  pages.push(page("Construction and clear space", `
    <div style="display:flex;gap:10mm;align-items:flex-start"><div>${construct}</div><div style="max-width:76mm">
    <p><b>x</b> is the height of the speech bubble's body (shaded). Keep at least <b>x</b> of empty space on every side of the logo, measured from its outermost edges.</p>
    <p>In the horizontal logo the wordmark's capital height is half the height of the L, and the wordmark is centred on the L and V, not on the whole symbol. In the stacked logo the L and V, not the bubble, sit on the centre line.</p>
    <h2>Smallest sizes</h2>
    <table><tr><th>Version</th><th>Screen</th><th>Print</th></tr><tr><td>Horizontal logo</td><td>96px wide</td><td>25mm</td></tr><tr><td>Stacked logo</td><td>72px wide</td><td>20mm</td></tr><tr><td>Symbol</td><td>24px tall</td><td>7mm</td></tr><tr><td>Small-size symbol and icon</td><td>16px</td><td>4mm</td></tr></table>
    </div></div>
    <h2>Small sizes</h2>
    <p>Below 48px the smile and the three dots blur into noise, so the small-size symbol leaves them out. The L, the V and the bubble are the same shapes. Icon files under 48px already use it; do not shrink the full symbol instead.</p>
    <div style="display:flex;gap:6mm;align-items:flex-end;margin-top:3mm">${[64, 48, 32, 24, 16].map((s) => `<div style="text-align:center">${sized(sources[s < 48 ? "lunchvoice-icon-small" : "lunchvoice-icon"], { h: `${s}px` })}<div class="cap">${s}px</div></div>`).join("")}</div>`));

  pages.push(page("Colour versions", `
    <p>Four treatments of the same drawing. Pick by background, not by taste.</p>
    <div class="grid" style="grid-template-columns:1fr 1fr">${tile(S("logo-horizontal-on-light"), "page", 16, "<b>For light backgrounds.</b> Ink letters, amber bubble and smile. Page, white or bone.")}${tile(S("logo-horizontal-on-dark"), "ink", 16, "<b>For dark backgrounds.</b> Bone letters, amber bubble and smile. Ink or any dark photo or video.")}${tile(S("logo-horizontal-mono-dark"), "white", 16, "<b>One colour, ink.</b> When colour cannot be printed, and on amber.")}${tile(S("logo-horizontal-mono-light"), "ink", 16, "<b>One colour, white.</b> Over video and photos, and on amber.")}</div>
    <h2>On amber</h2>
    <div class="grid" style="grid-template-columns:1fr 1fr">${tile(S("logo-horizontal-mono-dark"), "amber", 14, "Ink on amber: preferred.")}${tile(S("logo-horizontal-mono-light"), "amber", 14, "White on amber: large sizes only.")}</div>
    <p style="margin-top:4mm">Every file has a transparent background. In the one-colour versions the dots are cut out of the bubble and a thin gap separates the bubble from the V, so the logo stays a single flat colour.</p>`));

  pages.push(page("Using the logo well", `
    <h2>Do</h2>
    <ul><li>Use the files in this kit as they are. Scale them in proportion.</li><li>Keep the clear space, and put the logo on a plain area of a photo or video.</li><li>Use the dark-background version on anything darker than a mid grey.</li></ul>
    <h2>Do not</h2>
    <div class="grid" style="grid-template-columns:1fr 1fr 1fr">
      ${tile(S("logo-horizontal-on-light"), "ink", 11, "Ink letters on a dark background: they disappear.", "no")}
      <div><div class="tile no" style="background:${BG.page};min-height:27mm"><div style="transform:scaleX(1.5)">${sized(S("mark-on-light"), { h: "14mm" })}</div></div><div class="cap">Stretch or squash it.</div></div>
      <div><div class="tile no" style="background:${BG.page};min-height:27mm"><div style="filter:hue-rotate(160deg)">${sized(S("logo-horizontal-on-light"), { h: "11mm" })}</div></div><div class="cap">Change the colours.</div></div>
      <div><div class="tile no" style="background:${BG.page};min-height:27mm"><div style="filter:drop-shadow(1.2mm 1.2mm 1mm rgba(0,0,0,.5))">${sized(S("logo-horizontal-on-light"), { h: "11mm" })}</div></div><div class="cap">Add shadows, glows, outlines or gradients.</div></div>
      <div><div class="tile no" style="background:${BG.page};min-height:27mm"><div style="transform:rotate(-12deg)">${sized(S("logo-horizontal-on-light"), { h: "11mm" })}</div></div><div class="cap">Rotate or tilt it.</div></div>
      <div><div class="tile no" style="background:${BG.page};min-height:27mm;flex-direction:column;gap:1.5mm">${sized(S("mark-on-light"), { h: "12mm" })}<span style="font-family:Georgia,serif;font-weight:700;font-size:13pt">LunchVoice</span></div><div class="cap">Retype the name in another font, or redraw the symbol.</div></div>
    </div>
    <p style="margin-top:4mm">Also never: put a tagline inside the logo, use the old rounded LV with soft corners, or use any file that says "Better cafeterias".</p>`));

  pages.push(page("Colour", `
    <p>Five brand colours. The product's full token list, in light, dark and high contrast, with every measured contrast ratio, is in <code>COLOR_SPEC.md</code> beside this document; the live source is <code>src/ui/tokens.css</code>.</p>
    <table><tr><th></th><th>Name</th><th>HEX</th><th>RGB</th><th>HSL</th><th>Put on it</th><th>Use</th></tr>
      ${swatch("Amber", T.accent, "Ink", "The accent")}${swatch("Ink", T.text, "Bone, white", "The anchor")}${swatch("Bone", T["on-primary"], "Ink", "Text on ink")}${swatch("Page", T.page, "Ink", "Page background")}${swatch("White", T.surface, "Ink", "Cards, surfaces")}
    </table>
    <h2>Supporting colours</h2>
    <table><tr><th></th><th>Name</th><th>HEX</th><th>RGB</th><th>HSL</th><th>Put on it</th><th>Use</th></tr>
      ${swatch("Deep amber", T["accent-deep"], "Ink", "Hover, outlines")}${swatch("Light amber", T["accent-light"], "Ink", "Amber on dark")}${swatch("Amber text", T["accent-text"], "—", "Amber that must be read")}${swatch("Muted", T.muted, "—", "Supporting text")}${swatch("Subtle", T.subtle, "—", "Captions")}${swatch("Line", T.line, "—", "Hairlines")}${swatch("Success", T.success, "White", "Success")}${swatch("Danger", T.danger, "White", "Errors, destructive")}
    </table>
    <h2>How much of each</h2>
    <div style="display:flex;height:14mm;border-radius:2mm;overflow:hidden;border:0.2mm solid #DAD8D4"><i style="flex:46;background:${T.page}"></i><i style="flex:14;background:${T.surface}"></i><i style="flex:30;background:${T.text}"></i><i style="flex:10;background:${T.accent}"></i></div>
    <p class="cap">Roughly: neutrals lead, ink anchors, amber is about a tenth. A graphic may flip to mostly ink; it never becomes mostly amber except a deliberate full-amber background.</p>`));

  pages.push(page("Colour you can read", `
    <p>Measured WCAG contrast ratios, rounded down. Text needs 4.5:1; text of 24px and up (or 19px bold and up) and icons need 3:1.</p>
    <table><tr><th></th><th>Combination</th><th>Ratio</th><th>Good for</th></tr>
      ${pair("Ink on Page", T.text, T.page)}${pair("Ink on White", T.text, T.surface)}${pair("Ink on Amber", T.text, T.accent)}${pair("Bone on Ink", T["on-primary"], T.text)}${pair("Amber on Ink", T.accent, T.text)}${pair("Amber text on White", T["accent-text"], T.surface)}${pair("Amber text on Page", T["accent-text"], T.page)}${pair("Muted on Page", T.muted, T.page)}${pair("Subtle on Page", T.subtle, T.page)}${pair("Amber on White", T.accent, T.surface)}${pair("Amber on Page", T.accent, T.page)}${pair("White on Amber", "#FFFFFF", T.accent)}
    </table>
    <h2>Three rules that follow</h2>
    <ul><li><b>Amber is not a text colour on light backgrounds.</b> It fails. Use Amber text (<span class="m">${T["accent-text"]}</span>) or put the amber on ink.</li><li><b>Text on amber is ink</b>, never white. The one exception is the icon, where the white symbol on amber is a mark, not text, and is never smaller than 16px.</li><li><b>The tagline's amber word appears only on ink.</b> On a light background the whole line is ink.</li></ul>
    <h2>Light, dark and high contrast</h2>
    <p>The product has three themes that redefine the same colour names. On dark, text becomes bone, surfaces become warm near-blacks and amber stays amber. In high contrast everything is black on white with a lighter amber. Marketing follows the same logic: a design is either light (ink on neutral) or dark (bone on ink).</p>`));

  pages.push(page("Typography", `
    <p>Three typefaces, all open source (SIL Open Font License) and free to use anywhere, including Canva and Google Fonts.</p>
    <table>
      <tr><td style="width:44mm"><div style="font-family:'Bricolage Grotesque';font-weight:800;font-variation-settings:'opsz' 96;letter-spacing:-0.04em;font-size:24pt;line-height:1">Bricolage Grotesque</div></td><td><b>Display.</b> Headlines, the tagline, big numbers. Weight 800, tight tracking (-0.03 to -0.05em), tight leading (0.88 to 1.0). If unavailable: Archivo ExtraBold, then Arial Black.</td></tr>
      <tr><td><div style="font-family:'Geist';font-weight:500;font-size:17pt">Geist</div></td><td><b>Interface and body.</b> Everything you read or press. Weights 400, 500, 600; normal tracking; leading 1.4 to 1.55. If unavailable: Inter, then Arial or Helvetica.</td></tr>
      <tr><td><div style="font-family:'Space Mono';font-weight:700;font-size:14pt">Space Mono</div></td><td><b>Data.</b> Codes, web addresses, numbers and small labels on public pages only. Weights 400 and 700. If unavailable: IBM Plex Mono, then Courier New.</td></tr>
    </table>
    <h2>Sizes</h2>
    <table><tr><th>Use</th><th>Face and weight</th><th>Size</th><th>Leading</th><th>Tracking</th></tr>
      <tr><td>Marketing hero heading</td><td>Bricolage 800</td><td>52 to 112px, scales with the screen</td><td>0.88</td><td>-0.05em</td></tr>
      <tr><td>Page heading (public)</td><td>Bricolage 800</td><td>40 to 68px</td><td>0.95</td><td>-0.045em</td></tr>
      <tr><td>Section heading (public)</td><td>Bricolage 800</td><td>36 to 60px</td><td>0.95</td><td>-0.04em</td></tr>
      <tr><td>Page heading (app)</td><td>Bricolage 800</td><td>34 to 56px</td><td>0.98</td><td>-0.045em</td></tr>
      <tr><td>Card and panel heading</td><td>Geist 600</td><td>18px</td><td>1.3</td><td>-0.01em</td></tr>
      <tr><td>Body</td><td>Geist 400</td><td>16px (15px in dense lists)</td><td>1.5</td><td>0</td></tr>
      <tr><td>Lead paragraph</td><td>Geist 400</td><td>16 to 19px</td><td>1.55</td><td>0</td></tr>
      <tr><td>Button</td><td>Geist 500 to 600</td><td>14.5 to 17px</td><td>1</td><td>0</td></tr>
      <tr><td>Field label</td><td>Geist 600, sentence case</td><td>13px</td><td>1.25</td><td>0.005em</td></tr>
      <tr><td>Caption, help text</td><td>Geist 400</td><td>13px (never under 12px)</td><td>1.45</td><td>0</td></tr>
      <tr><td>Data value</td><td>Bricolage 800 for big figures; Space Mono 700 for codes</td><td>34 to 46px; 12 to 15px</td><td>0.95; 1</td><td>-0.04em; 0</td></tr>
      <tr><td>Eyebrow (public pages only)</td><td>Space Mono 700, capitals</td><td>12px</td><td>1.2</td><td>0.14em</td></tr>
    </table>
    <p class="cap" style="margin-top:3mm">These are the values the site uses today (<code>src/styles/landing.css</code>, <code>src/ui/ui.css</code>). Nothing on screen is set below 12px.</p>`));

  pages.push(page("Type in video and social", `
    <table><tr><th>Use</th><th>Face and weight</th><th>Size on a 1080-wide frame</th><th>Notes</th></tr>
      <tr><td>Headline or hook</td><td>Bricolage 800</td><td>96 to 140px</td><td>Leading 0.95, tracking -0.045em. Five words or fewer per line.</td></tr>
      <tr><td>Supporting line</td><td>Geist 500</td><td>40 to 52px</td><td>One sentence.</td></tr>
      <tr><td>Captions and subtitles</td><td>Geist 600</td><td>44 to 56px</td><td>Bone on an ink panel, or ink on bone. Never amber.</td></tr>
      <tr><td>Web address, codes</td><td>Space Mono 400 or 700</td><td>28 to 36px</td><td>Lower case: ${SITE}</td></tr>
      <tr><td>Lower-third name</td><td>Geist 600</td><td>40px on a 1920-wide frame</td><td>Role beneath in Space Mono 22px.</td></tr>
    </table>
    <h2>The tagline as a graphic</h2>
    <div class="grid" style="grid-template-columns:1fr 1fr"><div><div class="tile" style="background:${BG.ink};min-height:40mm;justify-content:flex-start"><div style="font-family:'Bricolage Grotesque';font-weight:800;font-variation-settings:'opsz' 96;letter-spacing:-0.045em;line-height:0.95;font-size:26pt;color:${COLOR.bone}">Make every voice<br><span style="color:${COLOR.amber}">count.</span></div></div><div class="cap">On ink: bone, with the last word in amber.</div></div><div><div class="tile" style="background:${BG.page};min-height:40mm;justify-content:flex-start"><div style="font-family:'Bricolage Grotesque';font-weight:800;font-variation-settings:'opsz' 96;letter-spacing:-0.045em;line-height:0.95;font-size:26pt">Make every voice<br>count.</div></div><div class="cap">On light: all ink. Amber would not be readable.</div></div></div>
    <h2>In Canva</h2>
    <p>All three fonts are in Canva's library under the same names. Add them to the Brand Kit as Heading (Bricolage Grotesque, ExtraBold), Body (Geist, Regular) and Caption (Space Mono). <code>canva/CANVA_SETUP.md</code> has the steps.</p>`));

  pages.push(page("Icons and motion", `
    <h2>Icons</h2>
    <p>One line-icon set, drawn on a 24px grid with a 1.75px stroke and round ends (<code>src/components/Icon.tsx</code>). Icons take the colour of the text beside them. No emoji in place of icons, no filled icon packs, no mixing of sets. Outside the product (slides, video) use a matching rounded line style at the same stroke weight.</p>
    <h2>Motion</h2>
    <ul><li><b>Motion answers an action.</b> Pressing, opening, confirming, moving to the next question. Nothing moves just to decorate.</li><li><b>The press is springy.</b> Controls squash slightly and spring back (260ms, <span class="m">cubic-bezier(0.34, 1.56, 0.64, 1)</span>).</li><li><b>Entrances ease out</b> (420ms, <span class="m">cubic-bezier(0.22, 1, 0.36, 1)</span>). One orchestrated moment per page at most.</li><li><b>Reduced motion is respected.</b> Every duration drops to zero for people who ask for it.</li></ul>
    <h2>The logo in motion</h2>
    <ul><li>Allowed: fade in; the bubble popping in last with the springy ease; the three dots appearing one after another; the smile drawing on from left to right.</li><li>Not allowed: spinning, bouncing the whole logo, 3D, glows, colour cycling, morphing the letters.</li><li>End on the still logo, held for at least one second, with its clear space.</li></ul>
    <h2>Shadows, gradients, effects</h2>
    <p>The logo files have none, and should gain none. Surfaces in the product are flat with hairlines; only things that float (menus, dialogs) cast a shadow. A marketing composition may add depth around the logo, never to it.</p>`));

  const soc = (id) => img(`social/${id}.png`);
  pages.push(page("Social media", `
    <p>Ready-made frames in <code>social/</code>, each at the platform's size with the logo and tagline already inside the area every device shows. <code>social/guides/</code> has the same frames with that area marked.</p>
    <div style="display:flex;gap:5mm;align-items:flex-end">
      <div><img src="${soc("instagram-portrait_1080x1350")}" style="height:52mm;display:block"><div class="cap">Instagram portrait</div></div>
      <div><img src="${soc("instagram-reel_1080x1920")}" style="height:52mm;display:block"><div class="cap">Reel and Short</div></div>
      <div><img src="${soc("youtube-thumbnail_1280x720")}" style="height:30mm;display:block"><div class="cap">YouTube thumbnail</div></div>
      <div><img src="${soc("facebook-cover_851x315")}" style="width:52mm;display:block"><div class="cap">Facebook cover</div><img src="${soc("linkedin-banner_1128x191")}" style="width:52mm;display:block;margin-top:3mm"><div class="cap">LinkedIn banner</div></div>
    </div>
    <h2>Sizes and what gets cropped</h2>
    <table><tr><th>Asset</th><th>Size</th><th>Keep important things inside</th></tr>
      ${SOCIAL.map((s) => `<tr><td>${s.id.replace(/-/g, " ")}</td><td class="m">${s.w} x ${s.h}</td><td>${s.safe ? `${s.safeLabel}: ${s.safe.w} x ${s.safe.h}` : s.note ?? "The whole frame"}</td></tr>`).join("")}
    </table>
    <p class="cap" style="margin-top:2mm">Checked in November 2026. Platforms change these; recheck before a campaign (<code>documentation/SOCIAL_SPECS.md</code>).</p>
    <h2>Profile pictures</h2>
    <p>Use the amber icon (<code>social/instagram-profile_1080x1080.png</code>) on every platform. The symbol sits well inside a circular crop. Never the horizontal logo: it is unreadable at avatar size.</p>`));

  pages.push(page("Video", `
    <div class="grid" style="grid-template-columns:1.78fr 0.56fr;align-items:end"><div><img src="${img("video/outro-16x9_1920x1080.png")}" style="width:100%;display:block"><div class="cap">Outro, wide (1920 x 1080)</div></div><div><img src="${img("video/outro-9x16_1080x1920.png")}" style="width:100%;display:block"><div class="cap">Outro, vertical</div></div></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:4mm"><div><img src="${img("video/examples/title-card-example_1920x1080.png")}" style="width:100%;display:block"><div class="cap">Title card, with an example title</div></div><div style="background:#8a8580"><img src="${img("video/examples/lower-third-example_1920x1080.png")}" style="width:100%;display:block"></div></div>
    <div class="cap">Right: the lower third over footage, with example text. The file itself is transparent and has no text.</div>
    <h2>Rules</h2>
    <ul><li><b>Watermark or corner logo:</b> the one-colour white logo, top left or top right, at about 12% of the frame's width, inside the title-safe area (5% in from each edge).</li><li><b>Over footage,</b> use the dark-background or white logo and make sure the area behind it is dark and calm. If it is not, put the logo on an ink panel.</li><li><b>End every video on the outro</b> for at least 1.5 seconds: stacked logo, tagline, ${SITE}.</li><li><b>Lower thirds</b> sit bottom left. Name in Geist 600, role in Space Mono.</li><li><b>Backgrounds:</b> ink, amber, bone and page are in <code>video/backgrounds/</code> at both shapes.</li></ul>
    <p>All files are PNG, which Canva, CapCut, Premiere, DaVinci Resolve and Final Cut read directly. The overlays in <code>video/overlays/</code> are transparent.</p>`));

  pages.push(page("Website and app", `
    <p>The site and the app are built from one design system (<code>DESIGN.md</code>, <code>src/ui/tokens.css</code>). The brand shows up in it like this:</p>
    <ul><li><b>The logo in the header</b> is drawn by the <code>LvMark</code> component, which uses these exact shapes and takes the text colour of whatever it sits on, so it is ink on light, bone on dark, and bone on the home page's ink header. Never place a logo image file in the interface.</li><li><b>Public pages are expressive:</b> big Bricolage headings, ink and amber bands. <b>App pages are calm:</b> flat surfaces, hairlines, sentence-case labels.</li><li><b>One amber primary button per screen.</b> Everything else is secondary, ink or quiet.</li><li><b>Inside a customer's Hub,</b> the Hub's own colour replaces amber for that Hub's controls. LunchVoice amber stays for LunchVoice's own actions, and "Powered by LunchVoice" keeps the real logo.</li><li><b>Three themes:</b> light, dark and high contrast. Anything new has to work in all three.</li></ul>
    <h2>Icons the site ships</h2>
    <table><tr><th>File in public/</th><th>Used for</th><th>From</th></tr>
      <tr><td class="m">favicon.ico</td><td>Browser tab (16, 32, 48)</td><td>Small-size icon</td></tr>
      <tr><td class="m">favicon-32.png</td><td>Browser tab</td><td>Small-size icon</td></tr>
      <tr><td class="m">apple-touch-icon-180.png</td><td>iPhone and iPad home screen</td><td>Square icon</td></tr>
      <tr><td class="m">android-icon-192.png, app-icon-512.png</td><td>Android and installed app</td><td>Rounded icon</td></tr>
      <tr><td class="m">icon-maskable-192.png, -512.png</td><td>Android adaptive icon</td><td>Maskable icon</td></tr>
      <tr><td class="m">og-image.png</td><td>Link previews (1200 x 630)</td><td>Horizontal logo and tagline</td></tr>
      <tr><td class="m">brand/*.svg</td><td>Public downloads of the logo</td><td>source-svg</td></tr>
    </table>`));

  pages.push(page("Files and names", `
    <p>Everything is in <code>brand/lv-package/</code> and is generated: <code>npm run brand:build</code> rebuilds it from <code>scripts/brand/logo.mjs</code>, and <code>npm run check:brand</code> verifies it. Do not edit an export by hand; change the source and rebuild.</p>
    <table><tr><th>Folder</th><th>What is in it</th></tr>
      <tr><td class="m">source-svg/</td><td>Vector masters of every version. Open in Figma, Illustrator or Inkscape.</td></tr>
      <tr><td class="m">logo/</td><td>Transparent PNGs of every version at several widths.</td></tr>
      <tr><td class="m">favicons/</td><td>favicon.ico and PNGs for browsers and iOS.</td></tr>
      <tr><td class="m">app-icons/</td><td>The icon at 16 to 1024px, plus square and maskable shapes.</td></tr>
      <tr><td class="m">social/</td><td>Platform-sized frames, with safe-area guides.</td></tr>
      <tr><td class="m">video/</td><td>Outros, title card, lower third, backgrounds, transparent overlays.</td></tr>
      <tr><td class="m">canva/</td><td>The short list to upload to a Canva Brand Kit, and how.</td></tr>
      <tr><td class="m">documentation/</td><td>This PDF, the colour and type specifications, the audit and the comparison sheet.</td></tr>
    </table>
    <h2>How files are named</h2>
    <p class="m">lunchvoice-&lt;what&gt;-&lt;treatment&gt;_&lt;width&gt;.png</p>
    <ul><li><b>what:</b> <span class="m">logo-horizontal</span>, <span class="m">logo-stacked</span>, <span class="m">mark</span>, <span class="m">mark-small</span>, <span class="m">wordmark</span>, <span class="m">icon</span></li><li><b>treatment:</b> <span class="m">on-light</span>, <span class="m">on-dark</span>, <span class="m">mono-dark</span>, <span class="m">mono-light</span></li><li><b>size:</b> the width in pixels, or width x height when the canvas is a fixed shape.</li></ul>
    <h2>Which format</h2>
    <ul><li><b>SVG</b> for the web, print and anything that will be scaled.</li><li><b>PNG</b> (transparent) for slides, documents, Canva and video.</li><li><b>ICO</b> only for the browser tab icon. <b>WebP</b> copies are provided for the largest web images.</li></ul>
    <h2>Questions and changes</h2>
    <p>A new colour, font, logo version or tagline needs the founder's approval before it is used. Write to admin@lunchvoice.com.</p>`));

  return `<style>${css}</style>${pages.join("")}`;
}
