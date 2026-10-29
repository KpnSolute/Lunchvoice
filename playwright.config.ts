import { defineConfig, devices } from "@playwright/test";

// Local end-to-end configuration. The dev server runs against the mock transport
// (VITE_LV_MOCK=1), which is the only way to exercise auth and data without a
// backend. Nothing here touches production.

const PORT = 5174;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /screenshots\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, colorScheme: "light" },
    },
    {
      name: "phone",
      testIgnore: /screenshots\.spec\.ts/,
      use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 }, colorScheme: "light" },
    },
    {
      name: "screenshots",
      testMatch: /screenshots\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: `VITE_LV_MOCK=1 npm run dev -- --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
