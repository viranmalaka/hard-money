import { get, set } from "idb-keyval";
import type { LocalTransaction } from "@/lib/db";

const QUEUE_STORAGE_KEY = "hardmoney_offline_tx_queue";

export interface PendingTransactionRecord {
  tempId: string;
  payload: {
    accountId: string;
    toAccountId?: string | null;
    amountMinor: number;
    destinationAmountMinor?: number | null;
    exchangeRateMicros?: number | null;
    categoryId?: string | null;
    note?: string | null;
    type?: string;
    transactionDate?: string;
    isSplit?: boolean;
    splitItems?: Array<{ categoryId: string; amountMinor: number; note?: string | null }>;
  };
  optimisticTx: LocalTransaction;
  queuedAt: string;
  retryCount: number;
  lastError?: string;
}

export async function getPendingTransactions(): Promise<PendingTransactionRecord[]> {
  try {
    const records = await get<PendingTransactionRecord[]>(QUEUE_STORAGE_KEY);
    return Array.isArray(records) ? records : [];
  } catch (err) {
    console.error("Failed to read pending transactions queue:", err);
    return [];
  }
}

export async function enqueuePendingTransaction(record: PendingTransactionRecord): Promise<void> {
  const current = await getPendingTransactions();
  const next = [...current.filter((r) => r.tempId !== record.tempId), record];
  await set(QUEUE_STORAGE_KEY, next);
}

export async function removePendingTransaction(tempId: string): Promise<void> {
  const current = await getPendingTransactions();
  const next = current.filter((r) => r.tempId !== tempId);
  await set(QUEUE_STORAGE_KEY, next);
}

export async function clearAllPendingTransactions(): Promise<void> {
  await set(QUEUE_STORAGE_KEY, []);
}

export async function flushPendingTransactions(): Promise<{
  successCount: number;
  failedCount: number;
}> {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { successCount: 0, failedCount: 0 };
  }

  const queue = await getPendingTransactions();
  if (queue.length === 0) return { successCount: 0, failedCount: 0 };

  let successCount = 0;
  let failedCount = 0;

  for (const item of queue) {
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });

      if (res.ok) {
        await removePendingTransaction(item.tempId);
        successCount++;
      } else {
        item.retryCount += 1;
        const errData = await res.json().catch(() => ({}));
        item.lastError = errData.error || `HTTP ${res.status}`;
        await enqueuePendingTransaction(item);
        failedCount++;
      }
    } catch (err) {
      item.retryCount += 1;
      item.lastError = err instanceof Error ? err.message : "Network error";
      await enqueuePendingTransaction(item);
      failedCount++;
      break; // Network seems unavailable, stop batch to retry next time
    }
  }

  return { successCount, failedCount };
}
