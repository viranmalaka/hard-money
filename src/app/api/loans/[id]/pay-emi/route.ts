import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reamortizeRemainingSchedule } from "@/lib/finance-core/loans";
import { addMonthsOnDay } from "@/lib/finance-core/dates";
import { getNextServerSeq } from "@/lib/server-seq";
import { v4 as uuidv4 } from "uuid";
import { authorizeLoan, assertCanWriteAccount } from "@/lib/authorization";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const {
    accountId,
    scheduleEntryId,
    amountMinor,
    isExtraPrincipal = false,
    mode = "LOWER_EMI",
  } = body;

  if (
    !accountId ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0
  ) {
    return NextResponse.json({ error: "Account and valid amount required" }, { status: 400 });
  }

  const authorizedLoan = await authorizeLoan(session, id, "write");
  if (!authorizedLoan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });
  const account = await assertCanWriteAccount(session, accountId);
  if (!account) return NextResponse.json({ error: "Forbidden account" }, { status: 403 });
  const loanWithDetails = await (prisma as any).loan.findFirst({
    where: { id, deletedAt: null },
    include: {
      scheduleEntries: {
        where: { deletedAt: null },
        orderBy: { installmentNumber: "asc" },
      },
      payments: true,
    },
  });

  const loan = loanWithDetails;
  if (!loan) {
    return NextResponse.json({ error: "Loan not found" }, { status: 404 });
  }
  if (loan.status !== "ACTIVE") {
    return NextResponse.json({ error: "Loan is not active" }, { status: 409 });
  }

  const now = new Date();
  const txId = uuidv4();
  const paymentId = uuidv4();

  let principalComponent = 0;
  let interestComponent = 0;

  let targetEntry = null;
  if (scheduleEntryId) {
    targetEntry = loan.scheduleEntries.find((e: any) => e.id === scheduleEntryId);
    if (!targetEntry || targetEntry.status === "PAID") {
      return NextResponse.json({ error: "Schedule entry is not payable" }, { status: 409 });
    }
  } else if (!isExtraPrincipal) {
    targetEntry = loan.scheduleEntries.find((e: any) => e.status !== "PAID");
  }

  const nextSeq = await getNextServerSeq();

  if (isExtraPrincipal) {
    principalComponent = amountMinor;
    interestComponent = 0;
  } else if (targetEntry) {
    principalComponent = targetEntry.principalComponentMinor;
    interestComponent = targetEntry.interestComponentMinor;
    const scheduledEmi = targetEntry.principalComponentMinor + targetEntry.interestComponentMinor;
    if (amountMinor !== scheduledEmi) {
      return NextResponse.json(
        { error: "Payment must equal the scheduled EMI; use extra principal for overpayments" },
        { status: 400 }
      );
    }
  } else {
    principalComponent = amountMinor;
  }

  if (isExtraPrincipal) {
    const paidPrincipal = loan.payments.reduce(
      (sum: number, payment: any) => sum + payment.principalComponentMinor,
      0
    );
    const remainingBeforeExtra = loan.originalPrincipalMinor - paidPrincipal;
    const residualValueMinor = loan.residualValueMinor || 0;
    if (amountMinor > Math.max(0, remainingBeforeExtra - residualValueMinor)) {
      return NextResponse.json({ error: "Extra principal exceeds the outstanding balance" }, { status: 400 });
    }
  }

  await (prisma as any).$transaction(async (tx: any) => {
    // 1. Create Transaction row
    await tx.transaction.create({
      data: {
        id: txId,
        userId: session.userId,
        accountId,
        amountMinor,
        type: "EXPENSE",
        subType: "EMI_PAYMENT",
        source: "MANUAL",
        createdByUserId: session.userId,
        updatedByUserId: session.userId,
        transactionDate: now,
        note: isExtraPrincipal
          ? `Extra Principal Payment: ${loan.lenderName}`
          : `EMI Payment: ${loan.lenderName}${targetEntry ? ` (#${targetEntry.installmentNumber})` : ""}`,
        excludeFromBudget: true,
        excludeFromStats: false,
        excludeFromBalance: false,
        serverSeq: nextSeq,
      },
    });

    // 2. Create LoanPayment
    await tx.loanPayment.create({
      data: {
        id: paymentId,
        loanId: loan.id,
        transactionId: txId,
        scheduleEntryId: targetEntry?.id || null,
        principalComponentMinor: principalComponent,
        interestComponentMinor: interestComponent,
        isExtraPrincipal,
        paymentDate: now,
        serverSeq: nextSeq,
      },
    });

    // 3. Update target schedule entry to PAID if regular payment
    if (targetEntry && !isExtraPrincipal) {
      await tx.loanScheduleEntry.update({
        where: { id: targetEntry.id },
        data: {
          status: "PAID",
          serverSeq: nextSeq,
        },
      });
    }

    // 4. If extra principal: regenerate subsequent scheduled rows
    if (isExtraPrincipal) {
      const allPayments = [...loan.payments, { principalComponentMinor: principalComponent }];
      const totalPaidPrincipal = allPayments.reduce(
        (sum: number, p: any) => sum + p.principalComponentMinor,
        0
      );
      const remainingPrincipal = Math.max(0, loan.originalPrincipalMinor - totalPaidPrincipal);
      const residualValueMinor = loan.residualValueMinor || 0;

      const remainingScheduled = loan.scheduleEntries.filter(
        (e: any) => e.status !== "PAID" && e.deletedAt === null
      );
      if (remainingPrincipal > residualValueMinor && remainingScheduled.length > 0) {
        const startInstallment = remainingScheduled[0].installmentNumber;
        const remainingTenure = remainingScheduled.length;

        const newRows = reamortizeRemainingSchedule(
          remainingPrincipal,
          startInstallment,
          remainingTenure,
          loan.annualInterestRateBps,
          loan.calculationType,
          loan.residualValueMinor || 0,
          mode,
          loan.monthlyEmiAmountMinor
        );

        // Soft delete old remaining scheduled entries
        await tx.loanScheduleEntry.updateMany({
          where: {
            loanId: loan.id,
            status: { not: "PAID" },
            deletedAt: null,
          },
          data: {
            deletedAt: now,
            serverSeq: nextSeq,
          },
        });

        // Insert new regenerated entries
        const baseDate = new Date(loan.startDate);
        for (const row of newRows) {
          const dueDate = addMonthsOnDay(
            baseDate,
            row.installmentNumber,
            loan.paymentDueDay || baseDate.getUTCDate(),
          );

          await tx.loanScheduleEntry.create({
            data: {
              id: uuidv4(),
              loanId: loan.id,
              installmentNumber: row.installmentNumber,
              dueDate,
              principalComponentMinor: row.principalComponentMinor,
              interestComponentMinor: row.interestComponentMinor,
              openingBalanceMinor: row.openingBalanceMinor,
              closingBalanceMinor: row.closingBalanceMinor,
              status: "SCHEDULED",
              serverSeq: nextSeq,
            },
          });
        }
      } else {
          await tx.loanScheduleEntry.updateMany({
            where: {
              loanId: loan.id,
              status: { not: "PAID" },
              deletedAt: null,
            },
            data: { deletedAt: now, serverSeq: nextSeq },
          });
        }
      }

    // 5. Check if loan is now fully cleared / paid
    const remainingUnpaid = await tx.loanScheduleEntry.count({
      where: {
        loanId: loan.id,
        status: { not: "PAID" },
        deletedAt: null,
      },
    });

    if (remainingUnpaid === 0 && (loan.residualValueMinor || 0) === 0) {
      await tx.loan.update({
        where: { id: loan.id },
        data: {
          status: "CLOSED",
          closedAt: now,
          serverSeq: nextSeq,
        },
      });
    }
  });

  return NextResponse.json({ success: true });
}
