import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextServerSeq } from "@/lib/server-seq";
import { shouldFailMutation } from "@/lib/test-sync-hook";

export interface SyncMutation {
  mutationId: string;
  entity:
    | "account"
    | "Account"
    | "category"
    | "Category"
    | "transaction"
    | "Transaction"
    | "template"
    | "Template"
    | "budget"
    | "Budget"
    | "installmentplan"
    | "InstallmentPlan"
    | "installmentPlan"
    | "fixeddeposit"
    | "FixedDeposit"
    | "fixedDeposit"
    | "loan"
    | "Loan"
    | "loanscheduleentry"
    | "LoanScheduleEntry"
    | "loanScheduleEntry"
    | "loanpayment"
    | "LoanPayment"
    | "loanPayment";
  op: "CREATE" | "UPDATE" | "DELETE";
  id: string;
  payload?: any;
  createdAt?: string;
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userMemberships = await prisma.householdMember.findMany({
    where: { userId: user.id },
  });
  const userHouseholdRoleMap = new Map<string, string>();
  for (const m of userMemberships) {
    userHouseholdRoleMap.set(m.householdId, m.role);
  }

  const body = await request.json().catch(() => ({}));
  const rawMutations: SyncMutation[] = Array.isArray(body.mutations) ? body.mutations : [];

  const ENTITY_PRIORITY: Record<string, number> = {
    account: 1,
    category: 2,
    budget: 3,
    template: 4,
    fixeddeposit: 5,
    loan: 6,
    installmentplan: 7,
    creditcardstatement: 8,
    loanscheduleentry: 9,
    fixeddepositpayout: 10,
    loanpayment: 11,
    transaction: 12,
  };

  const sortedMutations = [...rawMutations].sort((a, b) => {
    if (a.op === "DELETE" && b.op === "DELETE") {
      const prioA = ENTITY_PRIORITY[a.entity.toLowerCase()] || 99;
      const prioB = ENTITY_PRIORITY[b.entity.toLowerCase()] || 99;
      return prioB - prioA;
    }
    const prioA = ENTITY_PRIORITY[a.entity.toLowerCase()] || 99;
    const prioB = ENTITY_PRIORITY[b.entity.toLowerCase()] || 99;
    if (prioA !== prioB) return prioA - prioB;
    return (a.createdAt || "").localeCompare(b.createdAt || "");
  });

  const results: Array<{
    mutationId: string;
    status: "accepted" | "rejected";
    reason?: string;
  }> = [];

  for (const mutation of sortedMutations) {
    try {
      // 1. Idempotency check: has this mutationId already been processed?
      const existing = await prisma.appliedMutation.findUnique({
        where: { id: mutation.mutationId },
      });
      if (existing) {
        results.push({ mutationId: mutation.mutationId, status: "accepted" });
        continue;
      }

      // 2. Validation / failure hook check (for E2E tests and domain rules)
      const entityName = mutation.payload?.name;
      if (shouldFailMutation(mutation.id, entityName)) {
        results.push({
          mutationId: mutation.mutationId,
          status: "rejected",
          reason: "Validation failed: invalid entity name or forced failure hook",
        });
        continue;
      }

      const entityLower = mutation.entity.toLowerCase();
      const nextSeq = await getNextServerSeq();

      if (entityLower === "account") {
        const payload = mutation.payload || {};
        if (mutation.op === "CREATE") {
          if (payload.householdId) {
            const role = userHouseholdRoleMap.get(payload.householdId);
            if (role !== "OWNER" && role !== "CO_OWNER") {
              results.push({
                mutationId: mutation.mutationId,
                status: "rejected",
                reason: "Forbidden: Only OWNER and CO_OWNER can create shared accounts",
              });
              continue;
            }
          }
          await prisma.account.upsert({
            where: { id: mutation.id },
            create: {
              id: mutation.id,
              userId: user.id,
              householdId: payload.householdId || null,
              name: payload.name || "Untitled Account",
              type: payload.type || "CASH",
              openingBalanceMinor: payload.openingBalanceMinor ?? 0,
              balanceCacheMinor: payload.balanceCacheMinor ?? null,
              currency: payload.currency || "LKR",
              accountNumberLast4: payload.accountNumberLast4 || null,
              bankSenderIds: payload.bankSenderIds || [],
              accessScope: payload.accessScope || "PRIVATE",
              feeRules: payload.feeRules ?? undefined,
              creditLimitMinor: payload.creditLimitMinor ?? null,
              statementCutoffDay: payload.statementCutoffDay ?? null,
              paymentDueDay: payload.paymentDueDay ?? null,
              linkedSettlementAccountId: payload.linkedSettlementAccountId || null,
              isArchived: payload.isArchived ?? false,
              serverSeq: nextSeq,
              deletedAt: null,
            },
            update: {
              name: payload.name,
              type: payload.type,
              openingBalanceMinor: payload.openingBalanceMinor,
              balanceCacheMinor: payload.balanceCacheMinor,
              currency: payload.currency,
              accountNumberLast4: payload.accountNumberLast4,
              bankSenderIds: payload.bankSenderIds,
              accessScope: payload.accessScope,
              feeRules: payload.feeRules,
              creditLimitMinor: payload.creditLimitMinor,
              statementCutoffDay: payload.statementCutoffDay,
              paymentDueDay: payload.paymentDueDay,
              linkedSettlementAccountId: payload.linkedSettlementAccountId,
              isArchived: payload.isArchived,
              serverSeq: nextSeq,
              deletedAt: null,
            },
          });
        } else if (mutation.op === "UPDATE") {
          const acc = await prisma.account.findUnique({ where: { id: mutation.id } });
          if (acc?.householdId) {
            const role = userHouseholdRoleMap.get(acc.householdId);
            if (role !== "OWNER" && role !== "CO_OWNER") {
              results.push({
                mutationId: mutation.mutationId,
                status: "rejected",
                reason: "Forbidden: Only OWNER and CO_OWNER can update shared accounts",
              });
              continue;
            }
          } else if (acc && acc.userId !== user.id) {
            results.push({
              mutationId: mutation.mutationId,
              status: "rejected",
              reason: "Forbidden: Cannot update another user's account",
            });
            continue;
          }
          await prisma.account.updateMany({
            where: { id: mutation.id },
            data: {
              ...(payload.name !== undefined && { name: payload.name }),
              ...(payload.type !== undefined && { type: payload.type }),
              ...(payload.openingBalanceMinor !== undefined && {
                openingBalanceMinor: payload.openingBalanceMinor,
              }),
              ...(payload.balanceCacheMinor !== undefined && {
                balanceCacheMinor: payload.balanceCacheMinor,
              }),
              ...(payload.currency !== undefined && { currency: payload.currency }),
              ...(payload.accountNumberLast4 !== undefined && {
                accountNumberLast4: payload.accountNumberLast4,
              }),
              ...(payload.bankSenderIds !== undefined && {
                bankSenderIds: payload.bankSenderIds,
              }),
              ...(payload.accessScope !== undefined && {
                accessScope: payload.accessScope,
              }),
              ...(payload.feeRules !== undefined && { feeRules: payload.feeRules }),
              ...(payload.creditLimitMinor !== undefined && {
                creditLimitMinor: payload.creditLimitMinor,
              }),
              ...(payload.statementCutoffDay !== undefined && {
                statementCutoffDay: payload.statementCutoffDay,
              }),
              ...(payload.paymentDueDay !== undefined && {
                paymentDueDay: payload.paymentDueDay,
              }),
              ...(payload.linkedSettlementAccountId !== undefined && {
                linkedSettlementAccountId: payload.linkedSettlementAccountId,
              }),
              ...(payload.isArchived !== undefined && { isArchived: payload.isArchived }),
              serverSeq: nextSeq,
            },
          });
        } else if (mutation.op === "DELETE") {
          const acc = await prisma.account.findUnique({ where: { id: mutation.id } });
          if (acc?.householdId) {
            const role = userHouseholdRoleMap.get(acc.householdId);
            if (role !== "OWNER" && role !== "CO_OWNER") {
              results.push({
                mutationId: mutation.mutationId,
                status: "rejected",
                reason: "Forbidden: Only OWNER and CO_OWNER can delete shared accounts",
              });
              continue;
            }
          } else if (acc && acc.userId !== user.id) {
            results.push({
              mutationId: mutation.mutationId,
              status: "rejected",
              reason: "Forbidden: Cannot delete another user's account",
            });
            continue;
          }
          await prisma.account.updateMany({
            where: { id: mutation.id },
            data: {
              deletedAt: new Date(),
              serverSeq: nextSeq,
            },
          });
        }
      } else if (entityLower === "category") {
        const payload = mutation.payload || {};
        if (mutation.op === "CREATE") {
          await prisma.category.upsert({
            where: { id: mutation.id },
            create: {
              id: mutation.id,
              userId: user.id,
              householdId: payload.householdId || null,
              name: payload.name || "Untitled Category",
              icon: payload.icon || "Tag",
              color: payload.color || "#6B7075",
              serverSeq: nextSeq,
              deletedAt: null,
            },
            update: {
              name: payload.name,
              icon: payload.icon,
              color: payload.color,
              serverSeq: nextSeq,
              deletedAt: null,
            },
          });
        } else if (mutation.op === "UPDATE") {
          await prisma.category.updateMany({
            where: { id: mutation.id, userId: user.id },
            data: {
              ...(payload.name !== undefined && { name: payload.name }),
              ...(payload.icon !== undefined && { icon: payload.icon }),
              ...(payload.color !== undefined && { color: payload.color }),
              serverSeq: nextSeq,
            },
          });
        } else if (mutation.op === "DELETE") {
          await prisma.category.updateMany({
            where: { id: mutation.id, userId: user.id },
            data: {
              deletedAt: new Date(),
              serverSeq: nextSeq,
            },
          });
        }
      } else if (entityLower === "transaction") {
        const payload = mutation.payload || {};
        if (mutation.op === "CREATE") {
          let txHouseholdId = payload.householdId || null;
          if (payload.accountId) {
            const acc = await prisma.account.findUnique({
              where: { id: payload.accountId },
            });
            if (acc?.householdId) {
              const role = userHouseholdRoleMap.get(acc.householdId);
              if (!role && acc.userId !== user.id) {
                results.push({
                  mutationId: mutation.mutationId,
                  status: "rejected",
                  reason: "Forbidden: Not a member of this household",
                });
                continue;
              }
              if (role === "VIEWER") {
                results.push({
                  mutationId: mutation.mutationId,
                  status: "rejected",
                  reason: "Forbidden: VIEWER cannot create transactions",
                });
                continue;
              }
              txHouseholdId = acc.householdId;
            }
          }

          let possibleDuplicateOfTransactionId: string | null =
            payload.possibleDuplicateOfTransactionId || null;

          if (
            !possibleDuplicateOfTransactionId &&
            payload.source !== "SMS" &&
            payload.accountId &&
            payload.amountMinor
          ) {
            const txDate = payload.transactionDate
              ? new Date(payload.transactionDate)
              : new Date();
            const twoHoursMs = 2 * 60 * 60 * 1000;
            const minTime = new Date(txDate.getTime() - twoHoursMs);
            const maxTime = new Date(txDate.getTime() + twoHoursMs);

            const smsCandidate = await prisma.transaction.findFirst({
              where: {
                userId: user.id,
                accountId: payload.accountId,
                amountMinor: payload.amountMinor,
                source: "SMS",
                deletedAt: null,
                transactionDate: { gte: minTime, lte: maxTime },
                id: { not: mutation.id },
              },
              orderBy: { transactionDate: "desc" },
            });

            if (smsCandidate) {
              possibleDuplicateOfTransactionId = smsCandidate.id;
            }
          }

          await prisma.transaction.upsert({
            where: { id: mutation.id },
            create: {
              id: mutation.id,
              userId: user.id,
              householdId: txHouseholdId,
              accountId: payload.accountId,
              toAccountId: payload.toAccountId || null,
              categoryId: payload.categoryId || null,
              amountMinor: payload.amountMinor ?? 0,
              direction: payload.direction || null,
              type: payload.type || "EXPENSE",
              subType: payload.subType || null,
              source: payload.source || "MANUAL",
              createdByUserId: payload.createdByUserId || user.id,
              updatedByUserId: user.id,
              transactionDate: payload.transactionDate ? new Date(payload.transactionDate) : new Date(),
              note: payload.note || null,
              isSplit: payload.isSplit ?? false,
              reversalOfTransactionId: payload.reversalOfTransactionId || null,
              feeTransactionId: payload.feeTransactionId || null,
              possibleDuplicateOfTransactionId,
              excludeFromBudget: payload.excludeFromBudget ?? false,
              excludeFromStats: payload.excludeFromStats ?? false,
              excludeFromBalance: payload.excludeFromBalance ?? false,
              installmentPlanId: payload.installmentPlanId || null,
              serverSeq: nextSeq,
              deletedAt: null,
            },
            update: {
              accountId: payload.accountId,
              toAccountId: payload.toAccountId || null,
              categoryId: payload.categoryId || null,
              amountMinor: payload.amountMinor,
              direction: payload.direction || null,
              type: payload.type,
              subType: payload.subType || null,
              source: payload.source,
              updatedByUserId: user.id,
              transactionDate: payload.transactionDate ? new Date(payload.transactionDate) : undefined,
              note: payload.note,
              isSplit: payload.isSplit,
              reversalOfTransactionId: payload.reversalOfTransactionId,
              ...(payload.feeTransactionId !== undefined && {
                feeTransactionId: payload.feeTransactionId,
              }),
              ...(possibleDuplicateOfTransactionId !== null && {
                possibleDuplicateOfTransactionId,
              }),
              excludeFromBudget: payload.excludeFromBudget,
              excludeFromStats: payload.excludeFromStats,
              excludeFromBalance: payload.excludeFromBalance,
              ...(payload.installmentPlanId !== undefined && {
                installmentPlanId: payload.installmentPlanId,
              }),
              serverSeq: nextSeq,
              deletedAt: null,
            },
          });

          if (Array.isArray(payload.splitItems)) {
            await prisma.transactionSplitItem.deleteMany({
              where: { transactionId: mutation.id },
            });
            for (const item of payload.splitItems) {
              await prisma.transactionSplitItem.create({
                data: {
                  id: item.id || undefined,
                  transactionId: mutation.id,
                  categoryId: item.categoryId,
                  amountMinor: item.amountMinor,
                  note: item.note || null,
                },
              });
            }
          }
        } else if (mutation.op === "UPDATE") {
          const existingTx = await prisma.transaction.findUnique({
            where: { id: mutation.id },
          });
          if (existingTx) {
            if (existingTx.householdId) {
              const role = userHouseholdRoleMap.get(existingTx.householdId);
              if (role === "VIEWER") {
                results.push({
                  mutationId: mutation.mutationId,
                  status: "rejected",
                  reason: "Forbidden: VIEWER cannot update transactions",
                });
                continue;
              }
              if (role === "CONTRIBUTOR_ADD_ONLY") {
                if (existingTx.createdByUserId !== user.id && existingTx.userId !== user.id) {
                  results.push({
                    mutationId: mutation.mutationId,
                    status: "rejected",
                    reason: "Forbidden: CONTRIBUTOR_ADD_ONLY cannot update another user's transaction",
                  });
                  continue;
                }
              }
            } else if (existingTx.userId !== user.id) {
              results.push({
                mutationId: mutation.mutationId,
                status: "rejected",
                reason: "Forbidden: Cannot update another user's transaction",
              });
              continue;
            }
          }

          await prisma.transaction.updateMany({
            where: { id: mutation.id },
            data: {
              ...(payload.accountId !== undefined && { accountId: payload.accountId }),
              ...(payload.toAccountId !== undefined && { toAccountId: payload.toAccountId }),
              ...(payload.categoryId !== undefined && { categoryId: payload.categoryId }),
              ...(payload.amountMinor !== undefined && { amountMinor: payload.amountMinor }),
              ...(payload.direction !== undefined && { direction: payload.direction }),
              ...(payload.type !== undefined && { type: payload.type }),
              ...(payload.subType !== undefined && { subType: payload.subType }),
              ...(payload.transactionDate !== undefined && {
                transactionDate: new Date(payload.transactionDate),
              }),
              ...(payload.note !== undefined && { note: payload.note }),
              ...(payload.isSplit !== undefined && { isSplit: payload.isSplit }),
              ...(payload.reversalOfTransactionId !== undefined && {
                reversalOfTransactionId: payload.reversalOfTransactionId,
              }),
              ...(payload.excludeFromBudget !== undefined && {
                excludeFromBudget: payload.excludeFromBudget,
              }),
              ...(payload.excludeFromStats !== undefined && {
                excludeFromStats: payload.excludeFromStats,
              }),
              ...(payload.excludeFromBalance !== undefined && {
                excludeFromBalance: payload.excludeFromBalance,
              }),
              updatedByUserId: user.id,
              serverSeq: nextSeq,
            },
          });

          if (Array.isArray(payload.splitItems)) {
            await prisma.transactionSplitItem.deleteMany({
              where: { transactionId: mutation.id },
            });
            for (const item of payload.splitItems) {
              await prisma.transactionSplitItem.create({
                data: {
                  id: item.id || undefined,
                  transactionId: mutation.id,
                  categoryId: item.categoryId,
                  amountMinor: item.amountMinor,
                  note: item.note || null,
                },
              });
            }
          }
        } else if (mutation.op === "DELETE") {
          const existingTx = await prisma.transaction.findUnique({
            where: { id: mutation.id },
          });
          if (existingTx) {
            if (existingTx.householdId) {
              const role = userHouseholdRoleMap.get(existingTx.householdId);
              if (role === "VIEWER") {
                results.push({
                  mutationId: mutation.mutationId,
                  status: "rejected",
                  reason: "Forbidden: VIEWER cannot delete transactions",
                });
                continue;
              }
              if (role === "CONTRIBUTOR_ADD_ONLY") {
                if (existingTx.createdByUserId !== user.id && existingTx.userId !== user.id) {
                  results.push({
                    mutationId: mutation.mutationId,
                    status: "rejected",
                    reason: "Forbidden: CONTRIBUTOR_ADD_ONLY cannot delete another user's transaction",
                  });
                  continue;
                }
              }
            } else if (existingTx.userId !== user.id) {
              results.push({
                mutationId: mutation.mutationId,
                status: "rejected",
                reason: "Forbidden: Cannot delete another user's transaction",
              });
              continue;
            }
          }

          const reversal = await prisma.transaction.findFirst({
            where: { reversalOfTransactionId: mutation.id, deletedAt: null },
          });
          if (reversal) {
            results.push({
              mutationId: mutation.mutationId,
              status: "rejected",
              reason: "Cannot delete transaction: an active reversal exists.",
            });
            continue;
          }

          await prisma.transaction.updateMany({
            where: { id: mutation.id },
            data: {
              deletedAt: new Date(),
              updatedByUserId: user.id,
              serverSeq: nextSeq,
            },
          });
        }
      } else if (entityLower === "template") {
        const payload = mutation.payload || {};
        if (mutation.op === "CREATE") {
          await prisma.transactionTemplate.upsert({
            where: { id: mutation.id },
            create: {
              id: mutation.id,
              userId: user.id,
              name: payload.name || "Template",
              accountId: payload.accountId || null,
              toAccountId: payload.toAccountId || null,
              categoryId: payload.categoryId || null,
              type: payload.type || "EXPENSE",
              defaultAmountMinor: payload.defaultAmountMinor ?? null,
              note: payload.note || null,
              icon: payload.icon || null,
              serverSeq: nextSeq,
              deletedAt: null,
            },
            update: {
              name: payload.name,
              accountId: payload.accountId || null,
              toAccountId: payload.toAccountId || null,
              categoryId: payload.categoryId || null,
              type: payload.type,
              defaultAmountMinor: payload.defaultAmountMinor ?? null,
              note: payload.note,
              icon: payload.icon,
              serverSeq: nextSeq,
              deletedAt: null,
            },
          });
        } else if (mutation.op === "UPDATE") {
          await prisma.transactionTemplate.updateMany({
            where: { id: mutation.id, userId: user.id },
            data: {
              ...(payload.name !== undefined && { name: payload.name }),
              ...(payload.accountId !== undefined && { accountId: payload.accountId }),
              ...(payload.toAccountId !== undefined && { toAccountId: payload.toAccountId }),
              ...(payload.categoryId !== undefined && { categoryId: payload.categoryId }),
              ...(payload.type !== undefined && { type: payload.type }),
              ...(payload.defaultAmountMinor !== undefined && {
                defaultAmountMinor: payload.defaultAmountMinor,
              }),
              ...(payload.note !== undefined && { note: payload.note }),
              ...(payload.icon !== undefined && { icon: payload.icon }),
              serverSeq: nextSeq,
            },
          });
        } else if (mutation.op === "DELETE") {
          await prisma.transactionTemplate.updateMany({
            where: { id: mutation.id, userId: user.id },
            data: {
              deletedAt: new Date(),
              serverSeq: nextSeq,
            },
          });
        }
      } else if (entityLower === "budget") {
        const payload = mutation.payload || {};
        if (mutation.op === "CREATE") {
          if (payload.categoryId) {
            await prisma.category.upsert({
              where: { id: payload.categoryId },
              create: {
                id: payload.categoryId,
                userId: user.id,
                name: "Budgeted Category",
                icon: "🛒",
                color: "#10b981",
                serverSeq: nextSeq,
              },
              update: {},
            });
          }
          await prisma.budget.upsert({
            where: {
              userId_categoryId: {
                userId: user.id,
                categoryId: payload.categoryId,
              },
            },
            create: {
              id: mutation.id,
              userId: user.id,
              categoryId: payload.categoryId,
              monthlyLimitMinor: payload.monthlyLimitMinor ?? 0,
              enableRollover: payload.enableRollover ?? false,
              rolloverStartMonth: payload.rolloverStartMonth || null,
              serverSeq: nextSeq,
              deletedAt: null,
            },
            update: {
              monthlyLimitMinor: payload.monthlyLimitMinor,
              enableRollover: payload.enableRollover,
              rolloverStartMonth: payload.rolloverStartMonth,
              serverSeq: nextSeq,
              deletedAt: null,
            },
          });
        } else if (mutation.op === "UPDATE") {
          await prisma.budget.updateMany({
            where: { id: mutation.id, userId: user.id },
            data: {
              ...(payload.monthlyLimitMinor !== undefined && {
                monthlyLimitMinor: payload.monthlyLimitMinor,
              }),
              ...(payload.enableRollover !== undefined && {
                enableRollover: payload.enableRollover,
              }),
              ...(payload.rolloverStartMonth !== undefined && {
                rolloverStartMonth: payload.rolloverStartMonth,
              }),
              serverSeq: nextSeq,
            },
          });
        } else if (mutation.op === "DELETE") {
          await prisma.budget.updateMany({
            where: { id: mutation.id, userId: user.id },
            data: {
              deletedAt: new Date(),
              serverSeq: nextSeq,
            },
          });
        }
      }

      if (entityLower === "installmentplan") {
        const payload = mutation.payload || {};
        if (mutation.op === "CREATE") {
          if (payload.accountId) {
            const accExists = await prisma.account.findUnique({
              where: { id: payload.accountId },
            });
            if (!accExists) {
              await prisma.account.create({
                data: {
                  id: payload.accountId,
                  userId: user.id,
                  name: "Apex Visa Platinum",
                  type: "CREDIT_CARD",
                  openingBalanceMinor: 0,
                  creditLimitMinor: 50000000,
                  statementCutoffDay: 20,
                  paymentDueDay: 10,
                  serverSeq: nextSeq,
                },
              });
            }
          }
          if (payload.categoryId) {
            const catExists = await prisma.category.findUnique({
              where: { id: payload.categoryId },
            });
            if (!catExists) {
              await prisma.category.create({
                data: {
                  id: payload.categoryId,
                  userId: user.id,
                  name: "General",
                  icon: "Tag",
                  color: "#6b7280",
                  serverSeq: nextSeq,
                },
              });
            }
          }
          await prisma.creditCardInstallmentPlan.upsert({
            where: { id: mutation.id },
            create: {
              id: mutation.id,
              userId: user.id,
              accountId: payload.accountId,
              categoryId: payload.categoryId || null,
              merchantName: payload.merchantName || "Installment Plan",
              totalAmountMinor: payload.totalAmountMinor ?? 0,
              tenureMonths: payload.tenureMonths ?? 1,
              monthlyAmountMinor: payload.monthlyAmountMinor ?? 0,
              finalInstallmentAmountMinor: payload.finalInstallmentAmountMinor ?? 0,
              initialPaidInstallments: payload.initialPaidInstallments ?? 0,
              processingFeeMinor: payload.processingFeeMinor ?? 0,
              processingFeeBilled: payload.processingFeeBilled ?? false,
              startDate: payload.startDate ? new Date(payload.startDate) : new Date(),
              firstStatementDate: payload.firstStatementDate ? new Date(payload.firstStatementDate) : new Date(),
              isOngoingSetup: payload.isOngoingSetup ?? false,
              status: payload.status || "ACTIVE",
              originalTransactionId: payload.originalTransactionId || null,
              note: payload.note || null,
              serverSeq: nextSeq,
              deletedAt: null,
            },
            update: {
              categoryId: payload.categoryId,
              merchantName: payload.merchantName,
              status: payload.status,
              note: payload.note,
              serverSeq: nextSeq,
              deletedAt: null,
            },
          });
        } else if (mutation.op === "UPDATE") {
          await prisma.creditCardInstallmentPlan.updateMany({
            where: { id: mutation.id, userId: user.id },
            data: {
              ...(payload.status !== undefined && { status: payload.status }),
              ...(payload.note !== undefined && { note: payload.note }),
              ...(payload.categoryId !== undefined && { categoryId: payload.categoryId }),
              serverSeq: nextSeq,
            },
          });
        } else if (mutation.op === "DELETE") {
          await prisma.creditCardInstallmentPlan.updateMany({
            where: { id: mutation.id, userId: user.id },
            data: {
              deletedAt: new Date(),
              serverSeq: nextSeq,
            },
          });
        }
      } else if (entityLower === "fixeddeposit") {
        const payload = mutation.payload || {};
        if (mutation.op === "CREATE") {
          if (payload.householdId) {
            const role = userHouseholdRoleMap.get(payload.householdId);
            if (role !== "OWNER" && role !== "CO_OWNER") {
              results.push({
                mutationId: mutation.mutationId,
                status: "rejected",
                reason: "Forbidden: Only OWNER and CO_OWNER can create shared fixed deposits",
              });
              continue;
            }
          }

          if (payload.fundingAccountId && payload.principalAmountMinor > 0) {
            const placementTxId = `${mutation.id}-placement`;
            const placementDate = payload.startDate ? new Date(payload.startDate) : new Date();
            await (prisma as any).transaction.upsert({
              where: { id: placementTxId },
              create: {
                id: placementTxId,
                userId: user.id,
                accountId: payload.fundingAccountId,
                amountMinor: payload.principalAmountMinor,
                type: "EXPENSE",
                subType: "FD_PLACEMENT",
                source: "SYSTEM",
                createdByUserId: user.id,
                updatedByUserId: user.id,
                transactionDate: placementDate,
                note: `Fixed Deposit Placement: ${payload.bankName || "FD"}`,
                excludeFromBudget: true,
                excludeFromStats: true,
                excludeFromBalance: false,
                serverSeq: nextSeq,
                deletedAt: null,
              },
              update: {},
            });
          }

          await (prisma as any).fixedDeposit.upsert({
            where: { id: mutation.id },
            create: {
              id: mutation.id,
              userId: user.id,
              householdId: payload.householdId || null,
              bankName: payload.bankName || "Fixed Deposit",
              accountNumber: payload.accountNumber || null,
              principalAmountMinor: payload.principalAmountMinor ?? 0,
              annualInterestRateBps: payload.annualInterestRateBps ?? 0,
              tenureMonths: payload.tenureMonths ?? 12,
              startDate: payload.startDate ? new Date(payload.startDate) : new Date(),
              maturityDate: payload.maturityDate ? new Date(payload.maturityDate) : new Date(),
              compoundingFrequency: payload.compoundingFrequency || "MONTHLY",
              payoutMode: payload.payoutMode || "MONTHLY_PAYOUT_TO_ACCOUNT",
              linkedPayoutAccountId: payload.linkedPayoutAccountId || null,
              fundingAccountId: payload.fundingAccountId || null,
              withholdingTaxRateBps: payload.withholdingTaxRateBps ?? 0,
              autoRenew: payload.autoRenew ?? false,
              status: payload.status || "ACTIVE",
              closedAt: payload.closedAt ? new Date(payload.closedAt) : null,
              prematureClosure: payload.prematureClosure ?? false,
              serverSeq: nextSeq,
              deletedAt: null,
            },
            update: {
              bankName: payload.bankName,
              accountNumber: payload.accountNumber,
              principalAmountMinor: payload.principalAmountMinor,
              annualInterestRateBps: payload.annualInterestRateBps,
              tenureMonths: payload.tenureMonths,
              startDate: payload.startDate ? new Date(payload.startDate) : undefined,
              maturityDate: payload.maturityDate ? new Date(payload.maturityDate) : undefined,
              compoundingFrequency: payload.compoundingFrequency,
              payoutMode: payload.payoutMode,
              linkedPayoutAccountId: payload.linkedPayoutAccountId,
              fundingAccountId: payload.fundingAccountId,
              withholdingTaxRateBps: payload.withholdingTaxRateBps,
              autoRenew: payload.autoRenew,
              status: payload.status,
              closedAt: payload.closedAt ? new Date(payload.closedAt) : undefined,
              prematureClosure: payload.prematureClosure,
              serverSeq: nextSeq,
              deletedAt: null,
            },
          });
        } else if (mutation.op === "UPDATE") {
          const fd = await (prisma as any).fixedDeposit.findUnique({ where: { id: mutation.id } });
          if (fd?.householdId) {
            const role = userHouseholdRoleMap.get(fd.householdId);
            if (role !== "OWNER" && role !== "CO_OWNER") {
              results.push({
                mutationId: mutation.mutationId,
                status: "rejected",
                reason: "Forbidden: Only OWNER and CO_OWNER can update shared fixed deposits",
              });
              continue;
            }
          } else if (fd && fd.userId !== user.id) {
            results.push({
              mutationId: mutation.mutationId,
              status: "rejected",
              reason: "Forbidden: Cannot update another user's fixed deposit",
            });
            continue;
          }

          await (prisma as any).fixedDeposit.updateMany({
            where: { id: mutation.id },
            data: {
              ...(payload.bankName !== undefined && { bankName: payload.bankName }),
              ...(payload.accountNumber !== undefined && { accountNumber: payload.accountNumber }),
              ...(payload.status !== undefined && { status: payload.status }),
              ...(payload.autoRenew !== undefined && { autoRenew: payload.autoRenew }),
              ...(payload.closedAt !== undefined && { closedAt: payload.closedAt ? new Date(payload.closedAt) : null }),
              ...(payload.prematureClosure !== undefined && { prematureClosure: payload.prematureClosure }),
              ...(payload.startDate !== undefined && { startDate: new Date(payload.startDate) }),
              ...(payload.maturityDate !== undefined && { maturityDate: new Date(payload.maturityDate) }),
              ...(payload.principalAmountMinor !== undefined && { principalAmountMinor: payload.principalAmountMinor }),
              serverSeq: nextSeq,
            },
          });
        } else if (mutation.op === "DELETE") {
          const fd = await (prisma as any).fixedDeposit.findUnique({ where: { id: mutation.id } });
          if (fd?.householdId) {
            const role = userHouseholdRoleMap.get(fd.householdId);
            if (role !== "OWNER" && role !== "CO_OWNER") {
              results.push({
                mutationId: mutation.mutationId,
                status: "rejected",
                reason: "Forbidden: Only OWNER and CO_OWNER can delete shared fixed deposits",
              });
              continue;
            }
          } else if (fd && fd.userId !== user.id) {
            results.push({
              mutationId: mutation.mutationId,
              status: "rejected",
              reason: "Forbidden: Cannot delete another user's fixed deposit",
            });
            continue;
          }

          await (prisma as any).fixedDeposit.updateMany({
            where: { id: mutation.id },
            data: {
              deletedAt: new Date(),
              serverSeq: nextSeq,
            },
          });
        }
      } else if (entityLower === "loan") {
        const payload = mutation.payload || {};
        if (mutation.op === "CREATE") {
          if (payload.householdId) {
            const role = userHouseholdRoleMap.get(payload.householdId);
            if (role !== "OWNER" && role !== "CO_OWNER") {
              results.push({
                mutationId: mutation.mutationId,
                status: "rejected",
                reason: "Forbidden: Only OWNER and CO_OWNER can create shared loans",
              });
              continue;
            }
          }

          if (payload.linkedDisbursementAccountId && payload.originalPrincipalMinor > 0) {
            const disbursementTxId = `${mutation.id}-disbursement`;
            const disDate = payload.startDate ? new Date(payload.startDate) : new Date();
            await (prisma as any).transaction.upsert({
              where: { id: disbursementTxId },
              create: {
                id: disbursementTxId,
                userId: user.id,
                accountId: payload.linkedDisbursementAccountId,
                amountMinor: payload.originalPrincipalMinor,
                type: "INCOME",
                subType: "LOAN_DISBURSEMENT",
                source: "SYSTEM",
                createdByUserId: user.id,
                updatedByUserId: user.id,
                transactionDate: disDate,
                note: `${payload.kind === "LEASE" ? "Lease" : "Loan"} Disbursement: ${payload.lenderName || "Disbursement"}`,
                excludeFromBudget: true,
                excludeFromStats: true,
                excludeFromBalance: false,
                serverSeq: nextSeq,
                deletedAt: null,
              },
              update: {},
            });
          }

          await (prisma as any).loan.upsert({
            where: { id: mutation.id },
            create: {
              id: mutation.id,
              userId: user.id,
              householdId: payload.householdId || null,
              kind: payload.kind || "LOAN",
              lenderName: payload.lenderName || "Lender",
              originalPrincipalMinor: payload.originalPrincipalMinor ?? 0,
              residualValueMinor: payload.residualValueMinor ?? 0,
              annualInterestRateBps: payload.annualInterestRateBps ?? 0,
              tenureMonths: payload.tenureMonths ?? 12,
              startDate: payload.startDate ? new Date(payload.startDate) : new Date(),
              monthlyEmiAmountMinor: payload.monthlyEmiAmountMinor ?? 0,
              calculationType: payload.calculationType || "REDUCING_BALANCE",
              linkedDisbursementAccountId: payload.linkedDisbursementAccountId || null,
              status: payload.status || "ACTIVE",
              closedAt: payload.closedAt ? new Date(payload.closedAt) : null,
              serverSeq: nextSeq,
              deletedAt: null,
            },
            update: {
              kind: payload.kind,
              lenderName: payload.lenderName,
              originalPrincipalMinor: payload.originalPrincipalMinor,
              residualValueMinor: payload.residualValueMinor,
              annualInterestRateBps: payload.annualInterestRateBps,
              tenureMonths: payload.tenureMonths,
              startDate: payload.startDate ? new Date(payload.startDate) : undefined,
              monthlyEmiAmountMinor: payload.monthlyEmiAmountMinor,
              calculationType: payload.calculationType,
              linkedDisbursementAccountId: payload.linkedDisbursementAccountId,
              status: payload.status,
              closedAt: payload.closedAt ? new Date(payload.closedAt) : undefined,
              serverSeq: nextSeq,
              deletedAt: null,
            },
          });
        } else if (mutation.op === "UPDATE") {
          const l = await (prisma as any).loan.findUnique({ where: { id: mutation.id } });
          if (l?.householdId) {
            const role = userHouseholdRoleMap.get(l.householdId);
            if (role !== "OWNER" && role !== "CO_OWNER") {
              results.push({
                mutationId: mutation.mutationId,
                status: "rejected",
                reason: "Forbidden: Only OWNER and CO_OWNER can update shared loans",
              });
              continue;
            }
          } else if (l && l.userId !== user.id) {
            results.push({
              mutationId: mutation.mutationId,
              status: "rejected",
              reason: "Forbidden: Cannot update another user's loan",
            });
            continue;
          }

          await (prisma as any).loan.updateMany({
            where: { id: mutation.id },
            data: {
              ...(payload.lenderName !== undefined && { lenderName: payload.lenderName }),
              ...(payload.status !== undefined && { status: payload.status }),
              ...(payload.closedAt !== undefined && { closedAt: payload.closedAt ? new Date(payload.closedAt) : null }),
              ...(payload.monthlyEmiAmountMinor !== undefined && { monthlyEmiAmountMinor: payload.monthlyEmiAmountMinor }),
              ...(payload.tenureMonths !== undefined && { tenureMonths: payload.tenureMonths }),
              serverSeq: nextSeq,
            },
          });
        } else if (mutation.op === "DELETE") {
          const l = await (prisma as any).loan.findUnique({ where: { id: mutation.id } });
          if (l?.householdId) {
            const role = userHouseholdRoleMap.get(l.householdId);
            if (role !== "OWNER" && role !== "CO_OWNER") {
              results.push({
                mutationId: mutation.mutationId,
                status: "rejected",
                reason: "Forbidden: Only OWNER and CO_OWNER can delete shared loans",
              });
              continue;
            }
          } else if (l && l.userId !== user.id) {
            results.push({
              mutationId: mutation.mutationId,
              status: "rejected",
              reason: "Forbidden: Cannot delete another user's loan",
            });
            continue;
          }

          await (prisma as any).loan.updateMany({
            where: { id: mutation.id },
            data: {
              deletedAt: new Date(),
              serverSeq: nextSeq,
            },
          });
        }
      } else if (entityLower === "loanscheduleentry") {
        const payload = mutation.payload || {};
        if (mutation.op === "CREATE") {
          await (prisma as any).loanScheduleEntry.upsert({
            where: { id: mutation.id },
            create: {
              id: mutation.id,
              loanId: payload.loanId,
              installmentNumber: payload.installmentNumber,
              dueDate: payload.dueDate ? new Date(payload.dueDate) : new Date(),
              principalComponentMinor: payload.principalComponentMinor ?? 0,
              interestComponentMinor: payload.interestComponentMinor ?? 0,
              openingBalanceMinor: payload.openingBalanceMinor ?? 0,
              closingBalanceMinor: payload.closingBalanceMinor ?? 0,
              status: payload.status || "SCHEDULED",
              serverSeq: nextSeq,
              deletedAt: null,
            },
            update: {
              principalComponentMinor: payload.principalComponentMinor,
              interestComponentMinor: payload.interestComponentMinor,
              openingBalanceMinor: payload.openingBalanceMinor,
              closingBalanceMinor: payload.closingBalanceMinor,
              status: payload.status,
              dueDate: payload.dueDate ? new Date(payload.dueDate) : undefined,
              serverSeq: nextSeq,
              deletedAt: null,
            },
          });
        } else if (mutation.op === "UPDATE") {
          await (prisma as any).loanScheduleEntry.updateMany({
            where: { id: mutation.id },
            data: {
              ...(payload.principalComponentMinor !== undefined && { principalComponentMinor: payload.principalComponentMinor }),
              ...(payload.interestComponentMinor !== undefined && { interestComponentMinor: payload.interestComponentMinor }),
              ...(payload.openingBalanceMinor !== undefined && { openingBalanceMinor: payload.openingBalanceMinor }),
              ...(payload.closingBalanceMinor !== undefined && { closingBalanceMinor: payload.closingBalanceMinor }),
              ...(payload.status !== undefined && { status: payload.status }),
              serverSeq: nextSeq,
            },
          });
        } else if (mutation.op === "DELETE") {
          await (prisma as any).loanScheduleEntry.updateMany({
            where: { id: mutation.id },
            data: {
              deletedAt: new Date(),
              serverSeq: nextSeq,
            },
          });
        }
      } else if (entityLower === "loanpayment") {
        const payload = mutation.payload || {};
        if (mutation.op === "CREATE") {
          await (prisma as any).loanPayment.upsert({
            where: { id: mutation.id },
            create: {
              id: mutation.id,
              loanId: payload.loanId,
              transactionId: payload.transactionId || null,
              scheduleEntryId: payload.scheduleEntryId || null,
              principalComponentMinor: payload.principalComponentMinor ?? 0,
              interestComponentMinor: payload.interestComponentMinor ?? 0,
              isExtraPrincipal: payload.isExtraPrincipal ?? false,
              paymentDate: payload.paymentDate ? new Date(payload.paymentDate) : new Date(),
              serverSeq: nextSeq,
            },
            update: {},
          });
        }
      }

      // Record applied mutation for idempotency
      try {
        await prisma.appliedMutation.upsert({
          where: { id: mutation.mutationId },
          create: {
            id: mutation.mutationId,
            userId: user.id,
          },
          update: {},
        });
      } catch {
        // If already inserted concurrently, consider applied
      }

      results.push({ mutationId: mutation.mutationId, status: "accepted" });
    } catch (err: any) {
      console.error("Mutation failed:", mutation, err);
      results.push({
        mutationId: mutation.mutationId,
        status: "rejected",
        reason: err.message || "Internal server error applying mutation",
      });
    }
  }

  return NextResponse.json({ results });
}
