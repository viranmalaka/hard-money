import { Page, BrowserContext, expect } from "@playwright/test";
import { TestApiClient } from "./test-api";

export type NavDestination = "trans" | "transactions" | "stats" | "budget" | "accounts" | "more" | "dashboard";

export class AuthHelper {
  constructor(public page: Page) {}

  async register(data: { name: string; email: string; password?: string }) {
    await this.page.context().clearCookies();
    await this.page.context().setExtraHTTPHeaders({
      "x-forwarded-for": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      "x-e2e-secret": process.env.E2E_SECRET || "e2e-test-secret",
    });
    await this.page.goto("/register");
    const nameInput = this.page.locator('[data-testid="register-name"]').first();
    await nameInput.waitFor({ state: "visible" });
    await nameInput.click();
    await nameInput.fill(data.name);
    await this.page.locator('[data-testid="register-email"]').first().fill(data.email);
    await this.page.locator('[data-testid="register-password"]').first().fill(
      data.password || "password123"
    );
    await this.page.locator('[data-testid="register-submit"]').first().click();
    await expect(this.page).toHaveURL("/");
    const sessionRes = await this.page.request.get("http://localhost:3000/api/auth/session");
    const sessionData = await sessionRes.json().catch(() => ({}));
    return sessionData.user || { id: "current-user", email: data.email, name: data.name };
  }

  async login(credentials: { email: string; password?: string }) {
    await this.page.context().clearCookies();
    await this.page.goto("/login");
    await this.page.locator('[data-testid="login-email"]').first().fill(credentials.email);
    await this.page.locator('[data-testid="login-password"]').first().fill(
      credentials.password || "password123"
    );
    await this.page.locator('[data-testid="login-submit"]').first().click();
    await expect(this.page).toHaveURL("/");
  }

  async logout() {
    await this.page.click('[data-testid="logout-button"]');
    await expect(this.page).toHaveURL(/\/login/);
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
    const navKey = destination === "transactions" ? "trans" : destination;

    const path = navKey === "trans" ? "/" : `/${navKey}`;
    if (isMobile) {
      const bottomTab = this.page.locator(`[data-testid="bottom-nav-${navKey}"]`);
      await bottomTab.click();
    } else {
      const sidebarItem = this.page.locator(`[data-testid="sidebar-nav-${navKey}"]`);
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
    await this.page.locator('[data-sync-state="idle"]').first().waitFor({ state: "attached", timeout: 10000 });
  }

  /**
   * Dispatches online event to trigger sync and waits for idle
   */
  async triggerSync() {
    await this.page.evaluate(async () => {
      const syncFn = (window as unknown as { __hardMoneyTriggerSync?: () => Promise<void> }).__hardMoneyTriggerSync;
      if (syncFn) {
        await syncFn();
      } else {
        window.dispatchEvent(new Event("online"));
      }
    });
    await this.waitForSyncIdle();
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
