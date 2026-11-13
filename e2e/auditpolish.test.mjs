// Audit polish (2026-11-12): real 404, per-Hub head, a Hub's public poll, deleting a Quick Survey, building a
// survey before signing in, and the Creator plans on /pricing. Dev mock, desktop and 390px.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

for (const width of [1280, 390]) {
  test(`F8: an unknown address is a 404 page that says so and is noindex (${width}px)`, async () => {
    const { page, go, ctx, errors } = await openPage(app, { width, signedIn: false });
    await go("/products/not-a-product");
    await page.getByText("This page isn’t here.").waitFor();
    assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex");
    assert.match(await page.title(), /^Page not found/);
    assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
    assert.ok(await noHorizontalScroll(page));
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`F4 and F5: a public Hub has its own title and shows its open poll to a signed-out visitor (${width}px)`, async () => {
    const { page, go, ctx, errors } = await openPage(app, { width, signedIn: false });
    await go("/northside-running");
    const poll = page.getByTestId("hub-public-poll");
    await poll.waitFor();
    assert.match(await poll.innerText(), /Spring route check-in/);
    assert.doesNotMatch(await poll.innerText(), /\b14\b/, "never a count of answers");
    assert.match(await page.title(), /^Northside Running Club on LunchVoice/);
    assert.match(await page.locator('meta[name="description"]').getAttribute("content"), /Weekly long runs/);
    assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex");
    assert.ok(await noHorizontalScroll(page));
    await page.getByTestId("hub-public-poll-answer").click();
    await page.waitForURL(/\/c\/[0-9a-f]{32}/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`P8: deleting a Quick Survey asks once, then removes it and its results (${width}px)`, async () => {
    const { page, go, ctx, errors } = await openPage(app, { width });
    await go("/surveys");
    const rows = page.locator("a[href^='/surveys/']:not([href='/surveys/new'])");
    const before = await rows.count();
    assert.ok(before > 0);
    const title = (await rows.first().innerText()).split("\n")[0].trim();
    await rows.first().click();
    await page.getByTestId("survey-delete").waitFor();
    assert.ok(await noHorizontalScroll(page));
    await page.getByTestId("survey-delete-open").click();
    const dialog = page.getByRole("alertdialog");
    assert.match(await dialog.innerText(), /can’t be undone/);
    await dialog.getByRole("button", { name: /^Delete survey/ }).click();
    await page.waitForURL(/\/surveys$/);
    await page.getByText("Survey deleted").waitFor();
    assert.equal(await page.getByText(title, { exact: true }).count(), 0, "the deleted survey is gone from the list");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`F6: build a survey signed out, sign in at Publish, the draft survives (${width}px)`, async () => {
    const { page, go, ctx, errors } = await openPage(app, { width, signedIn: false });
    await go("/surveys/new");
    await page.getByTestId("visitor-builder").waitFor();
    await page.getByTestId("vb-publish").click();
    await page.getByText("Add a title.").first().waitFor();
    await page.getByTestId("vb-title").fill("Friday lunch");
    await page.getByTestId("vb-add").click();
    await page.getByTestId("vb-prompt").fill("How was lunch?");
    assert.ok(await noHorizontalScroll(page));
    // a reload keeps the draft
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.getByTestId("vb-title").inputValue(), "Friday lunch");
    await page.getByTestId("vb-publish").click();
    await page.waitForURL(/\/signin/);
    await page.getByRole("button", { name: /Sign in \(simulated\)/ }).click();
    await page.waitForURL(/\/surveys\/[^/]+$/);
    await page.getByTestId("quick-editor").waitFor();
    assert.equal(await page.getByLabel("Title").first().inputValue(), "Friday lunch");
    assert.equal(await page.evaluate(() => localStorage.getItem("lv-survey-draft-v1")), null, "the saved draft is cleared once created");
    assert.deepEqual(errors, []);
    await ctx.close();
  });

  test(`Pricing: Creator Plus and Creator Pro open with billing, and Team copy claims nothing unbuilt (${width}px)`, async () => {
    const { page, go, ctx, errors } = await openPage(app, { width, signedIn: false });
    await go("/pricing");
    const creator = page.getByTestId("creator-plans");
    const text = await creator.innerText();
    assert.match(text, /Creator Plus/);
    assert.match(text, /\$5/);
    assert.match(text, /Creator Pro/);
    assert.match(text, /\$15/);
    assert.match(text, /Opens with billing/);
    assert.match(text, /30 questions/);
    assert.match(text, /100 questions/);
    assert.match(text, /Trends, results charts.*coming soon/);
    assert.match(text, /one person/i);
    assert.match(text, /community with members/i);
    assert.match(text, /Linked Questions: show-only-if rules and end-survey/);
    assert.equal(await creator.getByRole("button", { name: /Opens with billing/ }).first().isDisabled(), true);
    const body = await page.locator("main, .lv-mk").first().innerText();
    assert.doesNotMatch(body, /Enhanced Campaign modes|Advanced targeting and analytics|Advanced analytics/);
    assert.ok(await noHorizontalScroll(page));
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
