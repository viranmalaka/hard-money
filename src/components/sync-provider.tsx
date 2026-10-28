"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getDatabase,
  HardMoneyDB,
  LocalAccount,
  LocalBudget,
  LocalBudgetMonthSnapshot,
  LocalCategory,
  LocalCreditCardStatement,
  LocalInstallmentPlan,
  LocalTemplate,
  LocalTransaction,
  OutboxMutation,
} from "@/lib/db";
import { syncNow, SyncState } from "@/lib/sync/client";
import { RefreshCw, WifiOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { queryKeys } from "@/lib/api/query-keys";
import { getSession } from "@/services/auth-service";
import { syncDbToQueryCache } from "@/lib/sync/cache-sync";

interface SyncContextValue {
  db: HardMoneyDB;
  syncState: SyncState;
  userId: string | null;
  sync: () => Promise<void>;
  pendingMutations: OutboxMutation[];
  failedMutations: OutboxMutation[];
}

const SyncContext = createContext<SyncContextValue | null>(null);

const EMPTY: never[] = [];

/**
 * Universal entity query hook backed by React Query's reactive cache.
 * Data is immediately returned from the persisted cache on frame 1 without delay.
 * Updates (optimistic and sync) propagate instantly across all pages and tabs.
 */
function useEntityQuery<T>(queryKey: readonly unknown[], querier: () => Promise<T[]>): T[] {
  const { userId } = useSync();
  const query = useQuery<T[]>({
    queryKey,
    queryFn: querier,
    enabled: !!userId,
    staleTime: Infinity,
  });
  return query.data ?? (EMPTY as T[]);
}

/** Pre-populate the React Query cache on startup so every screen is instant. */
async function warmLiveCache(db: HardMoneyDB) {
  await syncDbToQueryCache(db);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("hardmoney_active_user");
    }
    return null;
  });
  const [syncState, setSyncState] = useState<SyncState>("idle");

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
    queueMicrotask(() => {
      setUserId(nextUserId);
      if (nextUserId) localStorage.setItem("hardmoney_active_user", nextUserId);
      else localStorage.removeItem("hardmoney_active_user");
    });
  }, [queryClient, sessionQuery.data, userId]);

  const db = useMemo(() => getDatabase(userId), [userId]);

  useEffect(() => {
    void warmLiveCache(db);
  }, [db]);

  const liveOutbox = useLiveQuery(() => db.outbox.toArray(), [db]);
  const outboxMutations = useMemo(() => liveOutbox || [], [liveOutbox]);
  const pendingMutations = useMemo(
    () => outboxMutations.filter((m) => m.status === "pending"),
    [outboxMutations]
  );
  const failedMutations = useMemo(
    () => outboxMutations.filter((m) => m.status === "failed"),
    [outboxMutations]
  );

  const triggerSync = useCallback(async () => {
    await syncNow(db, (state) => setSyncState(state));
  }, [db]);

  // Initial sync & trigger on user session
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { __hardMoneyDb?: HardMoneyDB }).__hardMoneyDb = db;
      (window as unknown as { __hardMoneyTriggerSync?: () => Promise<void> }).__hardMoneyTriggerSync = triggerSync;
    }
    if (userId) {
      triggerSync();
    }
  }, [userId, triggerSync, db]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      triggerSync();
    };
    const handleOffline = () => {
      setSyncState("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [triggerSync]);

  // Trigger sync when pending outbox mutations are added
  useEffect(() => {
    if (pendingMutations.length > 0 && navigator.onLine) {
      triggerSync();
    }
  }, [pendingMutations.length, triggerSync]);

  // Periodic poll to drain pending mutations when online
  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingMutations.length > 0) {
        triggerSync();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pendingMutations.length, triggerSync]);

  // Effective sync state derived cleanly
  const effectiveSyncState: SyncState = useMemo(() => {
    if (syncState === "offline") return "offline";
    if (failedMutations.length > 0) return "error";
    return syncState;
  }, [syncState, failedMutations.length]);

  return (
    <SyncContext.Provider
      value={{
        db,
        syncState: effectiveSyncState,
        userId,
        sync: triggerSync,
        pendingMutations,
        failedMutations,
      }}
    >
      <div data-sync-state={effectiveSyncState} className="contents">
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

export function useAccounts(): LocalAccount[] {
  const { db } = useSync();
  return useEntityQuery(queryKeys.accounts.all(), () => db.accounts.filter((a) => !a.deletedAt).toArray());
}

export function useCategories(): LocalCategory[] {
  const { db } = useSync();
  return useEntityQuery(queryKeys.categories.all(), () => db.categories.filter((c) => !c.deletedAt).toArray());
}

export function useTransactions(): LocalTransaction[] {
  const { db } = useSync();
  return useEntityQuery(queryKeys.transactions.all(), () => db.transactions.filter((t) => !t.deletedAt).toArray());
}

export function useTemplates(): LocalTemplate[] {
  const { db } = useSync();
  return useEntityQuery(queryKeys.templates.all(), () => db.templates.filter((tmpl) => !tmpl.deletedAt).toArray());
}

export function useBudgets(): LocalBudget[] {
  const { db } = useSync();
  return useEntityQuery(queryKeys.budgets.all(), () => db.budgets.filter((b) => !b.deletedAt).toArray());
}

export function useBudgetSnapshots(): LocalBudgetMonthSnapshot[] {
  const { db } = useSync();
  return useEntityQuery(queryKeys.budgets.snapshots(), () => db.budgetSnapshots.toArray());
}

export function useCreditCardStatements(): LocalCreditCardStatement[] {
  const { db } = useSync();
  return useEntityQuery(queryKeys.creditCardStatements.all(), () => db.creditCardStatements.toArray());
}

export function useInstallmentPlans(): LocalInstallmentPlan[] {
  const { db } = useSync();
  return useEntityQuery(queryKeys.installmentPlans.all(), () => db.installmentPlans.filter((p) => !p.deletedAt).toArray());
}

export function useFixedDeposits(): import("@/lib/db").LocalFixedDeposit[] {
  const { db } = useSync();
  return useEntityQuery(queryKeys.fixedDeposits.all(), () => db.fixedDeposits.filter((fd) => !fd.deletedAt).toArray());
}

export function useFixedDepositPayouts(): import("@/lib/db").LocalFixedDepositPayout[] {
  const { db } = useSync();
  return useEntityQuery(queryKeys.fixedDeposits.payouts(), () => db.fixedDepositPayouts.toArray());
}

export function useLoans(): import("@/lib/db").LocalLoan[] {
  const { db } = useSync();
  return useEntityQuery(queryKeys.loans.all(), () => db.loans.filter((l) => !l.deletedAt).toArray());
}

export function useLoanScheduleEntries(): import("@/lib/db").LocalLoanScheduleEntry[] {
  const { db } = useSync();
  return useEntityQuery(queryKeys.loans.scheduleEntries(), () => db.loanScheduleEntries.toArray());
}

export function useLoanPayments(): import("@/lib/db").LocalLoanPayment[] {
  const { db } = useSync();
  return useEntityQuery(queryKeys.loans.payments(), () => db.loanPayments.toArray());
}

export function SyncIndicator({ isMobile }: { isMobile?: boolean }) {
  const { syncState, sync, failedMutations, pendingMutations } = useSync();

  return (
    <div
      data-testid={isMobile ? "sync-indicator-mobile" : "sync-indicator-desktop"}
      data-sync-state={syncState}
      onClick={() => sync()}
      className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded border border-hairline cursor-pointer select-none transition-colors"
      title={`Sync status: ${syncState}. Click to retry.`}
    >
      {syncState === "idle" && (
        <>
          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--income)]" />
          <span className="text-[var(--muted)]">Synced</span>
        </>
      )}

      {syncState === "syncing" && (
        <>
          <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
          <span className="text-blue-500">Syncing...</span>
        </>
      )}

      {syncState === "offline" && (
        <span data-testid="sync-offline-badge" className="inline-flex items-center gap-1 text-[var(--muted)]">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline{pendingMutations.length > 0 ? ` (${pendingMutations.length} pending)` : ""}</span>
        </span>
      )}

      {syncState === "error" && (
        <span
          data-testid="sync-error-badge"
          className="inline-flex items-center gap-1 text-red-500 font-medium"
        >
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Error ({failedMutations.length})</span>
        </span>
      )}
    </div>
  );
}
