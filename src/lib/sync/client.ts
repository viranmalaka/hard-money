import { v4 as uuidv4 } from "uuid";
import { queryKeys } from "../api/query-keys";
import { getQueryClient } from "@/components/query-provider";
import type {
  LocalAccount,
  LocalCategory,
  LocalTransaction,
  LocalTemplate,
  LocalBudget,
  LocalInstallmentPlan,
  LocalFixedDeposit,
  LocalLoan,
  LocalShoppingListItem,
} from "../db";
import { enqueuePendingTransaction, flushPendingTransactions } from "../offline/transaction-queue";

/**
 * Universal optimistic mutation executor.
 * Dispatches the mutation to the backend via /api/sync/push, updates React Query cache immediately,
 * and falls back to offline queue if transaction creation fails while offline.
 */
async function pushSingleMutation(
  entity: string,
  op: "CREATE" | "UPDATE" | "DELETE",
  id: string,
  payload: unknown,
  queryKeyToInvalidate?: readonly unknown[]
): Promise<void> {
  const mutation = {
    mutationId: uuidv4(),
    entity,
    op,
    id,
    payload,
    createdAt: new Date().toISOString(),
  };

  try {
    const res = await fetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mutations: [mutation] }),
    });

    if (!res.ok) {
      throw new Error(`Push failed with HTTP ${res.status}`);
    }
  } catch (err) {
    // If it's a transaction creation and network failed, store in offline queue
    if (entity === "transaction" && op === "CREATE") {
      const fullTx = payload as LocalTransaction;
      await enqueuePendingTransaction({
        tempId: id,
        payload: {
          accountId: fullTx.accountId,
          toAccountId: fullTx.toAccountId,
          amountMinor: fullTx.amountMinor,
          destinationAmountMinor: fullTx.destinationAmountMinor,
          exchangeRateMicros: fullTx.exchangeRateMicros,
          categoryId: fullTx.categoryId,
          note: fullTx.note,
          type: fullTx.type,
          transactionDate: fullTx.transactionDate,
          isSplit: fullTx.isSplit,
          splitItems: fullTx.splitItems?.map((s) => ({
            categoryId: s.categoryId,
            amountMinor: s.amountMinor,
            note: s.note,
          })),
        },
        optimisticTx: fullTx,
        queuedAt: new Date().toISOString(),
        retryCount: 0,
      });
      return;
    }
    throw err;
  } finally {
    if (queryKeyToInvalidate) {
      const qc = getQueryClient();
      qc.invalidateQueries({ queryKey: queryKeyToInvalidate });
    }
  }
}

// -------------------------------------------------------------
// Accounts
// -------------------------------------------------------------

export async function localCreateAccount(
  _db: any,
  account: Omit<LocalAccount, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalAccount> {
  const now = new Date().toISOString();
  const id = account.id || uuidv4();
  const fullAccount: LocalAccount = {
    ...account,
    id,
    serverSeq: 0,
    createdAt: now,
    updatedAt: now,
  };

  const qc = getQueryClient();
  qc.setQueryData<LocalAccount[]>(queryKeys.accounts.all(), (old = []) => [fullAccount, ...old]);

  await pushSingleMutation("account", "CREATE", id, fullAccount, queryKeys.accounts.all());
  return fullAccount;
}

export async function localUpdateAccount(
  _db: any,
  id: string,
  patch: Partial<LocalAccount>
): Promise<void> {
  const qc = getQueryClient();
  qc.setQueryData<LocalAccount[]>(queryKeys.accounts.all(), (old = []) =>
    old.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a))
  );

  await pushSingleMutation("account", "UPDATE", id, patch, queryKeys.accounts.all());
}

export async function localDeleteAccount(_db: any, id: string): Promise<void> {
  const qc = getQueryClient();
  qc.setQueryData<LocalAccount[]>(queryKeys.accounts.all(), (old = []) =>
    old.filter((a) => a.id !== id)
  );

  await pushSingleMutation("account", "DELETE", id, { id }, queryKeys.accounts.all());
}

// -------------------------------------------------------------
// Categories
// -------------------------------------------------------------

export async function localCreateCategory(
  _db: any,
  category: Omit<LocalCategory, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalCategory> {
  const now = new Date().toISOString();
  const id = category.id || uuidv4();
  const fullCategory: LocalCategory = {
    ...category,
    id,
    serverSeq: 0,
    createdAt: now,
    updatedAt: now,
  };

  const qc = getQueryClient();
  qc.setQueryData<LocalCategory[]>(queryKeys.categories.all(), (old = []) => [fullCategory, ...old]);

  await pushSingleMutation("category", "CREATE", id, fullCategory, queryKeys.categories.all());
  return fullCategory;
}

export async function localUpdateCategory(
  _db: any,
  id: string,
  patch: Partial<LocalCategory>
): Promise<void> {
  const qc = getQueryClient();
  qc.setQueryData<LocalCategory[]>(queryKeys.categories.all(), (old = []) =>
    old.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c))
  );

  await pushSingleMutation("category", "UPDATE", id, patch, queryKeys.categories.all());
}

export async function localDeleteCategory(_db: any, id: string): Promise<void> {
  const qc = getQueryClient();
  qc.setQueryData<LocalCategory[]>(queryKeys.categories.all(), (old = []) =>
    old.filter((c) => c.id !== id)
  );

  await pushSingleMutation("category", "DELETE", id, { id }, queryKeys.categories.all());
}

// -------------------------------------------------------------
// Transactions
// -------------------------------------------------------------

export async function localCreateTransaction(
  _db: any,
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
  };

  const qc = getQueryClient();
  qc.setQueryData<LocalTransaction[]>(queryKeys.transactions.all(), (old = []) => [fullTx, ...old]);

  if (typeof window !== "undefined" && !navigator.onLine) {
    // Save to offline queue directly
    await enqueuePendingTransaction({
      tempId: id,
      payload: {
        accountId: fullTx.accountId,
        toAccountId: fullTx.toAccountId,
        amountMinor: fullTx.amountMinor,
        destinationAmountMinor: fullTx.destinationAmountMinor,
        exchangeRateMicros: fullTx.exchangeRateMicros,
        categoryId: fullTx.categoryId,
        note: fullTx.note,
        type: fullTx.type,
        transactionDate: fullTx.transactionDate,
        isSplit: fullTx.isSplit,
        splitItems: fullTx.splitItems?.map((s) => ({
          categoryId: s.categoryId,
          amountMinor: s.amountMinor,
          note: s.note,
        })),
      },
      optimisticTx: fullTx,
      queuedAt: now,
      retryCount: 0,
    });
    return fullTx;
  }

  await pushSingleMutation("transaction", "CREATE", id, fullTx, queryKeys.transactions.all());
  return fullTx;
}

export async function localUpdateTransaction(
  _db: any,
  id: string,
  patch: Partial<LocalTransaction>
): Promise<void> {
  const qc = getQueryClient();
  qc.setQueryData<LocalTransaction[]>(queryKeys.transactions.all(), (old = []) =>
    old.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t))
  );

  await pushSingleMutation("transaction", "UPDATE", id, patch, queryKeys.transactions.all());
}

export async function localDeleteTransaction(_db: any, id: string): Promise<void> {
  const qc = getQueryClient();
  qc.setQueryData<LocalTransaction[]>(queryKeys.transactions.all(), (old = []) =>
    old.filter((t) => t.id !== id)
  );

  await pushSingleMutation("transaction", "DELETE", id, { id }, queryKeys.transactions.all());
}

export async function localRestoreTransaction(_db: any, tx: LocalTransaction): Promise<void> {
  const restoredTx = { ...tx, deletedAt: null, updatedAt: new Date().toISOString() };
  const qc = getQueryClient();
  qc.setQueryData<LocalTransaction[]>(queryKeys.transactions.all(), (old = []) => [restoredTx, ...old]);

  await pushSingleMutation("transaction", "CREATE", tx.id, restoredTx, queryKeys.transactions.all());
}

// -------------------------------------------------------------
// Templates
// -------------------------------------------------------------

export async function localCreateTemplate(
  _db: any,
  tmpl: Omit<LocalTemplate, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalTemplate> {
  const now = new Date().toISOString();
  const id = tmpl.id || uuidv4();
  const fullTmpl: LocalTemplate = { ...tmpl, id, serverSeq: 0, createdAt: now, updatedAt: now };

  const qc = getQueryClient();
  qc.setQueryData<LocalTemplate[]>(queryKeys.templates.all(), (old = []) => [fullTmpl, ...old]);

  await pushSingleMutation("template", "CREATE", id, fullTmpl, queryKeys.templates.all());
  return fullTmpl;
}

export async function localUpdateTemplate(
  _db: any,
  id: string,
  patch: Partial<LocalTemplate>
): Promise<void> {
  const qc = getQueryClient();
  qc.setQueryData<LocalTemplate[]>(queryKeys.templates.all(), (old = []) =>
    old.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t))
  );

  await pushSingleMutation("template", "UPDATE", id, patch, queryKeys.templates.all());
}

export async function localDeleteTemplate(_db: any, id: string): Promise<void> {
  const qc = getQueryClient();
  qc.setQueryData<LocalTemplate[]>(queryKeys.templates.all(), (old = []) =>
    old.filter((t) => t.id !== id)
  );

  await pushSingleMutation("template", "DELETE", id, { id }, queryKeys.templates.all());
}

// -------------------------------------------------------------
// Budgets
// -------------------------------------------------------------

export async function localCreateBudget(
  _db: any,
  b: Omit<LocalBudget, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalBudget> {
  const now = new Date().toISOString();
  const id = b.id || uuidv4();
  const fullBudget: LocalBudget = { ...b, id, serverSeq: 0, createdAt: now, updatedAt: now };

  const qc = getQueryClient();
  qc.setQueryData<LocalBudget[]>(queryKeys.budgets.all(), (old = []) => [fullBudget, ...old]);

  await pushSingleMutation("budget", "CREATE", id, fullBudget, queryKeys.budgets.all());
  return fullBudget;
}

export async function localUpdateBudget(
  _db: any,
  id: string,
  patch: Partial<LocalBudget>
): Promise<void> {
  const qc = getQueryClient();
  qc.setQueryData<LocalBudget[]>(queryKeys.budgets.all(), (old = []) =>
    old.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b))
  );

  await pushSingleMutation("budget", "UPDATE", id, patch, queryKeys.budgets.all());
}

export async function localDeleteBudget(_db: any, id: string): Promise<void> {
  const qc = getQueryClient();
  qc.setQueryData<LocalBudget[]>(queryKeys.budgets.all(), (old = []) =>
    old.filter((b) => b.id !== id)
  );

  await pushSingleMutation("budget", "DELETE", id, { id }, queryKeys.budgets.all());
}

// -------------------------------------------------------------
// Installment Plans & Fixed Deposits & Loans & Shopping
// -------------------------------------------------------------

export async function localCreateInstallmentPlan(
  _db: any,
  p: Omit<LocalInstallmentPlan, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalInstallmentPlan> {
  const now = new Date().toISOString();
  const id = p.id || uuidv4();
  const fullPlan: LocalInstallmentPlan = { ...p, id, serverSeq: 0, createdAt: now, updatedAt: now };

  const qc = getQueryClient();
  qc.setQueryData<LocalInstallmentPlan[]>(queryKeys.installmentPlans.all(), (old = []) => [fullPlan, ...old]);

  await pushSingleMutation("installmentPlan", "CREATE", id, fullPlan, queryKeys.installmentPlans.all());
  return fullPlan;
}

export async function localUpdateInstallmentPlan(
  _db: any,
  id: string,
  patch: Partial<LocalInstallmentPlan>
): Promise<void> {
  const qc = getQueryClient();
  qc.setQueryData<LocalInstallmentPlan[]>(queryKeys.installmentPlans.all(), (old = []) =>
    old.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p))
  );

  await pushSingleMutation("installmentPlan", "UPDATE", id, patch, queryKeys.installmentPlans.all());
}

export async function localDeleteInstallmentPlan(_db: any, id: string): Promise<void> {
  const qc = getQueryClient();
  qc.setQueryData<LocalInstallmentPlan[]>(queryKeys.installmentPlans.all(), (old = []) =>
    old.filter((p) => p.id !== id)
  );

  await pushSingleMutation("installmentPlan", "DELETE", id, { id }, queryKeys.installmentPlans.all());
}

export async function localCreateFixedDeposit(
  _db: any,
  fd: Omit<LocalFixedDeposit, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalFixedDeposit> {
  const now = new Date().toISOString();
  const id = fd.id || uuidv4();
  const fullFd: LocalFixedDeposit = { ...fd, id, serverSeq: 0, createdAt: now, updatedAt: now };

  const qc = getQueryClient();
  qc.setQueryData<LocalFixedDeposit[]>(queryKeys.fixedDeposits.all(), (old = []) => [fullFd, ...old]);

  await pushSingleMutation("fixedDeposit", "CREATE", id, fullFd, queryKeys.fixedDeposits.all());
  return fullFd;
}

export async function localUpdateFixedDeposit(
  _db: any,
  id: string,
  patch: Partial<LocalFixedDeposit>
): Promise<void> {
  const qc = getQueryClient();
  qc.setQueryData<LocalFixedDeposit[]>(queryKeys.fixedDeposits.all(), (old = []) =>
    old.map((f) => (f.id === id ? { ...f, ...patch, updatedAt: new Date().toISOString() } : f))
  );

  await pushSingleMutation("fixedDeposit", "UPDATE", id, patch, queryKeys.fixedDeposits.all());
}

export async function localDeleteLoan(_db: any, id: string): Promise<void> {
  const qc = getQueryClient();
  qc.setQueryData<LocalLoan[]>(queryKeys.loans.all(), (old = []) =>
    old.filter((l) => l.id !== id)
  );

  await pushSingleMutation("loan", "DELETE", id, { id }, queryKeys.loans.all());
}

export async function localCreateShoppingListItem(
  _db: any,
  item: Omit<LocalShoppingListItem, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalShoppingListItem> {
  const now = new Date().toISOString();
  const id = item.id || uuidv4();
  const fullItem: LocalShoppingListItem = { ...item, id, serverSeq: 0, createdAt: now, updatedAt: now };

  await pushSingleMutation("shoppingListItem", "CREATE", id, fullItem);
  return fullItem;
}

export async function localUpdateShoppingListItem(
  _db: any,
  id: string,
  patch: Partial<LocalShoppingListItem>
): Promise<void> {
  await pushSingleMutation("shoppingListItem", "UPDATE", id, patch);
}

export async function localDeleteShoppingListItem(_db: any, id: string): Promise<void> {
  await pushSingleMutation("shoppingListItem", "DELETE", id, { id });
}

// -------------------------------------------------------------
// Legacy syncNow wrapper (for backward compatibility)
// -------------------------------------------------------------

export type SyncState = "idle" | "syncing" | "offline" | "error";

export async function syncNow(
  _db?: any,
  onStateChange?: (state: SyncState) => void
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!navigator.onLine) {
    onStateChange?.("offline");
    return;
  }

  onStateChange?.("syncing");
  try {
    const { failedCount } = await flushPendingTransactions();
    const qc = getQueryClient();
    await qc.invalidateQueries();

    if (failedCount > 0) {
      onStateChange?.("error");
    } else {
      onStateChange?.("idle");
    }
  } catch {
    onStateChange?.("error");
  }
}
