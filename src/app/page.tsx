"use client";

import React, { useState, useMemo, useEffect } from "react";
import { ArrowLeftRight, Moon, Sun, CreditCard } from "lucide-react";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { SummaryBar } from "@/components/ui/summary-bar";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { useTheme } from "@/components/theme-provider";
import { useMounted } from "@/lib/use-mounted";
import { useTransactions, useCategories, useAccounts, useSync, SyncIndicator } from "@/components/sync-provider";
import { formatMoney } from "@/lib/finance-core/money";
import { TransFilterBar, TransFilterState } from "@/components/transaction/trans-filter-bar";
import { DailyView } from "@/components/transaction/daily-view";
import { CalendarView } from "@/components/transaction/calendar-view";
import { MonthlyView } from "@/components/transaction/monthly-view";
import { SummaryView } from "@/components/transaction/summary-view";
import { TransactionEditModal } from "@/components/transaction/transaction-edit-modal";
import { LocalTransaction } from "@/lib/db";
import { localRestoreTransaction } from "@/lib/sync/client";

export default function TransactionsPage() {
  const [currentDate, setCurrentDate] = useState(() => new Date(2026, 9, 1));
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("trans-start-view");
        if (saved && ["daily", "calendar", "monthly", "summary"].includes(saved)) {
          return saved;
        }
      } catch {}
    }
    return "daily";
  });
  const [selectedTxForEdit, setSelectedTxForEdit] = useState<LocalTransaction | null>(null);
  const [deletedTx, setDeletedTx] = useState<LocalTransaction | null>(null);

  const [filters, setFilters] = useState<TransFilterState>({
    searchQuery: "",
    accountId: "",
    categoryId: "",
    type: "",
  });

  const { resolvedTheme, toggleTheme, toggleColorSwap, colorSwap } = useTheme();
  const mounted = useMounted();
  const { db } = useSync();
  const transactions = useTransactions();
  const categories = useCategories();
  const accounts = useAccounts();

  // Auto-dismiss undo toast after 6 seconds
  useEffect(() => {
    if (!deletedTx) return;
    const timer = setTimeout(() => {
      setDeletedTx(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [deletedTx]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    try {
      localStorage.setItem("trans-start-view", tab);
    } catch {}
  };

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

  // Current month prefix YYYY-MM
  const monthPrefix = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, [currentDate]);

  // Transactions belonging to selected month (excluding soft-deleted)
  const monthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (t.deletedAt) return false;
      return t.transactionDate.startsWith(monthPrefix);
    });
  }, [transactions, monthPrefix]);

  // Filtered transactions for the current view
  const filteredTransactions = useMemo(() => {
    return monthTransactions.filter((tx) => {
      // Account filter
      if (filters.accountId) {
        if (tx.accountId !== filters.accountId && tx.toAccountId !== filters.accountId) {
          return false;
        }
      }

      // Category filter (support split items)
      if (filters.categoryId) {
        const directMatch = tx.categoryId === filters.categoryId;
        const splitMatch =
          tx.isSplit &&
          Array.isArray(tx.splitItems) &&
          tx.splitItems.some((s) => s.categoryId === filters.categoryId);

        if (!directMatch && !splitMatch) {
          return false;
        }
      }

      // Type filter
      if (filters.type) {
        if (tx.type !== filters.type) {
          return false;
        }
      }

      // Search query (note, category, amount)
      if (filters.searchQuery.trim()) {
        const q = filters.searchQuery.toLowerCase();
        const noteMatch = tx.note?.toLowerCase().includes(q);
        const catName = tx.categoryId ? categoryMap.get(tx.categoryId)?.name?.toLowerCase() : "";
        const catMatch = catName?.includes(q);
        const amountStr = (tx.amountMinor / 100).toFixed(2);
        const amountMatch =
          amountStr.includes(q) ||
          formatMoney(tx.amountMinor).toLowerCase().includes(q) ||
          String(tx.amountMinor / 100).includes(q);

        const splitMatch =
          tx.isSplit &&
          Array.isArray(tx.splitItems) &&
          tx.splitItems.some(
            (s) =>
              s.note?.toLowerCase().includes(q) ||
              categoryMap.get(s.categoryId)?.name?.toLowerCase().includes(q)
          );

        if (!noteMatch && !catMatch && !amountMatch && !splitMatch) {
          return false;
        }
      }

      return true;
    });
  }, [monthTransactions, filters, categoryMap]);

  // Derived Summary Totals for selected month
  const { incomeMinor, expenseMinor, totalMinor, adjustmentsMinor } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    let adj = 0;

    for (const t of monthTransactions) {
      if (t.excludeFromStats) {
        if (t.source === "CALIBRATION" || t.type === "ADJUSTMENT") {
          adj += t.direction === "IN" ? t.amountMinor : -t.amountMinor;
        }
        continue;
      }
      if (t.type === "INCOME") {
        inc += t.amountMinor;
      } else if (t.type === "EXPENSE") {
        exp += t.amountMinor;
      } else if (t.type === "REFUND") {
        // Refund reduces expenses in the refund month
        exp = Math.max(0, exp - t.amountMinor);
      } else if (t.type === "ADJUSTMENT" || t.source === "CALIBRATION") {
        adj += t.direction === "IN" ? t.amountMinor : -t.amountMinor;
      }
    }

    return {
      incomeMinor: inc,
      expenseMinor: exp,
      totalMinor: inc - exp,
      adjustmentsMinor: adj,
    };
  }, [monthTransactions]);

  const handleUndoDelete = async () => {
    if (!deletedTx) return;
    try {
      await localRestoreTransaction(db, deletedTx);
      setDeletedTx(null);
    } catch (e) {
      console.error("Failed to restore transaction:", e);
    }
  };

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
        <div className="mobile-only flex items-center gap-1.5">
          <SyncIndicator isMobile={true} />

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
            title={mounted ? `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode` : "Toggle Theme"}
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
      <MonthSwitcher
        currentDate={currentDate}
        onChange={(newDate) => setCurrentDate(newDate)}
      />

      {/* 3-cell Summary Bar: Income · Expense · Total (+ Adjustments) */}
      <SummaryBar
        incomeMinor={incomeMinor}
        expenseMinor={expenseMinor}
        totalMinor={totalMinor}
        adjustmentsMinor={adjustmentsMinor}
      />

      {/* Search and Filters Bar */}
      <TransFilterBar
        filters={filters}
        onChange={setFilters}
        accounts={accounts}
        categories={categories}
      />

      {/* Segmented text tabs without pill/elevation */}
      <SegmentedTabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={handleTabChange}
      />

      {/* Views */}
      {activeTab === "daily" && (
        <>
          {filteredTransactions.length === 0 ? (
            <EmptyState
              title="No transactions yet"
              description="Tap the + button to record your first income, expense, or transfer."
              icon={<ArrowLeftRight size={24} />}
            />
          ) : (
            <DailyView
              transactions={filteredTransactions}
              categoryMap={categoryMap}
              accountMap={accountMap}
              onSelectTransaction={setSelectedTxForEdit}
            />
          )}
        </>
      )}

      {activeTab === "calendar" && (
        <CalendarView
          currentDate={currentDate}
          transactions={filteredTransactions}
          categoryMap={categoryMap}
          accountMap={accountMap}
          onSelectTransaction={setSelectedTxForEdit}
        />
      )}

      {activeTab === "monthly" && (
        <MonthlyView
          currentDate={currentDate}
          allTransactions={transactions}
          onSelectMonth={(newDate) => {
            setCurrentDate(newDate);
            setActiveTab("daily");
          }}
        />
      )}

      {activeTab === "summary" && (
        <SummaryView
          transactions={filteredTransactions}
          categoryMap={categoryMap}
        />
      )}

      {/* Transaction Edit Sheet */}
      {selectedTxForEdit && (
        <TransactionEditModal
          transaction={selectedTxForEdit}
          isOpen={!!selectedTxForEdit}
          onClose={() => setSelectedTxForEdit(null)}
          onDeleted={(tx) => setDeletedTx(tx)}
        />
      )}

      {/* Undo Toast */}
      {deletedTx && (
        <div
          data-testid="undo-toast"
          className="fixed bottom-mobile-offset left-1/2 -translate-x-1/2 z-50 bg-[var(--text)] text-[var(--bg)] px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-3 text-xs font-medium"
        >
          <span>Transaction deleted</span>
          <button
            type="button"
            data-testid="undo-delete-btn"
            onClick={handleUndoDelete}
            className="px-2 py-0.5 rounded bg-[var(--bg)] text-[var(--text)] font-semibold text-[11px] hover:opacity-90 active:scale-95 transition-all"
          >
            Undo
          </button>
        </div>
      )}
    </main>
  );
}
