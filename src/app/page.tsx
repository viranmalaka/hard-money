"use client";

import React, { useState, useMemo } from "react";
import { ArrowLeftRight, Moon, Sun, CreditCard } from "lucide-react";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { SummaryBar } from "@/components/ui/summary-bar";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { useTheme } from "@/components/theme-provider";
import { useMounted } from "@/lib/use-mounted";
import { useTransactions, useCategories, useAccounts } from "@/components/sync-provider";
import { formatMoney } from "@/lib/finance-core/money";

export default function TransactionsPage() {
  const [activeTab, setActiveTab] = useState("daily");
  const { resolvedTheme, toggleTheme, toggleColorSwap, colorSwap } = useTheme();
  const mounted = useMounted();

  const transactions = useTransactions();
  const categories = useCategories();
  const accounts = useAccounts();

  const tabs = [
    { id: "daily", label: "Daily" },
    { id: "calendar", label: "Calendar" },
    { id: "monthly", label: "Monthly" },
    { id: "summary", label: "Summary" },
  ];

  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const c of categories) {
      map.set(c.id, { name: c.name, color: c.color });
    }
    return map;
  }, [categories]);

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) {
      map.set(a.id, a.name);
    }
    return map;
  }, [accounts]);

  // Derived Summary Totals
  const { incomeMinor, expenseMinor, totalMinor } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const t of transactions) {
      if (t.excludeFromStats) continue;
      if (t.type === "INCOME") {
        inc += t.amountMinor;
      } else if (t.type === "EXPENSE") {
        exp += t.amountMinor;
      }
    }
    return {
      incomeMinor: inc,
      expenseMinor: exp,
      totalMinor: inc - exp,
    };
  }, [transactions]);

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort(
      (a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
    );
  }, [transactions]);

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-3">
      {/* Top Bar with Single h1 and Mobile Controls */}
      <div className="flex items-center justify-between py-1">
        <h1
          data-testid="app-title"
          className="text-base font-semibold tracking-tight text-[var(--text)]"
        >
          Hard Money
        </h1>

        {/* Mobile quick controls */}
        <div className="mobile-only flex items-center gap-1">
          <button
            type="button"
            data-testid="color-swap-toggle"
            onClick={toggleColorSwap}
            title={`Color swap: ${colorSwap ? "Active" : "Default"}`}
            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            aria-label="Toggle Color Swap"
          >
            <CreditCard size={18} />
          </button>

          <button
            type="button"
            data-testid="theme-toggle"
            onClick={toggleTheme}
            title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
            className="p-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            aria-label="Toggle Theme"
          >
            {mounted && resolvedTheme === "dark" ? (
              <Sun size={18} className="text-amber-400" />
            ) : (
              <Moon size={18} />
            )}
          </button>
        </div>
      </div>

      {/* Month Switcher */}
      <MonthSwitcher />

      {/* 3-cell Summary Bar: Income · Expense · Total */}
      <SummaryBar
        incomeMinor={incomeMinor}
        expenseMinor={expenseMinor}
        totalMinor={totalMinor}
      />

      {/* Segmented text tabs without pill/elevation */}
      <SegmentedTabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Tab Content: Empty State or Transactions List */}
      {sortedTransactions.length === 0 ? (
        <EmptyState
          title="No transactions yet"
          description="Tap the + button to record your first income, expense, or transfer."
          icon={<ArrowLeftRight size={24} />}
        />
      ) : (
        <div className="border border-hairline rounded-lg divide-y divide-hairline bg-[var(--surface)] overflow-hidden">
          {sortedTransactions.map((tx) => {
            const isTransfer = tx.type === "TRANSFER";
            const isExpense = tx.type === "EXPENSE";
            const isIncome = tx.type === "INCOME";

            const category = tx.categoryId ? categoryMap.get(tx.categoryId) : null;
            const fromAccount = accountMap.get(tx.accountId) || "Unknown";
            const toAccount = tx.toAccountId ? accountMap.get(tx.toAccountId) : null;

            return (
              <div
                key={tx.id}
                data-testid={`transaction-row-${tx.id}`}
                className="flex items-center justify-between p-3 hover:bg-[var(--border)]/30 transition-colors"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    {category && (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: category.color }}
                      />
                    )}
                    <span className="text-xs font-semibold text-[var(--text)] truncate">
                      {isTransfer
                        ? `${fromAccount} → ${toAccount || "Account"}`
                        : category?.name || tx.type}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2">
                    <span>{tx.transactionDate}</span>
                    <span>• {fromAccount}</span>
                    {tx.note && <span>• {tx.note}</span>}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {isExpense && (
                    <span
                      data-testid="transaction-amount"
                      className="font-mono font-semibold text-xs tabular-nums text-expense"
                    >
                      - {formatMoney(tx.amountMinor)}
                    </span>
                  )}
                  {isIncome && (
                    <span
                      data-testid="transaction-amount"
                      className="font-mono font-semibold text-xs tabular-nums text-income"
                    >
                      + {formatMoney(tx.amountMinor)}
                    </span>
                  )}
                  {isTransfer && (
                    <span
                      data-testid="transaction-amount"
                      className="font-mono font-semibold text-xs tabular-nums text-[var(--text-muted)]"
                    >
                      {formatMoney(tx.amountMinor)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
