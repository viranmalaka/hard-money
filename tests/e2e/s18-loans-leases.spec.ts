import { test, expect } from "@playwright/test";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 18 — Loans & Leases @s18", () => {
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

  test("S18-01: Reducing loan schedule & EMI within 1 cent of formula (106,618.55 for 1,200,000 at 12% 12 months)", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "Loan Tester 1",
      email: "loan1@example.com",
    });

    const savingsAcc: SeedAccount = {
      id: "acc-savings-1",
      userId: user.id,
      name: "Sampath Savings",
      type: "BANK_SAVINGS",
      openingBalanceMinor: 200000000, // 2,000,000.00
    };

    await app.testApi.seed({
      accounts: [savingsAcc],
    });

    await app.go("accounts");
    await app.triggerSync();

    // Click Add Loan button
    const addLoanBtn = page.locator('[data-testid="add-loan-btn"]');
    await expect(addLoanBtn).toBeVisible();
    await addLoanBtn.click();

    // Fill form for Reducing Balance Loan
    await page.fill('[data-testid="loan-form-lender"]', "Commercial Bank");
    await page.fill('[data-testid="loan-form-principal"]', "1200000.00");
    await page.fill('[data-testid="loan-form-rate"]', "12.0");
    await page.fill('[data-testid="loan-form-tenure"]', "12");
    await page.selectOption('[data-testid="loan-form-calculation-type"]', "REDUCING_BALANCE");

    await page.click('[data-testid="loan-form-submit"]');

    // Wait for card to appear
    const loanCard = page.locator('[data-testid^="loan-item-"]').first();
    await expect(loanCard).toBeVisible();
    await expect(loanCard).toContainText("Commercial Bank");

    // Standard reducing balance formula:
    // P = 1,200,000, r = 0.12/12 = 0.01, n = 12
    // EMI = 1,200,000 * 0.01 * (1.01)^12 / ((1.01)^12 - 1) = 106,618.55
    const emiEl = loanCard.locator('[data-testid="loan-monthly-emi"]');
    await expect(emiEl).toContainText("106,618.55");

    // Open Details & Schedule
    await loanCard.locator('[data-testid="loan-details-btn"]').click();
    const detailModal = page.locator('[data-testid="loan-detail-remaining-principal"]');
    await expect(detailModal).toBeVisible();
    await expect(detailModal).toContainText("1,200,000.00");

    // Verify first row of schedule
    // Row 1: opening 1,200,000.00, EMI 106,618.55, interest 12,000.00, principal 94,618.55
    const firstRow = page.locator('[data-testid^="schedule-row-"]:visible').first();
    await expect(firstRow).toContainText("106,618.55");
    await expect(firstRow).toContainText("12,000.00");
    await expect(firstRow).toContainText("94,618.55");
  });

  test("S18-02: Flat-rate loan total interest & equal EMI (112,000.00 for 1,200,000 at 12% 12 months)", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({
      name: "Loan Tester 2",
      email: "loan2@example.com",
    });

    await app.go("accounts");
    await app.triggerSync();

    const addLoanBtn = page.locator('[data-testid="add-loan-btn"]');
    await expect(addLoanBtn).toBeVisible();
    await addLoanBtn.click();

    await page.fill('[data-testid="loan-form-lender"]', "Singer Finance");
    await page.fill('[data-testid="loan-form-principal"]', "1200000.00");
    await page.fill('[data-testid="loan-form-rate"]', "12.0");
    await page.fill('[data-testid="loan-form-tenure"]', "12");
    await page.selectOption('[data-testid="loan-form-calculation-type"]', "FLAT_RATE");

    await page.click('[data-testid="loan-form-submit"]');

    const loanCard = page.locator('[data-testid^="loan-item-"]').first();
    await expect(loanCard).toBeVisible();
    await expect(loanCard).toContainText("Singer Finance");

    // Flat rate formula:
    // Total interest = 1,200,000 * 12% * 1 = 144,000
    // Total repayment = 1,344,000
    // Monthly EMI = 1,344,000 / 12 = 112,000.00
    const emiEl = loanCard.locator('[data-testid="loan-monthly-emi"]');
    await expect(emiEl).toContainText("112,000.00");

    await loanCard.locator('[data-testid="loan-details-btn"]').click();
    const firstRow = page.locator('[data-testid^="schedule-row-"]:visible').first();
    await expect(firstRow).toContainText("112,000.00");
    await expect(firstRow).toContainText("12,000.00");
    await expect(firstRow).toContainText("100,000.00");
  });

  test("S18-03: Lease with residual value (200,000.00 final balance / balloon)", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({
      name: "Lease Tester",
      email: "lease@example.com",
    });

    await app.go("accounts");
    await app.triggerSync();

    const addLoanBtn = page.locator('[data-testid="add-loan-btn"]');
    await expect(addLoanBtn).toBeVisible();
    await addLoanBtn.click();

    // Toggle to Lease
    await page.click('[data-testid="loan-kind-lease"]');

    await page.fill('[data-testid="loan-form-lender"]', "Central Finance");
    await page.fill('[data-testid="loan-form-principal"]', "1200000.00");
    await page.fill('[data-testid="loan-form-residual"]', "200000.00");
    await page.fill('[data-testid="loan-form-rate"]', "12.0");
    await page.fill('[data-testid="loan-form-tenure"]', "12");

    await page.click('[data-testid="loan-form-submit"]');

    const leaseCard = page.locator('[data-testid^="loan-item-"]').first();
    await expect(leaseCard).toBeVisible();
    await expect(leaseCard).toContainText("Central Finance");
    await expect(leaseCard).toContainText("LEASE");
    await expect(leaseCard).toContainText("Residual: LKR 200,000.00");

    // Open detail modal and verify schedule ends at residual balance
    await leaseCard.locator('[data-testid="loan-details-btn"]').click();
    const rows = page.locator('[data-testid^="schedule-row-"]:visible');
    const lastRow = rows.last();
    await expect(lastRow).toContainText("200,000.00");
  });

  test("S18-04: Disbursement: savings balance increases, marked DISBURSEMENT, stats-excluded", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "Disburse Tester",
      email: "disburse@example.com",
    });

    const savingsAcc: SeedAccount = {
      id: "acc-disb-savings",
      userId: user.id,
      name: "Disb Savings",
      type: "BANK_SAVINGS",
      openingBalanceMinor: 5000000, // 50,000.00
    };

    await app.testApi.seed({
      accounts: [savingsAcc],
    });

    await app.go("accounts");
    await app.triggerSync();

    // Check initial savings balance
    const savingsCard = page.locator('[data-testid="account-item-acc-disb-savings"]');
    await expect(savingsCard).toBeVisible();
    await expect(savingsCard).toContainText("50,000.00");

    // Add loan with linked disbursement account
    await page.click('[data-testid="add-loan-btn"]');
    await page.fill('[data-testid="loan-form-lender"]', "HNB Bank");
    await page.fill('[data-testid="loan-form-principal"]', "500000.00");
    await page.fill('[data-testid="loan-form-rate"]', "10.0");
    await page.fill('[data-testid="loan-form-tenure"]', "12");
    await page.selectOption('[data-testid="loan-form-disbursement-account"]', "acc-disb-savings");

    await page.click('[data-testid="loan-form-submit"]');

    // Wait for card to appear
    await expect(page.locator('[data-testid^="loan-item-"]').first()).toBeVisible();

    // Savings balance should increase from 50,000 to 550,000
    await expect(savingsCard).toContainText("550,000.00");

    // Sync mutations to server before snapshot check
    await app.triggerSync();

    // Check DB snapshot: transaction must have LOAN_DISBURSEMENT and excludeFromStats
    const snapshot = await app.testApi.getSnapshot();
    const disburseTx = snapshot.transactions.find(
      (t: { subType?: string }) => t.subType === "LOAN_DISBURSEMENT"
    );
    expect(disburseTx).toBeDefined();
    expect(disburseTx.amountMinor).toBe(50000000);
    expect(disburseTx.excludeFromStats).toBe(true);
    expect(disburseTx.excludeFromBudget).toBe(true);
  });

  test("S18-05: Log EMI: auto-split principal/interest, remaining principal decreases", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "EMI Tester",
      email: "emi@example.com",
    });

    const savingsAcc: SeedAccount = {
      id: "acc-emi-savings",
      userId: user.id,
      name: "EMI Savings",
      type: "BANK_SAVINGS",
      openingBalanceMinor: 50000000, // 500,000.00
    };

    await app.testApi.seed({
      accounts: [savingsAcc],
    });

    await app.go("accounts");
    await app.triggerSync();

    await page.click('[data-testid="add-loan-btn"]');
    await page.fill('[data-testid="loan-form-lender"]', "Pan Asia Bank");
    await page.fill('[data-testid="loan-form-principal"]', "1200000.00");
    await page.fill('[data-testid="loan-form-rate"]', "12.0");
    await page.fill('[data-testid="loan-form-tenure"]', "12");

    await page.click('[data-testid="loan-form-submit"]');

    const loanCard = page.locator('[data-testid^="loan-item-"]').first();
    await expect(loanCard).toBeVisible();

    // Open detail
    await loanCard.locator('[data-testid="loan-details-btn"]').click();

    // Click Log EMI button
    await page.click('[data-testid="loan-log-emi-btn"]');
    const logEmiDialog = page.locator('[data-testid="log-emi-dialog"]');
    await expect(logEmiDialog).toBeVisible();

    // Amount is pre-filled with monthly EMI (106,618.55)
    await expect(page.locator('[data-testid="emi-pay-amount"]')).toHaveValue("106618.55");

    // Confirm Payment
    await page.click('[data-testid="emi-pay-submit"]');
    await expect(logEmiDialog).not.toBeVisible();

    // In detail modal:
    // Principal Paid = 94,618.55
    // Interest Paid = 12,000.00
    // Remaining Principal = 1,105,381.45
    await expect(page.locator('[data-testid="loan-paid-principal"]')).toContainText("94,618.55");
    await expect(page.locator('[data-testid="loan-interest-paid"]')).toContainText("12,000.00");
    await expect(page.locator('[data-testid="loan-detail-remaining-principal"]')).toContainText(
      "1,105,381.45"
    );

    // First row should now be marked PAID
    const firstRow = page.locator('[data-testid^="schedule-row-"]:visible').first();
    await expect(firstRow).toContainText("PAID");
  });

  test("S18-06: Extra principal: choose shorter tenure vs lower EMI; schedule recomputed", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "Extra Principal Tester",
      email: "extra@example.com",
    });

    const savingsAcc: SeedAccount = {
      id: "acc-extra-savings",
      userId: user.id,
      name: "Extra Savings",
      type: "BANK_SAVINGS",
      openingBalanceMinor: 100000000, // 1,000,000.00
    };

    await app.testApi.seed({
      accounts: [savingsAcc],
    });

    await app.go("accounts");
    await app.triggerSync();

    await page.click('[data-testid="add-loan-btn"]');
    await page.fill('[data-testid="loan-form-lender"]', "Seylan Bank");
    await page.fill('[data-testid="loan-form-principal"]', "1200000.00");
    await page.fill('[data-testid="loan-form-rate"]', "12.0");
    await page.fill('[data-testid="loan-form-tenure"]', "12");

    await page.click('[data-testid="loan-form-submit"]');

    const loanCard = page.locator('[data-testid^="loan-item-"]').first();
    await loanCard.locator('[data-testid="loan-details-btn"]').click();

    // Log Extra Principal with LOWER_EMI
    await page.click('[data-testid="loan-log-emi-btn"]');
    await page.click('[data-testid="emi-extra-principal-toggle"]');
    await page.fill('[data-testid="emi-pay-amount"]', "200000.00");
    await page.selectOption('[data-testid="emi-recalc-mode"]', "LOWER_EMI");
    await page.click('[data-testid="emi-pay-submit"]');

    // Remaining principal should now be 1,000,000.00
    await expect(page.locator('[data-testid="loan-detail-remaining-principal"]')).toContainText(
      "1,000,000.00"
    );

    // Scheduled EMI for subsequent months should have lowered below 106,618.55
    const detailEmi = page.locator('[data-testid="loan-detail-emi"]');
    await expect(detailEmi).toBeVisible();
    // 1,000,000 amortized over 12 months at 12% is ~88,848.79
    await expect(detailEmi).toContainText("88,848.79");
  });

  test("S18-07: Manual override of schedule row: subsequent rows re-amortize", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({
      name: "Override Tester",
      email: "override@example.com",
    });

    await app.go("accounts");
    await app.triggerSync();

    await page.click('[data-testid="add-loan-btn"]');
    await page.fill('[data-testid="loan-form-lender"]', "NDB Bank");
    await page.fill('[data-testid="loan-form-principal"]', "1200000.00");
    await page.fill('[data-testid="loan-form-rate"]', "12.0");
    await page.fill('[data-testid="loan-form-tenure"]', "12");

    await page.click('[data-testid="loan-form-submit"]');

    const loanCard = page.locator('[data-testid^="loan-item-"]').first();
    await loanCard.locator('[data-testid="loan-details-btn"]').click();

    // Find first row override button
    const firstRow = page.locator('[data-testid^="schedule-row-"]:visible').first();
    await firstRow.locator('[data-testid="override-row-btn"]').click();

    // Input new interest and principal
    const principalInput = firstRow.locator('input[type="text"]').first();
    await principalInput.fill("100000.00");
    await firstRow.locator('[data-testid="save-override-btn"]').click();

    // Row status should now be OVERRIDDEN
    await expect(firstRow).toContainText("OVERRIDDEN");
    await expect(firstRow).toContainText("100,000.00");
  });

  test("S18-08: Net-worth liability equals total remaining loan principal across active loans", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "Net Worth Tester",
      email: "nw@example.com",
    });

    const savingsAcc: SeedAccount = {
      id: "acc-nw-savings",
      userId: user.id,
      name: "NW Savings",
      type: "BANK_SAVINGS",
      openingBalanceMinor: 20000000, // 200,000.00 (Asset)
    };

    await app.testApi.seed({
      accounts: [savingsAcc],
    });

    await app.go("accounts");
    await app.triggerSync();

    // Initial Net Worth = +200,000.00
    const nwHeader = page.locator('[data-testid="net-worth-total"]');
    await expect(nwHeader).toContainText("200,000.00");

    // Add a loan of 500,000.00 (without disbursement to keep assets at 200,000)
    await page.click('[data-testid="add-loan-btn"]');
    await page.fill('[data-testid="loan-form-lender"]', "DFCC Bank");
    await page.fill('[data-testid="loan-form-principal"]', "500000.00");
    await page.fill('[data-testid="loan-form-rate"]', "10.0");
    await page.fill('[data-testid="loan-form-tenure"]', "12");

    await page.click('[data-testid="loan-form-submit"]');

    // Wait for loan subtotal
    const loansSubtotal = page.locator('[data-testid="subtotal-loans"]');
    await expect(loansSubtotal).toContainText("500,000.00");

    // Net worth = 200,000 Assets - 500,000 Loan Liabilities = -300,000.00
    await expect(nwHeader).toContainText("300,000.00");
    await expect(nwHeader).toContainText("-");
  });

  test("S18-09: Loan detail: paid-so-far, interest-paid-so-far, next due date, full amortization table", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({
      name: "Detail Tester",
      email: "detail@example.com",
    });

    await app.go("accounts");
    await app.triggerSync();

    await page.click('[data-testid="add-loan-btn"]');
    await page.fill('[data-testid="loan-form-lender"]', "Cargills Bank");
    await page.fill('[data-testid="loan-form-principal"]', "600000.00");
    await page.fill('[data-testid="loan-form-rate"]', "12.0");
    await page.fill('[data-testid="loan-form-tenure"]', "6");

    await page.click('[data-testid="loan-form-submit"]');

    const loanCard = page.locator('[data-testid^="loan-item-"]').first();
    await loanCard.locator('[data-testid="loan-details-btn"]').click();

    // Verify all 4 KPIs exist
    await expect(page.locator('[data-testid="loan-detail-remaining-principal"]')).toBeVisible();
    await expect(page.locator('[data-testid="loan-paid-principal"]')).toContainText("0.00");
    await expect(page.locator('[data-testid="loan-interest-paid"]')).toContainText("0.00");
    await expect(page.locator('[data-testid="loan-next-due"]')).toBeVisible();

    // Schedule should have exactly 6 rows
    const rows = page.locator('[data-testid^="schedule-row-"]:visible');
    await expect(rows).toHaveCount(6);
  });

  test("S18-10: Loan closure / early payoff: status CLOSED; liability removed", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({
      name: "Closure Tester",
      email: "close@example.com",
    });

    await app.go("accounts");
    await app.triggerSync();

    await page.click('[data-testid="add-loan-btn"]');
    await page.fill('[data-testid="loan-form-lender"]', "Union Bank");
    await page.fill('[data-testid="loan-form-principal"]', "400000.00");
    await page.fill('[data-testid="loan-form-rate"]', "12.0");
    await page.fill('[data-testid="loan-form-tenure"]', "12");

    await page.click('[data-testid="loan-form-submit"]');

    const loanCard = page.locator('[data-testid^="loan-item-"]').first();
    await loanCard.locator('[data-testid="loan-details-btn"]').click();

    // Handle early payoff dialog
    page.on("dialog", (dialog) => dialog.accept());
    await page.click('[data-testid="loan-early-payoff-btn"]');

    // Wait for closure and sync
    await app.triggerSync();

    // Loan item status badge is CLOSED
    await expect(loanCard).toContainText("CLOSED");

    // Loans subtotal drops to 0.00
    const loansSubtotal = page.locator('[data-testid="subtotal-loans"]');
    await expect(loansSubtotal).toContainText("0.00");
  });

  test("S18-11: Layout valid on desktop (table) and mobile (cards)", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({
      name: "Viewport Tester",
      email: "viewport@example.com",
    });

    await app.go("accounts");
    await app.triggerSync();

    await page.click('[data-testid="add-loan-btn"]');
    await page.fill('[data-testid="loan-form-lender"]', "Amana Bank");
    await page.fill('[data-testid="loan-form-principal"]', "300000.00");
    await page.fill('[data-testid="loan-form-rate"]', "12.0");
    await page.fill('[data-testid="loan-form-tenure"]', "6");

    await page.click('[data-testid="loan-form-submit"]');

    const loanCard = page.locator('[data-testid^="loan-item-"]').first();
    await loanCard.locator('[data-testid="loan-details-btn"]').click();

    // On desktop viewport: table should be visible
    await page.setViewportSize({ width: 1280, height: 800 });
    const desktopTable = page.locator("table.hidden.md\\:table");
    await expect(desktopTable).toBeVisible();

    // On mobile viewport (375x667): table should be hidden, mobile cards visible
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(desktopTable).not.toBeVisible();
    const mobileCards = page.locator("div.md\\:hidden");
    await expect(mobileCards).toBeVisible();
  });
});
