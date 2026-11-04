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
    <div className="space-y-2.5">
      <div
        data-testid="summary-bar"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 select-none"
      >
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 flex sm:flex-col items-center sm:items-start justify-between gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Income
          </span>
          <span
            data-testid="income-amount"
            className="text-[var(--income)] font-extrabold font-mono tabular-nums text-sm sm:text-base truncate"
          >
            <span data-testid="stats-total-income">{formatAmount(incomeMinor)}</span>
          </span>
        </div>

        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 flex sm:flex-col items-center sm:items-start justify-between gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Expense
          </span>
          <span
            data-testid="expense-amount"
            className="text-[var(--expense)] font-extrabold font-mono tabular-nums text-sm sm:text-base truncate"
          >
            <span data-testid="stats-total-expense">{formatAmount(expenseMinor)}</span>
          </span>
        </div>

        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 flex sm:flex-col items-center sm:items-start justify-between gap-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Net Saved
          </span>
          <span
            data-testid="total-amount"
            className="text-[var(--text)] font-extrabold font-mono tabular-nums text-sm sm:text-base truncate"
          >
            {formatAmount(totalMinor)}
          </span>
        </div>
      </div>

      {adjustmentsMinor !== 0 && (
        <div
          data-testid="summary-adjustments"
          className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-muted)] font-mono tabular-nums"
        >
          <span className="font-sans font-medium">Balance Adjustments</span>
          <span
            className={
              adjustmentsMinor >= 0
                ? "text-income font-bold"
                : "text-expense font-bold"
            }
          >
            {adjustmentsMinor > 0
              ? `+ ${formatAmount(adjustmentsMinor)}`
              : `- ${formatAmount(Math.abs(adjustmentsMinor))}`}
          </span>
        </div>
      )}
    </div>
  );
}
