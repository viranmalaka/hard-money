import { v4 as uuidv4 } from "uuid";
import {
  HardMoneyDB,
  LocalAccount,
  LocalCategory,
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

    await db.transaction("rw", [db.accounts, db.categories, db.transactions, db.templates, db.syncMeta], async () => {
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
      if (data.cursor !== undefined) {
        await db.syncMeta.put({ key: "cursor", value: data.cursor });
      }
      await db.syncMeta.put({ key: "lastSyncedAt", value: new Date().toISOString() });
    });
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
