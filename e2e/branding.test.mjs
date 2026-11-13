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
  // Branding is its own full-width step on every plan, the studio included.
  const panel = page.getByTestId("branding");
  assert.equal(await page.getByTestId("branding-locked").count(), 0);
  assert.equal(await panel.getByTestId("brand-follow-hub").count(), 0); // no Hub, nothing to follow

  // Amber on white is not allowed: the editor explains and offers the closest readable shade.
  await panel.getByTestId("brand-swatch-primary").click();
  const picker = page.getByTestId("brand-picker");
  await picker.getByTestId("brand-hex").fill("#f5b301");
  await picker.getByTestId("brand-picker-contrast").getByText(/Too light/).waitFor();
  await picker.getByTestId("brand-picker-fix").click();
  await picker.getByTestId("brand-picker-contrast").getByText(/Readable/).waitFor();
  await page.keyboard.press("Escape");
  await panel.getByTestId("brand-contrast-ok").waitFor();

  // Gradient: a second color (accent), a direction, a pattern banner, a glow.
  await panel.getByTestId("brand-look-gradient").click();
  await panel.getByTestId("brand-swatch-accent").click();
  await page.getByTestId("brand-preset-#be123c").click(); // mouse: a curated preset
  await page.keyboard.press("Escape");
  await panel.getByTestId("brand-angle-vertical").click();
  await panel.getByTestId("brand-banner-pattern").click();
  await panel.getByTestId("brand-glow").click();
  await panel.getByTestId("brand-logo-shadow").click();
  await panel.getByTestId("brand-progress").click();
  // A too-light accent blocks saving until it is fixed.
  await panel.getByTestId("brand-swatch-accent").click();
  await page.getByTestId("brand-hex").fill("#fbbf24");
  await page.keyboard.press("Escape");
  await panel.getByTestId("brand-contrast-bad").getByText(/Accent is too light/).waitFor();
  assert.ok(await panel.getByTestId("brand-save").isDisabled());
  await panel.getByTestId("brand-use-suggestion").click();
  await panel.getByTestId("brand-contrast-ok").first().waitFor();

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
  assert.equal(row.style, "gradient");
  assert.equal(row.gradient_angle, 180);
  assert.equal(row.banner_style, "pattern");
  assert.equal(row.cosmetics.glow, true);
  assert.equal(row.cosmetics.logo_shadow, true);
  assert.match(row.color2, /^#[0-9a-f]{6}$/);
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
  // The logo is shown as it is: no tile, background, border or padding; the drop-shadow exists only because the creator switched it on.
  const logoStyle = await page.getByTestId("brand-logo").first().evaluate((el) => { const c = getComputedStyle(el); return [c.backgroundColor, c.paddingTop, c.borderTopWidth, c.boxShadow, c.filter]; });
  assert.deepEqual(logoStyle.slice(0, 4), ["rgba(0, 0, 0, 0)", "0px", "0px", "none"]);
  assert.match(logoStyle[4], /drop-shadow/); // this test turned the optional shadow on
  assert.ok(await noHorizontalScroll(page));
  const accent = await page.locator(".lv-ptheme").evaluate((el) => el.style.getPropertyValue("--pt-accent"));
  assert.match(accent, /^#[0-9a-f]{6}$/);
  const root = page.locator(".lv-ptheme");
  assert.match(await root.evaluate((el) => el.style.getPropertyValue("--pt-hero")), /^linear-gradient\(180deg/);
  assert.equal(await root.getAttribute("data-pt-glow"), "on");
  assert.equal(await root.getAttribute("data-pt-pattern"), "dots");
  assert.match(await page.getByTestId("player-hero").evaluate((el) => getComputedStyle(el).backgroundImage), /gradient/);
  await page.getByTestId("player-start").click(); // the theme follows onto the question screens
  await page.getByText("Best lunch?").first().waitFor();
  assert.equal(await page.locator(".lv-ptheme").count(), 1);
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
  assert.match(await panel.getByTestId("brand-swatch-primary").getAttribute("aria-label"), /#15803d/i);
  await panel.getByTestId("brand-swatch-primary").click();
  await page.getByTestId("brand-hex").fill("#7a1f1f"); // ...replaced by the survey's own
  await page.keyboard.press("Escape");
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
  await again.getByTestId("brand-swatch-primary").waitFor();
  assert.match(await again.getByTestId("brand-swatch-primary").getAttribute("aria-label"), /#7a1f1f/);
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
  assert.ok(await panel.getByTestId("brand-swatch-primary").isDisabled());
  assert.ok(await panel.getByTestId("brand-save").isDisabled());
  assert.ok(await noHorizontalScroll(page));
  await ctx.close();
});

test("Color picker by keyboard: swatch opens it, area and hue respond to arrows, Escape returns focus", async () => {
  const { page, go, ctx } = await openPage(app, { seed: "creator", width: 1280 });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Keyboard colors");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  const swatch = page.getByTestId("brand-swatch-primary");
  await swatch.focus();
  await page.keyboard.press("Enter");
  const sv = page.getByTestId("brand-sv");
  await sv.waitFor();
  await sv.focus();
  const before = await sv.getAttribute("aria-valuenow");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  assert.notEqual(await sv.getAttribute("aria-valuenow"), before);
  assert.match(await sv.getAttribute("aria-valuetext"), /Saturation \d+ percent, brightness \d+ percent/);
  const hue = page.getByTestId("brand-hue");
  const h0 = await hue.inputValue();
  await hue.focus();
  await page.keyboard.press("ArrowRight");
  assert.notEqual(await hue.inputValue(), h0);
  for (const label of [/saturation and brightness/, /hue/, /hex color/]) await page.getByLabel(label).first().waitFor();
  await page.keyboard.press("Escape");
  await sv.waitFor({ state: "detached" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "brand-swatch-primary");
  // A color picked in the picker is remembered as a recent color, in this browser only.
  await swatch.click();
  await page.getByTestId("brand-preset-#15803d").click();
  await page.keyboard.press("Escape");
  await swatch.click();
  await page.getByTestId("brand-recent-#15803d").waitFor();
  await ctx.close();
});

test("Color picker on a phone is a bottom sheet", async () => {
  const { page, go, ctx } = await openPage(app, { seed: "creator", width: 390, height: 844 });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Phone colors");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await page.getByTestId("brand-swatch-primary").click();
  await page.getByRole("dialog").getByTestId("brand-picker").waitFor();
  const box = await page.getByRole("dialog").boundingBox();
  assert.ok(box.y + box.height >= 843, "anchored to the bottom");
  assert.ok(box.width <= 390);
  await page.getByRole("button", { name: "Done" }).click();
  assert.ok(await noHorizontalScroll(page));
  await ctx.close();
});
