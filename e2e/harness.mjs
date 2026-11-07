// E2E harness: starts Vite in dev mode with the dev-only mock transport and drives Chromium with Playwright.
// Run: npm run test:e2e   (needs a Playwright Chromium; set PLAYWRIGHT_BROWSERS_PATH if it lives elsewhere)
import { createServer } from "vite";
import { chromium } from "playwright";

export async function startApp() {
  process.env.VITE_LV_MOCK = "1"; // dev mock even if a local .env has Supabase values
  const server = await createServer({ server: { port: 0, strictPort: false, host: "127.0.0.1" }, logLevel: "error", clearScreen: false });
  await server.listen();
  const address = server.httpServer.address();
  const base = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch();
  return {
    base,
    browser,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

/**
 * A signed-in page with the mock seeded ("demo": an admitted founder with Northside Running Club, Campaigns and
 * Quick Surveys). Console errors are collected so a test can assert there are none.
 */
export async function openPage(app, { width = 1280, height = 900, theme = "light", seed = "demo", signedIn = true } = {}) {
  const ctx = await app.browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript(([t, s, signed]) => {
    localStorage.setItem("lv.theme", t);
    if (signed) localStorage.setItem("lv.session", JSON.stringify({ token: "simulated", name: "Dana Reyes" }));
    if (!sessionStorage.getItem("seeded")) {
      localStorage.removeItem("lv.mock.state");
      if (s) localStorage.setItem("lv.mock.seed", s); else localStorage.removeItem("lv.mock.seed");
      sessionStorage.setItem("seeded", "1");
    }
  }, [theme, seed, signedIn]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(10_000);
  return { page, ctx, errors, go: (path) => page.goto(app.base + path, { waitUntil: "networkidle" }) };
}

export const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
