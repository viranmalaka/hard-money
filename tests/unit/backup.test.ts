import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  household: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  householdMember: {
    upsert: vi.fn(),
  },
  shoppingListItem: {
    upsert: vi.fn(),
  },
  category: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  account: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  transactionTemplate: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  budget: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  budgetMonthSnapshot: {
    upsert: vi.fn(),
  },
  creditCardStatement: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  creditCardInstallmentPlan: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  fixedDeposit: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  fixedDepositPayout: {
    upsert: vi.fn(),
  },
  loan: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  loanScheduleEntry: {
    upsert: vi.fn(),
  },
  loanPayment: {
    upsert: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  transactionSplitItem: {
    upsert: vi.fn(),
  },
  bankSms: {
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/server-seq", () => ({
  getNextServerSeq: vi.fn().mockResolvedValue(BigInt(42)),
}));

import { exportUserData } from "@/lib/backup/export";
import { importUserData } from "@/lib/backup/import";
import {
  extractBackupCounts,
  HardMoneyBackupPayload,
  BackupAccount,
  BackupTransaction,
  BackupCategory,
  BackupBudget,
  BackupHousehold,
} from "@/lib/backup/types";

describe("HardMoney Backup & Restore", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("extractBackupCounts", () => {
    it("should accurately count entities and nested shopping list items", () => {
      const counts = extractBackupCounts({
        accounts: [{ id: "acc-1" }] as unknown as BackupAccount[],
        transactions: [{ id: "tx-1" }, { id: "tx-2" }] as unknown as BackupTransaction[],
        categories: [{ id: "cat-1" }] as unknown as BackupCategory[],
        budgets: [{ id: "b-1" }] as unknown as BackupBudget[],
        households: [
          {
            id: "hh-1",
            shoppingListItems: [{ id: "item-1" }, { id: "item-2" }],
          },
        ] as unknown as BackupHousehold[],
      });

      expect(counts.accounts).toBe(1);
      expect(counts.transactions).toBe(2);
      expect(counts.categories).toBe(1);
      expect(counts.budgets).toBe(1);
      expect(counts.households).toBe(1);
      expect(counts.shoppingListItems).toBe(2);
      expect(counts.loans).toBe(0);
    });
  });

  describe("exportUserData", () => {
    it("should export full user treasury data, serialize dates, and omit password", async () => {
      const mockUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        defaultCurrency: "LKR",
        timezone: "Asia/Colombo",
        countryCode: "LK",
        defaultWithholdingTaxRateBps: 1000,
        geminiApiKeyEncrypted: "enc-key",
        geminiModel: "gemini-2.5-flash",
        smsAutoPostMode: "AUTO_VALIDATED",
        apiKeyHash: "hash123",
        apiKeyPrefix: "pfx",
        pushRemindersEnabled: true,
        dailyReminderTime: "20:00",
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.household.findMany.mockResolvedValue([
        {
          id: "hh-1",
          name: "Home",
          ownerId: "user-123",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          members: [
            {
              id: "mem-1",
              householdId: "hh-1",
              userId: "user-123",
              role: "OWNER",
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
            },
          ],
          shoppingListItems: [
            {
              id: "shop-1",
              householdId: "hh-1",
              name: "Milk",
              quantity: "2L",
              isCompleted: false,
              position: 0,
              completedAt: null,
              createdAt: new Date("2026-01-02T00:00:00.000Z"),
              updatedAt: new Date("2026-01-02T00:00:00.000Z"),
              deletedAt: null,
            },
          ],
        },
      ]);
      mockPrisma.category.findMany.mockResolvedValue([
        {
          id: "cat-1",
          householdId: null,
          name: "Groceries",
          icon: "ShoppingBag",
          color: "#10B981",
          type: "EXPENSE",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          deletedAt: null,
        },
      ]);
      mockPrisma.account.findMany.mockResolvedValue([
        {
          id: "acc-1",
          householdId: null,
          name: "Main Savings",
          type: "BANK_SAVINGS",
          openingBalanceMinor: 1000000,
          balanceCacheMinor: 1000000,
          currency: "LKR",
          accountNumberLast4: "1234",
          bankSenderIds: ["BANK"],
          accessScope: "PRIVATE",
          feeRules: null,
          ownAtmFeeMinor: 0,
          otherAtmFeeMinor: 0,
          balanceMismatchHint: null,
          creditLimitMinor: null,
          statementCutoffDay: null,
          paymentDueDay: null,
          linkedSettlementAccountId: null,
          isArchived: false,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          deletedAt: null,
        },
      ]);
      mockPrisma.transactionTemplate.findMany.mockResolvedValue([]);
      mockPrisma.budget.findMany.mockResolvedValue([
        {
          id: "b-1",
          categoryId: "cat-1",
          monthlyLimitMinor: 5000000,
          enableRollover: true,
          rolloverStartMonth: "2026-01",
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          deletedAt: null,
          snapshots: [],
        },
      ]);
      mockPrisma.creditCardStatement.findMany.mockResolvedValue([]);
      mockPrisma.creditCardInstallmentPlan.findMany.mockResolvedValue([]);
      mockPrisma.fixedDeposit.findMany.mockResolvedValue([]);
      mockPrisma.loan.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: "tx-1",
          householdId: null,
          accountId: "acc-1",
          toAccountId: null,
          categoryId: "cat-1",
          amountMinor: 250000,
          destinationAmountMinor: null,
          exchangeRateMicros: null,
          direction: "OUT",
          type: "EXPENSE",
          subType: null,
          source: "MANUAL",
          createdByUserId: "user-123",
          updatedByUserId: "user-123",
          transactionDate: new Date("2026-01-02T10:00:00.000Z"),
          note: "Supermarket",
          isSplit: false,
          excludeFromBudget: false,
          excludeFromStats: false,
          excludeFromBalance: false,
          reversalOfTransactionId: null,
          installmentPlanId: null,
          feeTransactionId: null,
          possibleDuplicateOfTransactionId: null,
          createdAt: new Date("2026-01-02T10:00:00.000Z"),
          updatedAt: new Date("2026-01-02T10:00:00.000Z"),
          deletedAt: null,
          splitItems: [],
        },
      ]);
      mockPrisma.bankSms.findMany.mockResolvedValue([]);

      const result = await exportUserData("user-123");

      expect(result.version).toBe(1);
      expect(result.source).toBe("hard-money");
      expect(result.user.name).toBe("Test User");
      expect(result.user.email).toBe("test@example.com");
      expect(result.user.defaultCurrency).toBe("LKR");
      expect("passwordHash" in result.user).toBe(false);
      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].id).toBe("acc-1");
      expect(result.categories).toHaveLength(1);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].id).toBe("tx-1");
      expect(result.transactions[0].transactionDate).toBe("2026-01-02T10:00:00.000Z");
      expect(result.households).toHaveLength(1);
      expect(result.households[0].shoppingListItems).toHaveLength(1);
    });

    it("should throw error if user does not exist", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(exportUserData("non-existent")).rejects.toThrow("User not found");
    });
  });

  describe("importUserData", () => {
    it("should reject payload with invalid version", async () => {
      await expect(
        importUserData("user-target", { version: 2 } as unknown as HardMoneyBackupPayload)
      ).rejects.toThrow("Invalid backup format");
    });

    it("should execute transactional upserts remapping to current user and preserving IDs", async () => {
      const mockPayload: HardMoneyBackupPayload = {
        version: 1,
        exportedAt: "2026-01-05T00:00:00.000Z",
        source: "hard-money",
        user: {
          name: "Restored User",
          email: "restored@example.com",
          defaultCurrency: "USD",
          timezone: "UTC",
          countryCode: "US",
          defaultWithholdingTaxRateBps: 0,
          geminiApiKeyEncrypted: null,
          geminiModel: "gemini-2.5-flash",
          smsAutoPostMode: "AUTO_VALIDATED",
          apiKeyHash: null,
          apiKeyPrefix: null,
          pushRemindersEnabled: false,
          dailyReminderTime: "21:00",
        },
        households: [
          {
            id: "hh-restored",
            name: "Family Home",
            createdAt: "2026-01-01T00:00:00.000Z",
            members: [],
            shoppingListItems: [
              {
                id: "shop-1",
                householdId: "hh-restored",
                name: "Bread",
                quantity: "1 loaf",
                isCompleted: true,
                position: 0,
                completedAt: "2026-01-02T00:00:00.000Z",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-02T00:00:00.000Z",
                deletedAt: null,
              },
            ],
          },
        ],
        categories: [
          {
            id: "cat-restored",
            householdId: null,
            name: "Dining",
            icon: "Utensils",
            color: "#EF4444",
            type: "EXPENSE",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            deletedAt: null,
          },
        ],
        accounts: [
          {
            id: "acc-restored",
            householdId: null,
            name: "Cash Wallet",
            type: "CASH",
            openingBalanceMinor: 50000,
            balanceCacheMinor: 50000,
            currency: "USD",
            accountNumberLast4: null,
            bankSenderIds: [],
            accessScope: "PRIVATE",
            feeRules: null,
            ownAtmFeeMinor: 0,
            otherAtmFeeMinor: 0,
            balanceMismatchHint: null,
            creditLimitMinor: null,
            statementCutoffDay: null,
            paymentDueDay: null,
            linkedSettlementAccountId: null,
            isArchived: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            deletedAt: null,
          },
        ],
        templates: [],
        budgets: [
          {
            id: "b-restored",
            categoryId: "cat-restored",
            monthlyLimitMinor: 20000,
            enableRollover: false,
            rolloverStartMonth: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            deletedAt: null,
            snapshots: [],
          },
        ],
        creditCardStatements: [],
        creditCardInstallmentPlans: [],
        fixedDeposits: [],
        loans: [],
        transactions: [
          {
            id: "tx-restored",
            householdId: null,
            accountId: "acc-restored",
            toAccountId: null,
            categoryId: "cat-restored",
            amountMinor: 1500,
            destinationAmountMinor: null,
            exchangeRateMicros: null,
            direction: "OUT",
            type: "EXPENSE",
            subType: null,
            source: "MANUAL",
            transactionDate: "2026-01-02T12:00:00.000Z",
            note: "Lunch",
            isSplit: false,
            excludeFromBudget: false,
            excludeFromStats: false,
            excludeFromBalance: false,
            reversalOfTransactionId: null,
            installmentPlanId: null,
            feeTransactionId: null,
            possibleDuplicateOfTransactionId: null,
            createdAt: "2026-01-02T12:00:00.000Z",
            updatedAt: "2026-01-02T12:00:00.000Z",
            deletedAt: null,
            splitItems: [],
          },
        ],
        bankSmsList: [],
      };

      // Mock $transaction to execute callback immediately
      mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
        return callback(mockPrisma);
      });

      const result = await importUserData("target-user-id", mockPayload);

      expect(result.success).toBe(true);
      expect(result.importedCounts.accounts).toBe(1);
      expect(result.importedCounts.transactions).toBe(1);
      expect(result.importedCounts.categories).toBe(1);
      expect(result.importedCounts.budgets).toBe(1);
      expect(result.importedCounts.shoppingListItems).toBe(1);

      // Verify user update was called with new user defaults
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "target-user-id" },
          data: expect.objectContaining({
            name: "Restored User",
            defaultCurrency: "USD",
          }),
        })
      );

      // Verify household upsert
      expect(mockPrisma.household.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "hh-restored" },
          create: expect.objectContaining({
            id: "hh-restored",
            ownerId: "target-user-id",
          }),
        })
      );

      // Verify category upsert with target userId
      expect(mockPrisma.category.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "cat-restored" },
          create: expect.objectContaining({
            id: "cat-restored",
            userId: "target-user-id",
            name: "Dining",
          }),
        })
      );

      // Verify account upsert with target userId
      expect(mockPrisma.account.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "acc-restored" },
          create: expect.objectContaining({
            id: "acc-restored",
            userId: "target-user-id",
            name: "Cash Wallet",
          }),
        })
      );

      // Verify transaction upsert with target userId
      expect(mockPrisma.transaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "tx-restored" },
          create: expect.objectContaining({
            id: "tx-restored",
            userId: "target-user-id",
            amountMinor: 1500,
          }),
        })
      );
    });
  });
});
