"use client";

import React, { useState, useMemo } from "react";
import { Plus, Trash2, Edit2, PieChart, AlertTriangle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { EmptyState } from "@/components/ui/empty-state";
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
import { formatMoney, parseMoneyToMinor } from "@/lib/finance-core/money";
import { getRemainingDaysInMonth } from "@/lib/finance-core/budget";
import { LocalBudget } from "@/lib/db";

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

  const [currentDate, setCurrentDate] = useState<Date>(() => new Date(2026, 9, 1));
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<LocalBudget | null>(null);

  // Form states
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formLimitInput, setFormLimitInput] = useState("");
  const [formEnableRollover, setFormEnableRollover] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const monthStr = useMemo(() => getMonthString(currentDate), [currentDate]);

  // Map category by ID
  const categoryMap = useMemo(() => {
    const map = new Map<string, (typeof categories)[0]>();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  // Expense categories available for budget (exclude already budgeted if not editing)
  const availableCategories = useMemo(() => {
    const budgetedCatIds = new Set(
      budgets.filter((b) => !editingBudget || b.id !== editingBudget.id).map((b) => b.categoryId)
    );
    return categories.filter(
      (c) => !budgetedCatIds.has(c.id) || (editingBudget && editingBudget.categoryId === c.id)
    );
  }, [categories, budgets, editingBudget]);

  // Calculate spent per category in the current month
  // Spent = non-excluded expenses (split-aware) - refunds in month.
  // Excluded-from-budget and calibration rows do not count.
  const categorySpentMap = useMemo(() => {
    const rawMap = new Map<string, number>();

    for (const t of transactions) {
      if (t.deletedAt || t.excludeFromBudget) continue;
      if (t.type === "TRANSFER" || t.type === "ADJUSTMENT" || t.source === "CALIBRATION") continue;
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

  // Calculate remaining days for safe-to-spend
  const remainingDays = useMemo(() => {
    const now = new Date();
    // If viewing the current calendar month, calculate remaining days from today
    if (now.getFullYear() === currentDate.getFullYear() && now.getMonth() === currentDate.getMonth()) {
      return getRemainingDaysInMonth(now);
    }
    return getRemainingDaysInMonth(currentDate);
  }, [currentDate]);

  // Build budget view models with rollover snapshots
  const budgetViewModels = useMemo(() => {
    return budgets.map((b) => {
      const category = categoryMap.get(b.categoryId);
      const categoryName = category?.name || "Uncategorized";

      // Snapshot for this budget in this month
      const snap = snapshots.find((s) => s.budgetId === b.id && s.month === monthStr);
      const carriedInMinor = b.enableRollover && snap ? snap.carriedInMinor : 0;
      const availableMinor = b.monthlyLimitMinor + carriedInMinor;

      const spentMinor = categorySpentMap.get(b.categoryId) || 0;
      const remainingMinor = availableMinor - spentMinor;
      const isOverBudget = remainingMinor < 0;

      const percent = availableMinor > 0 ? Math.round((spentMinor / availableMinor) * 100) : 0;
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
        categoryIcon: category?.icon || "📁",
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

  // Overall totals
  const overall = useMemo(() => {
    let totalAvailable = 0;
    let totalSpent = 0;

    for (const item of budgetViewModels) {
      totalAvailable += item.availableMinor;
      totalSpent += item.spentMinor;
    }

    const totalRemaining = totalAvailable - totalSpent;
    const isOverallOver = totalRemaining < 0;
    const overallDailySafe = isOverallOver ? 0 : Math.floor(totalRemaining / remainingDays);

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

  const openEditModal = (b: LocalBudget) => {
    setEditingBudget(b);
    setFormCategoryId(b.categoryId);
    setFormLimitInput((b.monthlyLimitMinor / 100).toString());
    setFormEnableRollover(b.enableRollover);
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingBudget(null);
    setFormError(null);
  };

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
    } catch (err: any) {
      setFormError(err.message || "Failed to save budget");
    }
  };

  const handleDeleteBudget = async () => {
    if (!editingBudget) return;
    try {
      await localDeleteBudget(db, editingBudget.id);
      closeModal();
    } catch (err: any) {
      setFormError(err.message || "Failed to delete budget");
    }
  };

  return (
    <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-3 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between py-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">Budgets</h1>
          <p className="text-xs text-[var(--text-muted)]">Monthly limits, safe-to-spend burn rate & rollover</p>
        </div>
        <button
          type="button"
          data-testid="add-budget-btn"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--primary)] text-white hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
        >
          <Plus size={14} />
          <span>Add Budget</span>
        </button>
      </div>

      {/* Month Switcher */}
      <div className="flat-panel">
        <MonthSwitcher currentDate={currentDate} onChange={setCurrentDate} />
      </div>

      {/* Overview Card */}
      {budgetViewModels.length > 0 && (
        <div data-testid="budget-overview" className="flat-panel p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-hairline pb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Month Overview
            </span>
            <span
              data-testid="budget-overview-safe-to-spend"
              className="text-xs font-semibold px-2 py-0.5 rounded bg-surface text-[var(--text)]"
            >
              Safe-to-Spend: {formatMoney(overall.overallDailySafe)} / day
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center sm:text-left">
            <div>
              <span className="text-[11px] text-[var(--text-muted)]">Total Limit</span>
              <p
                data-testid="budget-overview-total-limit"
                className="text-sm sm:text-base font-semibold text-[var(--text)] tabular-nums"
              >
                {formatMoney(overall.totalAvailable)}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-[var(--text-muted)]">Total Spent</span>
              <p
                data-testid="budget-overview-total-spent"
                className="text-sm sm:text-base font-semibold text-[var(--expense)] tabular-nums"
              >
                {formatMoney(overall.totalSpent)}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-[var(--text-muted)]">
                {overall.isOverallOver ? "Over Budget" : "Remaining"}
              </span>
              <p
                data-testid="budget-overview-remaining"
                className={`text-sm sm:text-base font-semibold tabular-nums ${
                  overall.isOverallOver ? "text-[var(--expense)]" : "text-[var(--income)]"
                }`}
              >
                {overall.isOverallOver
                  ? `Over by ${formatMoney(Math.abs(overall.totalRemaining))}`
                  : formatMoney(overall.totalRemaining)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Budget List */}
      {budgetViewModels.length === 0 ? (
        <div data-testid="budget-empty-state">
          <EmptyState
            title="No budgets set for this month"
            description="Create monthly category budgets to keep your expenses under control and track daily safe-to-spend."
            icon={<PieChart size={32} />}
            actionLabel="Add Budget"
            onAction={openCreateModal}
          />
        </div>
      ) : (
        <div className="space-y-3" data-testid="budget-list">
          {budgetViewModels.map((item) => (
            <div
              key={item.budget.id}
              data-testid={`budget-row-${item.budget.id}`}
              data-budget-id={item.budget.id}
              data-budget-status={item.status}
              onClick={() => openEditModal(item.budget)}
              className="flat-panel p-3.5 space-y-2.5 cursor-pointer hover:bg-surface/50 transition-colors select-none"
            >
              {/* Row Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base">{item.categoryIcon}</span>
                  <div>
                    <span
                      data-testid="budget-category-name"
                      className="text-sm font-semibold text-[var(--text)]"
                    >
                      {item.categoryName}
                    </span>
                    {item.budget.enableRollover && item.carriedInMinor !== 0 && (
                      <span
                        data-testid="budget-carried-chip"
                        className={`ml-2 inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          item.carriedInMinor > 0
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-red-500/15 text-red-600 dark:text-red-400"
                        }`}
                      >
                        {item.carriedInMinor > 0 ? (
                          <ArrowUpRight size={10} />
                        ) : (
                          <ArrowDownRight size={10} />
                        )}
                        <span>
                          Carried: {item.carriedInMinor > 0 ? "+" : ""}
                          {formatMoney(item.carriedInMinor)}
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span
                    data-testid="budget-daily-safe-to-spend"
                    className="text-xs font-medium text-[var(--text-muted)]"
                  >
                    {item.isOverBudget
                      ? "Rs. 0.00 / day"
                      : `${formatMoney(item.dailySafeToSpendMinor)} / day`}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div
                data-testid="budget-progress-bar"
                data-status={item.status}
                className="w-full h-2 rounded-full bg-surface overflow-hidden"
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
                      : "bg-blue-500"
                  }`}
                />
              </div>

              {/* Details footer */}
              <div className="flex items-center justify-between text-xs tabular-nums">
                <div>
                  <span className="text-[var(--text-muted)]">Spent </span>
                  <span
                    data-testid="budget-spent-amount"
                    className="font-medium text-[var(--text)]"
                  >
                    {formatMoney(item.spentMinor)}
                  </span>
                  <span className="text-[var(--text-muted)]"> of </span>
                  <span
                    data-testid="budget-limit-amount"
                    className="font-medium text-[var(--text)]"
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
                      className="font-semibold text-[var(--expense)] inline-flex items-center gap-1"
                    >
                      <AlertTriangle size={12} />
                      Over budget by {formatMoney(Math.abs(item.remainingMinor))}
                    </span>
                  ) : (
                    <span
                      data-testid="budget-remaining-amount"
                      className={`font-medium ${
                        item.status === "warning"
                          ? "text-[var(--warning)]"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      Remaining: {formatMoney(item.remainingMinor)} ({100 - item.percent}%)
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Budget Modal */}
      {modalOpen && (
        <div
          data-testid="budget-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
        >
          <div className="flat-panel w-full max-w-md p-5 space-y-4 bg-app border border-hairline shadow-lg">
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <h2 className="text-base font-semibold text-[var(--text)]">
                {editingBudget ? "Edit Category Budget" : "Set Category Budget"}
              </h2>
              <button
                type="button"
                data-testid="budget-cancel-btn"
                onClick={closeModal}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                Close
              </button>
            </div>

            {formError && (
              <div
                data-testid="budget-form-error"
                className="p-2 text-xs rounded bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
              >
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveBudget} className="space-y-4">
              {/* Category Select */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-muted)]">Category</label>
                <select
                  data-testid="budget-category-select"
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  disabled={Boolean(editingBudget)}
                  className="w-full px-3 py-2 text-sm rounded border border-hairline bg-surface text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="" disabled>
                    Select Expense Category
                  </option>
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Monthly Limit */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--text-muted)]">
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
                  className="w-full px-3 py-2 text-sm rounded border border-hairline bg-surface text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
                  required
                />
              </div>

              {/* Rollover Toggle */}
              <div className="flex items-center justify-between py-2 border-t border-hairline">
                <div>
                  <span className="text-xs font-medium text-[var(--text)] block">
                    Enable Symmetric Rollover
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)] block">
                    Carries over surpluses or deficits into the next month
                  </span>
                </div>
                <input
                  type="checkbox"
                  data-testid="budget-rollover-toggle"
                  checked={formEnableRollover}
                  onChange={(e) => setFormEnableRollover(e.target.checked)}
                  className="w-4 h-4 rounded border-hairline text-primary focus:ring-primary cursor-pointer"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2">
                {editingBudget ? (
                  <button
                    type="button"
                    data-testid="budget-delete-btn"
                    onClick={handleDeleteBudget}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-3 py-1.5 text-xs font-medium rounded border border-hairline text-[var(--text-muted)] hover:bg-surface transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    data-testid="budget-save-btn"
                    className="px-4 py-1.5 text-xs font-semibold rounded bg-[var(--primary)] text-white hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
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
