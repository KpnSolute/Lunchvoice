// Sections and "show only if" rules (000041): builder, plan lock and the answering screen (dev mock).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

const DRAFT = "/northside-running/campaigns/cmp-seed-3/studio"; // Starter Hub draft with no questions
const mockState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("lv.mock.state")));

async function addChoice(page, prompt, options) {
  const add = page.getByTestId("question-workbench").locator(":visible").getByTestId("add-question");
  if (await add.count()) await add.first().click();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill(prompt);
  for (const [i, o] of options.entries()) {
    if (i >= 2) await page.getByTestId("add-option").click();
    await page.getByRole("textbox", { name: `Option ${i + 1}` }).fill(o);
  }
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await page.getByTestId("question-outline").locator(":visible").getByText(prompt).first().waitFor();
}

test("Starter Hub: start a section on question 2 and show it only to one answer", async () => {
  const { page, go, ctx, errors } = await openPage(app, { width: 1280 });
  await go(DRAFT);
  await page.getByRole("tab", { name: /^Questions/ }).click();
  await addChoice(page, "What is your role?", ["Staff", "Manager", "Corporate"]);
  await addChoice(page, "Which reports take longest?", ["Budget", "Audits"]);
  const panel = page.getByTestId("section-panel");
  await panel.getByTestId("section-start").click();
  await page.getByLabel("Section title").fill("Across centers");
  await panel.getByRole("combobox", { name: "Who sees this section" }).click();
  await page.getByRole("option", { name: /Only if “What is your role\?” is/ }).click();
  await panel.getByRole("checkbox", { name: "Corporate" }).click();
  await panel.getByTestId("section-rule-summary").getByText("Shown when “What is your role?” is Corporate").waitFor();
  await page.locator('[data-testid="outline-section"]:visible', { hasText: "Across centers" }).first().waitFor();
  await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem("lv.mock.state"));
    const c = s.campaigns.find((x) => x.campaign_id === "cmp-seed-3");
    return c?.questions.some((q) => q.config?.section?.show_if?.any_of?.includes("Corporate"));
  });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Free Quick Survey: sections are locked with the plans that include them", async () => {
  const { page, go, ctx } = await openPage(app, { width: 1280 });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Free survey");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await addChoice(page, "First?", ["A", "B"]);
  await addChoice(page, "Second?", ["C", "D"]);
  await page.getByTestId("section-locked").getByText(/Creator Plus or a Starter Hub/).waitFor();
  assert.equal(await page.getByTestId("section-start").count(), 0);
  await ctx.close();
});

test("Player: a conditional section appears only for the matching answer, with its title", async () => {
  const s = await openPage(app, { signedIn: false, width: 390, height: 844 });
  await s.go("/waitlist");
  await s.page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("lv.mock.state"));
    const c = st.campaigns.find((x) => x.campaign_id === "cmp-seed-1");
    const q3 = c.questions.find((q) => q.question_id === "cmp-seed-1-q3");
    q3.config = { ...q3.config, section: { title: "Saturday plans", description: "Only for Saturday people.", show_if: { question_id: "cmp-seed-1-q2", any_of: ["Saturday"] } } };
    localStorage.setItem("lv.mock.state", JSON.stringify(st));
  });
  const code = (await mockState(s.page)).campaigns.find((c) => c.campaign_id === "cmp-seed-1").join_code;
  await s.go(`/c/${code}`);
  const { page } = s;
  await page.getByText(/^3 questions/).waitFor();
  await page.getByTestId("player-start").click();
  await page.getByRole("radio", { name: "4 of 5" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: "Tuesday" }).click();
  // Tuesday: question 2 is the last one this person sees.
  await page.getByRole("button", { name: "Review" }).waitFor();
  assert.equal(await page.getByTestId("player-progress").getAttribute("aria-valuemax"), "2");
  await page.getByRole("radio", { name: "Saturday" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByTestId("player-section").getByText("Saturday plans").waitFor();
  assert.equal(await page.getByTestId("player-progress").getAttribute("aria-valuemax"), "3");
  // Going back to Tuesday drops the Saturday answer from what is sent.
  await page.getByRole("radio", { name: "Yes" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("radio", { name: "Tuesday" }).click();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByTestId("player-thanks").waitFor();
  assert.ok(await noHorizontalScroll(page));
  await s.ctx.close();
});
