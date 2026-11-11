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
  // Everyone signed in can reach support from the account menu (the single public contact channel).
  const contact = p.getByTestId("menu-contact-support");
  assert.match(await contact.getAttribute("href"), /^mailto:admin@lunchvoice\.com\?subject=/, "the menu links the support mailbox");
  // It must look like the other menu entries, not like a browser link (founder screenshot: blue and underlined).
  const look = (loc) => loc.evaluate((el) => { const c = getComputedStyle(el); return { color: c.color, deco: c.textDecorationLine, size: c.fontSize, weight: c.fontWeight }; });
  const mine = await look(contact);
  const neighbour = await look(p.getByRole("menuitem", { name: "Account settings" }));
  assert.equal(mine.deco, "none", "no underline");
  assert.deepEqual(mine, neighbour, "same colour, size and weight as the other menu entries");
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
  assert.match(await p.getByRole("link", { name: "admin@lunchvoice.com" }).first().getAttribute("href"), /^mailto:admin@lunchvoice\.com/, "the appeal notice links the support mailbox");
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

test("staff: the Waitlist tab summarises seats and its Contact column lines up with equal-height rows", async () => {
  const { page: p, go, ctx, errors } = await page({}, STAFF);
  await go("/admin");
  await p.getByTestId("admin-console").waitFor();
  await tab(p, "Waitlist").click();
  await p.getByTestId("waitlist-summary").waitFor();
  assert.match(await p.getByTestId("waitlist-summary").innerText(), /4 of 50 Founding seats taken · 46 open · 2 waiting/);
  const rows = p.locator("tbody tr");
  await rows.first().waitFor();
  const m = await p.evaluate(() => {
    const textLeft = (cell) => {
      const r = document.createRange(); r.selectNodeContents(cell);
      const rect = [...r.getClientRects()].filter((x) => x.width > 0)[0];
      return rect ? rect.left : null;
    };
    const head = [...document.querySelectorAll("thead th")].find((th) => th.textContent.trim() === "Contact");
    return {
      headLeft: textLeft(head),
      cells: [...document.querySelectorAll("tbody tr")].map((tr) => ({ h: tr.getBoundingClientRect().height, left: textLeft(tr.lastElementChild) })),
    };
  });
  const heights = m.cells.map((c) => Math.round(c.h));
  assert.ok(Math.max(...heights) - Math.min(...heights) <= 1, `every row is the same height (${heights.join(", ")})`);
  for (const c of m.cells) assert.ok(c.left !== null && Math.abs(c.left - m.headLeft) <= 2, `contact text starts under its header (${c.left} vs ${m.headLeft})`);
  assert.equal(await noHorizontalScroll(p), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* ------------------------------------------------------------------ reporting people and Hubs (000029) */

test("reports: a person is reported from the Members tab and lands in the staff queue against their account, never naming the reporter", async () => {
  const { page: p, go, ctx, errors } = await page({}, {});
  await go("/northside-running/members");
  const row = p.locator("tbody tr", { hasText: "Priya Nair" }).first();
  await row.getByRole("button", { name: "Report Priya Nair" }).click();
  const dialog = p.getByTestId("report-dialog");
  await dialog.waitFor();
  assert.equal(await p.getByTestId("report-send").isDisabled(), true, "Send waits for a reason");
  await dialog.getByText("Harassment or bullying").click();
  await dialog.getByLabel(/Anything we should know/).fill("Kept messaging me after I asked them to stop.");
  await p.getByTestId("report-send").click();
  await p.getByText(/Report sent to LunchVoice staff/).waitFor();
  await dialog.waitFor({ state: "detached" });

  // Staff see it, attached to the account and the Hub where it happened.
  await p.evaluate(() => localStorage.setItem("lv.mock.admin", "1"));
  await go("/admin");
  await p.getByTestId("admin-console").waitFor();
  await tab(p, "Reports").click();
  const item = p.getByTestId("admin-report-item").filter({ hasText: "Priya Nair" }).first();
  await item.waitFor();
  await item.getByText("Person", { exact: true }).waitFor();
  await item.getByTestId("report-details").getByText(/Kept messaging me/).waitFor();
  assert.equal(await p.getByTestId("admin-reports").getByText(/reporter/i).count(), 1, "the only mention is the privacy footnote");
  await item.getByRole("textbox", { name: "Mark actioned reason" }).fill("Warned them");
  await item.getByRole("button", { name: "Mark actioned" }).click();
  await p.getByText("Marked actioned").waitFor();
  await p.getByRole("radio", { name: "Actioned" }).click();
  await p.getByTestId("admin-report-item").filter({ hasText: "Warned them" }).first().waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("reports: the Support page reports a Hub by address, lists it as sent, and refuses reporting your own Hub", async () => {
  const { page: p, go, ctx, errors } = await page({}, {});
  await go("/me");
  await p.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("lv.mock.state"));
    st.hubs.push({ hub_id: "hub-x", slug: "other-hub", name: "Other Hub", kind: "community", about: "", accent: null, visibility: "public", membership_mode: "open",
      members: [{ membership_id: "mx", account_id: "acc-9", display_name: "Owner X", is_owner: true, status: "accepted", roles: [] }], pages: [] });
    localStorage.setItem("lv.mock.state", JSON.stringify(st));
  });
  await go("/support");
  const center = p.getByTestId("report-center");
  await center.waitFor();
  await center.getByRole("textbox", { name: "Hub address" }).fill("https://lunchvoice.com/Other-Hub/");
  await p.getByTestId("rc-hub-continue").click();
  await p.getByRole("heading", { name: "Report lunchvoice.com/other-hub" }).waitFor();
  await p.getByTestId("report-dialog").getByText("Scam or phishing").click();
  await p.getByTestId("report-send").click();
  await p.getByText(/Report sent to LunchVoice staff/).waitFor();
  const mine = p.getByTestId("my-reports");
  await mine.getByText("Other Hub").waitFor();
  await mine.getByText("With staff").waitFor();

  // Your own Hub cannot be reported.
  await center.getByRole("textbox", { name: "Hub address" }).fill("northside-running");
  await p.getByTestId("rc-hub-continue").click();
  await p.getByTestId("report-dialog").getByText("Spam", { exact: true }).click();
  await p.getByTestId("report-send").click();
  await p.getByText("You can't report your own Hub.").waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("reports: signed out, the Support page asks for sign-in to report a Hub and still shows the contact address", async () => {
  const s = await openPage(app, { width: 390, signedIn: false });
  const { page: p } = s;
  await s.go("/support");
  await p.getByTestId("report-center").waitFor();
  await p.getByText(/Sign in to report a Hub/).waitFor();
  assert.equal(await p.getByRole("link", { name: "admin@lunchvoice.com" }).first().getAttribute("href"), "mailto:admin@lunchvoice.com");
  await p.getByRole("tab", { name: "A person" }).click();
  await p.getByText(/The best place to report a person is where you met them/).waitFor();
  assert.equal(await noHorizontalScroll(p), true);
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});
