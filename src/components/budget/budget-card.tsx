"use client";

import { memo, type ReactNode } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatMoney } from "@/lib/finance-core/money";
import type { LocalBudget } from "@/lib/db";
import { CategoryIcon } from "@/components/ui/category-icon";

export interface BudgetViewModel {
  budget: LocalBudget;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  monthlyLimitMinor: number;
  carriedInMinor: number;
  availableMinor: number;
  spentMinor: number;
  remainingMinor: number;
  isOverBudget: boolean;
  percent: number;
  barPercent: number;
  status: "ok" | "warning" | "over";
  dailySafeToSpendMinor: number;
}

interface BudgetCardProps {
  item: BudgetViewModel;
  onEdit: (budget: LocalBudget) => void;
  children?: ReactNode;
}

export const BudgetCard = memo(function BudgetCard({ item, onEdit, children }: BudgetCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEdit(item.budget);
    }
  };

  if (children) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Edit budget for ${item.categoryName}`}
        data-testid={`budget-row-${item.budget.id}`}
        data-budget-id={item.budget.id}
        data-budget-status={item.status}
        onClick={() => onEdit(item.budget)}
        onKeyDown={handleKeyDown}
        className="flat-panel p-3.5 space-y-2.5 cursor-pointer hover:bg-surface/50 transition-colors select-none"
      >
        {children}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Edit budget for ${item.categoryName}`}
      data-testid={`budget-row-${item.budget.id}`}
      data-budget-id={item.budget.id}
      data-budget-status={item.status}
      onClick={() => onEdit(item.budget)}
      onKeyDown={handleKeyDown}
      className="flat-panel p-3.5 space-y-2.5 cursor-pointer hover:bg-surface/50 transition-colors select-none"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--surface)] text-[var(--text)]">
            <CategoryIcon name={item.categoryIcon} size={15} />
          </span>
          <div>
            <span data-testid="budget-category-name" className="text-sm font-semibold text-[var(--text)]">
              {item.categoryName}
            </span>
            {item.budget.enableRollover && item.carriedInMinor !== 0 && (
              <span
                data-testid="budget-carried-chip"
                className={`ml-2 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                  item.carriedInMinor > 0
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-red-500/15 text-red-600 dark:text-red-400"
                }`}
              >
                {item.carriedInMinor > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                <span>Carried: {item.carriedInMinor > 0 ? "+" : ""}{formatMoney(item.carriedInMinor)}</span>
              </span>
            )}
          </div>
        </div>
        <span data-testid="budget-daily-safe-to-spend" className="text-xs font-medium text-[var(--text-muted)]">
          {item.isOverBudget ? `${formatMoney(0)} / day` : `${formatMoney(item.dailySafeToSpendMinor)} / day`}
        </span>
      </div>

      <div data-testid="budget-progress-bar" data-status={item.status} className="w-full h-2 rounded-full bg-surface overflow-hidden">
        <div
          data-testid="budget-progress-fill"
          data-percentage={item.percent}
          style={{ width: `${item.barPercent}%` }}
          className={`h-full transition-all duration-300 rounded-full ${
            item.status === "over" ? "bg-[var(--expense)]" : item.status === "warning" ? "bg-[var(--warning)]" : "bg-blue-500"
          }`}
        />
      </div>

      <div className="flex items-center justify-between text-xs tabular-nums">
        <div>
          <span className="text-[var(--text-muted)]">Spent </span>
          <span data-testid="budget-spent-amount" className="font-medium text-[var(--text)]">{formatMoney(item.spentMinor)}</span>
          <span className="text-[var(--text-muted)]"> of </span>
          <span data-testid="budget-limit-amount" className="font-medium text-[var(--text)]">{formatMoney(item.monthlyLimitMinor)}</span>
          {item.carriedInMinor !== 0 && (
            <span data-testid="budget-available-amount" className="text-[var(--text-muted)] ml-1">(Avail: {formatMoney(item.availableMinor)})</span>
          )}
        </div>
        <div className="text-right">
          {item.isOverBudget ? (
            <span data-testid="budget-remaining-amount" className="font-semibold text-[var(--expense)] inline-flex items-center gap-1">
              <AlertTriangle size={12} /> Over budget by {formatMoney(Math.abs(item.remainingMinor))}
            </span>
          ) : (
            <span data-testid="budget-remaining-amount" className={`font-medium ${item.status === "warning" ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}`}>
              Remaining: {formatMoney(item.remainingMinor)} ({100 - item.percent}%)
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
