"use client";

import React, { useState, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { SummaryBar } from "@/components/ui/summary-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { useTransactions, useCategories } from "@/components/sync-provider";
import {
  formatMoney,
  calculatePercentagesLargestRemainder,
} from "@/lib/finance-core";
import {
  CategoryList,
  CategoryTransactions,
  TrendSection,
} from "@/components/stats/stats-sections";
import { useTabActiveRefresh } from "@/hooks/use-tab-active-refresh";

function getMonthString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function StatsPage() {
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [activeTab, setActiveTab] = useState<"expense" | "income" | "trend">(
    "expense"
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );

  useTabActiveRefresh("/stats", () => {
    // Active tab hook
  });

  const transactions = useTransactions();
  const categories = useCategories();

  const categoryMap = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; color: string; icon: string }
    >();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  const monthStr = useMemo(() => getMonthString(currentDate), [currentDate]);

  const monthTransactions = useMemo(() => {
    return transactions.filter(
      (t) =>
        !t.deletedAt &&
        !t.excludeFromStats &&
        t.transactionDate.startsWith(monthStr)
    );
  }, [transactions, monthStr]);

  const { totalIncome, totalExpense } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const t of monthTransactions) {
      if (
        t.type === "TRANSFER" ||
        t.type === "ADJUSTMENT" ||
        t.source === "CALIBRATION"
      ) {
        continue;
      }

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

  const categoryStats = useMemo(() => {
    if (activeTab === "trend") return { list: [], total: 0 };

    const catAmounts = new Map<string, number>();
    let grandTotal = 0;

    for (const t of monthTransactions) {
      if (
        t.type === "TRANSFER" ||
        t.type === "ADJUSTMENT" ||
        t.source === "CALIBRATION"
      ) {
        continue;
      }

      if (t.isSplit && t.splitItems && t.splitItems.length > 0) {
        for (const item of t.splitItems) {
          if (activeTab === "expense") {
            if (t.type === "EXPENSE") {
              catAmounts.set(
                item.categoryId,
                (catAmounts.get(item.categoryId) || 0) + item.amountMinor
              );
              grandTotal += item.amountMinor;
            } else if (t.type === "REFUND") {
              catAmounts.set(
                item.categoryId,
                Math.max(
                  0,
                  (catAmounts.get(item.categoryId) || 0) - item.amountMinor
                )
              );
              grandTotal = Math.max(0, grandTotal - item.amountMinor);
            }
          } else if (activeTab === "income" && t.type === "INCOME") {
            catAmounts.set(
              item.categoryId,
              (catAmounts.get(item.categoryId) || 0) + item.amountMinor
            );
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
          catAmounts.set(
            catId,
            Math.max(0, (catAmounts.get(catId) || 0) - t.amountMinor)
          );
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

  const selectedCategoryTransactions = useMemo(() => {
    if (!selectedCategoryId) return [];
    return monthTransactions.filter((t) => {
      if (
        t.type === "TRANSFER" ||
        t.type === "ADJUSTMENT" ||
        t.source === "CALIBRATION"
      ) {
        return false;
      }
      if (t.isSplit && t.splitItems && t.splitItems.length > 0) {
        return t.splitItems.some((s) =>
          selectedCategoryId === "uncategorized"
            ? !s.categoryId || s.categoryId === "uncategorized"
            : s.categoryId === selectedCategoryId
        );
      }
      return selectedCategoryId === "uncategorized"
        ? !t.categoryId || t.categoryId === "uncategorized"
        : t.categoryId === selectedCategoryId;
    });
  }, [monthTransactions, selectedCategoryId]);

  const trendData = useMemo(() => {
    const months: Array<{ key: string; label: string; totalMinor: number }> =
      [];
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
        if (
          t.type === "TRANSFER" ||
          t.type === "ADJUSTMENT" ||
          t.source === "CALIBRATION"
        ) {
          continue;
        }

        if (t.isSplit && t.splitItems && t.splitItems.length > 0) {
          for (const item of t.splitItems) {
            if (t.type === "EXPENSE") monthExp += item.amountMinor;
            if (t.type === "REFUND") {
              monthExp = Math.max(0, monthExp - item.amountMinor);
            }
          }
          continue;
        }

        if (t.type === "EXPENSE") monthExp += t.amountMinor;
        if (t.type === "REFUND") {
          monthExp = Math.max(0, monthExp - t.amountMinor);
        }
      }

      months.push({ key, label, totalMinor: monthExp });
    }

    const maxMinor = Math.max(1, ...months.map((m) => m.totalMinor));
    return { months, maxMinor };
  }, [transactions, currentDate]);

  // Split-Lens SVG Donut Ring Geometry
  const ringGeometry = useMemo(() => {
    const radius = 68;
    const circumference = 2 * Math.PI * radius;
    if (categoryStats.total <= 0) {
      return { radius, circumference, arcs: [] };
    }

    let cumulativeFraction = 0;
    const arcs = categoryStats.list.map((item) => {
      const fraction = item.amount / categoryStats.total;
      const gap = categoryStats.list.length > 1 ? 3.5 : 0;
      const length = Math.max(2, fraction * circumference - gap);
      const offset = -cumulativeFraction * circumference;
      cumulativeFraction += fraction;
      return {
        ...item,
        length,
        offset,
      };
    });

    return { radius, circumference, arcs };
  }, [categoryStats]);

  const activeCategoryStat = selectedCategoryId
    ? categoryStats.list.find((c) => c.id === selectedCategoryId) || null
    : null;

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      <AppHeader
        testId="stats-title"
        title="Analytics & Lens"
        subtitle="Cashflow Breakdown"
      />

      {/* Month Switcher */}
      <MonthSwitcher currentDate={currentDate} onChange={setCurrentDate} />

      {/* Cashflow Summary Cards */}
      <SummaryBar
        incomeMinor={totalIncome}
        expenseMinor={totalExpense}
        totalMinor={totalIncome - totalExpense}
      />

      {/* Mode Switcher */}
      <div className="flex gap-1.5 p-1.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-xs sm:text-sm font-semibold">
        {(
          [
            { id: "expense", label: "Expenses", testId: "stats-type-expense" },
            { id: "income", label: "Income", testId: "stats-type-income" },
            { id: "trend", label: "6M Trend", testId: "stats-type-trend" },
          ] as const
        ).map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={tab.testId}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedCategoryId(null);
              }}
              className={`flex-1 py-2.5 rounded-xl text-center transition-all cursor-pointer ${
                active
                  ? "bg-[var(--accent)] text-[var(--accent-fg)] shadow-xs font-bold"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {activeTab === "trend" ? (
        <TrendSection months={trendData.months} maxMinor={trendData.maxMinor} />
      ) : categoryStats.list.length === 0 ? (
        <div data-testid="stats-empty-state">
          <EmptyState
            title="No analytics for this month"
            description={`No ${activeTab} entries recorded in ${currentDate.toLocaleDateString(
              "en-US",
              {
                month: "long",
                year: "numeric",
              }
            )}.`}
            icon={<BarChart3 size={24} />}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Split-Lens Donut Card */}
          <div className="lg:col-span-5 p-6 bg-[var(--surface)] border border-[var(--border)] rounded-3xl flex flex-col items-center justify-center space-y-5">
            <div className="relative w-52 h-52 flex items-center justify-center">
              <svg
                viewBox="0 0 180 180"
                data-testid="donut-chart"
                className="w-full h-full -rotate-90"
              >
                <circle
                  cx="90"
                  cy="90"
                  r={ringGeometry.radius}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="18"
                />
                {ringGeometry.arcs.map((arc) => {
                  const isSelected = selectedCategoryId === arc.id;
                  const isDimmed =
                    selectedCategoryId !== null && !isSelected;
                  return (
                    <circle
                      key={arc.id}
                      data-testid={`donut-slice-${arc.id}`}
                      aria-label={`${arc.name}: ${arc.percent}%`}
                      cx="90"
                      cy="90"
                      r={ringGeometry.radius}
                      fill="none"
                      stroke={arc.color}
                      strokeWidth={isSelected ? "22" : "18"}
                      strokeDasharray={`${arc.length} ${ringGeometry.circumference}`}
                      strokeDashoffset={arc.offset}
                      strokeLinecap={
                        ringGeometry.arcs.length > 1 ? "round" : "butt"
                      }
                      style={{
                        opacity: isDimmed ? 0.25 : 1,
                        transition: "all 220ms ease",
                      }}
                      className="cursor-pointer"
                      onClick={() =>
                        setSelectedCategoryId(isSelected ? null : arc.id)
                      }
                    />
                  );
                })}
              </svg>

              {/* Center Hero Display */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-5">
                <span className="text-2xs uppercase font-bold text-[var(--text-muted)] tracking-wider truncate max-w-[125px]">
                  {activeCategoryStat
                    ? `${activeCategoryStat.name} · ${activeCategoryStat.percent}%`
                    : activeTab === "income"
                      ? "Total Income"
                      : "Total Expense"}
                </span>
                <span
                  data-testid="stat-total-expense"
                  className="font-mono font-extrabold text-sm sm:text-base text-[var(--text)] tabular-nums mt-1 truncate max-w-[135px]"
                >
                  {formatMoney(
                    activeCategoryStat
                      ? activeCategoryStat.amount
                      : categoryStats.total
                  )}
                </span>
              </div>
            </div>

            {/* Split-Lens Category Focus Pills */}
            <div className="w-full space-y-2 pt-3 border-t border-[var(--border)]">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-muted)] font-medium">
                  Tap a ring slice or pill to focus
                </span>
                {selectedCategoryId && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryId(null)}
                    className="text-[var(--accent)] font-bold cursor-pointer"
                  >
                    Reset ×
                  </button>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {categoryStats.list.map((cat) => {
                  const selected = selectedCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      data-testid={`donut-label-${cat.id}`}
                      onClick={() =>
                        setSelectedCategoryId(selected ? null : cat.id)
                      }
                      className={`shrink-0 px-3 py-2 rounded-2xl border text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer ${
                        selected
                          ? "bg-[var(--text)] text-[var(--bg)] border-[var(--text)]"
                          : "bg-[var(--bg)] text-[var(--text)] border-[var(--border)] hover:border-[var(--text-muted)]"
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span>{cat.name}</span>
                      <span className="opacity-75 font-mono">
                        {cat.percent}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Ranked Category Breakdown Cards */}
          <div className="lg:col-span-7">
            <CategoryList
              categories={categoryStats.list}
              selectedId={selectedCategoryId}
              onSelect={(id) => setSelectedCategoryId(id || null)}
            />
          </div>
        </div>
      )}

      {/* Filtered Category Transactions Drill-down */}
      {selectedCategoryId && selectedCategoryTransactions.length > 0 && (
        <CategoryTransactions
          category={{
            name:
              categoryMap.get(selectedCategoryId)?.name ||
              (selectedCategoryId === "uncategorized"
                ? "Uncategorized"
                : "Category"),
            color: categoryMap.get(selectedCategoryId)?.color || "#64748b",
          }}
          transactions={selectedCategoryTransactions}
          onClose={() => setSelectedCategoryId(null)}
        />
      )}
    </main>
  );
}
