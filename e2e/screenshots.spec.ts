import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// The visual matrix the handoff requires: every public route at 390 and 1280, light
// and dark, plus the workspace at 1280 and its two phone screens. The workspace needs
// a Hub with data, so it is seeded through the UI in the same page session and then
// walked with its own navigation (a reload would drop the in-memory mock).

const PUBLIC = [
  ["landing", "/"],
  ["how-it-works", "/how-it-works"],
  ["use-cases", "/use-cases"],
  ["pricing", "/pricing"],
  ["beta", "/beta"],
  ["about", "/about"],
  ["status", "/status"],
  ["terms", "/terms"],
  ["privacy", "/privacy"],
  ["support", "/support"],
  ["discover", "/discover"],
  ["join", "/join"],
  ["signin", "/signin"],
  ["404", "/nothing-here-8f2"],
];

const SIGNED_IN = [
  ["me", "/me"],
  ["create", "/create"],
  ["settings", "/settings"],
  ["gallery", "/__gallery"],
  ["player-error", "/c/ZZZZZZ"],
];

const SIZES = [
  [390, 844],
  [1280, 900],
] as const;

const SCHEMES = ["light", "dark"] as const;

/** Scrolls the page so scroll-reveal sections settle before the shutter. */
async function settle(page: Page) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 800) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(30);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

async function seedHub(page: Page) {
  await page.goto("/create");
  await page.getByLabel("Hub name").fill("Northside Running Club");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Create Hub" }).click();
  await page.getByRole("link", { name: "Campaigns" }).first().click();
  await page.getByRole("link", { name: "New Campaign" }).first().click();
  await page.getByLabel("Campaign title").fill("Which session should we add on Saturdays?");
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.getByRole("textbox", { name: "Question", exact: true }).fill("How was the session?");
  await page.getByRole("button", { name: "Add question" }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
}

test.describe.configure({ mode: "serial" });

test("capture every route at 390 and 1280, light and dark", async ({ page }) => {
  test.setTimeout(560_000);
  mkdirSync("e2e/shots", { recursive: true });

  await page.goto("/signin");
  await page.getByRole("button", { name: "Mock sign-in" }).click();

  for (const [w, h] of SIZES) {
    for (const scheme of SCHEMES) {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: scheme });
      const dir = `e2e/shots/${w}-${scheme}`;
      mkdirSync(dir, { recursive: true });

      for (const [name, route] of [...PUBLIC, ...SIGNED_IN]) {
        await page.goto(route);
        await page.waitForTimeout(150);
        await settle(page);
        await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
      }

      await seedHub(page);

      // Phone: the workspace has Home, Campaigns and More; desktop-only tabs live in
      // the More sheet, so only the two phone screens are captured at 390.
      if (w === 1280) {
        for (const [name, tab] of [
          ["hub-overview", /^(Overview|Home)$/],
          ["hub-campaigns", /^Campaigns$/],
          ["hub-analytics", /^Analytics$/],
          ["hub-members", /^Members$/],
          ["hub-invites", /^Invites$/],
          ["hub-roles", /^Roles$/],
          ["hub-settings", /^Settings$/],
          ["hub-billing", /^Billing$/],
        ] as const) {
          await page.getByRole("link", { name: tab }).first().click();
          await page.waitForTimeout(150);
          await settle(page);
          await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
        }
        await page.getByRole("link", { name: "Campaigns" }).first().click();
        await page.getByRole("link", { name: "Open" }).first().click();
        await settle(page);
        await page.screenshot({ path: `${dir}/hub-campaign-detail.png`, fullPage: true });
        await page.getByRole("link", { name: /Studio|Results/ }).first().click();
        await settle(page);
        await page.screenshot({ path: `${dir}/hub-campaign-inner.png`, fullPage: true });
      } else {
        await page.getByRole("link", { name: /^(Overview|Home)$/ }).first().click();
        await settle(page);
        await page.screenshot({ path: `${dir}/hub-overview.png`, fullPage: true });
        await page.getByRole("link", { name: "Campaigns" }).first().click();
        await settle(page);
        await page.screenshot({ path: `${dir}/hub-campaigns.png`, fullPage: true });
      }
    }
  }
});
