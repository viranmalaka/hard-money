import { test, expect } from "./fixtures";

test.describe("Step 2 — Authentication & User Settings @s02", () => {
  test("S02-01: Register a new user, land on Trans. tab, user name visible in More", async ({
    page,
    context,
    app,
  }) => {
    await context.clearCookies();
    await app.testApi.reset();

    await app.auth.register({
      name: "Kasun Perera",
      email: "kasun@example.com",
      password: "password123",
    });

    await expect(page).toHaveURL("/");
    await app.go("more");
    await expect(page.locator('[data-testid="user-display-name"]')).toHaveText(
      "Kasun Perera"
    );
  });

  test("S02-02: Log out, log in with the same credentials", async ({
    page,
    context,
    app,
  }) => {
    await context.clearCookies();
    await app.testApi.reset();

    await app.auth.register({
      name: "Amal Silva",
      email: "amal@example.com",
      password: "password123",
    });

    await expect(page).toHaveURL("/");
    await app.go("more");

    await page.locator('[data-testid="logout-button"]').click();
    await expect(page).toHaveURL(/\/login/);

    await app.auth.login({
      email: "amal@example.com",
      password: "password123",
    });

    await expect(page).toHaveURL("/");
    await app.go("more");
    await expect(page.locator('[data-testid="user-display-name"]')).toHaveText(
      "Amal Silva"
    );
  });

  test("S02-03: Invalid password shows a generic error; no redirect", async ({
    page,
    context,
    app,
  }) => {
    await context.clearCookies();
    await app.testApi.reset();

    await app.auth.register({
      name: "Nimal",
      email: "nimal@example.com",
      password: "password123",
    });

    await context.clearCookies();
    await page.goto("/login");

    await page.fill('[data-testid="login-email"]', "nimal@example.com");
    await page.fill('[data-testid="login-password"]', "wrongpass999");
    await page.click('[data-testid="login-submit"]');

    const error = page.locator('[data-testid="auth-error"]');
    await expect(error).toBeVisible();
    await expect(error).toContainText("Invalid email or password");
    expect(page.url()).toContain("/login");
  });

  test("S02-04: Duplicate email registration shows an error", async ({
    page,
    context,
    app,
  }) => {
    await context.clearCookies();
    await app.testApi.reset();

    await app.auth.register({
      name: "Original User",
      email: "dupe@example.com",
      password: "password123",
    });

    await context.clearCookies();
    await page.goto("/register");

    await page.fill('[data-testid="register-name"]', "Duplicate User");
    await page.fill('[data-testid="register-email"]', "dupe@example.com");
    await page.fill('[data-testid="register-password"]', "password123");
    await page.click('[data-testid="register-submit"]');

    const error = page.locator('[data-testid="auth-error"]');
    await expect(error).toBeVisible();
    await expect(error).toContainText("already exists");
    expect(page.url()).toContain("/register");
  });

  test("S02-05: Server with ALLOW_REGISTRATION=false: register route shows 'registration closed'", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto("/register?disabled=1");

    const notice = page.locator('[data-testid="registration-closed-notice"]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("registration closed");
    await expect(page.locator('[data-testid="register-submit"]')).toBeHidden();
  });

  test("S02-06: Visiting /accounts unauthenticated redirects to login and back after login", async ({
    page,
    context,
    app,
  }) => {
    await context.clearCookies();
    await app.testApi.reset();

    await app.auth.register({
      name: "Redirect User",
      email: "redirect@example.com",
      password: "password123",
    });

    await context.clearCookies();
    await page.goto("/accounts");

    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Faccounts/);

    await page.fill('[data-testid="login-email"]', "redirect@example.com");
    await page.fill('[data-testid="login-password"]', "password123");
    await page.click('[data-testid="login-submit"]');

    await expect(page).toHaveURL(/\/accounts/);
  });

  test("S02-07: Change timezone and currency in Settings; reload; values persisted", async ({
    page,
    context,
    app,
  }) => {
    await context.clearCookies();
    await app.testApi.reset();

    await app.auth.register({
      name: "Settings Tester",
      email: "settings@example.com",
      password: "password123",
    });

    await app.go("more");
    await page.click('[data-testid="more-preferences-link"]');

    // Wait for settings to load
    await expect(page.locator('[data-testid="settings-name"]')).toHaveValue(
      "Settings Tester"
    );

    await page.fill('[data-testid="settings-timezone"]', "America/New_York");
    await page.fill('[data-testid="settings-currency"]', "USD");
    await page.click('[data-testid="settings-save"]');

    await expect(page.locator('[data-testid="settings-saved"]')).toBeVisible();

    await page.reload();
    await expect(page.locator('[data-testid="settings-timezone"]')).toHaveValue(
      "America/New_York"
    );
    await expect(page.locator('[data-testid="settings-currency"]')).toHaveValue(
      "USD"
    );
  });

  test("S02-08: New user has the default category set (visible via API)", async ({
    context,
    app,
    page,
  }) => {
    await context.clearCookies();
    await app.testApi.reset();

    await app.auth.register({
      name: "Category Tester",
      email: "cat@example.com",
      password: "password123",
    });

    const res = await page.request.get("/api/user/categories");
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data.categories.length).toBe(12);

    const names = data.categories.map((c: { name: string }) => c.name);
    expect(names).toContain("Groceries");
    expect(names).toContain("Dining");
    expect(names).toContain("Fuel & Transport");
    expect(names).toContain("Balance Calibration");
  });

  test("S02-09: Login form is usable by keyboard only (tab order, Enter submits) [W]", async ({
    page,
    context,
    app,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "web", "Desktop web viewport only");

    await context.clearCookies();
    await app.testApi.reset();

    await app.auth.register({
      name: "Keyboard User",
      email: "kb@example.com",
      password: "password123",
    });

    await context.clearCookies();
    await page.goto("/login");

    await page.locator('[data-testid="login-email"]').focus();
    await page.keyboard.type("kb@example.com");
    await page.keyboard.press("Tab");

    await expect(page.locator('[data-testid="login-password"]')).toBeFocused();
    await page.keyboard.type("password123");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL("/");
  });

  test("S02-10: Login form inputs are not obscured by the on-screen keyboard viewport (input scrolled into view after focus) [M]", async ({
    page,
    context,
  }, testInfo) => {
    test.skip(testInfo.project.name === "web", "Mobile viewport only");

    await context.clearCookies();
    await page.goto("/login");

    const passInput = page.locator('[data-testid="login-password"]');
    await passInput.focus();

    const box = await passInput.boundingBox();
    expect(box).not.toBeNull();

    const viewport = page.viewportSize();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
  });
});
