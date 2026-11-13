// Creator studio (Creator Plus and above): rail, canvas, properties and theme. A free creator keeps the simple editor.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

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

test("Creator Plus builds a 10-question survey with two sections and a linked question on the canvas", async () => {
  const { page, go, ctx, errors } = await openPage(app, { width: 1280, height: 900, seed: "creator" });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Pro survey");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await page.getByTestId("pro-studio").waitFor();
  await page.getByTestId("studio-rail").waitFor();
  assert.equal(await page.getByTestId("pro-teaser").count(), 0, "no teaser for a plan that has the studio");
  const url = page.url();

  await addChoice(page, "What is your role?", ["Staff", "Manager", "Corporate"]);
  for (let i = 2; i <= 10; i++) await addChoice(page, `Question number ${i}?`, ["Yes please", "No thanks"]);
  assert.equal(await page.getByTestId("rail-thumb").count(), 10);

  // Tiles carry a shape as well as a colour.
  await page.getByTestId("canvas").locator(".lv-ans[data-shape]").first().waitFor();
  assert.ok((await page.getByTestId("canvas").locator(".lv-ans-mark svg").count()) >= 2);

  // Two sections: start one on question 4 and one on question 8, through the properties panel.
  for (const [n, title] of [[4, "Middle"], [8, "End"]]) {
    await page.getByTestId("rail-thumb").nth(n - 1).click();
    const panel = page.getByTestId("section-panel");
    await panel.getByTestId("section-start").click();
    await page.getByLabel("Section title").fill(title);
    await page.waitForFunction((t) => {
      const st = JSON.parse(localStorage.getItem("lv.mock.state"));
      const c = st.campaigns[st.campaigns.length - 1];
      return c.questions.some((q) => q.config?.section?.title === t);
    }, title);
  }
  await page.locator('[data-testid="outline-section"]:visible', { hasText: "Middle" }).first().waitFor();
  await page.locator('[data-testid="outline-section"]:visible', { hasText: "End" }).first().waitFor();

  // One linked question: question 3 only for Corporate.
  await page.getByTestId("rail-thumb").nth(2).click();
  const logic = page.getByTestId("logic-panel");
  await logic.getByTestId("logic-add").click();
  await logic.getByRole("combobox", { name: "Condition 1: question" }).click();
  await page.getByRole("option", { name: /What is your role\?/ }).click();
  await logic.getByRole("checkbox", { name: "Corporate" }).click();
  await logic.getByTestId("logic-summary").getByText("Shown if Q1: Corporate").waitFor();
  await page.getByTestId("outline-rule").filter({ hasText: "Shown if Q1: Corporate" }).first().waitFor();

  // Branding is its own full-width step above the studio (it has a live preview), not a side tab.
  await page.getByTestId("branding").waitFor();
  assert.equal(await page.getByRole("tab", { name: "Theme" }).count(), 0);

  // Reorder with the keyboard: Alt+ArrowUp moves question 2 above question 1.
  await page.getByTestId("rail-thumb").nth(1).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await page.waitForFunction(() => {
    const st = JSON.parse(localStorage.getItem("lv.mock.state"));
    const c = st.campaigns[st.campaigns.length - 1];
    const byPos = [...c.questions].sort((a, b) => a.position - b.position);
    return byPos[0].prompt === "Question number 2?";
  });

  // Duplicate and delete from the menu.
  await page.getByTestId("rail-menu").nth(3).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await page.getByTestId("rail-thumb").filter({ hasText: "(copy)" }).first().waitFor();
  assert.equal(await page.getByTestId("rail-thumb").count(), 11);
  await page.getByTestId("rail-thumb").filter({ hasText: "(copy)" }).first().locator("xpath=ancestor::li[1]").getByTestId("rail-menu").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="rail-thumb"]').length === 10);

  // Publish from the top bar; the survey stays one page (no navigation away from the studio while building).
  assert.equal(page.url(), url);
  await page.getByTestId("studio-title").waitFor();
  assert.ok(await noHorizontalScroll(page));
  assert.deepEqual(errors, []);
  await page.getByTestId("rail-thumb").first().click();
  await page.getByTestId("pro-studio").screenshot({ path: "/tmp/studio-1280.png" });
  await ctx.close();
});

test("A free creator keeps the simple editor and sees what the studio adds", async () => {
  const { page, go, ctx } = await openPage(app, { width: 1280 });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Free survey");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await addChoice(page, "First?", ["A", "B"]);
  assert.equal(await page.getByTestId("pro-studio").count(), 0);
  assert.equal(await page.getByTestId("studio-rail").count(), 0);
  await page.getByTestId("pro-teaser").getByText(/Included with Creator Plus/).waitFor();
  await ctx.close();
});

test("The studio works on a phone: strip of thumbnails, properties in a sheet, no sideways scroll", async () => {
  const { page, go, ctx } = await openPage(app, { width: 390, height: 844, seed: "creator" });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Phone survey");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("pro-studio").waitFor();
  await addChoice(page, "First?", ["A", "B"]);
  await addChoice(page, "Second?", ["C", "D"]);
  assert.ok(await noHorizontalScroll(page));
  await page.getByTestId("open-properties").click();
  await page.getByRole("dialog").getByRole("heading", { name: "Question properties" }).waitFor();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: "/tmp/studio-390.png" });
  await ctx.close();
});
