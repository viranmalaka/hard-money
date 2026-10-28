import { prisma } from "@/lib/prisma";
import { getNextServerSeq } from "@/lib/server-seq";
import { HardMoneyBackupPayload, BackupEntityCounts, extractBackupCounts } from "./types";

function toDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function toReqDate(val: string | null | undefined, fallback = new Date()): Date {
  const d = toDate(val);
  return d || fallback;
}

export interface ImportResult {
  success: boolean;
  importedCounts: BackupEntityCounts;
  importedAt: string;
}

export async function importUserData(
  userId: string,
  payload: HardMoneyBackupPayload
): Promise<ImportResult> {
  if (!payload || payload.version !== 1) {
    throw new Error("Invalid backup format or unsupported backup version.");
  }

  const counts = extractBackupCounts(payload);

  await prisma.$transaction(
    async (tx) => {
      const serverSeq = await getNextServerSeq(tx);

      // 1. Update user settings/preferences (if provided)
      if (payload.user) {
        const u = payload.user;
        await tx.user.update({
          where: { id: userId },
          data: {
            name: u.name || undefined,
            defaultCurrency: u.defaultCurrency || undefined,
            timezone: u.timezone || undefined,
            countryCode: u.countryCode ?? undefined,
            defaultWithholdingTaxRateBps: u.defaultWithholdingTaxRateBps ?? undefined,
            geminiApiKeyEncrypted: u.geminiApiKeyEncrypted ?? undefined,
            geminiModel: u.geminiModel ?? undefined,
            smsAutoPostMode: u.smsAutoPostMode ?? undefined,
            apiKeyHash: u.apiKeyHash ?? undefined,
            apiKeyPrefix: u.apiKeyPrefix ?? undefined,
            pushRemindersEnabled: u.pushRemindersEnabled ?? undefined,
            dailyReminderTime: u.dailyReminderTime ?? undefined,
          },
        });
      }

      // 2. Households & Shopping List Items
      if (Array.isArray(payload.households)) {
        for (const h of payload.households) {
          if (!h.id || !h.name) continue;
          await tx.household.upsert({
            where: { id: h.id },
            update: {
              name: h.name,
            },
            create: {
              id: h.id,
              name: h.name,
              ownerId: userId,
              createdAt: toReqDate(h.createdAt),
            },
          });

          // Ensure current user is owner member
          await tx.householdMember.upsert({
            where: { householdId_userId: { householdId: h.id, userId } },
            update: { role: "OWNER" },
            create: {
              householdId: h.id,
              userId,
              role: "OWNER",
              createdAt: toReqDate(h.createdAt),
            },
          });

          // Shopping list items
          if (Array.isArray(h.shoppingListItems)) {
            for (const item of h.shoppingListItems) {
              if (!item.id || !item.name) continue;
              await tx.shoppingListItem.upsert({
                where: { id: item.id },
                update: {
                  name: item.name,
                  quantity: item.quantity,
                  isCompleted: Boolean(item.isCompleted),
                  position: item.position ?? 0,
                  completedAt: toDate(item.completedAt),
                  updatedAt: toReqDate(item.updatedAt),
                  deletedAt: toDate(item.deletedAt),
                  serverSeq,
                },
                create: {
                  id: item.id,
                  householdId: h.id,
                  name: item.name,
                  quantity: item.quantity,
                  isCompleted: Boolean(item.isCompleted),
                  position: item.position ?? 0,
                  completedAt: toDate(item.completedAt),
                  serverSeq,
                  createdAt: toReqDate(item.createdAt),
                  updatedAt: toReqDate(item.updatedAt),
                  deletedAt: toDate(item.deletedAt),
                },
              });
            }
          }
        }
      }

      // 3. Categories
      if (Array.isArray(payload.categories)) {
        for (const c of payload.categories) {
          if (!c.id || !c.name) continue;
          await tx.category.upsert({
            where: { id: c.id },
            update: {
              name: c.name,
              icon: c.icon || "Tag",
              color: c.color || "#6B7075",
              type: c.type || "EXPENSE",
              deletedAt: toDate(c.deletedAt),
              updatedAt: toReqDate(c.updatedAt),
              serverSeq,
            },
            create: {
              id: c.id,
              userId,
              householdId: c.householdId || null,
              name: c.name,
              icon: c.icon || "Tag",
              color: c.color || "#6B7075",
              type: c.type || "EXPENSE",
              serverSeq,
              createdAt: toReqDate(c.createdAt),
              updatedAt: toReqDate(c.updatedAt),
              deletedAt: toDate(c.deletedAt),
            },
          });
        }
      }

      // 4. Accounts (Pass 1: upsert without linkedSettlementAccountId to avoid cycle)
      if (Array.isArray(payload.accounts)) {
        for (const a of payload.accounts) {
          if (!a.id || !a.name) continue;
          await tx.account.upsert({
            where: { id: a.id },
            update: {
              name: a.name,
              type: a.type,
              openingBalanceMinor: a.openingBalanceMinor ?? 0,
              balanceCacheMinor: a.balanceCacheMinor,
              currency: a.currency || "LKR",
              accountNumberLast4: a.accountNumberLast4,
              bankSenderIds: a.bankSenderIds || [],
              accessScope: a.accessScope || "PRIVATE",
              feeRules: a.feeRules || undefined,
              ownAtmFeeMinor: a.ownAtmFeeMinor ?? 0,
              otherAtmFeeMinor: a.otherAtmFeeMinor ?? 0,
              balanceMismatchHint: a.balanceMismatchHint || undefined,
              creditLimitMinor: a.creditLimitMinor,
              statementCutoffDay: a.statementCutoffDay,
              paymentDueDay: a.paymentDueDay,
              isArchived: Boolean(a.isArchived),
              deletedAt: toDate(a.deletedAt),
              updatedAt: toReqDate(a.updatedAt),
              serverSeq,
            },
            create: {
              id: a.id,
              userId,
              householdId: a.householdId || null,
              name: a.name,
              type: a.type,
              openingBalanceMinor: a.openingBalanceMinor ?? 0,
              balanceCacheMinor: a.balanceCacheMinor,
              currency: a.currency || "LKR",
              accountNumberLast4: a.accountNumberLast4,
              bankSenderIds: a.bankSenderIds || [],
              accessScope: a.accessScope || "PRIVATE",
              feeRules: a.feeRules || undefined,
              ownAtmFeeMinor: a.ownAtmFeeMinor ?? 0,
              otherAtmFeeMinor: a.otherAtmFeeMinor ?? 0,
              balanceMismatchHint: a.balanceMismatchHint || undefined,
              creditLimitMinor: a.creditLimitMinor,
              statementCutoffDay: a.statementCutoffDay,
              paymentDueDay: a.paymentDueDay,
              isArchived: Boolean(a.isArchived),
              serverSeq,
              createdAt: toReqDate(a.createdAt),
              updatedAt: toReqDate(a.updatedAt),
              deletedAt: toDate(a.deletedAt),
            },
          });
        }

        // Pass 2: patch linkedSettlementAccountId
        for (const a of payload.accounts) {
          if (a.id && a.linkedSettlementAccountId) {
            await tx.account.update({
              where: { id: a.id },
              data: { linkedSettlementAccountId: a.linkedSettlementAccountId },
            });
          }
        }
      }

      // 5. Transaction Templates
      if (Array.isArray(payload.templates)) {
        for (const t of payload.templates) {
          if (!t.id || !t.name) continue;
          await tx.transactionTemplate.upsert({
            where: { id: t.id },
            update: {
              name: t.name,
              accountId: t.accountId || null,
              toAccountId: t.toAccountId || null,
              categoryId: t.categoryId || null,
              type: t.type || "EXPENSE",
              defaultAmountMinor: t.defaultAmountMinor,
              note: t.note,
              icon: t.icon,
              updatedAt: toReqDate(t.updatedAt),
              deletedAt: toDate(t.deletedAt),
              serverSeq,
            },
            create: {
              id: t.id,
              userId,
              name: t.name,
              accountId: t.accountId || null,
              toAccountId: t.toAccountId || null,
              categoryId: t.categoryId || null,
              type: t.type || "EXPENSE",
              defaultAmountMinor: t.defaultAmountMinor,
              note: t.note,
              icon: t.icon,
              serverSeq,
              createdAt: toReqDate(t.createdAt),
              updatedAt: toReqDate(t.updatedAt),
              deletedAt: toDate(t.deletedAt),
            },
          });
        }
      }

      // 6. Credit Card Statements
      if (Array.isArray(payload.creditCardStatements)) {
        for (const cs of payload.creditCardStatements) {
          if (!cs.id || !cs.accountId) continue;
          await tx.creditCardStatement.upsert({
            where: { id: cs.id },
            update: {
              cycleStartDate: toReqDate(cs.cycleStartDate),
              cycleCutoffDate: toReqDate(cs.cycleCutoffDate),
              dueDate: toReqDate(cs.dueDate),
              billedDebtMinor: cs.billedDebtMinor ?? 0,
              totalDebtMinor: cs.totalDebtMinor ?? 0,
              isSettled: Boolean(cs.isSettled),
              updatedAt: toReqDate(cs.updatedAt),
              serverSeq,
            },
            create: {
              id: cs.id,
              userId,
              accountId: cs.accountId,
              cycleStartDate: toReqDate(cs.cycleStartDate),
              cycleCutoffDate: toReqDate(cs.cycleCutoffDate),
              dueDate: toReqDate(cs.dueDate),
              billedDebtMinor: cs.billedDebtMinor ?? 0,
              totalDebtMinor: cs.totalDebtMinor ?? 0,
              isSettled: Boolean(cs.isSettled),
              serverSeq,
              createdAt: toReqDate(cs.createdAt),
              updatedAt: toReqDate(cs.updatedAt),
            },
          });
        }
      }

      // 7. Credit Card Installment Plans
      if (Array.isArray(payload.creditCardInstallmentPlans)) {
        for (const ip of payload.creditCardInstallmentPlans) {
          if (!ip.id || !ip.accountId) continue;
          await tx.creditCardInstallmentPlan.upsert({
            where: { id: ip.id },
            update: {
              accountId: ip.accountId,
              categoryId: ip.categoryId || null,
              merchantName: ip.merchantName,
              totalAmountMinor: ip.totalAmountMinor,
              tenureMonths: ip.tenureMonths,
              monthlyAmountMinor: ip.monthlyAmountMinor,
              finalInstallmentAmountMinor: ip.finalInstallmentAmountMinor,
              initialPaidInstallments: ip.initialPaidInstallments ?? 0,
              processingFeeMinor: ip.processingFeeMinor ?? 0,
              processingFeeBilled: Boolean(ip.processingFeeBilled),
              startDate: toReqDate(ip.startDate),
              firstStatementDate: toReqDate(ip.firstStatementDate),
              isOngoingSetup: Boolean(ip.isOngoingSetup),
              status: ip.status || "ACTIVE",
              note: ip.note,
              updatedAt: toReqDate(ip.updatedAt),
              deletedAt: toDate(ip.deletedAt),
              serverSeq,
            },
            create: {
              id: ip.id,
              userId,
              accountId: ip.accountId,
              categoryId: ip.categoryId || null,
              merchantName: ip.merchantName,
              totalAmountMinor: ip.totalAmountMinor,
              tenureMonths: ip.tenureMonths,
              monthlyAmountMinor: ip.monthlyAmountMinor,
              finalInstallmentAmountMinor: ip.finalInstallmentAmountMinor,
              initialPaidInstallments: ip.initialPaidInstallments ?? 0,
              processingFeeMinor: ip.processingFeeMinor ?? 0,
              processingFeeBilled: Boolean(ip.processingFeeBilled),
              startDate: toReqDate(ip.startDate),
              firstStatementDate: toReqDate(ip.firstStatementDate),
              isOngoingSetup: Boolean(ip.isOngoingSetup),
              status: ip.status || "ACTIVE",
              note: ip.note,
              serverSeq,
              createdAt: toReqDate(ip.createdAt),
              updatedAt: toReqDate(ip.updatedAt),
              deletedAt: toDate(ip.deletedAt),
            },
          });
        }
      }

      // 8. Fixed Deposits
      if (Array.isArray(payload.fixedDeposits)) {
        for (const fd of payload.fixedDeposits) {
          if (!fd.id || !fd.bankName) continue;
          await tx.fixedDeposit.upsert({
            where: { id: fd.id },
            update: {
              bankName: fd.bankName,
              accountNumber: fd.accountNumber,
              principalAmountMinor: fd.principalAmountMinor,
              annualInterestRateBps: fd.annualInterestRateBps,
              tenureMonths: fd.tenureMonths,
              paidPeriods: fd.paidPeriods ?? 0,
              startDate: toReqDate(fd.startDate),
              maturityDate: toReqDate(fd.maturityDate),
              compoundingFrequency: fd.compoundingFrequency || "MONTHLY",
              payoutMode: fd.payoutMode || "MONTHLY_PAYOUT_TO_ACCOUNT",
              linkedPayoutAccountId: fd.linkedPayoutAccountId || null,
              fundingAccountId: fd.fundingAccountId || null,
              withholdingTaxRateBps: fd.withholdingTaxRateBps ?? 0,
              autoRenew: Boolean(fd.autoRenew),
              status: fd.status || "ACTIVE",
              closedAt: toDate(fd.closedAt),
              prematureClosure: Boolean(fd.prematureClosure),
              updatedAt: toReqDate(fd.updatedAt),
              deletedAt: toDate(fd.deletedAt),
              serverSeq,
            },
            create: {
              id: fd.id,
              userId,
              householdId: fd.householdId || null,
              bankName: fd.bankName,
              accountNumber: fd.accountNumber,
              principalAmountMinor: fd.principalAmountMinor,
              annualInterestRateBps: fd.annualInterestRateBps,
              tenureMonths: fd.tenureMonths,
              paidPeriods: fd.paidPeriods ?? 0,
              startDate: toReqDate(fd.startDate),
              maturityDate: toReqDate(fd.maturityDate),
              compoundingFrequency: fd.compoundingFrequency || "MONTHLY",
              payoutMode: fd.payoutMode || "MONTHLY_PAYOUT_TO_ACCOUNT",
              linkedPayoutAccountId: fd.linkedPayoutAccountId || null,
              fundingAccountId: fd.fundingAccountId || null,
              withholdingTaxRateBps: fd.withholdingTaxRateBps ?? 0,
              autoRenew: Boolean(fd.autoRenew),
              status: fd.status || "ACTIVE",
              closedAt: toDate(fd.closedAt),
              prematureClosure: Boolean(fd.prematureClosure),
              serverSeq,
              createdAt: toReqDate(fd.createdAt),
              updatedAt: toReqDate(fd.updatedAt),
              deletedAt: toDate(fd.deletedAt),
            },
          });
        }
      }

      // 9. Loans & Schedule Entries
      if (Array.isArray(payload.loans)) {
        for (const l of payload.loans) {
          if (!l.id || !l.lenderName) continue;
          await tx.loan.upsert({
            where: { id: l.id },
            update: {
              kind: l.kind || "LOAN",
              lenderName: l.lenderName,
              originalPrincipalMinor: l.originalPrincipalMinor,
              residualValueMinor: l.residualValueMinor ?? 0,
              annualInterestRateBps: l.annualInterestRateBps,
              tenureMonths: l.tenureMonths,
              paidInstallments: l.paidInstallments ?? 0,
              startDate: toReqDate(l.startDate),
              paymentDueDay: l.paymentDueDay ?? 1,
              monthlyEmiAmountMinor: l.monthlyEmiAmountMinor,
              calculationType: l.calculationType || "REDUCING_BALANCE",
              linkedDisbursementAccountId: l.linkedDisbursementAccountId || null,
              status: l.status || "ACTIVE",
              closedAt: toDate(l.closedAt),
              updatedAt: toReqDate(l.updatedAt),
              deletedAt: toDate(l.deletedAt),
              serverSeq,
            },
            create: {
              id: l.id,
              userId,
              householdId: l.householdId || null,
              kind: l.kind || "LOAN",
              lenderName: l.lenderName,
              originalPrincipalMinor: l.originalPrincipalMinor,
              residualValueMinor: l.residualValueMinor ?? 0,
              annualInterestRateBps: l.annualInterestRateBps,
              tenureMonths: l.tenureMonths,
              paidInstallments: l.paidInstallments ?? 0,
              startDate: toReqDate(l.startDate),
              paymentDueDay: l.paymentDueDay ?? 1,
              monthlyEmiAmountMinor: l.monthlyEmiAmountMinor,
              calculationType: l.calculationType || "REDUCING_BALANCE",
              linkedDisbursementAccountId: l.linkedDisbursementAccountId || null,
              status: l.status || "ACTIVE",
              closedAt: toDate(l.closedAt),
              serverSeq,
              createdAt: toReqDate(l.createdAt),
              updatedAt: toReqDate(l.updatedAt),
              deletedAt: toDate(l.deletedAt),
            },
          });

          // Schedule entries
          if (Array.isArray(l.scheduleEntries)) {
            for (const se of l.scheduleEntries) {
              if (!se.id) continue;
              await tx.loanScheduleEntry.upsert({
                where: { id: se.id },
                update: {
                  installmentNumber: se.installmentNumber,
                  dueDate: toReqDate(se.dueDate),
                  principalComponentMinor: se.principalComponentMinor,
                  interestComponentMinor: se.interestComponentMinor,
                  openingBalanceMinor: se.openingBalanceMinor,
                  closingBalanceMinor: se.closingBalanceMinor,
                  status: se.status || "SCHEDULED",
                  updatedAt: toReqDate(se.updatedAt),
                  deletedAt: toDate(se.deletedAt),
                  serverSeq,
                },
                create: {
                  id: se.id,
                  loanId: l.id,
                  installmentNumber: se.installmentNumber,
                  dueDate: toReqDate(se.dueDate),
                  principalComponentMinor: se.principalComponentMinor,
                  interestComponentMinor: se.interestComponentMinor,
                  openingBalanceMinor: se.openingBalanceMinor,
                  closingBalanceMinor: se.closingBalanceMinor,
                  status: se.status || "SCHEDULED",
                  serverSeq,
                  createdAt: toReqDate(se.createdAt),
                  updatedAt: toReqDate(se.updatedAt),
                  deletedAt: toDate(se.deletedAt),
                },
              });
            }
          }
        }
      }

      // 10. Transactions: Pass 1 (without self-referencing foreign keys)
      if (Array.isArray(payload.transactions)) {
        for (const t of payload.transactions) {
          if (!t.id || !t.accountId) continue;
          await tx.transaction.upsert({
            where: { id: t.id },
            update: {
              accountId: t.accountId,
              toAccountId: t.toAccountId || null,
              categoryId: t.categoryId || null,
              amountMinor: t.amountMinor,
              destinationAmountMinor: t.destinationAmountMinor,
              exchangeRateMicros: t.exchangeRateMicros,
              direction: t.direction,
              type: t.type,
              subType: t.subType,
              source: t.source || "MANUAL",
              transactionDate: toReqDate(t.transactionDate),
              note: t.note,
              isSplit: Boolean(t.isSplit),
              excludeFromBudget: Boolean(t.excludeFromBudget),
              excludeFromStats: Boolean(t.excludeFromStats),
              excludeFromBalance: Boolean(t.excludeFromBalance),
              installmentPlanId: t.installmentPlanId || null,
              possibleDuplicateOfTransactionId: t.possibleDuplicateOfTransactionId || null,
              updatedAt: toReqDate(t.updatedAt),
              deletedAt: toDate(t.deletedAt),
              serverSeq,
            },
            create: {
              id: t.id,
              userId,
              householdId: t.householdId || null,
              accountId: t.accountId,
              toAccountId: t.toAccountId || null,
              categoryId: t.categoryId || null,
              amountMinor: t.amountMinor,
              destinationAmountMinor: t.destinationAmountMinor,
              exchangeRateMicros: t.exchangeRateMicros,
              direction: t.direction,
              type: t.type,
              subType: t.subType,
              source: t.source || "MANUAL",
              createdByUserId: userId,
              updatedByUserId: userId,
              transactionDate: toReqDate(t.transactionDate),
              note: t.note,
              isSplit: Boolean(t.isSplit),
              excludeFromBudget: Boolean(t.excludeFromBudget),
              excludeFromStats: Boolean(t.excludeFromStats),
              excludeFromBalance: Boolean(t.excludeFromBalance),
              installmentPlanId: t.installmentPlanId || null,
              possibleDuplicateOfTransactionId: t.possibleDuplicateOfTransactionId || null,
              serverSeq,
              createdAt: toReqDate(t.createdAt),
              updatedAt: toReqDate(t.updatedAt),
              deletedAt: toDate(t.deletedAt),
            },
          });

          // Splits
          if (Array.isArray(t.splitItems)) {
            for (const si of t.splitItems) {
              if (!si.id || !si.categoryId) continue;
              await tx.transactionSplitItem.upsert({
                where: { id: si.id },
                update: {
                  categoryId: si.categoryId,
                  amountMinor: si.amountMinor,
                  note: si.note,
                },
                create: {
                  id: si.id,
                  transactionId: t.id,
                  categoryId: si.categoryId,
                  amountMinor: si.amountMinor,
                  note: si.note,
                },
              });
            }
          }
        }

        // Pass 2: Patch transaction self-references (reversalOfTransactionId, feeTransactionId)
        for (const t of payload.transactions) {
          if (t.id && (t.reversalOfTransactionId || t.feeTransactionId)) {
            await tx.transaction.update({
              where: { id: t.id },
              data: {
                reversalOfTransactionId: t.reversalOfTransactionId || null,
                feeTransactionId: t.feeTransactionId || null,
              },
            });
          }
        }
      }

      // 11. Patch originalTransactionId for Installment Plans
      if (Array.isArray(payload.creditCardInstallmentPlans)) {
        for (const ip of payload.creditCardInstallmentPlans) {
          if (ip.id && ip.originalTransactionId) {
            await tx.creditCardInstallmentPlan.update({
              where: { id: ip.id },
              data: { originalTransactionId: ip.originalTransactionId },
            });
          }
        }
      }

      // 12. Fixed Deposit Payouts
      if (Array.isArray(payload.fixedDeposits)) {
        for (const fd of payload.fixedDeposits) {
          if (Array.isArray(fd.payouts)) {
            for (const p of fd.payouts) {
              if (!p.id) continue;
              await tx.fixedDepositPayout.upsert({
                where: { id: p.id },
                update: {
                  periodEnd: toReqDate(p.periodEnd),
                  grossInterestMinor: p.grossInterestMinor,
                  taxWithheldMinor: p.taxWithheldMinor,
                  netInterestMinor: p.netInterestMinor,
                  transactionId: p.transactionId || null,
                  serverSeq,
                },
                create: {
                  id: p.id,
                  fixedDepositId: fd.id,
                  periodEnd: toReqDate(p.periodEnd),
                  grossInterestMinor: p.grossInterestMinor,
                  taxWithheldMinor: p.taxWithheldMinor,
                  netInterestMinor: p.netInterestMinor,
                  transactionId: p.transactionId || null,
                  serverSeq,
                  createdAt: toReqDate(p.createdAt),
                },
              });
            }
          }
        }
      }

      // 13. Loan Payments
      if (Array.isArray(payload.loans)) {
        for (const l of payload.loans) {
          if (Array.isArray(l.payments)) {
            for (const lp of l.payments) {
              if (!lp.id) continue;
              await tx.loanPayment.upsert({
                where: { id: lp.id },
                update: {
                  transactionId: lp.transactionId || null,
                  scheduleEntryId: lp.scheduleEntryId || null,
                  principalComponentMinor: lp.principalComponentMinor,
                  interestComponentMinor: lp.interestComponentMinor,
                  isExtraPrincipal: Boolean(lp.isExtraPrincipal),
                  paymentDate: toReqDate(lp.paymentDate),
                  serverSeq,
                },
                create: {
                  id: lp.id,
                  loanId: l.id,
                  transactionId: lp.transactionId || null,
                  scheduleEntryId: lp.scheduleEntryId || null,
                  principalComponentMinor: lp.principalComponentMinor,
                  interestComponentMinor: lp.interestComponentMinor,
                  isExtraPrincipal: Boolean(lp.isExtraPrincipal),
                  paymentDate: toReqDate(lp.paymentDate),
                  serverSeq,
                  createdAt: toReqDate(lp.createdAt),
                },
              });
            }
          }
        }
      }

      // 14. Bank SMS Records
      if (Array.isArray(payload.bankSmsList)) {
        for (const sms of payload.bankSmsList) {
          if (!sms.id || !sms.dedupeKey) continue;
          await tx.bankSms.upsert({
            where: { dedupeKey: sms.dedupeKey },
            update: {
              sender: sms.sender,
              rawMessage: sms.rawMessage,
              receivedAt: toReqDate(sms.receivedAt),
              status: sms.status || "PENDING",
              parseMethod: sms.parseMethod,
              parsedPayload: sms.parsedPayload || undefined,
              reviewReason: sms.reviewReason,
              attempts: sms.attempts ?? 0,
              nextRetryAt: toDate(sms.nextRetryAt),
              transactionId: sms.transactionId || null,
              failureReason: sms.failureReason,
            },
            create: {
              id: sms.id,
              userId,
              dedupeKey: sms.dedupeKey,
              sender: sms.sender,
              rawMessage: sms.rawMessage,
              receivedAt: toReqDate(sms.receivedAt),
              status: sms.status || "PENDING",
              parseMethod: sms.parseMethod,
              parsedPayload: sms.parsedPayload || undefined,
              reviewReason: sms.reviewReason,
              attempts: sms.attempts ?? 0,
              nextRetryAt: toDate(sms.nextRetryAt),
              transactionId: sms.transactionId || null,
              failureReason: sms.failureReason,
              createdAt: toReqDate(sms.createdAt),
            },
          });
        }
      }

      // 15. Budgets & Month Snapshots
      if (Array.isArray(payload.budgets)) {
        for (const b of payload.budgets) {
          if (!b.categoryId) continue;
          const budget = await tx.budget.upsert({
            where: { userId_categoryId: { userId, categoryId: b.categoryId } },
            update: {
              monthlyLimitMinor: b.monthlyLimitMinor,
              enableRollover: Boolean(b.enableRollover),
              rolloverStartMonth: b.rolloverStartMonth,
              updatedAt: toReqDate(b.updatedAt),
              deletedAt: toDate(b.deletedAt),
              serverSeq,
            },
            create: {
              id: b.id || undefined,
              userId,
              categoryId: b.categoryId,
              monthlyLimitMinor: b.monthlyLimitMinor,
              enableRollover: Boolean(b.enableRollover),
              rolloverStartMonth: b.rolloverStartMonth,
              serverSeq,
              createdAt: toReqDate(b.createdAt),
              updatedAt: toReqDate(b.updatedAt),
              deletedAt: toDate(b.deletedAt),
            },
          });

          if (Array.isArray(b.snapshots)) {
            for (const s of b.snapshots) {
              if (!s.month || !s.categoryId) continue;
              await tx.budgetMonthSnapshot.upsert({
                where: {
                  userId_categoryId_month: {
                    userId,
                    categoryId: s.categoryId,
                    month: s.month,
                  },
                },
                update: {
                  budgetId: budget.id,
                  limitMinor: s.limitMinor,
                  spentMinor: s.spentMinor,
                  carriedInMinor: s.carriedInMinor ?? 0,
                  carriedOutMinor: s.carriedOutMinor ?? 0,
                  updatedAt: toReqDate(s.updatedAt),
                  serverSeq,
                },
                create: {
                  id: s.id || `snap_${userId}_${s.categoryId}_${s.month}`,
                  userId,
                  budgetId: budget.id,
                  categoryId: s.categoryId,
                  month: s.month,
                  limitMinor: s.limitMinor,
                  spentMinor: s.spentMinor,
                  carriedInMinor: s.carriedInMinor ?? 0,
                  carriedOutMinor: s.carriedOutMinor ?? 0,
                  serverSeq,
                  createdAt: toReqDate(s.createdAt),
                  updatedAt: toReqDate(s.updatedAt),
                },
              });
            }
          }
        }
      }
    },
    {
      timeout: 60000,
      maxWait: 10000,
    }
  );

  return {
    success: true,
    importedCounts: counts,
    importedAt: new Date().toISOString(),
  };
}
