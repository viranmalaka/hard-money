import { test, expect } from "./fixtures";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 3: Offline Data Layer & Sync Engine @s03", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    const app = new AppHelper(page);
    await app.testApi.reset();
  });

  test("S03-01: Create an account while offline; appears instantly; indicator shows offline/pending", async ({
    page,
    context,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Alice", email: "alice-s03-01@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    // Go offline
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    // Create account
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Offline Cash Wallet");
    await page.fill('[data-testid="account-opening-balance"]', "5000.00");
    await page.click('[data-testid="account-submit"]');

    // Appears instantly in UI without network
    await expect(page.getByText("Offline Cash Wallet")).toBeVisible();
    const isMobile = page.viewportSize() ? page.viewportSize()!.width < 768 : false;
    const indicator = page.locator(isMobile ? '[data-testid="sync-indicator-mobile"]:visible' : '[data-testid="sync-indicator-desktop"]:visible');
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveAttribute("data-sync-state", "offline");
  });

  test("S03-02: Go back online; waitForSyncIdle; the account exists on the server", async ({
    page,
    context,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Alice", email: "alice-s03-02@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    // Go offline & create
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Offline Server Test");
    await page.fill('[data-testid="account-opening-balance"]', "12500.00");
    await page.click('[data-testid="account-submit"]');
    await expect(page.getByText("Offline Server Test")).toBeVisible();

    // Reconnect online
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await app.waitForSyncIdle();

    // Check server snapshot
    const snapshot = await app.testApi.getSnapshot();
    const serverAccount = snapshot.accounts.find(
      (a: { name: string }) => a.name === "Offline Server Test"
    );
    expect(serverAccount).toBeTruthy();
    expect(serverAccount.openingBalanceMinor).toBe(1250000);
  });

  test("S03-03: Two contexts: create on device 1 → appears on device 2 after sync", async ({
    page,
    browser,
  }) => {
    const app1 = new AppHelper(page);
    await app1.auth.register({ name: "Bob", email: "bob-s03-03@example.com" });
    await app1.go("accounts");
    await app1.waitForSyncIdle();

    // Get auth cookie from context 1
    const cookies = await page.context().cookies();

    // Device 2 context
    const context2 = await browser.newContext({ viewport: page.viewportSize() || undefined });
    await context2.addCookies(cookies);
    const page2 = await context2.newPage();
    const app2 = new AppHelper(page2);
    await page2.goto("/accounts");
    await expect(page2.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
    await app2.waitForSyncIdle();

    // Create on Device 1
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Device 1 Secret Stash");
    await page.fill('[data-testid="account-opening-balance"]', "25000.00");
    await page.click('[data-testid="account-submit"]');
    await app1.waitForSyncIdle();

    // Trigger sync on Device 2
    const isMobile2 = page2.viewportSize() ? page2.viewportSize()!.width < 768 : false;
    await page2.click(`[data-testid="${isMobile2 ? "sync-indicator-mobile" : "sync-indicator-desktop"}"]`);
    await app2.waitForSyncIdle();

    await expect(page2.getByText("Device 1 Secret Stash")).toBeVisible();
    await context2.close();
  });

  test("S03-04: Delete on device 1 → disappears from device 2 (tombstone propagated)", async ({
    page,
    browser,
  }) => {
    const app1 = new AppHelper(page);
    await app1.auth.register({ name: "Charlie", email: "charlie-s03-04@example.com" });
    await app1.go("accounts");

    // Create initial account
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Account To Delete");
    await page.fill('[data-testid="account-opening-balance"]', "1000.00");
    await page.click('[data-testid="account-submit"]');
    await app1.waitForSyncIdle();

    // Setup Device 2
    const cookies = await page.context().cookies();
    const context2 = await browser.newContext({ viewport: page.viewportSize() || undefined });
    await context2.addCookies(cookies);
    const page2 = await context2.newPage();
    const app2 = new AppHelper(page2);
    await page2.goto("/accounts");
    await expect(page2.getByText("Account To Delete")).toBeVisible();
    await app2.waitForSyncIdle();

    // Delete on Device 1
    await page.click('[data-testid="account-delete-btn"]');
    await page.click('[data-testid="confirm-action-btn"]');
    await app1.waitForSyncIdle();

    // Sync Device 2
    const isMobile2 = page2.viewportSize() ? page2.viewportSize()!.width < 768 : false;
    await page2.click(`[data-testid="${isMobile2 ? "sync-indicator-mobile" : "sync-indicator-desktop"}"]`);
    await app2.waitForSyncIdle();

    // Tombstone applied
    await expect(page2.getByText("Account To Delete")).not.toBeVisible();
    await context2.close();
  });

  test("S03-05: Edit the same account name on both devices offline, reconnect device 1 then device 2 → both converge to device 2's value", async ({
    page,
    browser,
  }) => {
    const app1 = new AppHelper(page);
    await app1.auth.register({ name: "Dave", email: "dave-s03-05@example.com" });
    await app1.go("accounts");

    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Original Name");
    await page.click('[data-testid="account-submit"]');
    await app1.waitForSyncIdle();

    // Setup Device 2
    const cookies = await page.context().cookies();
    const context2 = await browser.newContext({ viewport: page.viewportSize() || undefined });
    await context2.addCookies(cookies);
    const page2 = await context2.newPage();
    const app2 = new AppHelper(page2);
    await page2.goto("/accounts");
    await expect(page2.getByText("Original Name")).toBeVisible();
    await app2.waitForSyncIdle();

    // Both go offline
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await context2.setOffline(true);
    await page2.evaluate(() => window.dispatchEvent(new Event("offline")));

    // Device 1 edits
    await page.click('[data-testid="account-edit-btn"]');
    await page.fill('[data-testid="account-name"]', "Device 1 Edit");
    await page.click('[data-testid="account-submit"]');

    // Device 2 edits
    await page2.click('[data-testid="account-edit-btn"]');
    await page2.fill('[data-testid="account-name"]', "Device 2 Final Win");
    await page2.click('[data-testid="account-submit"]');

    // Reconnect Device 1 first
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await app1.waitForSyncIdle();

    // Reconnect Device 2 second
    await context2.setOffline(false);
    await page2.evaluate(() => window.dispatchEvent(new Event("online")));
    await app2.waitForSyncIdle();

    // Device 1 syncs updates from Device 2
    const isMobile1 = page.viewportSize() ? page.viewportSize()!.width < 768 : false;
    await page.click(`[data-testid="${isMobile1 ? "sync-indicator-mobile" : "sync-indicator-desktop"}"]`);
    await app1.waitForSyncIdle();

    // Both converge to Device 2's last-write-wins value
    await expect(page.getByText("Device 2 Final Win")).toBeVisible();
    await expect(page2.getByText("Device 2 Final Win")).toBeVisible();

    await context2.close();
  });

  test("S03-06: Reload the page while offline → data still shown from IndexedDB", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Eve", email: "eve-s03-06@example.com" });
    await app.go("accounts");

    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Persistent Offline Account");
    await page.fill('[data-testid="account-opening-balance"]', "7500.00");
    await page.click('[data-testid="account-submit"]');
    await app.waitForSyncIdle();

    // Simulate backend network outage by aborting all API calls
    await page.route("**/api/**", (route) => route.abort());
    await page.reload();

    // Loaded from IndexedDB
    await expect(page.getByText("Persistent Offline Account")).toBeVisible();
    await expect(page.getByTestId("account-card-balance")).toHaveText("LKR 7,500.00");

    await page.unroute("**/api/**");
  });

  test("S03-07: Force a failing mutation: error badge shown; valid sibling mutation still synced", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Frank", email: "frank-s03-07@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    // Create a valid sibling account
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Valid Sibling Account");
    await page.click('[data-testid="account-submit"]');

    // Create an invalid account whose name triggers validation failure on server (> 50 chars)
    const overlyLongName = "This Account Name Is Way Too Long And Exceeds The Maximum Allowed Fifty Characters Limit";
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', overlyLongName);
    await page.click('[data-testid="account-submit"]');

    // Wait for sync to process
    await page.waitForTimeout(1000);

    const isMobile = page.viewportSize() ? page.viewportSize()!.width < 768 : false;
    const indicator = page.locator(isMobile ? '[data-testid="sync-indicator-mobile"]:visible' : '[data-testid="sync-indicator-desktop"]:visible');
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveAttribute("data-sync-state", "error");

    // Valid sibling was still synced to server
    const snapshot = await app.testApi.getSnapshot();
    const valid = snapshot.accounts.find((a: { name: string }) => a.name === "Valid Sibling Account");
    expect(valid).toBeTruthy();
  });

  test("S03-08: Replay-safety: intercept push request, return network error after server applied it; client retries; exactly one account exists", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Grace", email: "grace-s03-08@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    let interceptedOnce = false;

    // Intercept push to simulate client receiving error after server processed it
    await page.route("**/api/sync/push", async (route) => {
      if (!interceptedOnce) {
        interceptedOnce = true;
        // Fetch from upstream server to let server process it
        await route.fetch();
        // But abort response to client to simulate network drop
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });

    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Idempotent Account");
    await page.click('[data-testid="account-submit"]');

    // Wait for failure
    await page.waitForTimeout(500);

    // Now unroute and click sync to retry
    await page.unroute("**/api/sync/push");
    const isMobile = page.viewportSize() ? page.viewportSize()!.width < 768 : false;
    await page.click(`[data-testid="${isMobile ? "sync-indicator-mobile" : "sync-indicator-desktop"}"]`);
    await app.waitForSyncIdle();

    // Verify exactly one account exists on server
    const snapshot = await app.testApi.getSnapshot();
    const matching = snapshot.accounts.filter(
      (a: { name: string }) => a.name === "Idempotent Account"
    );
    expect(matching.length).toBe(1);
  });

  test("S03-09: Log in as user B in the same browser profile after user A: B sees none of A's accounts", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    // User A registers & creates an account
    await app.auth.register({ name: "UserA", email: "user-a-s03-09@example.com" });
    await app.go("accounts");
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Secret Treasury of User A");
    await page.click('[data-testid="account-submit"]');
    await app.waitForSyncIdle();

    // Log out
    await app.go("more");
    await app.auth.logout();

    // User B registers
    await app.auth.register({ name: "UserB", email: "user-b-s03-09@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    // User B must NOT see User A's account in their namespaced Dexie database
    await expect(page.getByText("Secret Treasury of User A")).not.toBeVisible();
  });

  test("S03-10: Sync indicator is visible in the mobile header and the desktop sidebar footer and reflects state changes", async ({
    page,
    context,
  }) => {
    const isMobile = page.viewportSize() ? page.viewportSize()!.width < 768 : false;
    const app = new AppHelper(page);
    await app.auth.register({ name: "Heidi", email: "heidi-s03-10@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    const indicator = page.locator(isMobile ? '[data-testid="sync-indicator-mobile"]:visible' : '[data-testid="sync-indicator-desktop"]:visible');
    await expect(indicator).toBeVisible();

    // When offline
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(indicator).toHaveAttribute("data-sync-state", "offline");

    // When back online
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await app.waitForSyncIdle();
    await expect(indicator).toHaveAttribute("data-sync-state", "idle");
  });

  test("S03-11: @smoke offline create + reconnect", async ({ page, context }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "SmokeUser", email: "smoke-s03-11@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Smoke Offline Account");
    await page.click('[data-testid="account-submit"]');
    await expect(page.getByText("Smoke Offline Account")).toBeVisible();

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await app.waitForSyncIdle();

    const snapshot = await app.testApi.getSnapshot();
    expect(snapshot.accounts.some((a: { name: string }) => a.name === "Smoke Offline Account")).toBe(true);
  });
});
