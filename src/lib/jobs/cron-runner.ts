import { prisma } from "@/lib/prisma";
import { getServerNow } from "@/lib/server-clock";
import { getNextServerSeq } from "@/lib/server-seq";
import { calculateStatementCycle, getEffectiveDayOfMonth } from "@/lib/finance-core/credit-card";
import { calculateAccountBalance, calculateOutstandingDebt } from "@/lib/finance-core/ledger";

/**
 * Returns date in YYYY-MM-DD format in Asia/Colombo timezone
 */
export function getColomboDateString(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Adds months to a YYYY-MM string
 */
function addMonths(monthStr: string, count: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const totalMonths = y * 12 + (m - 1) + count;
  const newY = Math.floor(totalMonths / 12);
  const newM = (totalMonths % 12) + 1;
  return `${newY}-${String(newM).padStart(2, "0")}`;
}

export async function runCronTick(options?: { now?: Date }): Promise<{
  ok: boolean;
  timestamp: string;
  processedBudgets: number;
  processedStatements: number;
}> {
  const now = options?.now || getServerNow();
  const colomboNowStr = getColomboDateString(now);
  const currentMonthStr = colomboNowStr.slice(0, 7); // YYYY-MM

  let processedBudgets = 0;
  let processedStatements = 0;

  // 1. Budget Rollover & Month-Close Snapshots
  const budgets = await prisma.budget.findMany({
    where: { deletedAt: null },
    include: {
      category: true,
    },
  });

  for (const budget of budgets) {
    // Find all non-deleted transactions relevant to this budget
    const allTxs = await prisma.transaction.findMany({
      where: {
        userId: budget.userId,
        deletedAt: null,
        excludeFromBudget: false,
      },
      include: {
        splitItems: true,
      },
      orderBy: { transactionDate: "asc" },
    });

    // Find earliest transaction month
    let earliestMonth = currentMonthStr;
    if (budget.rolloverStartMonth) {
      earliestMonth = budget.rolloverStartMonth;
    } else {
      for (const t of allTxs) {
        const txMonth = getColomboDateString(t.transactionDate).slice(0, 7);
        if (txMonth < earliestMonth) {
          earliestMonth = txMonth;
        }
      }
    }

    // Process from earliestMonth up to currentMonthStr
    let iterMonth = earliestMonth;
    let runningCarriedOut = 0;

    while (iterMonth <= currentMonthStr) {
      const nextSeq = await getNextServerSeq();
      const isClosedMonth = iterMonth < currentMonthStr;

      // Calculate spent in iterMonth
      let netSpent = 0;
      for (const tx of allTxs) {
        if (tx.type === "TRANSFER" || tx.type === "ADJUSTMENT" || tx.source === "CALIBRATION") {
          continue;
        }
        const txDateColombo = getColomboDateString(tx.transactionDate);
        if (!txDateColombo.startsWith(iterMonth)) {
          continue;
        }

        if (tx.isSplit && tx.splitItems && tx.splitItems.length > 0) {
          for (const item of tx.splitItems) {
            if (item.categoryId === budget.categoryId) {
              if (tx.type === "EXPENSE") netSpent += item.amountMinor;
              if (tx.type === "REFUND") netSpent -= item.amountMinor;
            }
          }
        } else if (tx.categoryId === budget.categoryId) {
          if (tx.type === "EXPENSE") netSpent += tx.amountMinor;
          if (tx.type === "REFUND") netSpent -= tx.amountMinor;
        }
      }

      const spentMinor = Math.max(0, netSpent);
      const carriedInMinor = budget.enableRollover ? runningCarriedOut : 0;
      const carriedOutMinor = budget.enableRollover
        ? budget.monthlyLimitMinor + carriedInMinor - spentMinor
        : 0;

      const snapshotId = `snap_${budget.userId}_${budget.categoryId}_${iterMonth}`;

      if (isClosedMonth) {
        await prisma.budgetMonthSnapshot.upsert({
          where: {
            userId_categoryId_month: {
              userId: budget.userId,
              categoryId: budget.categoryId,
              month: iterMonth,
            },
          },
          create: {
            id: snapshotId,
            userId: budget.userId,
            budgetId: budget.id,
            categoryId: budget.categoryId,
            month: iterMonth,
            limitMinor: budget.monthlyLimitMinor,
            spentMinor,
            carriedInMinor,
            carriedOutMinor,
            serverSeq: nextSeq,
          },
          update: {
            limitMinor: budget.monthlyLimitMinor,
            spentMinor,
            carriedInMinor,
            carriedOutMinor,
            serverSeq: nextSeq,
          },
        });
        runningCarriedOut = carriedOutMinor;
      } else {
        // Current active month: update snapshot with carriedInMinor so client pulls it
        if (budget.enableRollover) {
          await prisma.budgetMonthSnapshot.upsert({
            where: {
              userId_categoryId_month: {
                userId: budget.userId,
                categoryId: budget.categoryId,
                month: iterMonth,
              },
            },
            create: {
              id: snapshotId,
              userId: budget.userId,
              budgetId: budget.id,
              categoryId: budget.categoryId,
              month: iterMonth,
              limitMinor: budget.monthlyLimitMinor,
              spentMinor,
              carriedInMinor,
              carriedOutMinor: 0,
              serverSeq: nextSeq,
            },
            update: {
              limitMinor: budget.monthlyLimitMinor,
              spentMinor,
              carriedInMinor,
              serverSeq: nextSeq,
            },
          });
        }
      }

      iterMonth = addMonths(iterMonth, 1);
    }

    processedBudgets++;
  }

  // 2. Credit Card Statement Snapshots (Step 12)
  const creditCards = await prisma.account.findMany({
    where: {
      type: "CREDIT_CARD",
      isArchived: false,
      deletedAt: null,
      statementCutoffDay: { not: null },
      paymentDueDay: { not: null },
    },
  });

  for (const card of creditCards) {
    if (!card.statementCutoffDay || !card.paymentDueDay) continue;

    const cardTxs = await prisma.transaction.findMany({
      where: {
        OR: [{ accountId: card.id }, { toAccountId: card.id }],
        deletedAt: null,
      },
    });

    const cycle = calculateStatementCycle({
      account: {
        id: card.id,
        type: "CREDIT_CARD",
        openingBalanceMinor: card.openingBalanceMinor,
      },
      transactions: cardTxs.map((t) => ({
        id: t.id,
        accountId: t.accountId,
        toAccountId: t.toAccountId,
        amountMinor: t.amountMinor,
        type: t.type as any,
        direction: t.direction as any,
        transactionDate: t.transactionDate,
        excludeFromBalance: t.excludeFromBalance,
      })),
      creditLimitMinor: card.creditLimitMinor || 0,
      statementCutoffDay: card.statementCutoffDay,
      paymentDueDay: card.paymentDueDay,
      now,
    });

    const cutoffDateStr = cycle.lastCutoffDate.toISOString().slice(0, 10);
    const stmtId = `stmt_${card.id}_${cutoffDateStr}`;

    const nextSeq = await getNextServerSeq();
    await prisma.creditCardStatement.upsert({
      where: {
        accountId_cycleCutoffDate: {
          accountId: card.id,
          cycleCutoffDate: cycle.lastCutoffDate,
        },
      },
      create: {
        id: stmtId,
        userId: card.userId,
        accountId: card.id,
        cycleStartDate: new Date(cycle.lastCutoffDate.getFullYear(), cycle.lastCutoffDate.getMonth() - 1, card.statementCutoffDay),
        cycleCutoffDate: cycle.lastCutoffDate,
        dueDate: cycle.dueDate,
        billedDebtMinor: cycle.billedBalanceMinor,
        totalDebtMinor: cycle.outstandingDebtMinor,
        isSettled: cycle.billedBalanceMinor === 0,
        serverSeq: nextSeq,
      },
      update: {
        billedDebtMinor: cycle.billedBalanceMinor,
        totalDebtMinor: cycle.outstandingDebtMinor,
        dueDate: cycle.dueDate,
        isSettled: cycle.billedBalanceMinor === 0,
        serverSeq: nextSeq,
      },
    });

    processedStatements++;
  }

  return {
    ok: true,
    timestamp: now.toISOString(),
    processedBudgets,
    processedStatements,
  };
}
