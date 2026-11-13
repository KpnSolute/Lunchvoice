import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, openPage } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

async function publish(page, go, { title, identified }) {
  await go("/surveys/new");
  await page.getByLabel("Title").fill(title);
  if (identified) await page.getByRole("radio", { name: /^Identified/ }).click();
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Favourite team?");
  await page.getByRole("textbox", { name: "Option 1" }).fill("Reds");
  await page.getByRole("textbox", { name: "Option 2" }).fill("Blues");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await page.getByTestId("publish").click();
  return (await page.getByTestId("share").getByText(/^[A-Z0-9]{6}$/).first().innerText()).trim();
}

async function openResults(page, go, title) {
  await go("/surveys");
  await page.getByText(title).first().click();
  await page.getByRole("link", { name: /Results/ }).first().click();
}

test("Present mode: an identified survey updates live, shows who just answered, keys move and Escape leaves", async () => {
  const { page, go, ctx } = await openPage(app, { width: 1280 });
  const code = await publish(page, go, { title: "Live quiz", identified: true });
  // A second question so the arrow keys have somewhere to go.
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("lv.mock.state"));
    const c = st.campaigns[st.campaigns.length - 1];
    c.access = "link"; // anyone signed in with the link may answer
    c.questions.push({ question_id: "q-extra", position: 2, kind: "yes_no", prompt: "Coming back?", config: {} });
    localStorage.setItem("lv.mock.state", JSON.stringify(st));
  });
  await page.reload();
  await openResults(page, go, "Live quiz");
  await page.getByTestId("present").click();
  const dlg = page.getByTestId("present-dialog");
  await dlg.getByTestId("present-question").getByText("Favourite team?").waitFor();
  await dlg.getByTestId("present-join").getByText(code).first().waitFor();
  await dlg.getByTestId("present-bar").first().waitFor();
  assert.equal(await dlg.getByTestId("present-bar").count(), 2);
  assert.equal(await dlg.getByTestId("present-just").count(), 0, "nobody has answered yet");

  // A second person answers from another tab, under a name they chose; it shows within one poll.
  const saved = await page.evaluate(() => localStorage.getItem("lv.mock.state"));
  const other = await ctx.newPage();
  // The harness clears the mock state for each new tab; hand this tab the survey's saved state once.
  await other.addInitScript((st) => { if (!sessionStorage.getItem("copied")) { localStorage.setItem("lv.mock.state", st); sessionStorage.setItem("copied", "1"); } }, saved);
  await other.goto(`${app.base}/c/${code}`);
  await other.getByTestId("answering-as").waitFor();
  await other.getByTestId("change-name").click();
  await other.getByLabel("Name on your answers").fill("Ana");
  await other.getByRole("button", { name: "Use this name" }).click();
  await other.getByTestId("player-start").click();
  await other.getByRole("radio", { name: /Reds/ }).click();
  await other.getByRole("button", { name: "Next" }).click();
  await other.getByRole("radio", { name: /^Yes/ }).click();
  await other.getByRole("button", { name: "Review" }).click();
  await other.getByRole("button", { name: "Submit" }).click();
  await other.getByTestId("player-thanks").waitFor();
  await dlg.getByTestId("present-count").getByText(/1 answer/).waitFor({ timeout: 9000 });
  await dlg.getByTestId("present-just").getByText(/Ana/).waitFor({ timeout: 9000 });
  await page.screenshot({ path: "/tmp/present1.png" });
  await dlg.getByTestId("present-bar").first().getByText("100%").waitFor();

  // Keys.
  await page.keyboard.press("ArrowRight");
  await dlg.getByTestId("present-question").getByText("Coming back?").waitFor();
  await page.keyboard.press("ArrowLeft");
  await dlg.getByTestId("present-question").getByText("Favourite team?").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByTestId("present-question").count(), 0, "Escape leaves");
  await ctx.close();
});

test("Present mode: an open anonymous survey shows the withheld message, no names and no zero", async () => {
  const { page, go, ctx } = await openPage(app, { width: 390, height: 800 });
  await publish(page, go, { title: "Secret vote", identified: false });
  await openResults(page, go, "Secret vote");
  await page.getByTestId("present").click();
  await page.getByTestId("present-withheld").getByText("Shown when the survey closes").waitFor();
  assert.equal(await page.getByTestId("present-just").count(), 0, "no names on an anonymous survey");
  assert.equal(await page.getByTestId("present-bar").count(), 0, "no bars, so no zeros");
  await page.getByTestId("present-exit").click();
  assert.equal(await page.getByTestId("present-question").count(), 0);
  await ctx.close();
});
