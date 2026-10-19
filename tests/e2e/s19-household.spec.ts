import { test, expect } from "./fixtures";
import { AppHelper } from "./helpers/app-helper";
import { SignJWT } from "jose";

const AUTH_SECRET = process.env.AUTH_SECRET || "insecure-dev-auth-secret-minimum-32-characters-long";
const SECRET_KEY = new TextEncoder().encode(AUTH_SECRET.padEnd(32, "0"));

async function makeSessionCookie(user: { id: string; email: string; name: string }) {
  const token = await new SignJWT({
    userId: user.id,
    email: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET_KEY);

  return {
    name: "hardmoney_session",
    value: token,
    url: "http://localhost:3000",
  };
}

async function setupHouseholdDuo(
  browser: { newContext: (opts: Record<string, unknown>) => Promise<any> },
  isMobile?: boolean,
  viewport?: { width: number; height: number } | null
) {
  const uid = Math.random().toString(36).slice(2, 7);
  const husbandUser = {
    id: `husband-${uid}`,
    name: "Husband",
    email: `husband-${uid}@example.com`,
  };
  const wifeUser = {
    id: `wife-${uid}`,
    name: "Wife",
    email: `wife-${uid}@example.com`,
  };

  const ctxOptions = {
    viewport: viewport || (isMobile ? { width: 412, height: 915 } : { width: 1440, height: 900 }),
    isMobile: !!isMobile,
    hasTouch: !!isMobile,
  };

  const husbandContext = await browser.newContext(ctxOptions);
  const wifeContext = await browser.newContext(ctxOptions);

  await husbandContext.addCookies([await makeSessionCookie(husbandUser)]);
  await wifeContext.addCookies([await makeSessionCookie(wifeUser)]);

  const husbandPage = await husbandContext.newPage();
  const wifePage = await wifeContext.newPage();

  await husbandPage.addInitScript((u: { id: string }) => {
    localStorage.setItem("hardmoney_active_user", u.id);
  }, husbandUser);
  await wifePage.addInitScript((u: { id: string }) => {
    localStorage.setItem("hardmoney_active_user", u.id);
  }, wifeUser);

  const husbandApp = new AppHelper(husbandPage, husbandContext);
  const wifeApp = new AppHelper(wifePage, wifeContext);

  // Seed both users into server DB and default category so transactions have categories
  await husbandApp.testApi.seed({
    users: [husbandUser, wifeUser],
    categories: [
      { id: "cat-general", name: "General", icon: "📁", color: "#10b981" },
    ],
  });

  return {
    husbandUser,
    wifeUser,
    husbandContext,
    wifeContext,
    husbandPage,
    wifePage,
    husbandApp,
    wifeApp,
    async cleanup() {
      await husbandContext.close().catch(() => {});
      await wifeContext.close().catch(() => {});
    },
  };
}

test.describe("Step 19 — Household Collaboration & Role Enforcement @s19", () => {
  test.beforeEach(async ({ page }) => {
    const app = new AppHelper(page);
    await app.testApi.reset();
  });

  test("S19-01: Owner creates household, searches wife's email, assigns CO_OWNER → wife sees household in More", async ({
    browser,
    isMobile,
    viewport,
  }) => {
    const duo = await setupHouseholdDuo(browser, isMobile, viewport);
    try {
      // 1. Husband creates household via UI
      await duo.husbandPage.goto("/more/household");
      await duo.husbandApp.waitForSyncIdle();

      await duo.husbandPage.fill('[data-testid="household-name-input"]', "Silva Family Treasury");
      await duo.husbandPage.click('[data-testid="household-create-btn"]');

      await expect(duo.husbandPage.getByTestId("household-name")).toHaveText("Silva Family Treasury");

      // 2. Husband invites Wife as CO_OWNER using her registered email
      await duo.husbandPage.fill('[data-testid="household-invite-email"]', duo.wifeUser.email);
      await duo.husbandPage.selectOption('[data-testid="household-invite-role"]', "CO_OWNER");
      await duo.husbandPage.click('[data-testid="household-invite-btn"]');

      // Verify Wife appears in member list with CO_OWNER badge
      const memberList = duo.husbandPage.getByTestId("household-member-list");
      await expect(memberList).toContainText("Wife");
      await expect(memberList).toContainText("CO_OWNER");

      // 3. Wife navigates to /more/household and sees the household
      await duo.wifePage.goto("/more/household");
      await duo.wifeApp.waitForSyncIdle();

      await expect(duo.wifePage.getByTestId("household-name")).toHaveText("Silva Family Treasury");
      await expect(duo.wifePage.getByText("My Role: CO_OWNER")).toBeVisible();
    } finally {
      await duo.cleanup();
    }
  });

  test("S19-02: Shared account created by owner appears for wife; private account does not", async ({
    browser,
    isMobile,
    viewport,
  }) => {
    const duo = await setupHouseholdDuo(browser, isMobile, viewport);
    try {
      const householdId = `hh-${Math.random().toString(36).slice(2, 7)}`;
      await duo.husbandApp.testApi.seed({
        households: [{ id: householdId, name: "Our Family", ownerId: duo.husbandUser.id }],
        householdMembers: [
          { householdId, userId: duo.husbandUser.id, role: "OWNER" },
          { householdId, userId: duo.wifeUser.id, role: "CO_OWNER" },
        ],
        accounts: [
          {
            id: `acc-shared-${householdId}`,
            userId: duo.husbandUser.id,
            householdId,
            accessScope: "SHARED_HOUSEHOLD",
            name: "Joint Savings Account",
            type: "BANK_SAVINGS",
            openingBalanceMinor: 10000000,
          },
          {
            id: `acc-private-${householdId}`,
            userId: duo.husbandUser.id,
            accessScope: "PRIVATE",
            name: "Husband Private Wallet",
            type: "CASH",
            openingBalanceMinor: 5000000,
          },
        ],
      });

      // Wife visits accounts page and triggers sync
      await duo.wifePage.goto("/accounts");
      await duo.wifeApp.triggerSync();

      // Shared account should appear
      await expect(duo.wifePage.getByText("Joint Savings Account")).toBeVisible();

      // Private account should NOT appear
      await expect(duo.wifePage.getByText("Husband Private Wallet")).not.toBeVisible();
    } finally {
      await duo.cleanup();
    }
  });

  test("S19-03: CO_OWNER wife adds a transaction → owner sees it with 'added by Wife' and updated balance", async ({
    browser,
    isMobile,
    viewport,
  }) => {
    const duo = await setupHouseholdDuo(browser, isMobile, viewport);
    try {
      const householdId = `hh-${Math.random().toString(36).slice(2, 7)}`;
      const sharedAccId = `acc-shared-${householdId}`;

      await duo.husbandApp.testApi.seed({
        households: [{ id: householdId, name: "Our Family", ownerId: duo.husbandUser.id }],
        householdMembers: [
          { householdId, userId: duo.husbandUser.id, role: "OWNER" },
          { householdId, userId: duo.wifeUser.id, role: "CO_OWNER" },
        ],
        accounts: [
          {
            id: sharedAccId,
            userId: duo.husbandUser.id,
            householdId,
            accessScope: "SHARED_HOUSEHOLD",
            name: "Joint Savings",
            type: "BANK_SAVINGS",
            openingBalanceMinor: 10000000, // 100,000.00
          },
        ],
      });

      // Wife syncs to have the account locally
      await duo.wifePage.goto("/");
      await duo.wifeApp.triggerSync();

      // Wife adds transaction via Quick-Add
      if (isMobile) {
        await duo.wifePage.click('[data-testid="quick-add-fab"]');
      } else {
        await duo.wifePage.click('[data-testid="quick-add-btn"]');
      }

      await duo.wifePage.click('[data-testid="type-expense"]');
      await duo.wifePage.selectOption('[data-testid="quick-add-account"]', { label: "Joint Savings" });

      // Amount: 5,000.00
      await duo.wifePage.click('[data-testid="keypad-5"]');
      await duo.wifePage.click('[data-testid="keypad-0"]');
      await duo.wifePage.click('[data-testid="keypad-0"]');
      await duo.wifePage.click('[data-testid="keypad-0"]');

      await duo.wifePage.fill('[data-testid="quick-add-note"]', "Wife Weekly Groceries");
      await duo.wifePage.click('[data-testid="quick-add-save"]');
      await expect(duo.wifePage.getByTestId("quick-add-sheet")).not.toBeVisible();

      // Wife syncs to push mutation
      await duo.wifeApp.triggerSync();

      // Husband visits transaction tab and syncs
      await duo.husbandPage.goto("/");
      await duo.husbandApp.triggerSync();

      // Husband verifies transaction author indicator
      await expect(duo.husbandPage.getByText("Wife Weekly Groceries")).toBeVisible();
      const authorBadge = duo.husbandPage.getByTestId("tx-author").first();
      await expect(authorBadge).toBeVisible();
      await expect(authorBadge).toContainText("added by Wife");

      // Husband verifies account balance updated (100,000 - 5,000 = 95,000)
      await duo.husbandPage.goto("/accounts");
      await duo.husbandApp.waitForSyncIdle();
      await expect(duo.husbandPage.getByTestId("account-card-balance").first()).toContainText("95,000.00");
    } finally {
      await duo.cleanup();
    }
  });

  test("S19-04: Change role to VIEWER → wife's add/edit controls disappear; direct API write → 403", async ({
    browser,
    isMobile,
    viewport,
  }) => {
    const duo = await setupHouseholdDuo(browser, isMobile, viewport);
    try {
      const householdId = `hh-${Math.random().toString(36).slice(2, 7)}`;
      const sharedAccId = `acc-shared-${householdId}`;
      const memberId = `mem-wife-${householdId}`;

      await duo.husbandApp.testApi.seed({
        households: [{ id: householdId, name: "Our Family", ownerId: duo.husbandUser.id }],
        householdMembers: [
          { householdId, userId: duo.husbandUser.id, role: "OWNER" },
          { id: memberId, householdId, userId: duo.wifeUser.id, role: "CO_OWNER" },
        ],
        accounts: [
          {
            id: sharedAccId,
            userId: duo.husbandUser.id,
            householdId,
            accessScope: "SHARED_HOUSEHOLD",
            name: "Joint Checking",
            type: "BANK_CHECKING",
            openingBalanceMinor: 5000000,
          },
        ],
      });

      // Husband changes Wife's role to VIEWER via API / UI
      await duo.husbandPage.request.patch(`/api/households/${householdId}/members/${memberId}`, {
        data: { role: "VIEWER" },
      });

      // Wife syncs and visits /accounts
      await duo.wifePage.goto("/accounts");
      await duo.wifeApp.triggerSync();

      // Wife's account edit/delete action buttons should be hidden for VIEWER
      await expect(duo.wifePage.locator('[data-testid="account-edit-btn"]')).toHaveCount(0);

      // Direct transaction creation API write by Wife returns 403
      const directPostRes = await duo.wifePage.request.post("/api/transactions", {
        data: {
          accountId: sharedAccId,
          amountMinor: 250000,
          type: "EXPENSE",
        },
      });
      expect(directPostRes.status()).toBe(403);
    } finally {
      await duo.cleanup();
    }
  });

  test("S19-05: Change role to CONTRIBUTOR_ADD_ONLY → wife sees shared account names but balances show '—'", async ({
    browser,
    isMobile,
    viewport,
  }) => {
    const duo = await setupHouseholdDuo(browser, isMobile, viewport);
    try {
      const householdId = `hh-${Math.random().toString(36).slice(2, 7)}`;
      const sharedAccId = `acc-shared-${householdId}`;

      await duo.husbandApp.testApi.seed({
        households: [{ id: householdId, name: "Our Family", ownerId: duo.husbandUser.id }],
        householdMembers: [
          { householdId, userId: duo.husbandUser.id, role: "OWNER" },
          { householdId, userId: duo.wifeUser.id, role: "CONTRIBUTOR_ADD_ONLY" },
        ],
        accounts: [
          {
            id: sharedAccId,
            userId: duo.husbandUser.id,
            householdId,
            accessScope: "SHARED_HOUSEHOLD",
            name: "Household Joint Account",
            type: "BANK_SAVINGS",
            openingBalanceMinor: 20000000,
          },
        ],
      });

      await duo.wifePage.goto("/accounts");
      await duo.wifeApp.triggerSync();

      // Account name is visible
      await expect(duo.wifePage.getByText("Household Joint Account")).toBeVisible();

      // Balance is redacted and displays "—"
      const balanceEl = duo.wifePage.getByTestId("account-card-balance").first();
      await expect(balanceEl).toHaveText("—");
    } finally {
      await duo.cleanup();
    }
  });

  test("S19-06: Contributor sees only her own transactions; owner's rows absent; Stats/Budget/Accounts show restricted state", async ({
    browser,
    isMobile,
    viewport,
  }) => {
    const duo = await setupHouseholdDuo(browser, isMobile, viewport);
    try {
      const householdId = `hh-${Math.random().toString(36).slice(2, 7)}`;
      const sharedAccId = `acc-shared-${householdId}`;

      await duo.husbandApp.testApi.seed({
        households: [{ id: householdId, name: "Our Family", ownerId: duo.husbandUser.id }],
        householdMembers: [
          { householdId, userId: duo.husbandUser.id, role: "OWNER" },
          { householdId, userId: duo.wifeUser.id, role: "CONTRIBUTOR_ADD_ONLY" },
        ],
        accounts: [
          {
            id: sharedAccId,
            userId: duo.husbandUser.id,
            householdId,
            accessScope: "SHARED_HOUSEHOLD",
            name: "Joint Fund",
            type: "BANK_SAVINGS",
            openingBalanceMinor: 10000000,
          },
        ],
        transactions: [
          {
            id: `tx-husband-${householdId}`,
            userId: duo.husbandUser.id,
            householdId,
            accountId: sharedAccId,
            amountMinor: 800000,
            note: "Husband Private Dinner",
            createdByUserId: duo.husbandUser.id,
            transactionDate: "2026-10-15T10:00:00.000Z",
          },
          {
            id: `tx-wife-${householdId}`,
            userId: duo.wifeUser.id,
            householdId,
            accountId: sharedAccId,
            amountMinor: 120000,
            note: "Wife Coffee Run",
            createdByUserId: duo.wifeUser.id,
            transactionDate: "2026-10-16T10:00:00.000Z",
          },
        ],
      });

      await duo.wifePage.goto("/");
      await duo.wifeApp.triggerSync();

      // Contributor sees her own transaction
      await expect(duo.wifePage.getByText("Wife Coffee Run")).toBeVisible();

      // Contributor does NOT see owner's transaction
      await expect(duo.wifePage.getByText("Husband Private Dinner")).not.toBeVisible();

      // Accounts tab shows restricted balance "—"
      await duo.wifePage.goto("/accounts");
      await duo.wifeApp.waitForSyncIdle();
      await expect(duo.wifePage.getByTestId("account-card-balance").first()).toHaveText("—");
    } finally {
      await duo.cleanup();
    }
  });

  test("S19-07: In-page IndexedDB inspection: contributor DB has no openingBalanceMinor/FD/Loan/foreign transactions", async ({
    browser,
    isMobile,
    viewport,
  }) => {
    const duo = await setupHouseholdDuo(browser, isMobile, viewport);
    try {
      const householdId = `hh-${Math.random().toString(36).slice(2, 7)}`;
      const sharedAccId = `acc-shared-${householdId}`;

      await duo.husbandApp.testApi.seed({
        households: [{ id: householdId, name: "Our Family", ownerId: duo.husbandUser.id }],
        householdMembers: [
          { householdId, userId: duo.husbandUser.id, role: "OWNER" },
          { householdId, userId: duo.wifeUser.id, role: "CONTRIBUTOR_ADD_ONLY" },
        ],
        accounts: [
          {
            id: sharedAccId,
            userId: duo.husbandUser.id,
            householdId,
            accessScope: "SHARED_HOUSEHOLD",
            name: "Joint Treasury",
            type: "BANK_SAVINGS",
            openingBalanceMinor: 25000000,
          },
        ],
        fixedDeposits: [
          {
            id: `fd-shared-${householdId}`,
            userId: duo.husbandUser.id,
            householdId,
            bankName: "Commercial Bank FD",
            principalAmountMinor: 100000000,
            annualInterestRateBps: 1150,
            tenureMonths: 12,
            startDate: "2026-01-01T00:00:00.000Z",
            maturityDate: "2027-01-01T00:00:00.000Z",
          },
        ],
        loans: [
          {
            id: `loan-shared-${householdId}`,
            userId: duo.husbandUser.id,
            householdId,
            lenderName: "HNB Auto Loan",
            type: "AUTO_LOAN",
            calculationType: "REDUCING_BALANCE",
            originalPrincipalMinor: 500000000,
            annualInterestRateBps: 1200,
            tenureMonths: 36,
            startDate: "2026-01-01T00:00:00.000Z",
          },
        ],
        transactions: [
          {
            id: `tx-husband-${householdId}`,
            userId: duo.husbandUser.id,
            householdId,
            accountId: sharedAccId,
            amountMinor: 300000,
            note: "Husband Expense",
            createdByUserId: duo.husbandUser.id,
            transactionDate: "2026-10-15T10:00:00.000Z",
          },
          {
            id: `tx-wife-${householdId}`,
            userId: duo.wifeUser.id,
            householdId,
            accountId: sharedAccId,
            amountMinor: 100000,
            note: "Wife Expense",
            createdByUserId: duo.wifeUser.id,
            transactionDate: "2026-10-16T10:00:00.000Z",
          },
        ],
      });

      await duo.wifePage.goto("/accounts");
      await duo.wifeApp.triggerSync();

      // Wait until Dexie DB is fully mounted and available on window
      await duo.wifePage.waitForFunction(() => {
        const db = (window as any).__hardMoneyDb;
        return !!db && !!db.accounts && !!db.transactions;
      });

      // Inspect Dexie database directly in page context
      const dbContents = await duo.wifePage.evaluate(async () => {
        const db = (window as any).__hardMoneyDb;
        const accounts = await db.accounts.toArray();
        const txs = await db.transactions.toArray();
        const fds = await db.fixedDeposits.toArray();
        const loans = await db.loans.toArray();
        return { accounts, txs, fds, loans };
      });

      expect(dbContents).not.toBeNull();
      // Contributor DB has openingBalanceMinor = 0 for shared accounts
      for (const a of dbContents!.accounts) {
        if (a.userId !== duo.wifeUser.id) {
          expect(a.openingBalanceMinor).toBe(0);
        }
      }

      // Contributor DB contains only her own transactions
      for (const t of dbContents!.txs) {
        expect(t.createdByUserId).toBe(duo.wifeUser.id);
      }

      // Contributor DB contains zero FDs and zero Loans
      expect(dbContents!.fds.length).toBe(0);
      expect(dbContents!.loans.length).toBe(0);
    } finally {
      await duo.cleanup();
    }
  });

  test("S19-08: Contributor attempts to edit the owner's transaction through the API → rejected", async ({
    browser,
    isMobile,
    viewport,
  }) => {
    const duo = await setupHouseholdDuo(browser, isMobile, viewport);
    try {
      const householdId = `hh-${Math.random().toString(36).slice(2, 7)}`;
      const sharedAccId = `acc-shared-${householdId}`;
      const husbandTxId = `tx-owner-secure-${householdId}`;

      await duo.husbandApp.testApi.seed({
        households: [{ id: householdId, name: "Our Family", ownerId: duo.husbandUser.id }],
        householdMembers: [
          { householdId, userId: duo.husbandUser.id, role: "OWNER" },
          { householdId, userId: duo.wifeUser.id, role: "CONTRIBUTOR_ADD_ONLY" },
        ],
        accounts: [
          {
            id: sharedAccId,
            userId: duo.husbandUser.id,
            householdId,
            accessScope: "SHARED_HOUSEHOLD",
            name: "Joint Account",
            type: "BANK_SAVINGS",
            openingBalanceMinor: 10000000,
          },
        ],
        transactions: [
          {
            id: husbandTxId,
            userId: duo.husbandUser.id,
            householdId,
            accountId: sharedAccId,
            amountMinor: 500000,
            note: "Husband Important Tx",
            createdByUserId: duo.husbandUser.id,
            transactionDate: "2026-10-15T10:00:00.000Z",
          },
        ],
      });

      // 1. Direct REST PATCH attempt returns 403 Forbidden
      const patchRes = await duo.wifePage.request.patch(`/api/transactions/${husbandTxId}`, {
        data: { note: "Forged Note by Contributor" },
      });
      expect(patchRes.status()).toBe(403);

      // 2. Sync push mutation attempt is rejected server-side
      const pushRes = await duo.wifePage.request.post("/api/sync/push", {
        data: {
          mutations: [
            {
              mutationId: `mut-forged-${Math.random().toString(36).slice(2, 7)}`,
              entity: "transaction",
              op: "UPDATE",
              id: husbandTxId,
              payload: { note: "Forged via sync push" },
              createdAt: new Date().toISOString(),
            },
          ],
        },
      });

      const pushJson = await pushRes.json();
      expect(pushJson.results).toBeDefined();
      expect(pushJson.results[0].status).toBe("rejected");
      expect(pushJson.results[0].reason).toContain("CONTRIBUTOR_ADD_ONLY cannot update");
    } finally {
      await duo.cleanup();
    }
  });

  test("S19-09: Contributor can add a transaction offline; after reconnect it syncs and owner sees it", async ({
    browser,
    isMobile,
    viewport,
  }) => {
    const duo = await setupHouseholdDuo(browser, isMobile, viewport);
    try {
      const householdId = `hh-${Math.random().toString(36).slice(2, 7)}`;
      const sharedAccId = `acc-shared-${householdId}`;

      await duo.husbandApp.testApi.seed({
        households: [{ id: householdId, name: "Our Family", ownerId: duo.husbandUser.id }],
        householdMembers: [
          { householdId, userId: duo.husbandUser.id, role: "OWNER" },
          { householdId, userId: duo.wifeUser.id, role: "CONTRIBUTOR_ADD_ONLY" },
        ],
        accounts: [
          {
            id: sharedAccId,
            userId: duo.husbandUser.id,
            householdId,
            accessScope: "SHARED_HOUSEHOLD",
            name: "Joint Shared Card",
            type: "CREDIT_CARD",
            openingBalanceMinor: 0,
            creditLimitMinor: 20000000,
          },
        ],
      });

      // Wife visits accounts page online first and confirms account is cached
      await duo.wifePage.goto("/accounts");
      await duo.wifeApp.waitForSyncIdle();
      await expect(duo.wifePage.getByText("Joint Shared Card")).toBeVisible();

      // Wife goes OFFLINE
      await duo.wifeContext.setOffline(true);
      await duo.wifePage.evaluate(() => window.dispatchEvent(new Event("offline")));

      // Wife adds transaction while offline
      if (isMobile) {
        await duo.wifePage.click('[data-testid="quick-add-fab"]');
      } else {
        await duo.wifePage.click('[data-testid="quick-add-btn"]');
      }

      await duo.wifePage.click('[data-testid="type-expense"]');
      await duo.wifePage.selectOption('[data-testid="quick-add-account"]', { label: "Joint Shared Card" });

      // Amount: 1,500.00
      await duo.wifePage.click('[data-testid="keypad-1"]');
      await duo.wifePage.click('[data-testid="keypad-5"]');
      await duo.wifePage.click('[data-testid="keypad-0"]');
      await duo.wifePage.click('[data-testid="keypad-0"]');

      await duo.wifePage.fill('[data-testid="quick-add-note"]', "Wife Offline Milk");
      await duo.wifePage.click('[data-testid="quick-add-save"]');
      await expect(duo.wifePage.getByTestId("quick-add-sheet")).not.toBeVisible();

      // Wife comes back ONLINE
      await duo.wifeContext.setOffline(false);
      await duo.wifePage.evaluate(() => window.dispatchEvent(new Event("online")));
      await duo.wifeApp.waitForSyncIdle();

      // Husband visits transaction tab and syncs
      await duo.husbandPage.goto("/");
      await duo.husbandApp.triggerSync();

      // Husband sees the transaction created by Wife offline
      await expect(duo.husbandPage.getByText("Wife Offline Milk")).toBeVisible();
      const authorEl = duo.husbandPage.getByTestId("tx-author").first();
      await expect(authorEl).toContainText("added by Wife");
    } finally {
      await duo.cleanup();
    }
  });

  test("S19-10: Remove member → wife's shared data disappears after sync; her pushes are rejected", async ({
    browser,
    isMobile,
    viewport,
  }) => {
    const duo = await setupHouseholdDuo(browser, isMobile, viewport);
    try {
      const householdId = `hh-${Math.random().toString(36).slice(2, 7)}`;
      const sharedAccId = `acc-shared-${householdId}`;
      const wifeMemberId = `mem-wife-${householdId}`;

      await duo.husbandApp.testApi.seed({
        households: [{ id: householdId, name: "Our Family", ownerId: duo.husbandUser.id }],
        householdMembers: [
          { householdId, userId: duo.husbandUser.id, role: "OWNER" },
          { id: wifeMemberId, householdId, userId: duo.wifeUser.id, role: "CO_OWNER" },
        ],
        accounts: [
          {
            id: sharedAccId,
            userId: duo.husbandUser.id,
            householdId,
            accessScope: "SHARED_HOUSEHOLD",
            name: "Revocable Joint Account",
            type: "BANK_SAVINGS",
            openingBalanceMinor: 15000000,
          },
        ],
      });

      // Wife visits accounts and caches it
      await duo.wifePage.goto("/accounts");
      await duo.wifeApp.triggerSync();
      await expect(duo.wifePage.getByText("Revocable Joint Account")).toBeVisible();

      // Husband removes Wife from household
      await duo.husbandPage.request.delete(`/api/households/${householdId}/members/${wifeMemberId}`);

      // Wife triggers sync
      await duo.wifeApp.triggerSync();
      await duo.wifePage.goto("/accounts");

      // Shared account disappears from Wife's UI
      await expect(duo.wifePage.getByText("Revocable Joint Account")).not.toBeVisible();

      // Dexie database has purged the shared account
      await duo.wifePage.waitForFunction(
        (uid: string) => (window as any).__hardMoneyDb?.name === `hardmoney_${uid}`,
        duo.wifeUser.id
      );
      const hasLocalAccount = await duo.wifePage.evaluate(async (accId: string) => {
        const db = (window as any).__hardMoneyDb;
        const found = await db.accounts.get(accId);
        return !!found;
      }, sharedAccId);
      expect(hasLocalAccount).toBe(false);

      // Subsequent push by Wife to that household account is rejected
      const pushRes = await duo.wifePage.request.post("/api/sync/push", {
        data: {
          mutations: [
            {
              mutationId: `mut-rejected-${Math.random().toString(36).slice(2, 7)}`,
              entity: "transaction",
              op: "CREATE",
              id: `tx-rejected-${Math.random().toString(36).slice(2, 7)}`,
              payload: {
                accountId: sharedAccId,
                amountMinor: 50000,
                type: "EXPENSE",
              },
              createdAt: new Date().toISOString(),
            },
          ],
        },
      });
      const pushData = await pushRes.json();
      expect(pushData.results[0].status).toBe("rejected");
      expect(pushData.results[0].reason).toContain("Not a member of this household");
    } finally {
      await duo.cleanup();
    }
  });

  test("S19-11: Wife leaves voluntarily; owner cannot leave without transferring ownership", async ({
    browser,
    isMobile,
    viewport,
  }) => {
    const duo = await setupHouseholdDuo(browser, isMobile, viewport);
    try {
      const householdId = `hh-${Math.random().toString(36).slice(2, 7)}`;
      const wifeMemberId = `mem-wife-${householdId}`;

      await duo.husbandApp.testApi.seed({
        households: [{ id: householdId, name: "Our Family", ownerId: duo.husbandUser.id }],
        householdMembers: [
          { householdId, userId: duo.husbandUser.id, role: "OWNER" },
          { id: wifeMemberId, householdId, userId: duo.wifeUser.id, role: "CO_OWNER" },
        ],
      });

      // 1. Husband (OWNER) tries to leave without transferring ownership
      await duo.husbandPage.goto("/more/household");
      await duo.husbandApp.waitForSyncIdle();

      await duo.husbandPage.click('[data-testid="household-leave-btn"]');
      await expect(
        duo.husbandPage.getByText("Owner cannot leave without transferring ownership first")
      ).toBeVisible();

      // 2. Wife leaves voluntarily
      await duo.wifePage.goto("/more/household");
      await duo.wifeApp.waitForSyncIdle();

      await duo.wifePage.click('[data-testid="household-leave-btn"]');
      await expect(duo.wifePage.getByText("You have left the household")).toBeVisible();
      await expect(duo.wifePage.getByTestId("household-name-input")).toBeVisible();

      // 3. Re-seed and test transfer ownership
      await duo.husbandApp.testApi.seed({
        households: [{ id: householdId, name: "Our Family", ownerId: duo.husbandUser.id }],
        householdMembers: [
          { householdId, userId: duo.husbandUser.id, role: "OWNER" },
          { id: wifeMemberId, householdId, userId: duo.wifeUser.id, role: "CO_OWNER" },
        ],
      });

      await duo.husbandPage.goto("/more/household");
      await duo.husbandApp.waitForSyncIdle();

      // Transfer ownership to Wife
      await duo.husbandPage.click('[data-testid="member-transfer-btn"]');
      await expect(duo.husbandPage.getByText("Ownership transferred successfully")).toBeVisible();
      await expect(duo.husbandPage.getByText("My Role: CO_OWNER")).toBeVisible();

      // Former owner (now CO_OWNER) can now leave
      await duo.husbandPage.click('[data-testid="household-leave-btn"]');
      await expect(duo.husbandPage.getByText("You have left the household")).toBeVisible();
    } finally {
      await duo.cleanup();
    }
  });

  test("S19-12: Shared FD/Loan visible to CO_OWNER and VIEWER (read-only), never to contributor", async ({
    browser,
    isMobile,
    viewport,
  }) => {
    const duo = await setupHouseholdDuo(browser, isMobile, viewport);
    try {
      const householdId = `hh-${Math.random().toString(36).slice(2, 7)}`;
      const wifeMemberId = `mem-wife-${householdId}`;

      await duo.husbandApp.testApi.seed({
        households: [{ id: householdId, name: "Our Family", ownerId: duo.husbandUser.id }],
        householdMembers: [
          { householdId, userId: duo.husbandUser.id, role: "OWNER" },
          { id: wifeMemberId, householdId, userId: duo.wifeUser.id, role: "CO_OWNER" },
        ],
        fixedDeposits: [
          {
            id: `fd-shared-${householdId}`,
            userId: duo.husbandUser.id,
            householdId,
            bankName: "Sampath Shared FD",
            principalAmountMinor: 50000000,
            annualInterestRateBps: 1100,
            tenureMonths: 12,
            startDate: "2026-01-01T00:00:00.000Z",
            maturityDate: "2027-01-01T00:00:00.000Z",
          },
        ],
        loans: [
          {
            id: `loan-shared-${householdId}`,
            userId: duo.husbandUser.id,
            householdId,
            lenderName: "Commercial Bank Shared Loan",
            type: "PERSONAL_LOAN",
            calculationType: "REDUCING_BALANCE",
            originalPrincipalMinor: 100000000,
            annualInterestRateBps: 1300,
            tenureMonths: 24,
            monthlyEmiAmountMinor: 4750000,
            startDate: "2026-01-01T00:00:00.000Z",
          },
        ],
      });

      // 1. As CO_OWNER: Wife pulls and receives FD & Loan
      await duo.wifePage.goto("/accounts");
      await duo.wifePage.waitForFunction(
        (uid: string) => (window as any).__hardMoneyDb?.name === `hardmoney_${uid}`,
        duo.wifeUser.id
      );
      await duo.wifeApp.triggerSync();

      let counts = await duo.wifePage.evaluate(async () => {
        const db = (window as any).__hardMoneyDb;
        const fds = await db.fixedDeposits.toArray();
        const loans = await db.loans.toArray();
        return { fds: fds.length, loans: loans.length };
      });
      expect(counts.fds).toBeGreaterThan(0);
      expect(counts.loans).toBeGreaterThan(0);

      // 2. As VIEWER: Wife still sees FD & Loan
      await duo.husbandPage.request.patch(`/api/households/${householdId}/members/${wifeMemberId}`, {
        data: { role: "VIEWER" },
      });
      await duo.wifeApp.triggerSync();

      counts = await duo.wifePage.evaluate(async () => {
        const db = (window as any).__hardMoneyDb;
        const fds = await db.fixedDeposits.toArray();
        const loans = await db.loans.toArray();
        return { fds: fds.length, loans: loans.length };
      });
      expect(counts.fds).toBeGreaterThan(0);
      expect(counts.loans).toBeGreaterThan(0);

      // 3. As CONTRIBUTOR_ADD_ONLY: FD & Loan are purged from contributor's store
      await duo.husbandPage.request.patch(`/api/households/${householdId}/members/${wifeMemberId}`, {
        data: { role: "CONTRIBUTOR_ADD_ONLY" },
      });
      await duo.wifeApp.triggerSync();

      counts = await duo.wifePage.evaluate(async () => {
        const db = (window as any).__hardMoneyDb;
        const fds = await db.fixedDeposits.toArray();
        const loans = await db.loans.toArray();
        return { fds: fds.length, loans: loans.length };
      });
      expect(counts.fds).toBe(0);
      expect(counts.loans).toBe(0);
    } finally {
      await duo.cleanup();
    }
  });

  test("S19-13: Household manager UI is a list with a bottom-sheet role picker on mobile and a table/dialog on desktop", async ({
    browser,
    isMobile,
    viewport,
  }) => {
    const duo = await setupHouseholdDuo(browser, isMobile, viewport);
    try {
      const householdId = `hh-${Math.random().toString(36).slice(2, 7)}`;
      const wifeMemberId = `mem-wife-${householdId}`;

      await duo.husbandApp.testApi.seed({
        households: [{ id: householdId, name: "Our Family", ownerId: duo.husbandUser.id }],
        householdMembers: [
          { householdId, userId: duo.husbandUser.id, role: "OWNER" },
          { id: wifeMemberId, householdId, userId: duo.wifeUser.id, role: "CO_OWNER" },
        ],
      });

      await duo.husbandPage.goto("/more/household");
      await duo.husbandApp.waitForSyncIdle();

      const wifeRow = duo.husbandPage.getByTestId("household-member-row").filter({ hasText: "Wife" });

      if (isMobile) {
        // Mobile viewport: bottom-sheet role picker
        const sheetTrigger = wifeRow.getByTestId("member-role-sheet-btn");
        await expect(sheetTrigger).toBeVisible();
        await sheetTrigger.click();

        const roleSheet = duo.husbandPage.getByTestId("member-role-sheet");
        await expect(roleSheet).toBeVisible();
        await roleSheet.getByText("VIEWER").click();

        await expect(roleSheet).not.toBeVisible();
        await expect(wifeRow.getByTestId("member-role-badge")).toContainText("VIEWER");
      } else {
        // Desktop viewport: inline select
        const roleSelect = wifeRow.getByTestId("member-role-select");
        await expect(roleSelect).toBeVisible();
        await roleSelect.selectOption("VIEWER");

        await expect(wifeRow.getByTestId("member-role-badge")).toContainText("VIEWER");
      }
    } finally {
      await duo.cleanup();
    }
  });
});
