"use client";

import React, { useState, useMemo } from "react";
import { BarChart3, ChevronRight, X, TrendingUp } from "lucide-react";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { SummaryBar } from "@/components/ui/summary-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { useTransactions, useCategories } from "@/components/sync-provider";
import { formatMoney, calculatePercentagesLargestRemainder } from "@/lib/finance-core";

function getMonthString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function StatsPage() {
  const [currentDate, setCurrentDate] = useState(() => new Date(2026, 9, 1)); // Oct 2026 default
  const [activeTab, setActiveTab] = useState<"expense" | "income" | "trend">("expense");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const transactions = useTransactions();
  const categories = useCategories();

  const categoryMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string; icon: string }>();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  const monthStr = useMemo(() => getMonthString(currentDate), [currentDate]);

  // Month transactions
  const monthTransactions = useMemo(() => {
    return transactions.filter(
      (t) => !t.deletedAt && !t.excludeFromStats && t.transactionDate.startsWith(monthStr)
    );
  }, [transactions, monthStr]);

  // Overall totals for SummaryBar
  const { totalIncome, totalExpense } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const t of monthTransactions) {
      if (t.type === "TRANSFER" || t.type === "ADJUSTMENT" || t.source === "CALIBRATION") continue;

      if (t.isSplit && t.splitItems && t.splitItems.length > 0) {
        for (const item of t.splitItems) {
          if (t.type === "EXPENSE") exp += item.amountMinor;
          if (t.type === "INCOME") inc += item.amountMinor;
          if (t.type === "REFUND") exp = Math.max(0, exp - item.amountMinor);
        }
        continue;
      }

      if (t.type === "INCOME") inc += t.amountMinor;
      if (t.type === "EXPENSE") exp += t.amountMinor;
      if (t.type === "REFUND") exp = Math.max(0, exp - t.amountMinor);
    }
    return { totalIncome: inc, totalExpense: exp };
  }, [monthTransactions]);

  // Category breakdown for active dataset (expense vs income)
  const categoryStats = useMemo(() => {
    if (activeTab === "trend") return { list: [], total: 0 };

    const catAmounts = new Map<string, number>();
    let grandTotal = 0;

    for (const t of monthTransactions) {
      if (t.type === "TRANSFER" || t.type === "ADJUSTMENT" || t.source === "CALIBRATION") continue;

      if (t.isSplit && t.splitItems && t.splitItems.length > 0) {
        for (const item of t.splitItems) {
          if (activeTab === "expense") {
            if (t.type === "EXPENSE") {
              catAmounts.set(item.categoryId, (catAmounts.get(item.categoryId) || 0) + item.amountMinor);
              grandTotal += item.amountMinor;
            } else if (t.type === "REFUND") {
              catAmounts.set(item.categoryId, Math.max(0, (catAmounts.get(item.categoryId) || 0) - item.amountMinor));
              grandTotal = Math.max(0, grandTotal - item.amountMinor);
            }
          } else if (activeTab === "income" && t.type === "INCOME") {
            catAmounts.set(item.categoryId, (catAmounts.get(item.categoryId) || 0) + item.amountMinor);
            grandTotal += item.amountMinor;
          }
        }
        continue;
      }

      const catId = t.categoryId || "uncategorized";
      if (activeTab === "expense") {
        if (t.type === "EXPENSE") {
          catAmounts.set(catId, (catAmounts.get(catId) || 0) + t.amountMinor);
          grandTotal += t.amountMinor;
        } else if (t.type === "REFUND") {
          catAmounts.set(catId, Math.max(0, (catAmounts.get(catId) || 0) - t.amountMinor));
          grandTotal = Math.max(0, grandTotal - t.amountMinor);
        }
      } else if (activeTab === "income" && t.type === "INCOME") {
        catAmounts.set(catId, (catAmounts.get(catId) || 0) + t.amountMinor);
        grandTotal += t.amountMinor;
      }
    }

    const filtered = Array.from(catAmounts.entries())
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1]);

    const amounts = filtered.map(([, amt]) => amt);
    const percentages = calculatePercentagesLargestRemainder(amounts, 100);

    const list = filtered.map(([id, amount], idx) => {
      const cat = categoryMap.get(id);
      return {
        id,
        name: cat?.name || (id === "uncategorized" ? "Uncategorized" : "Other"),
        color: cat?.color || "#64748b",
        icon: cat?.icon || "Folder",
        amount,
        percent: percentages[idx] || 0,
      };
    });

    return { list, total: grandTotal };
  }, [monthTransactions, activeTab, categoryMap]);

  // Transactions belonging to selected category
  const selectedCategoryTransactions = useMemo(() => {
    if (!selectedCategoryId) return [];
    return monthTransactions.filter((t) => {
      if (t.type === "TRANSFER" || t.type === "ADJUSTMENT" || t.source === "CALIBRATION") return false;
      if (t.isSplit && t.splitItems) {
        return t.splitItems.some((s) => s.categoryId === selectedCategoryId);
      }
      return t.categoryId === selectedCategoryId;
    });
  }, [monthTransactions, selectedCategoryId]);

  // Trend data for preceding 6 months
  const trendData = useMemo(() => {
    const months: Array<{ key: string; label: string; totalMinor: number }> = [];
    const curY = currentDate.getFullYear();
    const curM = currentDate.getMonth();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(curY, curM - i, 1);
      const key = getMonthString(d);
      const label = d.toLocaleDateString("en-US", { month: "short" });

      let monthExp = 0;
      for (const t of transactions) {
        if (t.deletedAt || t.excludeFromStats) continue;
        if (!t.transactionDate.startsWith(key)) continue;
        if (t.type === "TRANSFER" || t.type === "ADJUSTMENT" || t.source === "CALIBRATION") continue;

        if (t.isSplit && t.splitItems && t.splitItems.length > 0) {
          for (const item of t.splitItems) {
            if (t.type === "EXPENSE") monthExp += item.amountMinor;
            if (t.type === "REFUND") monthExp = Math.max(0, monthExp - item.amountMinor);
          }
          continue;
        }

        if (t.type === "EXPENSE") monthExp += t.amountMinor;
        if (t.type === "REFUND") monthExp = Math.max(0, monthExp - t.amountMinor);
      }

      months.push({ key, label, totalMinor: monthExp });
    }

    const maxMinor = Math.max(1, ...months.map((m) => m.totalMinor));
    return { months, maxMinor };
  }, [transactions, currentDate]);

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between py-1">
        <h1 data-testid="stats-title" className="text-base font-semibold tracking-tight text-[var(--text)]">
          Statistics
        </h1>
      </div>

      {/* Month Switcher */}
      <MonthSwitcher currentDate={currentDate} onChange={setCurrentDate} />

      {/* Cashflow Summary Bar */}
      <SummaryBar incomeMinor={totalIncome} expenseMinor={totalExpense} totalMinor={totalIncome - totalExpense} />

      {/* Tab controls */}
      <div className="flex rounded-lg border border-hairline p-0.5 bg-[var(--surface)] text-xs font-medium">
        <button
          type="button"
          data-testid="stats-type-expense"
          onClick={() => {
            setActiveTab("expense");
            setSelectedCategoryId(null);
          }}
          className={`flex-1 py-1.5 rounded text-center transition-all ${
            activeTab === "expense"
              ? "bg-[var(--bg)] text-[var(--text)] font-semibold shadow-xs"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          Expense
        </button>
        <button
          type="button"
          data-testid="stats-type-income"
          onClick={() => {
            setActiveTab("income");
            setSelectedCategoryId(null);
          }}
          className={`flex-1 py-1.5 rounded text-center transition-all ${
            activeTab === "income"
              ? "bg-[var(--bg)] text-[var(--text)] font-semibold shadow-xs"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          Income
        </button>
        <button
          type="button"
          data-testid="stats-type-trend"
          onClick={() => {
            setActiveTab("trend");
            setSelectedCategoryId(null);
          }}
          className={`flex-1 py-1.5 rounded text-center transition-all ${
            activeTab === "trend"
              ? "bg-[var(--bg)] text-[var(--text)] font-semibold shadow-xs"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          }`}
        >
          Trend
        </button>
      </div>

      {/* Trend View */}
      {activeTab === "trend" ? (
        <div data-testid="stats-trend-view" className="p-4 bg-[var(--surface)] border border-hairline rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <TrendingUp size={14} />
              <span>6-Month Expense Trend</span>
            </h3>
          </div>

          <div className="grid grid-cols-6 gap-2 h-44 items-end pt-4 pb-2 border-b border-hairline">
            {trendData.months.map((m) => {
              const heightPct = Math.round((m.totalMinor / trendData.maxMinor) * 100);
              return (
                <div
                  key={m.key}
                  data-testid={`trend-bar-${m.key}`}
                  className="flex flex-col items-center justify-end h-full gap-1.5 group"
                >
                  <span
                    data-testid="trend-bar-amount"
                    className="text-[10px] font-mono text-[var(--text-muted)] group-hover:text-[var(--text)] tabular-nums truncate max-w-full text-center"
                  >
                    {formatMoney(m.totalMinor).replace("LKR ", "")}
                  </span>
                  <div className="w-full bg-[var(--border)] rounded-t-sm h-full flex items-end">
                    <div
                      style={{ height: `${Math.max(6, heightPct)}%` }}
                      className="w-full bg-[var(--expense)]/80 hover:bg-[var(--expense)] rounded-t-sm transition-all"
                    />
                  </div>
                  <span className="text-[11px] font-medium text-[var(--text-muted)] mt-1">
                    {m.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : categoryStats.list.length === 0 ? (
        /* Empty State */
        <div data-testid="stats-empty-state">
          <EmptyState
            title="No statistics available"
            description={`No ${activeTab} transactions found for ${currentDate.toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}.`}
            icon={<BarChart3 size={24} />}
          />
        </div>
      ) : (
        /* Donut Chart & Ranked Category List */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {/* Flat SVG Donut Chart Card */}
          <div className="p-4 bg-[var(--surface)] border border-hairline rounded-xl flex flex-col items-center justify-center space-y-4">
            <div className="relative w-48 h-48">
              <svg viewBox="0 0 100 100" data-testid="donut-chart" className="w-full h-full -rotate-90">
                {/* Background Ring */}
                <circle cx="50" cy="50" r="38" fill="none" stroke="var(--border)" strokeWidth="12" />

                {/* Slices */}
                {(() => {
                  let accumulatedPercent = 0;
                  const circumference = 2 * Math.PI * 38; // ~238.76

                  return categoryStats.list.map((item) => {
                    const strokeDasharray = `${(item.percent / 100) * circumference} ${circumference}`;
                    const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
                    accumulatedPercent += item.percent;

                    return (
                      <circle
                        key={item.id}
                        data-testid={`donut-slice-${item.id}`}
                        aria-label={`${item.name}: ${item.percent}%`}
                        cx="50"
                        cy="50"
                        r="38"
                        fill="none"
                        stroke={item.color}
                        strokeWidth="12"
                        strokeDasharray={strokeDasharray}
                        strokeDashoffset={strokeDashoffset}
                        className="transition-all duration-300 hover:opacity-85 cursor-pointer"
                        onClick={() => setSelectedCategoryId(selectedCategoryId === item.id ? null : item.id)}
                      />
                    );
                  });
                })()}
              </svg>

              {/* Donut Center Display */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-[10px] uppercase font-semibold text-[var(--text-muted)] tracking-wider">
                  {activeTab === "income" ? "Total Income" : "Total Expense"}
                </span>
                <span
                  data-testid="stat-total-expense"
                  className="font-mono font-bold text-xs text-[var(--text)] tabular-nums mt-0.5"
                >
                  {formatMoney(categoryStats.total)}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-[var(--text-muted)] text-center">
              Tap a slice or category row to view transactions
            </div>
          </div>

          {/* Ranked Category List Card */}
          <div className="bg-[var(--surface)] border border-hairline rounded-xl p-3 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] px-1">
              Top Categories ({categoryStats.list.length})
            </h3>

            <div className="space-y-1">
              {categoryStats.list.map((cat) => {
                const isSelected = selectedCategoryId === cat.id;
                return (
                  <div
                    key={cat.id}
                    data-testid={`category-stat-row-${cat.id}`}
                    onClick={() => setSelectedCategoryId(isSelected ? null : cat.id)}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? "bg-[var(--border)] border border-hairline"
                        : "hover:bg-[var(--bg)] border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-xs font-semibold text-[var(--text)] truncate">
                        {cat.name}
                      </span>
                      <span
                        data-testid="category-percent-chip"
                        className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-[var(--border)] text-[var(--text-muted)] tabular-nums"
                      >
                        {cat.percent}%
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        data-testid="category-stat-amount"
                        className="font-mono font-semibold text-xs text-[var(--text)] tabular-nums"
                      >
                        {formatMoney(cat.amount)}
                      </span>
                      <ChevronRight
                        size={14}
                        className={`text-[var(--text-muted)] transition-transform ${
                          isSelected ? "rotate-90 text-[var(--text)]" : ""
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Filtered Category Transactions List */}
      {selectedCategoryId && selectedCategoryTransactions.length > 0 && (
        <section
          data-testid="category-transactions-list"
          className="p-4 bg-[var(--surface)] border border-hairline rounded-xl space-y-3"
        >
          <div className="flex items-center justify-between border-b border-hairline pb-2">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: categoryMap.get(selectedCategoryId)?.color || "#64748b" }}
              />
              <h3 className="font-semibold text-sm text-[var(--text)]">
                {categoryMap.get(selectedCategoryId)?.name || "Category"} Transactions
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCategoryId(null)}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="divide-y divide-hairline">
            {selectedCategoryTransactions.map((tx) => (
              <div key={tx.id} className="py-2 flex items-center justify-between text-xs">
                <div>
                  <div className="font-medium text-[var(--text)]">
                    {tx.note || categoryMap.get(selectedCategoryId)?.name}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">{tx.transactionDate}</div>
                </div>
                <div
                  className={`font-mono font-semibold tabular-nums ${
                    tx.type === "INCOME" ? "text-income" : "text-expense"
                  }`}
                >
                  {tx.type === "INCOME" ? `+ ${formatMoney(tx.amountMinor)}` : `- ${formatMoney(tx.amountMinor)}`}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
