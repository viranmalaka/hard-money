/**
 * Ledger Semantics & Balance Calculation
 * Follows PRD Section 2.3 & 2.4
 */

export type TransactionType = "EXPENSE" | "INCOME" | "TRANSFER" | "REFUND" | "ADJUSTMENT";
export type TransactionDirection = "IN" | "OUT";

export interface LedgerTransaction {
  id: string;
  accountId: string;
  toAccountId?: string | null;
  amountMinor: number;
  type: TransactionType;
  direction?: TransactionDirection | null;
  transactionDate: Date | string;
  excludeFromBalance?: boolean;
  excludeFromStats?: boolean;
  excludeFromBudget?: boolean;
  deletedAt?: Date | string | null;
}

export interface LedgerAccount {
  id: string;
  type: "CASH" | "BANK_SAVINGS" | "CREDIT_CARD";
  openingBalanceMinor: number;
}

/**
 * Calculates the net ledger effect of a transaction for a given account.
 * Returns 0 if the transaction is deleted, excluded from balance, or not involving this account.
 */
export function calculateLedgerEffect(
  tx: LedgerTransaction,
  targetAccountId: string
): number {
  if (tx.deletedAt || tx.excludeFromBalance) {
    return 0;
  }

  const isPrimary = tx.accountId === targetAccountId;
  const isDestination = tx.toAccountId === targetAccountId;

  if (!isPrimary && !isDestination) {
    return 0;
  }

  switch (tx.type) {
    case "EXPENSE":
      return isPrimary ? -tx.amountMinor : 0;

    case "INCOME":
    case "REFUND":
      return isPrimary ? tx.amountMinor : 0;

    case "TRANSFER":
      if (isPrimary) return -tx.amountMinor;
      if (isDestination) return tx.amountMinor;
      return 0;

    case "ADJUSTMENT":
      if (!isPrimary) return 0;
      return tx.direction === "IN" ? tx.amountMinor : -tx.amountMinor;

    default:
      return 0;
  }
}

/**
 * Derives the account balance from opening balance and all transactions up to time `t`.
 */
export function calculateAccountBalance(
  account: LedgerAccount,
  transactions: LedgerTransaction[],
  asOfDate?: Date | string
): number {
  const asOfTime = asOfDate ? new Date(asOfDate).getTime() : Infinity;

  let balance = account.openingBalanceMinor;

  for (const tx of transactions) {
    const txTime = new Date(tx.transactionDate).getTime();
    if (txTime <= asOfTime) {
      balance += calculateLedgerEffect(tx, account.id);
    }
  }

  return balance;
}

export const calculateLedgerBalance = calculateAccountBalance;

export function deriveAccountBalance(
  openingBalanceMinor: number,
  transactions: LedgerTransaction[],
  accountId: string,
  asOfDate?: Date | string
): number {
  return calculateAccountBalance(
    { id: accountId, type: "BANK_SAVINGS", openingBalanceMinor },
    transactions,
    asOfDate
  );
}

/**
 * For credit cards:
 * Balance is <= 0 while money is owed.
 * Outstanding debt = max(0, -balance).
 */
export function calculateOutstandingDebt(creditCardBalanceMinor: number): number {
  return Math.max(0, -creditCardBalanceMinor);
}

/**
 * For credit cards:
 * Available Credit = creditLimitMinor - Outstanding Debt - Blocked Principal
 */
export function calculateAvailableCredit(
  creditLimitMinor: number,
  outstandingDebtMinor: number,
  blockedPrincipalMinor: number
): number {
  return Math.max(0, creditLimitMinor - outstandingDebtMinor - blockedPrincipalMinor);
}
