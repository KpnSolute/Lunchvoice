import { strict as assert } from "node:assert";
import { test } from "node:test";
import { brandingHandle, type BrandingCtx } from "./mockBranding";
import {
  brandingProblem, checkBrandColor, contrast, EMPTY_BRANDING, ensureContrast, imagePath, imageProblem, onColor,
  resolveTheme, sniffImage, themeVars, WHITE,
} from "./surveyTheme";

test("contrast: black on white is 21:1; amber on white fails AA", () => {
  assert.ok(Math.abs(contrast("#000000", WHITE) - 21) < 0.01);
  assert.equal(checkBrandColor("#f5b301").ok, false);
  assert.equal(checkBrandColor("#ffffff").ok, false);
  assert.equal(checkBrandColor("#1f6f5b").ok, true);
  assert.equal(checkBrandColor("nope").ok, false);
});

test("a failing color comes with a passing suggestion", () => {
  const r = checkBrandColor("#f5b301");
  assert.ok(r.suggestion && checkBrandColor(r.suggestion).ok);
  assert.ok(contrast(ensureContrast("#7fd1ff", "#17140f", 3), "#17140f") >= 3);
});

test("themeVars: only --pt-* names, readable on and text colors; none without a color", () => {
  assert.equal(themeVars(null), undefined);
  const v = themeVars("#1f6f5b")!;
  assert.ok(Object.keys(v).every((k) => k.startsWith("--pt-")));
  assert.ok(contrast(v["--pt-accent"]!, v["--pt-on"]!) >= 4.5);
  assert.ok(contrast(v["--pt-accent-dark"]!, "#17140f") >= 3);
  assert.ok(["#14110f", "#ffffff"].includes(onColor("#1f6f5b")));
});

test("images: type from bytes, SVG refused, size limits, object names", () => {
  assert.equal(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), "image/png");
  assert.equal(sniffImage(new TextEncoder().encode("<svg xmlns=")), null);
  assert.match(imageProblem("logo", 10, null)!, /SVG/);
  assert.match(imageProblem("logo", 1024 * 1024 + 1, "image/png")!, /1 MB/);
  assert.equal(imageProblem("cover", 2 * 1024 * 1024, "image/webp"), null);
  assert.match(imagePath("c1", "logo", "image/jpeg", () => "ab".repeat(8)), /^c1\/logo-abababababababab\.jpg$/);
});

test("theme resolution: follow_hub is explicit; a copied color never moves", () => {
  const own = { ...EMPTY_BRANDING, color: "#1f6f5b" };
  assert.equal(resolveTheme(own, "#7a1f1f", false).color, "#1f6f5b");
  assert.equal(resolveTheme({ ...own, follow_hub: true }, "#7a1f1f", false).color, "#7a1f1f");
  assert.equal(resolveTheme({ ...own, hide_footer: true }, null, false).hide_footer, false);
  assert.match(brandingProblem({ ...own, follow_hub: true }, false)!, /Hub Campaign/);
  assert.match(brandingProblem({ ...EMPTY_BRANDING, color: "#ffee00" }, false)!, /too light/);
});

function ctx(plan: { branding: boolean; footer?: boolean; hub?: boolean; accent?: string | null }): BrandingCtx {
  return {
    store: {},
    campaign: () => ({ hub_id: "h", status: "draft", hubKind: plan.hub ? "community" : "personal", hubAccent: plan.accent ?? null, canManage: true }),
    allowed: (_h, k) => (k === "survey.branding" ? plan.branding : Boolean(plan.footer)),
  };
}

test("mock server: free is refused, entitled saves, downgrade keeps data but answers theme = null", () => {
  const free = ctx({ branding: false });
  const r = brandingHandle(free, "lv_campaign_branding_set", { p_campaign: "c", p_branding: { color: "#1f6f5b" } }, true) as { ok: boolean; error?: { code: string } };
  assert.equal(r.error?.code, "lv_entitlement_required");
  const paid = ctx({ branding: true });
  assert.equal((brandingHandle(paid, "lv_campaign_branding_set", { p_campaign: "c", p_branding: { color: "#1f6f5b", welcome_headline: "Hi" } }, true) as { ok: boolean }).ok, true);
  assert.equal((brandingHandle(paid, "lv_campaign_branding_set", { p_campaign: "c", p_branding: { color: "#ffee00" } }, true) as { ok: boolean }).ok, false);
  const lapsed = { ...paid, allowed: () => false };
  assert.equal((brandingHandle(lapsed, "lv_campaign_theme", { p_campaign: "c" }, false) as { theme: unknown }).theme, null);
  assert.ok((brandingHandle(lapsed, "lv_campaign_branding_get", { p_campaign: "c" }, true) as { branding: unknown }).branding);
});

test("mock server: Hub color change does not move a copied color; follow_hub does", () => {
  const hub = ctx({ branding: true, hub: true, accent: "#1f6f5b" });
  brandingHandle(hub, "lv_campaign_branding_set", { p_campaign: "c", p_branding: { color: "#1f6f5b" } }, true);
  brandingHandle(hub, "lv_campaign_branding_set", { p_campaign: "d", p_branding: { color: "#1f6f5b", follow_hub: true } }, true);
  hub.campaign = () => ({ hub_id: "h", status: "published", hubKind: "community", hubAccent: "#7a1f1f", canManage: true });
  const color = (id: string) => (brandingHandle(hub, "lv_campaign_theme", { p_campaign: id }, false) as { theme: { color: string } }).theme.color;
  assert.equal(color("c"), "#1f6f5b");
  assert.equal(color("d"), "#7a1f1f");
});

import {
  GRADIENT_PRESETS, gradientCss, heroContrast, hexToHsv, hsvToHex, loadRecent, onColors, PRESET_COLORS, pushRecent,
} from "./surveyTheme";

test("every curated color and gradient end is readable on white (4.5:1)", () => {
  for (const p of PRESET_COLORS) assert.ok(checkBrandColor(p.hex).ok, `${p.name} ${p.hex}`);
  for (const g of GRADIENT_PRESETS) {
    assert.ok(checkBrandColor(g.from).ok && checkBrandColor(g.to).ok, g.key);
    assert.ok(heroContrast(g.from, g.to) >= 4.5, `${g.key} hero text`);
  }
});

test("text color on a gradient is judged against its worst end", () => {
  assert.equal(onColors(["#0f766e", "#1d4ed8"]), WHITE);
  assert.equal(onColors(["#fde68a", "#fbbf24"]), "#14110f");
  // A light end and a dark end: no single text color reaches 4.5:1 on both, so the heroContrast guard reports it.
  assert.ok(heroContrast("#fde68a", "#1d4ed8") < 4.5);
  assert.ok(heroContrast("#4338ca", "#be123c") >= 4.5);
});

test("themeVars for a gradient: hero gradient, solid accent for buttons, readable on-color", () => {
  const v = themeVars("#0f766e", { color2: "#1d4ed8", angle: 180 })!;
  assert.equal(v["--pt-hero"], "linear-gradient(180deg, #0f766e, #1d4ed8)");
  assert.equal(v["--pt-accent"], "#0f766e");
  assert.ok(contrast("#0f766e", v["--pt-on"]!) >= 4.5 && contrast("#1d4ed8", v["--pt-on"]!) >= 4.5);
  assert.equal(themeVars("#0f766e")!["--pt-hero"], "#0f766e");
  assert.equal(gradientCss("#000000", "#111111", 90), "linear-gradient(90deg, #000000, #111111)");
});

test("gradient saves need two readable colors", () => {
  const g = { ...EMPTY_BRANDING, style: "gradient" as const, color: "#0f766e" };
  assert.match(brandingProblem(g, false)!, /two colors/);
  assert.match(brandingProblem({ ...g, color2: "#fbbf24" }, false)!, /second color/);
  assert.equal(brandingProblem({ ...g, color2: "#1d4ed8" }, false), null);
});

test("hsv round trip and recent colors (local only, newest first, capped)", () => {
  for (const hex of ["#0f766e", "#be123c", "#ffffff", "#000000"]) assert.equal(hsvToHex(...(Object.values(hexToHsv(hex)) as [number, number, number])), hex);
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  for (let i = 0; i < 10; i++) pushRecent(`#00000${i}`, store);
  pushRecent("#000005", store);
  const r = loadRecent(store);
  assert.equal(r.length, 8);
  assert.equal(r[0], "#000005");
  assert.equal(new Set(r).size, 8);
  assert.deepEqual(loadRecent({ getItem: () => "not json" }), []);
});

test("mock server: gradient saves with direction and cosmetics, comes back in the theme", () => {
  const paid = ctx({ branding: true });
  const body = { style: "gradient", color: "#0f766e", color2: "#1d4ed8", gradient_angle: 180, banner_style: "pattern", cosmetics: { pattern: "grid", progress_tint: true, glow: true } };
  assert.equal((brandingHandle(paid, "lv_campaign_branding_set", { p_campaign: "g", p_branding: body }, true) as { ok: boolean }).ok, true);
  const th = (brandingHandle(paid, "lv_campaign_theme", { p_campaign: "g" }, true) as { theme: Record<string, unknown> }).theme;
  assert.equal(th.style, "gradient");
  assert.equal(th.color2, "#1d4ed8");
  assert.deepEqual(th.cosmetics, { pattern: "grid", progress_tint: true, glow: true });
  const bad = (b: object) => (brandingHandle(paid, "lv_campaign_branding_set", { p_campaign: "g", p_branding: b }, true) as { ok: boolean }).ok;
  assert.equal(bad({ ...body, color2: "#fbbf24" }), false);
  assert.equal(bad({ ...body, color2: null }), false);
  assert.equal(bad({ ...body, gradient_angle: 45 }), false);
  assert.equal(bad({ ...body, cosmetics: { pattern: "stripes" } }), false);
});
