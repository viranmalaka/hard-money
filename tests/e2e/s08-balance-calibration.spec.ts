import { test, expect } from "@playwright/test";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 8 — Balance Calibration @s08", () => {
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
    creditLimitMinor?: number;
    currency?: string;
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
    excludeFromBudget?: boolean;
    excludeFromStats?: boolean;
  }

  async function seedCalibrationEnvironment(
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

    await page.evaluate(async (opts?: { accounts?: SeedAccount[]; transactions?: SeedTransaction[] }) => {
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
          openingBalanceMinor: 500000, // 5,000.00
          currency: "LKR",
          serverSeq: 0,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "acc-cc",
          userId,
          name: "Platinum Card",
          type: "CREDIT_CARD",
          openingBalanceMinor: 0,
          creditLimitMinor: 10000000, // 100,000.00 limit
          currency: "LKR",
          serverSeq: 0,
          createdAt: now,
          updatedAt: now,
        },
      ];

      await db.accounts.bulkPut(opts?.accounts || defaultAccounts);

      const categories = [
        {
          id: "cat-groceries",
          userId,
          name: "Groceries",
          icon: "ShoppingBag",
          color: "#10b981",
          serverSeq: 0,
          createdAt: now,
          updatedAt: now,
        },
      ];
      await db.categories.bulkPut(categories);

      if (opts?.transactions && opts.transactions.length > 0) {
        const txs = opts.transactions.map((t: SeedTransaction) => ({
          id: t.id || `tx-${Math.random().toString(36).slice(2, 9)}`,
          userId,
          accountId: t.accountId || "acc-cash",
          toAccountId: t.toAccountId || null,
          categoryId: t.categoryId || "cat-groceries",
          amountMinor: t.amountMinor,
          type: t.type || "EXPENSE",
          direction: t.direction || "OUT",
          source: t.source || "MANUAL",
          transactionDate: t.transactionDate || "2026-10-15",
          note: t.note || null,
          isSplit: false,
          excludeFromBudget: t.excludeFromBudget || false,
          excludeFromStats: t.excludeFromStats || false,
          excludeFromBalance: false,
          serverSeq: 0,
          createdAt: now,
          updatedAt: now,
        }));
        await db.transactions.bulkPut(txs);
      }
    }, options || {});
  }

  test("S08-01: Open Calibrate from Account Detail → shows current computed balance prominently", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0801", email: "s0801@example.com" });
    await app.waitForSyncIdle();

    await seedCalibrationEnvironment(page);

    await page.goto("/accounts/acc-cash");
    await expect(page.getByRole("heading", { name: "Cash Wallet" })).toBeVisible();

    // Click Calibrate Balance
    await page.click('[data-testid="calibrate-balance-btn"]');

    // Dialog or sheet is visible
    await expect(page.getByTestId("current-computed-balance")).toBeVisible();
    await expect(page.getByTestId("current-computed-balance")).toHaveText("LKR 5,000.00");
  });

  test("S08-02: Enter real 5,250 (app was 5,000) → live delta +250.00 → Save balance 5,250.00", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0802", email: "s0802@example.com" });
    await app.waitForSyncIdle();

    await seedCalibrationEnvironment(page);

    await page.goto("/accounts/acc-cash");
    await page.click('[data-testid="calibrate-balance-btn"]');

    // Default expression is 5000.00, clear it or backspace it
    for (let i = 0; i < 7; i++) {
      await page.click('[data-testid="keypad-backspace"]');
    }
    // Enter 5250
    await page.click('[data-testid="keypad-5"]');
    await page.click('[data-testid="keypad-2"]');
    await page.click('[data-testid="keypad-5"]');
    await page.click('[data-testid="keypad-0"]');

    // Live delta: +250.00
    await expect(page.getByTestId("calibration-delta")).toHaveText("+250.00");

    // Save
    await page.click('[data-testid="calibration-save-btn"]');
    await expect(page.getByTestId("current-computed-balance")).not.toBeVisible();

    // Account balance should now be 5,250.00
    await expect(page.getByTestId("account-detail-balance")).toHaveText("LKR 5,250.00");
  });

  test("S08-03: Enter real 4,800 (app was 5,000) → live delta -200.00 → Save balance 4,800.00", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0803", email: "s0803@example.com" });
    await app.waitForSyncIdle();

    await seedCalibrationEnvironment(page);

    await page.goto("/accounts/acc-cash");
    await page.click('[data-testid="calibrate-balance-btn"]');

    for (let i = 0; i < 7; i++) {
      await page.click('[data-testid="keypad-backspace"]');
    }
    // Enter 4800
    await page.click('[data-testid="keypad-4"]');
    await page.click('[data-testid="keypad-8"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');

    // Live delta: -200.00
    await expect(page.getByTestId("calibration-delta")).toHaveText("-200.00");

    // Save
    await page.click('[data-testid="calibration-save-btn"]');
    await expect(page.getByTestId("current-computed-balance")).not.toBeVisible();

    // Account balance should now be 4,800.00
    await expect(page.getByTestId("account-detail-balance")).toHaveText("LKR 4,800.00");
  });

  test("S08-04: Real equals app → 'Nothing to adjust' message and disabled Save", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0804", email: "s0804@example.com" });
    await app.waitForSyncIdle();

    await seedCalibrationEnvironment(page);

    await page.goto("/accounts/acc-cash");
    await page.click('[data-testid="calibrate-balance-btn"]');

    // Initially real = 5000.00 (same as app)
    await expect(page.getByTestId("nothing-to-adjust-msg")).toBeVisible();
    await expect(page.getByTestId("calibration-save-btn")).toBeDisabled();
  });

  test("S08-05: Scale icon badge appears on calibration row in account feed", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0805", email: "s0805@example.com" });
    await app.waitForSyncIdle();

    await seedCalibrationEnvironment(page, {
      transactions: [
        {
          id: "tx-calib-1",
          amountMinor: 25000,
          type: "ADJUSTMENT",
          source: "CALIBRATION",
          direction: "IN",
          accountId: "acc-cash",
          note: "Reconciled with wallet cash",
          excludeFromBudget: true,
          excludeFromStats: true,
        },
      ],
    });

    await page.goto("/accounts/acc-cash");

    // Calibration icon and badge should be present in row
    await expect(page.getByTestId("calibration-icon")).toBeVisible();
    await expect(page.getByTestId("calibration-badge")).toBeVisible();
    await expect(page.getByTestId("calibration-badge")).toContainText("Calibration");
  });

  test("S08-06: Budget/income/expense unchanged; Adjustments row in summary reflects delta", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0806", email: "s0806@example.com" });
    await app.waitForSyncIdle();

    await seedCalibrationEnvironment(page, {
      transactions: [
        {
          id: "tx-exp-1",
          amountMinor: 100000, // 1,000.00 expense
          type: "EXPENSE",
          direction: "OUT",
          accountId: "acc-cash",
        },
        {
          id: "tx-calib-1",
          amountMinor: 25000, // +250.00 calibration
          type: "ADJUSTMENT",
          source: "CALIBRATION",
          direction: "IN",
          accountId: "acc-cash",
          excludeFromStats: true,
          excludeFromBudget: true,
        },
      ],
    });

    await app.go("trans");

    // Expense is still 1,000.00 (calibration does not affect expense)
    await expect(page.getByTestId("expense-amount")).toHaveText("LKR 1,000.00");
    await expect(page.getByTestId("income-amount")).toHaveText("LKR 0.00");

    // Adjustments row displays + LKR 250.00
    await expect(page.getByTestId("summary-adjustments")).toBeVisible();
    await expect(page.getByTestId("summary-adjustments")).toContainText("+ LKR 250.00");
  });

  test("S08-07: Net worth header reflects new balance immediately", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0807", email: "s0807@example.com" });
    await app.waitForSyncIdle();

    await seedCalibrationEnvironment(page);

    await app.go("accounts");
    // Initially net worth is 5,000.00
    await expect(page.getByTestId("net-worth-total")).toHaveText("LKR 5,000.00");

    // Calibrate Cash Wallet
    await page.goto("/accounts/acc-cash");
    await page.click('[data-testid="calibrate-balance-btn"]');

    for (let i = 0; i < 7; i++) {
      await page.click('[data-testid="keypad-backspace"]');
    }
    await page.click('[data-testid="keypad-6"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="calibration-save-btn"]');

    // Go back to accounts: Net worth is now 6,000.00
    await app.go("accounts");
    await expect(page.getByTestId("net-worth-total")).toHaveText("LKR 6,000.00");
  });

  test("S08-08: Credit card calibration (app debt 20,000 -> statement 18,500 yields +1,500 adjustment & available credit updated)", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0808", email: "s0808@example.com" });
    await app.waitForSyncIdle();

    // Credit card with 20,000 debt (balance -20,000.00)
    await seedCalibrationEnvironment(page, {
      transactions: [
        {
          id: "tx-cc-spend",
          amountMinor: 2000000, // 20,000.00 expense on CC
          type: "EXPENSE",
          direction: "OUT",
          accountId: "acc-cc",
        },
      ],
    });

    await page.goto("/accounts/acc-cc");
    // Outstanding debt displayed is 20,000.00
    await expect(page.getByTestId("account-detail-outstanding")).toContainText("LKR 20,000.00");

    // Calibrate: real statement debt is 18,500
    await page.click('[data-testid="calibrate-balance-btn"]');
    await expect(page.getByTestId("current-computed-balance")).toHaveText("LKR 20,000.00");

    for (let i = 0; i < 8; i++) {
      await page.click('[data-testid="keypad-backspace"]');
    }
    await page.click('[data-testid="keypad-1"]');
    await page.click('[data-testid="keypad-8"]');
    await page.click('[data-testid="keypad-5"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');

    // Delta is +1,500.00 (debt decreased)
    await expect(page.getByTestId("calibration-delta")).toHaveText("+1500.00");
    await page.click('[data-testid="calibration-save-btn"]');

    // New debt is 18,500.00
    await expect(page.getByTestId("account-detail-outstanding")).toContainText("LKR 18,500.00");
    // Available credit should now be 100,000 - 18,500 = 81,500.00
    await expect(page.getByTestId("available-credit-display")).toHaveText("LKR 81,500.00");
  });

  test("S08-09: Optional note on calibration saved, visible in row detail", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0809", email: "s0809@example.com" });
    await app.waitForSyncIdle();

    await seedCalibrationEnvironment(page);

    await page.goto("/accounts/acc-cash");
    await page.click('[data-testid="calibrate-balance-btn"]');

    for (let i = 0; i < 7; i++) {
      await page.click('[data-testid="keypad-backspace"]');
    }
    await page.click('[data-testid="keypad-5"]');
    await page.click('[data-testid="keypad-5"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');

    // Enter note
    await page.fill('[data-testid="calibration-note"]', "ATM receipt reconciliation");
    await page.click('[data-testid="calibration-save-btn"]');

    // Note should be visible in account feed
    await expect(page.getByText("ATM receipt reconciliation")).toBeVisible();
  });

  test("S08-10: Calibrate offline then sync → row syncs cleanly to server", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0810", email: "s0810@example.com" });
    await app.waitForSyncIdle();

    // Create Cash account through UI so it is on server
    await app.go("accounts");
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Offline Wallet");
    await page.fill('[data-testid="account-opening-balance"]', "5000.00");
    await page.click('[data-testid="account-submit"]');
    await app.waitForSyncIdle();

    // Go to account detail
    await page.click('[data-testid="account-detail-link"]');
    await expect(page.getByRole("heading", { name: "Offline Wallet" })).toBeVisible();

    // Go offline
    await page.context().setOffline(true);

    // Calibrate balance to 5,500
    await page.click('[data-testid="calibrate-balance-btn"]');
    for (let i = 0; i < 7; i++) {
      await page.click('[data-testid="keypad-backspace"]');
    }
    await page.click('[data-testid="keypad-5"]');
    await page.click('[data-testid="keypad-5"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="calibration-save-btn"]');

    // Balance updated locally
    await expect(page.getByTestId("account-detail-balance")).toHaveText("LKR 5,500.00");

    // Go back online
    await page.context().setOffline(false);
    await app.waitForSyncIdle();

    // Reload page and verify balance persists
    await page.reload();
    await expect(page.getByTestId("account-detail-balance")).toHaveText("LKR 5,500.00");
  });

  test("S08-11: Responsive layout: sheet on mobile, dialog on desktop; keypad inputmode none", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0811", email: "s0811@example.com" });
    await app.waitForSyncIdle();

    await seedCalibrationEnvironment(page);

    await page.goto("/accounts/acc-cash");
    await page.click('[data-testid="calibrate-balance-btn"]');

    if (isMobile) {
      await expect(page.getByTestId("calibration-sheet")).toBeVisible();
    } else {
      await expect(page.getByTestId("calibration-dialog")).toBeVisible();
    }

    const input = page.getByTestId("real-balance-input");
    await expect(input).toHaveAttribute("inputmode", "none");
  });
});
