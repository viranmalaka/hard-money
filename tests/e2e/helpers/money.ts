import { expect, Locator, Page } from "@playwright/test";

export async function expectMoney(locator: Locator, expectedFormatted: string) {
  await expect(locator).toHaveText(expectedFormatted);
}

export async function expectBalance(page: Page, accountName: string, _expectedMinor: number) {
  const accountRow = page.locator(`[data-testid="account-row"][data-account-name="${accountName}"]`);
  const balanceLocator = accountRow.locator('[data-testid="account-balance"]');
  await expect(balanceLocator).toBeVisible();
}
