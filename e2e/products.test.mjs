// Product pages, the Products menu and the footer (dev mock). Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

const { products } = JSON.parse(readFileSync(new URL("../src/config/products.json", import.meta.url), "utf8"));

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

test("the products index lists all six products, grouped, each linking to its page", async () => {
  const { page, go, ctx, errors } = await openPage(app, { signedIn: false });
  await go("/products");
  const list = page.getByTestId("product-list");
  assert.equal(await list.locator("a[href^='/products/']").count(), 6);
  for (const p of products) assert.equal(await list.locator(`a[href='/products/${p.slug}']`).count(), 1, p.slug);
  assert.equal(await page.locator("h1").count(), 1);
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://lunchvoice.com/products");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("every product page has one h1, the plan table, prices, related products and a working primary action", async () => {
  const { page, go, ctx, errors } = await openPage(app, { signedIn: false });
  for (const p of products) {
    await go(`/products/${p.slug}`);
    await page.getByTestId("product-page").waitFor();
    assert.equal(await page.locator("h1").count(), 1, p.slug);
    assert.equal(await page.locator("h1").innerText(), p.h1, p.slug);
    assert.ok(await page.getByTestId("product-plans").locator("tbody tr").count() >= 3, `${p.slug} plan rows`);
    assert.ok(await page.getByTestId("product-prices").locator("li").count() >= 1, `${p.slug} prices`);
    assert.equal(await page.getByTestId("product-related").locator("a").count(), p.related.length, `${p.slug} related`);
    assert.equal(await page.title(), `${p.title} · LunchVoice`, p.slug);
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), `https://lunchvoice.com/products/${p.slug}`);
    const href = await page.getByTestId("product-cta").getAttribute("href");
    assert.ok(href && href.startsWith("/"), `${p.slug} cta ${href}`);
  }
  // The primary action goes somewhere real.
  await go("/products/feedback");
  await page.getByTestId("product-cta").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/products"));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("plan rows come from the entitlement map: Team-only API limits show Team's values", async () => {
  const { page, go, ctx } = await openPage(app, { signedIn: false });
  await go("/products/developers");
  const row = page.getByTestId("product-plans").locator("tr", { hasText: "API keys per Hub" });
  assert.deepEqual((await row.locator("td").allInnerTexts()).map((t) => t.trim()), ["—", "—", "10"]);
  await go("/products/hubs");
  const shop = page.getByTestId("product-plans").locator("tr", { hasText: "Shop items" });
  assert.deepEqual((await shop.locator("td").allInnerTexts()).map((t) => t.trim()), ["—", "10", "50"]);
  await ctx.close();
});

test("an unknown product shows the not-found page", async () => {
  const { page, go, ctx } = await openPage(app, { signedIn: false });
  await go("/products/elections");
  assert.equal(await page.getByTestId("product-page").count(), 0);
  assert.match(await page.locator("h1").innerText(), /isn’t here/);
  await ctx.close();
});

test("the Products menu lists the six products and All products, on the ink home header too", async () => {
  const { page, go, ctx } = await openPage(app, { signedIn: false });
  for (const path of ["/", "/pricing"]) {
    await go(path);
    await page.getByTestId("nav-products").click();
    const menu = page.getByTestId("products-menu");
    await menu.waitFor();
    assert.equal(await menu.getByRole("menuitem").count(), 7, path);
    await page.keyboard.press("Escape");
  }
  await page.getByTestId("nav-products").click();
  await page.getByTestId("products-menu").getByRole("menuitem", { name: /LunchVoice for Discord/ }).click();
  await page.waitForURL("**/products/discord");
  await ctx.close();
});

test("the phone menu shows the products first, then the site links", async () => {
  const { page, go, ctx } = await openPage(app, { signedIn: false, width: 390, height: 844 });
  await go("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.waitFor();
  assert.equal(await sheet.locator("a[href^='/products/']").count(), 6);
  for (const name of ["All products", "Use cases", "Pricing", "Discover", "How it works", "Waitlist", "Sign in"]) {
    assert.ok(await sheet.getByRole("link", { name }).count() >= 1, name);
  }
  await ctx.close();
});

test("the footer has four labelled columns, every link resolves, and the legal page is 'Privacy policy'", async () => {
  const { page, go, ctx } = await openPage(app, { signedIn: false });
  await go("/products");
  const footer = page.locator("footer");
  assert.deepEqual(await footer.locator("h2").allInnerTexts(), ["Products", "Use it for", "Company", "Legal"]);
  assert.equal(await footer.getByRole("link", { name: "Privacy policy" }).getAttribute("href"), "/privacy");
  assert.equal(await footer.getByRole("link", { name: "Privacy", exact: true }).getAttribute("href"), "/products/privacy");
  const hrefs = await footer.locator("a[href^='/']").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  for (const href of hrefs) {
    await go(href);
    assert.equal(await page.getByText("This page isn’t here.").count(), 0, href);
    assert.ok(await page.locator("h1").count() >= 1, href);
  }
  assert.match(await footer.innerText(), /KpnSolute/);
  await ctx.close();
});

test("product pages have no sideways scroll at 360 in every theme, and footer links are 44px on phones", async () => {
  for (const theme of ["light", "dark", "hc"]) {
    const { page, go, ctx, errors } = await openPage(app, { signedIn: false, width: 360, height: 780, theme });
    for (const path of ["/products", ...products.map((p) => `/products/${p.slug}`)]) {
      await go(path);
      assert.ok(await noHorizontalScroll(page), `${theme} ${path}`);
    }
    const small = await page.locator("footer a").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)).filter((h) => h > 0 && h < 44));
    assert.deepEqual(small, [], theme);
    assert.deepEqual(errors, [], theme);
    await ctx.close();
  }
});
