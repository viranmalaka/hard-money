import { describe, it, expect } from "vitest";
import {
  roundHalfUp,
  formatMoney,
  parseMoneyToMinor,
  calculateLedgerEffect,
  calculateAccountBalance,
  calculateOutstandingDebt,
  calculateAvailableCredit,
  calculateCategorySpent,
  getRemainingDaysInMonth,
  calculateSafeToSpendDaily,
  calculateRolloverCarriedIn,
  type LedgerTransaction,
  type LedgerAccount,
} from "../../src/lib/finance-core";

describe("finance-core money utilities", () => {
  it("formats minor units accurately with currency and signs", () => {
    expect(formatMoney(178000, "LKR")).toBe("LKR 1,780.00");
    expect(formatMoney(0, "LKR")).toBe("LKR 0.00");
    expect(formatMoney(-50000, "LKR")).toBe("-LKR 500.00");
    expect(formatMoney(5000, "LKR", true)).toBe("+LKR 50.00");
  });

  it("parses currency strings into integer minor units", () => {
    expect(parseMoneyToMinor("1,780.00")).toBe(178000);
    expect(parseMoneyToMinor("LKR 500.50")).toBe(50050);
    expect(parseMoneyToMinor("-25.00")).toBe(-2500);
    expect(parseMoneyToMinor("")).toBe(0);
  });

  it("rounds half-up to nearest integer accurately", () => {
    expect(roundHalfUp(12.5)).toBe(13);
    expect(roundHalfUp(12.4)).toBe(12);
    expect(roundHalfUp(12.6)).toBe(13);
    expect(roundHalfUp(-12.5)).toBe(-13);
  });
});

describe("finance-core ledger calculations", () => {
  it("derives ledger balance correctly according to spec", () => {
    const acc1 = "acc-1";
    const acc2 = "acc-2";

    const account: LedgerAccount = {
      id: acc1,
      type: "BANK_SAVINGS",
      openingBalanceMinor: 10000,
    };

    const txs: LedgerTransaction[] = [
      { id: "1", type: "INCOME", amountMinor: 100000, accountId: acc1, transactionDate: "2026-10-01" },
      { id: "2", type: "EXPENSE", amountMinor: 25000, accountId: acc1, transactionDate: "2026-10-02" },
      { id: "3", type: "TRANSFER", amountMinor: 15000, accountId: acc1, toAccountId: acc2, transactionDate: "2026-10-03" },
      { id: "4", type: "ADJUSTMENT", direction: "OUT", amountMinor: 5000, accountId: acc1, transactionDate: "2026-10-04" },
      // Excluded from balance
      { id: "5", type: "EXPENSE", amountMinor: 50000, accountId: acc1, excludeFromBalance: true, transactionDate: "2026-10-05" },
      // Deleted transaction
      { id: "6", type: "EXPENSE", amountMinor: 10000, accountId: acc1, deletedAt: "2026-10-06", transactionDate: "2026-10-06" },
    ];

    expect(calculateLedgerEffect(txs[0], acc1)).toBe(100000);
    expect(calculateLedgerEffect(txs[1], acc1)).toBe(-25000);
    expect(calculateLedgerEffect(txs[4], acc1)).toBe(0); // Excluded from balance

    const balanceAcc1 = calculateAccountBalance(account, txs);
    // 10000 + 100000 - 25000 - 15000 - 5000 = 65000
    expect(balanceAcc1).toBe(65000);

    const account2: LedgerAccount = {
      id: acc2,
      type: "BANK_SAVINGS",
      openingBalanceMinor: 0,
    };
    const balanceAcc2 = calculateAccountBalance(account2, txs);
    // 0 + 15000 (from transfer) = 15000
    expect(balanceAcc2).toBe(15000);
  });

  it("handles credit card outstanding debt and available credit", () => {
    expect(calculateOutstandingDebt(-45000)).toBe(45000);
    expect(calculateOutstandingDebt(5000)).toBe(0);

    // Limit 100,000, debt 45,000, blocked 15,000 -> 40,000 available
    expect(calculateAvailableCredit(100000, 45000, 15000)).toBe(40000);
  });
});

describe("finance-core budget calculations", () => {
  it("calculates category spent including split transactions and refunds", () => {
    const categoryId = "cat-groceries";
    const range = { year: 2026, month: 9 }; // Oct 2026 (0-indexed 9)

    const txs = [
      { id: "1", type: "EXPENSE" as const, amountMinor: 12000, categoryId, transactionDate: "2026-10-05" },
      { id: "2", type: "REFUND" as const, amountMinor: 2000, categoryId, transactionDate: "2026-10-08" },
      {
        id: "3",
        type: "EXPENSE" as const,
        amountMinor: 10000,
        isSplit: true,
        splits: [
          { id: "s1", categoryId, amountMinor: 4000 },
          { id: "s2", categoryId: "other", amountMinor: 6000 },
        ],
        transactionDate: "2026-10-10",
      },
      // Excluded from budget
      { id: "4", type: "EXPENSE" as const, amountMinor: 8000, categoryId, excludeFromBudget: true, transactionDate: "2026-10-12" },
      // Other month
      { id: "5", type: "EXPENSE" as const, amountMinor: 5000, categoryId, transactionDate: "2026-11-01" },
    ];

    const spent = calculateCategorySpent(categoryId, txs, range);
    // 12000 - 2000 + 4000 = 14000
    expect(spent).toBe(14000);
  });

  it("computes safe-to-spend daily burn rate and remaining days in month", () => {
    const days = getRemainingDaysInMonth(new Date(2026, 9, 20));
    expect(days).toBe(12); // Oct has 31 days, 31 - 20 + 1 = 12

    const res = calculateSafeToSpendDaily(100000, 40000, 10);
    expect(res.isOverBudget).toBe(false);
    expect(res.remainingBudgetMinor).toBe(60000);
    expect(res.dailyBurnRateMinor).toBe(6000);

    const overRes = calculateSafeToSpendDaily(50000, 60000, 5);
    expect(overRes.isOverBudget).toBe(true);
    expect(overRes.dailyBurnRateMinor).toBe(0);
  });

  it("calculates symmetric rollover", () => {
    // carriedIn(M) = limit(M-1) + carriedIn(M-1) - spent(M-1)
    // 50,000 + 10,000 - 45,000 = 15,000
    expect(calculateRolloverCarriedIn(50000, 10000, 45000)).toBe(15000);
    // Deficit rollover: 50,000 + 0 - 55,000 = -5,000
    expect(calculateRolloverCarriedIn(50000, 0, 55000)).toBe(-5000);
  });
});
