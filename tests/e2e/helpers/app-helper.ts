import { Page, BrowserContext } from "@playwright/test";
import { TestApiClient } from "./test-api";

export type NavDestination = "trans" | "stats" | "budget" | "accounts" | "more" | "dashboard";

export class AppHelper {
  public testApi: TestApiClient;

  constructor(public page: Page, public context?: BrowserContext) {
    this.testApi = new TestApiClient(page.request);
  }

  /**
   * Nav helper: resolves to bottom nav on mobile, sidebar on desktop
   */
  async go(destination: NavDestination) {
    const isMobile = this.page.viewportSize() ? this.page.viewportSize()!.width < 768 : false;

    if (isMobile) {
      const bottomTab = this.page.locator(`[data-testid="bottom-nav-${destination}"]`);
      await bottomTab.click();
    } else {
      const sidebarItem = this.page.locator(`[data-testid="sidebar-nav-${destination}"]`);
      await sidebarItem.click();
    }
  }

  /**
   * Sets client and server clock together
   */
  async setNow(isoDateStr: string) {
    await this.testApi.setClock(isoDateStr);
    try {
      await this.page.clock.setFixedTime(new Date(isoDateStr));
    } catch {
      // If page.clock is not installed, install or ignore
    }
  }

  /**
   * Waits for sync engine to report idle state
   */
  async waitForSyncIdle() {
    await this.page.locator('[data-sync-state="idle"]').waitFor({ state: "attached", timeout: 5000 });
  }

  /**
   * Quick-Add stub helper for later steps
   */
  async quickAdd(_data: {
    type?: "EXPENSE" | "INCOME" | "TRANSFER";
    amount?: number | string;
    category?: string;
    account?: string;
  }) {
    const isMobile = this.page.viewportSize() ? this.page.viewportSize()!.width < 768 : false;
    if (isMobile) {
      await this.page.locator('[data-testid="quick-add-fab"]').click();
    } else {
      await this.page.locator('[data-testid="quick-add-btn"]').click();
    }
  }
}
