import { test, expect } from "./fixtures";

test.describe("Step 20 — PWA, Offline Shell & Push Reminders @s20", () => {
  test.beforeEach(async ({ testApi }) => {
    await testApi.reset();
    await testApi.seed({
      users: [
        {
          id: "test-user-id",
          email: "test@example.com",
          name: "Test User",
          timezone: "Asia/Colombo",
        },
      ],
      categories: [
        { id: "cat-groceries", name: "Groceries", icon: "🛒", color: "#10b981" },
      ],
      accounts: [
        {
          id: "acc-savings",
          userId: "test-user-id",
          name: "Savings Account",
          type: "BANK_SAVINGS",
          currency: "LKR",
          openingBalanceMinor: 25000000,
          currentBalanceMinor: 25000000,
        },
      ],
    });
  });

  test("S20-03: Manifest fetched: display=standalone, icons ≥192/512, theme_color set", async ({
    request,
  }) => {
    // 1. Fetch web app manifest
    const res = await request.get("/manifest.json");
    expect(res.ok()).toBe(true);
    const manifest = await res.json();

    // Verify manifest specifications
    expect(manifest.name).toBe("Hard Money");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBeDefined();
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

    const has192 = manifest.icons.some((i: { sizes?: string }) => i.sizes === "192x192");
    const has512 = manifest.icons.some((i: { sizes?: string }) => i.sizes === "512x512");
    expect(has192).toBe(true);
    expect(has512).toBe(true);
  });

  test("S20-05: Offline fallback page renders cleanly with retry action", async ({
    page,
  }) => {
    await page.goto("/offline");
    await expect(page.locator('[data-testid="offline-fallback-page"]')).toBeVisible();
    await expect(page.locator('[data-testid="offline-retry-btn"]')).toBeVisible();
  });

  test("S20-06: Push subscription and settings endpoints store preferences correctly", async ({
    page,
  }) => {
    // 1. Subscribe a mock device endpoint using authenticated page.request
    const subRes = await page.request.post("/api/push/subscribe", {
      data: {
        endpoint: "https://fcm.googleapis.com/fcm/send/test-device-endpoint",
        keys: {
          p256dh: "test-p256dh-key-xyz",
          auth: "test-auth-key-123",
        },
      },
    });
    expect(subRes.ok()).toBe(true);

    // 2. Update reminder preferences
    const settingsRes = await page.request.post("/api/push/settings", {
      data: {
        enabled: true,
        reminderTime: "20:30",
      },
    });
    expect(settingsRes.ok()).toBe(true);
    const settings = await settingsRes.json();
    expect(settings.enabled).toBe(true);
    expect(settings.reminderTime).toBe("20:30");

    // 3. Verify subscription is stored in Test API outbox
    const subsRes = await page.request.post("/api/test/push-subscriptions");
    expect(subsRes.ok()).toBe(true);
    const subsData = await subsRes.json();
    expect(subsData.subscriptions.length).toBeGreaterThan(0);
    expect(subsData.subscriptions[0].userId).toBe("test-user-id");
    expect(subsData.subscriptions[0].endpoint).toBe("https://fcm.googleapis.com/fcm/send/test-device-endpoint");
  });

  test("S20-07: Clock to reminder time + tick → push job enqueued with correct payload", async ({
    page,
    testApi,
  }) => {
    // Seed user with reminders enabled at 20:00
    await testApi.seed({
      users: [
        {
          id: "test-user-id",
          email: "test@example.com",
          name: "Test User",
          timezone: "Asia/Colombo",
          pushRemindersEnabled: true,
          dailyReminderTime: "20:00",
        },
      ],
    });

    // Advance server clock to 20:05 in user timezone (Asia/Colombo)
    // 20:05 in Colombo (UTC+5:30) is 14:35 UTC
    await testApi.setClock("2026-10-19T14:35:00.000Z");

    // Trigger cron tick
    const cronRes = await page.request.post("/api/v1/cron/tick", {
      headers: { "x-cron-secret": "optional-cron-secret-token" },
    });
    expect(cronRes.ok()).toBe(true);

    // Verify push notification enqueued in Test API outbox
    const outboxRes = await page.request.post("/api/test/push-outbox");
    expect(outboxRes.ok()).toBe(true);
    const { outbox } = await outboxRes.json();
    expect(outbox.length).toBeGreaterThan(0);
    expect(outbox[0].userId).toBe("test-user-id");
    expect(outbox[0].payload.title).toContain("Daily");
    expect(outbox[0].payload.url).toBe("/");
  });

  test("S20-08: More page displays Notifications & Reminders section", async ({
    page,
  }) => {
    await page.goto("/more/preferences");
    await expect(page.locator("text=Notifications & Reminders")).toBeVisible();
    await expect(page.locator('[data-testid="toggle-reminders"]')).toBeAttached();
    await expect(page.locator('[data-testid="save-reminders-btn"]')).toBeVisible();
  });

  test("S20-09: @smoke Lighthouse-style checks: installability and PWA audits pass", async ({
    page,
  }) => {
    await page.goto("/accounts");

    // 1. Manifest link tag
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute("href", "/manifest.json");

    // 2. Apple touch icon link tag
    const appleIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleIcon).toHaveAttribute("href", "/apple-touch-icon.png");

    // 3. Viewport tag includes width=device-width
    const viewportMeta = page.locator('meta[name="viewport"]');
    await expect(viewportMeta).toHaveAttribute("content", /width=device-width/);

    // 4. Page title is set
    await expect(page).toHaveTitle(/Hard Money/);
  });
});
