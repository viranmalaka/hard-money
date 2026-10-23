import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAmortizationSchedule } from "@/lib/finance-core/loans";
import { addMonthsOnDay } from "@/lib/finance-core/dates";
import { getNextServerSeq } from "@/lib/server-seq";
import { v4 as uuidv4 } from "uuid";
import { authorizeLoan } from "@/lib/authorization";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, entryId } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { interestComponentMinor, principalComponentMinor } = body;

  const authorizedLoan = await authorizeLoan(session, id, "write");
  const loan = authorizedLoan && await (prisma as any).loan.findFirst({
    where: { id, deletedAt: null },
    include: {
      scheduleEntries: {
        where: { deletedAt: null },
        orderBy: { installmentNumber: "asc" },
      },
    },
  });

  if (!loan) {
    return NextResponse.json({ error: "Loan not found" }, { status: 404 });
  }

  const targetEntry = loan.scheduleEntries.find((e: any) => e.id === entryId);
  if (!targetEntry) {
    return NextResponse.json({ error: "Schedule entry not found" }, { status: 404 });
  }

  const newInterest =
    interestComponentMinor !== undefined ? interestComponentMinor : targetEntry.interestComponentMinor;
  const newPrincipal =
    principalComponentMinor !== undefined ? principalComponentMinor : targetEntry.principalComponentMinor;

  const newEmi = newPrincipal + newInterest;
  const newClosing = Math.max(
    loan.residualValueMinor || 0,
    targetEntry.openingBalanceMinor - newPrincipal
  );

  const now = new Date();
  const nextSeq = await getNextServerSeq();

  await (prisma as any).$transaction(async (tx: any) => {
    // 1. Update target entry to OVERRIDDEN
    await tx.loanScheduleEntry.update({
      where: { id: targetEntry.id },
      data: {
        interestComponentMinor: newInterest,
        principalComponentMinor: newPrincipal,
        closingBalanceMinor: newClosing,
        status: "OVERRIDDEN",
        serverSeq: nextSeq,
      },
    });

    // 2. Re-amortize subsequent scheduled rows from newClosing balance
    const subsequentEntries = loan.scheduleEntries.filter(
      (e: any) => e.installmentNumber > targetEntry.installmentNumber && e.status !== "PAID"
    );

    if (subsequentEntries.length > 0 && newClosing > (loan.residualValueMinor || 0)) {
      const remainingTenure = subsequentEntries.length;
      const startInstallment = targetEntry.installmentNumber + 1;

      const subSchedule = generateAmortizationSchedule(
        newClosing,
        loan.annualInterestRateBps,
        remainingTenure,
        loan.calculationType,
        loan.residualValueMinor || 0
      );

      // Soft delete old subsequent entries
      const subsequentIds = subsequentEntries.map((e: any) => e.id);
      await tx.loanScheduleEntry.updateMany({
        where: { id: { in: subsequentIds } },
        data: {
          deletedAt: now,
          serverSeq: nextSeq,
        },
      });

      // Insert newly reamortized entries
      const baseDate = new Date(loan.startDate);
      for (let i = 0; i < subSchedule.length; i++) {
        const row = subSchedule[i];
        const instNum = startInstallment + i;
        const dueDate = addMonthsOnDay(
          baseDate,
          instNum,
          loan.paymentDueDay || baseDate.getUTCDate(),
        );

        await tx.loanScheduleEntry.create({
          data: {
            id: uuidv4(),
            loanId: loan.id,
            installmentNumber: instNum,
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
    }
  });

  return NextResponse.json({ success: true });
}
