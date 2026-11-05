import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/api/query-keys";
import {
  optimisticCreateTransaction,
  optimisticUpdateTransaction,
  optimisticDeleteTransaction,
} from "@/lib/sync/optimistic-mutations";
import {
  enqueueOutboxMutation,
  getOutboxMutations,
  removeOutboxMutation,
  clearOutboxMutations,
} from "@/lib/offline/outbox-queue";
import {
  restorePersistedQueryCache,
} from "@/lib/offline/query-persister";

// Mock idb-keyval in memory
const inMemoryStore = new Map<string, any>();
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => inMemoryStore.get(key)),
  set: vi.fn(async (key: string, val: any) => {
    inMemoryStore.set(key, val);
  }),
  del: vi.fn(async (key: string) => {
    inMemoryStore.delete(key);
  }),
}));

// Provide a mock QueryClient instance
let testQueryClient: QueryClient;
vi.mock("@/components/query-provider", () => ({
  getQueryClient: () => testQueryClient,
}));

describe("Optimistic Mutations & Offline Data Layer", () => {
  beforeEach(() => {
    inMemoryStore.clear();
    testQueryClient = new QueryClient();
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
    });
    vi.stubGlobal("navigator", {
      onLine: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  });

  it("optimistically creates an expense transaction across byMonth, all, and summary", async () => {
    const month = "2026-11";
    const accountId = "acc-wallet";

    // Seed query cache
    testQueryClient.setQueryData(queryKeys.accounts.all(), [
      { id: accountId, name: "Cash Wallet", openingBalanceMinor: 50000, balanceCacheMinor: 50000 },
    ]);
    testQueryClient.setQueryData(queryKeys.transactions.byMonth(month), []);
    testQueryClient.setQueryData(queryKeys.transactions.all(), []);
    testQueryClient.setQueryData(queryKeys.transactions.summary(month), {
      totalIncomeMinor: 0,
      totalExpenseMinor: 0,
      netSavingsMinor: 0,
      month,
      transactionCount: 0,
    });

    const tx = await optimisticCreateTransaction({
      userId: "u1",
      accountId,
      amountMinor: 2500,
      type: "EXPENSE",
      transactionDate: `${month}-05T12:00:00.000Z`,
      source: "MANUAL",
      createdByUserId: "u1",
      updatedByUserId: "u1",
      isSplit: false,
      excludeFromBudget: false,
      excludeFromStats: false,
      excludeFromBalance: false,
    });

    expect(tx.id).toBeDefined();
    expect(tx.isPendingSync).toBe(true);

    // 1. Check byMonth query
    const byMonthData: any = testQueryClient.getQueryData(queryKeys.transactions.byMonth(month));
    expect(byMonthData).toHaveLength(1);
    expect(byMonthData[0].id).toBe(tx.id);
    expect(byMonthData[0].amountMinor).toBe(2500);

    // 2. Check all query
    const allData: any = testQueryClient.getQueryData(queryKeys.transactions.all());
    expect(allData).toHaveLength(1);
    expect(allData[0].id).toBe(tx.id);

    // 3. Check summary query
    const summaryData: any = testQueryClient.getQueryData(queryKeys.transactions.summary(month));
    expect(summaryData.totalExpenseMinor).toBe(2500);
    expect(summaryData.netSavingsMinor).toBe(-2500);
    expect(summaryData.transactionCount).toBe(1);

    // 4. Check account balance
    const accountsData: any = testQueryClient.getQueryData(queryKeys.accounts.all());
    expect(accountsData[0].balanceCacheMinor).toBe(47500); // 50000 - 2500

    // 5. Check outbox queue
    const outbox = await getOutboxMutations();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].entity).toBe("transaction");
    expect(outbox[0].op).toBe("CREATE");
    expect(outbox[0].id).toBe(tx.id);
  });

  it("optimistically updates and deletes transactions cleanly", async () => {
    const month = "2026-11";
    const txId = "tx-sample-1";

    const initialTx = {
      id: txId,
      userId: "u1",
      accountId: "acc-1",
      amountMinor: 1000,
      type: "EXPENSE" as const,
      transactionDate: `${month}-01T10:00:00.000Z`,
      source: "MANUAL",
      createdByUserId: "u1",
      updatedByUserId: "u1",
      isSplit: false,
      excludeFromBudget: false,
      excludeFromStats: false,
      excludeFromBalance: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    testQueryClient.setQueryData(queryKeys.transactions.byMonth(month), [initialTx]);
    testQueryClient.setQueryData(queryKeys.transactions.all(), [initialTx]);
    testQueryClient.setQueryData(queryKeys.transactions.summary(month), {
      totalIncomeMinor: 0,
      totalExpenseMinor: 1000,
      netSavingsMinor: -1000,
      month,
      transactionCount: 1,
    });

    // Update note
    await optimisticUpdateTransaction(txId, { note: "Coffee with friend" }, initialTx);
    const byMonthUpdated: any = testQueryClient.getQueryData(queryKeys.transactions.byMonth(month));
    expect(byMonthUpdated[0].note).toBe("Coffee with friend");

    // Delete
    await optimisticDeleteTransaction(txId, initialTx);
    const byMonthAfterDelete: any = testQueryClient.getQueryData(queryKeys.transactions.byMonth(month));
    expect(byMonthAfterDelete).toHaveLength(0);

    const summaryAfterDelete: any = testQueryClient.getQueryData(queryKeys.transactions.summary(month));
    expect(summaryAfterDelete.totalExpenseMinor).toBe(0);
    expect(summaryAfterDelete.transactionCount).toBe(0);
  });

  it("handles outbox queue lifecycle: enqueue, get, remove, and clear", async () => {
    await clearOutboxMutations();
    expect(await getOutboxMutations()).toHaveLength(0);

    const mut1 = await enqueueOutboxMutation({
      mutationId: "m1",
      entity: "category",
      op: "CREATE",
      id: "cat-1",
      payload: { name: "Investments" },
    });

    const mut2 = await enqueueOutboxMutation({
      mutationId: "m2",
      entity: "account",
      op: "UPDATE",
      id: "acc-1",
      payload: { name: "Savings" },
    });

    let queue = await getOutboxMutations();
    expect(queue).toHaveLength(2);

    await removeOutboxMutation(mut1.mutationId);
    queue = await getOutboxMutations();
    expect(queue).toHaveLength(1);
    expect(queue[0].mutationId).toBe(mut2.mutationId);

    await clearOutboxMutations();
    expect(await getOutboxMutations()).toHaveLength(0);
  });

  it("restores valid cached query state and purges expired records", async () => {
    const expiredRecord = {
      version: "v2",
      timestamp: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days ago (expired)
      userId: "u123",
      clientState: { queries: [], mutations: [] },
    };
    inMemoryStore.set("hardmoney_rq_cache_u123", expiredRecord);

    const qc = new QueryClient();
    const restored = await restorePersistedQueryCache(qc, "u123");
    expect(restored).toBe(false);
    expect(inMemoryStore.has("hardmoney_rq_cache_u123")).toBe(false); // purged
  });
});
