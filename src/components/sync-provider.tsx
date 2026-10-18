"use client";

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { getDatabase, HardMoneyDB, LocalAccount, LocalCategory, LocalTemplate, LocalTransaction, OutboxMutation } from "@/lib/db";
import { syncNow, SyncState } from "@/lib/sync/client";
import { RefreshCw, WifiOff, AlertCircle, CheckCircle2 } from "lucide-react";

interface SyncContextValue {
  db: HardMoneyDB;
  syncState: SyncState;
  userId: string | null;
  sync: () => Promise<void>;
  pendingMutations: OutboxMutation[];
  failedMutations: OutboxMutation[];
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("hardmoney_active_user");
    }
    return null;
  });
  const [syncState, setSyncState] = useState<SyncState>("idle");

  // Fetch current user session to namespace Dexie database and refresh on route changes
  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.user && data.user.id) {
          setUserId(data.user.id);
          localStorage.setItem("hardmoney_active_user", data.user.id);
        } else if (data && !data.user) {
          setUserId(null);
          localStorage.removeItem("hardmoney_active_user");
        }
      })
      .catch(() => {
        // Retain cached active user on offline / aborted network calls
      });
  }, [pathname]);

  const db = useMemo(() => getDatabase(userId), [userId]);

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
  return useLiveQuery(() => db.accounts.filter((a) => !a.deletedAt).toArray(), [db]) || [];
}

export function useCategories(): LocalCategory[] {
  const { db } = useSync();
  return useLiveQuery(() => db.categories.filter((c) => !c.deletedAt).toArray(), [db]) || [];
}

export function useTransactions(): LocalTransaction[] {
  const { db } = useSync();
  return useLiveQuery(() => db.transactions.filter((t) => !t.deletedAt).toArray(), [db]) || [];
}

export function useTemplates(): LocalTemplate[] {
  const { db } = useSync();
  return useLiveQuery(() => db.templates.filter((tmpl) => !tmpl.deletedAt).toArray(), [db]) || [];
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
