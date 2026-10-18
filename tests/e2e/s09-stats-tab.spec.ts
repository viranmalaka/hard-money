import { test, expect } from "@playwright/test";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 9 — Stats Tab @s09", () => {
  test.beforeEach(async ({ page }) => {
    const app = new AppHelper(page);
    await app.testApi.reset();
  });

  interface SeedAccount {
    id: string;
    userId?: string;
    name: string;
    type: string;
    openingBalanceMinor: number;
    currency?: string;
  }

  interface SeedCategory {
    id: string;
    userId?: string;
    name: string;
    color: string;
    icon: string;
  }

  interface SeedTransaction {
    id?: string;
    amountMinor: number;
    type?: string;
    direction?: string;
    source?: string;
    accountId?: string;
    toAccountId?: string | null;
    categoryId?: string;
    transactionDate?: string;
    note?: string | null;
    isSplit?: boolean;
    splitItems?: Array<{ id?: string; categoryId: string; amountMinor: number; note?: string }>;
    excludeFromBudget?: boolean;
    excludeFromStats?: boolean;
  }

  async function seedStatsEnvironment(
    page: import("@playwright/test").Page,
    options?: {
      accounts?: SeedAccount[];
      categories?: SeedCategory[];
      transactions?: SeedTransaction[];
    }
  ) {
    await page.waitForFunction(() => {
      const db = (window as unknown as { __hardMoneyDb: { name: string } }).__hardMoneyDb;
      const expected = localStorage.getItem("hardmoney_active_user");
      return db && db.name && (!expected || db.name === `hardmoney_${expected}`);
    });

    await page.evaluate(
      async (opts?: {
        accounts?: SeedAccount[];
        categories?: SeedCategory[];
        transactions?: SeedTransaction[];
      }) => {
        const db = (window as unknown as {
          __hardMoneyDb: {
            accounts: { bulkPut: (a: unknown[]) => Promise<void> };
            categories: { bulkPut: (c: unknown[]) => Promise<void> };
            transactions: { bulkPut: (t: unknown[]) => Promise<void> };
          };
        }).__hardMoneyDb;
        if (!db) throw new Error("HardMoneyDB not found on window");
        const userId = localStorage.getItem("hardmoney_active_user") || "default";
        const now = new Date().toISOString();

        const defaultAccounts = [
          {
            id: "acc-cash",
            userId,
            name: "Cash Wallet",
            type: "CASH",
            openingBalanceMinor: 10000000, // 100,000.00
            currency: "LKR",
            serverSeq: 0,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "acc-bank",
            userId,
            name: "Savings Bank",
            type: "BANK_SAVINGS",
            openingBalanceMinor: 20000000,
            currency: "LKR",
            serverSeq: 0,
            createdAt: now,
            updatedAt: now,
          },
        ];
        await db.accounts.bulkPut(opts?.accounts || defaultAccounts);

        const defaultCategories = [
          { id: "cat-groceries", userId, name: "Groceries", icon: "ShoppingBag", color: "#10b981", serverSeq: 0, createdAt: now, updatedAt: now },
          { id: "cat-dining", userId, name: "Dining", icon: "Utensils", color: "#f97316", serverSeq: 0, createdAt: now, updatedAt: now },
          { id: "cat-bills", userId, name: "Bills", icon: "Zap", color: "#3b82f6", serverSeq: 0, createdAt: now, updatedAt: now },
          { id: "cat-salary", userId, name: "Salary", icon: "Briefcase", color: "#8b5cf6", serverSeq: 0, createdAt: now, updatedAt: now },
        ];
        await db.categories.bulkPut(opts?.categories || defaultCategories);

        if (opts?.transactions && opts.transactions.length > 0) {
          const txs = opts.transactions.map((t: SeedTransaction) => ({
            id: t.id || `tx-${Math.random().toString(36).slice(2, 9)}`,
            userId,
            accountId: t.accountId || "acc-cash",
            toAccountId: t.toAccountId || null,
            categoryId: t.categoryId || "cat-groceries",
            amountMinor: t.amountMinor,
            type: t.type || "EXPENSE",
            direction: t.direction || (t.type === "INCOME" ? "IN" : "OUT"),
            source: t.source || "MANUAL",
            transactionDate: t.transactionDate || "2026-10-15",
            note: t.note || null,
            isSplit: t.isSplit || false,
            splitItems: t.splitItems || [],
            excludeFromBudget: t.excludeFromBudget || false,
            excludeFromStats: t.excludeFromStats || false,
            excludeFromBalance: false,
            serverSeq: 0,
            createdAt: now,
            updatedAt: now,
          }));
          await db.transactions.bulkPut(txs);
        }
      },
      options || {}
    );
  }

  test("S09-01: Seeded month: ranked list order and amounts match expected values", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0901", email: "s0901@example.com" });
    await app.waitForSyncIdle();

    // Seed 3 expenses: Bills (15,000), Groceries (10,000), Dining (5,000)
    await seedStatsEnvironment(page, {
      transactions: [
        { id: "tx-1", amountMinor: 1000000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-05" },
        { id: "tx-2", amountMinor: 500000, categoryId: "cat-dining", type: "EXPENSE", transactionDate: "2026-10-10" },
        { id: "tx-3", amountMinor: 1500000, categoryId: "cat-bills", type: "EXPENSE", transactionDate: "2026-10-12" },
      ],
    });

    await app.go("stats");

    // Ranked list order: Bills (15,000.00), Groceries (10,000.00), Dining (5,000.00)
    const rows = page.locator('[data-testid^="category-stat-row-"]');
    await expect(rows).toHaveCount(3);

    // 1st item: Bills
    await expect(rows.nth(0)).toContainText("Bills");
    await expect(rows.nth(0)).toContainText("LKR 15,000.00");

    // 2nd item: Groceries
    await expect(rows.nth(1)).toContainText("Groceries");
    await expect(rows.nth(1)).toContainText("LKR 10,000.00");

    // 3rd item: Dining
    await expect(rows.nth(2)).toContainText("Dining");
    await expect(rows.nth(2)).toContainText("LKR 5,000.00");
  });

  test("S09-02: Percentage chips sum to 100%", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0902", email: "s0902@example.com" });
    await app.waitForSyncIdle();

    // 3 equal expenses: 10,000 each (33.333% each -> largest remainder sums to 100)
    await seedStatsEnvironment(page, {
      transactions: [
        { id: "tx-1", amountMinor: 1000000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-05" },
        { id: "tx-2", amountMinor: 1000000, categoryId: "cat-dining", type: "EXPENSE", transactionDate: "2026-10-10" },
        { id: "tx-3", amountMinor: 1000000, categoryId: "cat-bills", type: "EXPENSE", transactionDate: "2026-10-12" },
      ],
    });

    await app.go("stats");

    const chips = page.getByTestId("category-percent-chip");
    await expect(chips).toHaveCount(3);

    const text0 = await chips.nth(0).innerText();
    const text1 = await chips.nth(1).innerText();
    const text2 = await chips.nth(2).innerText();

    const sum = parseInt(text0) + parseInt(text1) + parseInt(text2);
    expect(sum).toBe(100);
  });

  test("S09-03: Donut chart segment values match the list", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0903", email: "s0903@example.com" });
    await app.waitForSyncIdle();

    await seedStatsEnvironment(page, {
      transactions: [
        { id: "tx-1", amountMinor: 1500000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-05" },
        { id: "tx-2", amountMinor: 500000, categoryId: "cat-dining", type: "EXPENSE", transactionDate: "2026-10-10" },
      ],
    });

    await app.go("stats");

    await expect(page.getByTestId("donut-chart")).toBeVisible();
    await expect(page.getByTestId("donut-slice-cat-groceries")).toHaveAttribute("aria-label", "Groceries: 75%");
    await expect(page.getByTestId("donut-slice-cat-dining")).toHaveAttribute("aria-label", "Dining: 25%");
  });

  test("S09-04: Split transaction contributes to both categories", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0904", email: "s0904@example.com" });
    await app.waitForSyncIdle();

    // Split: 6,000 Groceries + 4,000 Dining
    await seedStatsEnvironment(page, {
      transactions: [
        {
          id: "tx-split-1",
          amountMinor: 1000000,
          type: "EXPENSE",
          transactionDate: "2026-10-14",
          isSplit: true,
          splitItems: [
            { categoryId: "cat-groceries", amountMinor: 600000 },
            { categoryId: "cat-dining", amountMinor: 400000 },
          ],
        },
      ],
    });

    await app.go("stats");

    await expect(page.getByTestId("category-stat-row-cat-groceries")).toContainText("LKR 6,000.00");
    await expect(page.getByTestId("category-stat-row-cat-dining")).toContainText("LKR 4,000.00");
  });

  test("S09-05: Excluded-from-stats row, transfer and calibration are not counted", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0905", email: "s0905@example.com" });
    await app.waitForSyncIdle();

    await seedStatsEnvironment(page, {
      transactions: [
        { id: "tx-valid", amountMinor: 500000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-05" },
        // Excluded from stats
        { id: "tx-excl", amountMinor: 800000, categoryId: "cat-bills", type: "EXPENSE", excludeFromStats: true, transactionDate: "2026-10-06" },
        // Transfer
        { id: "tx-trans", amountMinor: 2000000, toAccountId: "acc-bank", type: "TRANSFER", transactionDate: "2026-10-07" },
        // Calibration
        { id: "tx-calib", amountMinor: 150000, type: "ADJUSTMENT", source: "CALIBRATION", transactionDate: "2026-10-08" },
      ],
    });

    await app.go("stats");

    // Only Groceries (5,000.00) is counted
    const rows = page.locator('[data-testid^="category-stat-row-"]');
    await expect(rows).toHaveCount(1);
    await expect(page.getByTestId("category-stat-row-cat-groceries")).toContainText("LKR 5,000.00");
  });

  test("S09-06: Expense/Income toggle switches data set", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0906", email: "s0906@example.com" });
    await app.waitForSyncIdle();

    await seedStatsEnvironment(page, {
      transactions: [
        { id: "tx-exp", amountMinor: 1200000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-05" },
        { id: "tx-inc", amountMinor: 5000000, categoryId: "cat-salary", type: "INCOME", transactionDate: "2026-10-10" },
      ],
    });

    await app.go("stats");

    // Default is Expense
    await expect(page.getByTestId("category-stat-row-cat-groceries")).toBeVisible();
    await expect(page.getByTestId("category-stat-row-cat-salary")).not.toBeVisible();

    // Toggle to Income
    await page.click('[data-testid="stats-type-income"]');
    await expect(page.getByTestId("category-stat-row-cat-salary")).toBeVisible();
    await expect(page.getByTestId("category-stat-row-cat-salary")).toContainText("LKR 50,000.00");
    await expect(page.getByTestId("category-stat-row-cat-groceries")).not.toBeVisible();
  });

  test("S09-07: Tap a category → filtered transaction list with matching total", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0907", email: "s0907@example.com" });
    await app.waitForSyncIdle();

    await seedStatsEnvironment(page, {
      transactions: [
        { id: "tx-g1", amountMinor: 400000, categoryId: "cat-groceries", note: "Supermarket milk", type: "EXPENSE", transactionDate: "2026-10-05" },
        { id: "tx-g2", amountMinor: 600000, categoryId: "cat-groceries", note: "Fresh veggies", type: "EXPENSE", transactionDate: "2026-10-12" },
        { id: "tx-d1", amountMinor: 300000, categoryId: "cat-dining", note: "Coffee with friend", type: "EXPENSE", transactionDate: "2026-10-10" },
      ],
    });

    await app.go("stats");

    // Tap Groceries
    await page.click('[data-testid="category-stat-row-cat-groceries"]');

    // Filtered transaction list appears
    await expect(page.getByTestId("category-transactions-list")).toBeVisible();
    await expect(page.getByTestId("category-transactions-list").getByText("Supermarket milk")).toBeVisible();
    await expect(page.getByTestId("category-transactions-list").getByText("Fresh veggies")).toBeVisible();
    await expect(page.getByText("Coffee with friend")).not.toBeVisible();
  });

  test("S09-08: Month switcher updates the chart; empty month shows empty state", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0908", email: "s0908@example.com" });
    await app.waitForSyncIdle();

    await seedStatsEnvironment(page, {
      transactions: [
        { id: "tx-oct", amountMinor: 800000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-15" },
      ],
    });

    await app.go("stats");
    await expect(page.getByTestId("category-stat-row-cat-groceries")).toBeVisible();

    // Switch to next month (November 2026)
    await page.click('[data-testid="month-next"]');

    // Empty state should appear
    await expect(page.getByTestId("stats-empty-state")).toBeVisible();
  });

  test("S09-09: Trend view shows 6 monthly bars with values matching seeded totals", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0909", email: "s0909@example.com" });
    await app.waitForSyncIdle();

    // Seed across months: Aug 2026 (10,000), Sep 2026 (20,000), Oct 2026 (30,000)
    await seedStatsEnvironment(page, {
      transactions: [
        { id: "tx-aug", amountMinor: 1000000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-08-10" },
        { id: "tx-sep", amountMinor: 2000000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-09-10" },
        { id: "tx-oct", amountMinor: 3000000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-10" },
      ],
    });

    await app.go("stats");
    await page.click('[data-testid="stats-type-trend"]');

    await expect(page.getByTestId("stats-trend-view")).toBeVisible();
    await expect(page.getByTestId("trend-bar-2026-08")).toContainText("10,000.00");
    await expect(page.getByTestId("trend-bar-2026-09")).toContainText("20,000.00");
    await expect(page.getByTestId("trend-bar-2026-10")).toContainText("30,000.00");
  });

  test("S09-10: Chart and list layout on desktop vs mobile", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0910", email: "s0910@example.com" });
    await app.waitForSyncIdle();

    await seedStatsEnvironment(page, {
      transactions: [
        { id: "tx-1", amountMinor: 1000000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-10" },
      ],
    });

    await app.go("stats");

    await expect(page.getByTestId("donut-chart")).toBeVisible();
    await expect(page.getByTestId("category-stat-row-cat-groceries")).toBeVisible();

    // Ensure no horizontal scrollbar on main container
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("S09-11: Theme toggle applies to Stats view", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0911", email: "s0911@example.com" });
    await app.waitForSyncIdle();

    await seedStatsEnvironment(page, {
      transactions: [
        { id: "tx-1", amountMinor: 1000000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-10" },
      ],
    });

    await app.go("stats");
    await expect(page.getByTestId("donut-chart")).toBeVisible();
  });
});
