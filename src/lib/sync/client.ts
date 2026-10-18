import { v4 as uuidv4 } from "uuid";
import {
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
} from "../db";

export type SyncState = "idle" | "syncing" | "offline" | "error";

export async function syncNow(
  db: HardMoneyDB,
  onStateChange: (state: SyncState) => void
): Promise<void> {
  onStateChange("syncing");

  // Step 1: Push pending mutations from outbox
  try {
    const pending = await db.outbox.where("status").equals("pending").toArray();
    if (pending.length > 0) {
      const res = await fetch("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mutations: pending }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          onStateChange("idle");
          return;
        }
        throw new Error(`Push HTTP error: ${res.status}`);
      }

      const data = await res.json();
      for (const result of data.results || []) {
        if (result.status === "accepted") {
          await db.outbox.delete(result.mutationId);
        } else {
          await db.outbox.update(result.mutationId, {
            status: "failed",
            errorReason: result.reason || "Rejected by server",
          });
        }
      }
    }
  } catch (err) {
    console.warn("Sync push failed:", err);
    onStateChange("offline");
    return;
  }

  // Step 2: Pull delta changes from server
  try {
    const cursorMeta = await db.syncMeta.get("cursor");
    const cursor = cursorMeta ? cursorMeta.value : 0;

    const res = await fetch(`/api/sync/pull?cursor=${cursor}`);
    if (!res.ok) {
      if (res.status === 401) {
        onStateChange("idle");
        return;
      }
      throw new Error(`Pull HTTP error: ${res.status}`);
    }

    const data = await res.json();

    await db.transaction(
      "rw",
      [
        db.accounts,
        db.categories,
        db.transactions,
        db.templates,
        db.budgets,
        db.budgetSnapshots,
        db.creditCardStatements,
        db.installmentPlans,
        db.syncMeta,
      ],
      async () => {
        // Accounts
        for (const a of data.accounts || []) {
          if (a.deletedAt) {
            await db.accounts.delete(a.id);
          } else {
            await db.accounts.put(a);
          }
        }
        // Categories
        for (const c of data.categories || []) {
          if (c.deletedAt) {
            await db.categories.delete(c.id);
          } else {
            await db.categories.put(c);
          }
        }
        // Transactions
        for (const t of data.transactions || []) {
          if (t.deletedAt) {
            await db.transactions.delete(t.id);
          } else {
            await db.transactions.put(t);
          }
        }
        // Templates
        for (const tmpl of data.templates || []) {
          if (tmpl.deletedAt) {
            await db.templates.delete(tmpl.id);
          } else {
            await db.templates.put(tmpl);
          }
        }
        // Budgets
        for (const b of data.budgets || []) {
          if (b.deletedAt) {
            await db.budgets.delete(b.id);
          } else {
            await db.budgets.put(b);
          }
        }
        // Budget Snapshots
        for (const bs of data.budgetSnapshots || []) {
          await db.budgetSnapshots.put(bs);
        }
        // Credit Card Statements
        for (const ccs of data.creditCardStatements || []) {
          await db.creditCardStatements.put(ccs);
        }
        // Installment Plans
        for (const plan of data.installmentPlans || []) {
          if (plan.deletedAt) {
            await db.installmentPlans.delete(plan.id);
          } else {
            await db.installmentPlans.put(plan);
          }
        }

        if (data.cursor !== undefined) {
          await db.syncMeta.put({ key: "cursor", value: data.cursor });
        }
        await db.syncMeta.put({ key: "lastSyncedAt", value: new Date().toISOString() });
      }
    );
  } catch (err) {
    console.warn("Sync pull failed:", err);
    onStateChange("offline");
    return;
  }

  // Check if any failed mutations exist
  const failedCount = await db.outbox.where("status").equals("failed").count();
  if (failedCount > 0) {
    onStateChange("error");
  } else {
    onStateChange("idle");
  }
}

// Local entity mutators that write to local store immediately and record outbox mutations

export async function localCreateAccount(
  db: HardMoneyDB,
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

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "account",
    op: "CREATE",
    id,
    payload: fullAccount,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.accounts, db.outbox], async () => {
    await db.accounts.put(fullAccount);
    await db.outbox.add(mutation);
  });

  return fullAccount;
}

export async function localUpdateAccount(
  db: HardMoneyDB,
  id: string,
  patch: Partial<LocalAccount>
): Promise<void> {
  const existing = await db.accounts.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "account",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.accounts, db.outbox], async () => {
    await db.accounts.put(updated);
    await db.outbox.add(mutation);
  });
}

export async function localDeleteAccount(db: HardMoneyDB, id: string): Promise<void> {
  const now = new Date().toISOString();
  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "account",
    op: "DELETE",
    id,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.accounts, db.outbox], async () => {
    await db.accounts.delete(id);
    await db.outbox.add(mutation);
  });
}

export async function localCreateCategory(
  db: HardMoneyDB,
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

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "category",
    op: "CREATE",
    id,
    payload: fullCategory,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.categories, db.outbox], async () => {
    await db.categories.put(fullCategory);
    await db.outbox.add(mutation);
  });

  return fullCategory;
}

export async function localUpdateCategory(
  db: HardMoneyDB,
  id: string,
  patch: Partial<LocalCategory>
): Promise<void> {
  const existing = await db.categories.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "category",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.categories, db.outbox], async () => {
    await db.categories.put(updated);
    await db.outbox.add(mutation);
  });
}

export async function localDeleteCategory(db: HardMoneyDB, id: string): Promise<void> {
  const now = new Date().toISOString();
  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "category",
    op: "DELETE",
    id,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.categories, db.outbox], async () => {
    await db.categories.delete(id);
    await db.outbox.add(mutation);
  });
}

export async function localCreateTransaction(
  db: HardMoneyDB,
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

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "transaction",
    op: "CREATE",
    id,
    payload: fullTx,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.transactions, db.outbox], async () => {
    await db.transactions.put(fullTx);
    await db.outbox.add(mutation);
  });

  return fullTx;
}

export async function localUpdateTransaction(
  db: HardMoneyDB,
  id: string,
  patch: Partial<LocalTransaction>
): Promise<void> {
  const existing = await db.transactions.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated: LocalTransaction = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "transaction",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.transactions, db.outbox], async () => {
    await db.transactions.put(updated);
    await db.outbox.add(mutation);
  });
}

export async function localDeleteTransaction(db: HardMoneyDB, id: string): Promise<void> {
  const existing = await db.transactions.get(id);
  const now = new Date().toISOString();

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "transaction",
    op: "DELETE",
    id,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.transactions, db.outbox], async () => {
    if (existing) {
      await db.transactions.delete(id);
    }
    await db.outbox.add(mutation);
  });
}

export async function localRestoreTransaction(db: HardMoneyDB, tx: LocalTransaction): Promise<void> {
  const now = new Date().toISOString();
  const restoredTx = { ...tx, deletedAt: null, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "transaction",
    op: "CREATE",
    id: tx.id,
    payload: restoredTx,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.transactions, db.outbox], async () => {
    await db.transactions.put(restoredTx);
    await db.outbox.add(mutation);
  });
}

export async function localCreateTemplate(
  db: HardMoneyDB,
  tmpl: Omit<LocalTemplate, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalTemplate> {
  const now = new Date().toISOString();
  const id = tmpl.id || uuidv4();
  const fullTmpl: LocalTemplate = {
    ...tmpl,
    id,
    serverSeq: 0,
    createdAt: now,
    updatedAt: now,
  };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "template",
    op: "CREATE",
    id,
    payload: fullTmpl,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.templates, db.outbox], async () => {
    await db.templates.put(fullTmpl);
    await db.outbox.add(mutation);
  });

  return fullTmpl;
}

export async function localUpdateTemplate(
  db: HardMoneyDB,
  id: string,
  patch: Partial<LocalTemplate>
): Promise<void> {
  const existing = await db.templates.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated: LocalTemplate = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "template",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.templates, db.outbox], async () => {
    await db.templates.put(updated);
    await db.outbox.add(mutation);
  });
}

export async function localDeleteTemplate(db: HardMoneyDB, id: string): Promise<void> {
  const now = new Date().toISOString();
  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "template",
    op: "DELETE",
    id,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.templates, db.outbox], async () => {
    await db.templates.delete(id);
    await db.outbox.add(mutation);
  });
}

export async function localCreateBudget(
  db: HardMoneyDB,
  budget: Omit<LocalBudget, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalBudget> {
  const now = new Date().toISOString();
  const id = budget.id || uuidv4();
  const fullBudget: LocalBudget = {
    ...budget,
    id,
    serverSeq: 0,
    createdAt: now,
    updatedAt: now,
  };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "budget",
    op: "CREATE",
    id,
    payload: {
      id,
      userId: budget.userId,
      categoryId: budget.categoryId,
      monthlyLimitMinor: budget.monthlyLimitMinor,
      enableRollover: budget.enableRollover ?? false,
      rolloverStartMonth: budget.rolloverStartMonth || null,
    },
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.budgets, db.outbox], async () => {
    await db.budgets.put(fullBudget);
    await db.outbox.add(mutation);
  });

  return fullBudget;
}

export async function localUpdateBudget(
  db: HardMoneyDB,
  id: string,
  patch: Partial<LocalBudget>
): Promise<void> {
  const existing = await db.budgets.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated: LocalBudget = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "budget",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.budgets, db.outbox], async () => {
    await db.budgets.put(updated);
    await db.outbox.add(mutation);
  });
}

export async function localDeleteBudget(db: HardMoneyDB, id: string): Promise<void> {
  const now = new Date().toISOString();
  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "budget",
    op: "DELETE",
    id,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.budgets, db.outbox], async () => {
    await db.budgets.delete(id);
    await db.outbox.add(mutation);
  });
}

export async function localCreateInstallmentPlan(
  db: HardMoneyDB,
  plan: Omit<LocalInstallmentPlan, "id" | "serverSeq" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<LocalInstallmentPlan> {
  const now = new Date().toISOString();
  const id = plan.id || uuidv4();
  const fullPlan: LocalInstallmentPlan = {
    ...plan,
    id,
    serverSeq: 0,
    createdAt: now,
    updatedAt: now,
  };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "installmentPlan",
    op: "CREATE",
    id,
    payload: fullPlan,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.installmentPlans, db.outbox], async () => {
    await db.installmentPlans.put(fullPlan);
    await db.outbox.add(mutation);
  });

  return fullPlan;
}

export async function localUpdateInstallmentPlan(
  db: HardMoneyDB,
  id: string,
  patch: Partial<LocalInstallmentPlan>
): Promise<void> {
  const existing = await db.installmentPlans.get(id);
  if (!existing) return;

  const now = new Date().toISOString();
  const updated: LocalInstallmentPlan = { ...existing, ...patch, updatedAt: now };

  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "installmentPlan",
    op: "UPDATE",
    id,
    payload: patch,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.installmentPlans, db.outbox], async () => {
    await db.installmentPlans.put(updated);
    await db.outbox.add(mutation);
  });
}

export async function localDeleteInstallmentPlan(db: HardMoneyDB, id: string): Promise<void> {
  const now = new Date().toISOString();
  const mutation: OutboxMutation = {
    mutationId: uuidv4(),
    entity: "installmentPlan",
    op: "DELETE",
    id,
    createdAt: now,
    status: "pending",
  };

  await db.transaction("rw", [db.installmentPlans, db.outbox], async () => {
    await db.installmentPlans.delete(id);
    await db.outbox.add(mutation);
  });
}


