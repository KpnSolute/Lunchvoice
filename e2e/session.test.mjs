// Ending a session cleanly (dev mock). A session lasts up to an hour; when it ends, whether its clock ran out or the
// server refused the token, the person is signed out, told why, and taken to sign-in instead of seeing
// "Something went wrong on our side" while still looking signed in. Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

/** A signed-out page on which we then store our own session (the harness would overwrite it on every load). */
async function withSession(session, path) {
  const s = await openPage(app, { signedIn: false });
  await s.go("/");
  await s.page.evaluate((v) => localStorage.setItem("lv.session", JSON.stringify(v)), session);
  await s.go(path);
  return s;
}

test("a refused token on My home signs the person out and explains it, instead of a server error", async () => {
  const { page, ctx } = await withSession({ token: "expired", name: "Game World" }, "/me");
  await page.waitForURL(/\/signin/);
  await page.getByText("You were signed out").waitFor();
  assert.equal(await page.getByText("Something went wrong on our side").count(), 0, "no misleading server error");
  assert.equal(await page.evaluate(() => localStorage.getItem("lv.session")), null, "the dead session is cleared");
  // Signing in again returns to where they were, and it works.
  await page.getByRole("button", { name: /Sign in \(simulated\)/ }).click();
  await page.waitForURL(/\/me$/);
  await page.getByRole("heading", { level: 1 }).waitFor();
  assert.equal(await page.getByText("Something went wrong on our side").count(), 0);
  await ctx.close();
});

test("a session reaching its expiry time while the tab is open ends the session", async () => {
  const { page, ctx } = await withSession({ token: "simulated", name: "Dana", expiresAt: Date.now() + 2500 }, "/me");
  await page.getByRole("heading", { level: 1 }).waitFor(); // signed in and working first
  await page.waitForURL(/\/signin/, { timeout: 8000 });
  await page.getByText("You were signed out").waitFor();
  await ctx.close();
});

test("on a public page the expiry shows a toast and the header goes back to Sign in", async () => {
  const { page, ctx } = await withSession({ token: "simulated", name: "Dana", expiresAt: Date.now() + 2500 }, "/pricing");
  await page.getByText(/Your session ended, so you've been signed out/).waitFor({ timeout: 8000 });
  await page.getByRole("link", { name: "Sign in" }).first().waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem("lv.session")), null);
  await ctx.close();
});

test("a healthy session is left alone, and the notice does not appear on a normal visit to sign-in", async () => {
  const hour = Date.now() + 3_600_000;
  const ok = await withSession({ token: "simulated", name: "Dana", expiresAt: hour }, "/me");
  await ok.page.getByRole("heading", { level: 1 }).waitFor();
  await ok.page.waitForTimeout(1500);
  assert.match(ok.page.url(), /\/me$/);
  await ok.ctx.close();

  const fresh = await openPage(app, { signedIn: false });
  await fresh.go("/signin");
  assert.equal(await fresh.page.getByText("You were signed out").count(), 0);
  await fresh.ctx.close();
});
