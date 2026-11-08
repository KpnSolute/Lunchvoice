// Staff panel UI suite (dev mock, 000023): access control, staff add/revoke with the self and last-staff guards,
// Hub suspension effects, account lookup with reveal, and report actions. Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

async function page(opts = {}, flags = {}) {
  const s = await openPage(app, opts);
  await s.ctx.addInitScript((f) => {
    for (const [k, v] of Object.entries(f)) localStorage.setItem(k, v);
    if (!sessionStorage.getItem("staff-seeded")) { localStorage.removeItem("lv.mock.staff"); localStorage.removeItem("lv.mock.commerce"); sessionStorage.setItem("staff-seeded", "1"); }
  }, flags);
  return s;
}
const STAFF = { "lv.mock.admin": "1" };
const tab = (p, name) => p.getByRole("tab", { name: new RegExp(`^${name}`) });

test("staff: non-staff get the not-found page and no staff entry in the account menu", async () => {
  const { page: p, go, ctx } = await page();
  await go("/me");
  await p.getByRole("button", { name: /Account menu/ }).click();
  await p.getByRole("menuitem", { name: "Account settings" }).waitFor();
  assert.equal(await p.getByTestId("staff-menu-item").count(), 0);
  await p.keyboard.press("Escape");
  await go("/admin");
  await p.getByRole("heading", { name: "This page isn’t here." }).waitFor();
  assert.equal(await p.getByTestId("admin-console").count(), 0);
  await ctx.close();
});

test("staff: the account menu shows a staff badge linking to the panel, with every tab", async () => {
  const { page: p, go, ctx, errors } = await page({}, STAFF);
  await go("/me");
  await p.getByRole("button", { name: /Account menu/ }).click();
  await p.getByTestId("staff-menu-item").click();
  await p.waitForURL(/\/admin$/);
  await p.getByTestId("admin-console").waitFor();
  for (const name of ["Overview", "Reports", "Hubs", "Accounts", "Staff", "Waitlist", "Discover", "Billing", "Email"]) assert.equal(await tab(p, name).count(), 1, name);
  await p.getByTestId("admin-audit").getByText("staff.added").waitFor();
  assert.ok(await noHorizontalScroll(p));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("staff: add by verified email, the unknown-email hint, the self guard, and revoke", async () => {
  const { page: p, go, ctx, errors } = await page({}, STAFF);
  await go("/admin");
  await tab(p, "Staff").click();
  const panel = p.getByTestId("admin-staff");
  await panel.getByTestId("staff-row").nth(1).waitFor();
  assert.equal(await panel.getByTestId("staff-row").count(), 2);
  // Nobody removes themselves: your own row has no Remove button.
  const mine = panel.getByTestId("staff-row").filter({ hasText: "You" });
  assert.equal(await mine.getByRole("button", { name: "Remove" }).count(), 0);
  await panel.getByRole("textbox", { name: /verified email/ }).fill("stranger@example.invalid");
  await panel.getByRole("button", { name: "Add to staff" }).click();
  await p.getByText(/They need to sign in to LunchVoice once first/).waitFor();
  await panel.getByRole("textbox", { name: /verified email/ }).fill("sam@example.invalid");
  await panel.getByRole("button", { name: "Add to staff" }).click();
  await panel.getByTestId("staff-row").filter({ hasText: "Sam Okafor" }).waitFor();
  await panel.getByTestId("staff-row").filter({ hasText: "Sam Okafor" }).getByRole("button", { name: "Remove" }).click();
  await p.getByText("Sam Okafor removed from staff").waitFor();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="staff-row"]').length === 2);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("staff: the last staff member cannot be removed", async () => {
  const { page: p, go, ctx } = await page({}, STAFF);
  await go("/admin");
  await tab(p, "Staff").click();
  const panel = p.getByTestId("admin-staff");
  const other = panel.getByTestId("staff-row").filter({ hasText: "Founder (second account)" });
  await other.getByRole("button", { name: "Remove" }).click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="staff-row"]').length === 1);
  assert.equal(await panel.getByRole("button", { name: "Remove" }).count(), 0, "only you remain, and you cannot remove yourself");
  await ctx.close();
});

test("staff: suspending a Hub shows the Owner the reason and the publishing lock; unsuspend restores it", async () => {
  const { page: p, go, ctx, errors } = await page({}, STAFF);
  await go("/admin");
  await tab(p, "Hubs").click();
  const hubs = p.getByTestId("admin-hubs");
  await hubs.getByRole("textbox", { name: "Hub slug or name" }).fill("northside");
  await hubs.getByRole("button", { name: "Search" }).click();
  const row = hubs.getByTestId("admin-hub-row").first();
  await row.getByText("Active", { exact: true }).waitFor();
  await row.getByRole("textbox", { name: "Suspend Hub reason" }).fill("Impersonation report");
  await row.getByRole("button", { name: "Suspend Hub" }).click();
  await row.getByText("Suspended", { exact: true }).waitFor();
  await go("/northside-running");
  await p.getByText("This Hub is suspended", { exact: true }).waitFor();
  await p.getByText(/Impersonation report/).waitFor();
  await p.getByText(/nothing new can be published/).waitFor();
  await go("/admin");
  await tab(p, "Hubs").click();
  await hubs.getByRole("textbox", { name: "Hub slug or name" }).fill("northside");
  await hubs.getByRole("button", { name: "Search" }).click();
  await hubs.getByRole("button", { name: "Unsuspend" }).click();
  await hubs.getByTestId("admin-hub-row").first().getByText("Active", { exact: true }).waitFor();
  await go("/northside-running");
  await p.getByTestId("hub-stats").waitFor();
  assert.equal(await p.getByText("This Hub is suspended", { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("staff: an account is found by exact email; the email shows only after Reveal; suspension needs a reason", async () => {
  const { page: p, go, ctx } = await page({}, STAFF);
  await go("/admin");
  await tab(p, "Accounts").click();
  const acc = p.getByTestId("admin-accounts");
  await acc.getByRole("textbox", { name: /Verified email/ }).fill("priya@example.invalid");
  await acc.getByRole("button", { name: "Search" }).click();
  const row = acc.getByTestId("admin-account-row").first();
  await row.getByText("Priya Nair").waitFor();
  assert.equal((await row.textContent()).includes("@"), false, "no address before Reveal");
  await row.getByRole("button", { name: "Reveal email" }).click();
  await row.getByText("priya@example.invalid").waitFor();
  assert.equal(await row.getByRole("button", { name: "Suspend account" }).isDisabled(), true);
  await row.getByRole("textbox", { name: "Suspend account reason" }).fill("Spam");
  await row.getByRole("button", { name: "Suspend account" }).click();
  await row.getByText("Suspended", { exact: true }).waitFor();
  await tab(p, "Overview").click();
  await p.getByTestId("admin-audit").getByText("admin.email_revealed").waitFor();
  await ctx.close();
});

test("staff: one reports queue with survey and comment reports; hide, dismiss and type filter", async () => {
  const { page: p, go, ctx, errors } = await page({}, STAFF);
  await go("/admin");
  await tab(p, "Reports").click();
  const q = p.getByTestId("admin-reports");
  await q.getByTestId("admin-report-item").nth(1).waitFor();
  assert.equal(await q.locator('[data-testid="admin-report-item"][data-type="survey"]').count(), 1);
  assert.equal(await q.locator('[data-testid="admin-report-item"][data-type="comment"]').count(), 1);
  assert.equal((await q.textContent()).toLowerCase().includes("reporter:"), false);
  await q.locator('[data-type="comment"]').getByRole("button", { name: "Hide comment" }).click();
  await p.getByText("Comment hidden").waitFor();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="admin-report-item"]').length === 1);
  await q.getByRole("radio", { name: "Comments" }).click();
  await q.getByText("No reports here").waitFor();
  await q.getByRole("radio", { name: "All types" }).click();
  await q.locator('[data-type="survey"]').getByRole("button", { name: "Dismiss" }).click();
  await q.getByText("No reports here").waitFor();
  await q.getByRole("radio", { name: "Actioned" }).click();
  await q.locator('[data-type="comment"]').getByText("Hidden").waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});
