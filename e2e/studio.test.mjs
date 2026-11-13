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

test("Questions: an unsaved new question survives switching sections", async () => {
  const { page, ctx } = await studio();
  await tab(page, "Questions").click();
  const add = page.getByTestId("question-workbench").locator(":visible").getByTestId("add-question");
  if (await add.count()) await add.first().click();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Which trail next month?");
  await page.getByRole("textbox", { name: "Option 1" }).fill("Ridge"); // only one option: not valid, so not saved yet
  await tab(page, "Details").click();
  await tab(page, "Questions").click();
  assert.equal(await page.getByRole("textbox", { name: "Question", exact: true }).inputValue(), "Which trail next month?");
  assert.equal(await page.getByRole("textbox", { name: "Option 1" }).inputValue(), "Ridge");
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
  // 000018: the server stores only valid options, so a one-option question is not saved yet and the editor says so.
  await page.getByText("Changes to this question save once the options are valid.").waitFor();
  await tab(page, "Review").click();
  await page.getByTestId("readiness").getByText("Add at least one question.").waitFor();
  assert.ok(await page.getByTestId("publish").isDisabled());
  await tab(page, "Questions").click();
  // The unsaved new question lived only in the editor, which leaving the tab closed.
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Shirt size?");
  await page.getByRole("textbox", { name: "Option 1" }).fill("M");
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

test("Paused: the title, description and schedule stay editable; mode, anonymity and questions lock at the first answer", async () => {
  const { page, ctx } = await studio();
  await addChoiceQuestion(page);
  await tab(page, "Review").click();
  await page.getByTestId("readiness").getByText("Ready to publish").waitFor();
  await page.getByTestId("publish").click();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Resume" }).waitFor();

  // Paused with no answers yet: everything is editable.
  await tab(page, "Details").click();
  const title = page.locator("#studio-title-input");
  assert.equal(await title.isDisabled(), false, "the title is editable while paused");
  await page.getByText(/Paused: you can edit everything here/).waitFor();
  assert.equal(await page.getByRole("radio", { name: /^Survey/ }).isDisabled(), false, "the mode is editable before any answer");
  await title.fill("Renamed while paused");
  await page.getByTestId("save-state").filter({ hasText: /^Saved/ }).waitFor();
  await tab(page, "Questions").click();
  assert.equal(await page.getByText("Published questions can’t change").count(), 0, "questions are editable before any answer");
  await tab(page, "Audience").click();
  assert.equal(await page.getByRole("radio", { name: /^Anonymous/ }).isDisabled(), false, "anonymity is editable before any answer");
  await tab(page, "Schedule").click();
  assert.equal(await page.getByTestId("schedule").getByRole("radio").first().isDisabled(), false, "the schedule is editable while paused");

  // An answer arrives (injected into the dev mock's state), then the Campaign is looked at again.
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("lv.mock.state"));
    const c = st.campaigns.find((x) => x.campaign_id === "cmp-seed-3");
    c.responses.push({ receipt: "r-injected", answers: {}, at: new Date().toISOString(), guest: false });
    localStorage.setItem("lv.mock.state", JSON.stringify(st));
  });
  await page.reload();
  await page.getByRole("button", { name: "Resume" }).waitFor();
  await tab(page, "Details").click();
  assert.equal(await page.locator("#studio-title-input").isDisabled(), false, "the title is still editable with answers");
  assert.equal(await page.getByRole("radio", { name: /^Survey/ }).isDisabled(), true, "the mode locks once someone has answered");
  await page.getByText(/because people have already answered/).waitFor();
  await tab(page, "Questions").click();
  await page.getByText("Published questions can’t change").waitFor();
  await tab(page, "Audience").click();
  assert.equal(await page.getByRole("radio", { name: /^Anonymous/ }).isDisabled(), true, "anonymity locks once someone has answered");
  await tab(page, "Schedule").click();
  assert.equal(await page.getByTestId("schedule").getByRole("radio").first().isDisabled(), false, "the schedule is still editable with answers");
  await ctx.close();
});

test("Yes/No question: Yes shows a check and No shows a cross (not the menu icon)", async () => {
  const { page, ctx } = await studio();
  await tab(page, "Questions").click();
  const add = page.getByTestId("question-workbench").locator(":visible").getByTestId("add-question");
  if (await add.count()) await add.first().click();
  await page.getByRole("combobox", { name: "Type" }).click();
  await page.getByRole("option", { name: "Yes / No" }).click();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Do you like books");
  const preview = page.getByLabel("Respondent preview");
  const yes = preview.getByRole("radio", { name: "Yes" });
  const no = preview.getByRole("radio", { name: "No" });
  await yes.waitFor();
  const d = (loc) => loc.locator("svg path").first().getAttribute("d");
  assert.equal(await d(yes), "M4 12.5 9 17.5 20 6.5", "Yes is a check mark");
  assert.equal(await d(no), "M6 6l12 12M18 6 6 18", "No is a cross");
  await ctx.close();
});

test("Preview renders the draft without submitting anything", async () => {
  const { page, ctx } = await studio();
  await addChoiceQuestion(page);
  const calls = [];
  await page.exposeFunction("__noteRpc", (fn) => calls.push(fn));
  await page.getByTestId("preview").click();
  const dialog = page.getByRole("dialog");
  // Before starting, the preview shows who is answering: as a guest (sign-in offer) or signed in.
  await dialog.getByRole("button", { name: "Start preview" }).waitFor();
  if (await dialog.getByRole("group", { name: "Preview as" }).count()) {
    await dialog.getByTestId("preview-guest-start").getByText("Have a LunchVoice account?").waitFor();
    await dialog.getByRole("button", { name: "Signed in" }).click();
    assert.equal(await dialog.getByTestId("preview-guest-start").count(), 0, "signed-in preview has no guest step");
  }
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
  // The Review summary's labels and values never overlap (a long value once covered "Who can participate").
  await tab(page, "Review").click();
  const overlaps = await page.locator("dl.lv-kv").first().evaluate((el) => {
    const kids = [...el.children];
    let bad = 0;
    // Compare where the text is actually painted (a Range), not the grid boxes: an overflowing label paints outside
    // its box.
    const textRects = (node) => { const r = document.createRange(); r.selectNodeContents(node); return [...r.getClientRects()]; };
    for (let i = 0; i + 1 < kids.length; i += 2) {
      for (const a of textRects(kids[i])) for (const b of textRects(kids[i + 1])) {
        if (a.top < b.bottom - 1 && b.top < a.bottom - 1 && a.right > b.left + 1 && b.right > a.left + 1) bad++;
      }
    }
    return bad;
  });
  assert.equal(overlaps, 0, "Review summary labels and values do not overlap at 390px");
  await tab(page, "Questions").click();
  assert.ok(!(await page.getByRole("region", { name: "Question outline" }).isVisible()));
  await page.getByRole("button", { name: /^Questions · / }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Add question/ }).waitFor();
  await ctx.close();
});

test("Quick Survey: pause it, edit it, resume it; the questions lock once someone has answered", async () => {
  const { page, go, ctx } = await openPage(app, { width: 1280 });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Pizza night");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Which topping?");
  await page.getByRole("textbox", { name: "Option 1" }).fill("Ham");
  await page.getByRole("textbox", { name: "Option 2" }).fill("Turkey");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await page.getByTestId("publish").click();
  await page.getByTestId("share").getByText("Join code").waitFor();

  // Running: locked, but it can be paused.
  assert.equal(await page.locator("#qs-title-edit").isDisabled(), true, "a running survey cannot be edited");
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Resume" }).waitFor();

  // Paused with no answers: edit the title and a question.
  assert.equal(await page.locator("#qs-title-edit").isDisabled(), false, "the title can be edited while paused");
  await page.getByText(/Paused: nobody can answer while you edit/).waitFor();
  await page.locator("#qs-title-edit").fill("Pizza night (updated)");
  await page.getByTestId("save-state").filter({ hasText: /^Saved/ }).waitFor();
  const prompt = page.getByRole("textbox", { name: "Question", exact: true });
  assert.equal(await prompt.isDisabled(), false, "questions can be edited before any answer");
  await prompt.fill("Which topping do you want?");
  await page.getByTestId("save-state").filter({ hasText: /^Saved/ }).waitFor();

  // Resume, an answer arrives (dev mock state), pause again: the questions are locked, the title is not.
  await page.getByRole("button", { name: "Resume" }).click();
  await page.getByRole("button", { name: "Pause" }).waitFor();
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("lv.mock.state"));
    const c = st.campaigns[st.campaigns.length - 1]; // the survey just created
    c.responses.push({ receipt: "r-injected", answers: {}, at: new Date().toISOString(), guest: false });
    localStorage.setItem("lv.mock.state", JSON.stringify(st));
  });
  await page.reload();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Resume" }).waitFor();
  assert.equal(await page.locator("#qs-title-edit").isDisabled(), false, "the title is still editable with answers");
  await page.getByText(/because people have already answered/).waitFor();
  await page.getByText("Published questions can’t change").waitFor();
  await ctx.close();
});

test("Guest names: an identified survey can ask guests for a name; the creator sees it, labelled unverified; anonymous never can", async () => {
  const { page, go, ctx } = await openPage(app, { width: 1280 });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Trivia night");
  await page.getByRole("radio", { name: /^Identified/ }).click();
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Favourite team?");
  await page.getByRole("textbox", { name: "Option 1" }).fill("Reds");
  await page.getByRole("textbox", { name: "Option 2" }).fill("Blues");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();

  // The creator turns names on. Anonymous is then switched off, so a typed name can never meet an anonymous answer.
  const names = page.getByTestId("guest-names");
  await names.waitFor();
  await names.getByRole("radio", { name: /^Required/ }).click();
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await page.getByText(/Not while guests give a name/).waitFor(); // the screen reloaded with the setting
  assert.equal(await page.getByRole("radio", { name: /^Anonymous/ }).isDisabled(), true, "anonymous is off while guests give a name");

  await page.getByTestId("publish").click();
  const code = (await page.getByTestId("share").getByText(/^[A-Z0-9]{6}$/).first().innerText()).trim();

  // A guest (signed out, in their own browser holding the same mock data) opens the code: the name is required before
  // they can start, and signing in is offered.
  const shared = await page.evaluate(() => localStorage.getItem("lv.mock.state"));
  const guest = await openPage(app, { width: 1280, signedIn: false });
  await guest.ctx.addInitScript((st) => {
    if (!sessionStorage.getItem("copied")) { localStorage.setItem("lv.mock.state", st); sessionStorage.setItem("copied", "1"); }
  }, shared);
  await guest.go(`/c/${code}`);
  const gp = guest.page;
  await gp.getByTestId("guest-name").waitFor();
  await gp.getByTestId("guest-signin").getByRole("link", { name: "Sign in" }).waitFor();
  assert.equal(await gp.getByTestId("player-start").isDisabled(), true, "Start waits for a required name");
  await gp.getByLabel(/Your name/).fill("  Sam  Lee ");
  assert.equal(await gp.getByTestId("player-start").isDisabled(), false);
  await gp.getByTestId("player-start").click();
  await gp.getByRole("radio", { name: /Reds/ }).click();
  await gp.getByRole("button", { name: "Review" }).click();
  await gp.getByRole("button", { name: "Submit" }).click();
  await gp.getByTestId("player-thanks").getByText(/under the name “Sam Lee”/).waitFor();
  const after = await gp.evaluate(() => localStorage.getItem("lv.mock.state"));
  await guest.ctx.close();
  await page.evaluate((st) => localStorage.setItem("lv.mock.state", st), after);

  // Signed in, the same link answers with the account: no name field, no sign-in prompt, "Answering as".
  await go(`/c/${code}`);
  await page.getByTestId("answering-as").getByText("Dana Reyes").waitFor();
  assert.equal(await page.getByTestId("guest-name").count(), 0, "a signed-in person types no guest name");
  assert.equal(await page.getByTestId("guest-signin").count(), 0, "a signed-in person is not asked to sign in");

  // The creator sees the guest by name, labelled unverified, with the answer.
  await go("/surveys");
  await page.getByText("Trivia night").first().click();
  await page.getByRole("link", { name: /Results/ }).first().click();
  const row = page.getByTestId("response-row").first();
  await row.waitFor();
  await row.getByText("Sam Lee").waitFor();
  await row.getByText("Guest, unverified").waitFor();
  await row.getByText("Reds").waitFor();
  assert.deepEqual([], []);
  await ctx.close();
});

test("Guest names: an anonymous survey offers no name and its results show totals only", async () => {
  const { page, go, ctx } = await openPage(app, { width: 1280 });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Secret poll");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await page.getByTestId("guest-names").getByText(/Names are only for identified surveys/).waitFor();
  assert.equal(await page.getByTestId("guest-names").getByRole("radio").count(), 0, "no name choices on an anonymous survey");
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

test("Audit P2/P4/P7: a closed anonymous survey under the minimum says Withheld with the number, never No answers yet", async () => {
  const { page, go, ctx, errors } = await openPage(app, { width: 1280 });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Small group check");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("Which book?");
  await page.getByRole("textbox", { name: "Option 1" }).fill("Dune");
  await page.getByRole("textbox", { name: "Option 2" }).fill("Emma");
  await page.getByTestId("save-state").filter({ hasText: "Draft saved" }).waitFor();
  await page.getByTestId("publish").click();
  await page.getByTestId("share").getByText("Join code").waitFor();
  assert.equal(await page.locator("#publish-blockers").count(), 0, "no stale 'Ready to publish' once published");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByText("Close this survey?").waitFor();
  await dialog.getByText(/at least 5 answers/).waitFor();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("link", { name: "Results" }).first().click();
  await page.getByTestId("question-withheld").getByText(/fewer than 5 answers/).waitFor();
  assert.equal(await page.getByText("No answers yet.").count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});
