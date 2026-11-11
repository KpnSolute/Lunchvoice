// Track B UI suite (dev mock): admin console access control, checkout disabled and enabled states, the Hub billing
// page and the reservation purchase flow. Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

/** openPage plus dev switches of the commerce mock (src/lib/mockCommerce.ts). */
async function page(opts = {}, flags = {}) {
  const s = await openPage(app, opts);
  await s.ctx.addInitScript((f) => {
    for (const [k, v] of Object.entries(f)) localStorage.setItem(k, v);
    if (!sessionStorage.getItem("commerce-seeded")) { localStorage.removeItem("lv.mock.commerce"); sessionStorage.setItem("commerce-seeded", "1"); }
  }, flags);
  return s;
}
const READY = { "lv.mock.billing": "ready" };

test("admin: signed out, /admin asks for sign-in", async () => {
  const { page: p, go, ctx } = await page({ signedIn: false });
  await go("/admin");
  await p.waitForURL(/\/signin$/);
  await ctx.close();
});

test("admin: a signed-in non-admin gets the ordinary not-found page, never the console", async () => {
  const { page: p, go, ctx, errors } = await page();
  await go("/admin");
  await p.getByRole("heading", { name: "This page isn’t here." }).waitFor();
  assert.equal(await p.getByTestId("admin-console").count(), 0);
  assert.equal(await p.getByText("Staff panel").count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("admin: a platform admin sees the console; waitlist emails stay hidden until one is opened", async () => {
  const { page: p, go, ctx, errors } = await page({}, { "lv.mock.admin": "1" });
  await go("/admin");
  await p.getByTestId("admin-console").waitFor();
  for (const name of ["Waitlist", "Reports", "Discover", "Billing", "Email"]) assert.equal(await p.getByRole("tab", { name }).count(), 1, name);
  await p.getByRole("tab", { name: "Waitlist" }).click();
  const table = p.getByRole("tabpanel").getByRole("table");
  await table.waitFor();
  assert.equal((await table.textContent()).includes("@"), false, "no address before it is opened");
  await p.getByRole("button", { name: "Show email" }).first().click();
  await p.getByText(/founder\d+@example\.invalid/).waitFor();
  await p.getByRole("tab", { name: "Discover" }).click();
  await p.getByText("No Discover applications").waitFor();
  await p.getByRole("tab", { name: "Billing" }).click();
  await p.getByText("No billing events yet").waitFor();
  assert.ok(await noHorizontalScroll(p));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("pricing: signed out while billing is closed, nothing says Sign in to buy", async () => {
  const { page: p, go, ctx } = await page({ signedIn: false });
  await go("/pricing");
  const starter = p.getByTestId("checkout-starter_hub");
  await starter.waitFor();
  assert.equal(await starter.textContent(), "Join the waitlist");
  assert.equal(await starter.getAttribute("href"), "/waitlist");
  assert.equal(await p.getByText("Sign in to buy").count(), 0);
  for (const product of ["team_hub", "campaign_starter", "campaign_plus"]) {
    assert.equal(await p.getByTestId(`checkout-${product}`).getAttribute("data-state"), "disabled", product);
  }
  assert.equal(await p.getByTestId("billing-notice").getAttribute("data-state"), "closed");
  await ctx.close();
});

test("pricing: signed out once billing is open, every buy action asks for sign-in", async () => {
  const { page: p, go, ctx } = await page({ signedIn: false }, READY);
  await go("/pricing");
  for (const product of ["starter_hub", "team_hub", "campaign_starter", "campaign_plus"]) {
    const el = p.getByTestId(`checkout-${product}`);
    await el.waitFor();
    assert.equal(await el.textContent(), "Sign in to buy", product);
  }
  assert.equal(await p.getByTestId("billing-notice").getAttribute("data-state"), "open");
  await p.getByText("Checkout is open", { exact: true }).waitFor();
  await ctx.close();
});

test("pricing: while billing is closed, checkout is disabled with a visible reason", async () => {
  const { page: p, go, ctx } = await page();
  await go("/pricing");
  assert.equal(await p.getByTestId("checkout-starter_hub").getAttribute("data-state"), "waitlist");
  for (const product of ["team_hub", "campaign_starter", "campaign_plus"]) {
    const el = p.getByTestId(`checkout-${product}`);
    await el.waitFor();
    assert.equal(await el.getAttribute("data-state"), "disabled", product);
    assert.equal(await el.getByRole("button").isDisabled(), true, product);
  }
  await p.getByText("Billing opens soon", { exact: true }).waitFor();
  await ctx.close();
});

test("pricing: when the API says a product is on sale, checkout is enabled (Campaign plans ask for weeks)", async () => {
  const { page: p, go, ctx, errors } = await page({}, READY);
  await go("/pricing");
  const el = p.getByTestId("checkout-team_hub");
  await el.waitFor();
  assert.equal(await el.getAttribute("data-state"), "enabled");
  assert.equal(await el.isDisabled(), false);
  await p.getByRole("spinbutton", { name: "Weeks" }).first().waitFor();
  await p.getByText("Checkout is open").waitFor();
  await el.click();
  await p.waitForURL(/\/create\?checkout=success/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("hub billing: plans are disabled while billing is closed and nothing offers the portal", async () => {
  const { page: p, go, ctx } = await page();
  await go("/northside-running/billing");
  await p.getByTestId("hub-billing").waitFor();
  const el = p.getByTestId("checkout-team_hub");
  await el.waitFor();
  assert.equal(await el.getAttribute("data-state"), "disabled");
  assert.equal(await p.getByTestId("manage-subscription").count(), 0);
  await ctx.close();
});

test("hub billing: with billing open the Owner can check out, returns with a notice, then may manage billing", async () => {
  const { page: p, go, ctx, errors } = await page({}, READY);
  await go("/northside-running/billing");
  const el = p.getByTestId("checkout-team_hub");
  await el.waitFor();
  assert.equal(await el.getAttribute("data-state"), "enabled");
  await el.click();
  await p.waitForURL(/\/northside-running\/billing\?checkout=success/);
  await p.getByText("Payment received").waitFor();
  await p.getByTestId("manage-subscription").waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("reserve: while billing is closed the name can be checked but not bought", async () => {
  const { page: p, go, ctx } = await page();
  await go("/reserve?slug=harbor-book-circle");
  const status = p.getByTestId("reserve-status");
  await status.waitFor();
  assert.equal(await status.getAttribute("data-state"), "available");
  assert.equal(await p.getByTestId("checkout-hub_reservation").getAttribute("data-state"), "disabled");
  await ctx.close();
});

test("reserve: buying an available name, then renewing it", async () => {
  const { page: p, go, ctx, errors } = await page({ width: 390 }, READY);
  await go("/reserve");
  await p.getByRole("textbox", { name: "Address" }).fill("harbor-book-circle");
  await p.getByRole("button", { name: "Check", exact: true }).click();
  const buy = p.getByTestId("checkout-hub_reservation");
  await buy.waitFor();
  assert.equal(await buy.textContent(), "Reserve for $25");
  await buy.click();
  await p.waitForURL(/\/reserve\?slug=harbor-book-circle&checkout=success/);
  await p.getByText("Payment received").waitFor();
  const status = p.getByTestId("reserve-status");
  await status.waitFor();
  assert.equal(await status.getAttribute("data-state"), "active");
  assert.equal(await p.getByTestId("checkout-hub_reservation").textContent(), "Renew for $25");
  assert.ok(await noHorizontalScroll(p));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("reserve: a platform route or a taken Hub name cannot be reserved", async () => {
  const { page: p, go, ctx } = await page({}, READY);
  await go("/reserve?slug=admin");
  await p.getByText("That name is reserved for the platform.").waitFor();
  await go("/reserve?slug=northside-running");
  await p.getByText("This name can't be reserved right now.").waitFor();
  assert.equal(await p.getByTestId("checkout-hub_reservation").count(), 0);
  await ctx.close();
});
