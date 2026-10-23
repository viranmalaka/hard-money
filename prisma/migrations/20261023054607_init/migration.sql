-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'LKR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Colombo',
    "countryCode" TEXT,
    "defaultWithholdingTaxRateBps" INTEGER NOT NULL DEFAULT 0,
    "apiKeyHash" TEXT,
    "apiKeyPrefix" TEXT,
    "geminiApiKeyEncrypted" TEXT,
    "geminiModel" TEXT,
    "smsAutoPostMode" TEXT NOT NULL DEFAULT 'AUTO_VALIDATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "pushRemindersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailyReminderTime" TEXT NOT NULL DEFAULT '20:00',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMember" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HouseholdMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShoppingListItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ShoppingListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "householdId" TEXT,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'Tag',
    "color" TEXT NOT NULL DEFAULT '#6B7075',
    "type" TEXT NOT NULL DEFAULT 'EXPENSE',
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "openingBalanceMinor" INTEGER NOT NULL DEFAULT 0,
    "balanceCacheMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "accountNumberLast4" TEXT,
    "bankSenderIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessScope" TEXT NOT NULL DEFAULT 'PRIVATE',
    "feeRules" JSONB,
    "ownAtmFeeMinor" INTEGER DEFAULT 0,
    "otherAtmFeeMinor" INTEGER DEFAULT 0,
    "balanceMismatchHint" JSONB,
    "creditLimitMinor" INTEGER,
    "statementCutoffDay" INTEGER,
    "paymentDueDay" INTEGER,
    "linkedSettlementAccountId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT,
    "accountId" TEXT NOT NULL,
    "toAccountId" TEXT,
    "categoryId" TEXT,
    "amountMinor" INTEGER NOT NULL,
    "direction" TEXT,
    "type" TEXT NOT NULL,
    "subType" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "isSplit" BOOLEAN NOT NULL DEFAULT false,
    "excludeFromBudget" BOOLEAN NOT NULL DEFAULT false,
    "excludeFromStats" BOOLEAN NOT NULL DEFAULT false,
    "excludeFromBalance" BOOLEAN NOT NULL DEFAULT false,
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "reversalOfTransactionId" TEXT,
    "installmentPlanId" TEXT,
    "feeTransactionId" TEXT,
    "possibleDuplicateOfTransactionId" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountId" TEXT,
    "toAccountId" TEXT,
    "categoryId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'EXPENSE',
    "defaultAmountMinor" INTEGER,
    "note" TEXT,
    "icon" TEXT,
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TransactionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionSplitItem" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "TransactionSplitItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppliedMutation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppliedMutation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncSequence" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "seq" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "SyncSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "monthlyLimitMinor" INTEGER NOT NULL,
    "enableRollover" BOOLEAN NOT NULL DEFAULT false,
    "rolloverStartMonth" TEXT,
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetMonthSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "limitMinor" INTEGER NOT NULL,
    "spentMinor" INTEGER NOT NULL,
    "carriedInMinor" INTEGER NOT NULL DEFAULT 0,
    "carriedOutMinor" INTEGER NOT NULL DEFAULT 0,
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetMonthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCardStatement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "cycleStartDate" TIMESTAMP(3) NOT NULL,
    "cycleCutoffDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "billedDebtMinor" INTEGER NOT NULL,
    "totalDebtMinor" INTEGER NOT NULL,
    "isSettled" BOOLEAN NOT NULL DEFAULT false,
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCardStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCardInstallmentPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "merchantName" TEXT NOT NULL,
    "totalAmountMinor" INTEGER NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "monthlyAmountMinor" INTEGER NOT NULL,
    "finalInstallmentAmountMinor" INTEGER NOT NULL,
    "initialPaidInstallments" INTEGER NOT NULL DEFAULT 0,
    "processingFeeMinor" INTEGER NOT NULL DEFAULT 0,
    "processingFeeBilled" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3) NOT NULL,
    "firstStatementDate" TIMESTAMP(3) NOT NULL,
    "isOngoingSetup" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "originalTransactionId" TEXT,
    "note" TEXT,
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CreditCardInstallmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankSms" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "rawMessage" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "parseMethod" TEXT,
    "parsedPayload" JSONB,
    "reviewReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankSms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedDeposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT,
    "principalAmountMinor" INTEGER NOT NULL,
    "annualInterestRateBps" INTEGER NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "maturityDate" TIMESTAMP(3) NOT NULL,
    "compoundingFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "payoutMode" TEXT NOT NULL DEFAULT 'MONTHLY_PAYOUT_TO_ACCOUNT',
    "linkedPayoutAccountId" TEXT,
    "fundingAccountId" TEXT,
    "withholdingTaxRateBps" INTEGER NOT NULL DEFAULT 0,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "closedAt" TIMESTAMP(3),
    "prematureClosure" BOOLEAN NOT NULL DEFAULT false,
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FixedDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedDepositPayout" (
    "id" TEXT NOT NULL,
    "fixedDepositId" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "grossInterestMinor" INTEGER NOT NULL,
    "taxWithheldMinor" INTEGER NOT NULL,
    "netInterestMinor" INTEGER NOT NULL,
    "transactionId" TEXT,
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedDepositPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'LOAN',
    "lenderName" TEXT NOT NULL,
    "originalPrincipalMinor" INTEGER NOT NULL,
    "residualValueMinor" INTEGER DEFAULT 0,
    "annualInterestRateBps" INTEGER NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "monthlyEmiAmountMinor" INTEGER NOT NULL,
    "calculationType" TEXT NOT NULL DEFAULT 'REDUCING_BALANCE',
    "linkedDisbursementAccountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "closedAt" TIMESTAMP(3),
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanScheduleEntry" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "installmentNumber" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "principalComponentMinor" INTEGER NOT NULL,
    "interestComponentMinor" INTEGER NOT NULL,
    "openingBalanceMinor" INTEGER NOT NULL,
    "closingBalanceMinor" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LoanScheduleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanPayment" (
    "id" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "transactionId" TEXT,
    "scheduleEntryId" TEXT,
    "principalComponentMinor" INTEGER NOT NULL,
    "interestComponentMinor" INTEGER NOT NULL,
    "isExtraPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMember_householdId_userId_key" ON "HouseholdMember"("householdId", "userId");

-- CreateIndex
CREATE INDEX "ShoppingListItem_householdId_idx" ON "ShoppingListItem"("householdId");

-- CreateIndex
CREATE INDEX "ShoppingListItem_serverSeq_idx" ON "ShoppingListItem"("serverSeq");

-- CreateIndex
CREATE INDEX "ShoppingListItem_householdId_isCompleted_position_idx" ON "ShoppingListItem"("householdId", "isCompleted", "position");

-- CreateIndex
CREATE INDEX "Category_userId_idx" ON "Category"("userId");

-- CreateIndex
CREATE INDEX "Category_serverSeq_idx" ON "Category"("serverSeq");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Account_householdId_idx" ON "Account"("householdId");

-- CreateIndex
CREATE INDEX "Account_serverSeq_idx" ON "Account"("serverSeq");

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- CreateIndex
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");

-- CreateIndex
CREATE INDEX "Transaction_installmentPlanId_idx" ON "Transaction"("installmentPlanId");

-- CreateIndex
CREATE INDEX "Transaction_transactionDate_idx" ON "Transaction"("transactionDate");

-- CreateIndex
CREATE INDEX "Transaction_serverSeq_idx" ON "Transaction"("serverSeq");

-- CreateIndex
CREATE INDEX "TransactionTemplate_userId_idx" ON "TransactionTemplate"("userId");

-- CreateIndex
CREATE INDEX "TransactionTemplate_serverSeq_idx" ON "TransactionTemplate"("serverSeq");

-- CreateIndex
CREATE INDEX "TransactionSplitItem_transactionId_idx" ON "TransactionSplitItem"("transactionId");

-- CreateIndex
CREATE INDEX "AppliedMutation_userId_idx" ON "AppliedMutation"("userId");

-- CreateIndex
CREATE INDEX "Budget_userId_idx" ON "Budget"("userId");

-- CreateIndex
CREATE INDEX "Budget_serverSeq_idx" ON "Budget"("serverSeq");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_userId_categoryId_key" ON "Budget"("userId", "categoryId");

-- CreateIndex
CREATE INDEX "BudgetMonthSnapshot_userId_idx" ON "BudgetMonthSnapshot"("userId");

-- CreateIndex
CREATE INDEX "BudgetMonthSnapshot_budgetId_idx" ON "BudgetMonthSnapshot"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetMonthSnapshot_userId_categoryId_month_key" ON "BudgetMonthSnapshot"("userId", "categoryId", "month");

-- CreateIndex
CREATE INDEX "CreditCardStatement_userId_idx" ON "CreditCardStatement"("userId");

-- CreateIndex
CREATE INDEX "CreditCardStatement_accountId_idx" ON "CreditCardStatement"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCardStatement_accountId_cycleCutoffDate_key" ON "CreditCardStatement"("accountId", "cycleCutoffDate");

-- CreateIndex
CREATE INDEX "CreditCardInstallmentPlan_userId_idx" ON "CreditCardInstallmentPlan"("userId");

-- CreateIndex
CREATE INDEX "CreditCardInstallmentPlan_accountId_idx" ON "CreditCardInstallmentPlan"("accountId");

-- CreateIndex
CREATE INDEX "CreditCardInstallmentPlan_serverSeq_idx" ON "CreditCardInstallmentPlan"("serverSeq");

-- CreateIndex
CREATE UNIQUE INDEX "BankSms_dedupeKey_key" ON "BankSms"("dedupeKey");

-- CreateIndex
CREATE INDEX "BankSms_userId_idx" ON "BankSms"("userId");

-- CreateIndex
CREATE INDEX "BankSms_status_idx" ON "BankSms"("status");

-- CreateIndex
CREATE INDEX "BankSms_transactionId_idx" ON "BankSms"("transactionId");

-- CreateIndex
CREATE INDEX "FixedDeposit_userId_idx" ON "FixedDeposit"("userId");

-- CreateIndex
CREATE INDEX "FixedDeposit_status_idx" ON "FixedDeposit"("status");

-- CreateIndex
CREATE INDEX "FixedDeposit_maturityDate_idx" ON "FixedDeposit"("maturityDate");

-- CreateIndex
CREATE INDEX "FixedDeposit_serverSeq_idx" ON "FixedDeposit"("serverSeq");

-- CreateIndex
CREATE INDEX "FixedDepositPayout_fixedDepositId_idx" ON "FixedDepositPayout"("fixedDepositId");

-- CreateIndex
CREATE INDEX "FixedDepositPayout_serverSeq_idx" ON "FixedDepositPayout"("serverSeq");

-- CreateIndex
CREATE INDEX "Loan_userId_idx" ON "Loan"("userId");

-- CreateIndex
CREATE INDEX "Loan_status_idx" ON "Loan"("status");

-- CreateIndex
CREATE INDEX "Loan_serverSeq_idx" ON "Loan"("serverSeq");

-- CreateIndex
CREATE INDEX "LoanScheduleEntry_loanId_idx" ON "LoanScheduleEntry"("loanId");

-- CreateIndex
CREATE INDEX "LoanScheduleEntry_status_idx" ON "LoanScheduleEntry"("status");

-- CreateIndex
CREATE INDEX "LoanScheduleEntry_dueDate_idx" ON "LoanScheduleEntry"("dueDate");

-- CreateIndex
CREATE INDEX "LoanScheduleEntry_serverSeq_idx" ON "LoanScheduleEntry"("serverSeq");

-- CreateIndex
CREATE INDEX "LoanPayment_loanId_idx" ON "LoanPayment"("loanId");

-- CreateIndex
CREATE INDEX "LoanPayment_transactionId_idx" ON "LoanPayment"("transactionId");

-- CreateIndex
CREATE INDEX "LoanPayment_scheduleEntryId_idx" ON "LoanPayment"("scheduleEntryId");

-- CreateIndex
CREATE INDEX "LoanPayment_paymentDate_idx" ON "LoanPayment"("paymentDate");

-- CreateIndex
CREATE INDEX "LoanPayment_serverSeq_idx" ON "LoanPayment"("serverSeq");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdMember" ADD CONSTRAINT "HouseholdMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reversalOfTransactionId_fkey" FOREIGN KEY ("reversalOfTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_installmentPlanId_fkey" FOREIGN KEY ("installmentPlanId") REFERENCES "CreditCardInstallmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_feeTransactionId_fkey" FOREIGN KEY ("feeTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionTemplate" ADD CONSTRAINT "TransactionTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionSplitItem" ADD CONSTRAINT "TransactionSplitItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionSplitItem" ADD CONSTRAINT "TransactionSplitItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMonthSnapshot" ADD CONSTRAINT "BudgetMonthSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMonthSnapshot" ADD CONSTRAINT "BudgetMonthSnapshot_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetMonthSnapshot" ADD CONSTRAINT "BudgetMonthSnapshot_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardStatement" ADD CONSTRAINT "CreditCardStatement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardStatement" ADD CONSTRAINT "CreditCardStatement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInstallmentPlan" ADD CONSTRAINT "CreditCardInstallmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInstallmentPlan" ADD CONSTRAINT "CreditCardInstallmentPlan_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCardInstallmentPlan" ADD CONSTRAINT "CreditCardInstallmentPlan_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankSms" ADD CONSTRAINT "BankSms_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankSms" ADD CONSTRAINT "BankSms_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedDeposit" ADD CONSTRAINT "FixedDeposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedDeposit" ADD CONSTRAINT "FixedDeposit_linkedPayoutAccountId_fkey" FOREIGN KEY ("linkedPayoutAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedDeposit" ADD CONSTRAINT "FixedDeposit_fundingAccountId_fkey" FOREIGN KEY ("fundingAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedDepositPayout" ADD CONSTRAINT "FixedDepositPayout_fixedDepositId_fkey" FOREIGN KEY ("fixedDepositId") REFERENCES "FixedDeposit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedDepositPayout" ADD CONSTRAINT "FixedDepositPayout_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_linkedDisbursementAccountId_fkey" FOREIGN KEY ("linkedDisbursementAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanScheduleEntry" ADD CONSTRAINT "LoanScheduleEntry_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPayment" ADD CONSTRAINT "LoanPayment_scheduleEntryId_fkey" FOREIGN KEY ("scheduleEntryId") REFERENCES "LoanScheduleEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
