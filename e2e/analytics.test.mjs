// Results charts, premium panels and Trends (000044, dev mock).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

const HUB = "/northside-running";
const CLOSED_ANON = `${HUB}/campaigns/cmp-seed-2/results`; // anonymous, closed, 22 answers
const edit = (page, fn, arg) => page.evaluate(([src, a]) => {
  const s = JSON.parse(localStorage.getItem("lv.mock.state"));
  new Function("s", "a", src)(s, a);
  localStorage.setItem("lv.mock.state", JSON.stringify(s));
}, [fn, arg]);

test("results: summary cards, star distribution with average, values on bars, accessible table", async () => {
  const { page, go, errors } = await openPage(app, { seed: "team" });
  await go(CLOSED_ANON);
  await page.getByTestId("summary-cards").waitFor();
  assert.equal(await page.getByTestId("kpi").count(), 3);
  await page.getByTestId("star-distribution").waitFor();
  assert.match(await page.getByTestId("star-average").innerText(), /^\d\.\d\d$/);
  const frames = page.getByTestId("question-chart");
  assert.equal(await frames.count(), 3);
  // every chart has a table for screen readers, hidden until asked for
  assert.equal(await page.getByTestId("chart-table").count(), 3);
  const first = frames.first();
  assert.equal(await first.getByTestId("chart-table").isVisible(), false);
  await first.getByRole("button", { name: "Show data table" }).click();
  assert.equal(await first.getByTestId("chart-table").isVisible(), true);
  await first.getByRole("button", { name: "Show chart" }).click();
  // chart-type switcher
  await frames.nth(1).getByRole("radio", { name: "Columns" }).click();
  assert.equal(await frames.nth(1).getByRole("radio", { name: "Columns" }).getAttribute("aria-checked"), "true");
  assert.deepEqual(errors, []);
});

test("results: a small anonymous group is withheld, never zero", async () => {
  const { page, go } = await openPage(app, { seed: "team" });
  await go("/");
  await edit(page, `const c = s.campaigns.find(x => x.campaign_id === "cmp-seed-2"); c.responses = c.responses.slice(0, 3);`);
  await go(CLOSED_ANON);
  await page.getByTestId("question-chart").first().waitFor();
  assert.ok(await page.getByTestId("chart-withheld").count() >= 1, "the withheld state is shown");
  assert.match(await page.locator("main, body").first().innerText(), /Withheld/);
  assert.equal(await page.getByTestId("star-average").count(), 0, "no average while the group is under the minimum");
});

test("premium: Team Hub shows time, device, source and a cross-tab; Starter Hub is told what unlocks it", async () => {
  const team = await openPage(app, { seed: "team" });
  await team.go(CLOSED_ANON);
  await team.page.getByTestId("premium-results").waitFor();
  assert.ok(await team.page.getByText("Responses over time").count() >= 1);
  assert.ok(await team.page.getByText("Device type").count() >= 1);
  assert.ok(await team.page.getByText("Where people came from").count() >= 1);
  await team.page.getByTestId("crosstab").waitFor();
  assert.deepEqual(team.errors, []);
  const starter = await openPage(app, { seed: "demo" });
  await starter.go(CLOSED_ANON);
  await starter.page.getByTestId("premium-locked").waitFor();
  assert.equal(await starter.page.getByTestId("premium-results").count(), 0);
});

test("results page fits a 375px phone", async () => {
  const { page, go } = await openPage(app, { seed: "team", width: 375, height: 800 });
  await go(CLOSED_ANON);
  await page.getByTestId("premium-results").waitFor();
  assert.equal(await noHorizontalScroll(page), true);
});

test("Trend: runs in time order, repeated questions compared, Ask again makes a draft in the Trend", async () => {
  const { page, go, errors } = await openPage(app, { seed: "demo" });
  await go(`${HUB}/trends`);
  await page.getByTestId("trend-list").getByText("Route check-in").click();
  const runs = page.getByTestId("trend-runs").locator("li");
  await runs.nth(2).waitFor();
  assert.equal(await runs.count(), 3);
  const names = await runs.locator("strong").allInnerTexts();
  assert.deepEqual(names, ["Winter route check-in", "Winter social night", "Spring route check-in"]);
  assert.equal(await page.getByTestId("trend-chart").count(), 3);
  await page.getByTestId("trend-chart").first().getByRole("button", { name: "Show data table" }).click();
  assert.ok(await page.getByTestId("chart-table").first().innerText().then((t) => /Run/.test(t)));
  await page.getByTestId("ask-again").click();
  await page.waitForURL(/campaigns\/.+\/studio/);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("lv.mock.state")));
  assert.equal(state.trends[0].runs.length, 4);
  const copy = state.campaigns.find((c) => c.campaign_id === state.trends[0].runs[3]);
  assert.equal(copy.status, "draft");
  assert.equal(copy.responses.length, 0);
  assert.deepEqual(errors, []);
});

test("Trend: a withheld run is a gap, and an over-limit space stays readable but cannot create", async () => {
  const { page, go } = await openPage(app, { seed: "demo" });
  await go("/");
  await edit(page, `const c = s.campaigns.find(x => x.campaign_id === "cmp-seed-2"); c.responses = c.responses.slice(0, 2);`);
  await go(`${HUB}/trends/trend-seed-1`);
  await page.getByTestId("trend-chart").first().waitFor();
  await page.getByTestId("trend-chart").first().getByRole("button", { name: "Show data table" }).click();
  assert.match(await page.getByTestId("chart-table").first().innerText(), /Withheld/);
  // downgrade: the Hub plan ends, so the limit is 0 while one Trend exists
  await edit(page, `for (const e of s.ents) e.ends_at = new Date(Date.now() - 86400000).toISOString();`);
  await go(`${HUB}/trends`);
  await page.getByTestId("trend-list").getByText("Route check-in").waitFor();
  assert.equal(await page.getByRole("button", { name: "Create Trend" }).count(), 0);
  await go(`${HUB}/trends/trend-seed-1`);
  assert.equal(await page.getByTestId("ask-again").isDisabled(), true);
  assert.equal(await page.getByTestId("trend-chart").count(), 3, "still readable");
});

test("Quick Survey Trends page for a free person asks for a plan", async () => {
  const { page, go } = await openPage(app, { seed: "demo" });
  await go("/trends");
  await page.getByText(/Trends come with a paid plan/).waitFor();
  assert.equal(await page.getByRole("button", { name: "Create Trend" }).count(), 0);
});
