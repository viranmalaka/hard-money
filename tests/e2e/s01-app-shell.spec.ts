import { test, expect } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { NavDestination } from "./helpers/app-helper";

test.describe("Step 1 — App Shell & Flat Design System @s01", () => {
  test("S01-01: Bottom nav is visible with 5 tabs and sidebar is hidden [M]", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "web", "Mobile viewport only");

    await page.goto("/");
    await expect(page.locator('[data-testid="bottom-nav"]')).toBeVisible();

    const tabs = ["trans", "stats", "budget", "accounts", "more"];
    for (const tab of tabs) {
      await expect(page.locator(`[data-testid="bottom-nav-${tab}"]`)).toBeVisible();
    }

    await expect(page.locator('[data-testid="sidebar"]')).toBeHidden();
  });

  test("S01-02: Sidebar is visible and collapsible; bottom nav is hidden; collapse state persists after reload [W]", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "web", "Web desktop viewport only");

    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible();
    await expect(page.locator('[data-testid="bottom-nav"]')).toBeHidden();

    // Initially expanded
    await expect(sidebar).toHaveAttribute("data-collapsed", "false");

    // Collapse sidebar
    await page.locator('[data-testid="sidebar-toggle"]').click();
    await expect(sidebar).toHaveAttribute("data-collapsed", "true");

    // Persists across reload
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-testid="sidebar"]')).toHaveAttribute(
      "data-collapsed",
      "true",
      { timeout: 10000 }
    );

    // Expand back
    await page.locator('[data-testid="sidebar-toggle"]').click();
    await expect(page.locator('[data-testid="sidebar"]')).toHaveAttribute(
      "data-collapsed",
      "false",
      { timeout: 10000 }
    );
  });

  test("S01-03: app.go(tab) reaches each of Trans., Stats, Budget, Accounts, More; active item is highlighted", async ({
    page,
    app,
  }, testInfo) => {
    const isMobile = testInfo.project.name !== "web";
    await page.goto("/");

    const destinations: { id: NavDestination; pathRegex: RegExp }[] = [
      { id: "stats", pathRegex: /\/stats$/ },
      { id: "budget", pathRegex: /\/budget$/ },
      { id: "accounts", pathRegex: /\/accounts$/ },
      { id: "more", pathRegex: /\/more$/ },
      { id: "trans", pathRegex: /\/$/ },
    ];

    for (const dest of destinations) {
      await app.go(dest.id);
      await expect(page).toHaveURL(dest.pathRegex);

      const navSelector = isMobile
        ? `[data-testid="bottom-nav-${dest.id}"]`
        : `[data-testid="sidebar-nav-${dest.id}"]`;

      await expect(page.locator(navSelector)).toHaveAttribute("data-active", "true");
    }
  });

  test("S01-04: Each page shows its empty state and has exactly one <h1>", async ({
    page,
  }) => {
    const routes = ["/", "/stats", "/budget", "/accounts", "/more"];

    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator('[data-testid="empty-state"]')).toBeVisible();
    }
  });

  test("S01-05: Theme toggle switches light/dark; --bg computed value changes; preference persists after reload", async ({
    page,
  }) => {
    await page.goto("/");
    const themeToggle = page.locator('[data-testid="theme-toggle"]:visible');

    const getBgColor = async () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue("--bg").trim().toUpperCase()
      );

    const initialBg = await getBgColor();

    // Toggle theme
    await themeToggle.click();
    const toggledBg = await getBgColor();
    expect(toggledBg).not.toBe(initialBg);

    // Persists after reload
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const reloadedBg = await getBgColor();
    expect(reloadedBg).toBe(toggledBg);

    // Toggle back to clean up
    await page.locator('[data-testid="theme-toggle"]:visible').click();
  });

  test("S01-06: Income/expense color swap: the computed color of [data-testid=income-amount] swaps with expense", async ({
    page,
  }) => {
    await page.goto("/");
    const incomeAmount = page.locator('[data-testid="income-amount"]');
    const expenseAmount = page.locator('[data-testid="expense-amount"]');

    const initialIncomeColor = await incomeAmount.evaluate((el) => getComputedStyle(el).color);
    const initialExpenseColor = await expenseAmount.evaluate((el) => getComputedStyle(el).color);

    expect(initialIncomeColor).not.toBe(initialExpenseColor);

    // Toggle color swap
    const colorSwapToggle = page.locator('[data-testid="color-swap-toggle"]:visible');
    await colorSwapToggle.click();

    const swappedIncomeColor = await incomeAmount.evaluate((el) => getComputedStyle(el).color);
    const swappedExpenseColor = await expenseAmount.evaluate((el) => getComputedStyle(el).color);

    expect(swappedIncomeColor).toBe(initialExpenseColor);
    expect(swappedExpenseColor).toBe(initialIncomeColor);

    // Revert toggle
    await colorSwapToggle.click();
  });

  test("S01-07: Accessibility scan with @axe-core/playwright has no AA contrast violations in light and dark", async ({
    page,
  }) => {
    await page.goto("/");
    await page.locator('[data-testid="app-title"]').waitFor({ state: "visible" });

    // Scan light theme
    const lightScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(lightScan.violations).toEqual([]);

    // Switch to dark theme
    await page.locator('[data-testid="theme-toggle"]:visible').click();
    await page.waitForTimeout(300);

    // Scan dark theme
    const darkScan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(darkScan.violations).toEqual([]);

    // Revert
    await page.locator('[data-testid="theme-toggle"]:visible').click();
  });

  test("S01-08: Visual layout elements of the shell render flat without elevation shadows", async ({
    page,
  }) => {
    await page.goto("/");

    const summaryBar = page.locator('[data-testid="summary-bar"]');
    await expect(summaryBar).toBeVisible();

    const emptyState = page.locator('[data-testid="empty-state"]');
    await expect(emptyState).toBeVisible();

    // Flat design rule: cards have no box-shadow
    const boxShadow = await emptyState.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(boxShadow === "none" || boxShadow.includes("0px 0px 0px")).toBe(true);
  });

  test("S01-09: No horizontal scroll at 320 px width and at 1440 px", async ({ page }) => {
    // 320px width (minimum mobile screen size)
    await page.setViewportSize({ width: 320, height: 600 });
    await page.goto("/");
    const scrollWidth320 = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth320).toBeLessThanOrEqual(320);

    // 1440px width (desktop standard)
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const scrollWidth1440 = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth1440).toBeLessThanOrEqual(1440);
  });
});
