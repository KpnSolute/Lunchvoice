// Public-site calls to action follow one billing state (src/lib/billingState.ts), on the homepage, in the header and
// on /pricing, signed in and signed out; plus the phone compare view and touch targets. Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

async function open(opts, billingOpen) {
  const s = await openPage(app, opts);
  await s.ctx.addInitScript((on) => { if (on) localStorage.setItem("lv.mock.billing", "ready"); else localStorage.removeItem("lv.mock.billing"); }, billingOpen);
  return s;
}
const href = (loc) => loc.getAttribute("href");

for (const signedIn of [false, true]) {
  const who = signedIn ? "signed in" : "signed out";

  test(`billing closed, ${who}: waitlist wording on the homepage, header and pricing`, async () => {
    const { page, go, ctx, errors } = await open({ signedIn }, false);
    await go("/");
    const hero = page.locator('[data-lv-cta="hero"]');
    assert.equal(await hero.innerText(), "Start a free survey");
    assert.equal(await href(hero), "/surveys/new");
    for (const key of ["hero-hub", "waitlist-band", "plan-starter"]) {
      const el = page.locator(`[data-lv-cta="${key}"]`);
      assert.equal(await el.innerText(), "Join the waitlist", key);
      assert.equal(await href(el), "/waitlist", key);
    }
    if (!signedIn) assert.equal(await href(page.locator('[data-lv-cta="header"]')), "/waitlist");
    assert.match(await page.getByTestId("billing-sentence").innerText(), /nothing here charges money/);
    assert.equal(await page.getByText("LunchVoice 2.0").count(), 0);
    await go("/pricing");
    assert.equal(await page.getByTestId("billing-notice").getAttribute("data-state"), "closed");
    assert.equal(await page.getByText("Sign in to buy").count(), 0);
    assert.equal(await page.getByText(/not set yet/i).count(), 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`billing open, ${who}: Create your Hub leads to the purchase path everywhere`, async () => {
    const { page, go, ctx, errors } = await open({ signedIn }, true);
    await go("/");
    const hero = page.locator('[data-lv-cta="hero"]');
    assert.equal(await hero.innerText(), "Start a free survey");
    for (const key of ["hero-hub", "waitlist-band", "plan-starter"]) {
      const el = page.locator(`[data-lv-cta="${key}"]`);
      await page.waitForFunction((k) => document.querySelector(`[data-lv-cta="${k}"]`)?.textContent === "Create your Hub", key);
      assert.equal(await href(el), "/pricing", key);
    }
    if (!signedIn) assert.equal(await page.locator('[data-lv-cta="header"]').innerText(), "Create your Hub");
    assert.doesNotMatch(await page.getByTestId("billing-sentence").innerText(), /opens/);
    await go("/pricing");
    assert.equal(await page.getByTestId("billing-notice").getAttribute("data-state"), "open");
    const starter = page.getByTestId("checkout-starter_hub");
    assert.equal(await starter.getAttribute("data-state"), signedIn ? "enabled" : "signin");
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test("the header action is hidden on /waitlist and /signin, and the phone menu reaches Sign in", async () => {
  const { page, go, ctx } = await open({ signedIn: false, width: 390, height: 844 }, false);
  for (const path of ["/waitlist", "/signin"]) {
    await go(path);
    assert.equal(await page.locator('[data-lv-cta="header"]').count(), 0, path);
  }
  await go("/pricing");
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Sign in" }).click();
  await page.waitForURL(/\/signin$/);
  assert.match(await page.getByTestId("signin-how").innerText(), /auth\.kpnsolute\.com.*Google/);
  await ctx.close();
});

test("pricing at 360px: every plan's values are reachable without sideways scrolling", async () => {
  const { page, go, ctx } = await open({ signedIn: false, width: 360, height: 800 }, false);
  await go("/pricing");
  assert.ok(await noHorizontalScroll(page));
  const m = page.getByTestId("compare-mobile");
  assert.equal(await page.locator(".lv-captable-wrap").isVisible(), false);
  for (const [plan, price] of [["Free Quick Survey", "$0"], ["Starter Hub", "$13"], ["Team Hub", "$29"], ["Campaign Starter", "$19"], ["Campaign Plus", "$39"]]) {
    await m.getByRole("button", { name: plan, exact: true }).click();
    assert.equal(await m.locator(".lv-capm-plan span").innerText(), price, plan);
    assert.equal(await m.locator("dl > div").count(), 16, plan);
    assert.ok(await noHorizontalScroll(page), plan);
  }
  // Starter Hub comes straight after the free plan.
  const order = await page.getByTestId("hub-plans").locator("[data-testid^='plan-']").evaluateAll((els) => els.map((e) => e.dataset.testid));
  assert.deepEqual(order, ["plan-free", "plan-starter", "plan-team"]);
  await ctx.close();
});

test("touch targets and type size on the homepage (phone)", async () => {
  const { page, go, ctx } = await open({ signedIn: false, width: 390, height: 844 }, false);
  await go("/");
  const small = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("header a, header button, footer a, [data-slot='button'], .lv-l-chips a, .lv-l-outline-btn")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height < 44) out.push(`${el.textContent.trim().slice(0, 30)}:${Math.round(r.height)}`);
    }
    return out;
  });
  assert.deepEqual(small, []);
  const tiny = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.className || e.tagName));
  assert.deepEqual(tiny, []);
  // The join button is never disabled: with no code it explains what is missing.
  await page.getByTestId("join-submit").click();
  await page.getByText("Type the six-character code first.").waitFor();
  await ctx.close();
});

test("the LunchVoice mark follows the surface: light letters on dark, dark letters on light", async () => {
  const lum = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
  for (const theme of ["light", "dark"]) {
    const { page, go, ctx } = await open({ signedIn: false, theme }, false);
    for (const path of ["/", "/pricing", "/signin"]) {
      await go(path);
      assert.equal(await page.locator('img[src*="lunchvoice-mark"]').count(), 0, `${theme} ${path}: a fixed-colour logo image`);
      const marks = await page.locator("svg[data-lv-mark]").evaluateAll((els) => els.map((el) => {
        let bg = "rgba(0, 0, 0, 0)";
        for (let n = el.parentElement; n && /rgba\(0, 0, 0, 0\)|transparent/.test(bg); n = n.parentElement) {
          const cs = getComputedStyle(n);
          bg = cs.backgroundImage !== "none" ? (cs.backgroundImage.match(/rgba?\([^)]+\)/) ?? [bg])[0] : cs.backgroundColor;
        }
        return { fill: getComputedStyle(el.querySelector("polygon")).fill, bg };
      }));
      assert.ok(marks.length >= 1, `${theme} ${path}: no mark`);
      for (const m of marks) assert.ok(Math.abs(lum(m.fill) - lum(m.bg)) > 0.5, `${theme} ${path}: letters ${m.fill} on ${m.bg}`);
    }
    await ctx.close();
  }
});
