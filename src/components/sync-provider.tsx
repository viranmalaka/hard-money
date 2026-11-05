"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LocalAccount,
  LocalBudget,
  LocalBudgetMonthSnapshot,
  LocalCategory,
  LocalCreditCardStatement,
  LocalInstallmentPlan,
  LocalTemplate,
  LocalTransaction,
} from "@/lib/db";
import { syncNow, SyncState } from "@/lib/sync/client";
import { queryKeys } from "@/lib/api/query-keys";
import { getSession } from "@/services/auth-service";
import { getAccounts, getCategories, getTemplates } from "@/services/user-service";
import { listTransactions } from "@/services/transaction-service";
import { warmReferenceDataCache, warmTemplatesCache } from "@/lib/offline/warmed-cache";
import { cleanupLegacyDexieDatabases } from "@/lib/offline/cleanup";
import { flushPendingTransactions, getPendingTransactions } from "@/lib/offline/transaction-queue";

interface SyncContextValue {
  db: any;
  syncState: SyncState;
  userId: string | null;
  sync: () => Promise<void>;
  pendingCount: number;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const EMPTY: never[] = [];

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("hardmoney_active_user");
    }
    return null;
  });
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof window !== "undefined" ? navigator.onLine : true;
  });
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Trigger one-time cleanup of legacy Dexie IndexedDB databases
  useEffect(() => {
    void cleanupLegacyDexieDatabases();
  }, []);

  const sessionQuery = useQuery({
    queryKey: queryKeys.session(),
    queryFn: getSession,
  });

  useEffect(() => {
    if (!sessionQuery.data) return;
    const nextUserId = sessionQuery.data.user?.id ?? null;
    if (nextUserId !== userId) {
      queryClient.removeQueries({
        predicate: ({ queryKey }) => queryKey[0] !== queryKeys.session()[0],
      });
    }
    setUserId(nextUserId);
    if (nextUserId) localStorage.setItem("hardmoney_active_user", nextUserId);
    else localStorage.removeItem("hardmoney_active_user");
  }, [queryClient, sessionQuery.data, userId]);

  // Online / Offline listeners, outbox monitoring & multi-device sync
  const updatePendingCount = useCallback(async () => {
    const queue = await getPendingTransactions();
    setPendingCount(queue.length);
  }, []);

  useEffect(() => {
    void updatePendingCount();

    const handleOnline = async () => {
      setIsOnline(true);
      await flushPendingTransactions();
      await updatePendingCount();
      void queryClient.invalidateQueries();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        await flushPendingTransactions();
        await updatePendingCount();
        void queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all() });
      }
    };

    const handleOutboxChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ count?: number }>;
      if (typeof customEvent.detail?.count === "number") {
        setPendingCount(customEvent.detail.count);
      } else {
        void updatePendingCount();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("hardmoney_outbox_change", handleOutboxChange);

    // Light background multi-device polling (every 40s when active)
    const interval = setInterval(async () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible" && navigator.onLine) {
        await flushPendingTransactions();
        await updatePendingCount();
        void queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all() });
      }
    }, 40_000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("hardmoney_outbox_change", handleOutboxChange);
      clearInterval(interval);
    };
  }, [queryClient, updatePendingCount]);

  const triggerSync = useCallback(async () => {
    await syncNow(null, () => {});
    await updatePendingCount();
  }, [updatePendingCount]);

  const syncState: SyncState = !isOnline ? "offline" : "idle";

  return (
    <SyncContext.Provider
      value={{
        db: null,
        syncState,
        userId,
        sync: triggerSync,
        pendingCount,
      }}
    >
      <div data-sync-state={syncState} className="contents">
        {children}
      </div>
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used within a SyncProvider");
  }
  return context;
}

// -------------------------------------------------------------
// Live Network Hooks with Reference Cache Warming
// -------------------------------------------------------------

export function useAccounts(): LocalAccount[] {
  const { userId } = useSync();
  const query = useQuery<LocalAccount[]>({
    queryKey: queryKeys.accounts.all(),
    queryFn: getAccounts,
    enabled: !!userId,
  });

  const accounts = query.data ?? (EMPTY as LocalAccount[]);

  useEffect(() => {
    if (accounts.length > 0) {
      warmReferenceDataCache(accounts, []);
    }
  }, [accounts]);

  return accounts;
}

export function useCategories(): LocalCategory[] {
  const { userId } = useSync();
  const query = useQuery<LocalCategory[]>({
    queryKey: queryKeys.categories.all(),
    queryFn: getCategories,
    enabled: !!userId,
  });

  const categories = query.data ?? (EMPTY as LocalCategory[]);

  useEffect(() => {
    if (categories.length > 0) {
      warmReferenceDataCache([], categories);
    }
  }, [categories]);

  return categories;
}

export function useTransactions(): LocalTransaction[] {
  const { userId } = useSync();
  const query = useQuery<LocalTransaction[]>({
    queryKey: queryKeys.transactions.all(),
    queryFn: () => listTransactions(),
    enabled: !!userId,
  });
  return query.data ?? (EMPTY as LocalTransaction[]);
}

export function useTemplates(): LocalTemplate[] {
  const { userId } = useSync();
  const query = useQuery<LocalTemplate[]>({
    queryKey: queryKeys.templates.all(),
    queryFn: getTemplates,
    enabled: !!userId,
  });

  const templates = query.data ?? (EMPTY as LocalTemplate[]);

  useEffect(() => {
    if (query.isSuccess) {
      warmTemplatesCache(templates);
    }
  }, [query.isSuccess, templates]);

  return templates;
}

export function useBudgets(): LocalBudget[] {
  return EMPTY as LocalBudget[];
}

export function useBudgetSnapshots(): LocalBudgetMonthSnapshot[] {
  return EMPTY as LocalBudgetMonthSnapshot[];
}

export function useCreditCardStatements(): LocalCreditCardStatement[] {
  return EMPTY as LocalCreditCardStatement[];
}

export function useInstallmentPlans(): LocalInstallmentPlan[] {
  return EMPTY as LocalInstallmentPlan[];
}

export function useFixedDeposits(): import("@/lib/db").LocalFixedDeposit[] {
  return EMPTY as import("@/lib/db").LocalFixedDeposit[];
}

export function useFixedDepositPayouts(): import("@/lib/db").LocalFixedDepositPayout[] {
  return EMPTY as import("@/lib/db").LocalFixedDepositPayout[];
}

export function useLoans(): import("@/lib/db").LocalLoan[] {
  return EMPTY as import("@/lib/db").LocalLoan[];
}

export function useLoanScheduleEntries(): import("@/lib/db").LocalLoanScheduleEntry[] {
  return EMPTY as import("@/lib/db").LocalLoanScheduleEntry[];
}

export function useLoanPayments(): import("@/lib/db").LocalLoanPayment[] {
  return EMPTY as import("@/lib/db").LocalLoanPayment[];
}

export function SyncIndicator({ isMobile }: { isMobile?: boolean }) {
  const { syncState, pendingCount, sync } = useSync();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await sync();
    } finally {
      setIsSyncing(false);
    }
  };

  if (syncState === "offline") {
    return (
      <div
        data-testid="sync-status-offline"
        title="Offline — viewing cached data"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-500/25"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        <span className="text-[11px]">Offline</span>
        {pendingCount > 0 && (
          <span className="ml-0.5 bg-amber-500/20 px-1 rounded text-[10px] font-bold">
            {pendingCount}
          </span>
        )}
      </div>
    );
  }

  if (pendingCount > 0 || isSyncing) {
    return (
      <button
        type="button"
        onClick={handleManualSync}
        data-testid="sync-status-pending"
        title="Pending sync — click to sync now"
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/25 cursor-pointer hover:bg-[var(--accent)]/18 transition-colors"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
        <span className="text-[11px] font-medium">
          {isSyncing ? "Syncing..." : `${pendingCount} queued`}
        </span>
      </button>
    );
  }

  return null;
}
