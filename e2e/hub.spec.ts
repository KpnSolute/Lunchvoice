import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Workspace routes need live mock state, so this walks them in one session.
test("hub routes have no accessibility violations and no overflow", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/signin");
  await page.getByRole("button", { name: "Mock sign-in" }).click();
  await page.getByRole("link", { name: "Create a Hub" }).first().click();
  await page.getByLabel("Hub name").fill("Harbor Book Circle");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("button", { name: "Create Hub" }).click();

  const check = async (label: string) => {
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${label} must not scroll horizontally`).toBeLessThanOrEqual(0);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      results.violations.map((v) => `${label} :: ${v.id}: ${v.nodes.length} node(s) — ${v.help}`),
      `${label} axe`,
    ).toEqual([]);
  };

  const phone = (page.viewportSize()?.width ?? 1280) <= 720;
  const go = async (tab: string) => {
    const inline = phone ? ["Home", "Campaigns", "Analytics", "Members"] : ["Overview", "Campaigns", "Analytics", "Members", "Invites", "Roles", "Settings", "Billing"];
    if (inline.includes(tab)) {
      await page.getByRole("link", { name: tab }).first().click();
      return;
    }
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog").getByRole("link", { name: tab }).click();
  };

  await check("overview");
  for (const [label, tab] of [
    ["campaigns", "Campaigns"],
    ["analytics", "Analytics"],
    ["members", "Members"],
    ["invites", "Invites"],
    ["roles", "Roles"],
    ["settings", "Settings"],
    ["billing", "Billing"],
  ]) {
    await go(tab);
    await check(label);
  }
});
