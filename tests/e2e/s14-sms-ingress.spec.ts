import { test, expect } from "./fixtures";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 14: SMS Ingress, Archival & Template Parsing @s14", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    const app = new AppHelper(page);
    await app.testApi.reset();
  });

  test("S14-01: Settings → generate webhook key: shown once with a copy button; after reload only the prefix is shown", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1401", email: "s1401@example.com" });
    await app.waitForSyncIdle();

    await app.go("more");
    await page.click('[data-testid="more-developer-link"]');

    const generateBtn = page.locator('[data-testid="generate-webhook-key-btn"]');
    await expect(generateBtn).toBeVisible();
    await generateBtn.click();

    // Key shown once with copy button
    const keyDisplay = page.locator('[data-testid="webhook-key-display"]');
    await expect(keyDisplay).toBeVisible();
    const fullKey = await keyDisplay.textContent();
    expect(fullKey).toContain("hm_live_");

    const copyBtn = page.locator('[data-testid="copy-webhook-key-btn"]');
    await expect(copyBtn).toBeVisible();

    // Reload page
    await page.reload();

    // Full key is never shown again; only prefix is displayed
    await expect(page.locator('[data-testid="webhook-key-display"]')).not.toBeVisible();
    const prefixEl = page.locator('[data-testid="webhook-key-prefix"]');
    await expect(prefixEl).toBeVisible();
    await expect(prefixEl).toContainText("hm_live_");
  });

  test("S14-02: Webhook with a missing/invalid key → 401; with the valid key → 202 (API test)", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1402", email: "s1402@example.com" });
    await app.waitForSyncIdle();

    // Generate API key using page.request so session cookie is passed
    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();
    expect(apiKey).toBeDefined();

    const samplePayload = {
      rawSms: "Your Commercial Bank Card ending 1234 was used for LKR 2,500.00 at ODEL on 2026-10-15.",
      sender: "COMBANK",
      receivedAt: "2026-10-15T12:00:00.000Z",
    };

    // 1. Missing key -> 401
    const resNoKey = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      data: samplePayload,
    });
    expect(resNoKey.status()).toBe(401);

    // 2. Invalid key -> 401
    const resBadKey = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": "invalid_fake_key_123" },
      data: samplePayload,
    });
    expect(resBadKey.status()).toBe(401);

    // 3. Valid key -> 202
    const resValid = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: samplePayload,
    });
    expect(resValid.status()).toBe(202);
    const body = await resValid.json();
    expect(body.status).toBe("ACCEPTED");
    expect(body.id).toBeDefined();
  });

  test("S14-03: Regenerate key: old key → 401, new key → 202", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1403", email: "s1403@example.com" });
    await app.waitForSyncIdle();

    // Generate first key
    const gen1 = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey: key1 } = await gen1.json();

    const payload = {
      rawSms: "Your Commercial Bank Card ending 1234 was used for LKR 1,200.00 at KEELLS on 2026-10-15.",
      sender: "COMBANK",
      receivedAt: "2026-10-15T12:30:00.000Z",
    };

    // key1 works -> 202
    const res1 = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": key1 },
      data: payload,
    });
    expect(res1.status()).toBe(202);

    // Regenerate key
    const gen2 = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey: key2 } = await gen2.json();
    expect(key2).not.toBe(key1);

    // Old key1 now returns 401
    const resOld = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": key1 },
      data: { ...payload, rawSms: "Another SMS text 2" },
    });
    expect(resOld.status()).toBe(401);

    // New key2 returns 202
    const resNew = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": key2 },
      data: { ...payload, rawSms: "Another SMS text 3" },
    });
    expect(resNew.status()).toBe(202);
  });

  test("S14-04: POST a COMBANK POS SMS fixture → Activity log shows PROCESSED, method TEMPLATE, amount correct", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1404", email: "s1404@example.com" });
    await app.waitForSyncIdle();

    const userId = await page.evaluate(() => localStorage.getItem("hardmoney_active_user") || "user-s1404");

    // Seed account with bank sender COMBANK and last4 1234
    await app.testApi.seed({
      accounts: [
        {
          id: "acc-combank-cc",
          userId,
          name: "Commercial Bank Platinum",
          type: "CREDIT_CARD",
          openingBalanceMinor: 0,
          accountNumberLast4: "1234",
          bankSenderIds: ["COMBANK"],
        },
      ],
    });

    // Generate API key
    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // Post COMBANK POS SMS fixture
    const ingressRes = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: "Your Commercial Bank Credit Card ending 1234 was used for LKR 4,500.00 at KECELLS SUPER on 2026-10-15. Available Balance: LKR 150,000.00",
        sender: "COMBANK",
        receivedAt: "2026-10-15T14:20:00.000Z",
      },
    });
    expect(ingressRes.status()).toBe(202);

    // Allow worker async execution
    await app.testApi.tick();

    // Go to Bank SMS Activity Log
    await app.go("more");
    await page.locator('[data-testid="more-sms-activity-link"]').click();

    await expect(page.locator('[data-testid="sms-status-badge"]')).toContainText("PROCESSED");
    await expect(page.locator('[data-testid="sms-parse-method"]')).toContainText("TEMPLATE");
    await expect(page.locator('[data-testid="sms-amount"]')).toContainText("4,500.00");
  });

  test("S14-05: POST the same payload twice → exactly one log row", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1405", email: "s1405@example.com" });
    await app.waitForSyncIdle();

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    const payload = {
      rawSms: "Your Commercial Bank Card ending 1234 was used for LKR 3,000.00 at SPAR on 2026-10-16.",
      sender: "COMBANK",
      receivedAt: "2026-10-16T10:00:00.000Z",
    };

    // First POST -> 202 Accepted
    const res1 = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: payload,
    });
    expect(res1.status()).toBe(202);

    // Second POST identical -> 200 DUPLICATE
    const res2 = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: payload,
    });
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();
    expect(body2.status).toBe("DUPLICATE");

    // Verify snapshot contains exactly 1 BankSms
    const snapshot = await app.testApi.getSnapshot();
    const rows = snapshot.bankSms.filter((s: { rawMessage: string }) => s.rawMessage === payload.rawSms);
    expect(rows.length).toBe(1);
  });

  test("S14-06: POST an OTP SMS → status IGNORED_NON_TX and no transaction created", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1406", email: "s1406@example.com" });
    await app.waitForSyncIdle();

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    const otpPayload = {
      rawSms: "Your Commercial Bank OTP is 948201 for Online Banking. Valid for 5 minutes. Do not share.",
      sender: "COMBANK",
      receivedAt: "2026-10-16T11:00:00.000Z",
    };

    const res = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: otpPayload,
    });
    expect(res.status()).toBe(202);

    await app.testApi.tick();

    // Verify status in DB snapshot
    const snapshot = await app.testApi.getSnapshot();
    const sms = snapshot.bankSms.find((s: { sender: string }) => s.sender === "COMBANK");
    expect(sms).toBeDefined();
    expect(sms.status).toBe("IGNORED_NON_TX");
    expect(sms.transactionId).toBeNull();

    // No transaction created
    expect(snapshot.transactions.length).toBe(0);
  });

  test("S14-07: POST a malformed payload → 400 with validation message; nothing stored", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1407", email: "s1407@example.com" });
    await app.waitForSyncIdle();

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // Empty or malformed payload missing rawSms
    const res = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: { sender: "COMBANK" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");

    // Nothing stored
    const snapshot = await app.testApi.getSnapshot();
    expect(snapshot.bankSms.length).toBe(0);
  });

  test("S14-08: Burst of requests above the limit → 429", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1408", email: "s1408@example.com" });
    await app.waitForSyncIdle();

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // Send a burst of requests
    const responses = [];
    for (let i = 0; i < 7; i++) {
      responses.push(
        page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
          headers: { "x-api-key": apiKey },
          data: {
            rawSms: `Rapid burst SMS message ${i}`,
            sender: "COMBANK",
            receivedAt: new Date(Date.now() + i * 1000).toISOString(),
          },
        })
      );
    }

    const results = await Promise.all(responses);
    const statuses = results.map((r) => r.status());
    expect(statuses).toContain(429);
  });

  test("S14-09: Activity log: raw SMS viewer, parsed JSON inspect, status filters work", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1409", email: "s1409@example.com" });
    await app.waitForSyncIdle();

    const userId = await page.evaluate(() => localStorage.getItem("hardmoney_active_user") || "user-s1409");

    // Seed account
    await app.testApi.seed({
      accounts: [
        {
          id: "acc-1",
          userId,
          name: "Test Bank",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 0,
          accountNumberLast4: "5678",
          bankSenderIds: ["SAMPATH"],
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // 1. Transaction SMS
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: "Your Sampath Card ending 5678 was debited LKR 3,200.00 at CARGILLS FOOD CITY on 2026-10-16. Avail Bal LKR 95,000.00",
        sender: "SAMPATH",
        receivedAt: "2026-10-16T15:00:00.000Z",
      },
    });

    // 2. OTP SMS
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: "Your Sampath Bank OTP is 654321. Do not share with anyone.",
        sender: "SAMPATH",
        receivedAt: "2026-10-16T15:05:00.000Z",
      },
    });

    await app.testApi.tick();

    // Open Activity Log
    await page.goto("/more/sms-activity");

    // Expand transaction row for Cargills
    const txRow = page.locator('[data-testid^="sms-activity-row-"]').filter({ hasText: "CARGILLS" });
    await txRow.click();

    // Inspect raw viewer & parsed JSON
    await expect(txRow.locator('[data-testid="raw-sms-viewer"]')).toBeVisible();
    await expect(txRow.locator('[data-testid="raw-sms-viewer"]')).toContainText("Sampath");

    await expect(txRow.locator('[data-testid="parsed-json-inspect"]')).toBeVisible();
    await expect(txRow.locator('[data-testid="parsed-json-inspect"]')).toContainText("CARGILLS FOOD CITY");

    // Filter by Ignored
    await page.locator('[data-testid="status-filter-IGNORED_NON_TX"]').click();
    await expect(page.locator('[data-testid="sms-status-badge"]').first()).toContainText("IGNORED_NON_TX");

    // Filter by Processed
    await page.locator('[data-testid="status-filter-PROCESSED"]').click();
    await expect(page.locator('[data-testid="sms-status-badge"]').first()).toContainText("PROCESSED");
  });

  test("S14-10: Account matching by sender + last4: two accounts with the same last4 at different banks resolve correctly", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1410", email: "s1410@example.com" });
    await app.waitForSyncIdle();

    const userId = await page.evaluate(() => localStorage.getItem("hardmoney_active_user") || "user-s1410");

    // Two accounts with same last4 "9999" at COMBANK and SAMPATH
    await app.testApi.seed({
      accounts: [
        {
          id: "acc-combank-9999",
          userId,
          name: "Commercial Bank Savings",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 0,
          accountNumberLast4: "9999",
          bankSenderIds: ["COMBANK"],
        },
        {
          id: "acc-sampath-9999",
          userId,
          name: "Sampath Bank Savings",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 0,
          accountNumberLast4: "9999",
          bankSenderIds: ["SAMPATH"],
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // 1. COMBANK SMS
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: "Your Commercial Bank Card ending 9999 was used for LKR 5,000.00 at ODEL on 2026-10-15.",
        sender: "COMBANK",
        receivedAt: "2026-10-15T12:00:00.000Z",
      },
    });

    // 2. SAMPATH SMS
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: "Your Sampath Card ending 9999 was debited LKR 7,500.00 at GLOMARK on 2026-10-15.",
        sender: "SAMPATH",
        receivedAt: "2026-10-15T12:05:00.000Z",
      },
    });

    await app.testApi.tick();

    const snapshot = await app.testApi.getSnapshot();
    const txCombank = snapshot.transactions.find((t: { amountMinor: number }) => t.amountMinor === 500000);
    const txSampath = snapshot.transactions.find((t: { amountMinor: number }) => t.amountMinor === 750000);

    expect(txCombank).toBeDefined();
    expect(txCombank.accountId).toBe("acc-combank-9999");

    expect(txSampath).toBeDefined();
    expect(txSampath.accountId).toBe("acc-sampath-9999");
  });

  test("S14-11: Webhook response returns immediately (< 500 ms) even when the worker is paused (queue persists)", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1411", email: "s1411@example.com" });
    await app.waitForSyncIdle();

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // Pause the worker
    await app.testApi.pauseWorker(true);

    const start = Date.now();
    const res = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: "Your Commercial Bank Card ending 1234 was used for LKR 2,000.00 at STORE on 2026-10-15.",
        sender: "COMBANK",
        receivedAt: "2026-10-15T16:00:00.000Z",
      },
    });
    const duration = Date.now() - start;

    expect(res.status()).toBe(202);
    expect(duration).toBeLessThan(500);

    // Queue persists with PENDING status
    let snapshot = await app.testApi.getSnapshot();
    let queuedSms = snapshot.bankSms.find((s: { rawMessage: string }) => s.rawMessage.includes("LKR 2,000.00"));
    expect(queuedSms).toBeDefined();
    expect(queuedSms.status).toBe("PENDING");

    // Unpause worker and process
    await app.testApi.pauseWorker(false);
    await app.testApi.processSms();

    snapshot = await app.testApi.getSnapshot();
    queuedSms = snapshot.bankSms.find((s: { rawMessage: string }) => s.rawMessage.includes("LKR 2,000.00"));
    expect(queuedSms.status).not.toBe("PENDING");
  });

  test("S14-12: Raw SMS text is absent from captured server logs (Test API log capture)", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1412", email: "s1412@example.com" });
    await app.waitForSyncIdle();

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    await app.testApi.clearLogs();

    const secretMarker = "SUPER_SECRET_TOKEN_XYZ_8888";
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: `Transaction alert: LKR 100 paid to Store with secret code ${secretMarker}`,
        sender: "COMBANK",
        receivedAt: "2026-10-15T18:00:00.000Z",
      },
    });

    await app.testApi.tick();

    const { logs } = await app.testApi.getLogs();
    const leakedLog = logs.find((l) => l.includes(secretMarker));
    expect(leakedLog).toBeUndefined();
  });

  test("S14-13: Apple Shortcuts setup guide page renders and the download link returns a file", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1413", email: "s1413@example.com" });
    await app.waitForSyncIdle();

    // Navigate to Shortcuts setup guide
    await app.go("more");
    await page.locator('[data-testid="shortcuts-guide-link"]').click();

    await expect(page.getByRole("heading", { name: "Apple Shortcuts Setup Guide" })).toBeVisible();
    const downloadBtn = page.locator('[data-testid="download-shortcut-btn"]');
    await expect(downloadBtn).toBeVisible();

    // Download returns a static template without user-specific server state
    const downloadRes = await page.request.get("http://localhost:3000/HardMoney_SMS_Ingress.shortcut");
    expect(downloadRes.status()).toBe(200);
    expect(await downloadRes.text()).toContain("YOUR_WEBHOOK_API_KEY");
  });

  test("S14-14: Real-world Sampath Bank SMS with security footer -> successfully processes without false OTP trigger", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1414", email: "s1414@example.com" });
    await app.waitForSyncIdle();

    const userId = await page.evaluate(() => localStorage.getItem("hardmoney_active_user") || "user-s1414");

    // Seed account with last4 4681 and bank sender SAMPATH
    await app.testApi.seed({
      accounts: [
        {
          id: "acc-sampath-4681",
          userId,
          name: "Sampath Savings",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 0,
          accountNumberLast4: "4681",
          bankSenderIds: ["SAMPATH"],
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // 1. Inward credit with "Do not Share OTP" security footer
    const realCreditSms = `LKR 10,000.00 credited to AC **4681 for FuneralVishwa-Donation for
18/10/2026 03:08:38 To Inq Call 0112303050 Get protected -Do not Share OTP`;

    const res1 = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: realCreditSms,
        sender: "SAMPATH",
        receivedAt: "2026-10-18T03:08:38.000Z",
      },
    });
    expect(res1.status()).toBe(202);

    // 2. ATM debit with "Do not Share OTP" security footer
    const realAtmSms = `LKR 88,005.00 debited from AC **4681 via ATM at EHELIYAGODA BRANCH CASH SET
17/10/2026 06:00:28
To Inq Call 0112303050
Get protected -Do not Share OTP`;

    const res2 = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: realAtmSms,
        sender: "SAMPATH",
        receivedAt: "2026-10-17T06:00:28.000Z",
      },
    });
    expect(res2.status()).toBe(202);

    await app.testApi.tick();

    const snapshot = await app.testApi.getSnapshot();
    const txCredit = snapshot.transactions.find((t: { amountMinor: number }) => t.amountMinor === 1000000);
    const txAtm = snapshot.transactions.find((t: { amountMinor: number }) => t.amountMinor === 8800500);

    expect(txCredit).toBeDefined();
    expect(txCredit.type).toBe("INCOME");
    expect(txCredit.accountId).toBe("acc-sampath-4681");

    expect(txAtm).toBeDefined();
    expect(["TRANSFER", "EXPENSE"]).toContain(txAtm.type);
    expect(["ATM_WITHDRAWAL", "ATM_OWN"]).toContain(txAtm.subType);
    expect(txAtm.accountId).toBe("acc-sampath-4681");
  });

  test("S14-15: Real-world DFCC Bank POS SMS with no-space amount and balance -> successfully parsed and mapped to account", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1415", email: "s1415@example.com" });
    await app.waitForSyncIdle();

    const userId = await page.evaluate(() => localStorage.getItem("hardmoney_active_user") || "user-s1415");

    await app.testApi.seed({
      accounts: [
        {
          id: "acc-dfcc-0726",
          userId,
          name: "DFCC Bank Account",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 0,
          accountNumberLast4: "0726",
          bankSenderIds: ["DFCC"],
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    const dfccSms = "Your A/C No: ********0726 is debited with LKR678.00 on 16 OCT 2026 ref: KEELLS SUPER - KADUWELA KADUWELA. Your bal is LKR1,822.73. If unauthorized call 0112350035";

    const res = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: dfccSms,
        sender: "DFCC",
        receivedAt: "2026-10-16T10:00:00.000Z",
      },
    });
    expect(res.status()).toBe(202);

    await app.testApi.tick();

    const snapshot = await app.testApi.getSnapshot();
    const tx = snapshot.transactions.find((t: { amountMinor: number }) => t.amountMinor === 67800);
    expect(tx).toBeDefined();
    expect(tx.accountId).toBe("acc-dfcc-0726");
    expect(tx.note).toBe("KEELLS SUPER - KADUWELA KADUWELA");

    const smsRecord = snapshot.bankSms.find((s: { rawMessage: string }) => s.rawMessage.includes("LKR678.00"));
    expect(smsRecord).toBeDefined();
    expect(smsRecord.status).toBe("PROCESSED");
    expect(smsRecord.parsedPayload?.balanceAfterText).toBe("1,822.73");
  });

  test("S14-16: Real-world Sampath Credit Card Auth Pmt SMS -> successfully debited to credit card account with correct amount", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1416", email: "s1416@example.com" });
    await app.waitForSyncIdle();

    const userId = await page.evaluate(() => localStorage.getItem("hardmoney_active_user") || "user-s1416");

    await app.testApi.seed({
      accounts: [
        {
          id: "acc-sampath-card-6909",
          userId,
          name: "Sampath Mastercard",
          type: "CREDIT_CARD",
          openingBalanceMinor: 0,
          accountNumberLast4: "6909",
          bankSenderIds: ["SAMPATH"],
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    const ccSms = `Cr Crd no..**6909 Auth Pmt LKR 6,676.00 at KEELLS SUPER - KADUWELA Avl Bal LKR 138,783.04 Enq Call 0112300604
- Sampath Bank 18-OCT`;

    const res = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: ccSms,
        sender: "SAMPATH",
        receivedAt: "2026-10-18T10:15:00.000Z",
      },
    });
    expect(res.status()).toBe(202);

    await app.testApi.tick();

    const snapshot = await app.testApi.getSnapshot();
    const tx = snapshot.transactions.find((t: { amountMinor: number }) => t.amountMinor === 667600);
    expect(tx).toBeDefined();
    expect(tx.accountId).toBe("acc-sampath-card-6909");
    expect(tx.note).toBe("KEELLS SUPER - KADUWELA");

    const smsRecord = snapshot.bankSms.find((s: { rawMessage: string }) => s.rawMessage.includes("LKR 6,676.00"));
    expect(smsRecord).toBeDefined();
    expect(smsRecord.status).toBe("PROCESSED");
    expect(smsRecord.parsedPayload?.balanceAfterText).toBe("138,783.04");
  });

  test("S14-17: Inter-account transfer between DFCC and Sampath -> auto-merged as a single TRANSFER transaction", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1417", email: "s1417@example.com" });
    await app.waitForSyncIdle();

    const userId = await page.evaluate(() => localStorage.getItem("hardmoney_active_user") || "user-s1417");

    await app.testApi.seed({
      accounts: [
        {
          id: "acc-dfcc-0726",
          userId,
          name: "DFCC Account",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 50000000,
          accountNumberLast4: "0726",
          bankSenderIds: ["DFCC"],
        },
        {
          id: "acc-sampath-4681",
          userId,
          name: "Sampath Account",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 1000000,
          accountNumberLast4: "4681",
          bankSenderIds: ["SAMPATH"],
        },
      ],
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // 1. Post DFCC debit SMS
    const dfccSms = "Your A/C No: ********0726 is debited with LKR1,000.00 on 27 OCT 2026 ref: Outward CEFT Transfer. Your bal is LKR495,975.39. If unauthorized call 0112350035";
    const res1 = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: dfccSms,
        sender: "DFCC",
        receivedAt: "2026-10-27T18:58:30.000Z",
      },
    });
    expect(res1.status()).toBe(202);

    // 2. Post Sampath credit SMS
    const sampathSms = `LKR 1,000.00 credited to AC **4681 for test
27/10/2026 18:58:50
To Inq Call 0112303050
Get protected -Do not Share OTP`;
    const res2 = await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: sampathSms,
        sender: "SAMPATH",
        receivedAt: "2026-10-27T18:58:50.000Z",
      },
    });
    expect(res2.status()).toBe(202);

    await app.testApi.tick();

    const snapshot = await app.testApi.getSnapshot();
    // Reconciled into exactly 1 TRANSFER transaction!
    expect(snapshot.transactions.length).toBe(1);
    const tx = snapshot.transactions[0];
    expect(tx.type).toBe("TRANSFER");
    expect(tx.accountId).toBe("acc-dfcc-0726");
    expect(tx.toAccountId).toBe("acc-sampath-4681");
    expect(tx.amountMinor).toBe(100000);

    // Both SMS records are marked PROCESSED and linked to this transaction
    expect(snapshot.bankSms.length).toBe(2);
    expect(snapshot.bankSms.every((s: { status: string; transactionId?: string }) => s.status === "PROCESSED" && s.transactionId === tx.id)).toBe(true);
  });

  test("S14-18: Inter-account transfer under ALWAYS_REVIEW_GEMINI -> flagged as POSSIBLE_TRANSFER and merged via Inbox API", async ({ page }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "User S1418", email: "s1418@example.com" });
    await app.waitForSyncIdle();

    const userId = await page.evaluate(() => localStorage.getItem("hardmoney_active_user") || "user-s1418");

    await app.testApi.seed({
      accounts: [
        {
          id: "acc-dfcc-0726-rev",
          userId,
          name: "DFCC Account",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 50000000,
          accountNumberLast4: "0726",
          bankSenderIds: ["DFCC"],
        },
        {
          id: "acc-sampath-4681-rev",
          userId,
          name: "Sampath Account",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 1000000,
          accountNumberLast4: "4681",
          bankSenderIds: ["SAMPATH"],
        },
      ],
    });

    // Set auto-post mode to ALWAYS_REVIEW_GEMINI so it stops at inbox
    await page.request.patch("http://localhost:3000/api/user/gemini-settings", {
      data: { smsAutoPostMode: "ALWAYS_REVIEW_GEMINI" },
    });

    const genRes = await page.request.post("http://localhost:3000/api/user/webhook-key");
    const { apiKey } = await genRes.json();

    // 1. Post DFCC debit
    const dfccSms = "Your A/C No: ********0726 is debited with LKR1,000.00 on 27 OCT 2026 ref: Outward CEFT Transfer. Your bal is LKR495,975.39. If unauthorized call 0112350035";
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: dfccSms,
        sender: "DFCC",
        receivedAt: "2026-10-27T18:58:30.000Z",
      },
    });

    // 2. Post Sampath credit
    const sampathSms = `LKR 1,000.00 credited to AC **4681 for test
27/10/2026 18:58:50
To Inq Call 0112303050
Get protected -Do not Share OTP`;
    await page.request.post("http://localhost:3000/api/v1/webhooks/sms-ingress", {
      headers: { "x-api-key": apiKey },
      data: {
        rawSms: sampathSms,
        sender: "SAMPATH",
        receivedAt: "2026-10-27T18:58:50.000Z",
      },
    });

    await app.testApi.tick();

    const snapshot = await app.testApi.getSnapshot();
    const reviewItem = snapshot.bankSms.find((s: { reviewReason?: string }) => s.reviewReason === "POSSIBLE_TRANSFER");
    expect(reviewItem).toBeDefined();

    // Call merge-transfer endpoint
    const mergeRes = await page.request.post(`http://localhost:3000/api/sms/inbox/${reviewItem.id}/merge-transfer`);
    expect(mergeRes.status()).toBe(200);

    const afterMergeSnapshot = await app.testApi.getSnapshot();
    expect(afterMergeSnapshot.transactions.length).toBe(1);
    const tx = afterMergeSnapshot.transactions[0];
    expect(tx.type).toBe("TRANSFER");
    expect(tx.accountId).toBe("acc-dfcc-0726-rev");
    expect(tx.toAccountId).toBe("acc-sampath-4681-rev");
  });
});

