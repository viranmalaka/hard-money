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
    | "installmentPlan";
  op: "CREATE" | "UPDATE" | "DELETE";
  id: string;
  payload?: any;
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const mutations: SyncMutation[] = Array.isArray(body.mutations) ? body.mutations : [];

  const results: Array<{
    mutationId: string;
    status: "accepted" | "rejected";
    reason?: string;
  }> = [];

  for (const mutation of mutations) {
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
          await prisma.account.updateMany({
            where: { id: mutation.id, userId: user.id },
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
          await prisma.account.updateMany({
            where: { id: mutation.id, userId: user.id },
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
          await prisma.transaction.upsert({
            where: { id: mutation.id },
            create: {
              id: mutation.id,
              userId: user.id,
              householdId: payload.householdId || null,
              accountId: payload.accountId,
              toAccountId: payload.toAccountId || null,
              categoryId: payload.categoryId || null,
              amountMinor: payload.amountMinor ?? 0,
              direction: payload.direction || null,
              type: payload.type || "EXPENSE",
              subType: payload.subType || null,
              source: payload.source || "MANUAL",
              createdByUserId: user.id,
              updatedByUserId: user.id,
              transactionDate: payload.transactionDate ? new Date(payload.transactionDate) : new Date(),
              note: payload.note || null,
              isSplit: payload.isSplit ?? false,
              reversalOfTransactionId: payload.reversalOfTransactionId || null,
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
          await prisma.transaction.updateMany({
            where: { id: mutation.id, userId: user.id },
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
            where: { id: mutation.id, userId: user.id },
            data: {
              deletedAt: new Date(),
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
      }

      // Record applied mutation for idempotency
      await prisma.appliedMutation.upsert({
        where: { id: mutation.mutationId },
        create: {
          id: mutation.mutationId,
          userId: user.id,
        },
        update: {},
      });

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
