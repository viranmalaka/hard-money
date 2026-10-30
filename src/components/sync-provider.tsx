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
import { getAccounts, getCategories } from "@/services/user-service";
import { listTransactions } from "@/services/transaction-service";
import { warmReferenceDataCache } from "@/lib/offline/warmed-cache";
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

  // Online / Offline listeners & pending queue monitoring
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
      queryClient.invalidateQueries();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic check to drain pending transactions when online
    const interval = setInterval(async () => {
      if (navigator.onLine) {
        await flushPendingTransactions();
        await updatePendingCount();
      }
    }, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
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
      {/* Top Banner when Offline */}
      {!isOnline && (
        <div
          data-testid="offline-banner"
          className="sticky top-0 z-50 w-full bg-amber-500/90 backdrop-blur-sm text-black text-xs font-medium py-1.5 px-4 text-center border-b border-amber-600/30 flex items-center justify-center gap-2"
        >
          <span>Offline mode — Showing cached reference data. Only transaction creation is available.</span>
          {pendingCount > 0 && (
            <span className="bg-black/10 px-1.5 py-0.5 rounded text-[10px] font-semibold">
              {pendingCount} queued
            </span>
          )}
        </div>
      )}
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
  return EMPTY as LocalTemplate[];
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
  // Sync indicators have been removed per user preference; return null
  return null;
}
