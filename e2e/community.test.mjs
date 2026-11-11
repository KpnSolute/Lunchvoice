// Track C: community surface and Discover (dev mock, which follows supabase/migrations/000020_v2_community.sql).
// Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

const HUB = "/northside-running";

/** The Owner turns the add-on pages on in the Builder (they start off). */
async function enableAddons(s, kinds = ["Newsroom", "Comments", "Leaderboard", "Shop"]) {
  await s.go(`${HUB}/builder`);
  await s.page.getByTestId("builder-pages").waitFor();
  for (const k of kinds) await s.page.getByRole("switch", { name: `${k} page` }).click();
  await s.page.getByRole("button", { name: "Save pages" }).click();
  await s.page.getByText("Pages saved").first().waitFor();
}

test("Builder: add-on pages switch on for real and a custom page carries safe content", async () => {
  const s = await openPage(app);
  await enableAddons(s);
  const { page } = s;
  await page.getByLabel("New custom page").fill("Route maps");
  await page.getByRole("button", { name: "Add page" }).click();
  await page.getByLabel("Page content").fill("# Our routes\n- [River loop](https://example.org/river)\n<script>alert(1)</script>");
  await page.getByTestId("page-editor").getByRole("radio", { name: "Anyone" }).click();
  await page.getByRole("button", { name: "Save pages" }).click();
  await page.getByText("Pages saved").first().waitFor();
  assert.equal(await page.getByText("Coming with M2").count(), 0, "no placeholder copy remains");

  await page.getByTestId("hub-pages-nav").getByRole("link", { name: "Route maps" }).click();
  await page.getByTestId("custom-page").waitFor();
  await page.getByRole("heading", { name: "Our routes" }).waitFor();
  const link = page.getByTestId("custom-page").getByRole("link", { name: "River loop" });
  assert.equal(await link.getAttribute("href"), "https://example.org/river");
  assert.equal(await page.locator("[data-testid=custom-page] script").count(), 0, "HTML is never rendered");
  await page.getByText("<script>alert(1)</script>").waitFor();
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

test("Newsroom: an Owner posts, publishes and pins; members read the post page", async () => {
  const s = await openPage(app);
  await enableAddons(s, ["Newsroom", "Comments"]);
  const { page } = s;
  await s.go(`${HUB}/news`);
  await page.getByTestId("newsroom").waitFor();
  const composer = page.getByTestId("news-composer");
  await composer.getByLabel("Title").fill("Saturday social moved");
  await composer.getByLabel("Post").fill("We moved it to **Saturday** because you asked.");
  await composer.getByRole("button", { name: "Save draft" }).click();
  const draft = page.getByTestId("news-post").filter({ hasText: "Saturday social moved" });
  await draft.getByText("Draft").waitFor();
  await draft.getByRole("button", { name: "Publish" }).click();
  const pub = page.getByTestId("news-post").filter({ hasText: "Saturday social moved" });
  await pub.getByRole("button", { name: "Unpublish" }).waitFor();
  await pub.getByRole("button", { name: "Pin", exact: true }).click();
  await pub.getByText("Pinned").waitFor();
  await page.getByTestId("news-post").filter({ hasText: "Saturday social moved" }).getByRole("link", { name: "Saturday social moved" }).click();
  await page.getByTestId("news-post-page").waitFor();
  await page.locator("[data-testid=news-post-page] strong", { hasText: "Saturday" }).waitFor();
  await page.getByTestId("comments").waitFor();
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

test("Comments: post, report, hide and delete (moderation)", async () => {
  const s = await openPage(app);
  await enableAddons(s, ["Newsroom", "Comments"]);
  const { page } = s;
  await s.go(`${HUB}/news/post-seed-1`);
  const thread = page.getByTestId("comments");
  await thread.waitFor();
  const priya = thread.getByTestId("comment").filter({ hasText: "Much better for my knees" });
  await priya.getByRole("button", { name: "Report comment" }).click();
  await page.getByLabel("What is wrong?").fill("Off topic");
  await page.getByRole("button", { name: "Send report" }).click();
  await priya.getByText("You reported this").waitFor();
  await priya.getByText("1 report").waitFor();
  await priya.getByRole("button", { name: "Hide" }).click();
  await priya.getByText("Hidden").waitFor();

  await thread.getByLabel("Add a comment").fill("See you at the boathouse");
  await thread.getByRole("button", { name: "Post comment" }).click();
  const mine = thread.getByTestId("comment").filter({ hasText: "See you at the boathouse" });
  await mine.waitFor();
  assert.equal(await mine.getByRole("button", { name: "Report comment" }).count(), 0, "nobody reports their own comment");
  await mine.getByRole("button", { name: "Delete" }).click();
  await mine.waitFor({ state: "detached" });
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

test("Leaderboard: opt-in only, never answers", async () => {
  const s = await openPage(app);
  await enableAddons(s, ["Leaderboard"]);
  const { page } = s;
  await s.go(`${HUB}/leaderboard`);
  await page.getByTestId("leaderboard").waitFor();
  const sw = page.getByRole("switch", { name: "Show me on the leaderboard" });
  assert.equal(await sw.getAttribute("aria-checked"), "false", "off by default");
  assert.equal(await page.getByText("You", { exact: true }).count(), 0);
  await sw.click();
  await page.getByRole("row").filter({ hasText: "You" }).waitFor();
  await page.getByRole("cell", { name: "Sam Okafor" }).waitFor();
  assert.equal(await page.getByText("Leo Brandt").count(), 0, "members who did not opt in never appear");
  await sw.click();
  await page.getByRole("row").filter({ hasText: "You" }).waitFor({ state: "detached" });
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

test("Shop: order with points, cancel refunds, the Hub fulfils", async () => {
  const s = await openPage(app);
  await enableAddons(s, ["Shop"]);
  const { page } = s;
  await s.go(`${HUB}/shop`);
  await page.getByTestId("shop").waitFor();
  const balance = page.getByTestId("points-balance");
  assert.equal(await balance.textContent(), "40");
  const socks = page.getByTestId("shop-item").filter({ hasText: "Club socks" });
  await socks.getByRole("button", { name: "Order" }).click();
  await page.getByRole("button", { name: "Confirm order" }).click();
  await page.getByTestId("points-balance").filter({ hasText: "10" }).waitFor();
  assert.equal(await page.getByTestId("shop-item").filter({ hasText: "Water bottle" }).getByRole("button").isDisabled(), true, "not enough points");
  const manager = page.getByTestId("shop-manager");
  const order = manager.getByTestId("shop-order").filter({ hasText: "Club socks" });
  await order.getByRole("button", { name: "Fulfil" }).click();
  await order.getByText("fulfilled").waitFor();
  await page.getByTestId("my-orders").getByText("fulfilled").waitFor();

  await manager.getByLabel("Item").fill("Head torch");
  await manager.getByLabel("Price (points)").fill("5");
  await manager.getByRole("button", { name: "Add item" }).click();
  const torch = page.getByTestId("shop-item").filter({ hasText: "Head torch" });
  await torch.getByRole("button", { name: "Order" }).click();
  await page.getByRole("button", { name: "Confirm order" }).click();
  await page.getByTestId("points-balance").filter({ hasText: /^5$/ }).waitFor();
  await page.getByTestId("my-orders").getByRole("button", { name: "Cancel" }).click();
  await page.getByTestId("points-balance").filter({ hasText: "10" }).waitFor();
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

test("Visitors: public custom pages and public news only; Shop is for members", async () => {
  const v = await openPage(app, { signedIn: false });
  await v.go(HUB);
  // Dev helper: the Owner has turned every add-on on and added one public and one members-only custom page.
  await v.page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("lv.mock.state"));
    const h = st.hubs.find((x) => x.hub_id === "hub-seed-1");
    for (const p of h.pages) p.enabled = true;
    h.pages.push({ key: "routes", kind: "custom", title: "Route maps", body: "Open to all", position: 9, enabled: true, visibility: "public" },
                 { key: "kit", kind: "custom", title: "Kit list", body: "Members only", position: 10, enabled: true, visibility: "members" });
    localStorage.setItem("lv.mock.state", JSON.stringify(st));
  });
  await v.go(HUB);
  const nav = v.page.getByTestId("hub-pages-nav");
  await nav.waitFor();
  assert.equal(await nav.getByRole("link", { name: "Route maps" }).count(), 1, "a public custom page is visible");
  assert.equal(await nav.getByRole("link", { name: "Kit list" }).count(), 0, "a members-only page never reaches visitors");
  assert.equal(await nav.getByRole("link", { name: "Newsroom" }).count(), 1, "public news is visible");
  for (const name of ["Shop", "Leaderboard", "Comments"]) assert.equal(await nav.getByRole("link", { name }).count(), 0, `${name} is never shown to visitors`);
  await v.go(`${HUB}/news`);
  await v.page.getByText("New Sunday route").waitFor();
  assert.equal(await v.page.getByText("Kit order closes Friday").count(), 0, "members-only posts stay hidden");
  await v.go(`${HUB}/p/kit`);
  await v.page.getByText("We can’t find that.").waitFor();
  await v.go(`${HUB}/shop`);
  await v.page.getByText(/Sign in to see the Shop/).waitFor();
  assert.deepEqual(v.errors, []);
  await v.ctx.close();
});

test("Discover: empty until approved; personal spaces never listed; search and category", async () => {
  const s = await openPage(app);
  const { page } = s;
  await s.go("/discover");
  await page.getByText("No Hubs are listed yet").waitFor();
  assert.equal(await page.getByText("Book club").count(), 0, "Quick Surveys never appear");

  // Dev helper: the platform admin approves (track B) and the Hub is on Team. Starter Hubs are never listed.
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("lv.mock.state"));
    st.community.approved.push("hub-seed-1", "space-seed");
    localStorage.setItem("lv.mock.state", JSON.stringify(st));
  });
  await s.go("/discover");
  await page.getByText("No Hubs are listed yet").waitFor();
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("lv.mock.state"));
    st.ents.find((e) => e.hub_id === "hub-seed-1").family = "team";
    localStorage.setItem("lv.mock.state", JSON.stringify(st));
  });
  await s.go("/discover");
  const card = page.getByTestId("discover-hub");
  await card.filter({ hasText: "Northside Running Club" }).waitFor();
  assert.equal(await card.count(), 1, "only the approved community Hub, never the personal space");
  await card.getByText("Sports and fitness").waitFor();
  await page.getByLabel("Search Hubs").fill("chess");
  await page.getByText("No Hubs match").waitFor();
  await page.getByLabel("Search Hubs").fill("north");
  await card.first().waitFor();
  assert.ok(await noHorizontalScroll(page));
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

test("Community pages fit a phone in dark mode with no console errors", async () => {
  const s = await openPage(app, { width: 390, height: 844, theme: "dark" });
  await enableAddons(s);
  for (const path of ["/news", "/news/post-seed-1", "/comments", "/leaderboard", "/shop"]) {
    await s.go(HUB + path);
    await s.page.getByTestId("hub-pages-nav").waitFor();
    assert.ok(await noHorizontalScroll(s.page), `no horizontal scroll on ${path}`);
  }
  await s.go("/discover");
  assert.ok(await noHorizontalScroll(s.page));
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});
