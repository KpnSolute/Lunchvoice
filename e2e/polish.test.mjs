// UX polish pass: owner walkthrough fixes, Hub accent palette (founder bug), poll quick-create, player motion and
// reduced motion. Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

const HUB = "/northside-running";
const mockState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("lv.mock.state")));

/* ------------------------------------------------------------------ Hub accent (founder bug) */

test("Hub colour swatches are painted from the real palette shape and saving sends the palette key", async () => {
  const { page, go, ctx } = await openPage(app);
  await go(`${HUB}/settings`);
  const swatches = page.getByTestId("accent-swatches").locator(".lv-swatch2-dot");
  assert.equal(await swatches.count(), 10, "Ink plus the nine palette colours");
  const bgs = await swatches.evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  for (const bg of bgs) assert.ok(bg !== "rgb(255, 255, 255)" && bg !== "rgba(0, 0, 0, 0)", `swatch painted (${bg})`);
  assert.equal(new Set(bgs).size, 10, "every swatch has its own colour");
  // labels are visible, selection is a check mark and a radio state (not colour alone)
  await page.getByTestId("accent-swatches").getByText("Teal").waitFor();
  const teal = page.getByTestId("swatch-teal");
  await teal.click();
  assert.equal(await teal.getAttribute("aria-checked"), "true");
  await page.getByTestId("accent-state").filter({ hasText: "Unsaved changes" }).waitFor();
  // live preview updates before saving
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="appearance-preview"] .lv-ap-banner')).backgroundColor === "rgb(15, 118, 110)");
  await page.getByTestId("accent-save").click();
  await page.getByTestId("accent-state").filter({ hasText: "Saved" }).waitFor();
  const hub = (await mockState(page)).hubs.find((h) => h.slug === "northside-running");
  assert.equal(hub.accent, "teal", "lv_hub_update receives the palette key, as the SQL requires");
  await go(HUB);
  const strip = await page.locator(".lv-hub-banner").evaluate((e) => getComputedStyle(e).backgroundColor);
  assert.equal(strip, "rgb(15, 118, 110)", "the Hub's own pages use the accent");
  const header = await page.locator("header.lv-header").evaluate((e) => getComputedStyle(e).backgroundColor);
  assert.notEqual(header, "rgb(15, 118, 110)", "LunchVoice chrome never takes the Hub accent");
  await ctx.close();
});

test("Appearance editor and accented Hub fit at 390px", async () => {
  const { page, go, ctx } = await openPage(app, { width: 390, height: 844 });
  await go(`${HUB}/settings`);
  await page.getByTestId("swatch-violet").click();
  assert.ok(await noHorizontalScroll(page));
  await page.getByTestId("appearance-preview").waitFor();
  await ctx.close();
});

/* ------------------------------------------------------------------ owner walkthrough fixes */

test("Members: roles are set from one clear menu, and Remove asks first", async () => {
  const { page, go, ctx } = await openPage(app);
  await go(`${HUB}/members`);
  await page.getByRole("button", { name: "Roles for Priya Nair" }).click();
  await page.getByRole("menuitemcheckbox", { name: "coach" }).click();
  await page.getByText("Priya Nair is now coach").waitFor();
  await page.keyboard.press("Escape");
  const priya = page.getByRole("row", { name: /Priya Nair/ });
  await priya.getByText("coach").first().waitFor();
  await priya.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("alertdialog").getByText("Remove Priya Nair?").waitFor();
  await page.getByRole("button", { name: "Cancel" }).click();
  await priya.waitFor();
  await ctx.close();
});

test("Invites: a revoked fresh code disappears; the invite can be emailed", async () => {
  const { page, go, ctx } = await openPage(app);
  await go(`${HUB}/invites`);
  await page.getByRole("button", { name: /Create invite/ }).click();
  const fresh = page.getByTestId("fresh-invite");
  await fresh.waitFor();
  await page.getByLabel("Email this invite (optional)").fill("sam@example.com");
  await page.getByRole("button", { name: "Send" }).click();
  await fresh.getByText("Sent to sam@example.com").waitFor();
  await page.getByRole("button", { name: "Revoke" }).first().click();
  await page.getByText("The code no longer works").waitFor();
  assert.equal(await fresh.count(), 0, "a revoked code is no longer shown as usable");
  await ctx.close();
});

test("Roles keep the name as typed; delete asks first; permissions can be edited", async () => {
  const { page, go, ctx } = await openPage(app);
  await go(`${HUB}/roles`);
  await page.getByLabel("Name").fill("Event Lead");
  await page.getByRole("checkbox").first().click();
  await page.getByRole("button", { name: "Create role" }).click();
  const row = page.getByRole("row", { name: /Event Lead/ });
  await row.waitFor();
  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("dialog").getByText("Permissions for Event Lead").waitFor();
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByText("Delete the Event Lead role?").waitFor();
  await ctx.close();
});

test("Discover shows requirements, not a 0 / 1 meter; settings show their save state", async () => {
  const { page, go, ctx } = await openPage(app);
  await go(`${HUB}/discover`);
  await page.getByRole("list", { name: "Requirements" }).getByText("Team plan").waitFor();
  assert.equal(await page.getByText("0 / 1").count(), 0);
  await go(`${HUB}/settings`);
  const state = page.getByTestId("settings-save-state");
  await state.filter({ hasText: "No changes" }).waitFor();
  await page.getByLabel("Name").first().fill("Northside Runners");
  await state.filter({ hasText: "Unsaved changes" }).waitFor();
  await page.getByRole("button", { name: "Save settings" }).click();
  await state.filter({ hasText: "All changes saved" }).waitFor();
  await ctx.close();
});

test("A fresh Hub gets a getting-started card and an honest member note", async () => {
  const { page, go, ctx } = await openPage(app, { seed: null });
  await go("/waitlist");
  await page.getByRole("button", { name: "Join the waitlist" }).click();
  await page.getByRole("link", { name: "Create your Hub" }).click();
  await page.getByLabel("Hub name").fill("Harbor Book Circle");
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByText("Available.").waitFor();
  await page.getByRole("button", { name: /Next/ }).click();
  await page.getByRole("button", { name: "Create Hub" }).click();
  await page.waitForURL("**/harbor-book-circle");
  await page.getByTestId("getting-started").getByText("Ask your first question").waitFor();
  await page.getByText("Just you so far").waitFor();
  await ctx.close();
});

/* ------------------------------------------------------------------ poll quick-create */

test("Poll quick-create: one single-choice question with two empty options, question field focused; Review reads as a poll", async () => {
  const { page, go, ctx } = await openPage(app);
  await go(`${HUB}/campaigns/new`);
  await page.getByLabel("Title").fill("Social night");
  await page.getByRole("radio", { name: /^✓?\s*Poll/ }).click();
  await page.getByRole("button", { name: /Create poll/ }).click();
  await page.waitForURL(/section=questions/);
  assert.equal(await page.getByRole("tab", { name: /^Questions/ }).getAttribute("aria-selected"), "true");
  await page.getByRole("combobox", { name: "Type" }).filter({ hasText: "Single choice" }).waitFor();
  const rows = page.getByTestId("option-rows").locator("input");
  assert.equal(await rows.count(), 2);
  assert.deepEqual(await rows.evaluateAll((els) => els.map((e) => e.value)), ["", ""]);
  const focused = await page.evaluate(() => document.activeElement?.id ?? "");
  assert.match(focused, /^prompt-/, "the Question field has focus");
  await page.keyboard.type("Which night?");
  await rows.nth(0).fill("Tuesday");
  await rows.nth(1).fill("Thursday");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await page.getByRole("tab", { name: /^Review/ }).click();
  const summary = page.getByTestId("poll-summary");
  await summary.getByText("Which night?").waitFor();
  await summary.getByText("Tuesday · Thursday").waitFor();
  await ctx.close();
});

test("Rating quick-create starts from the “How was it?” template", async () => {
  const { page, go, ctx } = await openPage(app);
  await go(`${HUB}/campaigns/new`);
  await page.getByLabel("Title").fill("Long run");
  await page.getByRole("radio", { name: /^✓?\s*Rating/ }).click();
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.waitForURL(/section=questions/);
  await page.getByTestId("question-outline").locator(":visible").getByText("How was it?").first().waitFor();
  await ctx.close();
});

/* ------------------------------------------------------------------ respondent player */

async function guestPlayer(opts = {}) {
  const s = await openPage(app, { signedIn: false, ...opts });
  await s.go("/waitlist"); // any public call makes the mock seed itself
  const code = (await mockState(s.page)).campaigns.find((c) => c.campaign_id === "cmp-seed-1").join_code;
  await s.go(`/c/${code}`);
  return s;
}

test("Player: direction-aware question stage, gliding progress, rating word, Enter to advance, burst on thanks", async () => {
  const { page, ctx } = await guestPlayer({ width: 390, height: 844 });
  assert.equal(await page.locator(".lv-promises .lv-enter").count(), 3, "welcome promises enter staggered");
  await page.getByTestId("player-start").click();
  const stage = page.getByTestId("player-stage");
  assert.equal(await stage.getAttribute("data-dir"), "fwd");
  assert.equal(await stage.getAttribute("data-step"), "0");
  await page.getByRole("radio", { name: "5 of 5" }).click();
  await page.getByTestId("rating-word").getByText("Loved it!").waitFor();
  await page.keyboard.press("Enter"); // focus is on the rating: Enter moves on
  await page.waitForFunction(() => document.querySelector('[data-testid="player-stage"]')?.getAttribute("data-step") === "1");
  assert.equal(await page.getByTestId("player-progress").getAttribute("aria-valuenow"), "2");
  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="player-stage"]')?.getAttribute("data-dir") === "back");
  assert.equal(await page.getByTestId("player-stage").getAttribute("data-step"), "0");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: "Thursday" }).click();
  await page.getByRole("radio", { name: "Thursday", checked: true }).and(page.locator('[data-jelly="true"]')).waitFor(); // choosing jellies
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: "Yes" }).click();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit" }).click();
  const thanks = page.getByTestId("player-thanks");
  await thanks.waitFor();
  assert.equal(await thanks.locator(".lv-burst i").count(), 12);
  assert.ok((await page.evaluate(() => document.getAnimations().length)) > 0, "the thank-you animates");
  assert.equal(await thanks.getByText(/%|responses so far|others/i).count(), 0, "a respondent never sees results");
  assert.ok(await noHorizontalScroll(page));
  await ctx.close();
});

test("Reduced motion: player and thank-you change state instantly (no running animations)", async () => {
  const s = await openPage(app, { signedIn: false, width: 390, height: 844 });
  await s.page.emulateMedia({ reducedMotion: "reduce" });
  await s.go("/waitlist");
  const code = (await mockState(s.page)).campaigns.find((c) => c.campaign_id === "cmp-seed-1").join_code;
  await s.go(`/c/${code}`);
  const page = s.page;
  const running = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
  await page.getByTestId("player-start").click();
  assert.equal(await running(), 0, "question stage: no animation");
  await page.getByRole("radio", { name: "4 of 5" }).click();
  assert.equal(await running(), 0, "rating: no animation");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: "Tuesday" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: "No" }).click();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByTestId("player-thanks").waitFor();
  assert.equal(await running(), 0, "thank-you: no animation");
  const offset = await page.locator(".lv-check-path").evaluate((e) => getComputedStyle(e).strokeDashoffset);
  assert.match(offset, /^0(px)?$/, "the check is fully drawn immediately");
  await s.ctx.close();
});

test("Campaign page shows a live response counter without ever showing a withheld count as a number", async () => {
  const { page, go, ctx } = await openPage(app);
  await go(`${HUB}/campaigns/cmp-seed-1`);
  const live = page.getByTestId("live-responses");
  await live.getByText(/signed-in responses?/).waitFor();
  assert.equal(await live.getByText(/^0 /).count(), 0);
  await ctx.close();
});

test("Studio: the Questions panel stays mounted but is hidden on other sections", async () => {
  const { page, go, ctx } = await openPage(app);
  await go(`${HUB}/campaigns/cmp-seed-3/studio`);
  await page.getByRole("tab", { name: /^Review/ }).click();
  assert.equal(await page.getByTestId("question-workbench").isVisible(), false, "workbench hidden on Review");
  await page.getByRole("tab", { name: /^Questions/ }).click();
  assert.equal(await page.getByTestId("question-workbench").isVisible(), true);
  await ctx.close();
});

/* ------------------------------------------------------------------ code inputs on phones (founder bug) */

test("code inputs ask phones for the full keyboard (letters and digits), not the number pad", async () => {
  const s = await openPage(app, { width: 390, signedIn: false });
  const { page } = s;
  await s.go("/");
  const otp = page.locator('input[data-input-otp="true"]').first();
  await otp.waitFor({ state: "attached" });
  // The attribute that decides the on-screen keyboard. input-otp defaults to "numeric", which gave Android a number pad.
  assert.equal(await otp.getAttribute("inputmode"), "text", "join-code boxes use the text keyboard");
  assert.equal(await otp.getAttribute("autocapitalize"), "characters", "the keyboard opens in capitals");
  assert.equal(await otp.getAttribute("autocomplete"), "off");
  await otp.focus();
  await page.keyboard.type("ab12cd");
  assert.equal(await otp.inputValue(), "AB12CD", "letters and digits are accepted and shown in capitals");

  await s.go("/join");
  const field = page.locator("#invite-code");
  assert.notEqual(await field.getAttribute("inputmode"), "numeric", "the /join field is not a number pad");
  assert.equal(await field.getAttribute("autocapitalize"), "characters");
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

/* ------------------------------------------------------------------ embedded player (founder bug) */

test("the thank-you screen inside a Hub page is a contained card, not a full-screen excerpt", async () => {
  for (const [width, height] of [[1100, 900], [390, 844]]) {
    const s = await openPage(app, { width, height });
    const { page } = s;
    await s.go(HUB);
    await page.evaluate(() => {
      const st = JSON.parse(localStorage.getItem("lv.mock.state"));
      for (const c of st.campaigns) if (c.campaign_id === "cmp-seed-1") c.mine_answered = true;
      localStorage.setItem("lv.mock.state", JSON.stringify(st));
    });
    await s.go(`${HUB}/campaigns/cmp-seed-1`);
    await page.getByTestId("player-thanks").waitFor();
    const m = await page.getByTestId("player-thanks").evaluate((el) => {
      const card = el.closest(".lv-player");
      const r = card.getBoundingClientRect();
      const cs = getComputedStyle(card);
      const sibling = document.querySelector(".lv-detail-title")?.getBoundingClientRect();
      return { height: r.height, radius: parseFloat(cs.borderTopLeftRadius), left: r.left, right: r.right, titleLeft: sibling?.left ?? null, vh: innerHeight };
    });
    assert.ok(m.height < m.vh * 0.6, `the card is not screen-tall at ${width}px (${m.height} of ${m.vh})`);
    assert.ok(m.radius >= 16, "it is a rounded card, not a bare slab");
    assert.ok(Math.abs(m.left - m.titleLeft) <= 2, `its left edge lines up with the page content at ${width}px`);
    assert.equal(await page.getByTestId("player-thanks").getByRole("link", { name: "Done" }).isVisible(), false, "no Done button that would leave the Hub");
    assert.equal(await noHorizontalScroll(page), true);
    assert.deepEqual(s.errors, []);
    await s.ctx.close();
  }
});

/* ------------------------------------------------------------------ invitations, as the recipient sees them */

async function seedInvite(page, code = "ABCD-2345") {
  await page.evaluate((c) => {
    const st = JSON.parse(localStorage.getItem("lv.mock.state"));
    const h = st.hubs.find((x) => x.slug === "northside-running");
    h.members = h.members.filter((m) => m.account_id !== "mock-account"); // the recipient is not a member yet
    h.about = "Weekly runs, relaxed pace, all abilities.";
    st.invites.push({ code: c, hub: h.hub_id, invite_id: "inv-test", uses: 0, max_uses: null, revoked: false, created_at: new Date().toISOString() });
    localStorage.setItem("lv.mock.state", JSON.stringify(st));
  }, code);
}

test("Invitation, signed out: an explanation and one sign-in button, never an error", async () => {
  const s = await openPage(app, { width: 390, signedIn: false });
  const { page } = s;
  await s.go("/j/ABCD-2345");
  await page.getByTestId("invite-signed-out").waitFor();
  await page.getByRole("heading", { name: "You’ve been invited to a Hub" }).waitFor();
  await page.getByText("Invite code ABCD-2345").waitFor();
  assert.equal(await page.getByRole("alert").count(), 0, "no error banner for a signed-out recipient");
  assert.equal(await page.getByText(/Try another code/).count(), 0);
  const cta = page.getByRole("link", { name: /Continue to sign in/ });
  assert.equal(await cta.getAttribute("href"), "/signin");
  assert.equal(await noHorizontalScroll(page), true);
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

test("Invitation, signed in: the Hub's name, colour and description, what joining means, then Join", async () => {
  const s = await openPage(app, { width: 1100 });
  const { page } = s;
  await s.go("/me");
  await seedInvite(page);
  await s.go("/j/ABCD-2345");
  await page.getByTestId("invite").waitFor();
  await page.getByRole("heading", { name: "Northside Running Club" }).waitFor();
  await page.getByText("Weekly runs, relaxed pace, all abilities.").waitFor();
  await page.getByText("Its owners can see your display name in the member list.").waitFor();
  assert.ok(await page.locator(".lv-invite-band").count(), "the Hub's colour band is shown");
  await page.getByTestId("invite-join").click();
  await page.waitForURL(/\/northside-running$/);
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

test("Invitation with a bad code: says it can't be used and how to get a new one", async () => {
  const s = await openPage(app, { width: 390 });
  const { page } = s;
  await s.go("/j/ZZZZ-9999");
  await page.getByTestId("invite-invalid").waitFor();
  await page.getByRole("heading", { name: "This invitation can’t be used" }).waitFor();
  await page.getByText(/Ask whoever invited you to send a new one/).waitFor();
  assert.equal(await page.getByRole("link", { name: "Enter a different code" }).getAttribute("href"), "/join");
  assert.equal(await noHorizontalScroll(page), true);
  await s.ctx.close();
});

/* ------------------------------------------------------------------ Hub Console (founder direction 2026-11-11) */

test("Hub Console: sections are a grouped rail on desktop, the editor goes full width, and LunchVoice's pill slider is kept", async () => {
  const s = await openPage(app, { width: 1280 });
  const { page } = s;
  await s.go(HUB);
  const rail = page.getByRole("navigation", { name: "Hub sections" });
  await rail.waitFor();
  for (const heading of ["Hub", "People", "Manage"]) await rail.getByText(heading, { exact: true }).waitFor();
  for (const name of ["Overview", "Campaigns", "Analytics", "Members", "Invites", "Roles", "Settings", "Builder", "Billing"]) {
    assert.equal(await rail.getByRole("link", { name }).count(), 1, name);
  }
  assert.equal(await rail.getByRole("link", { name: "Overview" }).getAttribute("aria-current"), "page");
  // The shell is a rail beside the content, not a row of pills above it.
  const box = await rail.boundingBox();
  assert.ok(box.width < 260 && box.x < 400, "the rail sits on the left");

  // Buttons are rectangular in a Hub, the Hub's own colour is used, and no LunchVoice orange glow is left on them.
  await s.go(`${HUB}/campaigns`);
  const cta = page.getByRole("link", { name: /New Campaign/ }).or(page.getByRole("button", { name: /New Campaign/ })).first();
  await cta.waitFor();
  const look = await cta.evaluate((el) => { const c = getComputedStyle(el); return { radius: parseFloat(c.borderTopLeftRadius), shadow: c.boxShadow }; });
  assert.ok(look.radius <= 12, `Hub buttons are rectangular (radius ${look.radius})`);
  assert.equal(look.shadow, "none", "no glow on Hub buttons");
  // The filter slider keeps LunchVoice's pill shape.
  const pill = await page.getByRole("radiogroup", { name: /filter|campaign/i }).first().evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius)).catch(() => 999);
  assert.ok(pill >= 20, `the slider stays a pill (radius ${pill})`);

  // The editor takes the full width: no rail.
  await s.go(`${HUB}/campaigns/cmp-seed-3/studio`);
  await page.getByTestId("studio").waitFor();
  assert.equal(await page.getByRole("navigation", { name: "Hub sections" }).count(), 0, "no rail in the editor");
  await page.setViewportSize({ width: 390, height: 800 });
  await s.go(HUB);
  assert.equal(await noHorizontalScroll(page), true);
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});
