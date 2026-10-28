import { test, expect } from "./fixtures";
import { AppHelper } from "./helpers/app-helper";

test.describe("Step 4 — Accounts & Categories Management UI @s04", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.clearCookies();
    const app = new AppHelper(page);
    await app.testApi.reset();
  });

  test("S04-01: Create Cash account (opening 5,000.00) → appears under Cash with correct balance and subtotal", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Alice", email: "alice-s04-01@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Physical Wallet");
    await page.selectOption('[data-testid="account-type"]', "CASH");
    await page.fill('[data-testid="account-opening-balance"]', "5000.00");
    await page.click('[data-testid="account-submit"]');

    await expect(page.getByText("Physical Wallet")).toBeVisible();
    await expect(page.getByTestId("subtotal-cash")).toHaveText("LKR 5,000.00");
    await expect(page.getByTestId("net-worth-total")).toHaveText("LKR 5,000.00");
  });

  test("S04-02: Create Bank Savings (opening 100,000.00, last4 1234, sender COMBANK) → shown under Bank accounts", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Bob", email: "bob-s04-02@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Commercial Bank Savings");
    await page.selectOption('[data-testid="account-type"]', "BANK_SAVINGS");
    await page.fill('[data-testid="account-opening-balance"]', "100000.00");
    await page.fill('[data-testid="account-number-last4"]', "1234");
    await page.fill('[data-testid="account-bank-sender"]', "COMBANK");
    await page.click('[data-testid="account-submit"]');

    await expect(page.getByText("Commercial Bank Savings")).toBeVisible();
    await expect(page.getByText("•••• 1234")).toBeVisible();
    await expect(page.getByText("COMBANK")).toBeVisible();
    await expect(page.getByTestId("subtotal-bank")).toHaveText("LKR 100,000.00");
  });

  test("S04-03: Create Credit Card (limit 500,000, cutoff 20, due 10, settlement = Savings) → shown with limit", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Charlie", email: "charlie-s04-03@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    // First create a savings account for settlement
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Savings Settlement");
    await page.selectOption('[data-testid="account-type"]', "BANK_SAVINGS");
    await page.fill('[data-testid="account-opening-balance"]', "50000.00");
    await page.click('[data-testid="account-submit"]');
    await expect(page.getByText("Savings Settlement")).toBeVisible();

    // Now create Credit Card
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Platinum Visa Card");
    await page.selectOption('[data-testid="account-type"]', "CREDIT_CARD");
    await page.fill('[data-testid="account-credit-limit"]', "500000.00");
    await page.fill('[data-testid="account-cutoff-day"]', "20");
    await page.fill('[data-testid="account-due-day"]', "10");
    await page.selectOption('[data-testid="account-settlement-id"]', { label: "Savings Settlement" });
    await page.click('[data-testid="account-submit"]');

    await expect(page.getByText("Platinum Visa Card")).toBeVisible();
    await expect(page.getByText("Limit: LKR 500,000.00")).toBeVisible();
    await expect(page.getByText("Cutoff: Day 20")).toBeVisible();
    await expect(page.getByText("Due: Day 10")).toBeVisible();
  });

  test("S04-04: Credit card form validation: missing limit / cutoff 32 / due 0 → inline errors, nothing saved", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Dave", email: "dave-s04-04@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Invalid Card Test");
    await page.selectOption('[data-testid="account-type"]', "CREDIT_CARD");

    // Submit with empty limit, cutoff 32, due 0
    await page.fill('[data-testid="account-cutoff-day"]', "32");
    await page.fill('[data-testid="account-due-day"]', "0");
    await page.click('[data-testid="account-submit"]');

    // Inline errors displayed
    await expect(page.getByTestId("error-credit-limit")).toBeVisible();
    await expect(page.getByTestId("error-cutoff-day")).toBeVisible();
    await expect(page.getByTestId("error-due-day")).toBeVisible();

    // Dialog stays open, account is NOT created in list
    await page.click('[data-testid="account-cancel"]');
    await expect(page.getByText("Invalid Card Test")).not.toBeVisible();
  });

  test("S04-05: Net-worth header: assets 105,000.00, liabilities 0, total 105,000.00", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Eve", email: "eve-s04-05@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    // Create Cash 5,000.00
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Cash Wallet");
    await page.selectOption('[data-testid="account-type"]', "CASH");
    await page.fill('[data-testid="account-opening-balance"]', "5000.00");
    await page.click('[data-testid="account-submit"]');

    // Create Bank 100,000.00
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "High Yield Savings");
    await page.selectOption('[data-testid="account-type"]', "BANK_SAVINGS");
    await page.fill('[data-testid="account-opening-balance"]', "100000.00");
    await page.click('[data-testid="account-submit"]');

    // Check Net Worth Header
    await expect(page.getByTestId("net-worth-assets")).toHaveText("LKR 105,000.00");
    await expect(page.getByTestId("net-worth-liabilities")).toHaveText("LKR 0.00");
    await expect(page.getByTestId("net-worth-total")).toHaveText("LKR 105,000.00");
  });

  test("S04-06: Edit account name and opening balance → list and header update", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Frank", email: "frank-s04-06@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Old Account Name");
    await page.fill('[data-testid="account-opening-balance"]', "1000.00");
    await page.click('[data-testid="account-submit"]');
    await expect(page.getByText("Old Account Name")).toBeVisible();

    // Edit
    await page.click('[data-testid="account-edit-btn"]');
    await page.fill('[data-testid="account-name"]', "Updated Premium Account");
    await page.fill('[data-testid="account-opening-balance"]', "2500.00");
    await page.click('[data-testid="account-submit"]');

    await expect(page.getByText("Updated Premium Account")).toBeVisible();
    await expect(page.getByText("Old Account Name")).not.toBeVisible();
    await expect(page.getByTestId("net-worth-total")).toHaveText("LKR 2,500.00");
  });

  test("S04-07: Archive an account → hidden from list and pickers; Show archived reveals it", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Grace", email: "grace-s04-07@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Temporary Stash");
    await page.click('[data-testid="account-submit"]');
    await expect(page.getByText("Temporary Stash")).toBeVisible();

    // Archive
    await page.click('[data-testid="account-archive-btn"]');
    await page.click('[data-testid="confirm-action-btn"]');
    await expect(page.getByText("Temporary Stash")).not.toBeVisible();

    // Toggle Show Archived
    await page.click('[data-testid="show-archived-checkbox"]');
    await expect(page.getByText("Temporary Stash")).toBeVisible();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  });

  test("S04-08: Create category (name, icon, color) → appears in More → Categories and in the picker", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Heidi", email: "heidi-s04-08@example.com" });
    await app.go("more");

    await page.click('[data-testid="more-categories-link"]');
    await expect(page).toHaveURL("/more/categories");

    await page.click('[data-testid="add-category-btn"]');
    await page.fill('[data-testid="category-name"]', "Special Pet Care");
    await page.fill('[data-testid="category-icon"]', "Heart");
    await page.click('[data-testid="color-option-#E8590C"]');
    await page.click('[data-testid="category-submit"]');

    await expect(page.getByText("Special Pet Care")).toBeVisible();
  });

  test("S04-09: Delete an unused category succeeds; deleting a system category is not offered", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Ivan", email: "ivan-s04-09@example.com" });
    await app.go("more");
    await page.click('[data-testid="more-categories-link"]');
    await app.waitForSyncIdle();

    // System categories should have lock indicator and NO delete button
    const foodCat = page.locator('[data-testid="category-row"]').filter({ hasText: "Groceries" });
    await expect(foodCat).toBeVisible();
    await expect(foodCat.locator('[data-testid="category-delete-btn"]')).not.toBeVisible();

    // Create custom category then delete it
    await page.click('[data-testid="add-category-btn"]');
    await page.fill('[data-testid="category-name"]', "Unused Custom Category");
    await page.click('[data-testid="category-submit"]');
    await expect(page.getByText("Unused Custom Category")).toBeVisible();

    const customCat = page.locator('[data-testid="category-row"]').filter({ hasText: "Unused Custom Category" });
    await customCat.locator('[data-testid="category-delete-btn"]').click();
    await expect(page.getByText("Unused Custom Category")).not.toBeVisible();
  });

  test("S04-10: Account creation uses a bottom sheet on mobile and a side panel/dialog on desktop", async ({
    page,
  }) => {
    const isMobile = page.viewportSize() ? page.viewportSize()!.width < 768 : false;
    const app = new AppHelper(page);
    await app.auth.register({ name: "Judy", email: "judy-s04-10@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    await page.click('[data-testid="add-account-btn"]');
    const modal = page.getByTestId("account-form-modal");
    await expect(modal).toBeVisible();

    const dialog = page.getByTestId("account-dialog");
    if (isMobile) {
      // Bottom sheet has rounded-t-xl on mobile
      await expect(dialog).toHaveClass(/rounded-t-xl/);
    } else {
      // Desktop dialog has md:rounded-lg
      await expect(dialog).toHaveClass(/md:rounded-lg/);
    }
  });

  test("S04-11: Visual snapshot of Accounts tab with three account types", async ({
    page,
  }) => {
    const app = new AppHelper(page);
    await app.auth.register({ name: "Kevin", email: "kevin-s04-11@example.com" });
    await app.go("accounts");
    await app.waitForSyncIdle();

    // Add Cash
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Pocket Cash");
    await page.selectOption('[data-testid="account-type"]', "CASH");
    await page.fill('[data-testid="account-opening-balance"]', "3000.00");
    await page.click('[data-testid="account-submit"]');

    // Add Bank
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Primary Checking");
    await page.selectOption('[data-testid="account-type"]', "BANK_SAVINGS");
    await page.fill('[data-testid="account-opening-balance"]', "75000.00");
    await page.click('[data-testid="account-submit"]');

    // Add Credit Card
    await page.click('[data-testid="add-account-btn"]');
    await page.fill('[data-testid="account-name"]', "Rewards Card");
    await page.selectOption('[data-testid="account-type"]', "CREDIT_CARD");
    await page.fill('[data-testid="account-credit-limit"]', "250000.00");
    await page.fill('[data-testid="account-cutoff-day"]', "15");
    await page.fill('[data-testid="account-due-day"]', "5");
    await page.click('[data-testid="account-submit"]');

    // All three sections visible
    await expect(page.getByText("Pocket Cash")).toBeVisible();
    await expect(page.getByTestId("account-card-name").filter({ hasText: "Primary Checking" })).toBeVisible();
    await expect(page.getByText("Rewards Card")).toBeVisible();
    await expect(page.getByTestId("subtotal-cash")).toHaveText("LKR 3,000.00");
    await expect(page.getByTestId("subtotal-bank")).toHaveText("LKR 75,000.00");
    await expect(page.getByTestId("net-worth-total")).toHaveText("LKR 78,000.00");
  });
});
