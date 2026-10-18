import { describe, it, expect } from "vitest";
import {
  getEffectiveDayOfMonth,
  calculateDueDateCountdown,
  calculateInstallmentSplit,
  calculateStatementCycle,
} from "../../src/lib/finance-core/credit-card";
import { LedgerAccount, LedgerTransaction } from "../../src/lib/finance-core/ledger";

describe("Credit Card Cycle & Clamping Logic", () => {
  it("clamps short months correctly (day 31 in Feb -> 28/29)", () => {
    // Feb 2027 (non-leap): 28 days
    expect(getEffectiveDayOfMonth(2027, 2, 31)).toBe(28);
    expect(getEffectiveDayOfMonth(2027, 2, 28)).toBe(28);

    // Feb 2028 (leap year): 29 days
    expect(getEffectiveDayOfMonth(2028, 2, 31)).toBe(29);
    expect(getEffectiveDayOfMonth(2028, 2, 29)).toBe(29);

    // April (30 days): day 31 -> 30
    expect(getEffectiveDayOfMonth(2026, 4, 31)).toBe(30);

    // October (31 days): day 31 -> 31
    expect(getEffectiveDayOfMonth(2026, 10, 31)).toBe(31);
  });

  it("calculates due date countdown accurately in Asia/Colombo", () => {
    // 1 Nov 2026 to 10 Nov 2026 -> 9 days left
    const now = new Date("2026-11-01T10:00:00.000Z");
    const due = new Date("2026-11-10T18:29:59.999Z"); // end of 10 Nov Colombo

    const countdown = calculateDueDateCountdown(due, now);
    expect(countdown.daysLeft).toBe(9);
    expect(countdown.text).toContain("9 days");
  });

  it("handles statement cutoff scenario: spends before cutoff vs unbilled spend", () => {
    const cardAccount: LedgerAccount = {
      id: "card-1",
      type: "CREDIT_CARD",
      openingBalanceMinor: 0,
    };

    // Cutoff: 20th, Due: 10th, Limit: 500,000.00 (50,000,000 minor)
    const transactions: LedgerTransaction[] = [
      // 30,000 spend on 15 Oct (before cutoff 20 Oct)
      {
        id: "tx-1",
        accountId: "card-1",
        type: "EXPENSE",
        amountMinor: 3000000,
        transactionDate: "2026-10-15T10:00:00.000Z",
      },
      // 5,000 spend on 21 Oct (after cutoff 20 Oct)
      {
        id: "tx-2",
        accountId: "card-1",
        type: "EXPENSE",
        amountMinor: 500000,
        transactionDate: "2026-10-21T02:00:00.000Z",
      },
    ];

    // Clock set to 21 Oct 2026
    const res = calculateStatementCycle({
      account: cardAccount,
      transactions,
      creditLimitMinor: 50000000, // 500k
      statementCutoffDay: 20,
      paymentDueDay: 10,
      now: new Date("2026-10-21T10:00:00.000Z"),
    });

    expect(res.billedBalanceMinor).toBe(3000000); // 30,000
    expect(res.unbilledBalanceMinor).toBe(500000); // 5,000
    expect(res.outstandingDebtMinor).toBe(3500000); // 35,000
    expect(res.availableCreditMinor).toBe(46500000); // 465,000
  });

  it("handles FIFO partial settlement and overpayment", () => {
    const cardAccount: LedgerAccount = {
      id: "card-1",
      type: "CREDIT_CARD",
      openingBalanceMinor: 0,
    };

    // Billed: 30,000, Unbilled: 5,000
    const baseTxs: LedgerTransaction[] = [
      { id: "tx-1", accountId: "card-1", type: "EXPENSE", amountMinor: 3000000, transactionDate: "2026-10-15" },
      { id: "tx-2", accountId: "card-1", type: "EXPENSE", amountMinor: 500000, transactionDate: "2026-10-21" },
    ];

    // Case 1: Partial settlement of 10,000 (FIFO pays billed first)
    const partialTxs = [
      ...baseTxs,
      {
        id: "tx-settle-1",
        accountId: "bank-1",
        toAccountId: "card-1",
        type: "TRANSFER",
        amountMinor: 1000000,
        transactionDate: "2026-10-22",
      } as LedgerTransaction,
    ];

    const partialRes = calculateStatementCycle({
      account: cardAccount,
      transactions: partialTxs,
      creditLimitMinor: 50000000,
      statementCutoffDay: 20,
      paymentDueDay: 10,
      now: new Date("2026-10-22T10:00:00.000Z"),
    });

    // Billed was 30k - 10k paid = 20k remaining
    expect(partialRes.billedBalanceMinor).toBe(2000000);
    expect(partialRes.unbilledBalanceMinor).toBe(500000);
    expect(partialRes.outstandingDebtMinor).toBe(2500000);

    // Case 2: Full billed settlement of 30,000
    const fullBilledTxs = [
      ...baseTxs,
      {
        id: "tx-settle-2",
        accountId: "bank-1",
        toAccountId: "card-1",
        type: "TRANSFER",
        amountMinor: 3000000,
        transactionDate: "2026-10-22",
      } as LedgerTransaction,
    ];

    const fullBilledRes = calculateStatementCycle({
      account: cardAccount,
      transactions: fullBilledTxs,
      creditLimitMinor: 50000000,
      statementCutoffDay: 20,
      paymentDueDay: 10,
      now: new Date("2026-10-22T10:00:00.000Z"),
    });

    expect(fullBilledRes.billedBalanceMinor).toBe(0);
    expect(fullBilledRes.unbilledBalanceMinor).toBe(500000);
    expect(fullBilledRes.outstandingDebtMinor).toBe(500000);

    // Case 3: Overpayment 40,000 on total 35,000 debt -> card credit +5,000, no negative unbilled, available credit above limit
    const overpayTxs = [
      ...baseTxs,
      {
        id: "tx-settle-3",
        accountId: "bank-1",
        toAccountId: "card-1",
        type: "TRANSFER",
        amountMinor: 4000000,
        transactionDate: "2026-10-22",
      } as LedgerTransaction,
    ];

    const overpayRes = calculateStatementCycle({
      account: cardAccount,
      transactions: overpayTxs,
      creditLimitMinor: 50000000, // 500,000
      statementCutoffDay: 20,
      paymentDueDay: 10,
      now: new Date("2026-10-22T10:00:00.000Z"),
    });

    expect(overpayRes.billedBalanceMinor).toBe(0);
    expect(overpayRes.unbilledBalanceMinor).toBe(0);
    expect(overpayRes.outstandingDebtMinor).toBe(0);
    expect(overpayRes.cardCreditMinor).toBe(500000); // +5,000
    // Available Credit = 500,000 + 5,000 = 505,000 (not clamped to 500,000)
    expect(overpayRes.availableCreditMinor).toBe(50500000);
  });

  it("handles cutoff day end boundary at 23:59:59 Colombo", () => {
    const cardAccount: LedgerAccount = {
      id: "card-1",
      type: "CREDIT_CARD",
      openingBalanceMinor: 0,
    };

    // 20 Oct 23:59:00 Colombo is 20 Oct 18:29:00 UTC
    const inCycleDate = "2026-10-20T18:29:00.000Z";
    // 21 Oct 00:01:00 Colombo is 20 Oct 18:31:00 UTC
    const nextCycleDate = "2026-10-20T18:31:00.000Z";

    const txs: LedgerTransaction[] = [
      { id: "tx-in", accountId: "card-1", type: "EXPENSE", amountMinor: 1000000, transactionDate: inCycleDate },
      { id: "tx-next", accountId: "card-1", type: "EXPENSE", amountMinor: 2000000, transactionDate: nextCycleDate },
    ];

    const res = calculateStatementCycle({
      account: cardAccount,
      transactions: txs,
      creditLimitMinor: 50000000,
      statementCutoffDay: 20,
      paymentDueDay: 10,
      now: new Date("2026-10-22T10:00:00.000Z"),
    });

    // tx-in (10,000) was at 23:59 on cutoff day -> belongs to closed statement
    expect(res.billedBalanceMinor).toBe(1000000);
    // tx-next (20,000) was at 00:01 next day -> belongs to unbilled
    expect(res.unbilledBalanceMinor).toBe(2000000);
  });

  it("absorbs installment remainder in the final month", () => {
    // 100,000 / 3 -> 33,333 / 33,333 / 33,334
    const split = calculateInstallmentSplit(100000, 3);
    expect(split.monthlyAmountMinor).toBe(33333);
    expect(split.finalInstallmentAmountMinor).toBe(33334);
    expect(split.monthlyAmountMinor * 2 + split.finalInstallmentAmountMinor).toBe(100000);
  });
});
