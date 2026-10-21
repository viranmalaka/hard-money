import { prisma } from "@/lib/prisma";
import { getServerNow } from "@/lib/server-clock";
import { getNextServerSeq } from "@/lib/server-seq";
import { calculateStatementCycle, getEffectiveDayOfMonth } from "@/lib/finance-core/credit-card";
import { calculateAccountBalance, calculateOutstandingDebt } from "@/lib/finance-core/ledger";
import { calculateMonthlyPayout, calculateCompoundMaturity } from "@/lib/finance-core/investments";
import { v5 as uuidv5 } from "uuid";

const FD_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

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
  processedInstallmentPlans: number;
  processedFixedDepositPayouts: number;
  processedPushReminders?: number;
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

  // 3. 0% Installment Plans catch-up job (Step 13)
  const activePlans = await prisma.creditCardInstallmentPlan.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
    },
    include: {
      account: true,
    },
  });

  let processedInstallmentPlans = 0;

  for (const plan of activePlans) {
    const card = plan.account;
    const { getColomboDateParts, getColomboEndOfDay } = await import("@/lib/finance-core/credit-card");
    const startParts = getColomboDateParts(plan.firstStatementDate);
    let curYear = startParts.year;
    let curMonth = startParts.month;
    const cutoffDay = card.statementCutoffDay || startParts.day;

    let loopGuard = 0;
    while (loopGuard++ < 120) {
      const cutoffDate = getColomboEndOfDay(curYear, curMonth, cutoffDay);
      if (cutoffDate.getTime() > now.getTime()) {
        break; // cutoff in future
      }

      const cutoffDateStr = getColomboDateString(cutoffDate);
      const deterministicId = `inst_${plan.id}_${cutoffDateStr}`;

      const existingTx = await prisma.transaction.findUnique({
        where: { id: deterministicId },
      });

      if (!existingTx) {
        const existingCount = await prisma.transaction.count({
          where: { installmentPlanId: plan.id, deletedAt: null },
        });
        const currentPaid = plan.initialPaidInstallments + existingCount;
        if (currentPaid < plan.tenureMonths) {
          const installmentIndex = currentPaid + 1;
          const isFinal = installmentIndex >= plan.tenureMonths;
          const amount = isFinal ? plan.finalInstallmentAmountMinor : plan.monthlyAmountMinor;
          const nextSeq = await getNextServerSeq();

          await prisma.transaction.create({
            data: {
              id: deterministicId,
              userId: plan.userId,
              accountId: plan.accountId,
              categoryId: plan.categoryId || null,
              amountMinor: amount,
              type: "EXPENSE",
              subType: "CC_INSTALLMENT",
              source: "SYSTEM",
              createdByUserId: plan.userId,
              updatedByUserId: plan.userId,
              transactionDate: cutoffDate,
              note: `${plan.merchantName} (Installment ${installmentIndex} of ${plan.tenureMonths})`,
              excludeFromBudget: false,
              excludeFromStats: false,
              excludeFromBalance: false,
              installmentPlanId: plan.id,
              serverSeq: nextSeq,
            },
          });

          if (installmentIndex >= plan.tenureMonths) {
            await prisma.creditCardInstallmentPlan.update({
              where: { id: plan.id },
              data: { status: "COMPLETED", serverSeq: nextSeq },
            });
            break;
          }
        }
      }

      curMonth++;
      if (curMonth > 12) {
        curMonth = 1;
        curYear++;
      }
    }

    // Check if plan reached completion
    const totalBilled = await prisma.transaction.count({
      where: { installmentPlanId: plan.id, deletedAt: null },
    });
    if (plan.initialPaidInstallments + totalBilled >= plan.tenureMonths && plan.status === "ACTIVE") {
      const nextSeq = await getNextServerSeq();
      await prisma.creditCardInstallmentPlan.update({
        where: { id: plan.id },
        data: { status: "COMPLETED", serverSeq: nextSeq },
      });
    }

    processedInstallmentPlans++;
  }

  // 4. Fixed Deposit Monthly Payouts & Maturation
  let processedFixedDepositPayouts = 0;
  const fds = await (prisma as any).fixedDeposit.findMany({
    where: {
      deletedAt: null,
      status: { in: ["ACTIVE", "MATURED"] },
    },
    include: {
      payouts: true,
    },
  });

  for (const fd of fds) {
    if (fd.payoutMode === "MONTHLY_PAYOUT_TO_ACCOUNT" && fd.linkedPayoutAccountId) {
      const startDate = new Date(fd.startDate);
      const maturityDate = new Date(fd.maturityDate);

      for (let monthIdx = 1; monthIdx <= fd.tenureMonths; monthIdx++) {
        const payoutDate = new Date(startDate);
        payoutDate.setMonth(payoutDate.getMonth() + monthIdx);

        if (payoutDate.getTime() > now.getTime()) {
          break;
        }

        const periodEndIso = getColomboDateString(payoutDate);
        const deterministicPayoutId = uuidv5(`${fd.id}:PAYOUT:${periodEndIso}`, FD_NAMESPACE);
        const deterministicTxId = uuidv5(`${fd.id}:PAYOUT_TX:${periodEndIso}`, FD_NAMESPACE);

        const existingPayout = fd.payouts?.some((p: any) => p.id === deterministicPayoutId) ||
          await (prisma as any).fixedDepositPayout.findUnique({ where: { id: deterministicPayoutId } });

        if (existingPayout) {
          continue;
        }

        const payoutCalc = calculateMonthlyPayout(
          fd.principalAmountMinor,
          fd.annualInterestRateBps,
          fd.withholdingTaxRateBps
        );

        const nextSeq = await getNextServerSeq();

        let investmentCategory = await prisma.category.findFirst({
          where: {
            name: "Investment Yield",
            OR: [{ userId: fd.userId }, { userId: null }],
          },
        });
        if (!investmentCategory) {
          investmentCategory = await prisma.category.create({
            data: {
              userId: fd.userId,
              name: "Investment Yield", type: "INCOME",
              icon: "📈",
              color: "#10b981",
              serverSeq: nextSeq,
            },
          });
        }

        await (prisma as any).transaction.create({
          data: {
            id: deterministicTxId,
            userId: fd.userId,
            accountId: fd.linkedPayoutAccountId,
            categoryId: investmentCategory.id,
            amountMinor: payoutCalc.netInterestMinor,
            type: "INCOME",
            subType: "FD_INTEREST",
            source: "SYSTEM",
            createdByUserId: fd.userId,
            updatedByUserId: fd.userId,
            transactionDate: payoutDate,
            note: `Fixed Deposit Interest: ${fd.bankName}`,
            excludeFromBudget: false,
            excludeFromStats: false,
            excludeFromBalance: false,
            serverSeq: nextSeq,
          },
        });

        await (prisma as any).fixedDepositPayout.create({
          data: {
            id: deterministicPayoutId,
            fixedDepositId: fd.id,
            periodEnd: payoutDate,
            grossInterestMinor: payoutCalc.grossInterestMinor,
            taxWithheldMinor: payoutCalc.taxWithheldMinor,
            netInterestMinor: payoutCalc.netInterestMinor,
            transactionId: deterministicTxId,
            serverSeq: nextSeq,
          },
        });

        processedFixedDepositPayouts++;
      }
    }

    // Check maturation
    const maturityDate = new Date(fd.maturityDate);
    if (now.getTime() >= maturityDate.getTime() && fd.status === "ACTIVE") {
      const nextSeq = await getNextServerSeq();
      if (fd.autoRenew) {
        const newStartDate = new Date(maturityDate);
        const newMaturityDate = new Date(maturityDate);
        newMaturityDate.setMonth(newMaturityDate.getMonth() + fd.tenureMonths);

        let newPrincipalMinor = fd.principalAmountMinor;
        if (fd.payoutMode === "REINVEST_COMPOUND") {
          const comp = calculateCompoundMaturity(
            fd.principalAmountMinor,
            fd.annualInterestRateBps,
            fd.tenureMonths,
            fd.compoundingFrequency,
            fd.withholdingTaxRateBps
          );
          newPrincipalMinor = comp.maturityNetAmountMinor;
        }

        await (prisma as any).fixedDeposit.update({
          where: { id: fd.id },
          data: {
            principalAmountMinor: newPrincipalMinor,
            startDate: newStartDate,
            maturityDate: newMaturityDate,
            status: "ACTIVE",
            serverSeq: nextSeq,
          },
        });
      } else {
        await (prisma as any).fixedDeposit.update({
          where: { id: fd.id },
          data: {
            status: "MATURED",
            serverSeq: nextSeq,
          },
        });
      }
    }
  }

  // 5. Daily Push Reminders
  let processedPushReminders = 0;
  const reminderUsers = await (prisma as any).user.findMany({
    where: {
      pushRemindersEnabled: true,
    },
    include: {
      pushSubscriptions: true,
    },
  });

  const { enqueuePushNotification } = await import("@/lib/push/outbox");
  for (const u of reminderUsers) {
    const tz = u.timezone || "Asia/Colombo";
    let userTime = "20:00";
    try {
      userTime = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now);
    } catch {
      // fallback
    }

    const configuredTime = u.dailyReminderTime || "20:00";
    if (userTime >= configuredTime) {
      enqueuePushNotification(u.id, {
        title: "Daily Spending Reminder",
        body: "Don't forget to review your daily expenses and balances!",
        url: "/",
      });
      processedPushReminders++;
    }
  }

  return {
    ok: true,
    timestamp: now.toISOString(),
    processedBudgets,
    processedStatements,
    processedInstallmentPlans,
    processedFixedDepositPayouts,
    processedPushReminders,
  };
}
