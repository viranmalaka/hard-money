import { test as base, expect } from "@playwright/test";
import { SignJWT } from "jose";
import { AppHelper } from "./helpers/app-helper";
import { TestApiClient } from "./helpers/test-api";

const AUTH_SECRET = process.env.AUTH_SECRET || "insecure-dev-auth-secret-minimum-32-characters-long";
const SECRET_KEY = new TextEncoder().encode(AUTH_SECRET.padEnd(32, "0"));

type HardMoneyFixtures = {
  autoAuth: void;
  app: AppHelper;
  testApi: TestApiClient;
};

export const test = base.extend<HardMoneyFixtures>({
  autoAuth: [
    async ({ context }, provide) => {
      // Automatically inject valid test session cookie into all tests
      const token = await new SignJWT({
        userId: "test-user-id",
        email: "test@example.com",
        name: "Test User",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("30d")
        .sign(SECRET_KEY);

      await context.addCookies([
        {
          name: "hardmoney_session",
          value: token,
          url: "http://localhost:3000",
        },
      ]);

      await provide();
    },
    { auto: true },
  ],
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
