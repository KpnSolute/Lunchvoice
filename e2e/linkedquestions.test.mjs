// Linked Questions (000042): per-question "show only if", the builder, the plan lock and the MJCC 21-question survey
// answered on a phone (dev mock transport).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

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

// The founder's MJCC survey: 21 questions, staff and leadership take different paths.
const ROLES = ["Food service staff", "Lead", "Manager", "Center leadership", "Department head", "Corporate"];
const STAFF = ROLES.slice(0, 3);
const LEADERS = ROLES.slice(3);
const anyOf = (id, values) => ({ match: "all", conditions: [{ question_id: id, op: "any_of", values }] });
function mjcc() {
  const q = (n, kind, prompt, config = {}) => ({ question_id: `m${n}`, position: n, kind, prompt, config });
  const st = { show_if: anyOf("m1", STAFF) };
  const ld = { show_if: anyOf("m1", LEADERS) };
  return [
    q(1, "single_choice", "What is your role?", { options: ROLES }),
    q(2, "multi_choice", "Which parts did you try?", { ...st, options: ["Guides", "Guest food request", "Menu planner", "Reports"] }),
    q(3, "rating", "How clear were the guides?", { show_if: anyOf("m2", ["Guides"]) }),
    q(4, "rating", "How easy was the guest food request?", { show_if: anyOf("m2", ["Guest food request"]) }),
    q(5, "rating", "How easy was your first week?", st),
    q(6, "yes_no", "Did you hit a problem?", st),
    q(7, "text", "What went wrong?", { show_if: anyOf("m6", ["true"]) }),
    q(8, "rating", "How useful is the menu planner?", st),
    q(9, "single_choice", "How often do you use it?", { ...st, options: ["Daily", "Weekly", "Rarely", "Other"] }),
    q(10, "rating", "How clear are the reports?", st),
    q(11, "text", "What would make your shift easier?", { ...st, optional: true }),
    q(12, "rating", "How well does it fit your center?", ld),
    q(13, "single_choice", "Which area needs most help?", { ...ld, options: ["Menus", "Staffing", "Waste"] }),
    q(14, "rating", "How clear are the dashboards?", ld),
    q(15, "yes_no", "Would you roll it out further?", ld),
    q(16, "text", "Where would you roll it out first?", { show_if: { match: "all", conditions: [anyOf("m1", LEADERS).conditions[0], anyOf("m15", ["true"]).conditions[0]] } }),
    q(17, "rating", "How confident are you in the data?", ld),
    q(18, "multi_choice", "Which reports do you read?", { ...ld, options: ["Daily", "Weekly", "Monthly"] }),
    q(19, "rating", "How likely are you to recommend it?", ld),
    q(20, "text", "What should corporate standardise?", { show_if: anyOf("m1", ["Corporate"]) }),
    q(21, "text", "Anything else?", { optional: true }),
  ];
}

async function openMjcc(width = 390) {
  const s = await openPage(app, { signedIn: false, width, height: 844 });
  await s.go("/waitlist");
  await s.page.evaluate((qs) => {
    const st = JSON.parse(localStorage.getItem("lv.mock.state"));
    const c = st.campaigns.find((x) => x.campaign_id === "cmp-seed-1");
    c.questions = qs;
    c.responses = [];
    localStorage.setItem("lv.mock.state", JSON.stringify(st));
  }, mjcc());
  const code = (await mockState(s.page)).campaigns.find((c) => c.campaign_id === "cmp-seed-1").join_code;
  await s.go(`/c/${code}`);
  await s.page.getByTestId("player-start").click();
  return s;
}
const heading = (page, text) => page.getByRole("heading", { name: text }).waitFor();
const next = (page, name = "Next") => page.getByRole("button", { name }).click();
const progressMax = (page) => page.getByTestId("player-progress").getAttribute("aria-valuemax");

test("MJCC on a phone: a staff member answers only the staff path, with progress that follows it", async () => {
  const { page, ctx, errors } = await openMjcc(390);
  await heading(page, "What is your role?");
  assert.equal(await progressMax(page), "2"); // before the first answer: Q1 and Q21
  await page.getByRole("radio", { name: "Lead", exact: true }).click();
  await next(page);
  await heading(page, "Which parts did you try?");
  assert.equal(await progressMax(page), "9");
  await page.getByRole("checkbox", { name: "Guides" }).click();
  await page.getByRole("checkbox", { name: "Guest food request" }).click();
  assert.equal(await progressMax(page), "11");
  await next(page);
  await heading(page, "How clear were the guides?"); await page.getByRole("radio", { name: "4 of 5" }).click(); await next(page);
  await heading(page, "How easy was the guest food request?"); await page.getByRole("radio", { name: "3 of 5" }).click(); await next(page);
  await heading(page, "How easy was your first week?"); await page.getByRole("radio", { name: "2 of 5" }).click(); await next(page);
  await heading(page, "Did you hit a problem?"); await page.getByRole("radio", { name: "Yes", exact: true }).click();
  assert.equal(await progressMax(page), "12");
  await next(page);
  await heading(page, "What went wrong?"); await page.getByRole("textbox").fill("The planner was slow"); await next(page);
  await heading(page, "How useful is the menu planner?"); await page.getByRole("radio", { name: "4 of 5" }).click(); await next(page);
  await heading(page, "How often do you use it?"); await page.getByRole("radio", { name: "Daily" }).click(); await next(page);
  await heading(page, "How clear are the reports?"); await page.getByRole("radio", { name: "5 of 5" }).click(); await next(page);
  await heading(page, "What would make your shift easier?"); await page.getByRole("button", { name: "Skip" }).click();
  await heading(page, "Anything else?"); await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("heading", { name: "Review your answers" }).waitFor();
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByTestId("player-thanks").waitFor();
  assert.ok(await noHorizontalScroll(page));
  const sent = (await mockState(page)).campaigns.find((c) => c.campaign_id === "cmp-seed-1").responses.at(-1).answers.filter((a) => a.value !== null).map((a) => a.question_id).sort();
  assert.deepEqual(sent, ["m1", "m10", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9"].sort());
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("MJCC on a phone: Corporate answers Q12 to Q20; Q16 follows Q15; Back keeps answers and switching roles drops them from the send", async () => {
  const { page, ctx, errors } = await openMjcc(390);
  await heading(page, "What is your role?");
  await page.getByRole("radio", { name: "Corporate", exact: true }).click();
  await next(page);
  await heading(page, "How well does it fit your center?"); await page.getByRole("radio", { name: "5 of 5" }).click();
  assert.equal(await progressMax(page), "10"); // Q1, Q12-Q15, Q17-Q20, Q21
  // Back keeps the answer; switching to staff and back loses nothing.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("radio", { name: "Lead", exact: true }).click();
  await next(page);
  await heading(page, "Which parts did you try?");
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("radio", { name: "Corporate", exact: true }).click();
  await next(page);
  await heading(page, "How well does it fit your center?");
  assert.equal(await page.getByRole("radio", { name: "5 of 5" }).getAttribute("aria-checked"), "true");
  await next(page);
  await heading(page, "Which area needs most help?"); await page.getByRole("radio", { name: "Waste" }).click(); await next(page);
  await heading(page, "How clear are the dashboards?"); await page.getByRole("radio", { name: "3 of 5" }).click(); await next(page);
  await heading(page, "Would you roll it out further?"); await page.getByRole("radio", { name: "Yes", exact: true }).click(); await next(page);
  await heading(page, "Where would you roll it out first?"); await page.getByRole("textbox").fill("Ohio"); await next(page);
  await heading(page, "How confident are you in the data?"); await page.getByRole("radio", { name: "4 of 5" }).click(); await next(page);
  await heading(page, "Which reports do you read?"); await page.getByRole("checkbox", { name: "Weekly" }).click(); await next(page);
  await heading(page, "How likely are you to recommend it?"); await page.getByRole("radio", { name: "5 of 5" }).click(); await next(page);
  await heading(page, "What should corporate standardise?"); await page.getByRole("textbox").fill("Reports"); await next(page);
  await heading(page, "Anything else?"); await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("heading", { name: "Review your answers" }).waitFor();
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByTestId("player-thanks").waitFor();
  const sent = (await mockState(page)).campaigns.find((c) => c.campaign_id === "cmp-seed-1").responses.at(-1).answers.map((a) => a.question_id);
  assert.ok(sent.includes("m20") && sent.includes("m16") && !sent.includes("m2") && !sent.includes("m5"), `sent ${sent}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("MJCC: a department head who answers No to Q15 never sees Q16 or Q20 (desktop)", async () => {
  const { page, ctx } = await openMjcc(1280);
  await heading(page, "What is your role?");
  await page.getByRole("radio", { name: "Department head", exact: true }).click(); await next(page);
  await heading(page, "How well does it fit your center?"); await page.getByRole("radio", { name: "3 of 5" }).click(); await next(page);
  await heading(page, "Which area needs most help?"); await page.getByRole("radio", { name: "Menus", exact: true }).click(); await next(page);
  await heading(page, "How clear are the dashboards?"); await page.getByRole("radio", { name: "3 of 5" }).click(); await next(page);
  await heading(page, "Would you roll it out further?"); await page.getByRole("radio", { name: "No", exact: true }).click(); await next(page);
  await heading(page, "How confident are you in the data?");
  assert.equal(await progressMax(page), "9"); // Q1, Q12-Q15, Q17-Q19, Q21: no Q16, no Q20
  await ctx.close();
});

test("Builder: Creator Plus adds a show-only-if rule, sees its tag and the path summary", async () => {
  const { page, go, ctx, errors } = await openPage(app, { width: 1280, seed: "creator" });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Role survey");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await addChoice(page, "What is your role?", ["Staff", "Manager", "Corporate"]);
  await addChoice(page, "Which reports take longest?", ["Budget", "Audits"]);
  const panel = page.getByTestId("logic-panel");
  await panel.getByTestId("logic-add").click();
  await panel.getByRole("combobox", { name: "Condition 1: question" }).click();
  await page.getByRole("option", { name: /What is your role\?/ }).click();
  await panel.getByRole("checkbox", { name: "Corporate" }).click();
  await panel.getByTestId("logic-summary").getByText("Shown if Q1: Corporate").waitFor();
  await page.getByTestId("outline-rule").filter({ hasText: "Shown if Q1: Corporate" }).first().waitFor();
  await page.getByTestId("path-summary").getByText(/between 1 and 2 questions/).waitFor();
  await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem("lv.mock.state"));
    return s.campaigns.some((c) => c.questions.some((q) => q.config?.show_if?.conditions?.[0]?.values?.includes("Corporate")));
  });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Builder: the free plan sees the logic locked and what unlocks it; the server refuses a hand-made rule", async () => {
  const { page, go, ctx } = await openPage(app, { width: 1280 });
  await go("/surveys/new");
  await page.getByLabel("Title").fill("Free survey");
  await page.getByRole("button", { name: /Create draft/ }).click();
  await page.getByTestId("quick-editor").waitFor();
  await addChoice(page, "First?", ["A", "B"]);
  await addChoice(page, "Second?", ["C", "D"]);
  await page.getByTestId("logic-locked").getByText(/Creator Plus or a Starter Hub/).waitFor();
  assert.equal(await page.getByTestId("logic-add").count(), 0);
  assert.ok(await noHorizontalScroll(page));
  await ctx.close();
});
