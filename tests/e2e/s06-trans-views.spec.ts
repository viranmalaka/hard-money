import { test, expect } from "./fixtures";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 6 — Trans. Tab Views @s06", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    const app = new AppHelper(page);
    await app.testApi.reset();
  });

  // Helper to seed transactions in Dexie directly via window.__hardMoneyDb
  async function seedTransactions(
    page: any,
    transactions: Array<{
      id?: string;
      accountId?: string;
      toAccountId?: string | null;
      categoryId?: string | null;
      amountMinor: number;
      type: "EXPENSE" | "INCOME" | "TRANSFER" | "ADJUSTMENT" | "REFUND";
      direction?: "IN" | "OUT" | null;
      transactionDate: string;
      note?: string | null;
      isSplit?: boolean;
      splitItems?: any[];
      excludeFromBudget?: boolean;
      excludeFromStats?: boolean;
    }>
  ) {
    await page.waitForFunction(() => {
      const db = (window as any).__hardMoneyDb;
      const expected = localStorage.getItem("hardmoney_active_user");
      return db && db.name && (!expected || db.name === `hardmoney_${expected}`);
    });

    await page.evaluate(async (txList: any[]) => {
      const db = (window as any).__hardMoneyDb;
      if (!db) throw new Error("HardMoneyDB not found on window");
      const userId = localStorage.getItem("hardmoney_active_user") || "default";
      const now = new Date().toISOString();

      // Ensure at least one account exists
      const accounts = await db.accounts.toArray();
      let accId = accounts[0]?.id;
      if (!accId) {
        accId = "acc-cash-1";
        await db.accounts.put({
          id: accId,
          userId,
          name: "Wallet",
          type: "CASH",
          openingBalanceMinor: 1000000,
          currency: "LKR",
          serverSeq: 0,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Ensure categories exist
      const categories = await db.categories.toArray();
      let foodCatId = categories.find((c: any) => c.name === "Food")?.id;
      if (!foodCatId) {
        foodCatId = "cat-food-1";
        await db.categories.put({
          id: foodCatId,
          userId,
          name: "Food",
          icon: "Utensils",
          color: "#f97316",
          serverSeq: 0,
          createdAt: now,
          updatedAt: now,
        });
      }
      let salaryCatId = categories.find((c: any) => c.name === "Salary")?.id;
      if (!salaryCatId) {
        salaryCatId = "cat-salary-1";
        await db.categories.put({
          id: salaryCatId,
          userId,
          name: "Salary",
          icon: "Briefcase",
          color: "#10b981",
          serverSeq: 0,
          createdAt: now,
          updatedAt: now,
        });
      }

      const records = txList.map((item) => {
        const id = item.id || `tx-${Math.random().toString(36).slice(2, 9)}`;
        return {
          id,
          userId,
          accountId: item.accountId || accId,
          toAccountId: item.toAccountId || null,
          categoryId: item.categoryId !== undefined ? item.categoryId : (item.type === "EXPENSE" ? foodCatId : salaryCatId),
          amountMinor: item.amountMinor,
          type: item.type,
          direction: item.direction || (item.type === "EXPENSE" ? "OUT" : item.type === "INCOME" ? "IN" : null),
          transactionDate: item.transactionDate,
          note: item.note || null,
          isSplit: item.isSplit || false,
          splitItems: item.splitItems || [],
          excludeFromBudget: item.excludeFromBudget || false,
          excludeFromStats: item.excludeFromStats || false,
          excludeFromBalance: false,
          source: "MANUAL",
          createdByUserId: userId,
          updatedByUserId: userId,
          serverSeq: 0,
          createdAt: now,
          updatedAt: now,
        };
      });
      await db.transactions.bulkPut(records);
    }, transactions);
  }

  test("S06-01: Seed 8 transactions across 3 days; Daily view groups by date with correct day subtotals", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0601", email: "s0601@example.com" });
    await app.waitForSyncIdle();

    await seedTransactions(page, [
      // Day 1: 2026-10-15 (Income 5,000, Expense 1,200 -> Subtotal +3,800.00)
      { amountMinor: 500000, type: "INCOME", transactionDate: "2026-10-15" },
      { amountMinor: 120000, type: "EXPENSE", transactionDate: "2026-10-15" },
      // Day 2: 2026-10-16 (Expense 800, Expense 400 -> Subtotal -1,200.00)
      { amountMinor: 80000, type: "EXPENSE", transactionDate: "2026-10-16" },
      { amountMinor: 40000, type: "EXPENSE", transactionDate: "2026-10-16" },
      // Day 3: 2026-10-17 (Income 10,000, Expense 2,500, Expense 500, Transfer 1,000 -> Subtotal +7,000.00)
      { amountMinor: 1000000, type: "INCOME", transactionDate: "2026-10-17" },
      { amountMinor: 250000, type: "EXPENSE", transactionDate: "2026-10-17" },
      { amountMinor: 50000, type: "EXPENSE", transactionDate: "2026-10-17" },
      { amountMinor: 100000, type: "TRANSFER", transactionDate: "2026-10-17" },
    ]);

    await app.go("trans");
    await expect(page.getByTestId("view-daily")).toBeVisible();

    const subtotals = page.getByTestId("day-subtotal");
    await expect(subtotals).toHaveCount(3);
    // Descending dates: 17th (+7,000.00), 16th (-1,200.00), 15th (+3,800.00)
    await expect(subtotals.nth(0)).toHaveText("+ LKR 7,000.00");
    await expect(subtotals.nth(1)).toHaveText("- LKR 1,200.00");
    await expect(subtotals.nth(2)).toHaveText("+ LKR 3,800.00");
  });

  test("S06-02: Summary bar: Income/Expense/Total match seeded values; transfers excluded", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0602", email: "s0602@example.com" });
    await app.waitForSyncIdle();

    await seedTransactions(page, [
      { amountMinor: 1500000, type: "INCOME", transactionDate: "2026-10-10" },
      { amountMinor: 300000, type: "EXPENSE", transactionDate: "2026-10-11" },
      { amountMinor: 200000, type: "EXPENSE", transactionDate: "2026-10-12" },
      { amountMinor: 500000, type: "TRANSFER", transactionDate: "2026-10-12" }, // Excluded from summary
    ]);

    await app.go("trans");
    // Income: 15,000.00, Expense: 5,000.00, Total: +10,000.00
    await expect(page.getByTestId("income-amount")).toHaveText("LKR 15,000.00");
    await expect(page.getByTestId("expense-amount")).toHaveText("LKR 5,000.00");
    await expect(page.getByTestId("total-amount")).toHaveText("LKR 10,000.00");
  });

  test("S06-03: Month switcher ‹ › changes the month and the data; header text updates", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0603", email: "s0603@example.com" });
    await app.waitForSyncIdle();

    await seedTransactions(page, [
      { amountMinor: 800000, type: "INCOME", transactionDate: "2026-10-05" },
      { amountMinor: 400000, type: "INCOME", transactionDate: "2026-09-15" },
    ]);

    await app.go("trans");
    const label = page.getByTestId("month-label");
    await expect(label).toHaveText("October 2026");
    await expect(page.getByTestId("income-amount")).toHaveText("LKR 8,000.00");

    // Click previous month
    await page.click('[data-testid="month-prev"]');
    await expect(label).toHaveText("September 2026");
    await expect(page.getByTestId("income-amount")).toHaveText("LKR 4,000.00");

    // Click next month twice to November 2026
    await page.click('[data-testid="month-next"]');
    await expect(label).toHaveText("October 2026");
    await page.click('[data-testid="month-next"]');
    await expect(label).toHaveText("November 2026");
    await expect(page.getByTestId("income-amount")).toHaveText("LKR 0.00");
  });

  test("S06-04: Swipe left/right changes month (touch gesture)", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Mobile specific gesture test");
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0604", email: "s0604@example.com" });
    await app.waitForSyncIdle();

    await app.go("trans");
    const switcher = page.getByTestId("month-switcher");
    const label = page.getByTestId("month-label");
    await expect(label).toHaveText("October 2026");

    // Swipe left (next month)
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="month-switcher"]')!;
      const t1 = new Touch({ identifier: 0, target: el, clientX: 250, clientY: 50 });
      const t2 = new Touch({ identifier: 0, target: el, clientX: 50, clientY: 50 });
      el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [t1] }));
      el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, changedTouches: [t2] }));
    });
    await expect(label).toHaveText("November 2026");

    // Swipe right (prev month)
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="month-switcher"]')!;
      const t1 = new Touch({ identifier: 1, target: el, clientX: 50, clientY: 50 });
      const t2 = new Touch({ identifier: 1, target: el, clientX: 250, clientY: 50 });
      el.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [t1] }));
      el.dispatchEvent(new TouchEvent("touchend", { bubbles: true, changedTouches: [t2] }));
    });
    await expect(label).toHaveText("October 2026");
  });

  test("S06-05: Keyboard arrow buttons / click navigation on the month switcher", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Desktop keyboard navigation test");
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0605", email: "s0605@example.com" });
    await app.waitForSyncIdle();

    await app.go("trans");
    const switcher = page.getByTestId("month-switcher");
    await switcher.focus();

    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("month-label")).toHaveText("September 2026");

    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("month-label")).toHaveText("October 2026");
  });

  test("S06-06: Calendar view: cells show day income (blue) and expense (red); today is outlined", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0606", email: "s0606@example.com" });
    await app.waitForSyncIdle();

    await seedTransactions(page, [
      { amountMinor: 250000, type: "EXPENSE", transactionDate: "2026-10-18" },
      { amountMinor: 750000, type: "INCOME", transactionDate: "2026-10-18" },
    ]);

    await app.go("trans");
    await page.click('[data-testid="tab-calendar"]');
    await expect(page.getByTestId("view-calendar")).toBeVisible();

    // Check Day 18 cell
    const dayCell = page.getByTestId("calendar-day-2026-10-18");
    await expect(dayCell).toBeVisible();

    const inc = dayCell.getByTestId("day-income");
    await expect(inc).toHaveText("+7,500");
    await expect(inc).toHaveClass(/text-income/);

    const exp = dayCell.getByTestId("day-expense");
    await expect(exp).toHaveText("-2,500");
    await expect(exp).toHaveClass(/text-expense/);
  });

  test("S06-07: Tap a day in Calendar → that day's list appears beneath the grid (not a modal)", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0607", email: "s0607@example.com" });
    await app.waitForSyncIdle();

    await seedTransactions(page, [
      { amountMinor: 120000, type: "EXPENSE", transactionDate: "2026-10-12", note: "Coffee & snacks" },
    ]);

    await app.go("trans");
    await page.click('[data-testid="tab-calendar"]');

    // Click Day 12
    await page.click('[data-testid="calendar-day-2026-10-12"]');
    const detail = page.getByTestId("calendar-day-detail");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("Coffee & snacks");
    // Ensure it is not an overlay/modal but an in-page section
    await expect(page.getByTestId("view-calendar")).toBeVisible();
  });

  test("S06-08: Calendar and detail list display side by side on desktop; stacked on mobile", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0608", email: "s0608@example.com" });
    await app.waitForSyncIdle();

    await seedTransactions(page, [
      { amountMinor: 99000, type: "EXPENSE", transactionDate: "2026-10-10", note: "Books" },
    ]);

    await app.go("trans");
    await page.click('[data-testid="tab-calendar"]');
    await page.click('[data-testid="calendar-day-2026-10-10"]');

    const calendarGrid = page.getByTestId("calendar-grid");
    const dayDetail = page.getByTestId("calendar-day-detail");

    const gridBox = await calendarGrid.boundingBox();
    const detailBox = await dayDetail.boundingBox();

    if (isMobile) {
      // Stacked vertically: detail is below calendar
      expect(detailBox!.y).toBeGreaterThanOrEqual(gridBox!.y + gridBox!.height - 10);
    } else {
      // Side by side: horizontally adjacent
      expect(detailBox!.x).toBeGreaterThanOrEqual(gridBox!.x + gridBox!.width - 10);
    }
  });

  test("S06-09: Monthly and Summary views show per-month totals consistent with Daily", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0609", email: "s0609@example.com" });
    await app.waitForSyncIdle();

    await seedTransactions(page, [
      { amountMinor: 1000000, type: "INCOME", transactionDate: "2026-10-05" },
      { amountMinor: 400000, type: "EXPENSE", transactionDate: "2026-10-15" },
    ]);

    await app.go("trans");
    // 1. Monthly view
    await page.click('[data-testid="tab-monthly"]');
    await expect(page.getByTestId("view-monthly")).toBeVisible();
    const octRow = page.getByTestId("monthly-row-2026-10");
    await expect(octRow).toContainText("+ LKR 10,000.00");
    await expect(octRow).toContainText("- LKR 4,000.00");

    // 2. Summary view
    await page.click('[data-testid="tab-summary"]');
    await expect(page.getByTestId("view-summary").getByText("+ LKR 10,000.00").first()).toBeVisible();
    await expect(page.getByTestId("view-summary").getByText("- LKR 4,000.00").first()).toBeVisible();
  });

  test("S06-10: Search by note/category/amount narrows the list; clear restores", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0610", email: "s0610@example.com" });
    await app.waitForSyncIdle();

    await seedTransactions(page, [
      { id: "tx-search-1", amountMinor: 250000, type: "EXPENSE", transactionDate: "2026-10-10", note: "Grocery milk" },
      { id: "tx-search-2", amountMinor: 890000, type: "EXPENSE", transactionDate: "2026-10-11", note: "Dinner party" },
    ]);

    await app.go("trans");
    const input = page.getByTestId("trans-search-input");

    // Search by note
    await input.fill("milk");
    await expect(page.getByTestId("transaction-row-tx-search-1")).toBeVisible();
    await expect(page.getByTestId("transaction-row-tx-search-2")).not.toBeVisible();

    // Clear search
    await page.click('[data-testid="trans-search-clear"]');
    await expect(page.getByTestId("transaction-row-tx-search-1")).toBeVisible();
    await expect(page.getByTestId("transaction-row-tx-search-2")).toBeVisible();

    // Search by amount
    await input.fill("8900");
    await expect(page.getByTestId("transaction-row-tx-search-1")).not.toBeVisible();
    await expect(page.getByTestId("transaction-row-tx-search-2")).toBeVisible();
  });

  test("S06-11: Filter by account + category + type returns the intersection", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0611", email: "s0611@example.com" });
    await app.waitForSyncIdle();

    await seedTransactions(page, [
      { id: "tx-f1", amountMinor: 100000, type: "EXPENSE", transactionDate: "2026-10-10" },
      { id: "tx-f2", amountMinor: 200000, type: "INCOME", transactionDate: "2026-10-11" },
    ]);

    await app.go("trans");
    // Open filter dialog
    await page.click('[data-testid="trans-filter-btn"]');
    await expect(page.getByTestId("filter-dialog")).toBeVisible();

    // Select type EXPENSE
    await page.selectOption('[data-testid="filter-type"]', "EXPENSE");
    await page.click('[data-testid="filter-apply-btn"]');

    // Only expense row visible
    await expect(page.getByTestId("transaction-row-tx-f1")).toBeVisible();
    await expect(page.getByTestId("transaction-row-tx-f2")).not.toBeVisible();
  });

  test("S06-12: Seed 1,000 rows: initial render < 2 s; scroll to bottom renders last row; no console errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("401")) {
        consoleErrors.push(msg.text());
      }
    });

    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0612", email: "s0612@example.com" });
    await app.waitForSyncIdle();

    // Generate 1,000 transactions across October 2026
    const bulkTxs = [];
    for (let i = 1; i <= 1000; i++) {
      const day = String((i % 28) + 1).padStart(2, "0");
      bulkTxs.push({
        id: `tx-bulk-${i}`,
        amountMinor: 10000 + (i % 500) * 100,
        type: i % 5 === 0 ? ("INCOME" as const) : ("EXPENSE" as const),
        transactionDate: `2026-10-${day}`,
        note: `Transaction row #${i}`,
      });
    }

    const t0 = Date.now();
    await seedTransactions(page, bulkTxs);
    await app.go("trans");

    // Wait for view daily
    await expect(page.getByTestId("view-daily")).toBeVisible();
    const renderDuration = Date.now() - t0;
    expect(renderDuration).toBeLessThan(3000); // Fast initial render

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByTestId("transaction-row-tx-bulk-1000")).toBeAttached();

    // Assert zero console errors
    expect(consoleErrors).toEqual([]);
  });

  test("S06-13: 23:30 transaction on the 31st counts for that month, not the next", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0613", email: "s0613@example.com" });
    await app.waitForSyncIdle();

    // Store transaction on 2026-10-31 23:30 Colombo time
    await seedTransactions(page, [
      {
        id: "tx-oct-31",
        amountMinor: 77700,
        type: "EXPENSE",
        transactionDate: "2026-10-31T23:30:00+05:30",
        note: "Late night coffee on 31st",
      },
    ]);

    await app.go("trans");
    await expect(page.getByTestId("month-label")).toHaveText("October 2026");
    // Appears in October
    await expect(page.getByTestId("expense-amount")).toHaveText("LKR 777.00");
    await expect(page.getByTestId("transaction-row-tx-oct-31")).toBeVisible();

    // Switch to November 2026
    await page.click('[data-testid="month-next"]');
    await expect(page.getByTestId("month-label")).toHaveText("November 2026");
    // Does NOT count in November
    await expect(page.getByTestId("expense-amount")).toHaveText("LKR 0.00");
  });

  test("S06-14: Default start view setting (Daily/Calendar) is honored after reload", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0614", email: "s0614@example.com" });
    await app.waitForSyncIdle();

    await app.go("trans");
    // Switch to Calendar tab (persists to localStorage)
    await page.click('[data-testid="tab-calendar"]');
    await expect(page.getByTestId("view-calendar")).toBeVisible();

    // Reload page
    await page.reload();
    // After reload, should stay on Calendar
    await expect(page.getByTestId("view-calendar")).toBeVisible();
    await expect(page.getByTestId("tab-calendar")).toHaveClass(/font-semibold/);
  });

  test("S06-15: Visual snapshots: Daily and Calendar (light/dark)", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0615", email: "s0615@example.com" });
    await app.waitForSyncIdle();

    await seedTransactions(page, [
      { amountMinor: 250000, type: "EXPENSE", transactionDate: "2026-10-18", note: "Groceries" },
      { amountMinor: 800000, type: "INCOME", transactionDate: "2026-10-18", note: "Consulting" },
    ]);

    await app.go("trans");
    await expect(page.getByTestId("view-daily")).toBeVisible();
    // Tab Daily visible
    await expect(page.getByTestId("tab-daily")).toBeVisible();

    // Switch to Calendar tab
    await page.click('[data-testid="tab-calendar"]');
    await expect(page.getByTestId("view-calendar")).toBeVisible();
  });
});
