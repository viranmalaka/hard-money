"use client";

import { memo } from "react";
import { ChevronRight, TrendingUp, X } from "lucide-react";
import { formatMoney } from "@/lib/finance-core";
import type { LocalTransaction } from "@/lib/db";

export interface TrendPoint {
  key: string;
  label: string;
  totalMinor: number;
}

export interface CategoryStat {
  id: string;
  name: string;
  color: string;
  icon: string;
  amount: number;
  percent: number;
}

export const TrendSection = memo(function TrendSection({
  months,
  maxMinor,
}: {
  months: TrendPoint[];
  maxMinor: number;
}) {
  return (
    <div data-testid="stats-trend-view" className="p-4 bg-[var(--surface)] border border-hairline rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
          <TrendingUp size={14} />
          <span>6-Month Expense Trend</span>
        </h3>
      </div>
      <div className="grid grid-cols-6 gap-2 h-44 items-end pt-4 pb-2 border-b border-hairline">
        {months.map((month) => {
          const heightPct = Math.round((month.totalMinor / maxMinor) * 100);
          return (
            <div key={month.key} data-testid={`trend-bar-${month.key}`} className="flex flex-col items-center justify-end h-full gap-1.5 group">
              <span data-testid="trend-bar-amount" className="text-[10px] font-mono text-[var(--text-muted)] group-hover:text-[var(--text)] tabular-nums truncate max-w-full text-center">
                {formatMoney(month.totalMinor).replace("LKR ", "")}
              </span>
              <div className="w-full bg-[var(--border)] rounded-t-sm h-full flex items-end">
                <div style={{ height: `${Math.max(6, heightPct)}%` }} className="w-full bg-[var(--expense)]/80 hover:bg-[var(--expense)] rounded-t-sm transition-all" />
              </div>
              <span className="text-[11px] font-medium text-[var(--text-muted)] mt-1">{month.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export const CategoryList = memo(function CategoryList({
  categories,
  selectedId,
  onSelect,
}: {
  categories: CategoryStat[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="bg-[var(--surface)] border border-hairline rounded-xl p-3 space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] px-1">
        Top Categories ({categories.length})
      </h3>
      <div className="space-y-1">
        {categories.map((category) => {
          const isSelected = selectedId === category.id;
          return (
            <button
              type="button"
              key={category.id}
              data-testid={`category-stat-row-${category.id}`}
              onClick={() => onSelect(isSelected ? "" : category.id)}
              aria-expanded={isSelected}
              aria-label={`${category.name}, ${category.percent} percent, ${formatMoney(category.amount)}`}
              className={`w-full text-left flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                isSelected ? "bg-[var(--border)] border border-hairline" : "hover:bg-[var(--bg)] border border-transparent"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: category.color }} />
                <span className="text-xs font-semibold text-[var(--text)] truncate">{category.name}</span>
                <span data-testid="category-percent-chip" className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-[var(--border)] text-[var(--text-muted)] tabular-nums">
                  {category.percent}%
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span data-testid="category-stat-amount" className="font-mono font-semibold text-xs text-[var(--text)] tabular-nums">
                  {formatMoney(category.amount)}
                </span>
                <ChevronRight size={14} className={`text-[var(--text-muted)] transition-transform ${isSelected ? "rotate-90 text-[var(--text)]" : ""}`} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
});

export const CategoryTransactions = memo(function CategoryTransactions({
  category,
  transactions,
  onClose,
}: {
  category: { name: string; color: string };
  transactions: LocalTransaction[];
  onClose: () => void;
}) {
  return (
    <section data-testid="category-transactions-list" className="p-4 bg-[var(--surface)] border border-hairline rounded-xl space-y-3">
      <div className="flex items-center justify-between border-b border-hairline pb-2">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
          <h3 className="font-semibold text-sm text-[var(--text)]">{category.name} Transactions</h3>
        </div>
        <button type="button" onClick={onClose} className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)]">
          <X size={16} />
        </button>
      </div>
      <div className="divide-y divide-hairline">
        {transactions.map((transaction) => (
          <div key={transaction.id} className="py-2 flex items-center justify-between text-xs">
            <div>
              <div className="font-medium text-[var(--text)]">{transaction.note || category.name}</div>
              <div className="text-[11px] text-[var(--text-muted)]">{transaction.transactionDate}</div>
            </div>
            <div className={`font-mono font-semibold tabular-nums ${transaction.type === "INCOME" ? "text-income" : "text-expense"}`}>
              {transaction.type === "INCOME" ? `+ ${formatMoney(transaction.amountMinor)}` : `- ${formatMoney(transaction.amountMinor)}`}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});
