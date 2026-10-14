import { test, expect } from "./fixtures";

test.describe("Step 0 — Repo, Tooling & Test Harness @s00", () => {
  test("S00-01: Home page loads with HTTP 200, no console errors @smoke", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    const title = page.locator('[data-testid="app-title"]');
    await expect(title).toBeVisible();
    await expect(title).toHaveText("Hard Money");

    expect(consoleErrors).toHaveLength(0);
  });

  test("S00-02: Playwright config runs a trivial spec on both web and mobile projects", async ({
    page,
  }, testInfo) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();

    if (testInfo.project.name === "web") {
      expect(viewport?.width).toBe(1440);
      expect(viewport?.height).toBe(900);
      expect(testInfo.project.use.isMobile).toBe(false);
    } else if (testInfo.project.name === "mobile") {
      expect(viewport?.width).toBe(412);
      expect(viewport?.height).toBe(915);
      expect(testInfo.project.use.isMobile).toBe(true);
    }
  });

  test("S00-03: /api/test/reset returns 200 when E2E_MODE=1; refuses when disabled", async ({
    testApi,
    request,
  }) => {
    // 1. With E2E_MODE enabled (default server config)
    const resetRes = await testApi.reset();
    expect(resetRes.status()).toBe(200);
    const body = await resetRes.json();
    expect(body.ok).toBe(true);

    // 2. Security check: when E2E_MODE is disabled (simulated via header)
    const disabledRes = await request.post("/api/test/reset", {
      headers: {
        "x-disable-e2e-mode": "1",
      },
    });
    expect(disabledRes.status()).toBe(404);
  });

  test('S00-04: /api/test/clock sets "now"; GET /api/health reflects the overridden time', async ({
    testApi,
    request,
  }) => {
    const targetTime = "2026-10-20T10:00:00.000Z";

    // Set clock via Test API
    const clockRes = await testApi.setClock(targetTime);
    expect(clockRes.status()).toBe(200);

    // Assert GET /api/health returns the overridden time
    const healthRes = await request.get("/api/health");
    expect(healthRes.status()).toBe(200);
    const healthData = await healthRes.json();
    expect(healthData.status).toBe("ok");
    expect(healthData.now).toBe(targetTime);

    // Clean up: reset clock
    await testApi.resetClock();
  });
});
