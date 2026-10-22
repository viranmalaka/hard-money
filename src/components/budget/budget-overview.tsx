"use client";

import { memo } from "react";
import { formatMoney } from "@/lib/finance-core/money";

interface BudgetOverviewProps {
  totalAvailable: number;
  totalSpent: number;
  totalRemaining: number;
  overallDailySafe: number;
  isOverallOver: boolean;
}

export const BudgetOverview = memo(function BudgetOverview({
  totalAvailable,
  totalSpent,
  totalRemaining,
  overallDailySafe,
  isOverallOver,
}: BudgetOverviewProps) {
  return (
    <div data-testid="budget-overview" className="flat-panel p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-hairline pb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Month Overview</span>
        <span data-testid="budget-overview-safe-to-spend" className="text-xs font-semibold px-2 py-0.5 rounded bg-surface text-[var(--text)]">
          Safe-to-Spend: {formatMoney(overallDailySafe)} / day
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center sm:text-left">
        <div><span className="text-[11px] text-[var(--text-muted)]">Total Limit</span><p data-testid="budget-overview-total-limit" className="text-sm sm:text-base font-semibold text-[var(--text)] tabular-nums">{formatMoney(totalAvailable)}</p></div>
        <div><span className="text-[11px] text-[var(--text-muted)]">Total Spent</span><p data-testid="budget-overview-total-spent" className="text-sm sm:text-base font-semibold text-[var(--expense)] tabular-nums">{formatMoney(totalSpent)}</p></div>
        <div>
          <span className="text-[11px] text-[var(--text-muted)]">{isOverallOver ? "Over Budget" : "Remaining"}</span>
          <p data-testid="budget-overview-remaining" className={`text-sm sm:text-base font-semibold tabular-nums ${isOverallOver ? "text-[var(--expense)]" : "text-[var(--income)]"}`}>
            {isOverallOver ? `Over by ${formatMoney(Math.abs(totalRemaining))}` : formatMoney(totalRemaining)}
          </p>
        </div>
      </div>
    </div>
  );
});
