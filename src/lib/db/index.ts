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
  feeRules?: unknown;
  ownAtmFeeMinor?: number | null;
  otherAtmFeeMinor?: number | null;
  balanceMismatchHint?: { statedBalanceMinor: number; ledgerBalanceMinor: number; asOf: string } | null;
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

export interface LocalSplitItem {
  id: string;
  transactionId?: string;
  categoryId: string;
  amountMinor: number;
  note?: string | null;
}

export interface LocalTemplate {
  id: string;
  userId: string;
  name: string;
  accountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  defaultAmountMinor?: number | null;
  note?: string | null;
  icon?: string | null;
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
  splitItems?: LocalSplitItem[];
  reversalOfTransactionId?: string | null;
  excludeFromBudget: boolean;
  excludeFromStats: boolean;
  excludeFromBalance: boolean;
  installmentPlanId?: string | null;
  feeTransactionId?: string | null;
  possibleDuplicateOfTransactionId?: string | null;
  serverSeq: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface LocalBudget {
  id: string;
  userId: string;
  categoryId: string;
  monthlyLimitMinor: number;
  enableRollover: boolean;
  rolloverStartMonth?: string | null;
  serverSeq: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface LocalBudgetMonthSnapshot {
  id: string;
  userId: string;
  budgetId: string;
  categoryId: string;
  month: string;
  limitMinor: number;
  spentMinor: number;
  carriedInMinor: number;
  carriedOutMinor: number;
  serverSeq: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalCreditCardStatement {
  id: string;
  userId: string;
  accountId: string;
  cycleStartDate: string;
  cycleCutoffDate: string;
  dueDate: string;
  billedDebtMinor: number;
  totalDebtMinor: number;
  isSettled: boolean;
  serverSeq: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalInstallmentPlan {
  id: string;
  userId: string;
  accountId: string;
  categoryId?: string | null;
  merchantName: string;
  totalAmountMinor: number;
  tenureMonths: number;
  monthlyAmountMinor: number;
  finalInstallmentAmountMinor: number;
  initialPaidInstallments: number;
  processingFeeMinor: number;
  processingFeeBilled: boolean;
  startDate: string;
  firstStatementDate: string;
  isOngoingSetup: boolean;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  originalTransactionId?: string | null;
  note?: string | null;
  serverSeq: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface LocalFixedDeposit {
  id: string;
  userId: string;
  householdId?: string | null;
  bankName: string;
  accountNumber?: string | null;
  principalAmountMinor: number;
  annualInterestRateBps: number;
  tenureMonths: number;
  startDate: string;
  maturityDate: string;
  compoundingFrequency: "MONTHLY" | "QUARTERLY" | "ANNUALLY" | "AT_MATURITY";
  payoutMode: "REINVEST_COMPOUND" | "MONTHLY_PAYOUT_TO_ACCOUNT";
  linkedPayoutAccountId?: string | null;
  fundingAccountId?: string | null;
  withholdingTaxRateBps: number;
  autoRenew: boolean;
  status: "ACTIVE" | "MATURED" | "CLOSED";
  closedAt?: string | null;
  prematureClosure: boolean;
  serverSeq: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface LocalFixedDepositPayout {
  id: string;
  fixedDepositId: string;
  periodEnd: string;
  grossInterestMinor: number;
  taxWithheldMinor: number;
  netInterestMinor: number;
  transactionId?: string | null;
  serverSeq: number;
  createdAt: string;
}

export interface LocalLoan {
  id: string;
  userId: string;
  householdId?: string | null;
  kind: "LOAN" | "LEASE";
  lenderName: string;
  originalPrincipalMinor: number;
  residualValueMinor?: number | null;
  annualInterestRateBps: number;
  tenureMonths: number;
  startDate: string;
  monthlyEmiAmountMinor: number;
  calculationType: "REDUCING_BALANCE" | "FLAT_RATE";
  linkedDisbursementAccountId?: string | null;
  status: "ACTIVE" | "CLOSED";
  closedAt?: string | null;
  serverSeq: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface LocalLoanScheduleEntry {
  id: string;
  loanId: string;
  installmentNumber: number;
  dueDate: string;
  principalComponentMinor: number;
  interestComponentMinor: number;
  emiAmountMinor?: number;
  openingBalanceMinor: number;
  closingBalanceMinor: number;
  status: "SCHEDULED" | "PAID" | "OVERRIDDEN";
  serverSeq: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface LocalLoanPayment {
  id: string;
  loanId: string;
  transactionId?: string | null;
  scheduleEntryId?: string | null;
  principalComponentMinor: number;
  interestComponentMinor: number;
  isExtraPrincipal: boolean;
  paymentDate: string;
  serverSeq: number;
  createdAt: string;
}

export interface OutboxMutation {
  mutationId: string;
  entity:
    | "account"
    | "category"
    | "transaction"
    | "template"
    | "budget"
    | "statement"
    | "installmentPlan"
    | "fixedDeposit"
    | "loan"
    | "loanScheduleEntry"
    | "loanPayment";
  op: "CREATE" | "UPDATE" | "DELETE";
  id: string;
  payload?: unknown;
  createdAt: string;
  status: "pending" | "failed";
  errorReason?: string;
}

export interface SyncMeta {
  key: string;
  value: unknown;
}

export class HardMoneyDB extends Dexie {
  accounts!: Table<LocalAccount, string>;
  categories!: Table<LocalCategory, string>;
  transactions!: Table<LocalTransaction, string>;
  templates!: Table<LocalTemplate, string>;
  budgets!: Table<LocalBudget, string>;
  budgetSnapshots!: Table<LocalBudgetMonthSnapshot, string>;
  creditCardStatements!: Table<LocalCreditCardStatement, string>;
  installmentPlans!: Table<LocalInstallmentPlan, string>;
  fixedDeposits!: Table<LocalFixedDeposit, string>;
  fixedDepositPayouts!: Table<LocalFixedDepositPayout, string>;
  loans!: Table<LocalLoan, string>;
  loanScheduleEntries!: Table<LocalLoanScheduleEntry, string>;
  loanPayments!: Table<LocalLoanPayment, string>;
  outbox!: Table<OutboxMutation, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor(dbName: string) {
    super(dbName);

    // Version 1: initial schema
    this.version(1).stores({
      accounts: "id, userId, householdId, name, type, serverSeq, deletedAt, isArchived",
      categories: "id, userId, householdId, name, serverSeq, deletedAt",
      transactions: "id, userId, accountId, toAccountId, categoryId, transactionDate, serverSeq, deletedAt",
      templates: "id, userId, name, serverSeq, deletedAt",
      outbox: "mutationId, entity, op, id, status, createdAt",
      syncMeta: "key",
    });

    // Version 2: preserves data (migration test scaffold)
    this.version(2).upgrade(() => {
      // no schema changes required for v2, verifies upgrade pathway
    });

    // Version 3: budgets, snapshots, and credit card statements
    this.version(3).stores({
      accounts: "id, userId, householdId, name, type, serverSeq, deletedAt, isArchived",
      categories: "id, userId, householdId, name, serverSeq, deletedAt",
      transactions: "id, userId, accountId, toAccountId, categoryId, transactionDate, serverSeq, deletedAt",
      templates: "id, userId, name, serverSeq, deletedAt",
      budgets: "id, userId, categoryId, serverSeq, deletedAt",
      budgetSnapshots: "id, userId, categoryId, month, serverSeq",
      creditCardStatements: "id, userId, accountId, cycleCutoffDate, serverSeq",
      installmentPlans: "id, userId, accountId, status, serverSeq, deletedAt",
      outbox: "mutationId, entity, op, id, status, createdAt",
      syncMeta: "key",
    });

    // Version 4: fixed deposits and payouts
    this.version(4).stores({
      accounts: "id, userId, householdId, name, type, serverSeq, deletedAt, isArchived",
      categories: "id, userId, householdId, name, serverSeq, deletedAt",
      transactions: "id, userId, accountId, toAccountId, categoryId, transactionDate, serverSeq, deletedAt",
      templates: "id, userId, name, serverSeq, deletedAt",
      budgets: "id, userId, categoryId, serverSeq, deletedAt",
      budgetSnapshots: "id, userId, categoryId, month, serverSeq",
      creditCardStatements: "id, userId, accountId, cycleCutoffDate, serverSeq",
      installmentPlans: "id, userId, accountId, status, serverSeq, deletedAt",
      fixedDeposits: "id, userId, bankName, status, maturityDate, serverSeq, deletedAt",
      fixedDepositPayouts: "id, fixedDepositId, periodEnd, serverSeq",
      outbox: "mutationId, entity, op, id, status, createdAt",
      syncMeta: "key",
    });

    // Version 5: loans, schedule entries, and loan payments
    this.version(5).stores({
      accounts: "id, userId, householdId, name, type, serverSeq, deletedAt, isArchived",
      categories: "id, userId, householdId, name, serverSeq, deletedAt",
      transactions: "id, userId, accountId, toAccountId, categoryId, transactionDate, serverSeq, deletedAt",
      templates: "id, userId, name, serverSeq, deletedAt",
      budgets: "id, userId, categoryId, serverSeq, deletedAt",
      budgetSnapshots: "id, userId, categoryId, month, serverSeq",
      creditCardStatements: "id, userId, accountId, cycleCutoffDate, serverSeq",
      installmentPlans: "id, userId, accountId, status, serverSeq, deletedAt",
      fixedDeposits: "id, userId, bankName, status, maturityDate, serverSeq, deletedAt",
      fixedDepositPayouts: "id, fixedDepositId, periodEnd, serverSeq",
      loans: "id, userId, kind, status, serverSeq, deletedAt",
      loanScheduleEntries: "id, loanId, installmentNumber, status, dueDate, serverSeq, deletedAt",
      loanPayments: "id, loanId, transactionId, scheduleEntryId, paymentDate, serverSeq",
      outbox: "mutationId, entity, op, id, status, createdAt",
      syncMeta: "key",
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
