/**
 * Credit Card Statement Cycles & 0% Installment Plans
 * Follows PRD Section 4 Subsystem 2 & Section 2.2
 */

import { LedgerAccount, LedgerTransaction, calculateAccountBalance, calculateOutstandingDebt } from "./ledger";

export interface CreditCardStatementParams {
  account: LedgerAccount;
  transactions: LedgerTransaction[];
  creditLimitMinor: number;
  statementCutoffDay: number;
  paymentDueDay: number;
  now?: Date;
}

export interface InstallmentPlanParams {
  id: string;
  totalAmountMinor: number;
  tenureMonths: number;
  initialPaidInstallments?: number;
  customFinalAmountMinor?: number;
}

/**
 * Returns the effective day of the month clamped to the month's total days.
 * e.g. Feb 31 -> Feb 28 (or 29 in leap year).
 */
export function getEffectiveDayOfMonth(year: number, monthIndex: number, day: number): number {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(day, lastDay);
}

/**
 * Calculates installment plan monthly amount and final installment amount.
 * Absorbs rounding remainders in the final installment.
 */
export function calculateInstallmentSplit(totalAmountMinor: number, tenureMonths: number): {
  monthlyAmountMinor: number;
  finalInstallmentAmountMinor: number;
} {
  if (tenureMonths <= 1) {
    return {
      monthlyAmountMinor: totalAmountMinor,
      finalInstallmentAmountMinor: totalAmountMinor,
    };
  }
  const monthly = Math.floor(totalAmountMinor / tenureMonths);
  const remainder = totalAmountMinor - monthly * (tenureMonths - 1);
  return {
    monthlyAmountMinor: monthly,
    finalInstallmentAmountMinor: remainder,
  };
}

/**
 * Calculates remaining installments and remaining principal for an installment plan.
 */
export function calculateInstallmentProgress(
  totalAmountMinor: number,
  tenureMonths: number,
  initialPaidInstallments = 0,
  billedInstallmentsAmounts: number[] = []
): {
  paidInstallments: number;
  remainingInstallments: number;
  remainingPrincipalMinor: number;
} {
  const { monthlyAmountMinor } = calculateInstallmentSplit(totalAmountMinor, tenureMonths);
  const billedCount = billedInstallmentsAmounts.length;
  const paidInstallments = initialPaidInstallments + billedCount;
  const remainingInstallments = Math.max(0, tenureMonths - paidInstallments);

  const initialPaidPrincipal = initialPaidInstallments * monthlyAmountMinor;
  const billedPrincipal = billedInstallmentsAmounts.reduce((sum, amt) => sum + amt, 0);
  const remainingPrincipalMinor = Math.max(0, totalAmountMinor - initialPaidPrincipal - billedPrincipal);

  return {
    paidInstallments,
    remainingInstallments,
    remainingPrincipalMinor,
  };
}

/**
 * Derives the last cutoff date, current cycle debt, and billed vs unbilled split.
 */
export function calculateStatementCycle(params: CreditCardStatementParams): {
  outstandingDebtMinor: number;
  billedBalanceMinor: number;
  unbilledBalanceMinor: number;
  lastCutoffDate: Date;
  nextCutoffDate: Date;
  dueDate: Date;
} {
  const now = params.now || new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Determine last cutoff
  const effectiveCutoffThisMonth = getEffectiveDayOfMonth(currentYear, currentMonth, params.statementCutoffDay);
  const cutoffThisMonth = new Date(currentYear, currentMonth, effectiveCutoffThisMonth, 23, 59, 59, 999);

  let lastCutoffDate: Date;
  let nextCutoffDate: Date;

  if (now.getTime() > cutoffThisMonth.getTime()) {
    lastCutoffDate = cutoffThisMonth;
    const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const nextMonthIndex = (currentMonth + 1) % 12;
    const effectiveCutoffNextMonth = getEffectiveDayOfMonth(nextMonthYear, nextMonthIndex, params.statementCutoffDay);
    nextCutoffDate = new Date(nextMonthYear, nextMonthIndex, effectiveCutoffNextMonth, 23, 59, 59, 999);
  } else {
    const prevMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const prevMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;
    const effectiveCutoffPrevMonth = getEffectiveDayOfMonth(prevMonthYear, prevMonthIndex, params.statementCutoffDay);
    lastCutoffDate = new Date(prevMonthYear, prevMonthIndex, effectiveCutoffPrevMonth, 23, 59, 59, 999);
    nextCutoffDate = cutoffThisMonth;
  }

  // Calculate Due Date based on lastCutoffDate
  const dueMonthYear = lastCutoffDate.getMonth() === 11 ? lastCutoffDate.getFullYear() + 1 : lastCutoffDate.getFullYear();
  const dueMonthIndex = (lastCutoffDate.getMonth() + 1) % 12;
  const effectiveDueDay = getEffectiveDayOfMonth(dueMonthYear, dueMonthIndex, params.paymentDueDay);
  const dueDate = new Date(dueMonthYear, dueMonthIndex, effectiveDueDay, 23, 59, 59, 999);

  // Balances
  const balanceNow = calculateAccountBalance(params.account, params.transactions, now);
  const outstandingDebtMinor = calculateOutstandingDebt(balanceNow);

  const balanceAtCutoff = calculateAccountBalance(params.account, params.transactions, lastCutoffDate);
  const debtAtCutoff = calculateOutstandingDebt(balanceAtCutoff);

  // Payments since cutoff (CC_SETTLEMENT or transfers to card)
  const paymentsSinceCutoff = params.transactions
    .filter(
      (tx) =>
        !tx.deletedAt &&
        tx.toAccountId === params.account.id &&
        tx.type === "TRANSFER" &&
        new Date(tx.transactionDate).getTime() > lastCutoffDate.getTime() &&
        new Date(tx.transactionDate).getTime() <= now.getTime()
    )
    .reduce((sum, tx) => sum + tx.amountMinor, 0);

  const billedBalanceMinor = Math.max(0, debtAtCutoff - paymentsSinceCutoff);
  const unbilledBalanceMinor = Math.max(0, outstandingDebtMinor - billedBalanceMinor);

  return {
    outstandingDebtMinor,
    billedBalanceMinor,
    unbilledBalanceMinor,
    lastCutoffDate,
    nextCutoffDate,
    dueDate,
  };
}
