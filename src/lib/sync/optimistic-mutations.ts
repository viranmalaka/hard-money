import { v4 as uuidv4 } from "uuid";
import { getQueryClient } from "@/components/query-provider";
import { queryKeys } from "@/lib/api/query-keys";
import type { LocalAccount, LocalTransaction } from "@/lib/db";
import type { TransactionSummaryData } from "@/services/transaction-service";
import { enqueueOutboxMutation, flushOutboxQueue } from "@/lib/offline/outbox-queue";

/**
 * Extracts YYYY-MM from an ISO date string or Date object.
 */
function getMonthKey(dateStr?: string): string {
  if (!dateStr) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return dateStr.substring(0, 7);
}

/**
 * Optimistically creates a transaction:
 * - Immediately prepends to `transactions.byMonth(month)`
 * - Immediately updates `transactions.summary(month)`
 * - Immediately prepends to `transactions.all()` (for ledger balance calculations)
 * - Enqueues mutation into IndexedDB outbox
 * - Triggers background flush to `/api/sync/push`
 * - Returns in 0ms without waiting for network!
 */
export async function optimisticCreateTransaction(
  tx: Omit<LocalTransaction, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalTransaction> {
  const now = new Date().toISOString();
  const id = tx.id || uuidv4();
  const fullTx: LocalTransaction = {
    ...tx,
    id,
    serverSeq: 0,
    createdAt: now,
    updatedAt: now,
    isPendingSync: true,
  };

  const monthKey = getMonthKey(fullTx.transactionDate);
  const qc = getQueryClient();

  // 1. Update Month Transactions list
  qc.setQueryData<LocalTransaction[]>(queryKeys.transactions.byMonth(monthKey), (old = []) => {
    // Avoid duplicates if already present
    const filtered = old.filter((t) => t.id !== id);
    return [fullTx, ...filtered];
  });

  // 2. Update Transactions All (used for live account ledger balance)
  qc.setQueryData<LocalTransaction[]>(queryKeys.transactions.all(), (old = []) => {
    const filtered = old.filter((t) => t.id !== id);
    return [fullTx, ...filtered];
  });

  // 3. Update Month Summary data
  qc.setQueryData<TransactionSummaryData>(queryKeys.transactions.summary(monthKey), (old) => {
    if (!old) {
      return {
        totalIncomeMinor: fullTx.type === "INCOME" ? fullTx.amountMinor : 0,
        totalExpenseMinor: fullTx.type === "EXPENSE" ? fullTx.amountMinor : 0,
        netSavingsMinor:
          fullTx.type === "INCOME"
            ? fullTx.amountMinor
            : fullTx.type === "EXPENSE"
            ? -fullTx.amountMinor
            : 0,
        month: monthKey,
        transactionCount: 1,
      };
    }

    const incomeDelta = fullTx.type === "INCOME" ? fullTx.amountMinor : 0;
    const expenseDelta = fullTx.type === "EXPENSE" ? fullTx.amountMinor : 0;
    const newIncome = old.totalIncomeMinor + incomeDelta;
    const newExpense = old.totalExpenseMinor + expenseDelta;

    return {
      ...old,
      totalIncomeMinor: newIncome,
      totalExpenseMinor: newExpense,
      netSavingsMinor: newIncome - newExpense,
      transactionCount: old.transactionCount + 1,
    };
  });

  // 4. Update Account Opening/Cache balances if applicable
  qc.setQueryData<LocalAccount[]>(queryKeys.accounts.all(), (old = []) => {
    return old.map((acc) => {
      if (acc.id === fullTx.accountId) {
        const delta =
          fullTx.type === "INCOME"
            ? fullTx.amountMinor
            : fullTx.type === "EXPENSE" || fullTx.type === "TRANSFER"
            ? -fullTx.amountMinor
            : 0;
        const currentBal = acc.balanceCacheMinor ?? acc.openingBalanceMinor;
        return { ...acc, balanceCacheMinor: currentBal + delta };
      }
      if (fullTx.type === "TRANSFER" && fullTx.toAccountId && acc.id === fullTx.toAccountId) {
        const destAmount = fullTx.destinationAmountMinor ?? fullTx.amountMinor;
        const currentBal = acc.balanceCacheMinor ?? acc.openingBalanceMinor;
        return { ...acc, balanceCacheMinor: currentBal + destAmount };
      }
      return acc;
    });
  });

  // 5. Enqueue into IndexedDB Outbox
  await enqueueOutboxMutation({
    entity: "transaction",
    op: "CREATE",
    id,
    payload: fullTx,
  });

  // 6. Trigger non-blocking async network drain
  void flushOutboxQueue();

  return fullTx;
}

/**
 * Optimistically updates a transaction.
 */
export async function optimisticUpdateTransaction(
  id: string,
  patch: Partial<LocalTransaction>,
  previousTx?: LocalTransaction
): Promise<void> {
  const qc = getQueryClient();
  const now = new Date().toISOString();

  // Find existing transaction to get month key
  let targetMonth = getMonthKey(previousTx?.transactionDate || patch.transactionDate);

  // Update in All
  qc.setQueryData<LocalTransaction[]>(queryKeys.transactions.all(), (old = []) => {
    return old.map((t) => {
      if (t.id === id) {
        targetMonth = getMonthKey(t.transactionDate);
        return { ...t, ...patch, updatedAt: now };
      }
      return t;
    });
  });

  // Update in byMonth
  qc.setQueryData<LocalTransaction[]>(queryKeys.transactions.byMonth(targetMonth), (old = []) => {
    return old.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: now } : t));
  });

  // Enqueue outbox mutation
  await enqueueOutboxMutation({
    entity: "transaction",
    op: "UPDATE",
    id,
    payload: patch,
  });

  void flushOutboxQueue();
}

/**
 * Optimistically deletes a transaction.
 */
export async function optimisticDeleteTransaction(
  id: string,
  existingTx?: LocalTransaction
): Promise<void> {
  const qc = getQueryClient();
  let targetMonth = getMonthKey(existingTx?.transactionDate);

  // Remove from All
  qc.setQueryData<LocalTransaction[]>(queryKeys.transactions.all(), (old = []) => {
    const found = old.find((t) => t.id === id);
    if (found) targetMonth = getMonthKey(found.transactionDate);
    return old.filter((t) => t.id !== id);
  });

  // Remove from byMonth
  qc.setQueryData<LocalTransaction[]>(queryKeys.transactions.byMonth(targetMonth), (old = []) => {
    return old.filter((t) => t.id !== id);
  });

  // Adjust Month Summary if existingTx is known
  if (existingTx) {
    qc.setQueryData<TransactionSummaryData>(queryKeys.transactions.summary(targetMonth), (old) => {
      if (!old) return old;
      const incomeDelta = existingTx.type === "INCOME" ? existingTx.amountMinor : 0;
      const expenseDelta = existingTx.type === "EXPENSE" ? existingTx.amountMinor : 0;
      const newIncome = Math.max(0, old.totalIncomeMinor - incomeDelta);
      const newExpense = Math.max(0, old.totalExpenseMinor - expenseDelta);
      return {
        ...old,
        totalIncomeMinor: newIncome,
        totalExpenseMinor: newExpense,
        netSavingsMinor: newIncome - newExpense,
        transactionCount: Math.max(0, old.transactionCount - 1),
      };
    });
  }

  // Enqueue outbox mutation
  await enqueueOutboxMutation({
    entity: "transaction",
    op: "DELETE",
    id,
    payload: { id },
  });

  void flushOutboxQueue();
}

