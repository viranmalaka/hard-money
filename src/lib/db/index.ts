/**
 * Shared entity interfaces used across client components and services.
 * Offline-first Dexie stores have been replaced by standard API fetching.
 */

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
  serverSeq?: number;
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
  type?: "EXPENSE" | "INCOME";
  serverSeq?: number;
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
  serverSeq?: number;
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
  destinationAmountMinor?: number | null;
  exchangeRateMicros?: number | null;
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
  authorName?: string | null;
  serverSeq?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  isPendingSync?: boolean;
}

export interface LocalBudget {
  id: string;
  userId: string;
  categoryId: string;
  monthlyLimitMinor: number;
  enableRollover: boolean;
  rolloverStartMonth?: string | null;
  serverSeq?: number;
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
  serverSeq?: number;
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
  serverSeq?: number;
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
  serverSeq?: number;
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
  paidPeriods: number;
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
  serverSeq?: number;
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
  serverSeq?: number;
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
  paidInstallments: number;
  startDate: string;
  paymentDueDay: number;
  monthlyEmiAmountMinor: number;
  calculationType: "REDUCING_BALANCE" | "FLAT_RATE";
  linkedDisbursementAccountId?: string | null;
  status: "ACTIVE" | "CLOSED";
  closedAt?: string | null;
  serverSeq?: number;
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
  serverSeq?: number;
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
  serverSeq?: number;
  createdAt: string;
}

export interface LocalShoppingListItem {
  id: string;
  householdId: string;
  name: string;
  quantity?: string | null;
  isCompleted: boolean;
  position: number;
  completedAt?: string | null;
  serverSeq?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}
