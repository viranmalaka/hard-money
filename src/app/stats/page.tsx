"use client";

import React, { useState, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { SummaryBar } from "@/components/ui/summary-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { useTransactions, useCategories } from "@/components/sync-provider";
import { formatMoney, calculatePercentagesLargestRemainder } from "@/lib/finance-core";
import { CategoryList, CategoryTransactions, TrendSection } from "@/components/stats/stats-sections";
import { useTabActiveRefresh } from "@/hooks/use-tab-active-refresh";

function getMonthString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function StatsPage() {
  const [currentDate, setCurrentDate] = useState(() => new Date(2026, 9, 1)); // Oct 2026 default
  const [activeTab, setActiveTab] = useState<"expense" | "income" | "trend">("expense");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Revalidate or trigger refresh when stats tab becomes active
  useTabActiveRefresh("/stats", () => {
    // Tab became active; Dexie live queries auto-reflect changes, hook provides hook point for background sync
  });

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
        <TrendSection months={trendData.months} maxMinor={trendData.maxMinor} />
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
            <div className="relative w-full max-w-[380px] aspect-[4/3]">
              <svg viewBox="0 0 320 240" data-testid="donut-chart" className="w-full h-full overflow-visible">
                {(() => {
                  const cx = 160;
                  const cy = 120;
                  const r = 58;
                  const stroke = 20;
                  const circumference = 2 * Math.PI * r;
                  const MIN_LABEL_PCT = 3; // tiny slices are left to the list below
                  const LABEL_GAP = 22;

                  // Slice geometry
                  let acc = 0;
                  const slices = categoryStats.list.map((item) => {
                    const start = acc;
                    acc += item.percent;
                    const mid = ((start + item.percent / 2) / 100) * 2 * Math.PI - Math.PI / 2;
                    return { item, start, mid };
                  });

                  // Callout label layout: anchor on ring edge -> elbow -> horizontal run to label
                  type Label = { id: string; color: string; name: string; pct: number; ax: number; ay: number; ex: number; ey: number; right: boolean; y: number };
                  const labels: Label[] = slices
                    .filter((sl) => sl.item.percent >= MIN_LABEL_PCT)
                    .map((sl) => {
                      const cos = Math.cos(sl.mid);
                      const sin = Math.sin(sl.mid);
                      const outer = r + stroke / 2;
                      return {
                        id: sl.item.id,
                        color: sl.item.color,
                        name: sl.item.name.length > 14 ? sl.item.name.slice(0, 13) + "…" : sl.item.name,
                        pct: sl.item.percent,
                        ax: cx + (outer + 2) * cos,
                        ay: cy + (outer + 2) * sin,
                        ex: cx + (outer + 14) * cos,
                        ey: cy + (outer + 14) * sin,
                        right: cos >= 0,
                        y: cy + (outer + 14) * sin,
                      };
                    });
                  // De-overlap per side (top -> bottom), then clamp into the viewBox
                  for (const side of [true, false]) {
                    const group = labels.filter((l) => l.right === side).sort((a, b) => a.y - b.y);
                    for (let i = 1; i < group.length; i++) {
                      group[i].y = Math.max(group[i].y, group[i - 1].y + LABEL_GAP);
                    }
                    const overflow = (group.at(-1)?.y ?? 0) - (240 - 14);
                    if (overflow > 0) group.forEach((l) => (l.y -= overflow));
                    for (let i = 0; i < group.length; i++) {
                      group[i].y = Math.max(group[i].y, 14 + i * LABEL_GAP);
                    }
                  }

                  return (
                    <>
                      {/* Background ring */}
                      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />

                      {/* Slices (rotated so 0% starts at 12 o'clock) */}
                      <g transform={`rotate(-90 ${cx} ${cy})`}>
                        {slices.map(({ item, start }) => (
                          <circle
                            key={item.id}
                            data-testid={`donut-slice-${item.id}`}
                            aria-label={`${item.name}: ${item.percent}%`}
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill="none"
                            stroke={item.color}
                            strokeWidth={selectedCategoryId === item.id ? stroke + 4 : stroke}
                            strokeDasharray={`${(item.percent / 100) * circumference} ${circumference}`}
                            strokeDashoffset={-((start / 100) * circumference)}
                            className="transition-all duration-300 hover:opacity-85 cursor-pointer"
                            onClick={() => setSelectedCategoryId(selectedCategoryId === item.id ? null : item.id)}
                          />
                        ))}
                      </g>

                      {/* Callouts */}
                      {labels.map((l) => {
                        const endX = l.right ? 304 : 16;
                        const textX = l.right ? endX - 2 : endX + 2;
                        return (
                          <g
                            key={`label-${l.id}`}
                            data-testid={`donut-label-${l.id}`}
                            className="cursor-pointer"
                            onClick={() => setSelectedCategoryId(selectedCategoryId === l.id ? null : l.id)}
                          >
                            <polyline
                              points={`${l.ax},${l.ay} ${l.ex},${l.y} ${endX},${l.y}`}
                              fill="none"
                              stroke={l.color}
                              strokeWidth={1}
                              strokeLinejoin="round"
                            />
                            <circle cx={l.ax} cy={l.ay} r={1.8} fill={l.color} />
                            <text
                              x={textX}
                              y={l.y - 3.5}
                              textAnchor={l.right ? "end" : "start"}
                              className="fill-[var(--text)]"
                              style={{ fontSize: 9.5, fontWeight: 600 }}
                            >
                              {l.name}
                            </text>
                            <text
                              x={textX}
                              y={l.y + 9}
                              textAnchor={l.right ? "end" : "start"}
                              className="fill-[var(--text-muted)]"
                              style={{ fontSize: 8.5, fontFamily: "var(--font-mono, monospace)" }}
                            >
                              {l.pct}%
                            </text>
                          </g>
                        );
                      })}
                    </>
                  );
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

          <CategoryList
            categories={categoryStats.list}
            selectedId={selectedCategoryId}
            onSelect={(id) => setSelectedCategoryId(id || null)}
          />
        </div>
      )}

      {/* Filtered Category Transactions List */}
      {selectedCategoryId && selectedCategoryTransactions.length > 0 && (
        <CategoryTransactions
          category={{
            name: categoryMap.get(selectedCategoryId)?.name || "Category",
            color: categoryMap.get(selectedCategoryId)?.color || "#64748b",
          }}
          transactions={selectedCategoryTransactions}
          onClose={() => setSelectedCategoryId(null)}
        />
      )}
    </main>
  );
}
