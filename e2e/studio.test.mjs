// UI regression suite for the Hub overview, the Campaign Studio and the Quick Survey flow (dev mock).
// Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

const DRAFT = "/northside-running/campaigns/cmp-seed-3/studio"; // seeded draft with no questions
const inFuture = (days) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

async function studio(opts) {
  const s = await openPage(app, opts);
  await s.go(DRAFT);
  await s.page.getByTestId("studio").waitFor();
  return s;
}
const tab = (page, name) => page.getByRole("tab", { name: new RegExp(`^${name}`) });

/** Add one valid single-choice question through the workbench (the ONE add action). */
async function addChoiceQuestion(page, prompt = "Which night works?") {
  await tab(page, "Questions").click();
  const add = page.getByTestId("question-workbench").locator(":visible").getByTestId("add-question");
  if (await add.count()) await add.first().click();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill(prompt);
  await page.getByRole("textbox", { name: "Option 1" }).fill("Tuesday");
  await page.getByRole("textbox", { name: "Option 2" }).fill("Thursday");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await page.getByTestId("question-outline").locator(":visible").getByText(prompt).first().waitFor();
}

test("Hub overview: the plan name never wraps per character and the share URL is not clipped", async () => {
  for (const width of [1440, 1280, 768, 390]) {
    const { page, go, ctx } = await openPage(app, { width });
    await go("/northside-running");
    const value = page.getByTestId("hub-stats").locator("[data-slot=stat-value]", { hasText: "Starter" });
    const m = await value.evaluate((el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight);
      return { lines: Math.round(el.getBoundingClientRect().height / lh), sw: el.scrollWidth, cw: el.clientWidth };
    });
    assert.equal(m.lines, 1, `Starter renders on one line at ${width}px`);
    assert.ok(m.sw <= m.cw + 1, `Starter is not clipped at ${width}px`);
    const url = page.getByTestId("hub-share-url");
    const u = await url.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, text: el.textContent }));
    assert.ok(u.sw <= u.cw + 1, `share URL not truncated at ${width}px`);
    assert.equal(u.text, "lunchvoice.com/northside-running");
    assert.ok(await noHorizontalScroll(page), `no horizontal scroll at ${width}px`);
    await ctx.close();
  }
});

test("Hub share card copy follows the membership mode", async () => {
  const { page, go, ctx } = await openPage(app);
  await go("/northside-running");
  const card = page.getByTestId("hub-share");
  await card.getByRole("heading", { name: "Approval Hub" }).waitFor();
  assert.equal(await card.getByText("Joining follows").count(), 0);
  for (const name of ["Copy link", "QR code", "Invite"]) assert.equal(await card.getByRole(name === "Invite" ? "link" : "button", { name }).count(), 1);
  await ctx.close();
});

test("Studio: free section navigation", async () => {
  const { page, ctx, errors } = await studio();
  for (const name of ["Questions", "Review", "Details", "Schedule", "Audience"]) {
    await tab(page, name).click();
    assert.equal(await tab(page, name).getAttribute("aria-selected"), "true");
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Questions: exactly one Add question action; options add, remove; required toggles optional", async () => {
  const { page, ctx } = await studio();
  await tab(page, "Questions").click();
  assert.equal(await page.getByRole("button", { name: /Add question/ }).locator("visible=true").count(), 1);
  assert.equal(await page.getByText("Options, one per line").count(), 0);
  assert.equal(await page.getByText("Every question needs an answer.").count(), 0);
  await addChoiceQuestion(page);
  const rows = page.getByTestId("option-rows").locator("li");
  assert.equal(await rows.count(), 2);
  await page.getByTestId("add-option").click();
  assert.equal(await rows.count(), 3);
  await page.getByRole("button", { name: "Remove option 3" }).click();
  assert.equal(await rows.count(), 2);
  const required = page.getByRole("switch", { name: "Required" });
  assert.equal(await required.getAttribute("aria-checked"), "true");
  await required.click();
  assert.equal(await required.getAttribute("aria-checked"), "false");
  await page.getByTestId("question-outline").locator(":visible").getByText(/optional/).first().waitFor();
  await ctx.close();
});

test("Questions: changing to a type without options asks first", async () => {
  const { page, ctx } = await studio();
  await addChoiceQuestion(page);
  await page.getByLabel("Type").click();
  await page.getByRole("option", { name: "Rating 1–5" }).click();
  await page.getByRole("alertdialog").getByText(/2 options on this question will be removed/).waitFor();
  await page.getByRole("button", { name: "Keep Single choice" }).click();
  assert.equal(await page.getByTestId("option-rows").locator("li").count(), 2);
  await ctx.close();
});

test("Audience: participants, identity and guests are separate controls", async () => {
  const { page, ctx } = await studio();
  await tab(page, "Audience").click();
  await page.getByTestId("audience-who").getByText("Members of Northside Running Club").waitFor();
  const anon = page.getByRole("radio", { name: /Anonymous/ });
  await anon.click();
  assert.equal(await anon.getAttribute("aria-checked"), "true");
  assert.equal(await page.getByRole("radio", { name: /Identified/ }).getAttribute("aria-checked"), "false");
  const guests = page.getByRole("switch", { name: "Allow guest responses" });
  const before = await guests.getAttribute("aria-checked");
  await guests.click();
  await page.waitForFunction((b) => document.querySelector('[aria-label="Allow guest responses"]')?.getAttribute("aria-checked") !== b, before);
  await page.getByText("Guests never become Hub members.").waitFor();
  await ctx.close();
});

test("Schedule: the end must be after the start; Publish stays disabled until it is", async () => {
  const { page, ctx } = await studio();
  await addChoiceQuestion(page);
  await tab(page, "Schedule").click();
  await page.getByTestId("schedule").getByRole("radio", { name: "Scheduled" }).first().click();
  await page.getByLabel("Start time").fill(inFuture(3));
  await page.getByTestId("schedule").getByRole("radio", { name: "Scheduled" }).last().click();
  await page.getByLabel("End time").fill(inFuture(2));
  await page.getByText("The scheduled end time must be after the start time.").first().waitFor();
  const publish = page.getByTestId("publish");
  assert.ok(await publish.isDisabled());
  assert.equal(await publish.getAttribute("aria-describedby"), "publish-blockers");
  assert.match(await page.locator("#publish-blockers").textContent(), /end time must be after the start time/);
  await page.getByLabel("End time").fill(inFuture(5));
  await page.waitForFunction(() => !document.querySelector('[data-testid="publish"]')?.hasAttribute("disabled"));
  assert.equal((await publish.textContent()).trim(), "Schedule");
  await publish.click();
  await page.getByRole("button", { name: "Pause" }).waitFor();
  assert.equal(await page.getByTestId("publish").count(), 0, "a scheduled Campaign never shows Publish");
  await page.locator("[data-slot=badge]", { hasText: "scheduled" }).first().waitFor();
  await ctx.close();
});

test("Review: exact checklist; Publish disabled while invalid, enabled when valid; lifecycle after publish", async () => {
  const { page, ctx } = await studio();
  await tab(page, "Review").click();
  await page.getByTestId("readiness").getByText("Add at least one question.").waitFor();
  assert.ok(await page.getByTestId("publish").isDisabled());
  await tab(page, "Questions").click();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Shirt size?");
  await page.getByRole("textbox", { name: "Option 1" }).fill("M");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await tab(page, "Review").click();
  await page.getByTestId("readiness").getByText("Question 1 needs at least two options.").waitFor();
  assert.ok(await page.getByTestId("publish").isDisabled());
  await tab(page, "Questions").click();
  await page.getByRole("textbox", { name: "Option 2" }).fill("L");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await tab(page, "Review").click();
  await page.getByTestId("readiness").getByText("Ready to publish").waitFor();
  const publish = page.getByTestId("publish");
  assert.equal((await publish.textContent()).trim(), "Publish");
  await publish.click();
  await page.getByRole("button", { name: "Pause" }).waitFor();
  await page.getByRole("button", { name: "Close" }).waitFor();
  assert.equal(await page.getByTestId("publish").count(), 0, "an active Campaign never shows Publish");
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Resume" }).waitFor();
  await ctx.close();
});

test("Preview renders the draft without submitting anything", async () => {
  const { page, ctx } = await studio();
  await addChoiceQuestion(page);
  const calls = [];
  await page.exposeFunction("__noteRpc", (fn) => calls.push(fn));
  await page.getByTestId("preview").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Start preview" }).click();
  await dialog.getByRole("radio", { name: "Tuesday" }).click();
  await dialog.getByRole("button", { name: "Finish" }).click();
  await dialog.getByText("Nothing was sent.").waitFor();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("lv.mock.state")));
  const draft = state.campaigns.find((c) => c.campaign_id === "cmp-seed-3");
  assert.equal(draft.responses.length, 0, "preview never stores a response");
  await ctx.close();
});

test("390px: Studio renders without horizontal scroll and the outline becomes a sheet", async () => {
  const { page, ctx } = await studio({ width: 390, height: 844 });
  for (const name of ["Details", "Questions", "Audience", "Schedule", "Review"]) {
    await tab(page, name).click();
    assert.ok(await noHorizontalScroll(page), `${name} fits at 390px`);
  }
  await tab(page, "Questions").click();
  assert.ok(!(await page.getByRole("region", { name: "Question outline" }).isVisible()));
  await page.getByRole("button", { name: /^Questions · / }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Add question/ }).waitFor();
  await ctx.close();
});

test("Quick Survey stays the simple flow: Title, Questions, Who can respond, Publish", async () => {
  const { page, go, ctx } = await openPage(app, { width: 1280 });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Book club pick");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  assert.equal(await page.getByRole("tablist", { name: "Studio sections" }).count(), 0, "no full Studio");
  for (const h of ["Title", "Questions", "Who can respond", "Publish"]) await page.getByRole("heading", { name: new RegExp(h) }).first().waitFor();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Which book?");
  await page.getByRole("textbox", { name: "Option 1" }).fill("Dune");
  await page.getByRole("textbox", { name: "Option 2" }).fill("Emma");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await page.getByTestId("readiness").getByText("Ready to publish").waitFor();
  await page.getByTestId("publish").click();
  await page.getByTestId("share").getByText("Join code").waitFor();
  await page.waitForSelector('[role=img][aria-label^="QR code"] svg');
  assert.ok(await noHorizontalScroll(page));
  await ctx.close();
});
