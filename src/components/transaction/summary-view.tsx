"use client";

import React, { useMemo } from "react";
import { formatMoney } from "@/lib/finance-core/money";
import { LocalTransaction } from "@/lib/db";

interface SummaryViewProps {
  transactions: LocalTransaction[];
  categoryMap: Map<string, { name: string; color: string }>;
}

export function SummaryView({ transactions, categoryMap }: SummaryViewProps) {
  const { incomeCategories, expenseCategories, totalIncome, totalExpense } = useMemo(() => {
    let totInc = 0;
    let totExp = 0;
    const incMap = new Map<string, number>();
    const expMap = new Map<string, number>();

    for (const tx of transactions) {
      if (tx.deletedAt || tx.excludeFromStats) continue;

      if (tx.isSplit && tx.splitItems && tx.splitItems.length > 0) {
        for (const item of tx.splitItems) {
          if (tx.type === "EXPENSE") {
            totExp += item.amountMinor;
            expMap.set(item.categoryId, (expMap.get(item.categoryId) || 0) + item.amountMinor);
          } else if (tx.type === "INCOME") {
            totInc += item.amountMinor;
            incMap.set(item.categoryId, (incMap.get(item.categoryId) || 0) + item.amountMinor);
          } else if (tx.type === "REFUND") {
            totExp = Math.max(0, totExp - item.amountMinor);
            expMap.set(item.categoryId, Math.max(0, (expMap.get(item.categoryId) || 0) - item.amountMinor));
          }
        }
        continue;
      }

      const catId = tx.categoryId || "uncategorized";
      if (tx.type === "EXPENSE") {
        totExp += tx.amountMinor;
        expMap.set(catId, (expMap.get(catId) || 0) + tx.amountMinor);
      } else if (tx.type === "INCOME") {
        totInc += tx.amountMinor;
        incMap.set(catId, (incMap.get(catId) || 0) + tx.amountMinor);
      } else if (tx.type === "REFUND") {
        totExp = Math.max(0, totExp - tx.amountMinor);
        expMap.set(catId, Math.max(0, (expMap.get(catId) || 0) - tx.amountMinor));
      }
    }

    const sortEntries = (map: Map<string, number>, total: number) => {
      return Array.from(map.entries())
        .map(([id, amount]) => {
          const cat = categoryMap.get(id);
          const percent = total > 0 ? (amount / total) * 100 : 0;
          return {
            id,
            name: cat?.name || "Uncategorized",
            color: cat?.color || "#888",
            amount,
            percent: Math.round(percent),
          };
        })
        .sort((a, b) => b.amount - a.amount);
    };

    return {
      incomeCategories: sortEntries(incMap, totInc),
      expenseCategories: sortEntries(expMap, totExp),
      totalIncome: totInc,
      totalExpense: totExp,
    };
  }, [transactions, categoryMap]);

  return (
    <div data-testid="view-summary" className="space-y-4">
      {/* Month Totals Card */}
      <div className="bg-[var(--surface)] border border-hairline rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Month Summary
        </h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded bg-[var(--bg)] border border-hairline">
            <span className="text-[10px] text-[var(--text-muted)] block">Total Income</span>
            <span className="font-mono font-semibold text-income text-xs tabular-nums">
              + {formatMoney(totalIncome)}
            </span>
          </div>
          <div className="p-2 rounded bg-[var(--bg)] border border-hairline">
            <span className="text-[10px] text-[var(--text-muted)] block">Total Expense</span>
            <span className="font-mono font-semibold text-expense text-xs tabular-nums">
              - {formatMoney(totalExpense)}
            </span>
          </div>
          <div className="p-2 rounded bg-[var(--bg)] border border-hairline">
            <span className="text-[10px] text-[var(--text-muted)] block">Net Savings</span>
            <span
              className={`font-mono font-semibold text-xs tabular-nums ${
                totalIncome >= totalExpense ? "text-income" : "text-expense"
              }`}
            >
              {totalIncome >= totalExpense
                ? `+ ${formatMoney(totalIncome - totalExpense)}`
                : `- ${formatMoney(totalExpense - totalIncome)}`}
            </span>
          </div>
        </div>
      </div>

      {/* Expenses by Category */}
      <div className="bg-[var(--surface)] border border-hairline rounded-lg p-4 space-y-3">
        <h3 className="text-xs font-semibold text-[var(--text)]">Expenses by Category</h3>
        {expenseCategories.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)]">No expenses recorded for this month.</p>
        ) : (
          <div className="space-y-2">
            {expenseCategories.map((item) => (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="font-medium text-[var(--text)]">{item.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">{item.percent}%</span>
                  </div>
                  <span className="font-mono font-semibold text-expense tabular-nums">
                    - {formatMoney(item.amount)}
                  </span>
                </div>
                {/* Visual bar */}
                <div className="w-full h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${item.percent}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incomes by Category */}
      {incomeCategories.length > 0 && (
        <div className="bg-[var(--surface)] border border-hairline rounded-lg p-4 space-y-3">
          <h3 className="text-xs font-semibold text-[var(--text)]">Income by Category</h3>
          <div className="space-y-2">
            {incomeCategories.map((item) => (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="font-medium text-[var(--text)]">{item.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">{item.percent}%</span>
                  </div>
                  <span className="font-mono font-semibold text-income tabular-nums">
                    + {formatMoney(item.amount)}
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${item.percent}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
