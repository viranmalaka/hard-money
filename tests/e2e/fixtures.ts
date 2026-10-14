import { test as base, expect } from "@playwright/test";
import { AppHelper } from "./helpers/app-helper";
import { TestApiClient } from "./helpers/test-api";

type HardMoneyFixtures = {
  app: AppHelper;
  testApi: TestApiClient;
};

export const test = base.extend<HardMoneyFixtures>({
  app: async ({ page, context }, provide) => {
    const app = new AppHelper(page, context);
    await provide(app);
  },
  testApi: async ({ request }, provide) => {
    const testApi = new TestApiClient(request);
    await provide(testApi);
  },
});

export { expect };
