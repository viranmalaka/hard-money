import React from "react";

interface SummaryBarProps {
  incomeMinor?: number;
  expenseMinor?: number;
  totalMinor?: number;
  adjustmentsMinor?: number;
  currency?: string;
}

export function SummaryBar({
  incomeMinor = 0,
  expenseMinor = 0,
  totalMinor = 0,
  adjustmentsMinor = 0,
  currency = "LKR",
}: SummaryBarProps) {
  const formatAmount = (minor: number) => {
    const major = (minor / 100).toLocaleString("en-LK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${currency} ${major}`;
  };

  return (
    <div className="space-y-1">
      <div
        data-testid="summary-bar"
        className="grid grid-cols-3 divide-x divide-hairline border-y border-hairline bg-surface py-2 text-center text-xs select-none"
      >
        <div className="flex flex-col items-center justify-center px-2">
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Income</span>
          <span
            data-testid="income-amount"
            className="text-[var(--income)] font-semibold tabular-nums text-xs mt-0.5"
          >
            <span data-testid="stats-total-income">{formatAmount(incomeMinor)}</span>
          </span>
        </div>

        <div className="flex flex-col items-center justify-center px-2">
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Expense</span>
          <span
            data-testid="expense-amount"
            className="text-[var(--expense)] font-semibold tabular-nums text-xs mt-0.5"
          >
            <span data-testid="stats-total-expense">{formatAmount(expenseMinor)}</span>
          </span>
        </div>

        <div className="flex flex-col items-center justify-center px-2">
          <span className="text-[11px] text-[var(--text-muted)] font-medium">Total</span>
          <span
            data-testid="total-amount"
            className="text-[var(--text)] font-semibold tabular-nums text-xs mt-0.5"
          >
            {formatAmount(totalMinor)}
          </span>
        </div>
      </div>

      {adjustmentsMinor !== 0 && (
        <div
          data-testid="summary-adjustments"
          className="flex items-center justify-between px-3 py-1 bg-[var(--surface)] border-b border-hairline text-[11px] text-[var(--text-muted)] tabular-nums"
        >
          <span>Adjustments</span>
          <span className={adjustmentsMinor >= 0 ? "text-income font-medium" : "text-expense font-medium"}>
            {adjustmentsMinor > 0 ? `+ ${formatAmount(adjustmentsMinor)}` : `- ${formatAmount(Math.abs(adjustmentsMinor))}`}
          </span>
        </div>
      )}
    </div>
  );
}
