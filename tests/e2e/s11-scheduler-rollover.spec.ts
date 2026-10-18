import { test, expect } from "@playwright/test";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 11 — Scheduler Infrastructure & Budget Rollover @s11", () => {
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

  async function seedEnvironment(
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

    const userId = await page.evaluate(() => localStorage.getItem("hardmoney_active_user") || "default");
    const app = new AppHelper(page);
    await app.testApi.seed({
      categories: (options?.categories || [
        { id: "cat-groceries", userId, name: "Groceries", icon: "🛒", color: "#10b981" },
        { id: "cat-dining", userId, name: "Dining", icon: "🍽️", color: "#f97316" },
      ]).map((c) => ({ ...c, userId })),
      accounts: (options?.accounts || [
        { id: "acc-cash", userId, name: "Cash Wallet", type: "CASH", openingBalanceMinor: 10000000 },
      ]).map((a) => ({ ...a, userId })),
      budgets: (options?.budgets || []).map((b) => ({
        ...b,
        userId,
        enableRollover: b.enableRollover ?? false,
      })),
      transactions: (options?.transactions || []).map((t, idx) => ({
        id: t.id || `tx-${idx + 1}`,
        userId,
        accountId: t.accountId || "acc-cash",
        toAccountId: t.toAccountId || null,
        categoryId: t.categoryId || "cat-groceries",
        amountMinor: t.amountMinor,
        type: t.type || "EXPENSE",
        direction: t.direction || (t.type === "INCOME" ? "IN" : "OUT"),
        transactionDate: t.transactionDate || "2026-10-15",
        excludeFromBudget: t.excludeFromBudget || false,
      })),
    });
  }

  test("S11-01: tick API: wrong/missing secret → 401; correct secret → 200 (API test)", async ({ request }) => {
    // 1. Missing secret
    const missingRes = await request.post("/api/v1/cron/tick");
    expect(missingRes.status()).toBe(401);

    // 2. Wrong secret
    const wrongRes = await request.post("/api/v1/cron/tick", {
      headers: { Authorization: "Bearer wrong-secret-token" },
    });
    expect(wrongRes.status()).toBe(401);

    // 3. Correct secret via Bearer
    const validBearerRes = await request.post("/api/v1/cron/tick", {
      headers: { Authorization: "Bearer optional-cron-secret-token" },
    });
    expect(validBearerRes.status()).toBe(200);
    const bearerData = await validBearerRes.json();
    expect(bearerData.ok).toBe(true);

    // 4. Correct secret via x-cron-secret header
    const validHeaderRes = await request.post("/api/v1/cron/tick", {
      headers: { "x-cron-secret": "optional-cron-secret-token" },
    });
    expect(validHeaderRes.status()).toBe(200);
  });

  test("S11-02: Rollover on: spend 22,000 of 30,000; advance clock to next month; tick; budget shows carried +8,000, available 38,000", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1102", email: "s1102@example.com" });
    await app.waitForSyncIdle();

    // In October 2026: spend 22,000 of 30,000
    await seedEnvironment(page, {
      budgets: [
        {
          id: "b-groceries",
          categoryId: "cat-groceries",
          monthlyLimitMinor: 3000000, // 30,000.00
          enableRollover: true,
          rolloverStartMonth: "2026-10",
        },
      ],
      transactions: [
        {
          amountMinor: 2200000, // 22,000.00
          categoryId: "cat-groceries",
          type: "EXPENSE",
          transactionDate: "2026-10-15",
        },
      ],
    });

    // Sync outbox / local state to server
    await app.triggerSync();

    // Advance clock to November 2026
    const novDate = "2026-11-05T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(novDate));
    await app.testApi.setClock(novDate);

    // Trigger tick
    await app.testApi.tick();

    // Go to budget page
    await app.go("budget");
    await app.triggerSync();

    // Switch to November
    await page.locator('[data-testid="month-next"]').first().click();
    await expect(page.locator('[data-testid="month-label"]').first()).toContainText("November 2026");

    const row = page.locator('[data-testid="budget-row-b-groceries"]');
    await expect(row).toBeVisible();

    // Shows carried chip with +8,000.00
    const carriedChip = row.locator('[data-testid="budget-carried-chip"]');
    await expect(carriedChip).toBeVisible();
    await expect(carriedChip).toContainText("+");
    await expect(carriedChip).toContainText("8,000.00");

    // Shows available 38,000.00
    await expect(row.locator('[data-testid="budget-available-amount"]')).toContainText("38,000.00");
  });

  test("S11-03: Deficit: spend 35,000; next month shows carried -5,000, available 25,000", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1103", email: "s1103@example.com" });
    await app.waitForSyncIdle();

    // Spend 35,000 of 30,000 in October
    await seedEnvironment(page, {
      budgets: [
        {
          id: "b-groceries",
          categoryId: "cat-groceries",
          monthlyLimitMinor: 3000000,
          enableRollover: true,
          rolloverStartMonth: "2026-10",
        },
      ],
      transactions: [
        {
          amountMinor: 3500000,
          categoryId: "cat-groceries",
          type: "EXPENSE",
          transactionDate: "2026-10-15",
        },
      ],
    });

    await app.triggerSync();

    // Advance clock to November 2026
    const novDate = "2026-11-05T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(novDate));
    await app.testApi.setClock(novDate);

    // Trigger tick
    await app.testApi.tick();

    await app.go("budget");
    await app.triggerSync();

    // Switch to November
    await page.locator('[data-testid="month-next"]').first().click();
    await expect(page.locator('[data-testid="month-label"]').first()).toContainText("November 2026");

    const row = page.locator('[data-testid="budget-row-b-groceries"]');
    await expect(row).toBeVisible();

    // Shows carried chip with -5,000.00
    const carriedChip = row.locator('[data-testid="budget-carried-chip"]');
    await expect(carriedChip).toBeVisible();
    await expect(carriedChip).toContainText("-");
    await expect(carriedChip).toContainText("5,000.00");

    // Shows available 25,000.00
    await expect(row.locator('[data-testid="budget-available-amount"]')).toContainText("25,000.00");
  });

  test("S11-04: Run tick twice; snapshot count unchanged (Test API snapshot)", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1104", email: "s1104@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      budgets: [
        {
          id: "b-groceries",
          categoryId: "cat-groceries",
          monthlyLimitMinor: 3000000,
          enableRollover: true,
          rolloverStartMonth: "2026-10",
        },
      ],
      transactions: [
        { amountMinor: 2000000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-10" },
      ],
    });

    await app.triggerSync();

    // Advance to November
    await app.testApi.setClock("2026-11-05T10:00:00.000Z");

    // Run tick first time
    await app.testApi.tick();
    const snap1 = await app.testApi.getSnapshot();
    const count1 = (snap1.budgetSnapshots || []).length;
    expect(count1).toBeGreaterThan(0);

    // Run tick second time
    await app.testApi.tick();
    const snap2 = await app.testApi.getSnapshot();
    const count2 = (snap2.budgetSnapshots || []).length;

    // Snapshot count remains unchanged due to deterministic IDs
    expect(count2).toBe(count1);
  });

  test("S11-05: Jump the clock 3 months, single tick; all months' snapshots exist; chain values correct", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1105", email: "s1105@example.com" });
    await app.waitForSyncIdle();

    // Budget 30,000. In Oct: spend 20,000 (leaves +10,000 surplus)
    await seedEnvironment(page, {
      budgets: [
        {
          id: "b-groceries",
          categoryId: "cat-groceries",
          monthlyLimitMinor: 3000000,
          enableRollover: true,
          rolloverStartMonth: "2026-10",
        },
      ],
      transactions: [
        { amountMinor: 2000000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-10" },
      ],
    });

    await app.triggerSync();

    // Jump 3 months to January 2027
    await app.testApi.setClock("2027-01-10T10:00:00.000Z");

    // Single tick execution
    await app.testApi.tick();

    // Verify all intermediate months exist in snapshot
    const snap = await app.testApi.getSnapshot();
    const snaps = (snap.budgetSnapshots || []) as Array<{
      month: string;
      limitMinor: number;
      spentMinor: number;
      carriedInMinor: number;
      carriedOutMinor: number;
    }>;

    const octSnap = snaps.find((s) => s.month === "2026-10");
    const novSnap = snaps.find((s) => s.month === "2026-11");
    const decSnap = snaps.find((s) => s.month === "2026-12");

    expect(octSnap).toBeTruthy();
    expect(novSnap).toBeTruthy();
    expect(decSnap).toBeTruthy();

    // Oct: spent 20k -> carriedOut +10k
    expect(octSnap?.spentMinor).toBe(2000000);
    expect(octSnap?.carriedOutMinor).toBe(1000000);

    // Nov: spent 0, carriedIn +10k -> carriedOut +40k
    expect(novSnap?.carriedInMinor).toBe(1000000);
    expect(novSnap?.carriedOutMinor).toBe(4000000);

    // Dec: spent 0, carriedIn +40k -> carriedOut +70k
    expect(decSnap?.carriedInMinor).toBe(4000000);
    expect(decSnap?.carriedOutMinor).toBe(7000000);
  });

  test("S11-06: Add a back-dated expense to a closed month; carried-in of later months recalculates", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1106", email: "s1106@example.com" });
    await app.waitForSyncIdle();

    // Oct: budget 30,000, spend 20,000
    await seedEnvironment(page, {
      budgets: [
        {
          id: "b-groceries",
          categoryId: "cat-groceries",
          monthlyLimitMinor: 3000000,
          enableRollover: true,
          rolloverStartMonth: "2026-10",
        },
      ],
      transactions: [
        { id: "tx-oct-1", amountMinor: 2000000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-10" },
      ],
    });

    await app.triggerSync();

    // Advance to November and tick
    await app.testApi.setClock("2026-11-05T10:00:00.000Z");
    await app.testApi.tick();

    let snap = await app.testApi.getSnapshot();
    let novSnap = (snap.budgetSnapshots || []).find((s: { month: string }) => s.month === "2026-11");
    expect(novSnap?.carriedInMinor).toBe(1000000); // +10,000

    // Add back-dated expense to October of 6,000 (total spent in Oct becomes 26,000)
    await seedEnvironment(page, {
      transactions: [
        { id: "tx-oct-2", amountMinor: 600000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-20" },
      ],
    });
    await app.triggerSync();

    // Re-tick
    await app.testApi.tick();

    snap = await app.testApi.getSnapshot();
    novSnap = (snap.budgetSnapshots || []).find((s: { month: string }) => s.month === "2026-11");
    // Recalculated: 30k limit - 26k spent = +4k carriedIn for November
    expect(novSnap?.carriedInMinor).toBe(400000);
  });

  test("S11-07: Rollover disabled budget shows no carried chip", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1107", email: "s1107@example.com" });
    await app.waitForSyncIdle();

    // Rollover disabled
    await seedEnvironment(page, {
      budgets: [
        {
          id: "b-groceries",
          categoryId: "cat-groceries",
          monthlyLimitMinor: 3000000,
          enableRollover: false,
        },
      ],
      transactions: [
        { amountMinor: 1500000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-10" },
      ],
    });

    await app.triggerSync();

    // Advance to November & tick
    const novDate = "2026-11-05T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(novDate));
    await app.testApi.setClock(novDate);
    await app.testApi.tick();

    await app.go("budget");
    await app.triggerSync();

    await page.locator('[data-testid="month-next"]').first().click();
    await expect(page.locator('[data-testid="month-label"]').first()).toContainText("November 2026");

    const row = page.locator('[data-testid="budget-row-b-groceries"]');
    await expect(row).toBeVisible();
    await expect(row.locator('[data-testid="budget-carried-chip"]')).not.toBeVisible();
  });

  test("S11-08: Month-close handled in the user's timezone: transaction at 23:59 Colombo on the last day belongs to the closing month", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1108", email: "s1108@example.com" });
    await app.waitForSyncIdle();

    // 23:59 on 31 Oct Colombo time is 18:29 UTC on 31 Oct
    const lateOctTxDate = "2026-10-31T18:29:00.000Z";

    await seedEnvironment(page, {
      budgets: [
        {
          id: "b-groceries",
          categoryId: "cat-groceries",
          monthlyLimitMinor: 3000000,
          enableRollover: true,
          rolloverStartMonth: "2026-10",
        },
      ],
      transactions: [
        {
          amountMinor: 1000000, // 10,000
          categoryId: "cat-groceries",
          type: "EXPENSE",
          transactionDate: lateOctTxDate,
        },
      ],
    });

    await app.triggerSync();

    // Advance to Nov and tick
    await app.testApi.setClock("2026-11-02T10:00:00.000Z");
    await app.testApi.tick();

    const snap = await app.testApi.getSnapshot();
    const octSnap = (snap.budgetSnapshots || []).find((s: { month: string }) => s.month === "2026-10");

    expect(octSnap).toBeTruthy();
    // Expense at 23:59 Colombo belongs to October
    expect(octSnap?.spentMinor).toBe(1000000);
  });

  test("S11-09: The UI picks up server-generated snapshots after sync without a reload", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1109", email: "s1109@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      budgets: [
        {
          id: "b-groceries",
          categoryId: "cat-groceries",
          monthlyLimitMinor: 3000000,
          enableRollover: true,
          rolloverStartMonth: "2026-10",
        },
      ],
      transactions: [
        { amountMinor: 2200000, categoryId: "cat-groceries", type: "EXPENSE", transactionDate: "2026-10-15" },
      ],
    });

    await app.triggerSync();

    // Advance clock to November
    const novDate = "2026-11-05T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(novDate));
    await app.testApi.setClock(novDate);

    // Open budget page and navigate to November (initially no snapshot synced yet)
    await app.go("budget");
    await page.locator('[data-testid="month-next"]').first().click();
    await expect(page.locator('[data-testid="month-label"]').first()).toContainText("November 2026");

    // Server runs tick
    await app.testApi.tick();

    // Trigger sync without page reload
    await app.triggerSync();

    // Live query picks up snapshot automatically!
    const row = page.locator('[data-testid="budget-row-b-groceries"]');
    await expect(row.locator('[data-testid="budget-carried-chip"]')).toBeVisible({ timeout: 10000 });
    await expect(row.locator('[data-testid="budget-carried-chip"]')).toContainText("+");
    await expect(row.locator('[data-testid="budget-carried-chip"]')).toContainText("8,000.00");
  });
});
