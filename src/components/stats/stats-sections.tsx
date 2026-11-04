"use client";

import { memo } from "react";
import { ChevronRight, TrendingUp, X } from "lucide-react";
import { formatMoney } from "@/lib/finance-core";
import { CategoryIcon } from "@/components/ui/category-icon";
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
    <div
      data-testid="stats-trend-view"
      className="p-6 bg-[var(--surface)] border border-[var(--border)] rounded-3xl space-y-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-2">
          <TrendingUp size={16} className="text-[var(--accent)]" />
          <span>6-Month Expense Trend</span>
        </h3>
      </div>

      <div className="grid grid-cols-6 gap-2.5 sm:gap-4 h-56 items-end pt-4 pb-3 border-b border-[var(--border)]">
        {months.map((month, idx) => {
          const heightPct = Math.round((month.totalMinor / maxMinor) * 100);
          const isLatest = idx === months.length - 1;
          return (
            <div
              key={month.key}
              data-testid={`trend-bar-${month.key}`}
              className="flex flex-col items-center justify-end h-full gap-2 group min-w-0"
            >
              <span
                data-testid="trend-bar-amount"
                className="text-2xs font-mono font-semibold text-[var(--text-muted)] group-hover:text-[var(--text)] tabular-nums truncate max-w-full text-center"
              >
                {formatMoney(month.totalMinor).replace("LKR ", "")}
              </span>
              <div className="w-full max-w-[44px] bg-[var(--bg)] border border-[var(--border)] rounded-2xl h-full flex items-end p-1">
                <div
                  style={{ height: `${Math.max(8, heightPct)}%` }}
                  className={`w-full rounded-xl transition-all ${
                    isLatest
                      ? "bg-[var(--expense)]"
                      : "bg-[var(--expense)]/65 group-hover:bg-[var(--expense)]"
                  }`}
                />
              </div>
              <span
                className={`text-xs font-semibold mt-0.5 ${
                  isLatest ? "text-[var(--text)]" : "text-[var(--text-muted)]"
                }`}
              >
                {month.label}
              </span>
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
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-5 space-y-4">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Categories ({categories.length})
        </h3>
        <span className="text-2xs font-medium text-[var(--text-muted)]">
          Tap to inspect
        </span>
      </div>

      <div className="space-y-2.5">
        {categories.map((category) => {
          const isSelected = selectedId === category.id;
          const isAsciiWord = /^[A-Za-z0-9_-]+$/.test(
            (category.icon || "").trim()
          );

          return (
            <button
              type="button"
              key={category.id}
              data-testid={`category-stat-row-${category.id}`}
              onClick={() => onSelect(isSelected ? "" : category.id)}
              aria-expanded={isSelected}
              aria-label={`${category.name}, ${category.percent} percent, ${formatMoney(category.amount)}`}
              className={`w-full text-left p-3.5 rounded-2xl border cursor-pointer transition-all space-y-2.5 ${
                isSelected
                  ? "bg-[var(--bg)] border-[var(--accent)] ring-1 ring-[var(--accent)]"
                  : "bg-[var(--bg)]/60 border-[var(--border)] hover:border-[var(--text-muted)]/60"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `${category.color}20`,
                      color: category.color,
                    }}
                  >
                    {category.icon && !isAsciiWord ? (
                      <span className="text-base leading-none">
                        {category.icon}
                      </span>
                    ) : (
                      <CategoryIcon
                        name={category.icon || "Folder"}
                        size={18}
                      />
                    )}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-[var(--text)] truncate">
                        {category.name}
                      </span>
                      <span
                        data-testid="category-percent-chip"
                        className="text-2xs px-2 py-0.5 rounded-full font-mono font-bold bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] tabular-nums shrink-0"
                      >
                        {category.percent}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    data-testid="category-stat-amount"
                    className="font-mono font-extrabold text-sm text-[var(--text)] tabular-nums"
                  >
                    {formatMoney(category.amount)}
                  </span>
                  <ChevronRight
                    size={16}
                    className={`text-[var(--text-muted)] transition-transform ${
                      isSelected ? "rotate-90 text-[var(--accent)]" : ""
                    }`}
                  />
                </div>
              </div>

              {/* Clean Progress Bar */}
              <div className="h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.max(3, category.percent)}%`,
                    backgroundColor: category.color,
                  }}
                />
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
    <section
      data-testid="category-transactions-list"
      className="p-5 bg-[var(--surface)] border border-[var(--border)] rounded-3xl space-y-4"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className="w-3.5 h-3.5 rounded-full shrink-0"
            style={{ backgroundColor: category.color }}
          />
          <h3 className="font-bold text-base text-[var(--text)]">
            {category.name} · {transactions.length}{" "}
            {transactions.length === 1 ? "entry" : "entries"}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close category transactions"
          className="w-9 h-9 rounded-xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-2.5">
        {transactions.map((transaction) => (
          <div
            key={transaction.id}
            className="p-3.5 rounded-2xl bg-[var(--bg)] border border-[var(--border)] flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="font-bold text-sm text-[var(--text)] truncate">
                {transaction.note || category.name}
              </div>
              <div className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
                {transaction.transactionDate.slice(0, 10)}
              </div>
            </div>
            <div
              className={`font-mono font-extrabold text-sm tabular-nums whitespace-nowrap shrink-0 ${
                transaction.type === "INCOME" ? "text-income" : "text-expense"
              }`}
            >
              {transaction.type === "INCOME"
                ? `+${formatMoney(transaction.amountMinor)}`
                : `-${formatMoney(transaction.amountMinor)}`}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});
