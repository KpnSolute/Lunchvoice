// Hub workspace: the setup checklist, plain-language settings and the Discord "Connected communities" tab (dev mock).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { noHorizontalScroll, openPage, startApp } from "./harness.mjs";

const HUB = "/northside-running";
let app;
before(async () => { app = await startApp(); });
after(async () => { await app?.close(); });

test("the setup checklist ticks only from real state and disappears when everything is done", async () => {
  const { page, go, ctx, errors } = await openPage(app);
  await go(HUB);
  const list = page.getByTestId("getting-started");
  await list.waitFor();
  // The seeded Hub has an about line, a colour, Campaigns and members, but no Discord server.
  for (const k of ["about", "colour", "campaign", "invite"]) assert.equal(await page.getByTestId(`setup-${k}`).getAttribute("data-done"), "true", k);
  assert.equal(await page.getByTestId("setup-discord").getAttribute("data-done"), null);
  assert.equal(await page.getByTestId("setup-progress").innerText(), "4 of 5 done");
  await page.getByTestId("setup-discord").getByRole("link").click();
  await page.getByTestId("discord-empty").waitFor();
  // Connecting a server is what ticks the last step.
  await go("/connect/discord?c=C0FFEE0000000000000A");
  await page.getByRole("button", { name: "Connect server" }).click();
  await page.getByText("Server connected").waitFor();
  await go(HUB);
  await page.getByTestId("hub-stats").waitFor();
  assert.equal(await page.getByTestId("getting-started").count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("settings use plain labels and radio choices, and show the address", async () => {
  const { page, go, ctx, errors } = await openPage(app);
  await go(`${HUB}/settings`);
  await page.getByLabel("Hub name").waitFor();
  await page.getByLabel("What is this Hub for?").waitFor();
  assert.match(await page.getByTestId("settings-address").innerText(), /lunchvoice\.com\/northside-running/);
  const joining = page.getByRole("radiogroup", { name: "How people join" });
  assert.equal(await joining.getByRole("radio").count(), 3);
  await joining.getByRole("radio", { name: /Invite only/ }).click();
  await page.getByTestId("settings-save-state").filter({ hasText: "Unsaved changes" }).waitFor();
  await joining.getByRole("radio", { name: /By approval/ }).click();
  await page.getByTestId("settings-save-state").filter({ hasText: "No changes" }).waitFor();
  assert.equal(await page.getByText("Owner only").count(), 0);
  await page.getByRole("heading", { name: "Ownership and deletion" }).waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("Discord tab: steps with a copyable command when empty; a server card with controls when connected", async () => {
  const { page, go, ctx, errors } = await openPage(app, { width: 390 });
  await go(`${HUB}/settings?tab=discord`);
  const empty = page.getByTestId("discord-empty");
  await empty.waitFor();
  assert.equal(await empty.locator("ol > li").count(), 3);
  assert.equal(await empty.getByRole("textbox").inputValue(), "/lunchvoice connect hub:northside-running");
  await page.getByTestId("discord-privacy").getByText("never reads your server’s messages").waitFor();
  await go("/connect/discord?c=C0FFEE0000000000000A");
  await page.getByRole("button", { name: "Connect server" }).click();
  await page.getByText("Server connected").waitFor();
  await go(`${HUB}/settings?tab=discord`);
  const card = page.getByTestId("discord-server");
  await card.getByText("Northside Discord").waitFor();
  await card.getByRole("switch", { name: /Auto-post/ }).click();
  await page.getByText("Auto-post is on").waitFor();
  await card.getByRole("button", { name: "Disconnect" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
  await page.getByTestId("discord-empty").waitFor();
  assert.ok(await noHorizontalScroll(page));
  assert.deepEqual(errors, []);
  await ctx.close();
});
