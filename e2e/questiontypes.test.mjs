// The v2 question types (000047) and the template gallery (dev mock). Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

const section = (page) => page.getByRole("region", { name: /Question types/ });

for (const [width, label] of [[390, "phone"], [1280, "desktop"]]) {
  test(`every answer control works and never scrolls sideways (${label}, light and dark)`, async () => {
    for (const theme of ["light", "dark"]) {
      const { page, go, ctx, errors } = await openPage(app, { width, theme });
      await go("/__gallery");
      const s = section(page);
      await s.scrollIntoViewIfNeeded();
      // face scale: radios with text names, arrow keys move and select
      const faces = s.getByRole("radiogroup", { name: "How was lunch?" });
      await faces.getByRole("radio", { name: "Happy", exact: true }).click();
      assert.equal(await faces.getByRole("radio", { name: "Happy", exact: true }).getAttribute("aria-checked"), "true");
      await faces.getByRole("radio", { name: "Happy", exact: true }).press("ArrowRight");
      assert.equal(await faces.getByRole("radio", { name: "Very happy", exact: true }).getAttribute("aria-checked"), "true");
      // dropdown, number, date are real inputs
      await s.getByLabel("Which room?").selectOption("East");
      await s.getByLabel("How many came?").fill("12");
      await s.getByLabel("When did you visit?").fill("2026-05-01");
      // nps: eleven targets of at least 44px
      const nps = s.getByRole("radiogroup", { name: "Would you recommend us?" });
      assert.equal(await nps.getByRole("radio").count(), 11);
      const box = await nps.getByRole("radio").first().boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, `nps target ${box.width}x${box.height}`);
      await nps.getByRole("radio", { name: "9", exact: true }).click();
      // agree scale shows words
      await s.getByRole("radiogroup", { name: "I felt heard." }).getByRole("radio", { name: "Agree", exact: true }).click();
      // ranking: tap in order, then it reports every rank
      const rank = s.getByRole("group", { name: "Rank the soups." });
      await rank.getByRole("checkbox", { name: /Leek/ }).click();
      await rank.getByRole("checkbox", { name: /Tomato/ }).click();
      await rank.getByRole("checkbox", { name: /Lentil/ }).click();
      assert.equal(await rank.getByRole("checkbox", { name: "Leek, ranked 1" }).count(), 1);
      assert.match(await rank.getByRole("status").innerText(), /All ranked/);
      // image choice without pictures falls back to labels
      await s.getByRole("radiogroup", { name: "Pick a plate." }).getByRole("radio", { name: /Plate B/ }).click();
      // slider: untouched until moved
      assert.equal(await s.getByTestId("slider-value").innerText(), "–");
      await s.getByLabel("How spicy?").focus();
      await page.keyboard.press("ArrowRight");
      assert.notEqual(await s.getByTestId("slider-value").innerText(), "–");
      // contact, grid, before/after, price, consent, signature
      await s.getByLabel("Name").fill("Ada Lovelace");
      await s.getByLabel("Email").fill("ada@example.com");
      await s.getByRole("radiogroup", { name: /Food: Rate each/ }).getByRole("radio").nth(3).click();
      await s.getByRole("radiogroup", { name: /Before: Then and now/ }).getByRole("radio").nth(1).click();
      await s.getByRole("radiogroup", { name: "Top price?" }).getByRole("radio", { name: /None of these/ }).click();
      await s.getByRole("checkbox", { name: /I agree to be contacted/ }).click();
      assert.equal(await s.getByRole("checkbox", { name: /I agree to be contacted/ }).getAttribute("aria-checked"), "true");
      await s.getByLabel("Sign").fill("Ada Lovelace");
      // file upload shows its limits and refuses a file type that is not allowed
      await s.getByText(/Up to 5 MB/).waitFor();
      await s.locator('input[type="file"]').setInputFiles({ name: "a.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("x") });
      await s.getByText("That kind of file is not allowed here.").waitFor();
      assert.ok(await noHorizontalScroll(page), `${theme} ${width}`);
      assert.deepEqual(errors, [], `${theme} ${width}`);
      await ctx.close();
    }
  });
}

test("Free: a Plus type previews with a lock badge that says what unlocks it, and is not saved", async () => {
  const { page, go, ctx, errors } = await openPage(app, { width: 1280 });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Types");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Would you recommend us?");
  await page.getByRole("combobox", { name: "Type" }).click();
  // Free types have no badge; Plus and Pro show theirs
  await page.getByRole("option", { name: /NPS 0–10 · Plus/ }).click();
  const note = page.getByTestId("kind-locked");
  await note.waitFor();
  assert.match(await note.innerText(), /Plus type\. Included with Creator Plus or a Starter Hub\./);
  assert.equal(await page.getByRole("radiogroup", { name: /Would you recommend us/ }).getByRole("radio").count(), 11, "the preview still works");
  await page.waitForTimeout(1200);
  const saved = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("lv.mock.state")).campaigns.flatMap((c) => c.questions)));
  assert.ok(!saved.includes("Would you recommend us?"), "a locked type is never saved");
  // a free type saves
  await page.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: /^Face scale/ }).click();
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  assert.equal(await page.getByTestId("kind-locked").count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Creator Plus saves an NPS question with its settings; Pro types still preview", async () => {
  const { page, go, ctx, errors } = await openPage(app, { width: 1280, seed: "creator" });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Plus types");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Would you recommend us?");
  await page.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: /^NPS 0–10/ }).click();
  await page.getByLabel("Label for 0 (optional)").fill("No way");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  const q = await page.evaluate(() => JSON.parse(localStorage.getItem("lv.mock.state")).campaigns.flatMap((c) => c.questions).find((x) => x.kind === "nps"));
  assert.equal(q.config.low_label, "No way");
  await page.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: /Agree grid · Pro/ }).click();
  assert.match(await page.getByTestId("kind-locked").innerText(), /Pro type\. Included with Creator Pro or a Team Hub\./);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("an identity type on an anonymous survey is explained and not saved", async () => {
  const { page, go, ctx } = await openPage(app, { width: 1280, seed: "creatorpro" });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Anonymous");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Your details");
  await page.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: /^Contact details/ }).click();
  await page.getByTestId("kind-identified").waitFor();
  await ctx.close();
});

test("a Pro template creates a draft with its Pro question types", async () => {
  const { page, go, ctx, errors } = await openPage(app, { width: 1280, seed: "creatorpro" });
  await go("/surveys/new?template=scored-quiz");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  const items = page.locator(".lv-outline-item:visible");
  await items.nth(9).waitFor();
  assert.equal(await items.count(), 10);
  const quiz = await page.evaluate(() => JSON.parse(localStorage.getItem("lv.mock.state")).campaigns.flatMap((c) => c.questions).find((x) => x.prompt === "What is the capital of France?").config.quiz);
  assert.deepEqual(quiz, { correct: ["Paris"], points: 1 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Free account: a Pro template in the builder explains the plan and cannot be created", async () => {
  const { page, go, ctx } = await openPage(app, { width: 1280 });
  await go("/surveys/new?template=scored-quiz");
  await page.getByTestId("template-locked").waitFor();
  assert.match(await page.getByTestId("template-locked").innerText(), /Creator Pro or a Team Hub/);
  await page.getByLabel("Title").fill("x");
  assert.equal(await page.getByRole("button", { name: /Create draft/ }).isDisabled(), true);
  await ctx.close();
});

test("gallery: 82 templates, search, category and plan filters, with no sideways scroll", async () => {
  for (const width of [390, 1280]) {
    const { page, go, ctx, errors } = await openPage(app, { width, signedIn: false });
    await go("/templates");
    assert.match(await page.getByTestId("template-count").innerText(), /^82 templates/);
    await page.getByRole("radio", { name: "Plus", exact: true }).click();
    assert.match(await page.getByTestId("template-count").innerText(), /^22 templates/);
    await page.getByRole("radio", { name: "Pro", exact: true }).click();
    assert.match(await page.getByTestId("template-count").innerText(), /^15 templates/);
    await page.getByRole("radio", { name: "Free", exact: true }).click();
    assert.match(await page.getByTestId("template-count").innerText(), /^45 templates/);
    await page.getByRole("radio", { name: "All plans" }).click();
    await page.getByRole("searchbox", { name: "Search templates" }).fill("webinar");
    assert.equal(await page.getByTestId("template-card").count(), 1);
    await page.getByRole("searchbox", { name: "Search templates" }).fill("zzzz");
    await page.getByText("No templates match").waitFor();
    assert.ok(await noHorizontalScroll(page), String(width));
    assert.deepEqual(errors, [], String(width));
    await ctx.close();
  }
});

test("gallery: a category page lists its templates; a template page shows a live preview, its plan and the privacy line", async () => {
  const { page, go, ctx, errors } = await openPage(app, { width: 390, signedIn: false });
  await go("/templates/customers");
  assert.match(await page.getByTestId("template-count").innerText(), /^12 templates/);
  await go("/templates/csat-survey");
  await page.getByTestId("template-page").waitFor();
  assert.match(await page.getByTestId("template-intro").innerText(), /Anonymous/);
  const faces = page.getByTestId("template-preview").getByRole("radiogroup").first();
  await faces.getByRole("radio", { name: "Happy", exact: true }).click();
  assert.equal(await faces.getByRole("radio", { name: "Happy", exact: true }).getAttribute("aria-checked"), "true");
  await go("/templates/feedback-360");
  assert.match(await page.getByTestId("template-intro").innerText(), /^Identified survey/);
  assert.equal(await page.getByTestId("plan-pro").count() >= 1, true);
  await go("/templates/trivia-night");
  await page.getByText("Not ready to use yet").first().waitFor();
  assert.equal(await page.getByTestId("use-this").count(), 0, "a flagged template cannot be used");
  assert.ok(await noHorizontalScroll(page));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("gallery: locked templates show the plan needed and link to the plans; the right plan sees Use", async () => {
  const free = await openPage(app, { width: 1280 });
  await free.go("/templates/nps-survey");
  const locked = free.page.getByTestId("use-locked").first();
  await locked.waitFor();
  assert.match(await locked.innerText(), /Needs Plus/);
  assert.equal(await locked.getAttribute("href"), "/pricing");
  assert.equal(await free.page.getByTestId("use-this").count(), 0);
  await free.ctx.close();
  const pro = await openPage(app, { width: 1280, seed: "creatorpro" });
  await pro.go("/templates/nps-survey");
  await pro.page.getByTestId("use-this").first().waitFor();
  assert.equal(await pro.page.getByTestId("use-this").first().getAttribute("href"), "/surveys/new?template=nps-survey");
  await pro.ctx.close();
});

test("use-case pages recommend templates", async () => {
  const { page, go, ctx } = await openPage(app, { width: 390, signedIn: false });
  await go("/use-cases/customer-feedback-questionnaire");
  const strip = page.getByTestId("uc-recommended");
  await strip.waitFor();
  assert.ok(await strip.getByTestId("template-card").count() >= 3);
  assert.ok(await noHorizontalScroll(page));
  await ctx.close();
});
