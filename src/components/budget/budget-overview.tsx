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
    <div
      data-testid="budget-overview"
      className="rounded-3xl bg-gradient-to-br from-[#064E3B] via-[#065F46] to-[#022C22] text-white p-6 space-y-5 shadow-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/15">
        <span className="text-xs font-bold uppercase tracking-wider text-white/80">
          Monthly Budget Envelope
        </span>
        <span
          data-testid="budget-overview-safe-to-spend"
          className="text-xs font-bold font-mono tabular-nums px-3 py-1 rounded-full bg-white/15 text-white"
        >
          Safe: {formatMoney(overallDailySafe)} / day
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white/10 p-3.5 space-y-1">
          <span className="text-2xs uppercase tracking-wider font-semibold text-white/75">
            Total Limit
          </span>
          <p
            data-testid="budget-overview-total-limit"
            className="text-base sm:text-lg font-extrabold font-mono tabular-nums truncate"
          >
            {formatMoney(totalAvailable)}
          </p>
        </div>

        <div className="rounded-2xl bg-white/10 p-3.5 space-y-1">
          <span className="text-2xs uppercase tracking-wider font-semibold text-white/75">
            Total Spent
          </span>
          <p
            data-testid="budget-overview-total-spent"
            className="text-base sm:text-lg font-extrabold font-mono tabular-nums text-rose-200 truncate"
          >
            {formatMoney(totalSpent)}
          </p>
        </div>

        <div className="rounded-2xl bg-white/10 p-3.5 space-y-1">
          <span className="text-2xs uppercase tracking-wider font-semibold text-white/75">
            {isOverallOver ? "Over Budget" : "Remaining"}
          </span>
          <p
            data-testid="budget-overview-remaining"
            className={`text-base sm:text-lg font-extrabold font-mono tabular-nums truncate ${
              isOverallOver ? "text-rose-200" : "text-emerald-200"
            }`}
          >
            {isOverallOver
              ? `Over by ${formatMoney(Math.abs(totalRemaining))}`
              : formatMoney(totalRemaining)}
          </p>
        </div>
      </div>
    </div>
  );
});
