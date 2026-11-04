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

export const BudgetCard = memo(function BudgetCard({
  item,
  onEdit,
  children,
}: BudgetCardProps) {
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
        className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 space-y-3.5 cursor-pointer hover:border-[var(--text-muted)]/60 transition-all select-none"
      >
        {children}
      </div>
    );
  }

  const isAsciiWord = /^[A-Za-z0-9_-]+$/.test((item.categoryIcon || "").trim());

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
      className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-5 space-y-4 cursor-pointer hover:border-[var(--text-muted)]/60 transition-all select-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="flex items-center justify-center w-11 h-11 rounded-2xl shrink-0"
            style={{
              backgroundColor: `${item.categoryColor}20`,
              color: item.categoryColor,
            }}
          >
            {item.categoryIcon && !isAsciiWord ? (
              <span className="text-lg leading-none">{item.categoryIcon}</span>
            ) : (
              <CategoryIcon name={item.categoryIcon || "Tag"} size={20} />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid="budget-category-name"
                className="text-base font-bold text-[var(--text)] truncate"
              >
                {item.categoryName}
              </span>
              {item.budget.enableRollover && item.carriedInMinor !== 0 && (
                <span
                  data-testid="budget-carried-chip"
                  className={`inline-flex items-center gap-1 text-2xs font-bold px-2 py-0.5 rounded-full ${
                    item.carriedInMinor > 0
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {item.carriedInMinor > 0 ? (
                    <ArrowUpRight size={11} />
                  ) : (
                    <ArrowDownRight size={11} />
                  )}
                  <span>
                    Carried: {item.carriedInMinor > 0 ? "+" : ""}
                    {formatMoney(item.carriedInMinor)}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        <span
          data-testid="budget-daily-safe-to-spend"
          className="text-xs font-mono font-semibold px-3 py-1 rounded-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] tabular-nums shrink-0"
        >
          {item.isOverBudget
            ? `${formatMoney(0)} / day`
            : `${formatMoney(item.dailySafeToSpendMinor)} / day`}
        </span>
      </div>

      <div
        data-testid="budget-progress-bar"
        data-status={item.status}
        className="w-full h-2.5 rounded-full bg-[var(--bg)] border border-[var(--border)] overflow-hidden"
      >
        <div
          data-testid="budget-progress-fill"
          data-percentage={item.percent}
          style={{ width: `${item.barPercent}%` }}
          className={`h-full transition-all duration-300 rounded-full ${
            item.status === "over"
              ? "bg-[var(--expense)]"
              : item.status === "warning"
                ? "bg-[var(--warning)]"
                : "bg-[var(--accent)]"
          }`}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums pt-0.5">
        <div className="text-[var(--text-muted)]">
          <span className="font-sans">Spent </span>
          <span
            data-testid="budget-spent-amount"
            className="font-bold text-[var(--text)]"
          >
            {formatMoney(item.spentMinor)}
          </span>
          <span className="font-sans"> of </span>
          <span
            data-testid="budget-limit-amount"
            className="font-bold text-[var(--text)]"
          >
            {formatMoney(item.monthlyLimitMinor)}
          </span>
          {item.carriedInMinor !== 0 && (
            <span
              data-testid="budget-available-amount"
              className="text-[var(--text-muted)] ml-1"
            >
              (Avail: {formatMoney(item.availableMinor)})
            </span>
          )}
        </div>

        <div className="text-right">
          {item.isOverBudget ? (
            <span
              data-testid="budget-remaining-amount"
              className="font-bold text-[var(--expense)] inline-flex items-center gap-1"
            >
              <AlertTriangle size={13} />
              Over by {formatMoney(Math.abs(item.remainingMinor))}
            </span>
          ) : (
            <span
              data-testid="budget-remaining-amount"
              className={`font-semibold ${
                item.status === "warning"
                  ? "text-[var(--warning)]"
                  : "text-[var(--text-muted)]"
              }`}
            >
              Left: {formatMoney(item.remainingMinor)} ({100 - item.percent}%)
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
