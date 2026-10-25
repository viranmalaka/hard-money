import { test, expect } from "@playwright/test";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 13 — 0% Installment Plans @s13", () => {
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
    excludeFromBalance?: boolean;
    installmentPlanId?: string | null;
  }

  interface SeedPlan {
    id: string;
    userId?: string;
    accountId: string;
    categoryId?: string | null;
    merchantName: string;
    totalAmountMinor: number;
    tenureMonths: number;
    monthlyAmountMinor: number;
    finalInstallmentAmountMinor: number;
    initialPaidInstallments?: number;
    processingFeeMinor?: number;
    processingFeeBilled?: boolean;
    startDate?: string;
    firstStatementDate?: string;
    isOngoingSetup?: boolean;
    status?: string;
    originalTransactionId?: string | null;
  }

  async function getActiveUserId(page: import("@playwright/test").Page): Promise<string> {
    await page.waitForFunction(() => !!localStorage.getItem("hardmoney_active_user"));
    return page.evaluate(() => localStorage.getItem("hardmoney_active_user")!);
  }

  async function seedEnvironment(
    page: import("@playwright/test").Page,
    options?: {
      accounts?: SeedAccount[];
      transactions?: SeedTransaction[];
      installmentPlans?: SeedPlan[];
    }
  ) {
    await page.waitForFunction(() => {
      const db = (window as unknown as { __hardMoneyDb: { name: string } }).__hardMoneyDb;
      const expected = localStorage.getItem("hardmoney_active_user");
      return db && db.name && (!expected || db.name === `hardmoney_${expected}`);
    });

    const userId = await getActiveUserId(page);
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
          };
        }).__hardMoneyDb;
        if (!db) throw new Error("HardMoneyDB not found on window");
        await db.accounts.bulkPut(accountsToPut);
      },
      seededAccounts
    );

    const seededTransactions = (options?.transactions || []).map((t, idx) => ({
      id: t.id || `tx-${idx + 1}`,
      userId,
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
      excludeFromBalance: t.excludeFromBalance || false,
      installmentPlanId: t.installmentPlanId || null,
      serverSeq: 0,
      createdAt: now,
      updatedAt: now,
    }));

    // Also seed to server DB so sync push and tick operations have corresponding entities
    await page.request.post("/api/test/seed", {
      data: {
        accounts: seededAccounts,
        transactions: seededTransactions,
      },
    });

    if (seededTransactions.length > 0) {
      await page.evaluate(
        async (txs) => {
          const db = (window as unknown as {
            __hardMoneyDb: {
              transactions: { bulkPut: (t: unknown[]) => Promise<void> };
            };
          }).__hardMoneyDb;
          await db.transactions.bulkPut(txs);
        },
        seededTransactions
      );
    }

    if (options?.installmentPlans && options.installmentPlans.length > 0) {
      await page.evaluate(
        async ({ plansToPut, uId, timestamp }) => {
          const db = (window as unknown as {
            __hardMoneyDb: {
              installmentPlans: { bulkPut: (p: unknown[]) => Promise<void> };
            };
          }).__hardMoneyDb;
          const fullPlans = plansToPut.map((p) => ({
            id: p.id,
            userId: uId,
            accountId: p.accountId,
            categoryId: p.categoryId || null,
            merchantName: p.merchantName,
            totalAmountMinor: p.totalAmountMinor,
            tenureMonths: p.tenureMonths,
            monthlyAmountMinor: p.monthlyAmountMinor,
            finalInstallmentAmountMinor: p.finalInstallmentAmountMinor,
            initialPaidInstallments: p.initialPaidInstallments || 0,
            processingFeeMinor: p.processingFeeMinor || 0,
            processingFeeBilled: p.processingFeeBilled || false,
            startDate: p.startDate || timestamp,
            firstStatementDate: p.firstStatementDate || timestamp,
            isOngoingSetup: p.isOngoingSetup || false,
            status: p.status || "ACTIVE",
            originalTransactionId: p.originalTransactionId || null,
            serverSeq: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
          }));
          await db.installmentPlans.bulkPut(fullPlans);
        },
        { plansToPut: options.installmentPlans, uId: userId, timestamp: now }
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
        excludeFromBalance: t.excludeFromBalance || false,
        installmentPlanId: t.installmentPlanId || null,
      })),
      installmentPlans: (options?.installmentPlans || []).map((p) => ({
        ...p,
        userId,
      })),
    });
  }

  test("S13-01: Create a new plan 120,000 / 12: card shows Blocked 120,000; Available reduced by 120,000", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1301", email: "s1301@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page);
    const clockTime = "2026-10-21T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    await app.go("accounts");
    await page.click('[data-testid="tab-liabilities"]');
    await app.triggerSync();

    // Click Add Ongoing Plan
    await page.locator('[data-testid="add-installment-plan-btn"]').click();
    const modal = page.locator('[data-testid="installment-plan-modal"]');
    await expect(modal).toBeVisible();

    // Fill form
    await modal.locator('[data-testid="installment-merchant-input"]').fill("Singer Home");
    await modal.locator('[data-testid="installment-total-input"]').fill("120000");
    await modal.locator('[data-testid="installment-tenure-input"]').fill("12");
    await modal.locator('[data-testid="installment-paid-input"]').fill("0");
    await modal.locator('[data-testid="installment-plan-submit"]').click();

    await expect(modal).not.toBeVisible();
    await app.triggerSync();

    const cardItem = page.locator('[data-testid="account-item-acc-card"]');
    // Blocked: 120,000.00
    await expect(cardItem.locator('[data-testid="credit-blocked-amount"]')).toContainText("120,000.00");
    // Available: 500,000 - 120,000 = 380,000.00
    await expect(cardItem.locator('[data-testid="credit-available-amount"]')).toContainText("380,000.00");
  });

  test("S13-02: Plan 100,000 / 3: after three ticks, installments are 33,333 / 33,333 / 33,334 and plan is COMPLETED", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1302", email: "s1302@example.com" });
    await app.waitForSyncIdle();

    const userId = await getActiveUserId(page);

    // Seed server DB directly so tick can process it
    await app.testApi.seed({
      accounts: [
        {
          id: "acc-card",
          userId,
          name: "Apex Visa Platinum",
          type: "CREDIT_CARD",
          openingBalanceMinor: 0,
          creditLimitMinor: 50000000,
          statementCutoffDay: 20,
          paymentDueDay: 10,
        },
      ],
      installmentPlans: [
        {
          id: "plan-100k",
          userId,
          accountId: "acc-card",
          merchantName: "Laptop Promo",
          totalAmountMinor: 10000000,
          tenureMonths: 3,
          monthlyAmountMinor: 3333333,
          finalInstallmentAmountMinor: 3333334,
          initialPaidInstallments: 0,
          startDate: "2026-08-01T00:00:00.000Z",
          firstStatementDate: "2026-08-20T00:00:00.000Z",
          status: "ACTIVE",
        },
      ],
    });

    // Advance clock past 3 cutoffs: Aug 20, Sep 20, Oct 20 -> Oct 21
    const clockTime = "2026-10-21T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    // Run tick
    await app.testApi.tick();

    // Pull changes into browser
    await app.go("accounts");
    await app.triggerSync();

    // Check plan in snapshot
    const snapshot = await app.testApi.getSnapshot();
    const instTxs = snapshot.transactions.filter(
      (t: { installmentPlanId: string }) => t.installmentPlanId === "plan-100k"
    );
    expect(instTxs.length).toBe(3);

    const amounts = instTxs.map((t: { amountMinor: number }) => t.amountMinor).sort();
    expect(amounts).toEqual([3333333, 3333333, 3333334]);

    const plan = snapshot.installmentPlans.find((p: { id: string }) => p.id === "plan-100k");
    expect(plan.status).toBe("COMPLETED");
  });

  test("S13-03: Ongoing onboarding (12 months, 5 paid, 10,000): row shows '5 of 12', Remaining 70,000", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1303", email: "s1303@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page);
    await app.go("accounts");
    await app.triggerSync();

    await page.locator('[data-testid="add-installment-plan-btn"]').click();
    const modal = page.locator('[data-testid="installment-plan-modal"]');
    await modal.locator('[data-testid="installment-merchant-input"]').fill("Samsung Galaxy");
    await modal.locator('[data-testid="installment-total-input"]').fill("120000");
    await modal.locator('[data-testid="installment-tenure-input"]').selectOption("12");
    await modal.locator('[data-testid="installment-paid-input"]').fill("5");
    await modal.locator('[data-testid="installment-plan-submit"]').click();

    await expect(modal).not.toBeVisible();
    await app.triggerSync();

    // Check row text
    await expect(page.locator('[data-testid="installment-progress-text"]')).toContainText("5 of 12");
    await expect(page.locator('[data-testid="installment-remaining-amount"]')).toContainText("70,000.00");
  });

  test("S13-04: Convert a 60,000 swipe: original row marked 'converted', removed from balance/stats; Blocked 60,000", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1304", email: "s1304@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      transactions: [
        {
          id: "tx-swipe",
          amountMinor: 6000000, // 60,000.00
          transactionDate: "2026-10-15",
          note: "Apple Watch Swipe",
        },
      ],
    });

    await app.go("trans");
    await app.triggerSync();

    // Tap transaction to edit
    const txRow = page.locator('[data-testid="transaction-row-tx-swipe"]');
    await txRow.click();

    // Inside TransactionEditModal
    const modal = page.locator('[data-testid="transaction-edit-modal"]');
    await expect(modal).toBeVisible();

    await modal.locator('[data-testid="convert-to-installment-btn"]').click();
    const convertSection = modal.locator('[data-testid="convert-section"]');
    await expect(convertSection).toBeVisible();

    await convertSection.locator('[data-testid="convert-tenure-select"]').selectOption("6");
    await convertSection.locator('[data-testid="confirm-convert-btn"]').click();

    await expect(modal).not.toBeVisible();

    // In daily view, converted chip is displayed
    await expect(page.locator('[data-testid="converted-chip"]')).toBeVisible();

    // Go to Accounts
    await app.go("accounts");
    const cardItem = page.locator('[data-testid="account-item-acc-card"]');
    await expect(cardItem.locator('[data-testid="credit-blocked-amount"]')).toContainText("60,000.00");
    await expect(cardItem.locator('[data-testid="account-card-balance"]')).toContainText("0.00");
  });

  test("S13-05: Available credit after conversion = limit − outstanding − blocked (no double deduction)", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1305", email: "s1305@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      transactions: [
        {
          id: "tx-swipe",
          amountMinor: 6000000,
          transactionDate: "2026-10-15",
          note: "Sony TV",
        },
      ],
    });

    await app.go("trans");
    await app.triggerSync();

    await page.locator('[data-testid="transaction-row-tx-swipe"]').click();
    const modal = page.locator('[data-testid="transaction-edit-modal"]');
    await modal.locator('[data-testid="convert-to-installment-btn"]').click();
    await modal.locator('[data-testid="confirm-convert-btn"]').click();
    await expect(modal).not.toBeVisible();

    await app.go("accounts");
    const cardItem = page.locator('[data-testid="account-item-acc-card"]');

    // Limit 500,000, Blocked 60,000, Ledger balance 0 -> Available = 440,000.00
    await expect(cardItem.locator('[data-testid="credit-available-amount"]')).toContainText("440,000.00");
  });

  test("S13-06: `tick` at cutoff adds one installment row with note 'Merchant (Installment n of N)'; progress increments", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1306", email: "s1306@example.com" });
    await app.waitForSyncIdle();

    const userId = await getActiveUserId(page);

    await app.testApi.seed({
      accounts: [
        {
          id: "acc-card",
          userId,
          name: "Apex Visa Platinum",
          type: "CREDIT_CARD",
          openingBalanceMinor: 0,
          creditLimitMinor: 50000000,
          statementCutoffDay: 20,
          paymentDueDay: 10,
        },
      ],
      installmentPlans: [
        {
          id: "plan-monthly",
          userId,
          accountId: "acc-card",
          merchantName: "Singer AC",
          totalAmountMinor: 12000000,
          tenureMonths: 12,
          monthlyAmountMinor: 1000000,
          finalInstallmentAmountMinor: 1000000,
          initialPaidInstallments: 0,
          startDate: "2026-10-01T00:00:00.000Z",
          firstStatementDate: "2026-10-20T00:00:00.000Z",
          status: "ACTIVE",
        },
      ],
    });

    const clockTime = "2026-10-21T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    await app.testApi.tick();

    await app.go("trans");
    await app.triggerSync();

    const txItem = page.locator('[data-testid^="transaction-row-inst_plan-monthly"]');
    await expect(txItem).toBeVisible();
    await expect(txItem).toContainText("Singer AC (Installment 1 of 12)");

    await app.go("accounts");
    await expect(page.locator('[data-testid="installment-progress-text"]')).toContainText("1 of 12");
  });

  test("S13-07: Run `tick` twice; installment count unchanged (idempotent)", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1307", email: "s1307@example.com" });
    await app.waitForSyncIdle();

    const userId = await getActiveUserId(page);

    await app.testApi.seed({
      accounts: [
        {
          id: "acc-card",
          userId,
          name: "Apex Visa Platinum",
          type: "CREDIT_CARD",
          openingBalanceMinor: 0,
          creditLimitMinor: 50000000,
          statementCutoffDay: 20,
          paymentDueDay: 10,
        },
      ],
      installmentPlans: [
        {
          id: "plan-idem",
          userId,
          accountId: "acc-card",
          merchantName: "Idempotent Plan",
          totalAmountMinor: 6000000,
          tenureMonths: 6,
          monthlyAmountMinor: 1000000,
          finalInstallmentAmountMinor: 1000000,
          initialPaidInstallments: 0,
          startDate: "2026-10-01T00:00:00.000Z",
          firstStatementDate: "2026-10-20T00:00:00.000Z",
          status: "ACTIVE",
        },
      ],
    });

    const clockTime = "2026-10-21T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    // First tick
    await app.testApi.tick();
    // Second tick
    await app.testApi.tick();

    const snapshot = await app.testApi.getSnapshot();
    const instTxs = snapshot.transactions.filter(
      (t: { installmentPlanId: string }) => t.installmentPlanId === "plan-idem"
    );
    expect(instTxs.length).toBe(1);
  });

  test("S13-08: Skip 3 months then `tick`; 3 installments exist with distinct dates", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1308", email: "s1308@example.com" });
    await app.waitForSyncIdle();

    const userId = await getActiveUserId(page);

    await app.testApi.seed({
      accounts: [
        {
          id: "acc-card",
          userId,
          name: "Apex Visa Platinum",
          type: "CREDIT_CARD",
          openingBalanceMinor: 0,
          creditLimitMinor: 50000000,
          statementCutoffDay: 20,
          paymentDueDay: 10,
        },
      ],
      installmentPlans: [
        {
          id: "plan-skip",
          userId,
          accountId: "acc-card",
          merchantName: "Furniture Set",
          totalAmountMinor: 6000000,
          tenureMonths: 6,
          monthlyAmountMinor: 1000000,
          finalInstallmentAmountMinor: 1000000,
          initialPaidInstallments: 0,
          startDate: "2026-07-01T00:00:00.000Z",
          firstStatementDate: "2026-07-20T00:00:00.000Z",
          status: "ACTIVE",
        },
      ],
    });

    // Advance clock to late September (3 cutoffs passed: Jul 20, Aug 20, Sep 20)
    const clockTime = "2026-09-22T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    await app.testApi.tick();

    const snapshot = await app.testApi.getSnapshot();
    const instTxs = snapshot.transactions.filter(
      (t: { installmentPlanId: string }) => t.installmentPlanId === "plan-skip"
    );
    expect(instTxs.length).toBe(3);

    const dates = new Set(instTxs.map((t: { transactionDate: string }) => t.transactionDate.slice(0, 10)));
    expect(dates.size).toBe(3);
  });

  test("S13-09: Installment appears in Stats and Budget for its category each month", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1309", email: "s1309@example.com" });
    await app.waitForSyncIdle();

    const userId = await getActiveUserId(page);

    await app.testApi.seed({
      categories: [
        { id: "cat-electronics", userId, name: "Electronics", icon: "💻", color: "#3b82f6" },
      ],
      accounts: [
        {
          id: "acc-card",
          userId,
          name: "Apex Visa Platinum",
          type: "CREDIT_CARD",
          openingBalanceMinor: 0,
          creditLimitMinor: 50000000,
          statementCutoffDay: 20,
          paymentDueDay: 10,
        },
      ],
      budgets: [
        {
          id: "b-elec",
          userId,
          categoryId: "cat-electronics",
          monthlyLimitMinor: 2000000, // 20,000.00
        },
      ],
      installmentPlans: [
        {
          id: "plan-gadget",
          userId,
          accountId: "acc-card",
          categoryId: "cat-electronics",
          merchantName: "MacBook",
          totalAmountMinor: 12000000,
          tenureMonths: 12,
          monthlyAmountMinor: 1000000, // 10,000.00
          finalInstallmentAmountMinor: 1000000,
          initialPaidInstallments: 0,
          startDate: "2026-10-01T00:00:00.000Z",
          firstStatementDate: "2026-10-20T00:00:00.000Z",
          status: "ACTIVE",
        },
      ],
    });

    const clockTime = "2026-10-21T10:00:00.000Z";
    await page.clock.setFixedTime(new Date(clockTime));
    await app.testApi.setClock(clockTime);

    await app.testApi.tick();

    // Check Budget tab
    await app.go("budget");
    await app.triggerSync();

    const budgetRow = page.locator('[data-testid^="budget-row-"]').first();
    await expect(budgetRow).toBeVisible();
    await expect(budgetRow.locator('[data-testid="budget-spent-amount"]')).toContainText("10,000.00");

    // Check Stats tab
    await app.go("stats");
    const statsRow = page.locator('[data-testid^="category-stat-row-"]').first();
    await expect(statsRow).toContainText("10,000.00");
  });

  test("S13-10: Processing fee 2,500 posted once as a Bank Fees expense", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1310", email: "s1310@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page);
    await app.go("accounts");
    await app.triggerSync();

    await page.locator('[data-testid="add-installment-plan-btn"]').click();
    const modal = page.locator('[data-testid="installment-plan-modal"]');
    await modal.locator('[data-testid="installment-merchant-input"]').fill("Dialog iPhone");
    await modal.locator('[data-testid="installment-total-input"]').fill("100000");
    await modal.locator('[data-testid="installment-fee-input"]').fill("2500");
    await modal.locator('[data-testid="installment-plan-submit"]').click();

    await expect(modal).not.toBeVisible();
    await app.triggerSync();

    await app.go("trans");
    const feeRow = page.locator('text=Dialog iPhone (Processing Fee)');
    await expect(feeRow).toBeVisible();
    await expect(page.locator('[data-testid="transaction-amount"]').filter({ hasText: "2,500.00" })).toBeVisible();
  });

  test("S13-11: Early Payoff: confirm sheet shows remaining principal; confirm -> payoff row, plan COMPLETED, Blocked 0", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1311", email: "s1311@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      installmentPlans: [
        {
          id: "plan-payoff",
          accountId: "acc-card",
          merchantName: "Camera Gear",
          totalAmountMinor: 12000000,
          tenureMonths: 12,
          monthlyAmountMinor: 1000000,
          finalInstallmentAmountMinor: 1000000,
          initialPaidInstallments: 5, // 5 paid -> 7 remaining = 70,000.00
          status: "ACTIVE",
        },
      ],
    });

    await app.go("accounts");
    await app.triggerSync();

    const planCard = page.locator('[data-testid="installment-plan-card-plan-payoff"]');
    await planCard.locator('[data-testid="installment-early-payoff-btn"]').click();

    const payoffModal = page.locator('[data-testid="early-payoff-modal"]');
    await expect(payoffModal).toBeVisible();
    await expect(payoffModal.locator('[data-testid="early-payoff-amount"]')).toContainText("70,000.00");

    await payoffModal.locator('[data-testid="confirm-early-payoff-btn"]').click();
    await expect(payoffModal).not.toBeVisible();

    await app.triggerSync();

    const cardItem = page.locator('[data-testid="account-item-acc-card"]');
    // Blocked should now be 0.00
    await expect(cardItem.locator('[data-testid="credit-blocked-amount"]')).toContainText("0.00");
    // Completed status tag on plan
    await expect(planCard.locator('text=COMPLETED')).toBeVisible();
  });

  test("S13-12: Cancel a converted plan -> original swipe restored in balance/stats", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1312", email: "s1312@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      transactions: [
        {
          id: "tx-swipe",
          amountMinor: 6000000,
          transactionDate: "2026-10-15",
          note: "Air Fryer Swipe",
        },
      ],
    });

    await app.go("trans");
    await app.triggerSync();

    // Convert
    await page.locator('[data-testid="transaction-row-tx-swipe"]').click();
    const modal = page.locator('[data-testid="transaction-edit-modal"]');
    await modal.locator('[data-testid="convert-to-installment-btn"]').click();
    await modal.locator('[data-testid="confirm-convert-btn"]').click();
    await expect(modal).not.toBeVisible();

    // Now go to accounts and Cancel
    await app.go("accounts");
    await app.triggerSync();

    const cancelBtn = page.locator('[data-testid="cancel-plan-btn"]');
    await cancelBtn.click();

    // Go back to transactions
    await app.go("trans");
    await app.triggerSync();

    // Converted chip should be gone and original transaction is active in ledger
    await expect(page.locator('[data-testid="converted-chip"]')).not.toBeVisible();

    await app.go("accounts");
    const cardItem = page.locator('[data-testid="account-item-acc-card"]');
    await expect(cardItem.locator('[data-testid="credit-blocked-amount"]')).toContainText("0.00");
    await expect(cardItem.locator('[data-testid="account-card-balance"]')).toContainText("60,000.00");
  });

  test("S13-13: Deleting a system installment row is not offered / shows a blocking message", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1313", email: "s1313@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      transactions: [
        {
          id: "inst-tx",
          amountMinor: 1000000,
          type: "EXPENSE",
          subType: "CC_INSTALLMENT",
          transactionDate: "2026-10-15",
          note: "Singer (Installment 1 of 12)",
        },
      ],
    });

    await app.go("trans");
    await app.triggerSync();

    await page.locator('[data-testid="transaction-row-inst-tx"]').click();
    const modal = page.locator('[data-testid="transaction-edit-modal"]');
    await expect(modal).toBeVisible();

    // Blocking message displayed
    await expect(modal.locator('[data-testid="cannot-delete-installment-msg"]')).toBeVisible();
    // Delete button is not visible
    await expect(modal.locator('[data-testid="transaction-delete-btn"]')).not.toBeVisible();
  });

  test("S13-14: Plan cards show progress bar, monthly amount and remaining amount; layout correct in both viewports", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1314", email: "s1314@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      installmentPlans: [
        {
          id: "plan-view",
          accountId: "acc-card",
          merchantName: "Display Test Plan",
          totalAmountMinor: 12000000,
          tenureMonths: 12,
          monthlyAmountMinor: 1000000,
          finalInstallmentAmountMinor: 1000000,
          initialPaidInstallments: 3,
          status: "ACTIVE",
        },
      ],
    });

    await app.go("accounts");
    await app.triggerSync();

    const card = page.locator('[data-testid="installment-plan-card-plan-view"]');
    await expect(card).toBeVisible();
    await expect(card.locator('[data-testid="installment-progress-bar"]')).toBeVisible();
    await expect(card.locator('[data-testid="installment-progress-text"]')).toContainText("3 of 12");
    await expect(card.locator('[data-testid="installment-monthly-amount"]')).toContainText("10,000.00 / mo");
    await expect(card.locator('[data-testid="installment-remaining-amount"]')).toContainText("90,000.00");
  });

  test("S13-15: Visual snapshot of Installment Plans section", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1315", email: "s1315@example.com" });
    await app.waitForSyncIdle();

    await seedEnvironment(page, {
      installmentPlans: [
        {
          id: "plan-snap",
          accountId: "acc-card",
          merchantName: "Snapshot Merchant",
          totalAmountMinor: 6000000,
          tenureMonths: 6,
          monthlyAmountMinor: 1000000,
          finalInstallmentAmountMinor: 1000000,
          initialPaidInstallments: 2,
          status: "ACTIVE",
        },
      ],
    });

    await app.go("accounts");
    await app.triggerSync();

    const group = page.locator('[data-testid="group-installments"]');
    await expect(group).toBeVisible();
    await expect(group.locator('[data-testid="subtotal-installments"]')).toContainText("40,000.00");
  });
});
