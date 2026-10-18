import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    timezoneId: "Asia/Colombo",
    locale: "en-LK",
  },
  projects: [
    {
      name: "web",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        isMobile: true,
        hasTouch: true,
        viewport: { width: 412, height: 915 },
      },
    },
    {
      name: "mobile-safari",
      grep: /@smoke/,
      use: {
        ...devices["iPhone 14"],
      },
    },
  ],
  webServer: {
    command: "npx next dev -p 3000",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
