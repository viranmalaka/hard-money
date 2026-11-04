"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Plus, Trash2, PieChart, X } from "lucide-react";
import { AppHeader } from "@/components/navigation/app-header";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { EmptyState } from "@/components/ui/empty-state";
import { useModalHistory } from "@/hooks/use-modal-history";
import {
  useBudgets,
  useBudgetSnapshots,
  useCategories,
  useTransactions,
  useSync,
} from "@/components/sync-provider";
import {
  localCreateBudget,
  localUpdateBudget,
  localDeleteBudget,
} from "@/lib/sync/client";
import { parseMoneyToMinor } from "@/lib/finance-core/money";
import { getRemainingDaysInMonth } from "@/lib/finance-core/budget";
import { LocalBudget } from "@/lib/db";
import { BudgetCard, BudgetViewModel } from "@/components/budget/budget-card";
import { BudgetOverview } from "@/components/budget/budget-overview";

function getMonthString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function BudgetPage() {
  const { db, userId } = useSync();
  const budgets = useBudgets();
  const snapshots = useBudgetSnapshots();
  const categories = useCategories();
  const transactions = useTransactions();

  const [currentDate, setCurrentDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<LocalBudget | null>(null);

  const [formCategoryId, setFormCategoryId] = useState("");
  const [formLimitInput, setFormLimitInput] = useState("");
  const [formEnableRollover, setFormEnableRollover] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const monthStr = useMemo(() => getMonthString(currentDate), [currentDate]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, (typeof categories)[0]>();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  const availableCategories = useMemo(() => {
    const budgetedCatIds = new Set(
      budgets
        .filter((b) => !editingBudget || b.id !== editingBudget.id)
        .map((b) => b.categoryId)
    );
    return categories.filter(
      (c) =>
        c.type !== "INCOME" &&
        (!budgetedCatIds.has(c.id) ||
          (editingBudget && editingBudget.categoryId === c.id))
    );
  }, [categories, budgets, editingBudget]);

  const categorySpentMap = useMemo(() => {
    const rawMap = new Map<string, number>();

    for (const t of transactions) {
      if (t.deletedAt || t.excludeFromBudget) continue;
      if (
        t.type === "TRANSFER" ||
        t.type === "ADJUSTMENT" ||
        t.source === "CALIBRATION"
      ) {
        continue;
      }
      if (!t.transactionDate.startsWith(monthStr)) continue;

      if (t.isSplit && t.splitItems && t.splitItems.length > 0) {
        for (const item of t.splitItems) {
          const prev = rawMap.get(item.categoryId) || 0;
          if (t.type === "EXPENSE") {
            rawMap.set(item.categoryId, prev + item.amountMinor);
          } else if (t.type === "REFUND") {
            rawMap.set(item.categoryId, prev - item.amountMinor);
          }
        }
      } else if (t.categoryId) {
        const prev = rawMap.get(t.categoryId) || 0;
        if (t.type === "EXPENSE") {
          rawMap.set(t.categoryId, prev + t.amountMinor);
        } else if (t.type === "REFUND") {
          rawMap.set(t.categoryId, prev - t.amountMinor);
        }
      }
    }

    const spentMap = new Map<string, number>();
    for (const [catId, netSpent] of rawMap.entries()) {
      spentMap.set(catId, Math.max(0, netSpent));
    }

    return spentMap;
  }, [transactions, monthStr]);

  const now = new Date();
  const remainingDays =
    now.getFullYear() === currentDate.getFullYear() &&
    now.getMonth() === currentDate.getMonth()
      ? getRemainingDaysInMonth(now)
      : getRemainingDaysInMonth(currentDate);

  const budgetViewModels = useMemo<BudgetViewModel[]>(() => {
    return budgets.map((b) => {
      const category = categoryMap.get(b.categoryId);
      const categoryName = category?.name || "Uncategorized";

      const snap = snapshots.find(
        (s) => s.budgetId === b.id && s.month === monthStr
      );
      const carriedInMinor =
        b.enableRollover && snap ? snap.carriedInMinor : 0;
      const availableMinor = b.monthlyLimitMinor + carriedInMinor;

      const spentMinor = categorySpentMap.get(b.categoryId) || 0;
      const remainingMinor = availableMinor - spentMinor;
      const isOverBudget = remainingMinor < 0;

      const percent =
        availableMinor > 0
          ? Math.round((spentMinor / availableMinor) * 100)
          : 0;
      const barPercent = Math.min(100, Math.max(0, percent));

      let status: "ok" | "warning" | "over" = "ok";
      if (isOverBudget) {
        status = "over";
      } else if (percent >= 80) {
        status = "warning";
      }

      const dailySafeToSpendMinor = isOverBudget
        ? 0
        : Math.floor(remainingMinor / remainingDays);

      return {
        budget: b,
        categoryName,
        categoryIcon: category?.icon || "Tag",
        categoryColor: category?.color || "#6b7280",
        monthlyLimitMinor: b.monthlyLimitMinor,
        carriedInMinor,
        availableMinor,
        spentMinor,
        remainingMinor,
        isOverBudget,
        percent,
        barPercent,
        status,
        dailySafeToSpendMinor,
      };
    });
  }, [budgets, snapshots, monthStr, categoryMap, categorySpentMap, remainingDays]);

  const overall = useMemo(() => {
    let totalAvailable = 0;
    let totalSpent = 0;

    for (const item of budgetViewModels) {
      totalAvailable += item.availableMinor;
      totalSpent += item.spentMinor;
    }

    const totalRemaining = totalAvailable - totalSpent;
    const isOverallOver = totalRemaining < 0;
    const overallDailySafe = isOverallOver
      ? 0
      : Math.floor(totalRemaining / remainingDays);

    return {
      totalAvailable,
      totalSpent,
      totalRemaining,
      isOverallOver,
      overallDailySafe,
    };
  }, [budgetViewModels, remainingDays]);

  const openCreateModal = () => {
    setEditingBudget(null);
    setFormCategoryId(availableCategories[0]?.id || "");
    setFormLimitInput("");
    setFormEnableRollover(false);
    setFormError(null);
    setModalOpen(true);
  };

  const handleEditBudget = React.useCallback((budget: LocalBudget) => {
    setEditingBudget(budget);
    setFormCategoryId(budget.categoryId);
    setFormLimitInput((budget.monthlyLimitMinor / 100).toString());
    setFormEnableRollover(budget.enableRollover);
    setFormError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingBudget(null);
    setFormError(null);
  }, []);

  useModalHistory(modalOpen, closeModal, "budget-modal");

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formCategoryId) {
      setFormError("Please select a category");
      return;
    }

    const limitMinor = parseMoneyToMinor(formLimitInput);
    if (limitMinor <= 0) {
      setFormError("Please enter a valid monthly limit greater than zero");
      return;
    }

    try {
      if (editingBudget) {
        await localUpdateBudget(db, editingBudget.id, {
          categoryId: formCategoryId,
          monthlyLimitMinor: limitMinor,
          enableRollover: formEnableRollover,
        });
      } else {
        await localCreateBudget(db, {
          userId: userId || "usr_anonymous",
          categoryId: formCategoryId,
          monthlyLimitMinor: limitMinor,
          enableRollover: formEnableRollover,
          rolloverStartMonth: formEnableRollover ? monthStr : null,
        });
      }
      closeModal();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Failed to save budget"
      );
    }
  };

  const handleDeleteBudget = async () => {
    if (!editingBudget) return;
    try {
      await localDeleteBudget(db, editingBudget.id);
      closeModal();
    } catch (err: unknown) {
      setFormError(
        err instanceof Error ? err.message : "Failed to delete budget"
      );
    }
  };

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-5 sm:px-7 pt-4 sm:pt-6 pb-8 space-y-6">
      <AppHeader
        title="Monthly Budgets"
        subtitle="Spending Envelopes & Safe Burn Rate"
        backHref="/more"
        backLabel="Back to More"
        rightSlot={
          <button
            type="button"
            data-testid="add-budget-btn"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 h-10 px-4 text-xs font-bold rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-95 transition-opacity cursor-pointer shadow-xs"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Add Budget</span>
          </button>
        }
      />

      {/* Month Switcher */}
      <MonthSwitcher currentDate={currentDate} onChange={setCurrentDate} />

      {/* Overview Card */}
      {budgetViewModels.length > 0 && (
        <BudgetOverview
          totalAvailable={overall.totalAvailable}
          totalSpent={overall.totalSpent}
          totalRemaining={overall.totalRemaining}
          overallDailySafe={overall.overallDailySafe}
          isOverallOver={overall.isOverallOver}
        />
      )}

      {/* Budget List */}
      {budgetViewModels.length === 0 ? (
        <div data-testid="budget-empty-state">
          <EmptyState
            title="No budgets set for this month"
            description="Create monthly category budgets to keep your expenses under control and track daily safe-to-spend."
            icon={<PieChart size={28} />}
            actionLabel="Add Budget"
            onAction={openCreateModal}
          />
        </div>
      ) : (
        <div className="space-y-3.5" data-testid="budget-list">
          {budgetViewModels.map((item) => (
            <BudgetCard
              key={item.budget.id}
              item={item}
              onEdit={handleEditBudget}
            />
          ))}
        </div>
      )}

      {/* Add / Edit Budget Modal */}
      {modalOpen && (
        <div
          data-testid="budget-modal"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto"
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md p-6 space-y-5 bg-[var(--surface)] border-t sm:border border-[var(--border)] rounded-t-3xl sm:rounded-3xl shadow-2xl modal-sheet-dialog overflow-y-auto pb-sheet-safe"
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3.5">
              <h2 className="text-base sm:text-lg font-bold text-[var(--text)]">
                {editingBudget ? "Edit Category Budget" : "Set Category Budget"}
              </h2>
              <button
                type="button"
                data-testid="budget-cancel-btn"
                onClick={closeModal}
                aria-label="Close"
                className="w-9 h-9 rounded-full bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X size={17} />
              </button>
            </div>

            {formError && (
              <div
                data-testid="budget-form-error"
                className="p-3.5 text-xs font-medium rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25"
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveBudget} className="space-y-5">
              {/* Category Select */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Category
                </label>
                <select
                  data-testid="budget-category-select"
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  disabled={Boolean(editingBudget)}
                  className="w-full h-12 px-4 text-sm rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                >
                  <option value="" disabled>
                    Select Expense Category
                  </option>
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Monthly Limit */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Monthly Limit (LKR)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  data-testid="budget-limit-input"
                  placeholder="e.g. 30000"
                  value={formLimitInput}
                  onChange={(e) => setFormLimitInput(e.target.value)}
                  className="w-full h-12 px-4 text-sm font-mono font-bold rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] tabular-nums"
                  required
                />
              </div>

              {/* Rollover Toggle */}
              <label className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--bg)] border border-[var(--border)] cursor-pointer">
                <div>
                  <span className="text-sm font-semibold text-[var(--text)] block">
                    Symmetric Rollover
                  </span>
                  <span className="text-xs text-[var(--text-muted)] block mt-0.5">
                    Carries surpluses or deficits into next month
                  </span>
                </div>
                <input
                  type="checkbox"
                  data-testid="budget-rollover-toggle"
                  checked={formEnableRollover}
                  onChange={(e) => setFormEnableRollover(e.target.checked)}
                  className="w-5 h-5 rounded accent-[var(--accent)] cursor-pointer shrink-0"
                />
              </label>

              {/* Actions */}
              <div className="flex items-center justify-between gap-3 pt-2">
                {editingBudget ? (
                  <button
                    type="button"
                    data-testid="budget-delete-btn"
                    onClick={handleDeleteBudget}
                    className="inline-flex items-center gap-1.5 h-11 px-4 text-xs font-bold rounded-2xl text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/15 transition-colors cursor-pointer"
                  >
                    <Trash2 size={15} />
                    <span>Delete</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="h-11 px-4 text-xs font-semibold rounded-2xl border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg)] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="budget-save-btn"
                    className="h-11 px-5 text-xs font-bold rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-95 transition-opacity cursor-pointer shadow-xs"
                  >
                    Save Budget
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
