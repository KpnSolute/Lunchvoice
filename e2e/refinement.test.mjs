// v2 refinement (founder decisions F-15 to F-21): pricing layout (F-16), honest public copy, and live results for
// named surveys only. Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

test("pricing (F-16): three plan cards, then the Hub address reservation, then passes, then the comparison table", async () => {
  const { page, go, ctx, errors } = await openPage(app, { signedIn: false });
  await go("/pricing");
  const cards = page.getByTestId("plan-cards");
  await cards.waitFor();
  assert.deepEqual(await cards.locator("[data-testid^='plan-']").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid"))),
    ["plan-free", "plan-starter", "plan-team"]);
  const top = async (sel) => (await page.locator(sel).first().boundingBox()).y;
  const order = [await top("[data-testid=plan-cards]"), await top("[data-testid=plan-reservation]"), await top("[data-testid=plan-passes]"), await top("#cap-h")];
  assert.deepEqual([...order].sort((a, b) => a - b), order, "cards, reservation, passes, table in that order");
  await page.getByTestId("plan-reservation").getByText(/\$25 per 12 months/).waitFor();
  await page.getByTestId("plan-reservation").getByRole("link", { name: "Reserve an address" }).waitFor();
  for (const id of ["plan-campaign_starter", "plan-campaign_plus"]) await page.getByTestId("plan-passes").getByTestId(id).waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("pricing (F-16): fits a 390px phone", async () => {
  const { page, go, ctx } = await openPage(app, { width: 390, height: 844, signedIn: false });
  await go("/pricing");
  await page.getByTestId("plan-reservation").waitFor();
  assert.equal(await noHorizontalScroll(page), true);
  await ctx.close();
});

test("public copy only claims what exists: no elections, idea boards, cafeteria line or live anonymous results", async () => {
  const { page, go, ctx } = await openPage(app, { signedIn: false });
  for (const path of ["/", "/use-cases", "/how-it-works"]) {
    await go(path);
    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const banned of ["election", "idea board", "line clears", "land by the minute", "answers arrive"]) {
      assert.equal(text.includes(banned), false, `${path} still says "${banned}"`);
    }
  }
  await ctx.close();
});

test("results: an open named survey says it is live; an open anonymous one never does", async () => {
  const { page, go, ctx } = await openPage(app);
  await go("/northside-running/campaigns/cmp-seed-1/results");
  await page.getByTestId("results-live").waitFor();
  await go("/surveys/qs-seed-1/results");
  await page.getByText("Participation", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("results-live").count(), 0, "anonymous results are released only after the survey closes");
  await go("/surveys/qs-seed-2/results");
  await page.getByText("Participation", { exact: true }).waitFor();
  assert.equal(await page.getByTestId("results-live").count(), 0, "a closed survey is not live");
  await ctx.close();
});
