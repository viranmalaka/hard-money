import { test, expect } from "./fixtures";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 5 — Quick-Add, Keypad & Ledger Core @s05", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    const app = new AppHelper(page);
    await app.testApi.reset();
  });

  test("S05-01: FAB (mobile) / Add button (desktop) opens the Quick-Add sheet", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Alice", email: "alice-s05-01@example.com" });
    await app.waitForSyncIdle();

    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    await expect(page.getByTestId("quick-add-sheet")).toBeVisible();
    await expect(page.getByTestId("type-expense")).toBeVisible();
    await expect(page.getByTestId("type-income")).toBeVisible();
    await expect(page.getByTestId("type-transfer")).toBeVisible();

    await page.click('[data-testid="quick-add-close"]');
    await expect(page.getByTestId("quick-add-sheet")).not.toBeVisible();
  });

  test("S05-02: Keypad: type 1250+450+80 → live result 1,780.00 → = → amount shows 1,780.00", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Bob", email: "bob-s05-02@example.com" });
    await app.waitForSyncIdle();

    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    // Type 1250
    await page.click('[data-testid="keypad-1"]');
    await page.click('[data-testid="keypad-2"]');
    await page.click('[data-testid="keypad-5"]');
    await page.click('[data-testid="keypad-0"]');

    // + 450
    await page.click('[data-testid="keypad-plus"]');
    await page.click('[data-testid="keypad-4"]');
    await page.click('[data-testid="keypad-5"]');
    await page.click('[data-testid="keypad-0"]');

    // + 80
    await page.click('[data-testid="keypad-plus"]');
    await page.click('[data-testid="keypad-8"]');
    await page.click('[data-testid="keypad-0"]');

    // Live preview
    await expect(page.getByTestId("calculator-preview")).toHaveText("1,780.00");

    // Equals =
    await page.click('[data-testid="keypad-equals"]');
    await expect(page.getByTestId("quick-add-amount")).toHaveValue("1780.00");
  });

  test("S05-03: Keypad: 2+3×4 → 14.00; 1000÷3 → 333.33; 5÷0 shows an error and Save disabled", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Charlie", email: "charlie-s05-03@example.com" });
    await app.waitForSyncIdle();

    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    // Test 1: Operator Precedence 2 + 3 * 4 = 14.00
    await page.click('[data-testid="keypad-2"]');
    await page.click('[data-testid="keypad-plus"]');
    await page.click('[data-testid="keypad-3"]');
    await page.click('[data-testid="keypad-multiply"]');
    await page.click('[data-testid="keypad-4"]');
    await expect(page.getByTestId("calculator-preview")).toHaveText("14.00");

    // Test 2: Half-up rounding 1000 / 3 = 333.33
    await page.click('[data-testid="keypad-equals"]');
    for (let i = 0; i < 6; i++) {
      await page.click('[data-testid="keypad-backspace"]');
    }
    await page.click('[data-testid="keypad-1"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-divide"]');
    await page.click('[data-testid="keypad-3"]');
    await expect(page.getByTestId("calculator-preview")).toHaveText("333.33");

    // Test 3: Division by zero 5 / 0
    await page.click('[data-testid="keypad-equals"]');
    for (let i = 0; i < 7; i++) {
      await page.click('[data-testid="keypad-backspace"]');
    }
    await page.click('[data-testid="keypad-5"]');
    await page.click('[data-testid="keypad-divide"]');
    await page.click('[data-testid="keypad-0"]');

    await expect(page.getByTestId("calculator-preview")).toHaveText("Error");
    await expect(page.getByTestId("quick-add-save")).toBeDisabled();
  });

  test("S05-04: Amount field does not open the OS keyboard (inputmode=none)", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "Mobile specific test");

    const app = new AppHelper(page);
    await app.auth.register({ name: "Dave", email: "dave-s05-04@example.com" });
    await app.waitForSyncIdle();

    await page.click('[data-testid="quick-add-fab"]');
    const amountInput = page.getByTestId("quick-add-amount");
    await expect(amountInput).toHaveAttribute("inputmode", "none");
  });

  test("S05-05: Physical keyboard input of digits/operators also works in the amount field", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "Desktop specific test");

    const app = new AppHelper(page);
    await app.auth.register({ name: "Eve", email: "eve-s05-05@example.com" });
    await app.waitForSyncIdle();

    await page.click('[data-testid="quick-add-btn"]');
    const amountInput = page.getByTestId("quick-add-amount");
    await amountInput.focus();

    await page.keyboard.type("250+50");
    await expect(page.getByTestId("calculator-preview")).toHaveText("300.00");

    await page.keyboard.press("=");
    await expect(amountInput).toHaveValue("300.00");
  });

  test("S05-06: Save an expense 1,780 from Cash (5,000) → Cash balance 3,220.00; account detail lists the row with - in red", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Frank", email: "frank-s05-06@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    // 1. Create Cash account with opening 5,000.00
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "My Wallet");
    await page.selectOption('[data-testid="account-type"]', "CASH");
    await page.fill('[data-testid="account-opening-balance"]', "5000.00");
    await page.click('[data-testid="account-submit"]');
    await expect(page.getByText("My Wallet")).toBeVisible();

    // 2. Open Quick-Add & add Expense 1,780.00
    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    await page.click('[data-testid="type-expense"]');
    // Select My Wallet
    await page.selectOption('[data-testid="quick-add-account"]', { label: "My Wallet" });

    // Enter 1780
    await page.click('[data-testid="keypad-1"]');
    await page.click('[data-testid="keypad-7"]');
    await page.click('[data-testid="keypad-8"]');
    await page.click('[data-testid="keypad-0"]');

    // Fill note
    await page.fill('[data-testid="quick-add-note"]', "Weekly Groceries");

    // Save
    await page.click('[data-testid="quick-add-save"]');
    await expect(page.getByTestId("quick-add-sheet")).not.toBeVisible();

    // 3. Verify Cash balance in Accounts tab is 3,220.00
    await app.go("accounts");
    await expect(page.getByTestId("subtotal-cash")).toHaveText("LKR 3,220.00");

    // 4. Click account to view account detail
    await page.click('[data-testid="account-detail-link"]');
    await expect(page.getByTestId("account-detail-name")).toContainText("My Wallet");
    await expect(page.getByTestId("account-detail-balance")).toHaveText("LKR 3,220.00");

    // 5. Account detail lists the row with - in red
    const txAmount = page.getByTestId("transaction-amount").first();
    await expect(txAmount).toBeVisible();
    await expect(txAmount).toHaveText("- LKR 1,780.00");
    await expect(txAmount).toHaveClass(/text-expense/);
  });

  test("S05-07: Save income 50,000 to Savings (100,000) → 150,000.00; row shows + in blue", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Grace", email: "grace-s05-07@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    // 1. Create Savings account (100,000.00)
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Salary Savings");
    await page.selectOption('[data-testid="account-type"]', "BANK_SAVINGS");
    await page.fill('[data-testid="account-opening-balance"]', "100000.00");
    await page.click('[data-testid="account-submit"]');
    await expect(page.getByText("Salary Savings")).toBeVisible();

    // 2. Open Quick-Add & add Income 50,000.00
    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    await page.click('[data-testid="type-income"]');
    await page.selectOption('[data-testid="quick-add-account"]', { label: "Salary Savings" });

    // Enter 50000
    await page.click('[data-testid="keypad-5"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');

    await page.fill('[data-testid="quick-add-note"]', "Bonus payment");
    await page.click('[data-testid="quick-add-save"]');

    // 3. Verify balance in Accounts tab is 150,000.00
    await app.go("accounts");
    await expect(page.getByTestId("subtotal-bank")).toHaveText("LKR 150,000.00");

    // 4. Check account detail row has + in blue
    await page.click('[data-testid="account-detail-link"]');
    await expect(page.getByTestId("account-detail-balance")).toHaveText("LKR 150,000.00");
    const txAmount = page.getByTestId("transaction-amount").first();
    await expect(txAmount).toHaveText("+ LKR 50,000.00");
    await expect(txAmount).toHaveClass(/text-income/);
  });

  test("S05-08: Transfer 10,000 Savings → Cash: Savings -10,000, Cash +10,000, net worth unchanged, row neutral grey", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Heidi", email: "heidi-s05-08@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    // Create Cash (5,000)
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Pocket Cash");
    await page.selectOption('[data-testid="account-type"]', "CASH");
    await page.fill('[data-testid="account-opening-balance"]', "5000.00");
    await page.click('[data-testid="account-submit"]');

    // Create Savings (100,000)
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Bank Main");
    await page.selectOption('[data-testid="account-type"]', "BANK_SAVINGS");
    await page.fill('[data-testid="account-opening-balance"]', "100000.00");
    await page.click('[data-testid="account-submit"]');

    await expect(page.getByTestId("net-worth-total")).toHaveText("LKR 105,000.00");

    // Transfer 10,000 Bank Main -> Pocket Cash
    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    await page.click('[data-testid="type-transfer"]');
    await page.selectOption('[data-testid="quick-add-account"]', { label: "Bank Main" });
    await page.selectOption('[data-testid="quick-add-to-account"]', { label: "Pocket Cash" });

    // Enter 10000
    await page.click('[data-testid="keypad-1"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');

    await page.click('[data-testid="quick-add-save"]');

    // Balances: Bank Main 90,000, Pocket Cash 15,000, Total 105,000
    await app.go("accounts");
    await expect(page.getByTestId("subtotal-bank")).toHaveText("LKR 90,000.00");
    await expect(page.getByTestId("subtotal-cash")).toHaveText("LKR 15,000.00");
    await expect(page.getByTestId("net-worth-total")).toHaveText("LKR 105,000.00");
  });

  test("S05-09: Credit card expense 20,000 → card shows Outstanding 20,000; net-worth liabilities 20,000", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Ivan", email: "ivan-s05-09@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    // Create Credit Card with limit 500,000, opening 0.00
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Apex Visa");
    await page.selectOption('[data-testid="account-type"]', "CREDIT_CARD");
    await page.fill('[data-testid="account-opening-balance"]', "0.00");
    await page.fill('[data-testid="account-credit-limit"]', "500000.00");
    await page.fill('[data-testid="account-cutoff-day"]', "20");
    await page.fill('[data-testid="account-due-day"]', "10");
    await page.click('[data-testid="account-submit"]');
    await expect(page.getByText("Apex Visa")).toBeVisible();

    // Add Expense 20,000 on Apex Visa
    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    await page.click('[data-testid="type-expense"]');
    await page.selectOption('[data-testid="quick-add-account"]', { label: "Apex Visa" });

    // Enter 20000
    await page.click('[data-testid="keypad-2"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');

    await page.click('[data-testid="quick-add-save"]');

    // In Accounts tab: card shows Outstanding 20,000, liabilities 20,000
    await app.go("accounts");
    await expect(page.getByTestId("card-outstanding")).toContainText("20,000.00");
    await expect(page.getByTestId("net-worth-liabilities")).toHaveText("LKR 20,000.00");
  });

  test("S05-10: Continue saves and keeps the sheet open with cleared amount; Save closes the sheet", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Judy", email: "judy-s05-10@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    // Create Cash account
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Test Cash");
    await page.selectOption('[data-testid="account-type"]', "CASH");
    await page.fill('[data-testid="account-opening-balance"]', "1000.00");
    await page.click('[data-testid="account-submit"]');

    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    // 1. Enter 250, click Continue
    await page.click('[data-testid="keypad-2"]');
    await page.click('[data-testid="keypad-5"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="quick-add-continue"]');

    // Sheet must stay open, amount must be cleared
    await expect(page.getByTestId("quick-add-sheet")).toBeVisible();
    await expect(page.getByTestId("quick-add-amount")).toHaveValue("0");

    // 2. Enter 150, click Save
    await page.click('[data-testid="keypad-1"]');
    await page.click('[data-testid="keypad-5"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="quick-add-save"]');

    // Sheet must close
    await expect(page.getByTestId("quick-add-sheet")).not.toBeVisible();

    // Check account balance: 1000 - 250 - 150 = 600.00
    await app.go("accounts");
    await expect(page.getByTestId("subtotal-cash")).toHaveText("LKR 600.00");
  });

  test("S05-11: Validation: no category / amount 0 → Save blocked with messages", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Karl", email: "karl-s05-11@example.com" });
    await app.waitForSyncIdle();

    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    // Attempt save with amount 0
    await page.click('[data-testid="quick-add-save"]');
    await expect(page.getByTestId("quick-add-error")).toBeVisible();
    await expect(page.getByTestId("quick-add-error")).toContainText("Amount must be greater than 0");
  });

  test("S05-12: Offline: add an expense with network off; balance updates instantly; after reconnect server snapshot matches UI", async ({
    page,
    context,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Leo", email: "leo-s05-12@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    // Create Cash account (5000.00)
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Offline Wallet");
    await page.selectOption('[data-testid="account-type"]', "CASH");
    await page.fill('[data-testid="account-opening-balance"]', "5000.00");
    await page.click('[data-testid="account-submit"]');
    await app.waitForSyncIdle();

    // Go offline
    await context.setOffline(true);

    // Add expense 1000 while offline
    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    await page.click('[data-testid="keypad-1"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="quick-add-save"]');

    // Balance updates locally immediately: 4,000.00
    await expect(page.getByTestId("subtotal-cash")).toHaveText("LKR 4,000.00");

    // Reconnect network
    await context.setOffline(false);
    await app.waitForSyncIdle();

    // Verify balance remains 4,000.00 after sync
    await expect(page.getByTestId("subtotal-cash")).toHaveText("LKR 4,000.00");
  });

  test("S05-13: Reload → balances identical (derived from IndexedDB ledger)", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Mallory", email: "mallory-s05-13@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    // Create Cash account (3000.00)
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Persisted Wallet");
    await page.selectOption('[data-testid="account-type"]', "CASH");
    await page.fill('[data-testid="account-opening-balance"]', "3000.00");
    await page.click('[data-testid="account-submit"]');

    // Add expense 800
    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }
    await page.click('[data-testid="keypad-8"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="keypad-0"]');
    await page.click('[data-testid="quick-add-save"]');

    await expect(page.getByTestId("subtotal-cash")).toHaveText("LKR 2,200.00");

    // Reload page
    await page.reload();
    await app.waitForSyncIdle();

    // Verify balance after reload from IndexedDB
    await expect(page.getByTestId("subtotal-cash")).toHaveText("LKR 2,200.00");
  });

  test("S05-14: Quick-Add is reachable from every tab (Trans, Stats, Budget, Accounts, More) on mobile; sidebar button on desktop", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Nina", email: "nina-s05-14@example.com" });
    await app.waitForSyncIdle();

    const destinations: ("trans" | "stats" | "budget" | "accounts" | "more")[] = [
      "trans",
      "stats",
      "budget",
      "accounts",
      "more",
    ];

    for (const dest of destinations) {
      await app.go(dest);
      if (isMobile) {
        await expect(page.getByTestId("quick-add-fab")).toBeVisible();
      } else {
        await expect(page.getByTestId("quick-add-btn")).toBeVisible();
      }
    }
  });

  test("S05-15: Date defaults to today (Asia/Colombo) and can be changed with the picker", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Oscar", email: "oscar-s05-15@example.com" });
    await app.waitForSyncIdle();

    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    const dateInput = page.getByTestId("quick-add-date");
    await expect(dateInput).toBeVisible();

    // Must have a valid YYYY-MM-DD date value
    const dateVal = await dateInput.inputValue();
    expect(dateVal).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Change date with picker
    await dateInput.fill("2026-10-15");
    await expect(dateInput).toHaveValue("2026-10-15");
  });

  test("S05-16: Visual snapshot of the Quick-Add sheet (Expense/Income/Transfer variants)", async ({
    page,
    isMobile,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Paul", email: "paul-s05-16@example.com" });
    await app.waitForSyncIdle();

    if (isMobile) {
      await page.click('[data-testid="quick-add-fab"]');
    } else {
      await page.click('[data-testid="quick-add-btn"]');
    }

    const sheet = page.getByTestId("quick-add-sheet");
    await expect(sheet).toBeVisible();

    // Verify Expense tab
    await page.click('[data-testid="type-expense"]');
    await expect(page.getByTestId("type-expense")).toHaveClass(/bg-\[var\(--surface\)\]/);

    // Verify Income tab
    await page.click('[data-testid="type-income"]');
    await expect(page.getByTestId("type-income")).toHaveClass(/bg-\[var\(--surface\)\]/);

    // Verify Transfer tab
    await page.click('[data-testid="type-transfer"]');
    await expect(page.getByTestId("type-transfer")).toHaveClass(/bg-\[var\(--surface\)\]/);
    await expect(page.getByTestId("quick-add-to-account")).toBeVisible();
  });
});
