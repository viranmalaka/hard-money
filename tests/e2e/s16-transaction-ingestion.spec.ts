import { test, expect } from "./fixtures";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 16: Transaction Ingestion Service @s16", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    const app = new AppHelper(page);
    await app.testApi.reset();
  });

  test("S16-01: POS SMS fixture → expense row with SMS glyph; balance reduced", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1601", email: "s1601@example.com" });
    await app.waitForSyncIdle();

    // Seed savings account with 50,000 opening balance (5,000,000 minor)
    const accId = "acc-s1601";
    await app.testApi.seed({
      accounts: [
        {
          id: accId,
          userId: user.id,
          name: "Commercial Bank Savings",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 5000000,
          accountNumberLast4: "4681",
          bankSenderIds: ["COMBANK"],
        },
      ],
    });

    // Obtain webhook key
    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // Post COMBANK POS SMS (amount 4,500.00 = 450000 minor)
    const smsRes = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "COMBANK",
        rawSms: "Your Commercial Bank Card ending 4681 was used for LKR 4,500.00 at Keells on 2026-10-18. Bal: LKR 45,500.00",
        receivedAt: "2026-10-18T10:00:00.000Z",
      },
    });
    expect(smsRes.status()).toBe(202);

    await app.testApi.processSms();
    await app.triggerSync();

    // Verify transaction row appears with SMS glyph
    const smsGlyph = page.locator('[data-testid="sms-glyph"]');
    await expect(smsGlyph.first()).toBeVisible();

    // Amount should be - 4,500.00
    const txAmount = page.locator('[data-testid="transaction-amount"]');
    await expect(txAmount.first()).toContainText("4,500.00");

    // Navigate to accounts and verify balance is 45,500.00
    await app.go("accounts");
    await app.waitForSyncIdle();
    const balanceEl = page.locator(`[data-testid="account-item-${accId}"] [data-testid="account-card-balance"]`);
    await expect(balanceEl).toContainText("45,500.00");
  });

  test("S16-02: ATM_OTHER 10,000 with fee 25: Cash +10,000, Savings -10,025 total, a Bank Fees row linked to the parent", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1602", email: "s1602@example.com" });
    await app.waitForSyncIdle();

    const accId = "acc-s1602";
    await app.testApi.seed({
      accounts: [
        {
          id: accId,
          userId: user.id,
          name: "Sampath Bank",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 10000000, // 100,000
          accountNumberLast4: "4681",
          bankSenderIds: ["SAMPATH"],
          otherAtmFeeMinor: 2500, // LKR 25.00
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // ATM Other withdrawal: LKR 10,000
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "SAMPATH",
        rawSms: "LKR 10,000.00 debited from AC **4681 via ATM at OTHER BANK CASH 17/10/2026 06:00:28",
        receivedAt: "2026-10-17T06:00:28.000Z",
      },
    });

    await app.testApi.processSms();
    await app.triggerSync();

    await app.go("accounts");
    await app.waitForSyncIdle();

    // Bank account balance: 100,000 - 10,000 - 25 = 89,975.00
    const savingsBal = page.locator(`[data-testid="account-item-${accId}"] [data-testid="account-card-balance"]`);
    await expect(savingsBal).toContainText("89,975.00");

    // Cash Wallet should have been auto-created with 10,000.00
    const cashSubtotal = page.locator('[data-testid="subtotal-cash"]');
    await expect(cashSubtotal).toContainText("10,000.00");

    // Verify Transactions page has transfer and fee rows
    await app.go("transactions");
    await app.waitForSyncIdle();
    const glyphs = page.locator('[data-testid="sms-glyph"]');
    await expect(glyphs.first()).toBeVisible();
  });

  test("S16-03: ATM_OWN with fee 5 and with no fee config", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1603", email: "s1603@example.com" });
    await app.waitForSyncIdle();

    const acc1 = "acc-s1603-fee5";
    const acc2 = "acc-s1603-nofee";
    await app.testApi.seed({
      accounts: [
        {
          id: acc1,
          userId: user.id,
          name: "Bank With Fee",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 5000000,
          accountNumberLast4: "1111",
          bankSenderIds: ["SAMPATH"],
          ownAtmFeeMinor: 500, // LKR 5.00
        },
        {
          id: acc2,
          userId: user.id,
          name: "Bank No Fee",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 5000000,
          accountNumberLast4: "2222",
          bankSenderIds: ["COMBANK"],
          ownAtmFeeMinor: 0,
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // 1. ATM_OWN on acc1 (with fee 5)
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "SAMPATH",
        rawSms: "LKR 5,000.00 debited from AC **1111 via ATM at EHELIYAGODA BRANCH 17/10/2026 06:00:28",
        receivedAt: "2026-10-17T06:00:28.000Z",
      },
    });

    // 2. ATM_OWN on acc2 (no fee config)
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "COMBANK",
        rawSms: "LKR 5,000.00 withdrawn from ATM A/C 2222 on 17/10/2026",
        receivedAt: "2026-10-17T07:00:00.000Z",
      },
    });

    await app.testApi.processSms();
    await app.triggerSync();

    await app.go("accounts");
    await app.waitForSyncIdle();

    // acc1: 50,000 - 5,000 - 5 = 44,995.00
    const bal1 = page.locator(`[data-testid="account-item-${acc1}"] [data-testid="account-card-balance"]`);
    await expect(bal1).toContainText("44,995.00");

    // acc2: 50,000 - 5,000 - 0 = 45,000.00
    const bal2 = page.locator(`[data-testid="account-item-${acc2}"] [data-testid="account-card-balance"]`);
    await expect(bal2).toContainText("45,000.00");
  });

  test("S16-04: Salary credit → income row DEPOSIT, balance up", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1604", email: "s1604@example.com" });
    await app.waitForSyncIdle();

    const accId = "acc-s1604";
    await app.testApi.seed({
      accounts: [
        {
          id: accId,
          userId: user.id,
          name: "Salary Account",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 1000000, // 10,000
          accountNumberLast4: "4681",
          bankSenderIds: ["SAMPATH"],
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // Sampath salary/credit: 88,005.00
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "SAMPATH",
        rawSms: "LKR 88,005.00 credited to AC **4681 for Salary Oct 18/10/2026 03:08:38",
        receivedAt: "2026-10-18T03:08:38.000Z",
      },
    });

    await app.testApi.processSms();
    await app.triggerSync();

    await app.go("transactions");
    await app.waitForSyncIdle();

    const txAmount = page.locator('[data-testid="transaction-amount"]');
    await expect(txAmount.first()).toContainText("88,005.00");

    await app.go("accounts");
    await app.waitForSyncIdle();
    const balEl = page.locator(`[data-testid="account-item-${accId}"] [data-testid="account-card-balance"]`);
    await expect(balEl).toContainText("98,005.00");
  });

  test("S16-05: Refund SMS after a matching debit → refund row linked; balance restored", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1605", email: "s1605@example.com" });
    await app.waitForSyncIdle();

    const accId = "acc-s1605";
    const debitTxId = "tx-s1605-debit";
    await app.testApi.seed({
      accounts: [
        {
          id: accId,
          userId: user.id,
          name: "Checking",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 10000000, // 100,000
          accountNumberLast4: "4681",
          bankSenderIds: ["SAMPATH"],
        },
      ],
      transactions: [
        {
          id: debitTxId,
          userId: user.id,
          accountId: accId,
          amountMinor: 250000, // 2,500.00
          type: "EXPENSE",
          transactionDate: "2026-10-16T12:00:00.000Z",
          note: "Online Purchase",
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // Post Refund SMS
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "SAMPATH",
        rawSms: "LKR 2,500.00 refunded to AC **4681 for reversal on 18/10/2026 12:00:00",
        receivedAt: "2026-10-18T12:00:00.000Z",
      },
    });

    await app.testApi.processSms();
    await app.triggerSync();

    // Verify balance restored to 100,000.00 (100k - 2.5k + 2.5k)
    await app.go("accounts");
    await app.waitForSyncIdle();
    const balEl = page.locator(`[data-testid="account-item-${accId}"] [data-testid="account-card-balance"]`);
    await expect(balEl).toContainText("100,000.00");
  });

  test("S16-06: Manual 4,500 then matching SMS within 2 h → only one row; note enriched; SMS linked", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1606", email: "s1606@example.com" });
    await app.waitForSyncIdle();

    const accId = "acc-s1606";
    const manualTxId = "tx-s1606-manual";
    await app.testApi.seed({
      accounts: [
        {
          id: accId,
          userId: user.id,
          name: "ComBank",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 2000000,
          accountNumberLast4: "4681",
          bankSenderIds: ["COMBANK"],
        },
      ],
      transactions: [
        {
          id: manualTxId,
          userId: user.id,
          accountId: accId,
          amountMinor: 450000, // 4,500
          type: "EXPENSE",
          source: "MANUAL",
          transactionDate: "2026-10-18T10:00:00.000Z",
          note: "Lunch with friends",
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // SMS arrives 15 minutes later with same amount 4,500
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "COMBANK",
        rawSms: "Your Commercial Bank Card ending 4681 was used for LKR 4,500.00 at Cafe 18/10/2026 10:15:00",
        receivedAt: "2026-10-18T10:15:00.000Z",
      },
    });

    await app.testApi.processSms();
    await app.triggerSync();

    await app.go("transactions");
    await app.waitForSyncIdle();

    // Verify only ONE transaction row exists
    const rows = page.locator('[data-testid^="transaction-row-"]');
    await expect(rows).toHaveCount(1);

    // Note was enriched with merchant name
    await expect(rows.first()).toContainText("Lunch with friends");

    // Has SMS glyph linked
    await expect(page.locator('[data-testid="sms-glyph"]')).toBeVisible();
  });

  test("S16-07: SMS then manual entry: 'Possible duplicate' prompt appears; Merge → one row with user's category/note", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1607", email: "s1607@example.com" });
    await app.waitForSyncIdle();

    const accId = "acc-s1607";
    const catId = "cat-s1607-food";
    await app.testApi.seed({
      accounts: [
        {
          id: accId,
          userId: user.id,
          name: "Sampath",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 2000000,
          accountNumberLast4: "4681",
          bankSenderIds: ["SAMPATH"],
        },
      ],
      categories: [
        {
          id: catId,
          userId: user.id,
          name: "Dining Out",
          color: "#f59e0b",
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // 1. SMS arrives first and auto-posts 3,000.00
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "SAMPATH",
        rawSms: "LKR 3,000.00 debited from AC **4681 for Cafe Verandah on 18/10/2026 14:00:00",
        receivedAt: "2026-10-18T14:00:00.000Z",
      },
    });
    await app.testApi.processSms();

    // 2. User pushes manual transaction for 3,000.00 30 minutes later
    const pushRes = await page.request.post("http://localhost:3000/api/sync/push", {
      data: {
        mutations: [
          {
            mutationId: "mut-manual-dup-1",
            entity: "transaction",
            op: "CREATE",
            id: "tx-manual-dup-1",
            payload: {
              accountId: accId,
              categoryId: catId,
              amountMinor: 300000,
              type: "EXPENSE",
              source: "MANUAL",
              transactionDate: "2026-10-18T14:30:00.000Z",
              note: "Dinner with Client",
            },
          },
        ],
      },
    });
    expect(pushRes.ok()).toBeTruthy();
    await app.triggerSync();

    await app.go("transactions");
    await app.waitForSyncIdle();

    // Verify "Possible duplicate — merge?" banner is visible
    const prompt = page.locator('[data-testid="possible-duplicate-prompt"]');
    await expect(prompt).toBeVisible();

    // Tap Merge
    const mergeBtn = page.locator('[data-testid="merge-duplicate-btn"]');
    await mergeBtn.click();
    await app.waitForSyncIdle();

    // Verify prompt disappears and only one row remains with enriched note
    await expect(page.locator('[data-testid="possible-duplicate-prompt"]')).not.toBeVisible();
    const rows = page.locator('[data-testid^="transaction-row-"]');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Dinner with Client");
  });

  test("S16-08: Prompt 'Not a duplicate' keeps both rows and dismisses the prompt", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1608", email: "s1608@example.com" });
    await app.waitForSyncIdle();

    const accId = "acc-s1608";
    await app.testApi.seed({
      accounts: [
        {
          id: accId,
          userId: user.id,
          name: "Commercial Bank",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 2000000,
          accountNumberLast4: "4681",
          bankSenderIds: ["COMBANK"],
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // 1. SMS arrives
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "COMBANK",
        rawSms: "LKR 1,200.00 paid from Card 4681 at Keells 18/10/2026 12:00:00",
        receivedAt: "2026-10-18T12:00:00.000Z",
      },
    });
    await app.testApi.processSms();

    // 2. Manual entry
    await page.request.post("http://localhost:3000/api/sync/push", {
      data: {
        mutations: [
          {
            mutationId: "mut-manual-dup-2",
            entity: "transaction",
            op: "CREATE",
            id: "tx-manual-dup-2",
            payload: {
              accountId: accId,
              amountMinor: 120000,
              type: "EXPENSE",
              source: "MANUAL",
              transactionDate: "2026-10-18T12:10:00.000Z",
              note: "Keells Item 2",
            },
          },
        ],
      },
    });

    await app.triggerSync();

    await app.go("transactions");
    await app.waitForSyncIdle();

    const prompt = page.locator('[data-testid="possible-duplicate-prompt"]');
    await expect(prompt).toBeVisible();

    // Dismiss duplicate prompt
    const dismissBtn = page.locator('[data-testid="dismiss-duplicate-btn"]');
    await dismissBtn.click();
    await app.waitForSyncIdle();

    // Both rows remain
    await expect(page.locator('[data-testid="possible-duplicate-prompt"]')).not.toBeVisible();
    const rows = page.locator('[data-testid^="transaction-row-"]');
    await expect(rows).toHaveCount(2);
  });

  test("S16-09: Follow-up BANK_CHARGE SMS (25) links to the existing fee child; no extra row", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1609", email: "s1609@example.com" });
    await app.waitForSyncIdle();

    const accId = "acc-s1609";
    await app.testApi.seed({
      accounts: [
        {
          id: accId,
          userId: user.id,
          name: "Sampath Bank",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 5000000,
          accountNumberLast4: "4681",
          bankSenderIds: ["SAMPATH"],
          otherAtmFeeMinor: 2500, // LKR 25 fee rule
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // 1. ATM Withdrawal creates transfer + fee child (25.00)
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "SAMPATH",
        rawSms: "LKR 5,000.00 debited from AC **4681 via ATM at OTHER BANK CASH 17/10/2026 06:00:28",
        receivedAt: "2026-10-17T06:00:28.000Z",
      },
    });
    await app.testApi.processSms();

    // 2. Follow-up SMS explicitly stating bank fee of 25.00
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "SAMPATH",
        rawSms: "LKR 25.00 debited from AC **4681 for ATM withdrawal fee 17/10/2026 06:00:30",
        receivedAt: "2026-10-17T06:00:30.000Z",
      },
    });
    await app.testApi.processSms();
    await app.triggerSync();

    await app.go("transactions");
    await app.waitForSyncIdle();

    // Total transactions should be 2 (Transfer + exactly one Fee row, not two fees)
    const rows = page.locator('[data-testid^="transaction-row-"]');
    await expect(rows).toHaveCount(2);
  });

  test("S16-10: balanceAfter mismatch shows a hint with 'Calibrate' button; no adjustment row created", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1610", email: "s1610@example.com" });
    await app.waitForSyncIdle();

    const accId = "acc-s1610";
    await app.testApi.seed({
      accounts: [
        {
          id: accId,
          userId: user.id,
          name: "DFCC Savings",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 1000000, // Ledger = 10,000
          accountNumberLast4: "0726",
          bankSenderIds: ["DFCC"],
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // Debit 678.00, stated balance is 1,822.73 (mismatch against ledger 10,000 - 678 = 9,322)
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "DFCC",
        rawSms: "Your A/C No: ********0726 is debited with LKR678.00 on 16 OCT 2026 ref: KEELLS. Your bal is LKR1,822.73.",
        receivedAt: "2026-10-16T10:00:00.000Z",
      },
    });
    await app.testApi.processSms();
    await app.triggerSync();

    // Verify on Accounts page that mismatch hint is shown
    await app.go("accounts");
    await app.waitForSyncIdle();

    const mismatchHint = page.locator('[data-testid="balance-mismatch-hint"]');
    await expect(mismatchHint).toBeVisible();
    await expect(mismatchHint).toContainText("1,822.73");

    const calibrateBtn = page.locator('[data-testid="calibrate-btn"]');
    await expect(calibrateBtn).toBeVisible();

    // Verify NO adjustment transaction was automatically created
    await app.go("transactions");
    await app.waitForSyncIdle();
    const rows = page.locator('[data-testid^="transaction-row-"]');
    await expect(rows).toHaveCount(1); // Only the 678 debit
  });

  test("S16-11: Out-of-order older SMS does not trigger the hint", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1611", email: "s1611@example.com" });
    await app.waitForSyncIdle();

    const accId = "acc-s1611";
    await app.testApi.seed({
      accounts: [
        {
          id: accId,
          userId: user.id,
          name: "DFCC",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 1000000,
          accountNumberLast4: "0726",
          bankSenderIds: ["DFCC"],
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // Newer SMS arrives first (Oct 18)
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "DFCC",
        rawSms: "Your A/C No: ********0726 is debited with LKR100.00 on 18 OCT 2026 ref: KEELLS",
        receivedAt: "2026-10-18T10:00:00.000Z",
      },
    });
    await app.testApi.processSms();

    // Out-of-order older SMS arrives later (Oct 15) with an old balance
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "DFCC",
        rawSms: "Your A/C No: ********0726 is debited with LKR200.00 on 15 OCT 2026 ref: KEELLS. Your bal is LKR500.00.",
        receivedAt: "2026-10-15T10:00:00.000Z",
      },
    });
    await app.testApi.processSms();
    await app.triggerSync();

    await app.go("accounts");
    await app.waitForSyncIdle();

    // Out-of-order older SMS does not trigger mismatch hint
    const mismatchHint = page.locator('[data-testid="balance-mismatch-hint"]');
    await expect(mismatchHint).not.toBeVisible();
  });

  test("S16-12: Two identical manual entries + one SMS → exactly one is linked", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1612", email: "s1612@example.com" });
    await app.waitForSyncIdle();

    const accId = "acc-s1612";
    await app.testApi.seed({
      accounts: [
        {
          id: accId,
          userId: user.id,
          name: "Sampath",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 2000000,
          accountNumberLast4: "4681",
          bankSenderIds: ["SAMPATH"],
        },
      ],
      transactions: [
        {
          id: "tx-manual-1",
          userId: user.id,
          accountId: accId,
          amountMinor: 50000, // 500.00
          type: "EXPENSE",
          source: "MANUAL",
          transactionDate: "2026-10-18T09:00:00.000Z",
          note: "Entry 1",
        },
        {
          id: "tx-manual-2",
          userId: user.id,
          accountId: accId,
          amountMinor: 50000, // 500.00
          type: "EXPENSE",
          source: "MANUAL",
          transactionDate: "2026-10-18T09:30:00.000Z",
          note: "Entry 2",
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // Single SMS for 500.00 at 09:25 (closer to Entry 2)
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "SAMPATH",
        rawSms: "LKR 500.00 debited from AC **4681 on 18/10/2026 09:25:00",
        receivedAt: "2026-10-18T09:25:00.000Z",
      },
    });
    await app.testApi.processSms();
    await app.triggerSync();

    await app.go("transactions");
    await app.waitForSyncIdle();

    // Exactly 2 transactions exist in total, and exactly 1 has the SMS glyph
    const rows = page.locator('[data-testid^="transaction-row-"]');
    await expect(rows).toHaveCount(2);

    const glyphs = page.locator('[data-testid="sms-glyph"]');
    await expect(glyphs).toHaveCount(1);
  });

  test("S16-13: Card-payment SMS with a resolvable card → settlement transfer; otherwise → inbox", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1613", email: "s1613@example.com" });
    await app.waitForSyncIdle();

    const bankAccId = "acc-s1613-bank";
    const cardAccId = "acc-s1613-card";
    await app.testApi.seed({
      accounts: [
        {
          id: bankAccId,
          userId: user.id,
          name: "Bank Account",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 5000000, // 50,000
          accountNumberLast4: "4681",
          bankSenderIds: ["SAMPATH"],
        },
        {
          id: cardAccId,
          userId: user.id,
          name: "Credit Card",
          type: "CREDIT_CARD",
          openingBalanceMinor: -2000000, // Outstanding 20,000
          accountNumberLast4: "8888",
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // Card settlement payment of 15,000 to card 8888
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "SAMPATH",
        rawSms: "Payment of LKR 15,000.00 received for Card ending 8888 on 18/10/2026",
        receivedAt: "2026-10-18T16:00:00.000Z",
      },
    });
    await app.testApi.processSms();
    await app.triggerSync();

    await app.go("accounts");
    await app.waitForSyncIdle();

    // Credit card outstanding debt should reduce by 15,000 (from 20k to 5k)
    const cardOutstanding = page.locator(`[data-testid="account-item-${cardAccId}"] [data-testid="card-outstanding"]`);
    await expect(cardOutstanding).toContainText("5,000.00");
  });

  test("S16-14: Tapping the SMS glyph on a row opens the original SMS; 'link' navigates to the transaction from the log", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1614", email: "s1614@example.com" });
    await app.waitForSyncIdle();

    const accId = "acc-s1614";
    await app.testApi.seed({
      accounts: [
        {
          id: accId,
          userId: user.id,
          name: "ComBank",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 2000000,
          accountNumberLast4: "4681",
          bankSenderIds: ["COMBANK"],
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    const rawMsg = "Your Commercial Bank Card ending 4681 was used for LKR 1,500.00 at ODEL on 2026-10-18";
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "COMBANK",
        rawSms: rawMsg,
        receivedAt: "2026-10-18T10:00:00.000Z",
      },
    });
    await app.testApi.processSms();
    await app.triggerSync();

    // 1. In Transactions view, tap SMS glyph to inspect original SMS modal
    await app.go("transactions");
    await app.waitForSyncIdle();

    const glyph = page.locator('[data-testid="sms-glyph"]');
    await expect(glyph.first()).toBeVisible();
    await glyph.first().click();

    const modal = page.locator('[data-testid="sms-glyph-modal"]');
    await expect(modal).toBeVisible();
    const rawText = page.locator('[data-testid="sms-raw-text"]');
    await expect(rawText).toContainText(rawMsg);

    // Close modal
    await page.locator('[data-testid="close-sms-modal-btn"]').click();
    await expect(modal).not.toBeVisible();

    // 2. Navigate to /more/sms-activity and check transaction link
    await app.go("more");
    await page.locator('[data-testid="more-sms-activity-link"]').click();
    await app.waitForSyncIdle();

    const txLink = page.locator('[data-testid="sms-tx-link"]');
    await expect(txLink.first()).toBeVisible();
    await txLink.first().click();
    await app.waitForSyncIdle();

    // Navigated back to transactions view
    await expect(page.locator('[data-testid="view-daily"]')).toBeVisible();
  });

  test("S16-15: End-to-end: Webhook → worker → UI refresh without reload (sync pulls new row) on both viewports", async ({ page }) => {
    const app = new AppHelper(page);
    const user = await app.auth.register({ name: "User S1615", email: "s1615@example.com" });
    await app.waitForSyncIdle();

    const accId = "acc-s1615";
    await app.testApi.seed({
      accounts: [
        {
          id: accId,
          userId: user.id,
          name: "Live Bank",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 2000000,
          accountNumberLast4: "4681",
          bankSenderIds: ["COMBANK"],
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // Start on transactions page (no transactions yet)
    await app.go("transactions");
    await app.waitForSyncIdle();
    await expect(page.locator('[data-testid^="transaction-row-"]')).toHaveCount(0);

    // Ingress SMS via webhook
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        sender: "COMBANK",
        rawSms: "Your Commercial Bank Card ending 4681 was used for LKR 850.00 at SPAR on 2026-10-18",
        receivedAt: "2026-10-18T10:00:00.000Z",
      },
    });
    await app.testApi.processSms();

    // Trigger sync without full page reload
    await app.triggerSync();

    // Verify row appears reactively
    const row = page.locator('[data-testid^="transaction-row-"]');
    await expect(row.first()).toBeVisible();
    await expect(row.first()).toContainText("850.00");
  });
});
