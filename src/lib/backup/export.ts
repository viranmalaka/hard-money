import { prisma } from "@/lib/prisma";
import { HardMoneyBackupPayload, ExportOptions, DEFAULT_EXPORT_OPTIONS } from "./types";

export async function exportUserData(
  userId: string,
  options?: ExportOptions
): Promise<HardMoneyBackupPayload> {
  const opts: Required<ExportOptions> = { ...DEFAULT_EXPORT_OPTIONS, ...options };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      defaultCurrency: true,
      timezone: true,
      countryCode: true,
      defaultWithholdingTaxRateBps: true,
      geminiApiKeyEncrypted: true,
      geminiModel: true,
      smsAutoPostMode: true,
      apiKeyHash: true,
      apiKeyPrefix: true,
      pushRemindersEnabled: true,
      dailyReminderTime: true,
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  // 1. Households owned by the user (or needed for scoping other entities)
  const needsHouseholdIds =
    opts.categories || opts.accounts || opts.transactions || opts.loans || opts.fixedDeposits;

  let ownedHouseholds: Array<{
    id: string;
    name: string;
    createdAt: Date;
    members: Array<{ id: string; householdId: string; userId: string; role: string; createdAt: Date }>;
    shoppingListItems: Array<{
      id: string;
      householdId: string;
      name: string;
      quantity: string | null;
      isCompleted: boolean;
      position: number;
      completedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      deletedAt: Date | null;
    }>;
  }> = [];

  let ownedHouseholdIds: string[] = [];

  if (opts.households) {
    ownedHouseholds = await prisma.household.findMany({
      where: { ownerId: userId },
      include: {
        members: true,
        shoppingListItems: true,
      },
    });
    ownedHouseholdIds = ownedHouseholds.map((h) => h.id);
  } else if (needsHouseholdIds) {
    const hh = await prisma.household.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    ownedHouseholdIds = Array.isArray(hh) ? hh.map((h) => h.id) : [];
  }

  // 2. Categories
  const categories = opts.categories
    ? await prisma.category.findMany({
        where: {
          OR: [
            { userId },
            ...(ownedHouseholdIds.length > 0 ? [{ householdId: { in: ownedHouseholdIds } }] : []),
          ],
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // 3. Accounts
  const accounts = opts.accounts
    ? await prisma.account.findMany({
        where: {
          OR: [
            { userId },
            ...(ownedHouseholdIds.length > 0 ? [{ householdId: { in: ownedHouseholdIds } }] : []),
          ],
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // 4. Transaction Templates
  const templates = opts.templates
    ? await prisma.transactionTemplate.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // 5. Budgets & Month Snapshots
  const budgets = opts.budgets
    ? await prisma.budget.findMany({
        where: { userId },
        include: {
          snapshots: true,
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  // 6. Credit Card Statements
  const creditCardStatements = opts.creditCards
    ? await prisma.creditCardStatement.findMany({
        where: { userId },
        orderBy: { cycleCutoffDate: "asc" },
      })
    : [];

  // 7. Credit Card Installment Plans
  const installmentPlans = opts.creditCards
    ? await prisma.creditCardInstallmentPlan.findMany({
        where: { userId },
        orderBy: { startDate: "asc" },
      })
    : [];

  // 8. Fixed Deposits & Payouts
  const fixedDeposits = opts.fixedDeposits
    ? await prisma.fixedDeposit.findMany({
        where: {
          OR: [
            { userId },
            ...(ownedHouseholdIds.length > 0 ? [{ householdId: { in: ownedHouseholdIds } }] : []),
          ],
        },
        include: {
          payouts: {
            orderBy: { periodEnd: "asc" },
          },
        },
        orderBy: { startDate: "asc" },
      })
    : [];

  // 9. Loans, Schedules & Payments
  const loans = opts.loans
    ? await prisma.loan.findMany({
        where: {
          OR: [
            { userId },
            ...(ownedHouseholdIds.length > 0 ? [{ householdId: { in: ownedHouseholdIds } }] : []),
          ],
        },
        include: {
          scheduleEntries: {
            orderBy: { installmentNumber: "asc" },
          },
          payments: {
            orderBy: { paymentDate: "asc" },
          },
        },
        orderBy: { startDate: "asc" },
      })
    : [];

  // 10. Transactions & Splits
  const transactions = opts.transactions
    ? await prisma.transaction.findMany({
        where: {
          OR: [
            { userId },
            ...(ownedHouseholdIds.length > 0 ? [{ householdId: { in: ownedHouseholdIds } }] : []),
          ],
        },
        include: {
          splitItems: true,
        },
        orderBy: { transactionDate: "asc" },
      })
    : [];

  // 11. Bank SMS records
  const bankSmsList = opts.bankSms
    ? await prisma.bankSms.findMany({
        where: { userId },
        orderBy: { receivedAt: "asc" },
      })
    : [];

  const payload: HardMoneyBackupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: "hard-money",
    user: {
      name: user.name,
      email: user.email,
      defaultCurrency: user.defaultCurrency,
      timezone: user.timezone,
      countryCode: opts.settings ? user.countryCode : null,
      defaultWithholdingTaxRateBps: opts.settings ? user.defaultWithholdingTaxRateBps : 0,
      geminiApiKeyEncrypted: opts.settings ? user.geminiApiKeyEncrypted : null,
      geminiModel: opts.settings ? user.geminiModel : null,
      smsAutoPostMode: opts.settings ? user.smsAutoPostMode : "DISABLED",
      apiKeyHash: opts.settings ? user.apiKeyHash : null,
      apiKeyPrefix: opts.settings ? user.apiKeyPrefix : null,
      pushRemindersEnabled: opts.settings ? user.pushRemindersEnabled : false,
      dailyReminderTime: opts.settings ? user.dailyReminderTime : "20:00",
    },
    households: ownedHouseholds.map((h) => ({
      id: h.id,
      name: h.name,
      createdAt: h.createdAt.toISOString(),
      members: h.members.map((m) => ({
        id: m.id,
        householdId: m.householdId,
        userId: m.userId,
        role: m.role,
        createdAt: m.createdAt.toISOString(),
      })),
      shoppingListItems: h.shoppingListItems.map((item) => ({
        id: item.id,
        householdId: item.householdId,
        name: item.name,
        quantity: item.quantity,
        isCompleted: item.isCompleted,
        position: item.position,
        completedAt: item.completedAt ? item.completedAt.toISOString() : null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        deletedAt: item.deletedAt ? item.deletedAt.toISOString() : null,
      })),
    })),
    categories: categories.map((c) => ({
      id: c.id,
      householdId: c.householdId,
      name: c.name,
      icon: c.icon,
      color: c.color,
      type: c.type,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
    })),
    accounts: accounts.map((a) => ({
      id: a.id,
      householdId: a.householdId,
      name: a.name,
      type: a.type,
      openingBalanceMinor: a.openingBalanceMinor,
      balanceCacheMinor: a.balanceCacheMinor,
      currency: a.currency,
      accountNumberLast4: a.accountNumberLast4,
      bankSenderIds: a.bankSenderIds,
      accessScope: a.accessScope,
      feeRules: a.feeRules,
      ownAtmFeeMinor: a.ownAtmFeeMinor,
      otherAtmFeeMinor: a.otherAtmFeeMinor,
      balanceMismatchHint: a.balanceMismatchHint,
      creditLimitMinor: a.creditLimitMinor,
      statementCutoffDay: a.statementCutoffDay,
      paymentDueDay: a.paymentDueDay,
      linkedSettlementAccountId: a.linkedSettlementAccountId,
      isArchived: a.isArchived,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null,
    })),
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      accountId: t.accountId,
      toAccountId: t.toAccountId,
      categoryId: t.categoryId,
      type: t.type,
      defaultAmountMinor: t.defaultAmountMinor,
      note: t.note,
      icon: t.icon,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      deletedAt: t.deletedAt ? t.deletedAt.toISOString() : null,
    })),
    budgets: budgets.map((b) => ({
      id: b.id,
      categoryId: b.categoryId,
      monthlyLimitMinor: b.monthlyLimitMinor,
      enableRollover: b.enableRollover,
      rolloverStartMonth: b.rolloverStartMonth,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
      deletedAt: b.deletedAt ? b.deletedAt.toISOString() : null,
      snapshots: b.snapshots.map((s) => ({
        id: s.id,
        budgetId: s.budgetId,
        categoryId: s.categoryId,
        month: s.month,
        limitMinor: s.limitMinor,
        spentMinor: s.spentMinor,
        carriedInMinor: s.carriedInMinor,
        carriedOutMinor: s.carriedOutMinor,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
    })),
    creditCardStatements: creditCardStatements.map((cs) => ({
      id: cs.id,
      accountId: cs.accountId,
      cycleStartDate: cs.cycleStartDate.toISOString(),
      cycleCutoffDate: cs.cycleCutoffDate.toISOString(),
      dueDate: cs.dueDate.toISOString(),
      billedDebtMinor: cs.billedDebtMinor,
      totalDebtMinor: cs.totalDebtMinor,
      isSettled: cs.isSettled,
      createdAt: cs.createdAt.toISOString(),
      updatedAt: cs.updatedAt.toISOString(),
    })),
    creditCardInstallmentPlans: installmentPlans.map((ip) => ({
      id: ip.id,
      accountId: ip.accountId,
      categoryId: ip.categoryId,
      merchantName: ip.merchantName,
      totalAmountMinor: ip.totalAmountMinor,
      tenureMonths: ip.tenureMonths,
      monthlyAmountMinor: ip.monthlyAmountMinor,
      finalInstallmentAmountMinor: ip.finalInstallmentAmountMinor,
      initialPaidInstallments: ip.initialPaidInstallments,
      processingFeeMinor: ip.processingFeeMinor,
      processingFeeBilled: ip.processingFeeBilled,
      startDate: ip.startDate.toISOString(),
      firstStatementDate: ip.firstStatementDate.toISOString(),
      isOngoingSetup: ip.isOngoingSetup,
      status: ip.status,
      originalTransactionId: ip.originalTransactionId,
      note: ip.note,
      createdAt: ip.createdAt.toISOString(),
      updatedAt: ip.updatedAt.toISOString(),
      deletedAt: ip.deletedAt ? ip.deletedAt.toISOString() : null,
    })),
    fixedDeposits: fixedDeposits.map((fd) => ({
      id: fd.id,
      householdId: fd.householdId,
      bankName: fd.bankName,
      accountNumber: fd.accountNumber,
      principalAmountMinor: fd.principalAmountMinor,
      annualInterestRateBps: fd.annualInterestRateBps,
      tenureMonths: fd.tenureMonths,
      paidPeriods: fd.paidPeriods,
      startDate: fd.startDate.toISOString(),
      maturityDate: fd.maturityDate.toISOString(),
      compoundingFrequency: fd.compoundingFrequency,
      payoutMode: fd.payoutMode,
      linkedPayoutAccountId: fd.linkedPayoutAccountId,
      fundingAccountId: fd.fundingAccountId,
      withholdingTaxRateBps: fd.withholdingTaxRateBps,
      autoRenew: fd.autoRenew,
      status: fd.status,
      closedAt: fd.closedAt ? fd.closedAt.toISOString() : null,
      prematureClosure: fd.prematureClosure,
      createdAt: fd.createdAt.toISOString(),
      updatedAt: fd.updatedAt.toISOString(),
      deletedAt: fd.deletedAt ? fd.deletedAt.toISOString() : null,
      payouts: fd.payouts.map((p) => ({
        id: p.id,
        fixedDepositId: p.fixedDepositId,
        periodEnd: p.periodEnd.toISOString(),
        grossInterestMinor: p.grossInterestMinor,
        taxWithheldMinor: p.taxWithheldMinor,
        netInterestMinor: p.netInterestMinor,
        transactionId: p.transactionId,
        createdAt: p.createdAt.toISOString(),
      })),
    })),
    loans: loans.map((l) => ({
      id: l.id,
      householdId: l.householdId,
      kind: l.kind,
      lenderName: l.lenderName,
      originalPrincipalMinor: l.originalPrincipalMinor,
      residualValueMinor: l.residualValueMinor,
      annualInterestRateBps: l.annualInterestRateBps,
      tenureMonths: l.tenureMonths,
      paidInstallments: l.paidInstallments,
      startDate: l.startDate.toISOString(),
      paymentDueDay: l.paymentDueDay,
      monthlyEmiAmountMinor: l.monthlyEmiAmountMinor,
      calculationType: l.calculationType,
      linkedDisbursementAccountId: l.linkedDisbursementAccountId,
      status: l.status,
      closedAt: l.closedAt ? l.closedAt.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
      deletedAt: l.deletedAt ? l.deletedAt.toISOString() : null,
      scheduleEntries: l.scheduleEntries.map((se) => ({
        id: se.id,
        loanId: se.loanId,
        installmentNumber: se.installmentNumber,
        dueDate: se.dueDate.toISOString(),
        principalComponentMinor: se.principalComponentMinor,
        interestComponentMinor: se.interestComponentMinor,
        openingBalanceMinor: se.openingBalanceMinor,
        closingBalanceMinor: se.closingBalanceMinor,
        status: se.status,
        createdAt: se.createdAt.toISOString(),
        updatedAt: se.updatedAt.toISOString(),
        deletedAt: se.deletedAt ? se.deletedAt.toISOString() : null,
      })),
      payments: l.payments.map((lp) => ({
        id: lp.id,
        loanId: lp.loanId,
        transactionId: lp.transactionId,
        scheduleEntryId: lp.scheduleEntryId,
        principalComponentMinor: lp.principalComponentMinor,
        interestComponentMinor: lp.interestComponentMinor,
        isExtraPrincipal: lp.isExtraPrincipal,
        paymentDate: lp.paymentDate.toISOString(),
        createdAt: lp.createdAt.toISOString(),
      })),
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      householdId: t.householdId,
      accountId: t.accountId,
      toAccountId: t.toAccountId,
      categoryId: t.categoryId,
      amountMinor: t.amountMinor,
      destinationAmountMinor: t.destinationAmountMinor,
      exchangeRateMicros: t.exchangeRateMicros,
      direction: t.direction,
      type: t.type,
      subType: t.subType,
      source: t.source,
      createdByUserId: t.createdByUserId,
      updatedByUserId: t.updatedByUserId,
      transactionDate: t.transactionDate.toISOString(),
      note: t.note,
      isSplit: t.isSplit,
      excludeFromBudget: t.excludeFromBudget,
      excludeFromStats: t.excludeFromStats,
      excludeFromBalance: t.excludeFromBalance,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      deletedAt: t.deletedAt ? t.deletedAt.toISOString() : null,
      reversalOfTransactionId: t.reversalOfTransactionId,
      installmentPlanId: t.installmentPlanId,
      feeTransactionId: t.feeTransactionId,
      possibleDuplicateOfTransactionId: t.possibleDuplicateOfTransactionId,
      splitItems: t.splitItems.map((si) => ({
        id: si.id,
        transactionId: si.transactionId,
        categoryId: si.categoryId,
        amountMinor: si.amountMinor,
        note: si.note,
      })),
    })),
    bankSmsList: bankSmsList.map((sms) => ({
      id: sms.id,
      dedupeKey: sms.dedupeKey,
      sender: sms.sender,
      rawMessage: sms.rawMessage,
      receivedAt: sms.receivedAt.toISOString(),
      status: sms.status,
      parseMethod: sms.parseMethod,
      parsedPayload: sms.parsedPayload,
      reviewReason: sms.reviewReason,
      attempts: sms.attempts,
      nextRetryAt: sms.nextRetryAt ? sms.nextRetryAt.toISOString() : null,
      transactionId: sms.transactionId,
      failureReason: sms.failureReason,
      createdAt: sms.createdAt.toISOString(),
    })),
  };

  return payload;
}
