import {
  getOutboxMutations,
  enqueueOutboxMutation,
  removeOutboxMutation,
  clearOutboxMutations,
  flushOutboxQueue,
  type OutboxMutationRecord,
} from "./outbox-queue";
import type { LocalTransaction } from "@/lib/db";

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

/**
 * Bridges legacy getPendingTransactions to read from unified Outbox queue.
 */
export async function getPendingTransactions(): Promise<PendingTransactionRecord[]> {
  const mutations = await getOutboxMutations();
  const txMutations = mutations.filter((m) => m.entity === "transaction" && m.op === "CREATE");

  return txMutations.map((m) => ({
    tempId: m.id,
    payload: m.payload,
    optimisticTx: (m.payload as LocalTransaction) || {
      id: m.id,
      userId: "",
      accountId: m.payload.accountId,
      amountMinor: m.payload.amountMinor,
      type: m.payload.type || "EXPENSE",
      source: "MANUAL",
      createdByUserId: "",
      updatedByUserId: "",
      transactionDate: m.payload.transactionDate || new Date().toISOString(),
      isSplit: false,
      excludeFromBudget: false,
      excludeFromStats: false,
      excludeFromBalance: false,
      createdAt: m.createdAt,
      updatedAt: m.createdAt,
    },
    queuedAt: m.createdAt,
    retryCount: m.retryCount,
    lastError: m.lastError,
  }));
}

export async function enqueuePendingTransaction(record: PendingTransactionRecord): Promise<void> {
  await enqueueOutboxMutation({
    mutationId: record.tempId,
    entity: "transaction",
    op: "CREATE",
    id: record.tempId,
    payload: record.optimisticTx || record.payload,
    createdAt: record.queuedAt,
  });
}

export async function removePendingTransaction(tempId: string): Promise<void> {
  await removeOutboxMutation(tempId);
}

export async function clearAllPendingTransactions(): Promise<void> {
  await clearOutboxMutations();
}

export async function flushPendingTransactions(): Promise<{
  successCount: number;
  failedCount: number;
}> {
  return flushOutboxQueue();
}
