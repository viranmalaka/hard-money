import Dexie, { type Table } from "dexie";

export interface LocalAccount {
  id: string;
  userId: string;
  householdId?: string | null;
  name: string;
  type: "CASH" | "BANK_SAVINGS" | "CREDIT_CARD";
  openingBalanceMinor: number;
  balanceCacheMinor?: number | null;
  currency: string;
  accountNumberLast4?: string | null;
  bankSenderIds: string[];
  accessScope: "PRIVATE" | "SHARED_HOUSEHOLD";
  feeRules?: any;
  creditLimitMinor?: number | null;
  statementCutoffDay?: number | null;
  paymentDueDay?: number | null;
  linkedSettlementAccountId?: string | null;
  isArchived: boolean;
  serverSeq: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface LocalCategory {
  id: string;
  userId?: string | null;
  householdId?: string | null;
  name: string;
  icon: string;
  color: string;
  serverSeq: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface LocalTransaction {
  id: string;
  userId: string;
  householdId?: string | null;
  accountId: string;
  toAccountId?: string | null;
  categoryId?: string | null;
  amountMinor: number;
  direction?: "IN" | "OUT" | null;
  type: "EXPENSE" | "INCOME" | "TRANSFER" | "REFUND" | "ADJUSTMENT";
  subType?: string | null;
  source: string;
  createdByUserId: string;
  updatedByUserId: string;
  transactionDate: string;
  note?: string | null;
  isSplit: boolean;
  excludeFromBudget: boolean;
  excludeFromStats: boolean;
  excludeFromBalance: boolean;
  serverSeq: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface OutboxMutation {
  mutationId: string;
  entity: "account" | "category" | "transaction";
  op: "CREATE" | "UPDATE" | "DELETE";
  id: string;
  payload?: any;
  createdAt: string;
  status: "pending" | "failed";
  errorReason?: string;
}

export interface SyncMeta {
  key: string;
  value: any;
}

export class HardMoneyDB extends Dexie {
  accounts!: Table<LocalAccount, string>;
  categories!: Table<LocalCategory, string>;
  transactions!: Table<LocalTransaction, string>;
  outbox!: Table<OutboxMutation, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor(dbName: string) {
    super(dbName);

    // Version 1: initial schema
    this.version(1).stores({
      accounts: "id, userId, householdId, name, type, serverSeq, deletedAt, isArchived",
      categories: "id, userId, householdId, name, serverSeq, deletedAt",
      transactions: "id, userId, accountId, toAccountId, categoryId, transactionDate, serverSeq, deletedAt",
      outbox: "mutationId, entity, op, id, status, createdAt",
      syncMeta: "key",
    });

    // Version 2: preserves data (migration test scaffold)
    this.version(2).upgrade(() => {
      // no schema changes required for v2, verifies upgrade pathway
    });
  }
}

// User-scoped database instances cache
const dbCache = new Map<string, HardMoneyDB>();

export function getDatabase(userId?: string | null): HardMoneyDB {
  const name = userId ? `hardmoney_${userId}` : "hardmoney_anonymous";
  let db = dbCache.get(name);
  if (!db) {
    db = new HardMoneyDB(name);
    dbCache.set(name, db);
  }
  return db;
}
