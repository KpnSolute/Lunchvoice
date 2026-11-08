// Track A (000018) UI checks on the dev mock: description, option validation, the new-question save race, Team role
// targeting, Quick Survey access, link-token sharing and sign-in redirect safety (LC-14).
// Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

const DRAFT = "/northside-running/campaigns/cmp-seed-3/studio"; // seeded draft with no questions
const tab = (page, name) => page.getByRole("tab", { name: new RegExp(`^${name}`) });

async function studio(opts = {}) {
  const s = await openPage(app, opts);
  if (opts.family) await s.ctx.addInitScript((f) => localStorage.setItem("lv.mock.family", f), opts.family);
  await s.go(DRAFT);
  await s.page.getByTestId("studio").waitFor();
  return s;
}

test("Details: the description autosaves and survives a reload", async () => {
  const { page, ctx, errors } = await studio();
  const box = page.getByTestId("studio-description");
  await box.fill("Tell us your size by Friday.");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("studio").waitFor();
  assert.equal(await page.getByTestId("studio-description").inputValue(), "Tell us your size by Friday.");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Options: duplicate options are explained and not saved until they differ", async () => {
  const { page, ctx } = await studio();
  await tab(page, "Questions").click();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Shirt size?");
  await page.getByRole("textbox", { name: "Option 1" }).fill("M");
  await page.getByRole("textbox", { name: "Option 2" }).fill(" m ");
  await page.getByTestId("option-problem").filter({ hasText: "Options must all be different." }).waitFor();
  await page.waitForTimeout(900); // past the autosave debounce
  assert.equal(await page.getByTestId("question-outline").locator(":visible").getByText("Shirt size?").count(), 0, "nothing was created");
  await page.getByRole("textbox", { name: "Option 2" }).fill("L");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await page.getByTestId("question-outline").locator(":visible").getByText("Shirt size?").first().waitFor();
  assert.equal(await page.getByTestId("option-problem").count(), 0);
  await ctx.close();
});

test("Save race: edits typed while a new question is being created are kept, and the editor does not jump", async () => {
  const { page, ctx } = await studio();
  await tab(page, "Questions").click();
  const prompt = page.getByRole("textbox", { name: "Question", exact: true });
  await page.getByRole("textbox", { name: "Option 1" }).fill("Tuesday");
  await page.getByRole("textbox", { name: "Option 2" }).fill("Thursday");
  await prompt.fill("Which night");
  // Keep typing straight through the debounce, so the create is in flight while these keystrokes land.
  await page.waitForTimeout(650);
  await prompt.pressSequentially(" works best?", { delay: 25 });
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await page.waitForTimeout(900);
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  assert.equal(await prompt.inputValue(), "Which night works best?", "the editor kept the typed text");
  await page.getByTestId("question-outline").locator(":visible").getByText("Which night works best?").first().waitFor();
  const items = await page.locator('section[aria-label="Question outline"] [data-testid="question-outline"] > li').allTextContents();
  assert.equal(items.length, 1, `exactly one question was created: ${JSON.stringify(items)}`);
  await page.reload({ waitUntil: "networkidle" });
  await tab(page, "Questions").click();
  await page.getByTestId("question-outline").locator(":visible").getByText("Which night works best?").first().waitFor();
  await ctx.close();
});

test("Audience: Specific roles is hidden on Starter", async () => {
  const { page, ctx } = await studio();
  await tab(page, "Audience").click();
  const who = page.getByTestId("audience-who");
  await who.getByText("Choosing members by role comes with the Team plan.").waitFor();
  assert.equal(await who.getByRole("radio", { name: /Specific roles/ }).count(), 0);
  await ctx.close();
});

test("Audience: Team can restrict a Campaign to a role, and Review says so", async () => {
  const { page, ctx, errors } = await studio({ family: "team" });
  await tab(page, "Audience").click();
  const who = page.getByTestId("audience-who");
  await who.getByRole("radio", { name: /Specific roles/ }).click();
  await who.getByText("Pick at least one role.").waitFor();
  await page.getByTestId("audience-roles").getByRole("checkbox", { name: "coach" }).click();
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await tab(page, "Review").click();
  await page.getByTestId("review-summary").getByText("with the role coach").waitFor();
  await tab(page, "Audience").click();
  await page.getByTestId("audience-who").getByRole("radio", { name: /All members/ }).click();
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await tab(page, "Review").click();
  await page.getByTestId("review-summary").getByText("Members of Northside Running Club", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("FB-01: role targeting is only for identified Campaigns, in both directions", async () => {
  const { page, ctx, errors } = await studio({ family: "team" });
  await tab(page, "Audience").click();
  const who = page.getByTestId("audience-who");
  const identity = page.getByTestId("audience-identity");
  // Anonymous: Specific roles cannot be chosen, and says why.
  await identity.getByRole("radio", { name: /^Anonymous/ }).click();
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  const roles = who.getByRole("radio", { name: /Specific roles/ });
  // Wait for the state itself: "Draft saved" may already show before this save, so it is not a reliable signal.
  await who.getByRole("radio", { name: /Specific roles/, disabled: true }).waitFor();
  assert.ok(await roles.isDisabled(), "Specific roles is disabled on an anonymous Campaign");
  await who.getByText("Only for identified Campaigns.", { exact: false }).waitFor();
  // Identified with roles: Anonymous cannot be chosen until the audience is all members again.
  await identity.getByRole("radio", { name: /^Identified/ }).click();
  await who.getByRole("radio", { name: /Specific roles/, disabled: false }).waitFor();
  await roles.click();
  await page.getByTestId("audience-roles").getByRole("checkbox", { name: "coach" }).click();
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await identity.getByRole("radio", { name: /^Anonymous/, disabled: true }).waitFor();
  assert.ok(await identity.getByRole("radio", { name: /^Anonymous/ }).isDisabled(), "Anonymous is disabled while roles are chosen");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Questions: a new question without question text says so, and saves once it has one", async () => {
  const { page, ctx } = await studio();
  await tab(page, "Questions").click();
  const add = page.getByTestId("question-workbench").locator(":visible").getByTestId("add-question");
  if (await add.count()) await add.first().click();
  await page.getByRole("textbox", { name: "Option 1" }).fill("Eat");
  await page.getByRole("textbox", { name: "Option 2" }).fill("Sleep");
  await page.getByText("Type the question text to save this question.").waitFor();
  const prompt = page.getByRole("textbox", { name: "Question", exact: true });
  assert.equal(await prompt.getAttribute("placeholder"), "Type your question");
  assert.equal(await prompt.getAttribute("aria-invalid"), "true");
  await prompt.fill("What should we do after the run?");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await page.getByText(/^Questions · 1$/).first().waitFor();
  await ctx.close();
});

test("Quick Survey: access can change while draft; invite only turns guests off", async () => {
  const { page, go, ctx } = await openPage(app);
  await go("/surveys/qs-seed-3");
  await page.getByTestId("quick-editor").waitFor();
  const access = page.getByTestId("audience-who");
  await access.getByRole("radio", { name: /Invite only/ }).click();
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  const guests = page.getByRole("switch", { name: "Allow guest responses" });
  await page.waitForFunction(() => document.querySelector('[aria-label="Allow guest responses"]')?.hasAttribute("disabled"));
  assert.equal(await guests.getAttribute("aria-checked"), "false");
  await access.getByRole("radio", { name: /Anyone with the link/ }).click();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Allow guest responses"]')?.hasAttribute("disabled"));
  await ctx.close();
});

test("Share: links and QR codes carry the 128-bit link token, not the join code", async () => {
  const { page, go, ctx } = await openPage(app);
  await go("/surveys/qs-seed-1");
  const share = page.getByTestId("share");
  await share.getByText("Join code").waitFor();
  const link = await share.getByRole("textbox").first().inputValue();
  assert.match(link, /\/c\/[0-9a-f]{32}$/);
  // The link opens the survey (same browser: the dev mock keeps its state, and so its tokens, per browser).
  await page.goto(link.replace("https://lunchvoice.com", app.base), { waitUntil: "networkidle" });
  await page.getByText("Book club: next month's pick").first().waitFor();
  await ctx.close();
});

for (const evil of ["/\\evil.example", "//evil.example", "/%2F%2Fevil.example", "https://evil.example", "/\\/evil.example"]) {
  test(`LC-14: sign-in never follows the return path ${JSON.stringify(evil)}`, async () => {
    const { page, go, ctx } = await openPage(app, { signedIn: false });
    await go("/signin");
    // A crafted link puts the return path in history state, which is where /signin reads it.
    await page.evaluate((from) => window.history.replaceState({ usr: { from }, key: "evil", idx: 0 }, "", "/signin"), evil);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Sign in (simulated)" }).click();
    await page.waitForURL((u) => u.pathname === "/me");
    const url = new URL(page.url());
    assert.equal(url.origin, app.base);
    assert.equal(url.pathname, "/me");
    await ctx.close();
  });
}

test("LC-14: a safe return path is still honoured", async () => {
  const { page, go, ctx } = await openPage(app, { signedIn: false });
  await go("/surveys");
  await page.waitForURL((u) => u.pathname === "/signin");
  await page.getByRole("button", { name: "Sign in (simulated)" }).click();
  await page.waitForURL((u) => u.pathname === "/surveys");
  await ctx.close();
});
