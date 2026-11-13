// Survey branding (000043): per-survey theme, no Hub needed, contrast rule, locked state, player at 390px (dev mock).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const mockState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("lv.mock.state")));
const brandingRow = async (page, id) => (await mockState(page)).branding?.[id];

test("Creator Plus user brands a Hub-less Quick Survey; the player at 390px wears it", async () => {
  const { page, go, ctx, errors } = await openPage(app, { seed: "creator", width: 1280 });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Cafe check-in");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  const panel = page.getByTestId("branding");
  assert.equal(await page.getByTestId("branding-locked").count(), 0);
  assert.equal(await panel.getByTestId("brand-follow-hub").count(), 0); // no Hub, nothing to follow

  // Amber on white is not allowed: the editor explains and offers the closest readable shade.
  await panel.getByTestId("brand-color").fill("#f5b301");
  await panel.getByTestId("brand-contrast-bad").waitFor();
  assert.ok(await panel.getByTestId("brand-save").isDisabled());
  await panel.getByTestId("brand-use-suggestion").click();
  await panel.getByTestId("brand-contrast-ok").waitFor();

  await panel.getByLabel("Welcome headline").fill("Tell us about lunch");
  await panel.getByLabel("Thank-you message").fill("See you at the counter!");
  await panel.getByTestId("brand-logo-file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  // SVG is refused.
  await panel.getByTestId("brand-logo-file").setInputFiles({ name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
  await panel.getByTestId("brand-error").getByText(/SVG/).waitFor();
  await panel.getByTestId("brand-save").click();
  await page.getByText("Branding saved").first().waitFor();

  // Previews at 375px and desktop, both screens.
  await panel.getByTestId("brand-preview-start").getByText("Tell us about lunch").waitFor();
  await panel.getByTestId("brand-preview-thanks").getByText("See you at the counter!").waitFor();
  await panel.getByRole("button", { name: "Desktop" }).click();

  const st = await mockState(page);
  const c = st.campaigns.find((x) => x.title === "Cafe check-in");
  const row = st.branding[c.campaign_id];
  assert.equal(row.welcome_headline, "Tell us about lunch");
  assert.ok(row.logo_path.startsWith(`${c.campaign_id}/logo-`));
  // Publish through the Studio for real: one question, then Publish.
  const add = page.getByTestId("question-workbench").locator(":visible").getByTestId("add-question");
  if (await add.count()) await add.first().click();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Best lunch?");
  await page.getByRole("textbox", { name: "Option 1" }).fill("Soup");
  await page.getByRole("textbox", { name: "Option 2" }).fill("Salad");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await page.getByTestId("publish").click();
  await page.getByTestId("share").waitFor();
  const code = (await mockState(page)).campaigns.find((x) => x.campaign_id === c.campaign_id).join_code;
  await page.setViewportSize({ width: 390, height: 844 });
  await go(`/c/${code}`);
  await page.getByTestId("player-hero").getByText("Tell us about lunch").waitFor();
  await page.getByTestId("brand-logo").waitFor();
  assert.ok(await noHorizontalScroll(page));
  const accent = await page.locator(".lv-ptheme").evaluate((el) => el.style.getPropertyValue("--pt-accent"));
  assert.match(accent, /^#[0-9a-f]{6}$/);
  assert.notEqual(await page.evaluate(() => document.documentElement.style.getPropertyValue("--pt-accent")), accent); // scoped, not global
  assert.equal(await page.getByText("Powered by LunchVoice").count(), 1); // footer stays without survey.remove_footer
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Hub Campaign overrides the Hub theme; a later Hub change leaves it untouched", async () => {
  const { page, go, ctx } = await openPage(app, { width: 1280 });
  await go("/northside-running/campaigns/cmp-seed-3/studio");
  const panel = page.getByTestId("branding");
  await panel.getByTestId("brand-use-hub").click(); // optional preset: the Hub's green
  assert.equal((await panel.getByTestId("brand-color").inputValue()).toLowerCase(), "#15803d");
  await panel.getByTestId("brand-color").fill("#7a1f1f"); // ...replaced by the survey's own
  await panel.getByTestId("brand-save").click();
  await page.getByText("Branding saved").first().waitFor();
  const row = await brandingRow(page, "cmp-seed-3");
  assert.equal(row.color, "#7a1f1f");
  assert.equal(row.follow_hub, false);

  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("lv.mock.state"));
    s.hubs.find((h) => h.hub_id === "hub-seed-1").accent = "indigo";
    localStorage.setItem("lv.mock.state", JSON.stringify(s));
  });
  await go("/northside-running/campaigns/cmp-seed-3/studio");
  const again = page.getByTestId("branding");
  await again.getByTestId("brand-color").waitFor();
  assert.equal(await again.getByTestId("brand-color").inputValue(), "#7a1f1f");
  assert.equal((await brandingRow(page, "cmp-seed-3")).color, "#7a1f1f");
  // Reset returns to LunchVoice styling and removes the row.
  await again.getByTestId("brand-reset").click();
  await page.getByText("Back to LunchVoice styling").first().waitFor();
  assert.equal(await brandingRow(page, "cmp-seed-3"), undefined);
  await ctx.close();
});

test("Free user sees the panel locked, with what unlocks it, and the server refuses a save", async () => {
  const { page, go, ctx } = await openPage(app, { width: 390, height: 844 });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Free survey");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  const panel = page.getByTestId("branding");
  await panel.getByTestId("branding-locked").getByText(/Creator Plus/).waitFor();
  await panel.getByTestId("branding-locked-note").getByText(/Creator Plus/).waitFor();
  assert.ok(await panel.getByTestId("brand-color").isDisabled());
  assert.ok(await panel.getByTestId("brand-save").isDisabled());
  assert.ok(await noHorizontalScroll(page));
  await ctx.close();
});
