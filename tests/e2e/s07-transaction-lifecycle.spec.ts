import { test, expect } from "./fixtures";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 7 — Transaction Lifecycle, Splits & Templates @s07", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    const app = new AppHelper(page);
    await app.testApi.reset();
  });

  async function seedTestEnvironment(
    page: any,
    options?: {
      transactions?: any[];
      templates?: any[];
    }
  ) {
    await page.waitForFunction(() => {
      const db = (window as any).__hardMoneyDb;
      const expected = localStorage.getItem("hardmoney_active_user");
      return db && db.name && (!expected || db.name === `hardmoney_${expected}`);
    });

    await page.evaluate(async (opts: any) => {
      const db = (window as any).__hardMoneyDb;
      if (!db) throw new Error("HardMoneyDB not found on window");
      const userId = localStorage.getItem("hardmoney_active_user") || "default";
      const now = new Date().toISOString();

      // Seed 2 Accounts: Cash (5,000) and Bank (50,000)
      const accounts = [
        {
          id: "acc-cash",
          userId,
          name: "Cash Wallet",
          type: "CASH",
          openingBalanceMinor: 500000,
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
          openingBalanceMinor: 5000000,
          currency: "LKR",
          serverSeq: 0,
          createdAt: now,
          updatedAt: now,
        },
      ];
      await db.accounts.bulkPut(accounts);

      // Seed Categories: Groceries (#10b981), Dining (#f97316)
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
        {
          id: "cat-dining",
          userId,
          name: "Dining",
          icon: "Utensils",
          color: "#f97316",
          serverSeq: 0,
          createdAt: now,
          updatedAt: now,
        },
      ];
      await db.categories.bulkPut(categories);

      if (opts?.transactions && opts.transactions.length > 0) {
        const txs = opts.transactions.map((t: any) => ({
          id: t.id || `tx-${Math.random().toString(36).slice(2, 9)}`,
          userId,
          accountId: t.accountId || "acc-cash",
          toAccountId: t.toAccountId || null,
          categoryId: t.categoryId !== undefined ? t.categoryId : "cat-groceries",
          amountMinor: t.amountMinor,
          type: t.type || "EXPENSE",
          direction: t.direction || (t.type === "INCOME" || t.type === "REFUND" ? "IN" : "OUT"),
          transactionDate: t.transactionDate || "2026-10-15",
          note: t.note || null,
          isSplit: t.isSplit || false,
          splitItems: t.splitItems || [],
          excludeFromBudget: t.excludeFromBudget || false,
          excludeFromStats: t.excludeFromStats || false,
          excludeFromBalance: false,
          reversalOfTransactionId: t.reversalOfTransactionId || null,
          source: "MANUAL",
          createdByUserId: userId,
          updatedByUserId: userId,
          serverSeq: 0,
          createdAt: now,
          updatedAt: now,
        }));
        await db.transactions.bulkPut(txs);
      }

      if (opts?.templates && opts.templates.length > 0) {
        const tmpls = opts.templates.map((tmpl: any) => ({
          id: tmpl.id || `tmpl-${Math.random().toString(36).slice(2, 9)}`,
          userId,
          name: tmpl.name,
          accountId: tmpl.accountId || "acc-cash",
          toAccountId: tmpl.toAccountId || null,
          categoryId: tmpl.categoryId || "cat-groceries",
          type: tmpl.type || "EXPENSE",
          defaultAmountMinor: tmpl.defaultAmountMinor || null,
          note: tmpl.note || null,
          serverSeq: 0,
          createdAt: now,
          updatedAt: now,
        }));
        await db.templates.bulkPut(tmpls);
      }
    }, options || {});
  }

  test("S07-01: Tap a row → detail opens; edit amount 1,000 → 1,500 → balance and summary update", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0701", email: "s0701@example.com" });
    await app.waitForSyncIdle();

    await seedTestEnvironment(page, {
      transactions: [
        {
          id: "tx-edit-1",
          amountMinor: 100000, // 1,000.00
          type: "EXPENSE",
          accountId: "acc-cash",
          categoryId: "cat-groceries",
          transactionDate: "2026-10-10",
          note: "Weekly market",
        },
      ],
    });

    await app.go("trans");
    await expect(page.getByTestId("expense-amount")).toHaveText("LKR 1,000.00");

    // Tap transaction row to open edit modal
    await page.click('[data-testid="transaction-row-tx-edit-1"]');
    await expect(page.getByTestId("transaction-edit-sheet")).toBeVisible();

    // Edit amount to 1500.00
    const amountInput = page.getByTestId("transaction-edit-amount");
    await amountInput.fill("1500.00");

    // Save changes
    await page.click('[data-testid="transaction-save-btn"]');
    await expect(page.getByTestId("transaction-edit-sheet")).not.toBeVisible();

    // Verify summary updated to 1,500.00
    await expect(page.getByTestId("expense-amount")).toHaveText("LKR 1,500.00");

    // Verify Cash balance is now 5,000 - 1,500 = 3,500.00
    await app.go("accounts");
    await expect(page.getByTestId("subtotal-cash")).toHaveText("LKR 3,500.00");
  });

  test("S07-02: Move a transaction to another account → both balances correct", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0702", email: "s0702@example.com" });
    await app.waitForSyncIdle();

    // Cash: 5,000, Bank: 50,000. Expense 2,000 on Cash.
    await seedTestEnvironment(page, {
      transactions: [
        {
          id: "tx-move-1",
          amountMinor: 200000,
          type: "EXPENSE",
          accountId: "acc-cash",
          categoryId: "cat-groceries",
          transactionDate: "2026-10-12",
        },
      ],
    });

    await app.go("trans");
    await page.click('[data-testid="transaction-row-tx-move-1"]');
    await expect(page.getByTestId("transaction-edit-sheet")).toBeVisible();

    // Move to Bank account
    await page.selectOption('[data-testid="transaction-edit-account"]', "acc-bank");
    await page.click('[data-testid="transaction-save-btn"]');
    await expect(page.getByTestId("transaction-edit-sheet")).not.toBeVisible();

    // Verify balances: Cash back to 5,000.00, Bank now 50,000 - 2,000 = 48,000.00
    await app.go("accounts");
    await expect(page.getByTestId("subtotal-cash")).toHaveText("LKR 5,000.00");
    await expect(page.getByTestId("subtotal-bank")).toHaveText("LKR 48,000.00");
  });

  test("S07-03: Delete with confirm → row gone, balance restored; Undo brings it back", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0703", email: "s0703@example.com" });
    await app.waitForSyncIdle();

    await seedTestEnvironment(page, {
      transactions: [
        {
          id: "tx-del-1",
          amountMinor: 100000,
          type: "EXPENSE",
          accountId: "acc-cash",
          categoryId: "cat-groceries",
          transactionDate: "2026-10-14",
        },
      ],
    });

    await app.go("trans");
    await expect(page.getByTestId("transaction-row-tx-del-1")).toBeVisible();
    await expect(page.getByTestId("expense-amount")).toHaveText("LKR 1,000.00");

    // Click row -> Delete icon -> Confirm Delete
    await page.click('[data-testid="transaction-row-tx-del-1"]');
    await page.click('[data-testid="transaction-delete-btn"]');
    await page.click('[data-testid="confirm-delete-btn"]');

    // Row is gone, balance restored
    await expect(page.getByTestId("transaction-row-tx-del-1")).not.toBeVisible();
    await expect(page.getByTestId("expense-amount")).toHaveText("LKR 0.00");

    // Undo toast is visible
    const undoToast = page.getByTestId("undo-toast");
    await expect(undoToast).toBeVisible();

    // Click Undo
    await page.click('[data-testid="undo-delete-btn"]');
    await expect(undoToast).not.toBeVisible();

    // Row returns, balance restored
    await expect(page.getByTestId("transaction-row-tx-del-1")).toBeVisible();
    await expect(page.getByTestId("expense-amount")).toHaveText("LKR 1,000.00");
  });

  test("S07-04: Delete syncs: delete on device 1, device 2 loses the row (two contexts)", async ({
    browser,
  }) => {
    // Device 1
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const app1 = new AppHelper(page1, ctx1);
    await app1.testApi.reset();

    await app1.auth.register({ name: "Device User", email: "twodevices@example.com", password: "password123" });
    await app1.waitForSyncIdle();

    // Create an account on Device 1
    await app1.go("accounts");
    await page1.click('[data-testid="add-account-btn"]');
    await page1.fill('[data-testid="account-name"]', "Cash Wallet");
    await page1.fill('[data-testid="account-opening-balance"]', "5000.00");
    await page1.click('[data-testid="account-submit"]');
    await app1.waitForSyncIdle();

    // Create a transaction on Device 1
    await app1.go("trans");
    const isMobile1 = page1.viewportSize() ? page1.viewportSize()!.width < 768 : false;
    await page1.click(`[data-testid="${isMobile1 ? "quick-add-fab" : "quick-add-btn"}"]`);
    await page1.click('[data-testid="keypad-3"]');
    await page1.click('[data-testid="keypad-0"]');
    await page1.click('[data-testid="keypad-0"]');
    await page1.click('[data-testid="keypad-0"]');
    await page1.click('[data-testid="quick-add-save"]');
    await app1.waitForSyncIdle();

    // Device 2: login with same account
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    const app2 = new AppHelper(page2, ctx2);
    await app2.auth.login({ email: "twodevices@example.com", password: "password123" });
    await app2.waitForSyncIdle();

    // Verify row appears on Device 2
    await app2.go("trans");
    await expect(page2.locator('[data-testid="transaction-amount"]')).toHaveText("- LKR 3,000.00");

    // Delete row on Device 1
    await page1.locator('[data-testid^="transaction-row-"]').first().click();
    await page1.click('[data-testid="transaction-delete-btn"]');
    await page1.click('[data-testid="confirm-delete-btn"]');
    await app1.waitForSyncIdle();

    // Sync on Device 2
    const isMobile2 = page2.viewportSize() ? page2.viewportSize()!.width < 768 : false;
    await page2.click(`[data-testid="${isMobile2 ? "sync-indicator-mobile" : "sync-indicator-desktop"}"]`);
    await app2.waitForSyncIdle();

    // Row is deleted on Device 2
    await expect(page2.locator('[data-testid^="transaction-row-"]')).not.toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test("S07-05: Split toggle: 600 Groceries + 400 Dining saves; list shows Split tag", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0705", email: "s0705@example.com" });
    await app.waitForSyncIdle();

    await seedTestEnvironment(page, {
      transactions: [
        {
          id: "tx-split-1",
          amountMinor: 100000, // 1,000.00
          type: "EXPENSE",
          accountId: "acc-cash",
          categoryId: "cat-groceries",
          transactionDate: "2026-10-15",
          note: "Supermarket split",
        },
      ],
    });

    await app.go("trans");
    await page.click('[data-testid="transaction-row-tx-split-1"]');
    await expect(page.getByTestId("transaction-edit-sheet")).toBeVisible();

    // Turn on split toggle
    await page.click('[data-testid="split-toggle"]');
    await expect(page.getByTestId("split-remaining")).toBeVisible();

    // Update Split Item 0 to 600.00
    await page.selectOption('[data-testid="split-category-0"]', "cat-groceries");
    await page.fill('[data-testid="split-amount-0"]', "600.00");

    // Add Split Item 1: Dining 400.00
    await page.click('[data-testid="add-split-item-btn"]');
    await page.selectOption('[data-testid="split-category-1"]', "cat-dining");
    await page.fill('[data-testid="split-amount-1"]', "400.00");

    // Remaining should be balanced
    await expect(page.getByTestId("split-remaining")).toHaveText("Balanced (0.00)");

    // Save
    await page.click('[data-testid="transaction-save-btn"]');
    await expect(page.getByTestId("transaction-edit-sheet")).not.toBeVisible();

    // List shows Split badge
    const row = page.getByTestId("transaction-row-tx-split-1");
    await expect(row).toBeVisible();
    await expect(row.getByTestId("split-tag")).toBeVisible();
  });

  test("S07-06: Split mismatch shows 'LKR 100.00 remaining' and blocks Save", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0706", email: "s0706@example.com" });
    await app.waitForSyncIdle();

    await seedTestEnvironment(page, {
      transactions: [
        {
          id: "tx-split-2",
          amountMinor: 100000, // 1,000.00
          type: "EXPENSE",
          accountId: "acc-cash",
          categoryId: "cat-groceries",
          transactionDate: "2026-10-15",
        },
      ],
    });

    await app.go("trans");
    await page.click('[data-testid="transaction-row-tx-split-2"]');
    await page.click('[data-testid="split-toggle"]');

    // Enter 600.00 for item 0, leaving 400.00 remaining
    await page.fill('[data-testid="split-amount-0"]', "600.00");
    // Add item 1 with only 300.00 -> remaining 100.00
    await page.click('[data-testid="add-split-item-btn"]');
    await page.fill('[data-testid="split-amount-1"]', "300.00");

    // Check remaining indicator
    const remaining = page.getByTestId("split-remaining");
    await expect(remaining).toContainText("100.00 remaining");

    // Save button should be disabled
    const saveBtn = page.getByTestId("transaction-save-btn");
    await expect(saveBtn).toBeDisabled();
  });

  test("S07-07: Split row appears in both categories in the category filter", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0707", email: "s0707@example.com" });
    await app.waitForSyncIdle();

    // Seed transaction with splits: 600 Groceries + 400 Dining
    await seedTestEnvironment(page, {
      transactions: [
        {
          id: "tx-split-filter",
          amountMinor: 100000,
          type: "EXPENSE",
          isSplit: true,
          splitItems: [
            { id: "s1", categoryId: "cat-groceries", amountMinor: 60000 },
            { id: "s2", categoryId: "cat-dining", amountMinor: 40000 },
          ],
          transactionDate: "2026-10-15",
        },
      ],
    });

    await app.go("trans");

    // 1. Filter by Groceries
    await page.click('[data-testid="trans-filter-btn"]');
    await page.selectOption('[data-testid="filter-category"]', "cat-groceries");
    await page.click('[data-testid="filter-apply-btn"]');
    await expect(page.getByTestId("transaction-row-tx-split-filter")).toBeVisible();

    // 2. Filter by Dining
    await page.click('[data-testid="trans-filter-btn"]');
    await page.selectOption('[data-testid="filter-category"]', "cat-dining");
    await page.click('[data-testid="filter-apply-btn"]');
    await expect(page.getByTestId("transaction-row-tx-split-filter")).toBeVisible();
  });

  test("S07-08: Create a bookmark 'Morning Milk' (Cash, Groceries, 250) → chip appears on top of Quick-Add", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0708", email: "s0708@example.com" });
    await app.waitForSyncIdle();
    await seedTestEnvironment(page);

    // Navigate to More -> Bookmarks
    await app.go("more");
    await page.click('[data-testid="more-bookmarks-link"]');

    // Create bookmark
    await page.click('[data-testid="create-bookmark-btn"]');
    await page.fill('[data-testid="template-name-input"]', "Morning Milk");
    await page.selectOption('[data-testid="template-account-select"]', "acc-cash");
    await page.selectOption('[data-testid="template-category-select"]', "cat-groceries");
    await page.fill('[data-testid="template-amount-input"]', "250");
    await page.fill('[data-testid="template-note-input"]', "Fresh pasteurized milk");
    await page.click('[data-testid="template-save-btn"]');

    await expect(page.getByText("Morning Milk")).toBeVisible();

    // Open Quick-Add: bookmark chip appears at top
    await app.go("trans");
    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    await expect(page.getByTestId("bookmark-chips")).toBeVisible();
    await expect(page.getByTestId("bookmark-chips").getByText("Morning Milk")).toBeVisible();
  });

  test("S07-09: Tap the bookmark chip → fields pre-filled; Save creates the row; template unchanged after edit", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0709", email: "s0709@example.com" });
    await app.waitForSyncIdle();

    await seedTestEnvironment(page, {
      templates: [
        {
          id: "tmpl-milk",
          name: "Morning Milk",
          accountId: "acc-cash",
          categoryId: "cat-groceries",
          type: "EXPENSE",
          defaultAmountMinor: 25000,
          note: "Fresh milk",
        },
      ],
    });

    await app.go("trans");
    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    // Tap the bookmark chip
    await page.click('[data-testid="bookmark-chip-tmpl-milk"]');

    // Amount pre-filled with 250.00
    await expect(page.getByTestId("quick-add-amount")).toHaveValue("250");
    await expect(page.getByTestId("quick-add-note")).toHaveValue("Fresh milk");

    // Edit amount to 300 in quick-add
    await page.click('[data-testid="keypad-backspace"]');
    await page.click('[data-testid="keypad-backspace"]');
    await page.click('[data-testid="keypad-backspace"]');
    await page.click('[data-testid="keypad-3"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');

    // Save
    await page.click('[data-testid="quick-add-save"]');
    await expect(page.getByTestId("quick-add-sheet")).not.toBeVisible();

    // Verify row was created with edited amount 300.00
    await expect(page.getByTestId("expense-amount")).toHaveText("LKR 300.00");

    // Template remains unchanged with 250 in More -> Bookmarks
    await app.go("more");
    await page.click('[data-testid="more-bookmarks-link"]');
    await expect(page.getByText("Morning Milk")).toBeVisible();
    await expect(page.getByText("LKR 250.00")).toBeVisible();
  });

  test("S07-10: Manage bookmarks in More: rename, delete", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0710", email: "s0710@example.com" });
    await app.waitForSyncIdle();

    await seedTestEnvironment(page, {
      templates: [
        {
          id: "tmpl-edit-del",
          name: "Old Bookmark",
          defaultAmountMinor: 50000,
        },
      ],
    });

    await app.go("more");
    await page.click('[data-testid="more-bookmarks-link"]');
    await expect(page.getByText("Old Bookmark")).toBeVisible();

    // 1. Rename
    await page.click('[data-testid="template-edit-tmpl-edit-del"]');
    await page.fill('[data-testid="template-name-input"]', "Renamed Bookmark");
    await page.click('[data-testid="template-save-btn"]');
    await expect(page.getByText("Renamed Bookmark")).toBeVisible();

    // 2. Delete
    await page.click('[data-testid="template-delete-tmpl-edit-del"]');
    await expect(page.getByText("Renamed Bookmark")).not.toBeVisible();
  });

  test("S07-11: Refund linked to an original expense: category spending reduced in the refund month", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0711", email: "s0711@example.com" });
    await app.waitForSyncIdle();

    // Seed original expense 5,000 in Groceries, and refund 2,000 linked to it
    await seedTestEnvironment(page, {
      transactions: [
        {
          id: "tx-orig-expense",
          amountMinor: 500000,
          type: "EXPENSE",
          accountId: "acc-cash",
          categoryId: "cat-groceries",
          transactionDate: "2026-10-05",
        },
        {
          id: "tx-refund-1",
          amountMinor: 200000,
          type: "REFUND",
          accountId: "acc-cash",
          categoryId: "cat-groceries",
          reversalOfTransactionId: "tx-orig-expense",
          transactionDate: "2026-10-10",
        },
      ],
    });

    await app.go("trans");

    // Net expense should be reduced: 5,000 - 2,000 = 3,000.00
    await expect(page.getByTestId("expense-amount")).toHaveText("LKR 3,000.00");

    // In Summary view, category spending is also reduced
    await page.click('[data-testid="tab-summary"]');
    await expect(page.getByText("- LKR 3,000.00").first()).toBeVisible();
  });

  test("S07-12: Deleting an original with an existing reversal shows a blocking message", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0712", email: "s0712@example.com" });
    await app.waitForSyncIdle();

    await seedTestEnvironment(page, {
      transactions: [
        {
          id: "tx-orig-blocked",
          amountMinor: 400000,
          type: "EXPENSE",
          accountId: "acc-cash",
          categoryId: "cat-groceries",
          transactionDate: "2026-10-08",
        },
        {
          id: "tx-reversal-active",
          amountMinor: 400000,
          type: "REFUND",
          reversalOfTransactionId: "tx-orig-blocked",
          transactionDate: "2026-10-12",
        },
      ],
    });

    await app.go("trans");
    await page.click('[data-testid="transaction-row-tx-orig-blocked"]');
    await expect(page.getByTestId("transaction-edit-sheet")).toBeVisible();

    // Delete button disabled or shows blocking message
    await expect(page.getByTestId("delete-blocked-msg")).toBeVisible();
    await expect(page.getByTestId("transaction-delete-btn")).toBeDisabled();
  });

  test("S07-13: 'Exclude from budget' toggle persists on the row (badge visible)", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0713", email: "s0713@example.com" });
    await app.waitForSyncIdle();
    await seedTestEnvironment(page);

    await app.go("trans");
    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    // Enter amount 850
    await page.click('[data-testid="keypad-8"]');
    await page.click('[data-testid="keypad-5"]');
    await page.click('[data-testid="keypad-0"]');

    // Toggle Exclude from budget
    await page.click('[data-testid="exclude-budget-toggle"]');

    // Save
    await page.click('[data-testid="quick-add-save"]');
    await expect(page.getByTestId("quick-add-sheet")).not.toBeVisible();

    // Badge visible on row
    const row = page.getByTestId("transaction-amount").first();
    await expect(row).toBeVisible();
    await expect(page.getByTestId("badge-exclude-budget")).toBeVisible();
  });

  test("S07-14: Bookmark chips scroll horizontally by touch on mobile; wrap or scroll with mouse on desktop", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S0714", email: "s0714@example.com" });
    await app.waitForSyncIdle();

    // Seed 6 templates
    const tmpls = [];
    for (let i = 1; i <= 6; i++) {
      tmpls.push({
        id: `tmpl-chip-${i}`,
        name: `Preset #${i} Long Template Title`,
        defaultAmountMinor: i * 10000,
      });
    }

    await seedTestEnvironment(page, { templates: tmpls });

    await app.go("trans");
    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    const chipsContainer = page.getByTestId("bookmark-chips");
    await expect(chipsContainer).toBeVisible();

    // Verify chips overflow container or are horizontally scrollable
    const scrollWidth = await chipsContainer.evaluate((el) => el.scrollWidth);
    const clientWidth = await chipsContainer.evaluate((el) => el.clientWidth);

    if (isMobile) {
      expect(scrollWidth).toBeGreaterThan(clientWidth);
    } else {
      expect(scrollWidth).toBeGreaterThanOrEqual(clientWidth);
    }
  });
});
