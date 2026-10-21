import Dexie, { type EntityTable } from "dexie";
import { LedgerAccount, LedgerTransaction } from "../finance-core";

export interface OutboxMutation {
  mutationId: string;
  entity: string;
  op: "CREATE" | "UPDATE" | "DELETE";
  id: string;
  payload: unknown;
  createdAt: string;
  status: "PENDING" | "SYNCED" | "FAILED";
  error?: string;
}

export interface ClientSyncMeta {
  key: string;
  cursor: number;
  lastSyncedAt?: string;
  schemaVersion: number;
}

export interface ClientCategory {
  id: string;
  userId?: string | null;
  householdId?: string | null;
  name: string;
  icon: string;
  color: string;
  type?: "EXPENSE" | "INCOME";
  deletedAt?: string | null;
}

export interface ClientTemplate {
  id: string;
  userId: string;
  name: string;
  accountId?: string | null;
  categoryId?: string | null;
  defaultAmountMinor?: number | null;
  note?: string | null;
  icon?: string | null;
  deletedAt?: string | null;
}

export interface ClientBudget {
  id: string;
  userId?: string | null;
  householdId?: string | null;
  categoryId: string;
  monthlyLimitMinor: number;
  enableRollover: boolean;
  rolloverStartMonth?: string | null;
  deletedAt?: string | null;
}

export interface ClientInstallmentPlan {
  id: string;
  accountId: string;
  userId: string;
  categoryId?: string | null;
  merchantName: string;
  totalAmountMinor: number;
  tenureMonths: number;
  monthlyAmountMinor: number;
  finalInstallmentAmountMinor: number;
  initialPaidInstallments: number;
  processingFeeMinor: number;
  startDate: string;
  firstStatementDate: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  note?: string | null;
  deletedAt?: string | null;
}

export interface ClientFixedDeposit {
  id: string;
  userId: string;
  bankName: string;
  accountNumber: string;
  principalAmountMinor: number;
  annualInterestRateBps: number;
  tenureMonths: number;
  startDate: string;
  maturityDate: string;
  compoundingFrequency: "MONTHLY" | "QUARTERLY" | "ANNUALLY" | "AT_MATURITY";
  payoutMode: "REINVEST_COMPOUND" | "MONTHLY_PAYOUT_TO_ACCOUNT";
  linkedPayoutAccountId?: string | null;
  withholdingTaxRateBps: number;
  status: "ACTIVE" | "MATURED" | "CLOSED";
  deletedAt?: string | null;
}

export interface ClientLoan {
  id: string;
  userId: string;
  kind: "LOAN" | "LEASE";
  lenderName: string;
  originalPrincipalMinor: number;
  annualInterestRateBps: number;
  tenureMonths: number;
  startDate: string;
  monthlyEmiAmountMinor: number;
  calculationType: "REDUCING_BALANCE" | "FLAT_RATE";
  status: "ACTIVE" | "CLOSED";
  deletedAt?: string | null;
}

export interface ClientAccount extends LedgerAccount {
  name: string;
  currency: string;
  accountNumberLast4?: string | null;
  creditLimitMinor?: number | null;
  statementCutoffDay?: number | null;
  paymentDueDay?: number | null;
  linkedSettlementAccountId?: string | null;
  deletedAt?: string | null;
}

export interface ClientTransaction extends LedgerTransaction {
  subType?: string | null;
  source: "MANUAL" | "SMS" | "SYSTEM" | "CALIBRATION";
  note?: string | null;
  categoryId?: string | null;
  isSplit?: boolean;
  feeTransactionId?: string | null;
  installmentPlanId?: string | null;
  fixedDepositId?: string | null;
  loanId?: string | null;
}

// Dexie database instance
export class HardMoneyDatabase extends Dexie {
  accounts!: EntityTable<ClientAccount, "id">;
  transactions!: EntityTable<ClientTransaction, "id">;
  categories!: EntityTable<ClientCategory, "id">;
  templates!: EntityTable<ClientTemplate, "id">;
  budgets!: EntityTable<ClientBudget, "id">;
  installmentPlans!: EntityTable<ClientInstallmentPlan, "id">;
  fixedDeposits!: EntityTable<ClientFixedDeposit, "id">;
  loans!: EntityTable<ClientLoan, "id">;
  outbox!: EntityTable<OutboxMutation, "mutationId">;
  syncMeta!: EntityTable<ClientSyncMeta, "key">;

  constructor(userId = "default") {
    super(`hardmoney-${userId}`);

    this.version(1).stores({
      accounts: "id, type, name, deletedAt",
      transactions: "id, accountId, toAccountId, categoryId, type, transactionDate, deletedAt, [accountId+transactionDate]",
      categories: "id, name, deletedAt",
      templates: "id, name, accountId, categoryId",
      budgets: "id, categoryId, deletedAt",
      installmentPlans: "id, accountId, status, deletedAt",
      fixedDeposits: "id, status, deletedAt",
      loans: "id, status, deletedAt",
      outbox: "mutationId, entity, op, status, createdAt",
      syncMeta: "key",
    });
  }
}

// Global db instance
export let db = typeof window !== "undefined" ? new HardMoneyDatabase() : ({} as HardMoneyDatabase);

export function getDb(userId?: string): HardMoneyDatabase {
  if (typeof window === "undefined") {
    return {} as HardMoneyDatabase;
  }
  if (!db || (userId && db.name !== `hardmoney-${userId}`)) {
    db = new HardMoneyDatabase(userId || "default");
  }
  return db;
}
