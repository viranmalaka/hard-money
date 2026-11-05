import { get, set } from "idb-keyval";
import { v4 as uuidv4 } from "uuid";
import { getQueryClient } from "@/components/query-provider";
import { queryKeys } from "@/lib/api/query-keys";

const OUTBOX_STORAGE_KEY = "hardmoney_outbox_queue_v2";

export type OutboxEntity =
  | "transaction"
  | "account"
  | "category"
  | "template"
  | "shoppingListItem";

export type OutboxOp = "CREATE" | "UPDATE" | "DELETE";

export interface OutboxMutationRecord {
  mutationId: string;
  entity: OutboxEntity;
  op: OutboxOp;
  id: string;
  payload: any;
  createdAt: string;
  retryCount: number;
  lastError?: string;
}

/**
 * Retrieves all pending outbox mutations from IndexedDB.
 */
export async function getOutboxMutations(): Promise<OutboxMutationRecord[]> {
  if (typeof window === "undefined") return [];
  try {
    const records = await get<OutboxMutationRecord[]>(OUTBOX_STORAGE_KEY);
    return Array.isArray(records) ? records : [];
  } catch (err) {
    console.error("Failed to read outbox mutations queue from IndexedDB:", err);
    return [];
  }
}

/**
 * Appends a mutation to the outbox queue in IndexedDB.
 */
export async function enqueueOutboxMutation(
  item: Omit<OutboxMutationRecord, "mutationId" | "createdAt" | "retryCount"> & {
    mutationId?: string;
    createdAt?: string;
  }
): Promise<OutboxMutationRecord> {
  const record: OutboxMutationRecord = {
    mutationId: item.mutationId || uuidv4(),
    entity: item.entity,
    op: item.op,
    id: item.id,
    payload: item.payload,
    createdAt: item.createdAt || new Date().toISOString(),
    retryCount: 0,
  };

  const current = await getOutboxMutations();
  const next = [...current.filter((m) => m.mutationId !== record.mutationId), record];
  await set(OUTBOX_STORAGE_KEY, next);

  // Notify listeners that outbox has changed
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("hardmoney_outbox_change", { detail: { count: next.length } }));
  }

  return record;
}

/**
 * Removes a mutation from the outbox queue.
 */
export async function removeOutboxMutation(mutationId: string): Promise<void> {
  const current = await getOutboxMutations();
  const next = current.filter((m) => m.mutationId !== mutationId);
  await set(OUTBOX_STORAGE_KEY, next);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("hardmoney_outbox_change", { detail: { count: next.length } }));
  }
}

/**
 * Clears the entire outbox queue.
 */
export async function clearOutboxMutations(): Promise<void> {
  await set(OUTBOX_STORAGE_KEY, []);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("hardmoney_outbox_change", { detail: { count: 0 } }));
  }
}

let isFlushing = false;

/**
 * Flushes all pending outbox mutations to the backend (/api/sync/push) in batch.
 */
export async function flushOutboxQueue(): Promise<{
  successCount: number;
  failedCount: number;
}> {
  if (typeof window === "undefined" || !navigator.onLine || isFlushing) {
    return { successCount: 0, failedCount: 0 };
  }

  const queue = await getOutboxMutations();
  if (queue.length === 0) return { successCount: 0, failedCount: 0 };

  isFlushing = true;
  let successCount = 0;
  let failedCount = 0;

  try {
    const payloadMutations = queue.map((item) => ({
      mutationId: item.mutationId,
      entity: item.entity,
      op: item.op,
      id: item.id,
      payload: item.payload,
      createdAt: item.createdAt,
    }));

    const res = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mutations: payloadMutations }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({ results: [] }));
      const results: Array<{ mutationId: string; status: "accepted" | "rejected"; reason?: string }> =
        data.results || [];

      const rejectedMap = new Map<string, string>();
      for (const r of results) {
        if (r.status === "rejected") {
          rejectedMap.set(r.mutationId, r.reason || "Rejected by server");
        }
      }

      // Remove accepted mutations from IndexedDB
      const remaining: OutboxMutationRecord[] = [];
      for (const item of queue) {
        const rejectionReason = rejectedMap.get(item.mutationId);
        if (rejectionReason) {
          // Keep with error or mark permanently failed
          item.retryCount += 1;
          item.lastError = rejectionReason;
          remaining.push(item);
          failedCount++;
        } else {
          successCount++;
        }
      }

      await set(OUTBOX_STORAGE_KEY, remaining);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("hardmoney_outbox_change", { detail: { count: remaining.length } })
        );
      }

      // Revalidate queries in background to reconcile server sequences
      const qc = getQueryClient();
      void qc.invalidateQueries({ queryKey: queryKeys.transactions.all() });
      void qc.invalidateQueries({ queryKey: queryKeys.accounts.all() });
      void qc.invalidateQueries({ queryKey: queryKeys.categories.all() });
    } else {
      failedCount += queue.length;
    }
  } catch (err) {
    console.warn("Outbox flush encountered a network error; will retry automatically:", err);
    failedCount += queue.length;
  } finally {
    isFlushing = false;
  }

  return { successCount, failedCount };
}

