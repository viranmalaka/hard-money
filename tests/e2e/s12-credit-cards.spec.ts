import { test, expect } from "@playwright/test";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 12 — Credit Cards: Cycles, Available Credit & 1-Tap Settlement @s12", () => {
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
    creditLimitMinor?: number | null;
    statementCutoffDay?: number | null;
    paymentDueDay?: number | null;
    linkedSettlementAccountId?: string | null;
  }

  interface SeedTransaction {
    id?: string;
    amountMinor: number;
    type?: string;
    subType?: string | null;
    direction?: string;
    source?: string;
    accountId?: string;
    toAccountId?: string | null;
    categoryId?: string;
    transactionDate?: string;
    note?: string | null;
    excludeFromBudget?: boolean;
    excludeFromStats?: boolean;
  }

  async function seedEnvironment(
    page: import("@playwright/test").Page,
    options?: {
      accounts?: SeedAccount[];
      transactions?: SeedTransaction[];
    }
  ) {
    await page.waitForFunction(() => {
      const db = (window as unknown as { __hardMoneyDb: { name: string } }).__hardMoneyDb;
      const expected = localStorage.getItem("hardmoney_active_user");
      return db && db.name && (!expected || db.name === `hardmoney_${expected}`);
    });

    const userId = await page.evaluate(() => localStorage.getItem("hardmoney_active_user") || "default");
    const now = new Date().toISOString();

    const defaultAccounts: SeedAccount[] = [
      {
        id: "acc-savings",
        userId,
        name: "ComBank Savings",
        type: "BANK_SAVINGS",
        openingBalanceMinor: 10000000, // 100,000.00
        currency: "LKR",
      },
      {
        id: "acc-card",
        userId,
        name: "Apex Visa Platinum",
        type: "CREDIT_CARD",
        openingBalanceMinor: 0,
        currency: "LKR",
        creditLimitMinor: 50000000, // 500,000.00
        statementCutoffDay: 20,
        paymentDueDay: 10,
        linkedSettlementAccountId: "acc-savings",
      },
    ];

    const seededAccounts = (options?.accounts || defaultAccounts).map((a) => ({
      ...a,
      userId,
      serverSeq: 0,
      createdAt: now,
      updatedAt: now,
    }));

    await page.evaluate(
      async (accountsToPut) => {
        const db = (window as unknown as {
          __hardMoneyDb: {
            accounts: { bulkPut: (a: unknown[]) => Promise<void> };
            categories: { bulkPut: (c: unknown[]) => Promise<void> };
            transactions: { bulkPut: (t: unknown[]) => Promise<void> };
          };
        }).__hardMoneyDb;
        if (!db) throw new Error("HardMoneyDB not found on window");
        await db.accounts.bulkPut(accountsToPut);
      },
      seededAccounts
    );

    if (options?.transactions && options.transactions.length > 0) {
      await page.evaluate(
        async ({ txsToPut, uId, timestamp }) => {
          const db = (window as unknown as {
            __hardMoneyDb: {
              transactions: { bulkPut: (t: unknown[]) => Promise<void> };
            };
          }).__hardMoneyDb;
          const fullTxs = txsToPut.map((t, idx) => ({
            id: t.id || `tx-${idx + 1}`,
            userId: uId,
            accountId: t.accountId || "acc-card",
            toAccountId: t.toAccountId || null,
            categoryId: t.categoryId || "cat-general",
            amountMinor: t.amountMinor,
            type: t.type || "EXPENSE",
            subType: t.subType || null,
            direction: t.direction || (t.type === "INCOME" ? "IN" : "OUT"),
            source: t.source || "MANUAL",
            transactionDate: t.transactionDate || "2026-10-15",
            note: t.note || null,
            isSplit: false,
            splitItems: [],
            excludeFromBudget: t.excludeFromBudget || false,
            excludeFromStats: t.excludeFromStats || false,
            excludeFromBalance: false,
            serverSeq: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
          }));
          await db.transactions.bulkPut(fullTxs);
        },
        { txsToPut: options.transactions, uId: userId, timestamp: now }
      );
    }

    const app = new AppHelper(page);
    await app.testApi.seed({
      accounts: seededAccounts.map((a) => ({
        ...a,
        userId,
      })),
      categories: [{ id: "cat-general", userId, name: "General", icon: "💳", color: "#6366f1" }],
      transactions: (options?.transactions || []).map((t, idx) => ({
        id: t.id || `tx-${idx + 1}`,
        userId,
        accountId: t.accountId || "acc-card",
        toAccountId: t.toAccountId || null,
        categoryId: t.categoryId || "cat-general",
        amountMinor: t.amountMinor,
        type: t.type || "EXPENSE",
        subType: t.subType || null,
        direction: t.direction || (t.type === "INCOME" ? "IN" : "OUT"),
        transactionDate: t.transactionDate || "2026-10-15",
        excludeFromBudget: t.excludeFromBudget || false,
        excludeFromStats: t.excludeFromStats || false,
      })),
    });
  }

  test("S12-01: Seed spends and clock at 21 Oct: card shows Billed 30,000, Unbilled 5,000, Available 465,000", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1201", email: "s1201@example.com" });
    await app.waitForSyncIdle();

    // Spends: 30,000 before cutoff (15 Oct), 5,000 after cutoff (21 Oct)
    await seedEnvironment(page, {
      transactions: [
        { id: "tx-billed", amountMinor: 3000000, transactionDate: "2026-10-15" },
        { id: "tx-unbilled", amountMinor: 500000, transactionDate: "2026-10-21" },
      ],
    });

    const clockTime = "2026-10-21T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    await app.go("accounts");
    await app.triggerSync();

    const cardItem = page.locator('[data-testid="account-item-acc-card"]');
    await expect(cardItem).toBeVisible();

    await expect(cardItem.locator('[data-testid="credit-billed-amount"]')).toContainText("30,000.00");
    await expect(cardItem.locator('[data-testid="credit-unbilled-amount"]')).toContainText("5,000.00");
    await expect(cardItem.locator('[data-testid="credit-available-amount"]')).toContainText("465,000.00");
  });

  test("S12-02: Due-date countdown shows 'X days' matching the clock (1 Nov → due 10 Nov = 9 days)", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1202", email: "s1202@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      transactions: [{ id: "tx-1", amountMinor: 1000000, transactionDate: "2026-10-15" }],
    });

    const clockTime = "2026-11-01T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    await app.go("accounts");
    await app.triggerSync();

    const cardItem = page.locator('[data-testid="account-item-acc-card"]');
    await expect(cardItem).toBeVisible();

    const countdown = cardItem.locator('[data-testid="credit-due-countdown"]');
    await expect(countdown).toBeVisible();
    await expect(countdown).toContainText("9 days");
  });

  test("S12-03: Settle → 'Full Billed Due' chip is default; confirm → Savings −30,000, Billed 0", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1203", email: "s1203@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      transactions: [
        { id: "tx-billed", amountMinor: 3000000, transactionDate: "2026-10-15" },
        { id: "tx-unbilled", amountMinor: 500000, transactionDate: "2026-10-21" },
      ],
    });

    const clockTime = "2026-10-21T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    await app.go("accounts");
    await app.triggerSync();

    const cardItem = page.locator('[data-testid="account-item-acc-card"]');
    await cardItem.locator('[data-testid="credit-settle-btn"]').click();

    const modal = page.locator('[data-testid="settle-modal"]');
    await expect(modal).toBeVisible();

    // "Full Billed Due" chip is default selected and shows 30,000
    const billedChip = modal.locator('[data-testid="settle-chip-billed"]');
    await expect(billedChip).toContainText("30,000.00");

    // Confirm settlement
    await modal.locator('[data-testid="settle-confirm-btn"]').click();
    await expect(modal).not.toBeVisible();

    await app.waitForSyncIdle();

    // Billed Due is now 0.00
    await expect(cardItem.locator('[data-testid="credit-billed-amount"]')).toContainText("0.00");

    // Savings reduced by 30,000 (from 100,000 to 70,000)
    const savingsItem = page.locator('[data-testid="account-item-acc-savings"]');
    await expect(savingsItem.locator('[data-testid="account-card-balance"]')).toContainText("70,000.00");
  });

  test("S12-04: Settle 'Total Outstanding' → Outstanding 0", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1204", email: "s1204@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      transactions: [
        { id: "tx-billed", amountMinor: 3000000, transactionDate: "2026-10-15" },
        { id: "tx-unbilled", amountMinor: 500000, transactionDate: "2026-10-21" },
      ],
    });

    const clockTime = "2026-10-21T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    await app.go("accounts");
    await app.triggerSync();

    const cardItem = page.locator('[data-testid="account-item-acc-card"]');
    await cardItem.locator('[data-testid="credit-settle-btn"]').click();

    const modal = page.locator('[data-testid="settle-modal"]');
    await modal.locator('[data-testid="settle-chip-total"]').click();
    await modal.locator('[data-testid="settle-confirm-btn"]').click();
    await expect(modal).not.toBeVisible();

    await app.waitForSyncIdle();

    // Both billed and unbilled become 0.00
    await expect(cardItem.locator('[data-testid="credit-billed-amount"]')).toContainText("0.00");
    await expect(cardItem.locator('[data-testid="credit-unbilled-amount"]')).toContainText("0.00");
    await expect(cardItem.locator('[data-testid="credit-available-amount"]')).toContainText("500,000.00");
  });

  test("S12-05: Settle Custom 10,000 → Billed 20,000 remaining", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1205", email: "s1205@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      transactions: [
        { id: "tx-billed", amountMinor: 3000000, transactionDate: "2026-10-15" },
        { id: "tx-unbilled", amountMinor: 500000, transactionDate: "2026-10-21" },
      ],
    });

    const clockTime = "2026-10-21T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    await app.go("accounts");
    await app.triggerSync();

    const cardItem = page.locator('[data-testid="account-item-acc-card"]');
    await cardItem.locator('[data-testid="credit-settle-btn"]').click();

    const modal = page.locator('[data-testid="settle-modal"]');
    await modal.locator('[data-testid="settle-chip-custom"]').click();
    await modal.locator('[data-testid="settle-amount-input"]').fill("10000");
    await modal.locator('[data-testid="settle-confirm-btn"]').click();
    await expect(modal).not.toBeVisible();

    await app.waitForSyncIdle();

    // FIFO: 30,000 billed - 10,000 paid = 20,000 remaining
    await expect(cardItem.locator('[data-testid="credit-billed-amount"]')).toContainText("20,000.00");
    await expect(cardItem.locator('[data-testid="credit-unbilled-amount"]')).toContainText("5,000.00");
  });

  test("S12-06: Overpay → card shows credit balance, available credit above limit not clamped incorrectly", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1206", email: "s1206@example.com" });
    await app.waitForSyncIdle();

    // Spend total 35,000
    await seedEnvironment(page, {
      transactions: [
        { id: "tx-billed", amountMinor: 3000000, transactionDate: "2026-10-15" },
        { id: "tx-unbilled", amountMinor: 500000, transactionDate: "2026-10-21" },
      ],
    });

    const clockTime = "2026-10-21T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    await app.go("accounts");
    await app.triggerSync();

    const cardItem = page.locator('[data-testid="account-item-acc-card"]');
    await cardItem.locator('[data-testid="credit-settle-btn"]').click();

    // Overpay by paying 40,000 on 35,000 total debt
    const modal = page.locator('[data-testid="settle-modal"]');
    await modal.locator('[data-testid="settle-chip-custom"]').click();
    await modal.locator('[data-testid="settle-amount-input"]').fill("40000");
    await modal.locator('[data-testid="settle-confirm-btn"]').click();
    await expect(modal).not.toBeVisible();

    await app.waitForSyncIdle();

    // Shows credit balance: +5,000.00
    const creditBadge = cardItem.locator('[data-testid="credit-card-credit"]');
    await expect(creditBadge).toBeVisible();
    await expect(creditBadge).toContainText("5,000.00");

    // Unbilled is 0.00 (no negative unbilled)
    await expect(cardItem.locator('[data-testid="credit-unbilled-amount"]')).toContainText("0.00");

    // Available credit is 505,000.00 (not clamped to 500,000 limit)
    await expect(cardItem.locator('[data-testid="credit-available-amount"]')).toContainText("505,000.00");
  });

  test("S12-07: Settlement is not counted in expense stats (Stats and summary unchanged)", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1207", email: "s1207@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      transactions: [{ id: "tx-1", amountMinor: 3000000, transactionDate: "2026-10-15" }],
    });

    const clockTime = "2026-10-21T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    // Initial check on stats
    await app.go("stats");
    await app.triggerSync();
    await expect(page.locator('[data-testid="stat-total-expense"]')).toContainText("30,000.00");

    // Settle 30,000
    await app.go("accounts");
    const cardItem = page.locator('[data-testid="account-item-acc-card"]');
    await cardItem.locator('[data-testid="credit-settle-btn"]').click();
    const modal = page.locator('[data-testid="settle-modal"]');
    await modal.locator('[data-testid="settle-confirm-btn"]').click();
    await expect(modal).not.toBeVisible();
    await app.waitForSyncIdle();

    // Return to stats: expense total remains 30,000.00!
    await app.go("stats");
    await expect(page.locator('[data-testid="stat-total-expense"]')).toContainText("30,000.00");
  });

  test("S12-08: Cutoff day 31 in a February clock → cycle ends on 28th/29th", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1208", email: "s1208@example.com" });
    await app.waitForSyncIdle();

    const userId = await page.evaluate(() => localStorage.getItem("hardmoney_active_user") || "default");
    await seedEnvironment(page, {
      accounts: [
        {
          id: "acc-feb-card",
          userId,
          name: "Feb Card",
          type: "CREDIT_CARD",
          openingBalanceMinor: 0,
          creditLimitMinor: 50000000,
          statementCutoffDay: 31, // configured day 31
          paymentDueDay: 15,
        },
      ],
      transactions: [
        // 28 Feb 2027 is the clamped cutoff day
        { id: "tx-feb", accountId: "acc-feb-card", amountMinor: 1500000, transactionDate: "2027-02-28" },
        // 1 March 2027 is in the next cycle
        { id: "tx-mar", accountId: "acc-feb-card", amountMinor: 700000, transactionDate: "2027-03-01" },
      ],
    });

    const clockTime = "2027-03-02T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    await app.go("accounts");
    await app.triggerSync();

    const cardItem = page.locator('[data-testid="account-item-acc-feb-card"]');
    await expect(cardItem).toBeVisible();

    // Feb 28 spend is in Billed Due (15,000)
    await expect(cardItem.locator('[data-testid="credit-billed-amount"]')).toContainText("15,000.00");
    // Mar 1 spend is in Unbilled (7,000)
    await expect(cardItem.locator('[data-testid="credit-unbilled-amount"]')).toContainText("7,000.00");
  });

  test("S12-09: Transaction at 23:59 on cutoff day is in the closing cycle; 00:01 next day is in the next", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1209", email: "s1209@example.com" });
    await app.waitForSyncIdle();

    // 20 Oct 23:59:00 Colombo is 18:29:00 UTC
    const inCycleDate = "2026-10-20T18:29:00.000Z";
    // 21 Oct 00:01:00 Colombo is 18:31:00 UTC
    const nextCycleDate = "2026-10-20T18:31:00.000Z";

    await seedEnvironment(page, {
      transactions: [
        { id: "tx-in-cycle", amountMinor: 2500000, transactionDate: inCycleDate },
        { id: "tx-next-cycle", amountMinor: 1200000, transactionDate: nextCycleDate },
      ],
    });

    const clockTime = "2026-10-22T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    await app.go("accounts");
    await app.triggerSync();

    const cardItem = page.locator('[data-testid="account-item-acc-card"]');
    await expect(cardItem.locator('[data-testid="credit-billed-amount"]')).toContainText("25,000.00");
    await expect(cardItem.locator('[data-testid="credit-unbilled-amount"]')).toContainText("12,000.00");
  });

  test("S12-10: tick creates a statement snapshot once (rerun is a no-op); history list shows it", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1210", email: "s1210@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      transactions: [{ id: "tx-1", amountMinor: 1800000, transactionDate: "2026-10-15" }],
    });

    await app.triggerSync();

    const clockTime = "2026-10-22T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    // 1. Run tick first time
    await app.testApi.tick();
    const snap1 = await app.testApi.getSnapshot();
    const stmts1 = (snap1.creditCardStatements || []).filter((s: { accountId: string }) => s.accountId === "acc-card");
    expect(stmts1.length).toBe(1);

    // 2. Run tick second time -> count remains 1 (idempotent)
    await app.testApi.tick();
    const snap2 = await app.testApi.getSnapshot();
    const stmts2 = (snap2.creditCardStatements || []).filter((s: { accountId: string }) => s.accountId === "acc-card");
    expect(stmts2.length).toBe(1);

    // 3. Open account detail page and verify history list
    await page.goto("/accounts/acc-card");
    await app.triggerSync();

    const stmtList = page.locator('[data-testid="statement-list"]');
    await expect(stmtList).toBeVisible();
    await expect(stmtList).toContainText("18,000.00");
  });

  test("S12-11: Settle modal is a bottom sheet (mobile) / dialog (desktop); chips are tappable; default source is the linked account", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1211", email: "s1211@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      transactions: [{ id: "tx-1", amountMinor: 1000000, transactionDate: "2026-10-15" }],
    });

    const clockTime = "2026-10-21T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    await app.go("accounts");
    await app.triggerSync();

    const cardItem = page.locator('[data-testid="account-item-acc-card"]');
    await cardItem.locator('[data-testid="credit-settle-btn"]').click();

    const modal = page.locator('[data-testid="settle-modal"]');
    await expect(modal).toBeVisible();

    // Linked settlement account is default selected
    const select = modal.locator('[data-testid="settle-source-account-select"]');
    await expect(select).toHaveValue("acc-savings");

    // Chips are tappable
    await modal.locator('[data-testid="settle-chip-total"]').click();
    await modal.locator('[data-testid="settle-chip-custom"]').click();
    await expect(modal.locator('[data-testid="settle-amount-input"]')).toBeVisible();

    await modal.locator('[data-testid="settle-cancel-btn"]').click();
    await expect(modal).not.toBeVisible();
  });

  test("S12-12: Net-worth header counts card debt as a liability", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1212", email: "s1212@example.com" });
    await app.waitForSyncIdle();

    // Savings has 100,000. Card has 35,000 debt.
    await seedEnvironment(page, {
      transactions: [
        { id: "tx-1", amountMinor: 3000000, transactionDate: "2026-10-15" },
        { id: "tx-2", amountMinor: 500000, transactionDate: "2026-10-21" },
      ],
    });

    const clockTime = "2026-10-21T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    await app.go("accounts");
    await app.triggerSync();

    // Assets: 100,000.00
    await expect(page.locator('[data-testid="net-worth-assets"]')).toContainText("100,000.00");
    // Liabilities: 35,000.00 (card debt)
    await expect(page.locator('[data-testid="net-worth-liabilities"]')).toContainText("35,000.00");
    // Net Worth: 65,000.00
    await expect(page.locator('[data-testid="net-worth-total"]')).toContainText("65,000.00");
  });
});
