import {
  dehydrate,
  hydrate,
  type QueryClient,
  type DehydratedState,
} from "@tanstack/react-query";
import { get, set, del } from "idb-keyval";

const CACHE_KEY_PREFIX = "hardmoney_rq_cache_";
const CACHE_VERSION = "v2";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

interface PersistedClientData {
  version: string;
  timestamp: number;
  userId: string | null;
  clientState: DehydratedState;
}

/**
 * Calculates current month prefix in YYYY-MM format.
 */
function getCurrentMonthPrefix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Predicate to decide which queries should be persisted to IndexedDB:
 * - Accounts & balances
 * - Categories
 * - Templates
 * - Transactions for current month
 * - Transaction summaries for current month
 */
function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return false;
  const first = String(queryKey[0]);
  const second = queryKey[1] ? String(queryKey[1]) : "";
  const third = queryKey[2] ? String(queryKey[2]) : "";

  // Accounts & Categories: ["user", "accounts"], ["user", "categories"]
  if (first === "user" && (second === "accounts" || second === "categories")) {
    return true;
  }

  // Templates: ["templates"]
  if (first === "templates") {
    return true;
  }

  // Transactions: ["transactions", "month", "YYYY-MM"] or ["transactions", "summary", "YYYY-MM"]
  if (first === "transactions") {
    const currentMonth = getCurrentMonthPrefix();
    if (second === "month" && (!third || third === currentMonth)) {
      return true;
    }
    if (second === "summary" && (!third || third === currentMonth || third === "all")) {
      return true;
    }
    // Also root transactions list if present
    if (queryKey.length === 1) {
      return true;
    }
  }

  return false;
}

/**
 * Restores the persisted query cache from IndexedDB for the given user.
 */
export async function restorePersistedQueryCache(
  queryClient: QueryClient,
  userId: string | null
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const key = `${CACHE_KEY_PREFIX}${userId || "anonymous"}`;
  try {
    const record = await get<PersistedClientData>(key);
    if (!record || record.version !== CACHE_VERSION) {
      return false;
    }

    // Expiration check (7 days)
    if (Date.now() - record.timestamp > MAX_AGE_MS) {
      await del(key);
      return false;
    }

    hydrate(queryClient, record.clientState);
    return true;
  } catch (err) {
    console.warn("Failed to restore persisted React Query cache from IndexedDB:", err);
    return false;
  }
}

/**
 * Subscribes to QueryClient changes and debounces writing the dehydrated state to IndexedDB.
 */
export function setupQueryCachePersistence(
  queryClient: QueryClient,
  getUserId: () => string | null
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  let saveTimer: NodeJS.Timeout | null = null;

  const performSave = async () => {
    try {
      const userId = getUserId();
      const key = `${CACHE_KEY_PREFIX}${userId || "anonymous"}`;

      const clientState = dehydrate(queryClient, {
        shouldDehydrateQuery: (query) => {
          if (query.state.status !== "success") return false;
          return shouldPersistQuery(query.queryKey);
        },
      });

      const record: PersistedClientData = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        userId,
        clientState,
      };

      await set(key, record);
    } catch (err) {
      console.warn("Failed to persist React Query cache to IndexedDB:", err);
    }
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    // Only trigger save on query updates or success
    if (
      event.type === "updated" ||
      event.type === "added" ||
      event.type === "removed"
    ) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        void performSave();
      }, 800);
    }
  });

  return () => {
    if (saveTimer) clearTimeout(saveTimer);
    unsubscribe();
  };
}

