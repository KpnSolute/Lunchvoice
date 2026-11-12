// The LunchVoice logo, as data. This file is the one vector source: every SVG in brand/lv-package/source-svg, every
// PNG, ICO and WebP export, the favicons in public/ and the guidelines are generated from it by scripts/brand/build.mjs.
// The geometry is the same as src/components/LvMark.tsx (the live site logo); scripts/check-brand.mjs fails if the two
// ever differ. Do not redraw the mark anywhere else.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** The official palette. Values mirror src/ui/tokens.css, which stays the source of truth for the product. */
export const COLOR = {
  amber: "#FF9A18",
  ink: "#14110F",
  bone: "#F7F3EA",
  page: "#EEEDEA",
  white: "#FFFFFF",
};

/** Mark geometry, in the mark's own 400 x 430 drawing space (unchanged from the approved mark). */
export const GEOMETRY = {
  L: "40,40 112,40 112,232 262,232 262,304 40,304",
  V: "132,40 178,40 218,196 258,40 304,40 224,322 200,322",
  bubble: "M244,4 h108 a26,26 0 0 1 26,26 v34 a26,26 0 0 1 -26,26 h-64 l-26,26 l4,-26 h-22 a26,26 0 0 1 -26,-26 v-34 a26,26 0 0 1 26,-26 z",
  dots: [[272, 47], [298, 47], [324, 47]],
  dotRadius: 6.5,
  smile: "M78,344 Q200,410 322,344 L308,330 Q200,378 92,330 Z",
};

/** Bounding box of the full mark: x 40..378, y 4..377 (the smile's lowest point). */
export const MARK_BOX = { x: 40, y: 4, w: 338, h: 373 };
/** Bounding box without the smile (small sizes): x 40..378, y 4..322. */
export const SMALL_BOX = { x: 40, y: 4, w: 338, h: 318 };
/** Clear space unit: the height of the speech bubble's body. */
export const CLEAR = 86;

const wm = JSON.parse(readFileSync(join(here, "wordmark.json"), "utf8"));
/** The wordmark "LunchVoice" as outlines: Bricolage Grotesque 800, optical size 96, tracking -0.03em. */
export const WORDMARK = { d: wm.wordmark.d, bounds: wm.wordmark.bounds, capHeight: wm.capHeight };

/**
 * Treatments. `letters` colours the L, the V and the wordmark; `accent` the bubble and the smile; `dots` the three
 * dots. In the one-colour treatments the dots are cut out of the bubble so the logo is a single flat colour.
 */
export const TREATMENTS = {
  "on-light": { letters: COLOR.ink, accent: COLOR.amber, dots: COLOR.white },
  "on-dark": { letters: COLOR.bone, accent: COLOR.amber, dots: COLOR.white },
  "mono-dark": { letters: COLOR.ink, accent: COLOR.ink, dots: null },
  "mono-light": { letters: COLOR.white, accent: COLOR.white, dots: null },
};
/** Icon tile candidates on amber (the tile colour the founder chose, 2026-11-12). */
export const ICON_TREATMENTS = {
  ink: TREATMENTS["mono-dark"],
  white: TREATMENTS["mono-light"],
  "ink-white-bubble": { letters: COLOR.ink, accent: COLOR.white, dots: COLOR.amber },
};

const circlePath = ([cx, cy], r) => `M${cx - r},${cy} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0 z`;

/**
 * The mark's shapes as SVG markup (no <svg> wrapper), in mark space. In full colour the amber bubble simply sits over
 * the V. In one colour that would fuse the two, so the letters are masked back from the bubble by a 8-unit gap and the
 * dots are cut out of the bubble.
 */
export function markShapes(t, { smile = true, dots = true } = {}) {
  const g = GEOMETRY;
  const mono = t.dots === null;
  const letters = `<polygon points="${g.L}" fill="${t.letters}"/>\n  <polygon points="${g.V}" fill="${t.letters}"/>`;
  const out = [];
  if (mono) {
    out.push(`<defs><mask id="lv-gap" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="430"><rect width="400" height="430" fill="#fff"/><path d="${g.bubble}" fill="#000" stroke="#000" stroke-width="16" stroke-linejoin="round"/></mask></defs>`);
    out.push(`<g mask="url(#lv-gap)">\n  ${letters}\n  </g>`);
    out.push(dots
      ? `<path fill-rule="evenodd" d="${g.bubble} ${g.dots.map((c) => circlePath(c, g.dotRadius)).join(" ")}" fill="${t.accent}"/>`
      : `<path d="${g.bubble}" fill="${t.accent}"/>`);
  } else {
    out.push(letters, `<path d="${g.bubble}" fill="${t.accent}"/>`);
    if (dots) for (const [cx, cy] of g.dots) out.push(`<circle cx="${cx}" cy="${cy}" r="${g.dotRadius}" fill="${t.dots}"/>`);
  }
  if (smile) out.push(`<path d="${g.smile}" fill="${t.accent}"/>`);
  return out.join("\n  ");
}

const svg = (w, h, body, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}">\n  <title>${title}</title>\n  ${body}\n</svg>\n`;
const r1 = (n) => Math.round(n * 10) / 10;

/** Symbol only, cropped to its own bounds (no padding: add clear space where you place it). */
export function markSvg(treatment = "on-light") {
  const b = MARK_BOX;
  return svg(b.w, b.h, `<g transform="translate(${-b.x},${-b.y})">\n  ${markShapes(TREATMENTS[treatment])}\n  </g>`, "LunchVoice");
}

/** Small-size symbol (use under 32px): no smile and no dots, so the LV and the bubble stay readable. */
export function markSmallSvg(treatment = "on-light") {
  const b = SMALL_BOX;
  return svg(b.w, b.h, `<g transform="translate(${-b.x},${-b.y})">\n  ${markShapes(TREATMENTS[treatment], { smile: false, dots: false })}\n  </g>`, "LunchVoice");
}

// Wordmark sizing relative to the mark: cap height is 0.5 of the LV letter height (264), as in the site header.
const LETTER_TOP = 40, LETTER_BOTTOM = 304;
const CAP = 132;
const WM_SCALE = CAP / WORDMARK.capHeight;
const WM_W = (WORDMARK.bounds[2] - WORDMARK.bounds[0]) * WM_SCALE;
const WM_ASC = -WORDMARK.bounds[1] * WM_SCALE; // height above the baseline (the h and the i dot)
const WM_DESC = WORDMARK.bounds[3] * WM_SCALE;

function wordmarkAt(x, baseline, fill) {
  return `<path transform="translate(${r1(x - WORDMARK.bounds[0] * WM_SCALE)},${r1(baseline)}) scale(${WM_SCALE.toFixed(4)})" d="${WORDMARK.d}" fill="${fill}"/>`;
}

/** Primary horizontal logo: the mark, then the wordmark centred on the height of the LV letters. */
export function horizontalSvg(treatment = "on-light") {
  const t = TREATMENTS[treatment];
  const b = MARK_BOX;
  const gap = 72;
  const w = b.w + gap + WM_W;
  const mid = (LETTER_TOP + LETTER_BOTTOM) / 2 - b.y; // centre of the letters, in cropped space
  const baseline = mid + CAP / 2;
  return svg(r1(w), b.h, `<g transform="translate(${-b.x},${-b.y})">\n  ${markShapes(t)}\n  </g>\n  ${wordmarkAt(b.w + gap, baseline, t.letters)}`, "LunchVoice");
}

/** Stacked logo: the mark above the wordmark, both centred. The LV letters, not the bubble, sit on the centre line. */
export function stackedSvg(treatment = "on-light") {
  const t = TREATMENTS[treatment];
  const b = MARK_BOX;
  const gap = 56;
  const lettersCentre = (40 + 304) / 2 - b.x; // x centre of the L and V in cropped space
  const half = Math.max(WM_W / 2, b.w - lettersCentre, lettersCentre);
  const w = half * 2;
  const markX = half - lettersCentre;
  const baseline = b.h + gap + WM_ASC;
  const h = baseline + WM_DESC;
  return svg(r1(w), r1(h), `<g transform="translate(${r1(markX - b.x)},${-b.y})">\n  ${markShapes(t)}\n  </g>\n  ${wordmarkAt(half - WM_W / 2, baseline, t.letters)}`, "LunchVoice");
}

/** Wordmark alone. */
export function wordmarkSvg(treatment = "on-light") {
  const t = TREATMENTS[treatment];
  const h = WM_ASC + WM_DESC;
  return svg(r1(WM_W), r1(h), wordmarkAt(0, WM_ASC, t.letters), "LunchVoice");
}

export const ICON_TILE = COLOR.amber;
export const ICON_TREATMENT = "mono-light";

/**
 * The icon tile: the mark on an amber square (founder decision, 2026-11-12: amber is the favicon and app icon). `shape` is "rounded" (transparent corners, favicons and general use),
 * "square" (full bleed, for iOS, which rounds it itself) or "maskable" (full bleed with the mark inside the 80% safe
 * circle Android may crop to). `small` uses the small-size symbol and fills more of the tile.
 */
export function iconSvg({ shape = "rounded", small = false, tile = ICON_TILE, treatment = ICON_TREATMENT } = {}) {
  const S = 512;
  const t = TREATMENTS[treatment];
  const b = small ? SMALL_BOX : MARK_BOX;
  const fill = shape === "maskable" ? 0.5 : small ? 0.74 : 0.62; // share of the tile the mark's longer side takes
  const k = (S * fill) / Math.max(b.w, b.h);
  // Centre the LV letters and the bubble together, then nudge left a little: the bubble makes the right side lighter.
  const tx = (S - b.w * k) / 2 - b.x * k - S * 0.012;
  const ty = (S - b.h * k) / 2 - b.y * k;
  const bg = shape === "rounded" ? `<rect width="${S}" height="${S}" rx="${S * 0.22}" fill="${tile}"/>` : `<rect width="${S}" height="${S}" fill="${tile}"/>`;
  return svg(S, S, `${bg}\n  <g transform="translate(${r1(tx)},${r1(ty)}) scale(${k.toFixed(4)})">\n  ${markShapes(t, small ? { smile: false, dots: false } : {})}\n  </g>`, "LunchVoice");
}

export const LOCKUP_SIZES = { CAP, WM_SCALE, WM_W, WM_ASC, WM_DESC };
