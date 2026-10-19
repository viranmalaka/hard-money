import { test, expect } from "@playwright/test";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 17 — Fixed Deposits @s17", () => {
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

  interface SeedFixedDeposit {
    id: string;
    userId?: string;
    bankName: string;
    accountNumber?: string | null;
    principalAmountMinor: number;
    annualInterestRateBps: number;
    tenureMonths: number;
    startDate: string;
    maturityDate: string;
    compoundingFrequency?: string;
    payoutMode?: string;
    linkedPayoutAccountId?: string | null;
    fundingAccountId?: string | null;
    withholdingTaxRateBps?: number;
    autoRenew?: boolean;
    status?: string;
  }

  test("S17-01: Create FD (1,000,000, 12%, 12 months, monthly payout, WHT 5%, linked Savings): card shows monthly net 9,500", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "FD Tester",
      email: "fd1@example.com",
    });

    const savingsAcc: SeedAccount = {
      id: "acc-savings-1",
      userId: user.id,
      name: "Sampath Savings",
      type: "BANK_SAVINGS",
      openingBalanceMinor: 10000000, // 100,000.00
    };

    await app.testApi.seed({
      accounts: [savingsAcc],
    });

    await app.go("accounts");
    await app.triggerSync();

    // Click Add Fixed Deposit button
    const addFdBtn = page.locator('[data-testid="add-fd-btn"]');
    await expect(addFdBtn).toBeVisible();
    await addFdBtn.click();

    // Fill form
    await page.fill('[data-testid="fd-form-bank"]', "Commercial Bank");
    await page.fill('[data-testid="fd-form-account-number"]', "FD-1001");
    await page.fill('[data-testid="fd-form-principal"]', "1000000.00");
    await page.fill('[data-testid="fd-form-rate"]', "12.0");
    await page.fill('[data-testid="fd-form-tenure"]', "12");
    await page.selectOption('[data-testid="fd-form-payout-mode"]', "MONTHLY_PAYOUT_TO_ACCOUNT");
    await page.selectOption('[data-testid="fd-form-linked-account"]', "acc-savings-1");
    await page.fill('[data-testid="fd-form-wht"]', "5.0");

    await page.click('[data-testid="fd-form-submit"]');

    // Wait for card to appear
    const fdCard = page.locator('[data-testid^="fd-item-"]').first();
    await expect(fdCard).toBeVisible();
    await expect(fdCard).toContainText("Commercial Bank");

    // Monthly net interest calculation:
    // 1,000,000 * 12% / 12 = 10,000 gross
    // 10,000 * 5% tax = 500 tax
    // Net = 9,500.00
    const monthlyNet = fdCard.locator('[data-testid="fd-monthly-net"]');
    await expect(monthlyNet).toBeVisible();
    await expect(monthlyNet).toContainText("9,500.00");
  });

  test("S17-02: Funding from Savings: Savings −1,000,000, net worth unchanged, FD shown in assets", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "Funding Tester",
      email: "funding@example.com",
    });

    const savingsAcc: SeedAccount = {
      id: "acc-funding-1",
      userId: user.id,
      name: "Main Savings",
      type: "BANK_SAVINGS",
      openingBalanceMinor: 200000000, // 2,000,000.00
    };

    await app.testApi.seed({
      accounts: [savingsAcc],
    });

    await app.go("accounts");
    await app.triggerSync();

    // Verify initial net worth
    const netWorthHeader = page.locator('[data-testid="net-worth-total"]');
    await expect(netWorthHeader).toContainText("2,000,000.00");

    // Open Add FD
    await page.click('[data-testid="add-fd-btn"]');
    await page.fill('[data-testid="fd-form-bank"]', "HNB FD");
    await page.fill('[data-testid="fd-form-principal"]', "1000000.00");
    await page.fill('[data-testid="fd-form-rate"]', "11.5");
    await page.fill('[data-testid="fd-form-tenure"]', "12");
    await page.selectOption('[data-testid="fd-form-funding-account"]', "acc-funding-1");
    await page.selectOption('[data-testid="fd-form-linked-account"]', "acc-funding-1");

    await page.click('[data-testid="fd-form-submit"]');

    // Wait for card to appear
    const fdCard = page.locator('[data-testid^="fd-item-"]').first();
    await expect(fdCard).toBeVisible();

    // Savings balance reduced by 1,000,000.00 -> now 1,000,000.00
    const bankSubtotal = page.locator('[data-testid="subtotal-bank"]');
    await expect(bankSubtotal).toContainText("1,000,000.00");

    // FD subtotal is 1,000,000.00
    const fdSubtotal = page.locator('[data-testid="subtotal-fixed-deposits"]');
    await expect(fdSubtotal).toContainText("1,000,000.00");

    // Total net worth remains 2,000,000.00!
    await expect(netWorthHeader).toContainText("2,000,000.00");
  });

  test("S17-03: Advance clock one month + `tick` → Savings +9,500; row 'Investment Yield'; payout record shows gross/tax/net", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "Payout Tester",
      email: "payout@example.com",
    });

    const savingsAcc: SeedAccount = {
      id: "acc-payout-1",
      userId: user.id,
      name: "Savings Account",
      type: "BANK_SAVINGS",
      openingBalanceMinor: 0,
    };

    const fd: SeedFixedDeposit = {
      id: "fd-payout-1",
      userId: user.id,
      bankName: "Sampath Bank FD",
      principalAmountMinor: 100000000, // 1,000,000.00
      annualInterestRateBps: 1200, // 12%
      tenureMonths: 12,
      startDate: "2026-09-01T00:00:00.000Z",
      maturityDate: "2027-09-01T00:00:00.000Z",
      payoutMode: "MONTHLY_PAYOUT_TO_ACCOUNT",
      linkedPayoutAccountId: "acc-payout-1",
      withholdingTaxRateBps: 500, // 5%
      status: "ACTIVE",
    };

    await app.testApi.seed({
      accounts: [savingsAcc],
      fixedDeposits: [fd],
    });

    // Advance clock 1 month to 2026-10-02
    await app.setNow("2026-10-02T00:00:00.000Z");
    await app.testApi.tick();

    await app.go("accounts");
    await app.triggerSync();

    // Savings balance has received 9,500.00
    const bankSubtotal = page.locator('[data-testid="subtotal-bank"]');
    await expect(bankSubtotal).toContainText("9,500.00");

    // Check transactions list
    await app.go("transactions");
    const txRow = page.locator("text=Investment Yield").first();
    await expect(txRow).toBeVisible();

    // Verify snapshot payout record
    const snapshot = await app.testApi.getSnapshot();
    expect(snapshot.fixedDepositPayouts.length).toBe(1);
    const p = snapshot.fixedDepositPayouts[0];
    expect(p.grossInterestMinor).toBe(1000000); // 10,000.00
    expect(p.taxWithheldMinor).toBe(50000); // 500.00
    expect(p.netInterestMinor).toBe(950000); // 9,500.00
  });

  test("S17-04: `tick` again → no duplicate payout; skip 3 months → 3 payouts", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "Idempotent Tester",
      email: "idempotent@example.com",
    });

    const savingsAcc: SeedAccount = {
      id: "acc-idem-1",
      userId: user.id,
      name: "Savings Account",
      type: "BANK_SAVINGS",
      openingBalanceMinor: 0,
    };

    const fd: SeedFixedDeposit = {
      id: "fd-idem-1",
      userId: user.id,
      bankName: "Seylan Bank FD",
      principalAmountMinor: 100000000,
      annualInterestRateBps: 1200,
      tenureMonths: 12,
      startDate: "2026-01-01T00:00:00.000Z",
      maturityDate: "2027-01-01T00:00:00.000Z",
      payoutMode: "MONTHLY_PAYOUT_TO_ACCOUNT",
      linkedPayoutAccountId: "acc-idem-1",
      withholdingTaxRateBps: 500,
      status: "ACTIVE",
    };

    await app.testApi.seed({
      accounts: [savingsAcc],
      fixedDeposits: [fd],
    });

    // 1st tick at month 1
    await app.setNow("2026-02-02T00:00:00.000Z");
    await app.testApi.tick();

    let snap = await app.testApi.getSnapshot();
    expect(snap.fixedDepositPayouts.length).toBe(1);

    // 2nd tick at same date -> must not duplicate
    await app.testApi.tick();
    snap = await app.testApi.getSnapshot();
    expect(snap.fixedDepositPayouts.length).toBe(1);

    // Skip 3 months to month 4: 2026-05-02
    await app.setNow("2026-05-02T00:00:00.000Z");
    await app.testApi.tick();

    snap = await app.testApi.getSnapshot();
    expect(snap.fixedDepositPayouts.length).toBe(4); // 4 payouts total (month 1, 2, 3, 4)

    // Total interest = 4 * 9,500.00 = 38,000.00
    const totalNet = snap.fixedDepositPayouts.reduce((sum: number, p: { netInterestMinor: number }) => sum + p.netInterestMinor, 0);
    expect(totalNet).toBe(3800000);
  });

  test("S17-05: Compound FD shows projected maturity value and net-of-tax value", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "Compound Tester",
      email: "compound@example.com",
    });

    const fd: SeedFixedDeposit = {
      id: "fd-comp-1",
      userId: user.id,
      bankName: "NTB Growth FD",
      principalAmountMinor: 100000000, // 1,000,000.00
      annualInterestRateBps: 1200, // 12%
      tenureMonths: 12,
      startDate: "2026-01-01T00:00:00.000Z",
      maturityDate: "2027-01-01T00:00:00.000Z",
      compoundingFrequency: "MONTHLY",
      payoutMode: "REINVEST_COMPOUND",
      withholdingTaxRateBps: 500, // 5%
      status: "ACTIVE",
    };

    await app.testApi.seed({
      fixedDeposits: [fd],
    });

    await app.go("accounts");
    await app.triggerSync();

    const fdCard = page.locator('[data-testid="fd-item-fd-comp-1"]');
    await expect(fdCard).toBeVisible();

    // Compound 1,000,000 at 12% for 12 months with 5% WHT -> net maturity 1,120,483.78
    const maturityNet = fdCard.locator('[data-testid="fd-maturity-net"]');
    await expect(maturityNet).toBeVisible();
    await expect(maturityNet).toContainText("1,120,483.78");
  });

  test("S17-06: WHT override per FD (e.g., 0%) changes net payout; default taken from Settings", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({
      name: "WHT Tester",
      email: "wht@example.com",
    });

    // 1. Go to More -> Settings, update default WHT to 5.0%
    await app.go("more");
    const whtInput = page.locator('[data-testid="settings-wht-rate"]');
    await expect(whtInput).toBeVisible();
    await whtInput.fill("5.0");
    await page.click('[data-testid="settings-save"]');
    await expect(page.locator('[data-testid="settings-saved"]')).toBeVisible();

    // 2. Go to Accounts -> Add FD
    await app.go("accounts");
    await page.click('[data-testid="add-fd-btn"]');

    // Verify default WHT prefilled from settings
    const fdWhtInput = page.locator('[data-testid="fd-form-wht"]');
    await expect(fdWhtInput).toHaveValue("5.0");

    // 3. Override WHT with 0%
    await page.fill('[data-testid="fd-form-bank"]', "Tax Free FD");
    await page.fill('[data-testid="fd-form-principal"]', "1000000.00");
    await page.fill('[data-testid="fd-form-rate"]', "12.0");
    await page.fill('[data-testid="fd-form-tenure"]', "12");
    await page.selectOption('[data-testid="fd-form-payout-mode"]', "MONTHLY_PAYOUT_TO_ACCOUNT");
    await fdWhtInput.fill("0.0"); // 0% WHT override

    await page.click('[data-testid="fd-form-submit"]');

    // 4. Card should show monthly net 10,000.00 without tax deducted
    const fdCard = page.locator('[data-testid^="fd-item-"]').first();
    await expect(fdCard).toBeVisible();
    const monthlyNet = fdCard.locator('[data-testid="fd-monthly-net"]');
    await expect(monthlyNet).toContainText("10,000.00");
  });

  test("S17-07: FD placement and maturity principal are excluded from income/expense stats; interest is included", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "Stats Tester",
      email: "stats@example.com",
    });

    const savingsAcc: SeedAccount = {
      id: "acc-stats-1",
      userId: user.id,
      name: "Savings Account",
      type: "BANK_SAVINGS",
      openingBalanceMinor: 200000000, // 2,000,000.00
    };

    // FD placement: 1,000,000 (excluded from stats)
    // FD interest: 9,500 (included in stats)
    // Normal grocery expense: 5,000 (included in stats)
    await app.testApi.seed({
      accounts: [savingsAcc],
      transactions: [
        {
          id: "tx-placement",
          userId: user.id,
          accountId: "acc-stats-1",
          amountMinor: 100000000,
          type: "EXPENSE",
          subType: "FD_PLACEMENT",
          excludeFromStats: true,
          excludeFromBudget: true,
          transactionDate: new Date().toISOString(),
        },
        {
          id: "tx-interest",
          userId: user.id,
          accountId: "acc-stats-1",
          amountMinor: 950000,
          type: "INCOME",
          subType: "FD_INTEREST",
          excludeFromStats: false,
          excludeFromBudget: false,
          transactionDate: new Date().toISOString(),
        },
        {
          id: "tx-normal",
          userId: user.id,
          accountId: "acc-stats-1",
          amountMinor: 500000,
          type: "EXPENSE",
          excludeFromStats: false,
          excludeFromBudget: false,
          transactionDate: new Date().toISOString(),
        },
      ],
    });

    await app.go("stats");
    await app.triggerSync();

    // Total expense stat should only be 5,000.00 (not 1,005,000.00)
    const expenseStat = page.locator('[data-testid="stats-total-expense"]').first();
    await expect(expenseStat).toContainText("5,000.00");

    // Total income stat should include 9,500.00 interest
    const incomeStat = page.locator('[data-testid="stats-total-income"]').first();
    await expect(incomeStat).toContainText("9,500.00");
  });

  test("S17-08: Maturity date reached: 'Deposit proceeds' 1-tap action posts principal + net interest; status MATURED", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "Maturity Tester",
      email: "mat@example.com",
    });

    const savingsAcc: SeedAccount = {
      id: "acc-mat-1",
      userId: user.id,
      name: "Savings Account",
      type: "BANK_SAVINGS",
      openingBalanceMinor: 0,
    };

    const fd: SeedFixedDeposit = {
      id: "fd-mat-1",
      userId: user.id,
      bankName: "Commercial Bank FD",
      principalAmountMinor: 100000000, // 1,000,000.00
      annualInterestRateBps: 1200,
      tenureMonths: 12,
      startDate: "2026-01-01T00:00:00.000Z",
      maturityDate: "2027-01-01T00:00:00.000Z",
      compoundingFrequency: "MONTHLY",
      payoutMode: "REINVEST_COMPOUND",
      linkedPayoutAccountId: "acc-mat-1",
      withholdingTaxRateBps: 500,
      autoRenew: false,
      status: "ACTIVE",
    };

    await app.testApi.seed({
      accounts: [savingsAcc],
      fixedDeposits: [fd],
    });

    // Advance clock past maturity date and tick
    await app.setNow("2027-01-02T00:00:00.000Z");
    await app.testApi.tick();

    await app.go("accounts");
    await app.triggerSync();

    const fdCard = page.locator('[data-testid="fd-item-fd-mat-1"]');
    await expect(fdCard).toBeVisible();
    await expect(fdCard).toContainText("MATURED");

    // 1-Tap "Deposit proceeds" button
    const depositBtn = fdCard.locator('[data-testid="fd-deposit-proceeds-btn"]');
    await expect(depositBtn).toBeVisible();
    await depositBtn.click();

    // Status becomes CLOSED
    await expect(fdCard).toContainText("CLOSED");

    // Savings account receives principal (1,000,000.00) + net interest (120,483.78) = 1,120,483.78
    const bankSubtotal = page.locator('[data-testid="subtotal-bank"]');
    await expect(bankSubtotal).toContainText("1,120,483.78");
  });

  test("S17-09: Premature closure: enter actual proceeds; rows and status correct", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "Premature Tester",
      email: "premature@example.com",
    });

    const savingsAcc: SeedAccount = {
      id: "acc-prem-1",
      userId: user.id,
      name: "Savings Account",
      type: "BANK_SAVINGS",
      openingBalanceMinor: 0,
    };

    const fd: SeedFixedDeposit = {
      id: "fd-prem-1",
      userId: user.id,
      bankName: "HNB FD",
      principalAmountMinor: 100000000, // 1,000,000.00
      annualInterestRateBps: 1200,
      tenureMonths: 12,
      startDate: "2026-01-01T00:00:00.000Z",
      maturityDate: "2027-01-01T00:00:00.000Z",
      linkedPayoutAccountId: "acc-prem-1",
      status: "ACTIVE",
    };

    await app.testApi.seed({
      accounts: [savingsAcc],
      fixedDeposits: [fd],
    });

    await app.go("accounts");
    await app.triggerSync();

    const fdCard = page.locator('[data-testid="fd-item-fd-prem-1"]');
    await expect(fdCard).toBeVisible();

    // Click Premature Close
    const closeBtn = fdCard.locator('[data-testid="fd-close-btn"]');
    await closeBtn.click();

    // Fill actual proceeds (e.g. 1,020,000.00)
    await page.fill('[data-testid="fd-close-proceeds-input"]', "1020000.00");
    await page.click('[data-testid="fd-close-confirm-btn"]');

    // Verify FD status is CLOSED
    await expect(fdCard).toContainText("CLOSED");

    // Savings account received 1,020,000.00
    const bankSubtotal = page.locator('[data-testid="subtotal-bank"]');
    await expect(bankSubtotal).toContainText("1,020,000.00");
  });

  test("S17-10: Auto-renew FD creates a renewed term instead of the deposit action", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "AutoRenew Tester",
      email: "autorenew@example.com",
    });

    const fd: SeedFixedDeposit = {
      id: "fd-auto-1",
      userId: user.id,
      bankName: "DFCC Auto-Renew FD",
      principalAmountMinor: 100000000,
      annualInterestRateBps: 1200,
      tenureMonths: 12,
      startDate: "2026-01-01T00:00:00.000Z",
      maturityDate: "2027-01-01T00:00:00.000Z",
      payoutMode: "MONTHLY_PAYOUT_TO_ACCOUNT",
      autoRenew: true,
      status: "ACTIVE",
    };

    await app.testApi.seed({
      fixedDeposits: [fd],
    });

    // Advance clock past maturity date and run tick
    await app.setNow("2027-01-02T00:00:00.000Z");
    await app.testApi.tick();

    await app.go("accounts");
    await app.triggerSync();

    const fdCard = page.locator('[data-testid="fd-item-fd-auto-1"]');
    await expect(fdCard).toBeVisible();

    // Should remain ACTIVE, not MATURED
    await expect(fdCard).toContainText("ACTIVE");
    // Deposit proceeds action button should NOT be present
    await expect(fdCard.locator('[data-testid="fd-deposit-proceeds-btn"]')).toHaveCount(0);

    // Check renewed maturity date is 2028-01-01
    const snap = await app.testApi.getSnapshot();
    const updatedFd = snap.fixedDeposits.find((f: { id: string }) => f.id === "fd-auto-1")!;
    expect(updatedFd.status).toBe("ACTIVE");
    expect(new Date(updatedFd.maturityDate).getFullYear()).toBe(2028);
  });

  test("S17-11: Net-worth FD value = principal + accrued net interest", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({
      name: "NetWorth Tester",
      email: "nw@example.com",
    });

    const fd: SeedFixedDeposit = {
      id: "fd-nw-1",
      userId: user.id,
      bankName: "Seylan Compounding FD",
      principalAmountMinor: 100000000, // 1,000,000.00
      annualInterestRateBps: 1200,
      tenureMonths: 12,
      startDate: "2026-01-01T00:00:00.000Z",
      maturityDate: "2027-01-01T00:00:00.000Z",
      compoundingFrequency: "MONTHLY",
      payoutMode: "REINVEST_COMPOUND",
      withholdingTaxRateBps: 500,
      status: "ACTIVE",
    };

    await app.testApi.seed({
      fixedDeposits: [fd],
    });

    // Set clock at maturity date
    await app.setNow("2027-01-01T00:00:00.000Z");

    await app.go("accounts");
    await app.triggerSync();

    // Net worth includes principal + accrued net compound interest: 1,120,483.78
    const netWorthAssets = page.locator('[data-testid="net-worth-assets"]');
    await expect(netWorthAssets).toContainText("1,120,483.78");

    const netWorthTotal = page.locator('[data-testid="net-worth-total"]');
    await expect(netWorthTotal).toContainText("1,120,483.78");
  });

  test("S17-12: FD form and detail layouts valid in both viewports; visual snapshot", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({
      name: "Layout Tester",
      email: "layout@example.com",
    });

    await app.go("accounts");
    await app.triggerSync();

    // Verify Add FD button and open form
    const addFdBtn = page.locator('[data-testid="add-fd-btn"]');
    await expect(addFdBtn).toBeVisible();
    await addFdBtn.click();

    // Verify modal is centered without overflow
    const modal = page.locator('form:has([data-testid="fd-form-bank"])');
    await expect(modal).toBeVisible();
    const box = await modal.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(250);

    // Cancel form
    await page.click("button:has-text('Cancel')");
    await expect(modal).toHaveCount(0);
  });
});
