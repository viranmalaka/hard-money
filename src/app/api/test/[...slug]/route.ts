import { NextRequest, NextResponse } from "next/server";
import { getServerNow, setServerNow, resetServerClock } from "@/lib/server-clock";
import { resetTestSyncHooks, addFailingMutationEntityId } from "@/lib/test-sync-hook";
import {
  enqueueMockGeminiResponse,
  getCapturedGeminiRequests,
  clearGeminiMockState,
} from "@/lib/sms/gemini-provider";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  if (process.env.E2E_MODE !== "1" || request.headers.get("x-disable-e2e-mode") === "1") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { slug } = await params;
  const action = slug[0];

  switch (action) {
    case "reset": {
      resetServerClock();
      resetTestSyncHooks();
      clearGeminiMockState();
      try {
        const { clearPushOutbox } = await import("@/lib/push/outbox");
        clearPushOutbox();
      } catch {
        // ignore
      }
      const { clearCapturedLogs } = await import("@/lib/server-log");
      clearCapturedLogs();
      try {
        const { resetRateLimits } = await import("@/app/api/v1/webhooks/sms-ingress/route");
        resetRateLimits();
      } catch {
        // ignore
      }
      try {
        const { setWorkerPaused } = await import("@/lib/sms/worker");
        setWorkerPaused(false);
      } catch {
        // ignore
      }
      try {
        const { prisma } = await import("@/lib/prisma");
        await prisma.$executeRawUnsafe(
          'TRUNCATE TABLE "User", "Account", "Category", "Transaction", "TransactionSplitItem", "TransactionTemplate", "Budget", "BudgetMonthSnapshot", "CreditCardStatement", "CreditCardInstallmentPlan", "BankSms", "Household", "HouseholdMember", "FixedDeposit", "FixedDepositPayout", "Loan", "LoanScheduleEntry", "LoanPayment", "PushSubscription", "SyncSequence", "AppliedMutation" CASCADE;'
        );
        try {
          await prisma.$executeRawUnsafe("ALTER SEQUENCE IF EXISTS global_server_seq RESTART WITH 1");
        } catch {
          // ignore
        }
      } catch (e) {
        console.error("Failed to reset database:", e);
      }
      return NextResponse.json({ ok: true, message: "Reset successful" });
    }

    case "clock": {
      const body = await request.json().catch(() => ({}));
      if (body.now) {
        setServerNow(body.now);
      } else {
        resetServerClock();
      }
      return NextResponse.json({ ok: true, now: getServerNow().toISOString() });
    }

    case "seed": {
      const body = await request.json().catch(() => ({}));
      const { prisma } = await import("@/lib/prisma");
      const { getNextServerSeq } = await import("@/lib/server-seq");

      if (Array.isArray(body.categories)) {
        for (const cat of body.categories) {
          const nextSeq = await getNextServerSeq();
          await prisma.category.upsert({
            where: { id: cat.id },
            create: {
              id: cat.id,
              userId: cat.userId || null,
              name: cat.name,
              icon: cat.icon || "📁",
              color: cat.color || "#10b981",
              serverSeq: nextSeq,
            },
            update: {
              name: cat.name,
              icon: cat.icon || "📁",
              color: cat.color || "#10b981",
              serverSeq: nextSeq,
            },
          });
        }
      }

      if (Array.isArray(body.users)) {
        for (const u of body.users) {
          await (prisma.user as any).upsert({
            where: { id: u.id },
            create: {
              id: u.id,
              name: u.name || "Test User",
              email: u.email || `${u.id}@example.com`,
              apiKeyHash: u.apiKeyHash || null,
              apiKeyPrefix: u.apiKeyPrefix || null,
              pushRemindersEnabled: u.pushRemindersEnabled ?? false,
              dailyReminderTime: u.dailyReminderTime || "20:00",
            },
            update: {
              apiKeyHash: u.apiKeyHash || null,
              apiKeyPrefix: u.apiKeyPrefix || null,
              pushRemindersEnabled: u.pushRemindersEnabled !== undefined ? u.pushRemindersEnabled : undefined,
              dailyReminderTime: u.dailyReminderTime || undefined,
            },
          });
        }
      }

      if (Array.isArray(body.households)) {
        for (const h of body.households) {
          await (prisma as any).household.upsert({
            where: { id: h.id },
            create: {
              id: h.id,
              name: h.name || "Test Household",
              ownerId: h.ownerId,
            },
            update: {
              name: h.name,
              ownerId: h.ownerId,
            },
          });
        }
      }

      if (Array.isArray(body.householdMembers)) {
        for (const m of body.householdMembers) {
          await (prisma as any).householdMember.upsert({
            where: {
              householdId_userId: {
                householdId: m.householdId,
                userId: m.userId,
              },
            },
            create: {
              id: m.id || `${m.householdId}-${m.userId}`,
              householdId: m.householdId,
              userId: m.userId,
              role: m.role || "MEMBER",
            },
            update: {
              role: m.role,
            },
          });
        }
      }

      if (Array.isArray(body.accounts)) {
        for (const acc of body.accounts) {
          const nextSeq = await getNextServerSeq();
          const senderIds = Array.isArray(acc.bankSenderIds)
            ? acc.bankSenderIds
            : acc.bankSenderIds
            ? [acc.bankSenderIds]
            : [];
          await prisma.account.upsert({
            where: { id: acc.id },
            create: {
              id: acc.id,
              userId: acc.userId,
              householdId: acc.householdId || null,
              accessScope: acc.accessScope || "PRIVATE",
              name: acc.name,
              type: acc.type || "CASH",
              openingBalanceMinor: acc.openingBalanceMinor ?? 0,
              currency: acc.currency || "LKR",
              creditLimitMinor: acc.creditLimitMinor ?? null,
              statementCutoffDay: acc.statementCutoffDay ?? null,
              paymentDueDay: acc.paymentDueDay ?? null,
              accountNumberLast4: acc.accountNumberLast4 ?? null,
              ownAtmFeeMinor: acc.ownAtmFeeMinor ?? 0,
              otherAtmFeeMinor: acc.otherAtmFeeMinor ?? 0,
              bankSenderIds: senderIds,
              serverSeq: nextSeq,
            },
            update: {
              name: acc.name,
              householdId: acc.householdId || null,
              accessScope: acc.accessScope || "PRIVATE",
              type: acc.type || "CASH",
              openingBalanceMinor: acc.openingBalanceMinor ?? 0,
              currency: acc.currency || "LKR",
              creditLimitMinor: acc.creditLimitMinor ?? null,
              statementCutoffDay: acc.statementCutoffDay ?? null,
              paymentDueDay: acc.paymentDueDay ?? null,
              accountNumberLast4: acc.accountNumberLast4 ?? null,
              ownAtmFeeMinor: acc.ownAtmFeeMinor ?? 0,
              otherAtmFeeMinor: acc.otherAtmFeeMinor ?? 0,
              bankSenderIds: senderIds,
              serverSeq: nextSeq,
            },
          });
        }
      }

      if (Array.isArray(body.budgets)) {
        for (const b of body.budgets) {
          const nextSeq = await getNextServerSeq();
          // Ensure category exists
          if (b.categoryId) {
            await prisma.category.upsert({
              where: { id: b.categoryId },
              create: {
                id: b.categoryId,
                userId: b.userId,
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
                userId: b.userId,
                categoryId: b.categoryId,
              },
            },
            create: {
              id: b.id,
              userId: b.userId,
              categoryId: b.categoryId,
              monthlyLimitMinor: b.monthlyLimitMinor,
              enableRollover: b.enableRollover ?? false,
              rolloverStartMonth: b.rolloverStartMonth || null,
              serverSeq: nextSeq,
            },
            update: {
              monthlyLimitMinor: b.monthlyLimitMinor,
              enableRollover: b.enableRollover ?? false,
              rolloverStartMonth: b.rolloverStartMonth || null,
              serverSeq: nextSeq,
            },
          });
        }
      }

      if (Array.isArray(body.transactions)) {
        for (const t of body.transactions) {
          const nextSeq = await getNextServerSeq();
          // Ensure account exists
          if (t.accountId) {
            await prisma.account.upsert({
              where: { id: t.accountId },
              create: {
                id: t.accountId,
                userId: t.userId,
                name: "Cash Wallet",
                type: "CASH",
                openingBalanceMinor: 0,
                serverSeq: nextSeq,
              },
              update: {},
            });
          }
          await prisma.transaction.upsert({
            where: { id: t.id },
            create: {
              id: t.id,
              userId: t.userId,
              householdId: t.householdId || null,
              accountId: t.accountId,
              toAccountId: t.toAccountId || null,
              categoryId: t.categoryId || null,
              amountMinor: t.amountMinor,
              type: t.type || "EXPENSE",
              subType: t.subType || null,
              direction: t.direction || (t.type === "INCOME" ? "IN" : "OUT"),
              source: t.source || "MANUAL",
              createdByUserId: t.createdByUserId || t.userId,
              updatedByUserId: t.updatedByUserId || t.userId,
              transactionDate: new Date(t.transactionDate),
              note: t.note || null,
              isSplit: t.isSplit || false,
              excludeFromBudget: t.excludeFromBudget || false,
              excludeFromStats: t.excludeFromStats || false,
              excludeFromBalance: t.excludeFromBalance || false,
              installmentPlanId: t.installmentPlanId || null,
              feeTransactionId: t.feeTransactionId || null,
              possibleDuplicateOfTransactionId: t.possibleDuplicateOfTransactionId || null,
              serverSeq: nextSeq,
            },
            update: {
              amountMinor: t.amountMinor,
              type: t.type || "EXPENSE",
              subType: t.subType || null,
              note: t.note || null,
              transactionDate: new Date(t.transactionDate),
              excludeFromBudget: t.excludeFromBudget || false,
              excludeFromStats: t.excludeFromStats || false,
              excludeFromBalance: t.excludeFromBalance || false,
              installmentPlanId: t.installmentPlanId || null,
              feeTransactionId: t.feeTransactionId || null,
              possibleDuplicateOfTransactionId: t.possibleDuplicateOfTransactionId || null,
              serverSeq: nextSeq,
            },
          });
        }
      }

      if (Array.isArray(body.installmentPlans)) {
        for (const plan of body.installmentPlans) {
          const nextSeq = await getNextServerSeq();
          await prisma.creditCardInstallmentPlan.upsert({
            where: { id: plan.id },
            create: {
              id: plan.id,
              userId: plan.userId,
              accountId: plan.accountId,
              categoryId: plan.categoryId || null,
              merchantName: plan.merchantName || "Installment Plan",
              totalAmountMinor: plan.totalAmountMinor ?? 0,
              tenureMonths: plan.tenureMonths ?? 1,
              monthlyAmountMinor: plan.monthlyAmountMinor ?? 0,
              finalInstallmentAmountMinor: plan.finalInstallmentAmountMinor ?? 0,
              initialPaidInstallments: plan.initialPaidInstallments ?? 0,
              processingFeeMinor: plan.processingFeeMinor ?? 0,
              processingFeeBilled: plan.processingFeeBilled ?? false,
              startDate: new Date(plan.startDate || new Date()),
              firstStatementDate: new Date(plan.firstStatementDate || new Date()),
              isOngoingSetup: plan.isOngoingSetup ?? false,
              status: plan.status || "ACTIVE",
              originalTransactionId: plan.originalTransactionId || null,
              note: plan.note || null,
              serverSeq: nextSeq,
            },
            update: {
              status: plan.status,
              serverSeq: nextSeq,
            },
          });
        }
      }

      if (Array.isArray(body.fixedDeposits)) {
        for (const fd of body.fixedDeposits) {
          const nextSeq = await getNextServerSeq();
          await (prisma as any).fixedDeposit.upsert({
            where: { id: fd.id },
            create: {
              id: fd.id,
              userId: fd.userId,
              householdId: fd.householdId || null,
              bankName: fd.bankName,
              accountNumber: fd.accountNumber || null,
              principalAmountMinor: fd.principalAmountMinor,
              annualInterestRateBps: fd.annualInterestRateBps,
              tenureMonths: fd.tenureMonths,
              startDate: new Date(fd.startDate),
              maturityDate: new Date(fd.maturityDate),
              compoundingFrequency: fd.compoundingFrequency || "MONTHLY",
              payoutMode: fd.payoutMode || "MONTHLY_PAYOUT_TO_ACCOUNT",
              linkedPayoutAccountId: fd.linkedPayoutAccountId || null,
              fundingAccountId: fd.fundingAccountId || null,
              withholdingTaxRateBps: fd.withholdingTaxRateBps ?? 0,
              autoRenew: fd.autoRenew ?? false,
              status: fd.status || "ACTIVE",
              closedAt: fd.closedAt ? new Date(fd.closedAt) : null,
              prematureClosure: fd.prematureClosure ?? false,
              serverSeq: nextSeq,
            },
            update: {
              status: fd.status,
              principalAmountMinor: fd.principalAmountMinor,
              serverSeq: nextSeq,
            },
          });
        }
      }

      if (Array.isArray(body.fixedDepositPayouts)) {
        for (const p of body.fixedDepositPayouts) {
          const nextSeq = await getNextServerSeq();
          await (prisma as any).fixedDepositPayout.upsert({
            where: { id: p.id },
            create: {
              id: p.id,
              fixedDepositId: p.fixedDepositId,
              periodEnd: new Date(p.periodEnd),
              grossInterestMinor: p.grossInterestMinor,
              taxWithheldMinor: p.taxWithheldMinor,
              netInterestMinor: p.netInterestMinor,
              transactionId: p.transactionId || null,
              serverSeq: nextSeq,
            },
            update: {
              serverSeq: nextSeq,
            },
          });
        }
      }

      if (Array.isArray(body.loans)) {
        for (const l of body.loans) {
          const nextSeq = await getNextServerSeq();
          await (prisma as any).loan.upsert({
            where: { id: l.id },
            create: {
              id: l.id,
              userId: l.userId,
              householdId: l.householdId || null,
              kind: l.kind || "LOAN",
              lenderName: l.lenderName || "Lender",
              originalPrincipalMinor: l.originalPrincipalMinor,
              residualValueMinor: l.residualValueMinor || 0,
              annualInterestRateBps: l.annualInterestRateBps,
              tenureMonths: l.tenureMonths,
              startDate: new Date(l.startDate),
              monthlyEmiAmountMinor: l.monthlyEmiAmountMinor ?? 0,
              calculationType: l.calculationType || "REDUCING_BALANCE",
              linkedDisbursementAccountId: l.linkedDisbursementAccountId || null,
              status: l.status || "ACTIVE",
              closedAt: l.closedAt ? new Date(l.closedAt) : null,
              serverSeq: nextSeq,
            },
            update: {
              status: l.status,
              serverSeq: nextSeq,
            },
          });
        }
      }

      if (Array.isArray(body.loanScheduleEntries)) {
        for (const se of body.loanScheduleEntries) {
          const nextSeq = await getNextServerSeq();
          await (prisma as any).loanScheduleEntry.upsert({
            where: { id: se.id },
            create: {
              id: se.id,
              loanId: se.loanId,
              installmentNumber: se.installmentNumber,
              dueDate: new Date(se.dueDate),
              principalComponentMinor: se.principalComponentMinor,
              interestComponentMinor: se.interestComponentMinor,
              openingBalanceMinor: se.openingBalanceMinor,
              closingBalanceMinor: se.closingBalanceMinor,
              status: se.status || "SCHEDULED",
              serverSeq: nextSeq,
            },
            update: {
              status: se.status,
              principalComponentMinor: se.principalComponentMinor,
              interestComponentMinor: se.interestComponentMinor,
              serverSeq: nextSeq,
            },
          });
        }
      }

      if (Array.isArray(body.loanPayments)) {
        for (const lp of body.loanPayments) {
          const nextSeq = await getNextServerSeq();
          await (prisma as any).loanPayment.upsert({
            where: { id: lp.id },
            create: {
              id: lp.id,
              loanId: lp.loanId,
              transactionId: lp.transactionId || null,
              scheduleEntryId: lp.scheduleEntryId || null,
              principalComponentMinor: lp.principalComponentMinor,
              interestComponentMinor: lp.interestComponentMinor,
              isExtraPrincipal: lp.isExtraPrincipal ?? false,
              paymentDate: lp.paymentDate ? new Date(lp.paymentDate) : new Date(),
              serverSeq: nextSeq,
            },
            update: {
              serverSeq: nextSeq,
            },
          });
        }
      }

      return NextResponse.json({ ok: true, seeded: body });
    }

    case "tick": {
      const { runCronTick } = await import("@/lib/jobs/cron-runner");
      const result = await runCronTick({ now: getServerNow() });
      try {
        const { processAllPendingBankSms } = await import("@/lib/sms/worker");
        await processAllPendingBankSms();
      } catch {
        // ignore
      }
      return NextResponse.json({ ok: true, tickedAt: getServerNow().toISOString(), result });
    }

    case "pause-worker": {
      const body = await request.json().catch(() => ({}));
      const { setWorkerPaused } = await import("@/lib/sms/worker");
      setWorkerPaused(body.paused ?? true);
      return NextResponse.json({ ok: true, paused: body.paused ?? true });
    }

    case "process-sms": {
      const { processAllPendingBankSms } = await import("@/lib/sms/worker");
      const count = await processAllPendingBankSms();
      return NextResponse.json({ ok: true, processed: count });
    }

    case "gemini": {
      const body = await request.json().catch(() => ({}));
      enqueueMockGeminiResponse(body);
      return NextResponse.json({ ok: true });
    }

    case "clear-logs": {
      const { clearCapturedLogs } = await import("@/lib/server-log");
      clearCapturedLogs();
      return NextResponse.json({ ok: true });
    }

    case "fail-mutation": {
      const body = await request.json().catch(() => ({}));
      if (body.entityId) {
        addFailingMutationEntityId(body.entityId);
      }
      return NextResponse.json({ ok: true, entityId: body.entityId });
    }

    case "push-outbox": {
      const { getPushOutbox, clearPushOutbox } = await import("@/lib/push/outbox");
      const body = await request.json().catch(() => ({}));
      if (body.clear) {
        clearPushOutbox();
        return NextResponse.json({ ok: true, outbox: [] });
      }
      return NextResponse.json({ ok: true, outbox: getPushOutbox() });
    }

    case "push-subscriptions": {
      const { prisma } = await import("@/lib/prisma");
      const subs = await (prisma as any).pushSubscription.findMany();
      return NextResponse.json({ ok: true, subscriptions: subs });
    }

    default:
      return new NextResponse("Not Found", { status: 404 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  if (process.env.E2E_MODE !== "1" || request.headers.get("x-disable-e2e-mode") === "1") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { slug } = await params;
  const action = slug[0];

  switch (action) {
    case "gemini-requests": {
      return NextResponse.json({ requests: getCapturedGeminiRequests() });
    }

    case "logs": {
      const { getCapturedLogs } = await import("@/lib/server-log");
      return NextResponse.json({ logs: getCapturedLogs() });
    }

    case "snapshot": {
      try {
        const { prisma } = await import("@/lib/prisma");
        const [
          accounts,
          categories,
          transactions,
          budgets,
          budgetSnapshots,
          creditCardStatements,
          installmentPlans,
          bankSms,
          fixedDeposits,
          fixedDepositPayouts,
          loans,
          loanScheduleEntries,
          loanPayments,
        ] = await Promise.all([
          prisma.account.findMany({ where: { deletedAt: null } }),
          prisma.category.findMany({ where: { deletedAt: null } }),
          prisma.transaction.findMany({ where: { deletedAt: null } }),
          prisma.budget.findMany({ where: { deletedAt: null } }),
          prisma.budgetMonthSnapshot.findMany(),
          prisma.creditCardStatement.findMany(),
          prisma.creditCardInstallmentPlan.findMany({ where: { deletedAt: null } }),
          prisma.bankSms.findMany({ orderBy: { receivedAt: "desc" } }),
          (prisma as any).fixedDeposit.findMany({ where: { deletedAt: null } }),
          (prisma as any).fixedDepositPayout.findMany(),
          (prisma as any).loan.findMany({ where: { deletedAt: null } }),
          (prisma as any).loanScheduleEntry.findMany({ where: { deletedAt: null } }),
          (prisma as any).loanPayment.findMany(),
        ]);

        const balances: Record<string, number> = {};
        for (const a of accounts) {
          balances[a.id] = a.openingBalanceMinor;
        }

        return NextResponse.json({
          now: getServerNow().toISOString(),
          accounts: accounts.map((a: any) => ({ ...a, serverSeq: Number(a.serverSeq) })),
          categories: categories.map((c: any) => ({ ...c, serverSeq: Number(c.serverSeq) })),
          transactions: transactions.map((t: any) => ({ ...t, serverSeq: Number(t.serverSeq) })),
          budgets: budgets.map((b: any) => ({ ...b, serverSeq: Number(b.serverSeq) })),
          budgetSnapshots: budgetSnapshots.map((bs: any) => ({ ...bs, serverSeq: Number(bs.serverSeq) })),
          creditCardStatements: creditCardStatements.map((ccs: any) => ({ ...ccs, serverSeq: Number(ccs.serverSeq) })),
          installmentPlans: installmentPlans.map((p: any) => ({ ...p, serverSeq: Number(p.serverSeq) })),
          bankSms,
          fixedDeposits: fixedDeposits.map((fd: any) => ({ ...fd, serverSeq: Number(fd.serverSeq) })),
          fixedDepositPayouts: fixedDepositPayouts.map((fdp: any) => ({ ...fdp, serverSeq: Number(fdp.serverSeq) })),
          loans: loans.map((l: any) => ({ ...l, serverSeq: Number(l.serverSeq) })),
          loanScheduleEntries: loanScheduleEntries.map((se: any) => ({ ...se, serverSeq: Number(se.serverSeq) })),
          loanPayments: loanPayments.map((lp: any) => ({ ...lp, serverSeq: Number(lp.serverSeq) })),
          balances,
        });
      } catch (err: unknown) {
        console.error("SNAPSHOT ERROR:", err);
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    case "push-outbox": {
      const { getPushOutbox, clearPushOutbox } = await import("@/lib/push/outbox");
      const body = await request.json().catch(() => ({}));
      if (body.clear) {
        clearPushOutbox();
        return NextResponse.json({ ok: true, outbox: [] });
      }
      return NextResponse.json({ ok: true, outbox: getPushOutbox() });
    }

    case "push-subscriptions": {
      const { prisma } = await import("@/lib/prisma");
      const subs = await (prisma as any).pushSubscription.findMany();
      return NextResponse.json({ ok: true, subscriptions: subs });
    }

    default:
      return new NextResponse("Not Found", { status: 404 });
  }
}
