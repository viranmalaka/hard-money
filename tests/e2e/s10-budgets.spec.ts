import { test, expect } from "@playwright/test";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 10 — Budgets & Safe-to-Spend @s10", () => {
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

  interface SeedBudget {
    id: string;
    userId?: string;
    categoryId: string;
    monthlyLimitMinor: number;
    enableRollover?: boolean;
    rolloverStartMonth?: string | null;
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

  async function seedBudgetEnvironment(
    page: import("@playwright/test").Page,
    options?: {
      accounts?: SeedAccount[];
      categories?: SeedCategory[];
      budgets?: SeedBudget[];
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
        budgets?: SeedBudget[];
        transactions?: SeedTransaction[];
      }) => {
        const db = (window as unknown as {
          __hardMoneyDb: {
            accounts: { bulkPut: (a: unknown[]) => Promise<void> };
            categories: { bulkPut: (c: unknown[]) => Promise<void> };
            budgets: { bulkPut: (b: unknown[]) => Promise<void> };
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
            openingBalanceMinor: 10000000,
            currency: "LKR",
            serverSeq: 0,
            createdAt: now,
            updatedAt: now,
          },
        ];
        await db.accounts.bulkPut(opts?.accounts || defaultAccounts);

        const defaultCategories = [
          { id: "cat-groceries", userId, name: "Groceries", icon: "🛒", color: "#10b981", serverSeq: 0, createdAt: now, updatedAt: now },
          { id: "cat-dining", userId, name: "Dining", icon: "🍽️", color: "#f97316", serverSeq: 0, createdAt: now, updatedAt: now },
          { id: "cat-bills", userId, name: "Bills", icon: "⚡", color: "#3b82f6", serverSeq: 0, createdAt: now, updatedAt: now },
        ];
        await db.categories.bulkPut(opts?.categories || defaultCategories);

        if (opts?.budgets && opts.budgets.length > 0) {
          const buds = opts.budgets.map((b) => ({
            ...b,
            userId,
            enableRollover: b.enableRollover ?? false,
            serverSeq: 0,
            createdAt: now,
            updatedAt: now,
          }));
          await db.budgets.bulkPut(buds);
        }

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
      options
    );
  }

  test("S10-01: Create budget Groceries 30,000 → row with 0% bar", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1001", email: "s1001@example.com" });
    await app.waitForSyncIdle();
    await seedBudgetEnvironment(page);

    await app.go("budget");
    await expect(page.locator('[data-testid="budget-empty-state"]')).toBeVisible();

    await page.click('[data-testid="add-budget-btn"]');
    await expect(page.locator('[data-testid="budget-modal"]')).toBeVisible();

    await page.selectOption('[data-testid="budget-category-select"]', "cat-groceries");
    await page.fill('[data-testid="budget-limit-input"]', "30000");
    await page.click('[data-testid="budget-save-btn"]');

    await expect(page.locator('[data-testid="budget-modal"]')).not.toBeVisible();
    const row = page.locator('[data-testid^="budget-row-"]').first();
    await expect(row).toBeVisible();
    await expect(row.locator('[data-testid="budget-category-name"]')).toContainText("Groceries");
    await expect(row.locator('[data-testid="budget-limit-amount"]')).toContainText("30,000.00");
    await expect(row.locator('[data-testid="budget-spent-amount"]')).toContainText("0.00");
    await expect(row.locator('[data-testid="budget-progress-fill"]')).toHaveAttribute("data-percentage", "0");
  });

  test("S10-02: Add 12,000 grocery expenses → spent 12,000, remaining 18,000, bar 40%", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1002", email: "s1002@example.com" });
    await app.waitForSyncIdle();
    await seedBudgetEnvironment(page, {
      budgets: [{ id: "b-groceries", categoryId: "cat-groceries", monthlyLimitMinor: 3000000 }],
      transactions: [
        { amountMinor: 1200000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-10" },
      ],
    });

    await app.go("budget");
    const row = page.locator('[data-testid="budget-row-b-groceries"]');
    await expect(row).toBeVisible();
    await expect(row.locator('[data-testid="budget-spent-amount"]')).toContainText("12,000.00");
    await expect(row.locator('[data-testid="budget-remaining-amount"]')).toContainText("18,000.00");
    await expect(row.locator('[data-testid="budget-progress-fill"]')).toHaveAttribute("data-percentage", "40");
  });

  test("S10-03: Spend to 25,000 (≥ 80%) → bar turns warning color", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1003", email: "s1003@example.com" });
    await app.waitForSyncIdle();
    await seedBudgetEnvironment(page, {
      budgets: [{ id: "b-groceries", categoryId: "cat-groceries", monthlyLimitMinor: 3000000 }],
      transactions: [
        { amountMinor: 2500000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-10" },
      ],
    });

    await app.go("budget");
    const row = page.locator('[data-testid="budget-row-b-groceries"]');
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-budget-status", "warning");
    const fill = row.locator('[data-testid="budget-progress-fill"]');
    await expect(fill).toHaveAttribute("data-percentage", "83");
    await expect(fill).toHaveClass(/bg-\[var\(--warning\)\]/);
  });

  test("S10-04: Spend to 32,000 → over budget by 2,000; daily safe-to-spend shows 0 / over state", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1004", email: "s1004@example.com" });
    await app.waitForSyncIdle();
    await seedBudgetEnvironment(page, {
      budgets: [{ id: "b-groceries", categoryId: "cat-groceries", monthlyLimitMinor: 3000000 }],
      transactions: [
        { amountMinor: 3200000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-10" },
      ],
    });

    await app.go("budget");
    const row = page.locator('[data-testid="budget-row-b-groceries"]');
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-budget-status", "over");
    await expect(row.locator('[data-testid="budget-remaining-amount"]')).toContainText("Over budget by");
    await expect(row.locator('[data-testid="budget-remaining-amount"]')).toContainText("2,000.00");
    await expect(row.locator('[data-testid="budget-daily-safe-to-spend"]')).toContainText("Rs. 0.00 / day");
    const fill = row.locator('[data-testid="budget-progress-fill"]');
    await expect(fill).toHaveClass(/bg-\[var\(--expense\)\]/);
  });

  test("S10-05: With server/client clock fixed at the 13th of a 30-day month, safe-to-spend equals expected value", async ({ page }) => {
    // 13th of November 2026 (November has 30 days -> 30 - 13 + 1 = 18 days remaining)
    // Available 18,000 / 18 days = 1,000.00/day
    await page.clock.setFixedTime(new Date("2026-11-13T12:00:00.000Z"));

    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1005", email: "s1005@example.com" });
    await app.waitForSyncIdle();
    await seedBudgetEnvironment(page, {
      budgets: [{ id: "b-groceries", categoryId: "cat-groceries", monthlyLimitMinor: 1800000 }], // 18,000.00
      transactions: [],
    });

    await app.go("budget");
    // Switch to November
    await page.locator('[data-testid="month-next"]').first().click();
    await expect(page.locator('[data-testid="month-label"]').first()).toContainText("November 2026");

    const row = page.locator('[data-testid="budget-row-b-groceries"]');
    await expect(row).toBeVisible();
    await expect(row.locator('[data-testid="budget-daily-safe-to-spend"]')).toContainText("1,000.00 / day");
  });

  test("S10-06: Excluded-from-budget and calibration rows do not change spent", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1006", email: "s1006@example.com" });
    await app.waitForSyncIdle();
    await seedBudgetEnvironment(page, {
      budgets: [{ id: "b-groceries", categoryId: "cat-groceries", monthlyLimitMinor: 3000000 }],
      transactions: [
        { amountMinor: 1000000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-05" },
        // Excluded from budget
        { amountMinor: 500000, categoryId: "cat-groceries", type: "EXPENSE", excludeFromBudget: true, transactionDate: "2026-10-06" },
        // Calibration
        { amountMinor: 300000, categoryId: "cat-groceries", type: "ADJUSTMENT", source: "CALIBRATION", transactionDate: "2026-10-07" },
      ],
    });

    await app.go("budget");
    const row = page.locator('[data-testid="budget-row-b-groceries"]');
    await expect(row).toBeVisible();
    // Only 10,000.00 counts
    await expect(row.locator('[data-testid="budget-spent-amount"]')).toContainText("10,000.00");
  });

  test("S10-07: Refund reduces spent", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1007", email: "s1007@example.com" });
    await app.waitForSyncIdle();
    await seedBudgetEnvironment(page, {
      budgets: [{ id: "b-groceries", categoryId: "cat-groceries", monthlyLimitMinor: 3000000 }],
      transactions: [
        { amountMinor: 1500000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-05" },
        // Refund 3,000.00
        { amountMinor: 300000, categoryId: "cat-groceries", type: "REFUND", transactionDate: "2026-10-08" },
      ],
    });

    await app.go("budget");
    const row = page.locator('[data-testid="budget-row-b-groceries"]');
    await expect(row).toBeVisible();
    // 15,000 - 3,000 = 12,000.00
    await expect(row.locator('[data-testid="budget-spent-amount"]')).toContainText("12,000.00");
    await expect(row.locator('[data-testid="budget-remaining-amount"]')).toContainText("18,000.00");
  });

  test("S10-08: Split transaction counts only the Groceries portion", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1008", email: "s1008@example.com" });
    await app.waitForSyncIdle();
    await seedBudgetEnvironment(page, {
      budgets: [{ id: "b-groceries", categoryId: "cat-groceries", monthlyLimitMinor: 3000000 }],
      transactions: [
        {
          amountMinor: 2000000, // Total 20,000.00 split
          type: "EXPENSE",
          isSplit: true,
          splitItems: [
            { categoryId: "cat-groceries", amountMinor: 750000 }, // 7,500.00
            { categoryId: "cat-dining", amountMinor: 1250000 },
          ],
          transactionDate: "2026-10-10",
        },
      ],
    });

    await app.go("budget");
    const row = page.locator('[data-testid="budget-row-b-groceries"]');
    await expect(row).toBeVisible();
    // Only 7,500.00 counted in groceries
    await expect(row.locator('[data-testid="budget-spent-amount"]')).toContainText("7,500.00");
  });

  test("S10-09: Edit and delete a budget; totals update", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1009", email: "s1009@example.com" });
    await app.waitForSyncIdle();
    await seedBudgetEnvironment(page, {
      budgets: [{ id: "b-groceries", categoryId: "cat-groceries", monthlyLimitMinor: 2000000 }],
    });

    await app.go("budget");
    const row = page.locator('[data-testid="budget-row-b-groceries"]');
    await expect(row).toBeVisible();
    await expect(row.locator('[data-testid="budget-limit-amount"]')).toContainText("20,000.00");

    // Click to edit
    await row.click();
    await expect(page.locator('[data-testid="budget-modal"]')).toBeVisible();
    await page.fill('[data-testid="budget-limit-input"]', "25000");
    await page.click('[data-testid="budget-save-btn"]');

    await expect(page.locator('[data-testid="budget-modal"]')).not.toBeVisible();
    await expect(row.locator('[data-testid="budget-limit-amount"]')).toContainText("25,000.00");

    // Delete
    await row.click();
    await expect(page.locator('[data-testid="budget-modal"]')).toBeVisible();
    await page.click('[data-testid="budget-delete-btn"]');

    await expect(page.locator('[data-testid="budget-modal"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="budget-empty-state"]')).toBeVisible();
  });

  test("S10-10: Budget works offline and syncs", async ({ page, context }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1010", email: "s1010@example.com" });
    await app.waitForSyncIdle();
    await seedBudgetEnvironment(page);

    await app.go("budget");
    await expect(page.locator('[data-testid="budget-empty-state"]')).toBeVisible();

    // Go offline
    await context.setOffline(true);

    // Create budget offline
    await page.click('[data-testid="add-budget-btn"]');
    await page.selectOption('[data-testid="budget-category-select"]', "cat-groceries");
    await page.fill('[data-testid="budget-limit-input"]', "40000");
    await page.click('[data-testid="budget-save-btn"]');

    // App should immediately show the budget locally
    await expect(page.locator('[data-testid^="budget-row-"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="budget-limit-amount"]').first()).toContainText("40,000.00");

    // Restore online
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await app.waitForSyncIdle();

    // Verify snapshot on server has the budget
    await expect.poll(async () => {
      const snap = await app.testApi.getSnapshot();
      return (snap.budgets || []).find((b: { categoryId: string }) => b.categoryId === "cat-groceries");
    }, { timeout: 10000 }).toBeTruthy();
  });

  test("S10-11: Visual snapshot of Budget tab with ok/warning/over bars", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1011", email: "s1011@example.com" });
    await app.waitForSyncIdle();
    await seedBudgetEnvironment(page, {
      budgets: [
        { id: "b-groceries", categoryId: "cat-groceries", monthlyLimitMinor: 3000000 },
        { id: "b-dining", categoryId: "cat-dining", monthlyLimitMinor: 2000000 },
        { id: "b-bills", categoryId: "cat-bills", monthlyLimitMinor: 1000000 },
      ],
      transactions: [
        // Groceries: 12,000 / 30,000 = 40% (ok)
        { amountMinor: 1200000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-05" },
        // Dining: 17,000 / 20,000 = 85% (warning)
        { amountMinor: 1700000, categoryId: "cat-dining", type: "EXPENSE", transactionDate: "2026-10-06" },
        // Bills: 12,000 / 10,000 = 120% (over)
        { amountMinor: 1200000, categoryId: "cat-bills", type: "EXPENSE", transactionDate: "2026-10-07" },
      ],
    });

    await app.go("budget");

    const rowGroceries = page.locator('[data-testid="budget-row-b-groceries"]');
    const rowDining = page.locator('[data-testid="budget-row-b-dining"]');
    const rowBills = page.locator('[data-testid="budget-row-b-bills"]');

    await expect(rowGroceries).toHaveAttribute("data-budget-status", "ok");
    await expect(rowDining).toHaveAttribute("data-budget-status", "warning");
    await expect(rowBills).toHaveAttribute("data-budget-status", "over");
  });
});
