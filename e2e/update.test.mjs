// "A new version of LunchVoice is ready" (dev mock): the notice appears when /version.json names a different build,
// waits while someone is typing, never reloads by itself, and recovers from a lazy chunk that vanished in a deploy.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

const NOTICE = "A new version of LunchVoice is ready.";

async function newDeploy(page) {
  await page.route("**/version.json*", (r) => r.fulfill({ contentType: "application/json", headers: { "cache-control": "no-store" }, body: JSON.stringify({ id: "brand-new-build", builtAt: new Date().toISOString() }) }));
}
const wake = (page) => page.evaluate(() => window.dispatchEvent(new Event("focus")));

test("a new deploy shows a calm Refresh notice that does not reload the page by itself", async () => {
  const { page, ctx, errors } = await openPage(app, { width: 375, height: 800 });
  await newDeploy(page);
  await page.goto(app.base + "/pricing", { waitUntil: "networkidle" });
  await page.evaluate(() => { window.__stillHere = true; });
  await wake(page);
  const toast = page.getByText(NOTICE);
  await toast.waitFor();
  await page.getByRole("button", { name: "Refresh" }).waitFor();
  assert.equal(await noHorizontalScroll(page), true, "fits 375px");
  assert.equal(await page.evaluate(() => window.__stillHere), true, "no automatic reload");
  await page.waitForTimeout(1500);
  assert.equal(await toast.count(), 1, "stays until dismissed");
  await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Refresh" }).click()]);
  assert.equal(await page.evaluate(() => window.__stillHere), undefined, "Refresh reloads");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("the notice waits while a field is focused, then appears when the person moves on", async () => {
  const { page, ctx } = await openPage(app, { signedIn: false });
  await newDeploy(page);
  await page.goto(app.base + "/join", { waitUntil: "networkidle" });
  const field = page.locator("input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea").first();
  await field.focus();
  await wake(page);
  await page.waitForTimeout(800);
  assert.equal(await page.getByText(NOTICE).count(), 0, "not while typing");
  await field.blur();
  await page.getByText(NOTICE).waitFor();
  await ctx.close();
});

test("no new deploy, no notice", async () => {
  const { page, ctx } = await openPage(app);
  await page.route("**/version.json*", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ id: "dev" }) }));
  await page.goto(app.base + "/pricing", { waitUntil: "networkidle" });
  await wake(page);
  await page.waitForTimeout(800);
  assert.equal(await page.getByText(NOTICE).count(), 0);
  await ctx.close();
});

test("a route chunk that vanished in a deploy offers a refresh instead of a blank page", async () => {
  const { page, ctx } = await openPage(app);
  await page.goto(app.base + "/pricing", { waitUntil: "networkidle" });
  await page.route("**/src/pages/Surveys.tsx*", (r) => r.abort());
  await page.evaluate(() => { history.pushState({}, "", "/surveys"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await page.getByText(NOTICE).first().waitFor();
  await page.getByRole("button", { name: "Refresh" }).first().waitFor();
  await ctx.close();
});
