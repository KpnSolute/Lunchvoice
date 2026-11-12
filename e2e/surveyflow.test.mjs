// Survey creation and Campaign lists: shorter template list, readable labels (dev mock).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

test("new Quick Survey opens on a short template list; Show all and a category list everything", async () => {
  const { page, go, ctx, errors } = await openPage(app, { width: 390 });
  await go("/surveys/new");
  const picker = page.getByTestId("template-picker").getByRole("radiogroup", { name: "Start from" });
  assert.equal(await picker.getByRole("radio").count(), 6, "Blank and five templates");
  // The title is reachable without scrolling past every template.
  const titleTop = await page.getByLabel("Title").evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  assert.ok(titleTop < 1800, `title at ${titleTop}px`);
  const more = page.getByTestId("templates-more");
  const total = Number((await more.innerText()).match(/\d+/)[0]);
  await more.click();
  assert.equal(await picker.getByRole("radio").count(), total + 1);
  assert.equal(await page.getByTestId("templates-more").count(), 0);
  assert.ok(await noHorizontalScroll(page));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("a template picked from the full list stays visible after going back to the short list", async () => {
  const { page, go, ctx } = await openPage(app);
  await go("/surveys/new");
  const picker = page.getByTestId("template-picker").getByRole("radiogroup", { name: "Start from" });
  await page.getByTestId("template-picker").getByRole("radio", { name: "Decisions", exact: true }).click();
  const last = picker.getByRole("radio").last();
  const name = (await last.innerText()).split("\n")[0];
  await last.click();
  await page.getByTestId("template-picker").getByRole("radio", { name: "All", exact: true }).click();
  assert.equal(await picker.getByRole("radio", { name: new RegExp(name) }).isChecked(), true);
  await ctx.close();
});

test("Campaign lists use the same words as their badges and readable mode names", async () => {
  const { page, go, ctx, errors } = await openPage(app);
  await go("/northside-running/campaigns");
  await page.getByRole("radio", { name: "Open", exact: true }).waitFor();
  assert.equal(await page.getByRole("radio", { name: "Live", exact: true }).count(), 0);
  assert.ok(await page.getByText("Survey", { exact: true }).count() >= 1);
  assert.equal(await page.getByText("survey", { exact: true }).count(), 0);
  assert.equal(await page.getByText("Coming with M2").count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});
