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
