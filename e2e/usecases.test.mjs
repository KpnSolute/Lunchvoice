// Use-case pages and the "Use this template" path (dev mock). Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

test("the hub lists every use case and each card opens its page", async () => {
  const { page, go, ctx } = await openPage(app, { signedIn: false });
  await go("/use-cases");
  const grid = page.getByTestId("use-case-grid");
  assert.ok((await grid.getByRole("link", { name: "Use this template" }).count()) >= 10, "a template button per use case");
  await grid.getByRole("link", { name: "Club and committee votes" }).click();
  await page.getByTestId("use-case-page").waitFor();
  assert.match(await page.locator("h1").innerText(), /ballot/i);
  await ctx.close();
});

test("a use-case page shows the template's real questions", async () => {
  const { page, go, ctx, errors } = await openPage(app, { signedIn: false });
  await go("/use-cases/anonymous-employee-survey");
  const q = await page.getByTestId("uc-questions").locator(".lv-uc-prompt").allInnerTexts();
  assert.equal(q[0], "Overall, how satisfied are you working here?");
  assert.equal(q.length, 5);
  assert.ok((await page.getByTestId("uc-why").locator("li").count()) >= 3);
  assert.equal(await page.title(), "Anonymous employee survey: free template · LunchVoice");
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://lunchvoice.com/use-cases/anonymous-employee-survey");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Use this template signs you in, then opens that template with its title", async () => {
  const { page, go, ctx } = await openPage(app, { signedIn: false });
  await go("/use-cases/event-feedback-form");
  await page.getByTestId("use-template").click();
  await page.waitForURL(/\/signin/);
  await page.getByRole("button", { name: /Sign in \(simulated\)/ }).click();
  await page.waitForURL(/\/surveys\/new\?template=event-feedback/);
  assert.equal(await page.getByLabel("Title").inputValue(), "How was the event?");
  await ctx.close();
});

test("the vote template is invite-only and anonymous, and says it is not a certified election", async () => {
  const { page, go, ctx } = await openPage(app, { signedIn: false });
  await go("/use-cases/club-and-committee-votes");
  await page.getByText(/not a certified election/).waitFor();
  await ctx.close();
  const s = await openPage(app);
  await s.go("/surveys/new?template=committee-vote");
  assert.equal(await s.page.getByRole("radio", { name: /Invite only/ }).isChecked(), true);
  assert.equal(await s.page.getByRole("radio", { name: /^Anonymous You see totals/ }).isChecked(), true);
  await s.ctx.close();
});

test("an unknown use case is a 404, not a blank page", async () => {
  const { page, go, ctx } = await openPage(app, { signedIn: false });
  await go("/use-cases/does-not-exist");
  assert.equal(await page.getByTestId("use-case-page").count(), 0);
  await ctx.close();
});

test("the home page links to the use cases, and pages fit a phone", async () => {
  const { page, go, ctx } = await openPage(app, { signedIn: false, width: 390, height: 800 });
  await go("/");
  assert.ok((await page.getByTestId("landing-use-cases").getByRole("link").count()) >= 10);
  assert.ok(await noHorizontalScroll(page), "home");
  for (const p of ["/use-cases", "/use-cases/member-questionnaire"]) {
    await go(p);
    assert.ok(await noHorizontalScroll(page), p);
  }
  await ctx.close();
});
