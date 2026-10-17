import { Page, BrowserContext } from "@playwright/test";
import { TestApiClient } from "./test-api";

export type NavDestination = "trans" | "stats" | "budget" | "accounts" | "more" | "dashboard";

export class AuthHelper {
  constructor(public page: Page) {}

  async register(data: { name: string; email: string; password?: string }) {
    await this.page.goto("/register");
    await this.page.fill('[data-testid="register-name"]', data.name);
    await this.page.fill('[data-testid="register-email"]', data.email);
    await this.page.fill(
      '[data-testid="register-password"]',
      data.password || "password123"
    );
    await this.page.click('[data-testid="register-submit"]');
    await this.page.waitForURL("/");
  }

  async login(credentials: { email: string; password?: string }) {
    await this.page.goto("/login");
    await this.page.fill('[data-testid="login-email"]', credentials.email);
    await this.page.fill(
      '[data-testid="login-password"]',
      credentials.password || "password123"
    );
    await this.page.click('[data-testid="login-submit"]');
    await this.page.waitForURL("/");
  }

  async logout() {
    await this.page.click('[data-testid="logout-button"]');
  }
}

export class AppHelper {
  public testApi: TestApiClient;
  public auth: AuthHelper;

  constructor(public page: Page, public context?: BrowserContext) {
    this.testApi = new TestApiClient(page.request);
    this.auth = new AuthHelper(page);
  }

  /**
   * Nav helper: resolves to bottom nav on mobile, sidebar on desktop
   */
  async go(destination: NavDestination) {
    const isMobile = this.page.viewportSize() ? this.page.viewportSize()!.width < 768 : false;

    const path = destination === "trans" ? "/" : `/${destination}`;
    if (isMobile) {
      const bottomTab = this.page.locator(`[data-testid="bottom-nav-${destination}"]`);
      await bottomTab.click();
    } else {
      const sidebarItem = this.page.locator(`[data-testid="sidebar-nav-${destination}"]`);
      await sidebarItem.click();
    }

    await this.page.waitForURL((url) => {
      const pathname = url.pathname;
      return destination === "trans" ? pathname === "/" : pathname.startsWith(path);
    });
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
