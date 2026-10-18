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
  blockedPrincipalMinor?: number;
  now?: Date;
  timezone?: string;
}

export interface StatementCycleResult {
  balanceMinor: number;
  outstandingDebtMinor: number;
  billedBalanceMinor: number;
  unbilledBalanceMinor: number;
  availableCreditMinor: number;
  cardCreditMinor: number;
  lastCutoffDate: Date;
  nextCutoffDate: Date;
  dueDate: Date;
  dueDaysLeft: number;
  dueCountdownText: string;
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
 * e.g. Feb 31 -> Feb 28 (or 29 in leap year). Month is 1-12.
 */
export function getEffectiveDayOfMonth(year: number, month: number, day: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(day, lastDay);
}

/**
 * Creates a Date representing the end of a given calendar day (23:59:59.999)
 * in Asia/Colombo (+05:30) timezone.
 */
export function getColomboEndOfDay(year: number, month: number, day: number): Date {
  const clampedDay = getEffectiveDayOfMonth(year, month, day);
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${year}-${pad(month)}-${pad(clampedDay)}T23:59:59.999+05:30`);
}

/**
 * Extracts { year, month, day } in Asia/Colombo timezone from a Date.
 */
export function getColomboDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);

  let year = 2026;
  let month = 1;
  let day = 1;

  for (const part of parts) {
    if (part.type === "year") year = Number(part.value);
    if (part.type === "month") month = Number(part.value);
    if (part.type === "day") day = Number(part.value);
  }

  return { year, month, day };
}

/**
 * Calculates due date countdown text and days left.
 */
export function calculateDueDateCountdown(
  dueDate: Date,
  now = new Date()
): { daysLeft: number; text: string; isOverdue: boolean } {
  const nowParts = getColomboDateParts(now);
  const dueParts = getColomboDateParts(dueDate);

  const nowMidnight = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day);
  const dueMidnight = Date.UTC(dueParts.year, dueParts.month - 1, dueParts.day);

  const diffDays = Math.round((dueMidnight - nowMidnight) / (1000 * 60 * 60 * 24));

  if (diffDays > 1) {
    return { daysLeft: diffDays, text: `${diffDays} days left`, isOverdue: false };
  } else if (diffDays === 1) {
    return { daysLeft: 1, text: "1 day left", isOverdue: false };
  } else if (diffDays === 0) {
    return { daysLeft: 0, text: "Due today", isOverdue: false };
  } else {
    return { daysLeft: diffDays, text: `Overdue by ${Math.abs(diffDays)} days`, isOverdue: true };
  }
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
export function calculateStatementCycle(params: CreditCardStatementParams): StatementCycleResult {
  const now = params.now || new Date();
  const { year: currentYear, month: currentMonth } = getColomboDateParts(now);

  // Cutoff in the current calendar month
  const cutoffThisMonth = getColomboEndOfDay(currentYear, currentMonth, params.statementCutoffDay);

  let lastCutoffDate: Date;
  let nextCutoffDate: Date;
  let cutoffMonth = currentMonth;
  let cutoffYear = currentYear;

  if (now.getTime() > cutoffThisMonth.getTime()) {
    // Current date is after this month's cutoff, so this month's cutoff has already closed
    lastCutoffDate = cutoffThisMonth;
    cutoffMonth = currentMonth;
    cutoffYear = currentYear;

    const nextM = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextY = currentMonth === 12 ? currentYear + 1 : currentYear;
    nextCutoffDate = getColomboEndOfDay(nextY, nextM, params.statementCutoffDay);
  } else {
    // Before or at this month's cutoff: last closed cutoff was the previous month
    const prevM = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevY = currentMonth === 1 ? currentYear - 1 : currentYear;
    lastCutoffDate = getColomboEndOfDay(prevY, prevM, params.statementCutoffDay);
    nextCutoffDate = cutoffThisMonth;
    cutoffMonth = prevM;
    cutoffYear = prevY;
  }

  // Determine Payment Due Date for the last closed statement
  // If paymentDueDay <= statementCutoffDay, due date is in the month following the cutoff
  // Otherwise, due date is in the same month as cutoff
  let dueYear = cutoffYear;
  let dueMonth = cutoffMonth;
  if (params.paymentDueDay <= params.statementCutoffDay) {
    if (cutoffMonth === 12) {
      dueYear = cutoffYear + 1;
      dueMonth = 1;
    } else {
      dueMonth = cutoffMonth + 1;
    }
  }
  const dueDate = getColomboEndOfDay(dueYear, dueMonth, params.paymentDueDay);

  // Ledger Balances
  const balanceNow = calculateAccountBalance(params.account, params.transactions, now);
  const outstandingDebtMinor = calculateOutstandingDebt(balanceNow);

  // Debt at Cutoff (end of cutoff day)
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

  // FIFO settlement: payments first pay off billed balance from the cutoff statement
  const billedBalanceMinor = Math.max(0, debtAtCutoff - paymentsSinceCutoff);
  const unbilledBalanceMinor = Math.max(0, outstandingDebtMinor - billedBalanceMinor);

  // Card credit (if overpaid, balanceNow > 0)
  const cardCreditMinor = Math.max(0, balanceNow);

  // Available Credit: creditLimit + balanceNow - blockedPrincipal
  // If card is overpaid, available credit exceeds limit without being clamped
  const blocked = params.blockedPrincipalMinor || 0;
  let availableCreditMinor = 0;
  if (params.creditLimitMinor) {
    availableCreditMinor = Math.max(0, params.creditLimitMinor + balanceNow - blocked);
  }

  const { daysLeft: dueDaysLeft, text: dueCountdownText } = calculateDueDateCountdown(dueDate, now);

  return {
    balanceMinor: balanceNow,
    outstandingDebtMinor,
    billedBalanceMinor,
    unbilledBalanceMinor,
    availableCreditMinor,
    cardCreditMinor,
    lastCutoffDate,
    nextCutoffDate,
    dueDate,
    dueDaysLeft,
    dueCountdownText,
  };
}
