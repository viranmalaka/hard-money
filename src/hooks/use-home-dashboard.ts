"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/components/theme-provider";
import { useMounted } from "@/lib/use-mounted";
import {
  useCategories,
  useAccounts,
  useSync,
} from "@/components/sync-provider";
import { useQuickAdd } from "@/components/transaction/quick-add-context";
import { useAccountPortfolio } from "@/hooks/use-account-portfolio";
import { formatMoney } from "@/lib/finance-core/money";
import { LocalCategory, LocalTransaction } from "@/lib/db";
import { localRestoreTransaction } from "@/lib/sync/client";
import {
  listTransactions,
  getTransactionSummary,
} from "@/services/transaction-service";
import { listInbox } from "@/services/inbox-service";
import { queryKeys } from "@/lib/api/query-keys";
import { getPendingTransactions } from "@/lib/offline/transaction-queue";

export interface HomeFilterState {
  searchQuery: string;
  accountId: string;
  categoryId: string;
  type: "" | "EXPENSE" | "INCOME" | "TRANSFER";
  selectedDay: string; // YYYY-MM-DD or ""
}

export interface DayTransactionGroup {
  dateKey: string;
  dateObj: Date;
  titleLabel: string;
  weekdayLabel: string;
  shortDateLabel: string;
  transactions: LocalTransaction[];
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

export interface CategorySpendItem {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  amountMinor: number;
  percentage: number;
  count: number;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function useHomeDashboard() {
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [filters, setFilters] = useState<HomeFilterState>({
    searchQuery: "",
    accountId: "",
    categoryId: "",
    type: "",
    selectedDay: "",
  });

  const [selectedTxForEdit, setSelectedTxForEdit] =
    useState<LocalTransaction | null>(null);
  const [deletedTx, setDeletedTx] = useState<LocalTransaction | null>(null);
  const [offlinePendingTxs, setOfflinePendingTxs] = useState<
    LocalTransaction[]
  >([]);
  const [activeSmsModal, setActiveSmsModal] = useState<{
    rawMessage: string;
    sender: string;
    receivedAt: string;
  } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const { resolvedTheme, toggleTheme, toggleColorSwap, colorSwap } = useTheme();
  const mounted = useMounted();
  const { db, userId, pendingCount, sync } = useSync();
  const categories = useCategories();
  const accounts = useAccounts();
  const { openQuickAdd } = useQuickAdd();

  // Live portfolio balances (accounts, net worth, cash/bank/credit subtotals)
  const portfolio = useAccountPortfolio(false, null);

  // Month prefix YYYY-MM
  const monthPrefix = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, [currentDate]);

  const monthLabel = `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  const shortMonthLabel = `${SHORT_MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return (
      now.getFullYear() === currentDate.getFullYear() &&
      now.getMonth() === currentDate.getMonth()
    );
  }, [currentDate]);

  const prevMonth = useCallback(() => {
    setCurrentDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
    );
    setFilters((prev) => ({ ...prev, selectedDay: "" }));
  }, []);

  const nextMonth = useCallback(() => {
    setCurrentDate(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
    );
    setFilters((prev) => ({ ...prev, selectedDay: "" }));
  }, []);

  const goToCurrentMonth = useCallback(() => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setFilters((prev) => ({ ...prev, selectedDay: "" }));
  }, []);

  // Network queries
  const monthTransactionsQuery = useQuery({
    queryKey: queryKeys.transactions.byMonth(monthPrefix),
    queryFn: () => listTransactions({ month: monthPrefix }),
    enabled: !!userId,
  });

  const summaryQuery = useQuery({
    queryKey: queryKeys.transactions.summary(monthPrefix),
    queryFn: () => getTransactionSummary(monthPrefix),
    enabled: !!userId,
  });

  const inboxQuery = useQuery({
    queryKey: queryKeys.inbox.all(),
    queryFn: listInbox,
    enabled: !!userId,
    staleTime: 60_000,
  });

  const pendingInboxCount = useMemo(() => {
    const items = inboxQuery.data ?? [];
    return (
      items.filter(
        (item) =>
          item.status === "NEEDS_REVIEW" ||
          item.status === "PENDING" ||
          item.status === "FAILED",
      ).length || items.length
    );
  }, [inboxQuery.data]);

  // Offline pending transactions
  useEffect(() => {
    let isMounted = true;
    getPendingTransactions().then((records) => {
      if (isMounted) {
        setOfflinePendingTxs(
          records
            .map((r) => ({ ...r.optimisticTx, isPendingSync: true }))
            .filter((t) => t.transactionDate.startsWith(monthPrefix)),
        );
      }
    });
    return () => {
      isMounted = false;
    };
  }, [monthPrefix, pendingCount]);

  // Auto-dismiss undo toast
  useEffect(() => {
    if (!deletedTx) return;
    const timer = setTimeout(() => {
      setDeletedTx(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [deletedTx]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, LocalCategory>();
    for (const c of categories) {
      map.set(c.id, c);
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

  // Merged month transactions
  const monthTransactions = useMemo(() => {
    const serverList = monthTransactionsQuery.data ?? [];
    if (offlinePendingTxs.length === 0) return serverList;
    const serverIds = new Set(serverList.map((t) => t.id));
    const extra = offlinePendingTxs.filter((t) => !serverIds.has(t.id));
    return [...extra, ...serverList];
  }, [monthTransactionsQuery.data, offlinePendingTxs]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return monthTransactions.filter((tx) => {
      if (tx.deletedAt) return false;

      if (filters.selectedDay) {
        if (!tx.transactionDate.startsWith(filters.selectedDay)) {
          return false;
        }
      }

      if (filters.accountId) {
        if (
          tx.accountId !== filters.accountId &&
          tx.toAccountId !== filters.accountId
        ) {
          return false;
        }
      }

      if (filters.categoryId) {
        const directMatch = tx.categoryId === filters.categoryId;
        const splitMatch =
          tx.isSplit &&
          Array.isArray(tx.splitItems) &&
          tx.splitItems.some((s) => s.categoryId === filters.categoryId);
        if (!directMatch && !splitMatch) return false;
      }

      if (filters.type) {
        if (tx.type !== filters.type) return false;
      }

      if (filters.searchQuery.trim()) {
        const q = filters.searchQuery.toLowerCase();
        const noteMatch = tx.note?.toLowerCase().includes(q);
        const catName = tx.categoryId
          ? categoryMap.get(tx.categoryId)?.name?.toLowerCase()
          : "";
        const catMatch = catName?.includes(q);
        const accName = accountMap.get(tx.accountId)?.toLowerCase() || "";
        const accMatch = accName.includes(q);
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
              categoryMap.get(s.categoryId)?.name?.toLowerCase().includes(q),
          );

        if (
          !noteMatch &&
          !catMatch &&
          !accMatch &&
          !amountMatch &&
          !splitMatch
        ) {
          return false;
        }
      }

      return true;
    });
  }, [monthTransactions, filters, categoryMap, accountMap]);

  // Monthly totals (server summary with local fallback)
  const { incomeMinor, expenseMinor, netMinor, adjustmentsMinor } =
    useMemo(() => {
      if (summaryQuery.data) {
        return {
          incomeMinor: summaryQuery.data.totalIncomeMinor,
          expenseMinor: summaryQuery.data.totalExpenseMinor,
          netMinor: summaryQuery.data.netSavingsMinor,
          adjustmentsMinor: 0,
        };
      }

      let inc = 0;
      let exp = 0;
      let adj = 0;

      for (const t of monthTransactions) {
        if (t.deletedAt) continue;
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
          exp = Math.max(0, exp - t.amountMinor);
        } else if (t.type === "ADJUSTMENT" || t.source === "CALIBRATION") {
          adj += t.direction === "IN" ? t.amountMinor : -t.amountMinor;
        }
      }

      return {
        incomeMinor: inc,
        expenseMinor: exp,
        netMinor: inc - exp,
        adjustmentsMinor: adj,
      };
    }, [summaryQuery.data, monthTransactions]);

  // Grouped by day for feed rendering
  const groupedByDay = useMemo<DayTransactionGroup[]>(() => {
    const groups = new Map<string, LocalTransaction[]>();
    for (const tx of filteredTransactions) {
      const dateKey = tx.transactionDate.slice(0, 10);
      const existing = groups.get(dateKey) || [];
      existing.push(tx);
      groups.set(dateKey, existing);
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate(),
    ).padStart(2, "0")}`;
    const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayStr = `${yest.getFullYear()}-${String(
      yest.getMonth() + 1,
    ).padStart(2, "0")}-${String(yest.getDate()).padStart(2, "0")}`;

    const sortedKeys = Array.from(groups.keys()).sort((a, b) =>
      b.localeCompare(a),
    );

    return sortedKeys.map((dateKey) => {
      const txs = groups.get(dateKey)!;
      const dateObj = new Date(dateKey + "T00:00:00");
      let inc = 0;
      let exp = 0;

      for (const t of txs) {
        if (t.deletedAt || t.excludeFromStats) continue;
        if (t.type === "INCOME") inc += t.amountMinor;
        else if (t.type === "EXPENSE") exp += t.amountMinor;
        else if (t.type === "REFUND") exp = Math.max(0, exp - t.amountMinor);
      }

      const weekdayLabel = dateObj.toLocaleDateString("en-US", {
        weekday: "short",
      });
      const shortDateLabel = dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });

      let titleLabel = `${weekdayLabel}, ${shortDateLabel}`;
      if (dateKey === todayStr) titleLabel = `Today · ${shortDateLabel}`;
      else if (dateKey === yesterdayStr)
        titleLabel = `Yesterday · ${shortDateLabel}`;

      return {
        dateKey,
        dateObj,
        titleLabel,
        weekdayLabel,
        shortDateLabel,
        transactions: txs,
        incomeMinor: inc,
        expenseMinor: exp,
        netMinor: inc - exp,
      };
    });
  }, [filteredTransactions]);

  // Category spend breakdown (from monthTransactions so category pills stay stable when filtering)
  const categoryBreakdown = useMemo<CategorySpendItem[]>(() => {
    const totals = new Map<string, { amountMinor: number; count: number }>();

    for (const tx of monthTransactions) {
      if (tx.deletedAt || tx.excludeFromStats) continue;
      if (tx.type !== "EXPENSE" && tx.type !== "REFUND") continue;

      if (
        tx.isSplit &&
        Array.isArray(tx.splitItems) &&
        tx.splitItems.length > 0
      ) {
        for (const split of tx.splitItems) {
          const prev = totals.get(split.categoryId) || {
            amountMinor: 0,
            count: 0,
          };
          const delta =
            tx.type === "EXPENSE" ? split.amountMinor : -split.amountMinor;
          totals.set(split.categoryId, {
            amountMinor: Math.max(0, prev.amountMinor + delta),
            count: prev.count + 1,
          });
        }
      } else if (tx.categoryId) {
        const prev = totals.get(tx.categoryId) || { amountMinor: 0, count: 0 };
        const delta = tx.type === "EXPENSE" ? tx.amountMinor : -tx.amountMinor;
        totals.set(tx.categoryId, {
          amountMinor: Math.max(0, prev.amountMinor + delta),
          count: prev.count + 1,
        });
      }
    }

    const sum = Array.from(totals.values()).reduce(
      (acc, v) => acc + v.amountMinor,
      0,
    );

    return Array.from(totals.entries())
      .filter(([, val]) => val.amountMinor > 0)
      .sort((a, b) => b[1].amountMinor - a[1].amountMinor)
      .map(([catId, val]) => {
        const cat = categoryMap.get(catId);
        return {
          categoryId: catId,
          name: cat?.name || "Other",
          icon: cat?.icon || "Tag",
          color: cat?.color || "#6B7075",
          amountMinor: val.amountMinor,
          percentage:
            sum > 0
              ? Math.max(1, Math.round((val.amountMinor / sum) * 100))
              : 0,
          count: val.count,
        };
      });
  }, [monthTransactions, categoryMap]);

  // Undo delete
  const handleUndoDelete = useCallback(async () => {
    if (!deletedTx) return;
    try {
      await localRestoreTransaction(db, deletedTx);
      setDeletedTx(null);
    } catch (e) {
      console.error("Failed to restore transaction:", e);
    }
  }, [db, deletedTx]);

  // SMS viewer
  const openSmsModal = useCallback(async (tx: LocalTransaction) => {
    try {
      const res = await fetch(`/api/transactions/${tx.id}/raw-sms`);
      if (res.ok) {
        const data = await res.json();
        setActiveSmsModal(data.sms);
      } else {
        setActiveSmsModal({
          rawMessage: tx.note || "Raw SMS not available locally.",
          sender: "BANK",
          receivedAt: tx.transactionDate,
        });
      }
    } catch {
      setActiveSmsModal({
        rawMessage: tx.note || "Raw SMS not available locally.",
        sender: "BANK",
        receivedAt: tx.transactionDate,
      });
    }
  }, []);

  // Duplicate actions
  const mergeDuplicateTx = useCallback(
    async (txId: string) => {
      setActionLoadingId(txId);
      try {
        await fetch(`/api/transactions/${txId}/merge`, { method: "POST" });
        await sync();
      } finally {
        setActionLoadingId(null);
      }
    },
    [sync],
  );

  const dismissDuplicateTx = useCallback(
    async (txId: string) => {
      setActionLoadingId(txId);
      try {
        await fetch(`/api/transactions/${txId}/dismiss-duplicate`, {
          method: "POST",
        });
        await sync();
      } finally {
        setActionLoadingId(null);
      }
    },
    [sync],
  );

  const resetFilters = useCallback(() => {
    setFilters({
      searchQuery: "",
      accountId: "",
      categoryId: "",
      type: "",
      selectedDay: "",
    });
  }, []);

  const hasActiveFilters = Boolean(
    filters.searchQuery.trim() ||
    filters.accountId ||
    filters.categoryId ||
    filters.type ||
    filters.selectedDay,
  );

  return {
    // Dates
    currentDate,
    setCurrentDate,
    monthPrefix,
    monthLabel,
    shortMonthLabel,
    isCurrentMonth,
    prevMonth,
    nextMonth,
    goToCurrentMonth,

    // Transactions & Filters
    isLoading: monthTransactionsQuery.isLoading,
    monthTransactions,
    filteredTransactions,
    groupedByDay,
    filters,
    setFilters,
    resetFilters,
    hasActiveFilters,

    // Summaries & Analytics
    incomeMinor,
    expenseMinor,
    netMinor,
    adjustmentsMinor,
    categoryBreakdown,
    pendingInboxCount,

    // Accounts & Portfolio
    accounts,
    visibleAccounts: portfolio.visibleAccounts,
    cashAccounts: portfolio.cashAccounts,
    bankAccounts: portfolio.bankAccounts,
    creditAccounts: portfolio.creditAccounts,
    balanceFor: portfolio.balanceFor,
    netWorthTotal: portfolio.netWorthTotal,
    assetsTotal: portfolio.assetsTotal,
    liabilitiesTotal: portfolio.liabilitiesTotal,
    cashSubtotal: portfolio.cashSubtotal,
    bankSubtotal: portfolio.bankSubtotal,
    creditSubtotal: portfolio.creditSubtotal,

    // Reference Maps
    categories,
    categoryMap,
    accountMap,

    // Interactive Modals & Actions
    openQuickAdd,
    selectedTxForEdit,
    setSelectedTxForEdit,
    deletedTx,
    setDeletedTx,
    handleUndoDelete,
    activeSmsModal,
    setActiveSmsModal,
    openSmsModal,
    mergeDuplicateTx,
    dismissDuplicateTx,
    actionLoadingId,

    // Theme & Display
    resolvedTheme,
    toggleTheme,
    colorSwap,
    toggleColorSwap,
    mounted,
  };
}

export type HomeDashboardData = ReturnType<typeof useHomeDashboard>;
