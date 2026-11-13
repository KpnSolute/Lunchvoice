// Hub Campaign templates by plan (dev mock). Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

const NEW = "/northside-running/campaigns/new";
const tab = (page, name) => page.getByRole("tab", { name: new RegExp(`^${name}`) });
const picker = (page) => page.getByTestId("campaign-template-picker");
const prompts = (page) => page.locator(".lv-outline-item:visible .lv-outline-text > span").allInnerTexts();

test("a Starter template creates a draft with its question and lands on Review", async () => {
  const { page, go, ctx, errors } = await openPage(app);
  await go(NEW);
  assert.match(await page.getByTestId("group-blurb").innerText(), /do not use one of your 2 active surveys/);
  await picker(page).getByRole("radio", { name: /Weekly poll/ }).click();
  assert.equal(await page.getByLabel("Title").inputValue(), "What should we do next?");
  const summary = page.getByTestId("campaign-template-summary");
  await summary.getByText("Poll").first().waitFor();
  assert.equal(await page.getByRole("radiogroup", { name: "Mode" }).count(), 0, "a template fixes the mode");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.waitForURL(/\/studio\?section=review/);
  await tab(page, "Questions").click();
  assert.deepEqual(await prompts(page), ["What should we do next?"]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("on a Starter Hub the Team templates are shown but locked, with the reason", async () => {
  const { page, go, ctx } = await openPage(app);
  await go(NEW);
  await picker(page).getByRole("radio", { name: "Team Hub" }).click();
  await page.getByText("Some of these need Team features").waitFor();
  const rolePulse = picker(page).getByRole("radio", { name: /Role pulse/ });
  assert.equal(await rolePulse.isDisabled(), true);
  assert.match(await rolePulse.innerText(), /Needs Team features/);
  assert.equal(await picker(page).getByRole("radio", { name: /Quarterly community survey/ }).isDisabled(), true);
  await ctx.close();
});

test("on a Team Hub a role-targeted template is identified and opens the Audience step", async () => {
  const { page, go, ctx } = await openPage(app, { seed: "team" });
  await go(NEW);
  await picker(page).getByRole("radio", { name: "Team Hub" }).click();
  const rolePulse = picker(page).getByRole("radio", { name: /Role pulse/ });
  assert.equal(await rolePulse.isDisabled(), false);
  await rolePulse.click();
  const summary = page.getByTestId("campaign-template-summary");
  await summary.getByText(/Identified: managers see who answered/).waitFor();
  await summary.getByText(/You pick them next/).waitFor();
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.waitForURL(/\/studio\?section=audience/);
  await page.getByTestId("audience-who").waitFor();
  await page.getByRole("radio", { name: /Specific roles/ }).waitFor();
  assert.equal(await page.getByRole("radio", { name: /Specific roles/ }).isDisabled(), false, "identified, so roles can be chosen");
  await tab(page, "Questions").click();
  assert.equal((await prompts(page)).length, 4);
  await ctx.close();
});

test("a time-bounded template sets its end date and says so", async () => {
  const { page, go, ctx } = await openPage(app);
  await go(NEW);
  await picker(page).getByRole("radio", { name: "Time-bounded" }).click();
  await picker(page).getByRole("radio", { name: /Event week feedback/ }).click();
  await page.getByTestId("campaign-template-summary").getByText(/Closes 7 days after you create it/).waitFor();
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.waitForURL(/\/studio\?section=review/);
  await tab(page, "Schedule").click();
  const end = await page.locator("#sched-end").inputValue();
  assert.ok(end, "an end date is set");
  const days = (new Date(end).getTime() - Date.now()) / 86_400_000;
  assert.ok(days > 6 && days < 8, `about 7 days from now, got ${days.toFixed(2)}`);
  await ctx.close();
});

test("a shared link preselects an offered template and ignores one the plan does not offer", async () => {
  const a = await openPage(app);
  await a.go(`${NEW}?template=weekly-poll`);
  assert.equal(await a.page.getByLabel("Title").inputValue(), "What should we do next?");
  assert.equal(await picker(a.page).getByRole("radio", { name: /Weekly poll/ }).isChecked(), true);
  await a.ctx.close();

  const b = await openPage(app);
  await b.go(`${NEW}?template=role-pulse`);
  assert.equal(await picker(b.page).getByRole("radio", { name: /Blank/ }).isChecked(), true, "Team template on a Starter Hub falls back to Blank");
  await b.ctx.close();

  const c = await openPage(app, { seed: "team" });
  await c.go(`${NEW}?template=role-pulse`);
  assert.equal(await picker(c.page).getByRole("radio", { name: /Role pulse/ }).isChecked(), true);
  await c.ctx.close();
});

test("Blank still offers the mode and answers controls", async () => {
  const { page, go, ctx } = await openPage(app);
  await go(NEW);
  await page.getByRole("radiogroup", { name: "Mode" }).waitFor();
  await page.getByRole("radiogroup", { name: "Answers" }).waitFor();
  await ctx.close();
});

test("the picker fits a phone", async () => {
  const { page, go, ctx } = await openPage(app, { width: 390, height: 800 });
  await go(NEW);
  await picker(page).getByRole("radio", { name: /Weekly poll/ }).click();
  assert.ok(await noHorizontalScroll(page));
  await ctx.close();
});

test("the pricing page shows what templates each plan comes with", async () => {
  const { page, go, ctx } = await openPage(app, { signedIn: false });
  await go("/pricing");
  const section = page.getByTestId("plan-templates");
  await section.getByText("Free Quick Survey").waitFor();
  await section.getByText(/45 free templates/).waitFor();
  for (const name of ["Starter Hub", "Team Hub", "Time-bounded"]) await section.getByText(name, { exact: true }).waitFor();
  await section.getByText("Role pulse").waitFor();
  await section.getByText("Weekly poll").waitFor();
  await ctx.close();
});
