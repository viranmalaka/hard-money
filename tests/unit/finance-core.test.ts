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
  calculatePercentagesLargestRemainder,
  addMonthsClamped,
  generateAmortizationSchedule,
  reamortizeRemainingSchedule,
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
    expect(parseMoneyToMinor("1e5")).toBe(0);
    expect(parseMoneyToMinor("12-3")).toBe(0);
    expect(parseMoneyToMinor("1.005")).toBe(0);
  });

  describe("finance-core calendar and loan invariants", () => {
    it("clamps month-end dates instead of overflowing into the next month", () => {
      const january31 = new Date("2026-01-31T00:00:00.000Z");
      expect(addMonthsClamped(january31, 1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
      expect(addMonthsClamped(january31, 2).toISOString()).toBe("2026-03-31T00:00:00.000Z");
    });

    it("does not generate an unpayable zero-amount final installment", () => {
      const schedule = generateAmortizationSchedule(10, 0, 6, "REDUCING_BALANCE");
      expect(schedule.map((row) => row.emiAmountMinor)).toEqual([1, 1, 1, 1, 1, 5]);
      expect(schedule.every((row) => row.emiAmountMinor > 0)).toBe(true);
    });

    it("uses flat-rate math when shortening a flat-rate schedule", () => {
      const rows = reamortizeRemainingSchedule(900, 3, 4, 1200, "FLAT_RATE", 0, "SHORTER_TENURE", 250);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.at(-1)?.closingBalanceMinor).toBe(0);
      expect(rows.reduce((sum, row) => sum + row.principalComponentMinor, 0)).toBe(900);
    });
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

  it("calculates largest remainder percentages summing to exactly 100", () => {
    // e.g. 3 equal items: 33.333% -> floors 33, 33, 33 sum to 99. Largest remainder distributes 1 extra to first.
    const res = calculatePercentagesLargestRemainder([10, 10, 10]);
    expect(res).toEqual([34, 33, 33]);
    expect(res.reduce((a: number, b: number) => a + b, 0)).toBe(100);

    // 4 items: 10, 20, 30, 40 -> 10%, 20%, 30%, 40%
    const res2 = calculatePercentagesLargestRemainder([10, 20, 30, 40]);
    expect(res2).toEqual([10, 20, 30, 40]);
    expect(res2.reduce((a: number, b: number) => a + b, 0)).toBe(100);
  });
});

describe("finance-core fixed deposit calculations (golden vectors)", () => {
  it("calculates monthly payout with withholding tax (1,000,000 at 12%, WHT 5%)", () => {
    // 1,000,000 LKR = 100,000,000 minor
    // Or in minor: principal 100,000,000, 1200 bps, 500 bps WHT
    // (1,000,000 * 0.12) / 12 = 10,000 gross
    // 10,000 * 0.05 = 500 tax
    // net = 9,500
    const res = import("../../src/lib/finance-core/investments").then(({ calculateMonthlyPayout }) => {
      const payout = calculateMonthlyPayout(100000000, 1200, 500);
      expect(payout.grossInterestMinor).toBe(1000000); // 10,000.00
      expect(payout.taxWithheldMinor).toBe(50000); // 500.00
      expect(payout.netInterestMinor).toBe(950000); // 9,500.00
    });
    return res;
  });

  it("calculates compound monthly for 12 months (1,000,000 at 12%)", async () => {
    const { calculateCompoundMaturity } = await import("../../src/lib/finance-core/investments");
    // Principal: 100,000,000 minor (1,000,000.00)
    // 1,000,000 * (1 + 0.12/12)^12 = 1,126,825.03
    // gross interest = 126,825.03 (12,682,503 minor)
    // WHT 5% on 126,825.03 = 6,341.25 (634,125 minor)
    // net interest = 120,483.78 (12,048,378 minor)
    const res = calculateCompoundMaturity(100000000, 1200, 12, "MONTHLY", 500);
    expect(res.maturityGrossAmountMinor).toBe(112682503);
    expect(res.grossInterestMinor).toBe(12682503);
    expect(res.taxWithheldMinor).toBe(634125);
    expect(res.netInterestMinor).toBe(12048378);
    expect(res.maturityNetAmountMinor).toBe(112048378);
  });

  it("handles 0% withholding tax override", async () => {
    const { calculateMonthlyPayout, calculateCompoundMaturity } = await import("../../src/lib/finance-core/investments");
    const payout = calculateMonthlyPayout(100000000, 1200, 0);
    expect(payout.grossInterestMinor).toBe(1000000);
    expect(payout.taxWithheldMinor).toBe(0);
    expect(payout.netInterestMinor).toBe(1000000);

    const compound = calculateCompoundMaturity(100000000, 1200, 12, "MONTHLY", 0);
    expect(compound.taxWithheldMinor).toBe(0);
    expect(compound.netInterestMinor).toBe(12682503);
  });

  it("calculates accrued FD net worth value correctly", async () => {
    const { calculateAccruedFdValue } = await import("../../src/lib/finance-core/investments");
    const start = new Date("2026-01-01T00:00:00Z");
    const maturity = new Date("2027-01-01T00:00:00Z");

    const fd = {
      principalAmountMinor: 100000000,
      annualInterestRateBps: 1200,
      tenureMonths: 12,
      compoundingFrequency: "MONTHLY" as const,
      payoutMode: "REINVEST_COMPOUND" as const,
      withholdingTaxRateBps: 500,
      startDate: start,
      maturityDate: maturity,
      status: "ACTIVE",
    };

    // At start: value equals principal
    expect(calculateAccruedFdValue(fd, start)).toBe(100000000);

    // At maturity: value equals principal + net compound interest
    expect(calculateAccruedFdValue(fd, maturity)).toBe(112048378);

    // Closed FD: 0
    expect(calculateAccruedFdValue({ ...fd, status: "CLOSED" }, maturity)).toBe(0);

    // Monthly payout FD: remains principal
    expect(calculateAccruedFdValue({ ...fd, payoutMode: "MONTHLY_PAYOUT_TO_ACCOUNT" }, maturity)).toBe(100000000);
  });
});

describe("finance-core loans and leases calculations (golden vectors)", () => {
  it("calculates reducing balance loan (1,200,000 at 12%, 12 months -> EMI 106,618.55, first interest 12,000, final balance 0)", async () => {
    const { calculateReducingBalanceEmi, generateAmortizationSchedule } = await import(
      "../../src/lib/finance-core/loans"
    );
    // 1,200,000.00 = 120,000,000 minor
    const emi = calculateReducingBalanceEmi(120000000, 1200, 12);
    expect(emi).toBe(10661855); // 106,618.55

    const schedule = generateAmortizationSchedule(120000000, 1200, 12, "REDUCING_BALANCE");
    expect(schedule.length).toBe(12);
    // First installment
    expect(schedule[0].interestComponentMinor).toBe(1200000); // 12,000.00
    expect(schedule[0].principalComponentMinor).toBe(10661855 - 1200000); // 94,618.55
    expect(schedule[0].openingBalanceMinor).toBe(120000000);

    // Final installment clears to exactly 0
    expect(schedule[11].closingBalanceMinor).toBe(0);

    // Total principal amortized equals exactly 120,000,000
    const totalPrincipal = schedule.reduce((sum, row) => sum + row.principalComponentMinor, 0);
    expect(totalPrincipal).toBe(120000000);
  });

  it("calculates flat rate loan (1,200,000 at 12% flat, 12 months -> total interest 144,000, EMI 112,000)", async () => {
    const { calculateFlatRateEmi, generateAmortizationSchedule } = await import(
      "../../src/lib/finance-core/loans"
    );
    const { monthlyEmiMinor, totalInterestMinor } = calculateFlatRateEmi(120000000, 1200, 12);
    expect(totalInterestMinor).toBe(14400000); // 144,000.00
    expect(monthlyEmiMinor).toBe(11200000); // 112,000.00

    const schedule = generateAmortizationSchedule(120000000, 1200, 12, "FLAT_RATE");
    expect(schedule.length).toBe(12);
    expect(schedule[11].closingBalanceMinor).toBe(0);

    const totalPrincipal = schedule.reduce((sum, row) => sum + row.principalComponentMinor, 0);
    expect(totalPrincipal).toBe(120000000);

    const totalInterest = schedule.reduce((sum, row) => sum + row.interestComponentMinor, 0);
    expect(totalInterest).toBe(14400000);
  });

  it("calculates lease with residual (1,200,000, 12%, 12 months, residual 200,000 -> final balance 200,000)", async () => {
    const { generateAmortizationSchedule } = await import("../../src/lib/finance-core/loans");
    // 1,200,000 = 120,000,000 minor, residual 200,000 = 20,000,000 minor
    const schedule = generateAmortizationSchedule(
      120000000,
      1200,
      12,
      "REDUCING_BALANCE",
      20000000
    );

    expect(schedule.length).toBe(12);
    expect(schedule[11].closingBalanceMinor).toBe(20000000); // Final balance is exactly residual

    const totalPrincipalAmortized = schedule.reduce((sum, row) => sum + row.principalComponentMinor, 0);
    expect(totalPrincipalAmortized).toBe(100000000); // 120M - 20M = 100M
  });

  it("reamortizes remaining schedule when extra principal is paid (shorter tenure vs lower EMI)", async () => {
    const { reamortizeRemainingSchedule } = await import("../../src/lib/finance-core/loans");
    // Suppose remaining principal after extra payment is 900,000 (90,000,000 minor)
    // 9 remaining months at 12%
    // 1. Lower EMI
    const lowerEmiRows = reamortizeRemainingSchedule(
      90000000,
      4,
      9,
      1200,
      "REDUCING_BALANCE",
      0,
      "LOWER_EMI"
    );
    expect(lowerEmiRows.length).toBe(9);
    expect(lowerEmiRows[8].closingBalanceMinor).toBe(0);

    // 2. Shorter tenure with target EMI 106,618.55 (10,661,855 minor) and extra principal (balance 70,000,000)
    const shorterTenureRows = reamortizeRemainingSchedule(
      70000000,
      4,
      9,
      1200,
      "REDUCING_BALANCE",
      0,
      "SHORTER_TENURE",
      10661855
    );
    expect(shorterTenureRows.length).toBeLessThan(9);
    expect(shorterTenureRows[shorterTenureRows.length - 1].closingBalanceMinor).toBe(0);
  });
});

