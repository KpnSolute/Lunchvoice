// Quick Survey starter templates (dev mock). Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

test("a template creates a draft that already has its questions, in order", async () => {
  const { page, go, ctx, errors } = await openPage(app, { width: 1280 });
  await go("/surveys/new");
  const picker = page.getByTestId("template-picker");
  await picker.getByRole("radio", { name: /Team pulse check/ }).click();
  assert.equal(await page.getByLabel("Title").inputValue(), "Weekly team pulse", "the template fills the title");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  const items = page.locator(".lv-outline-item:visible");
  await items.nth(3).waitFor();
  const prompts = (await items.locator(".lv-outline-text > span").allInnerTexts()).map((t) => t.trim());
  assert.deepEqual(prompts, ["How was your week?", "How is your workload right now?", "Do you have what you need to do your job well?", "What would make next week better?"], "questions keep the template order");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("a title the creator already typed is kept when they pick a template", async () => {
  const { page, go, ctx } = await openPage(app);
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Our own title");
  await page.getByTestId("template-picker").getByRole("radio", { name: /Event feedback/ }).click();
  assert.equal(await page.getByLabel("Title").inputValue(), "Our own title");
  await ctx.close();
});

test("Blank still starts empty", async () => {
  const { page, go, ctx } = await openPage(app);
  await go("/surveys/new");
  assert.equal(await page.getByTestId("template-picker").getByRole("radio", { name: /Blank/ }).isChecked(), true);
  await page.getByLabel("Title").fill("No template");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  // A blank draft shows only the editor's unsaved "New question" placeholder, never a template question.
  assert.deepEqual(await page.locator(".lv-outline-item:visible").locator(".lv-outline-text > span").allInnerTexts(), ["New question"]);
  await ctx.close();
});

test("a shared template link preselects it, including through sign-in", async () => {
  const signedOut = await openPage(app, { signedIn: false });
  await signedOut.go("/surveys/new?template=event-feedback");
  await signedOut.page.waitForURL(/\/signin/);
  await signedOut.page.getByRole("button", { name: /Sign in \(simulated\)/ }).click();
  await signedOut.page.waitForURL(/\/surveys\/new\?template=event-feedback/);
  assert.equal(await signedOut.page.getByTestId("template-picker").getByRole("radio", { name: /Event feedback/ }).isChecked(), true);
  assert.equal(await signedOut.page.getByLabel("Title").inputValue(), "How was the event?");
  await signedOut.ctx.close();

  const { page, go, ctx } = await openPage(app);
  await go("/surveys/new?template=does-not-exist");
  assert.equal(await page.getByTestId("template-picker").getByRole("radio", { name: /Blank/ }).isChecked(), true, "an unknown id falls back to Blank");
  await ctx.close();
});

test("the picker fits a phone", async () => {
  const { page, go, ctx } = await openPage(app, { width: 390, height: 800 });
  await go("/surveys/new");
  assert.ok(await noHorizontalScroll(page));
  await ctx.close();
});
