// Track D: the API tab, webhooks, Discord settings, /connect/discord and /developers (dev mock, which follows
// supabase/migrations/000024_v2_api_discord.sql). Run with: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

const HUB = "/northside-running";

test("API tab on a Starter Hub explains the Team plan and keeps creation off", async () => {
  const s = await openPage(app);
  await s.go(`${HUB}/settings?tab=api`);
  await s.page.getByTestId("api-tab").waitFor();
  await s.page.getByText("The LunchVoice API is part of the Team plan").waitFor();
  await s.page.getByLabel("Key name").fill("Results sync");
  assert.equal(await s.page.getByRole("button", { name: "Create key" }).isDisabled(), true);
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

test("API tab on a Team Hub: create shows the secret once, the list shows the prefix, revoke asks first", async () => {
  const s = await openPage(app, { seed: "team" });
  const { page } = s;
  await s.go(`${HUB}/settings`);
  await page.getByRole("tab", { name: "API" }).click();
  await page.getByTestId("api-tab").waitFor();
  await page.getByLabel("Key name").fill("Results sync");
  await page.getByLabel(/campaigns:write/).click();
  await page.getByRole("button", { name: "Create key" }).click();
  const dialog = page.getByTestId("secret-once");
  await dialog.waitFor();
  const secret = await dialog.getByRole("textbox").inputValue();
  assert.match(secret, /^lvk_[0-9a-f]{12}_[0-9a-f]{48}$/);
  await dialog.getByRole("button", { name: "I have copied it" }).click();
  await dialog.waitFor({ state: "hidden" });

  const prefix = await page.getByTestId("key-prefix").first().textContent();
  assert.ok(prefix?.startsWith(secret.slice(0, 16)), "the prefix is shown");
  assert.equal(await page.getByText(secret).count(), 0, "the secret is never shown again");
  assert.ok((await page.getByTestId("api-tab").textContent())?.includes("Last used: Never"));

  await page.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Revoke key" }).click();
  await page.getByText("Revoked").first().waitFor();

  // Webhooks: an http URL is refused in place; an https one returns a signing secret once.
  await page.getByLabel("Endpoint URL").fill("http://hooks.northside-running.org/lv");
  assert.equal(await page.getByRole("button", { name: "Add endpoint" }).isDisabled(), true);
  await page.getByLabel("Endpoint URL").fill("https://hooks.northside-running.org/lv");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  const wh = page.getByTestId("secret-once");
  await wh.waitFor();
  assert.match(await wh.getByRole("textbox").inputValue(), /^lvwh_[0-9a-f]{48}$/);
  await wh.getByRole("button", { name: "I have copied it" }).click();
  await page.getByText("https://hooks.northside-running.org/lv").waitFor();
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

test("/connect/discord: sign-in first, then consent, then the link shows in Account settings and can be unlinked", async () => {
  const out = await openPage(app, { signedIn: false });
  await out.go("/connect/discord?c=AB12CD34EF56AB12CD34");
  await out.page.getByRole("link", { name: "Sign in to continue" }).waitFor();
  await out.ctx.close();

  const s = await openPage(app);
  const { page } = s;
  await s.go("/connect/discord?c=AB12CD34EF56AB12CD34");
  await page.getByTestId("connect-discord").waitFor();
  await page.getByText("@runner_dana").waitFor();
  assert.equal(await page.getByRole("button", { name: "Link Discord" }).isDisabled(), true, "consent comes first");
  await page.getByLabel("I understand and want to link this account").click();
  await page.getByRole("button", { name: "Link Discord" }).click();
  await page.getByText("Discord linked").waitFor();

  await s.go("/connect/discord?c=AB12CD34EF56AB12CD34");
  await page.getByText(/expired or was already used/).waitFor();

  await s.go("/settings");
  const card = page.getByTestId("account-discord");
  await card.getByText("@runner_dana").waitFor();
  await card.getByRole("button", { name: "Unlink Discord" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Unlink" }).click();
  await card.getByText("Not linked").waitFor();
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

test("/connect/discord: each consent checkbox sits on the same line as its text (no stray box) at desktop and phone width", async () => {
  for (const width of [1100, 390]) {
    const s = await openPage(app, { width });
    const { page } = s;
    await s.go("/connect/discord?c=AB12CD34EF56AB12CD34");
    await page.getByTestId("connect-discord").waitFor();
    for (const id of ["dc-agree", "dc-roles"]) {
      const m = await page.evaluate((id) => {
        const box = document.getElementById(id).getBoundingClientRect();
        const label = document.querySelector(`label[for=${id}]`);
        const r = document.createRange();
        r.selectNodeContents(label);
        const rects = [...r.getClientRects()].filter((x) => x.width > 0 && x.height > 0 && x.left >= box.right - 1);
        const first = rects.sort((p, q) => p.top - q.top)[0];
        return { boxTop: box.top, boxBottom: box.bottom, boxRight: box.right, textLeft: first?.left ?? null, textTop: first?.top ?? null };
      }, id);
      assert.ok(m.textLeft !== null, `${id}: label text sits to the right of the box at ${width}px`);
      assert.ok(m.textTop < m.boxBottom, `${id}: the text starts level with the box, not underneath it, at ${width}px`);
    }
    assert.equal(await noHorizontalScroll(page), true, `no horizontal scroll at ${width}px`);
    assert.deepEqual(s.errors, []);
    await s.ctx.close();
  }
});

test("/connect/discord confirms a server connection, which then shows in the Discord tab", async () => {
  const s = await openPage(app);
  const { page } = s;
  await s.go("/connect/discord?c=C0FFEE0000000000000A");
  await page.getByText("Connect a Discord server").waitFor();
  await page.getByRole("button", { name: "Connect server" }).click();
  await page.getByText("Server connected").waitFor();
  await s.go(`${HUB}/settings?tab=discord`);
  await page.getByTestId("discord-tab").getByText("Northside Discord").waitFor();
  await page.getByRole("switch", { name: /Auto-post/ }).click();
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

test("/developers renders the reference at phone width without horizontal scroll", async () => {
  const s = await openPage(app, { width: 390, signedIn: false });
  await s.go("/developers");
  await s.page.getByTestId("developers").waitFor();
  await s.page.getByRole("heading", { name: "LunchVoice API" }).waitFor();
  for (const t of ["campaigns:read", "results:read", "LunchVoice-Signature", "texts_omitted"]) await s.page.getByText(t).first().waitFor();
  assert.equal(await noHorizontalScroll(s.page), true);
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});
