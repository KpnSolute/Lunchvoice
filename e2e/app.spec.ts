import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The hard acceptance path plus accessibility, against the mock transport.
// Every route is exercised at 1280 and 390 by the project matrix.
//
// The mock lives in memory per page load, so the acceptance path navigates the way
// a person does (in-app links), never with page.goto after seeding data.

async function signIn(page: Page) {
  await page.goto("/signin");
  const mock = page.getByRole("button", { name: "Mock sign-in" });
  await expect(mock).toBeVisible();
  await mock.click();
  await expect(page).toHaveURL(/\/me$/);
}

/** Asserts no horizontal scroll, and names the element that would cause one. */
async function noHorizontalOverflow(page: Page) {
  const info = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders: string[] = [];
    document.querySelectorAll<HTMLElement>("body *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1 || r.width === 0) return;
      const parent = el.parentElement;
      if (!parent) return;
      const pr = parent.getBoundingClientRect();
      const clipped = ["hidden", "auto", "scroll", "clip"].includes(getComputedStyle(parent).overflowX);
      if (pr.right <= vw + 1 && !clipped) {
        const cls = typeof el.className === "string" ? el.className : "";
        offenders.push(`${el.tagName.toLowerCase()}.${cls.replace(/\s+/g, ".")} right=${Math.round(r.right)}`);
      }
    });
    return { overflow: document.documentElement.scrollWidth - vw, offenders: offenders.slice(0, 6) };
  });
  expect(info.overflow, `horizontal overflow from: ${info.offenders.join(" | ")}`).toBeLessThanOrEqual(0);
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`),
    "axe violations",
  ).toEqual([]);
}

test.describe("public routes", () => {
  for (const route of [
    "/",
    "/how-it-works",
    "/use-cases",
    "/pricing",
    "/beta",
    "/about",
    "/status",
    "/terms",
    "/privacy",
    "/support",
    "/discover",
    "/join",
    "/signin",
  ]) {
    test(`${route} renders, has no overflow and no accessibility violations`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      await noHorizontalOverflow(page);
      await axe(page);
    });
  }

  test("a missing route gets the neutral 404", async ({ page }) => {
    await page.goto("/this-hub-does-not-exist-9f2");
    await expect(page.getByRole("heading", { name: "Hub not available" })).toBeVisible();
  });

  test("dark mode keeps contrast on the landing and pricing pages", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    for (const route of ["/", "/pricing"]) {
      await page.goto(route);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await axe(page);
    }
  });
});

test.describe("signed-in surfaces", () => {
  test("/me, /create and /settings render without violations", async ({ page }) => {
    await signIn(page);
    await noHorizontalOverflow(page);
    await axe(page);

    await page.getByRole("link", { name: "Create a Hub" }).first().click();
    await expect(page.getByRole("heading", { name: /Give your community an address/ })).toBeVisible();
    await noHorizontalOverflow(page);
    await axe(page);

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /Your account/ })).toBeVisible();
    await page.getByRole("tab", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("tab", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await noHorizontalOverflow(page);
    await axe(page);
  });

  test("acceptance: create a Hub, publish a Campaign, answer as a guest, read results", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page);

    // 1. Create a synthetic Hub.
    await page.getByRole("link", { name: "Create a Hub" }).first().click();
    await page.getByLabel("Hub name").fill("Northside Running Club");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Hub address")).toHaveValue("northside-running-club");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Review" }).click();
    await page.getByRole("button", { name: "Create Hub" }).click();
    await expect(page).toHaveURL(/\/northside-running-club$/);
    await expect(page.getByRole("heading", { name: "Northside Running Club" })).toBeVisible();

    // 2. Configure a Campaign through the Studio.
    await page.getByRole("link", { name: "Campaigns" }).first().click();
    await page.getByRole("link", { name: "New Campaign" }).first().click();
    await page.getByLabel("Campaign title").fill("Which session should we add on Saturdays?");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/studio$/);

    await page.getByRole("textbox", { name: "Question", exact: true }).fill("How was the session?");
    await page.getByRole("button", { name: "Add question" }).click();
    await expect(page.getByText("How was the session?").first()).toBeVisible();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Campaign published")).toBeVisible();
    await noHorizontalOverflow(page);
    await axe(page);

    // 3. Answer as a guest through the player.
    await page.getByRole("link", { name: "Which session should we add on Saturdays?" }).first().click();
    await page.getByRole("link", { name: "Answer as a respondent" }).click();
    await expect(page.getByText("You are answering as a guest")).toBeVisible();
    await page.getByRole("button", { name: "Start" }).click();
    await page.getByRole("radio", { name: "4 of 5" }).click();
    await page.getByRole("button", { name: "Review" }).click();
    await page.getByRole("button", { name: "Send answers" }).click();
    await expect(page.getByRole("heading", { name: "Thank you." })).toBeVisible();
    await noHorizontalOverflow(page);
    await axe(page);

    // 4. Results and analytics stay privacy-safe.
    await page.getByRole("link", { name: "Done" }).click();
    await page.getByRole("link", { name: "My Hubs" }).first().click();
    await page.getByRole("link", { name: "Open Hub" }).first().click();
    await page.getByRole("link", { name: "Campaigns" }).first().click();
    await expect(page.getByText("Which session should we add on Saturdays?").first()).toBeVisible();
    await page.getByRole("link", { name: "Analytics" }).first().click();
    await expect(page.getByRole("heading", { name: /How this Hub is doing/ })).toBeVisible();
    await noHorizontalOverflow(page);
    await axe(page);
  });
});

test("the component gallery renders every group", async ({ page }) => {
  await page.goto("/__gallery");
  await expect(page.getByRole("heading", { name: "Component gallery" })).toBeVisible();
  for (const group of ["Actions", "Inputs", "Question controls", "Display", "Charts", "Overlays", "States", "Brand"]) {
    await expect(page.getByRole("heading", { name: group, exact: true })).toBeVisible();
  }
  await noHorizontalOverflow(page);
});
