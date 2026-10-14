/**
 * Budget Calculation with Symmetric Rollover & Safe-to-Spend
 * Follows PRD Section 4 Subsystem 4
 */

export interface BudgetSplitItem {
  id: string;
  categoryId: string;
  amountMinor: number;
}

export interface BudgetTransaction {
  id: string;
  categoryId?: string | null;
  amountMinor: number;
  type: "EXPENSE" | "INCOME" | "TRANSFER" | "REFUND" | "ADJUSTMENT";
  transactionDate: Date | string;
  excludeFromBudget?: boolean;
  deletedAt?: Date | string | null;
  isSplit?: boolean;
  splits?: BudgetSplitItem[];
}

export interface BudgetConfig {
  id: string;
  categoryId: string;
  monthlyLimitMinor: number;
  enableRollover: boolean;
  rolloverStartMonth?: string; // YYYY-MM
}

export interface MonthRange {
  year: number;
  month: number; // 0-indexed (0 = Jan, 11 = Dec)
}

/**
 * Calculates total spent in a category for a given month range.
 * Expensed amounts add to spent, Refunds reduce spent.
 */
export function calculateCategorySpent(
  categoryId: string,
  transactions: BudgetTransaction[],
  range: MonthRange
): number {
  const start = new Date(range.year, range.month, 1).getTime();
  const end = new Date(range.year, range.month + 1, 0, 23, 59, 59, 999).getTime();

  let spent = 0;

  for (const tx of transactions) {
    if (tx.deletedAt || tx.excludeFromBudget) continue;
    const txTime = new Date(tx.transactionDate).getTime();
    if (txTime < start || txTime > end) continue;

    if (tx.isSplit && tx.splits && tx.splits.length > 0) {
      for (const item of tx.splits) {
        if (item.categoryId === categoryId) {
          if (tx.type === "EXPENSE") spent += item.amountMinor;
          if (tx.type === "REFUND") spent -= item.amountMinor;
        }
      }
    } else if (tx.categoryId === categoryId) {
      if (tx.type === "EXPENSE") spent += tx.amountMinor;
      if (tx.type === "REFUND") spent -= tx.amountMinor;
    }
  }

  return spent;
}

/**
 * Calculates remaining days in the month including today.
 */
export function getRemainingDaysInMonth(now = new Date()): number {
  const currentDay = now.getDate();
  const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(1, totalDays - currentDay + 1);
}

/**
 * Calculates Safe-to-Spend Daily Burn Rate.
 */
export function calculateSafeToSpendDaily(
  availableBudgetMinor: number,
  spentMinor: number,
  remainingDays: number
): {
  dailyBurnRateMinor: number;
  isOverBudget: boolean;
  remainingBudgetMinor: number;
} {
  const remainingBudgetMinor = availableBudgetMinor - spentMinor;
  if (remainingBudgetMinor <= 0) {
    return {
      dailyBurnRateMinor: 0,
      isOverBudget: true,
      remainingBudgetMinor,
    };
  }

  const dailyBurnRateMinor = Math.floor(remainingBudgetMinor / remainingDays);
  return {
    dailyBurnRateMinor,
    isOverBudget: false,
    remainingBudgetMinor,
  };
}

/**
 * Symmetric rollover calculation between months.
 * carriedIn(M) = limit(M-1) + carriedIn(M-1) - spent(M-1)
 */
export function calculateRolloverCarriedIn(
  prevLimitMinor: number,
  prevCarriedInMinor: number,
  prevSpentMinor: number
): number {
  return prevLimitMinor + prevCarriedInMinor - prevSpentMinor;
}
