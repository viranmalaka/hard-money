export interface BackupMetadata {
  version: 1;
  exportedAt: string;
  source: "hard-money";
  appVersion?: string;
}

export interface BackupUserData {
  name: string;
  email: string;
  defaultCurrency: string;
  timezone: string;
  countryCode: string | null;
  defaultWithholdingTaxRateBps: number;
  geminiApiKeyEncrypted: string | null;
  geminiModel: string | null;
  smsAutoPostMode: string;
  apiKeyHash: string | null;
  apiKeyPrefix: string | null;
  pushRemindersEnabled: boolean;
  dailyReminderTime: string;
}

export interface BackupHouseholdMember {
  id: string;
  householdId: string;
  userId: string;
  role: string;
  createdAt: string;
}

export interface BackupShoppingListItem {
  id: string;
  householdId: string;
  name: string;
  quantity: string | null;
  isCompleted: boolean;
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BackupHousehold {
  id: string;
  name: string;
  createdAt: string;
  members: BackupHouseholdMember[];
  shoppingListItems: BackupShoppingListItem[];
}

export interface BackupCategory {
  id: string;
  householdId: string | null;
  name: string;
  icon: string;
  color: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BackupAccount {
  id: string;
  householdId: string | null;
  name: string;
  type: string;
  openingBalanceMinor: number;
  balanceCacheMinor: number | null;
  currency: string;
  accountNumberLast4: string | null;
  bankSenderIds: string[];
  accessScope: string;
  feeRules: unknown;
  ownAtmFeeMinor: number | null;
  otherAtmFeeMinor: number | null;
  balanceMismatchHint: unknown;
  creditLimitMinor: number | null;
  statementCutoffDay: number | null;
  paymentDueDay: number | null;
  linkedSettlementAccountId: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BackupTransactionSplitItem {
  id: string;
  transactionId: string;
  categoryId: string;
  amountMinor: number;
  note: string | null;
}

export interface BackupTransaction {
  id: string;
  householdId: string | null;
  accountId: string;
  toAccountId: string | null;
  categoryId: string | null;
  amountMinor: number;
  destinationAmountMinor: number | null;
  exchangeRateMicros: number | null;
  direction: string | null;
  type: string;
  subType: string | null;
  source: string;
  createdByUserId?: string;
  updatedByUserId?: string;
  transactionDate: string;
  note: string | null;
  isSplit: boolean;
  excludeFromBudget: boolean;
  excludeFromStats: boolean;
  excludeFromBalance: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  reversalOfTransactionId: string | null;
  installmentPlanId: string | null;
  feeTransactionId: string | null;
  possibleDuplicateOfTransactionId: string | null;
  splitItems?: BackupTransactionSplitItem[];
}

export interface BackupTransactionTemplate {
  id: string;
  name: string;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  type: string;
  defaultAmountMinor: number | null;
  note: string | null;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BackupBudgetMonthSnapshot {
  id: string;
  budgetId: string;
  categoryId: string;
  month: string;
  limitMinor: number;
  spentMinor: number;
  carriedInMinor: number;
  carriedOutMinor: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackupBudget {
  id: string;
  categoryId: string;
  monthlyLimitMinor: number;
  enableRollover: boolean;
  rolloverStartMonth: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  snapshots?: BackupBudgetMonthSnapshot[];
}

export interface BackupCreditCardStatement {
  id: string;
  accountId: string;
  cycleStartDate: string;
  cycleCutoffDate: string;
  dueDate: string;
  billedDebtMinor: number;
  totalDebtMinor: number;
  isSettled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BackupCreditCardInstallmentPlan {
  id: string;
  accountId: string;
  categoryId: string | null;
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
  status: string;
  originalTransactionId: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BackupFixedDepositPayout {
  id: string;
  fixedDepositId: string;
  periodEnd: string;
  grossInterestMinor: number;
  taxWithheldMinor: number;
  netInterestMinor: number;
  transactionId: string | null;
  createdAt: string;
}

export interface BackupFixedDeposit {
  id: string;
  householdId: string | null;
  bankName: string;
  accountNumber: string | null;
  principalAmountMinor: number;
  annualInterestRateBps: number;
  tenureMonths: number;
  paidPeriods: number;
  startDate: string;
  maturityDate: string;
  compoundingFrequency: string;
  payoutMode: string;
  linkedPayoutAccountId: string | null;
  fundingAccountId: string | null;
  withholdingTaxRateBps: number;
  autoRenew: boolean;
  status: string;
  closedAt: string | null;
  prematureClosure: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  payouts?: BackupFixedDepositPayout[];
}

export interface BackupLoanScheduleEntry {
  id: string;
  loanId: string;
  installmentNumber: number;
  dueDate: string;
  principalComponentMinor: number;
  interestComponentMinor: number;
  openingBalanceMinor: number;
  closingBalanceMinor: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface BackupLoanPayment {
  id: string;
  loanId: string;
  transactionId: string | null;
  scheduleEntryId: string | null;
  principalComponentMinor: number;
  interestComponentMinor: number;
  isExtraPrincipal: boolean;
  paymentDate: string;
  createdAt: string;
}

export interface BackupLoan {
  id: string;
  householdId: string | null;
  kind: string;
  lenderName: string;
  originalPrincipalMinor: number;
  residualValueMinor: number | null;
  annualInterestRateBps: number;
  tenureMonths: number;
  paidInstallments: number;
  startDate: string;
  paymentDueDay: number;
  monthlyEmiAmountMinor: number;
  calculationType: string;
  linkedDisbursementAccountId: string | null;
  status: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  scheduleEntries?: BackupLoanScheduleEntry[];
  payments?: BackupLoanPayment[];
}

export interface BackupBankSms {
  id: string;
  dedupeKey: string;
  sender: string;
  rawMessage: string;
  receivedAt: string;
  status: string;
  parseMethod: string | null;
  parsedPayload: unknown;
  reviewReason: string | null;
  attempts: number;
  nextRetryAt: string | null;
  transactionId: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface HardMoneyBackupPayload extends BackupMetadata {
  user: BackupUserData;
  households: BackupHousehold[];
  categories: BackupCategory[];
  accounts: BackupAccount[];
  transactions: BackupTransaction[];
  templates: BackupTransactionTemplate[];
  budgets: BackupBudget[];
  creditCardStatements: BackupCreditCardStatement[];
  creditCardInstallmentPlans: BackupCreditCardInstallmentPlan[];
  fixedDeposits: BackupFixedDeposit[];
  loans: BackupLoan[];
  bankSmsList: BackupBankSms[];
}

export interface BackupEntityCounts {
  accounts: number;
  categories: number;
  transactions: number;
  templates: number;
  budgets: number;
  creditCardStatements: number;
  installmentPlans: number;
  fixedDeposits: number;
  loans: number;
  bankSms: number;
  households: number;
  shoppingListItems: number;
}

export function extractBackupCounts(payload: Partial<HardMoneyBackupPayload>): BackupEntityCounts {
  let shoppingListCount = 0;
  if (Array.isArray(payload.households)) {
    for (const h of payload.households) {
      if (Array.isArray(h.shoppingListItems)) {
        shoppingListCount += h.shoppingListItems.length;
      }
    }
  }

  return {
    accounts: Array.isArray(payload.accounts) ? payload.accounts.length : 0,
    categories: Array.isArray(payload.categories) ? payload.categories.length : 0,
    transactions: Array.isArray(payload.transactions) ? payload.transactions.length : 0,
    templates: Array.isArray(payload.templates) ? payload.templates.length : 0,
    budgets: Array.isArray(payload.budgets) ? payload.budgets.length : 0,
    creditCardStatements: Array.isArray(payload.creditCardStatements) ? payload.creditCardStatements.length : 0,
    installmentPlans: Array.isArray(payload.creditCardInstallmentPlans) ? payload.creditCardInstallmentPlans.length : 0,
    fixedDeposits: Array.isArray(payload.fixedDeposits) ? payload.fixedDeposits.length : 0,
    loans: Array.isArray(payload.loans) ? payload.loans.length : 0,
    bankSms: Array.isArray(payload.bankSmsList) ? payload.bankSmsList.length : 0,
    households: Array.isArray(payload.households) ? payload.households.length : 0,
    shoppingListItems: shoppingListCount,
  };
}

export interface ExportOptions {
  accounts?: boolean;
  transactions?: boolean;
  categories?: boolean;
  budgets?: boolean;
  fixedDeposits?: boolean;
  loans?: boolean;
  creditCards?: boolean;
  templates?: boolean;
  households?: boolean;
  bankSms?: boolean;
  settings?: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: Required<ExportOptions> = {
  accounts: true,
  transactions: true,
  categories: true,
  budgets: true,
  fixedDeposits: true,
  loans: true,
  creditCards: true,
  templates: true,
  households: true,
  bankSms: true,
  settings: true,
};

