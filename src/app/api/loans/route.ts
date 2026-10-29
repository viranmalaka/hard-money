import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateAmortizationSchedule } from "@/lib/finance-core/loans";
import { addMonthsOnDay } from "@/lib/finance-core/dates";
import { v4 as uuidv4 } from "uuid";
import { assertCanWriteAccount } from "@/lib/authorization";
import { getNextServerSeq } from "@/lib/server-seq";


export const maxDuration = 60;

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loans = await prisma.loan.findMany({
    where: { userId: session.userId, deletedAt: null },
    include: {
      scheduleEntries: {
        where: { deletedAt: null },
        orderBy: { installmentNumber: "asc" },
      },
      payments: {
        orderBy: { paymentDate: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const enrichedLoans = loans.map((loan) => {
    const totalPrincipalPaid = loan.payments.reduce(
      (sum, p) => sum + p.principalComponentMinor,
      0
    );
    const totalInterestPaid = loan.payments.reduce(
      (sum, p) => sum + p.interestComponentMinor,
      0
    );
    const remainingPrincipalMinor = Math.max(
      0,
      loan.originalPrincipalMinor - totalPrincipalPaid
    );

    const nextScheduledEntry = loan.scheduleEntries.find(
      (e) => e.status !== "PAID"
    );

    return {
      ...loan,
      serverSeq: Number(loan.serverSeq),
      scheduleEntries: loan.scheduleEntries.map((se) => ({
        ...se,
        serverSeq: Number(se.serverSeq),
      })),
      payments: loan.payments.map((p) => ({
        ...p,
        serverSeq: Number(p.serverSeq),
      })),
      remainingPrincipalMinor,
      totalPrincipalPaidMinor: totalPrincipalPaid,
      totalInterestPaidMinor: totalInterestPaid,
      nextDueDate: nextScheduledEntry ? nextScheduledEntry.dueDate : null,
      paidInstallmentsCount: loan.scheduleEntries.filter((e) => e.status === "PAID").length,
      totalInstallmentsCount: loan.tenureMonths,
    };
  });

  return NextResponse.json({ loans: enrichedLoans });
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const {
    lenderName,
    kind = "LOAN",
    originalPrincipalMinor,
    residualValueMinor = 0,
    annualInterestRateBps,
    tenureMonths,
    paidInstallments = 0,
    startDate,
    paymentDueDay,
    calculationType = "REDUCING_BALANCE",
    linkedDisbursementAccountId,
  } = body;

  if (!lenderName || !originalPrincipalMinor || originalPrincipalMinor <= 0 || !tenureMonths || tenureMonths <= 0) {
    return NextResponse.json({ error: "Missing required loan fields" }, { status: 400 });
  }

  const scheduleRows = generateAmortizationSchedule(
    originalPrincipalMinor,
    annualInterestRateBps,
    tenureMonths,
    calculationType,
    residualValueMinor || 0
  );

  const monthlyEmiAmountMinor = scheduleRows[0]?.emiAmountMinor || 0;
  const loanId = uuidv4();
  const startDateTime = startDate ? new Date(startDate) : new Date();
  const resolvedPaymentDueDay = paymentDueDay ?? startDateTime.getUTCDate();
  if (!Number.isInteger(resolvedPaymentDueDay) || resolvedPaymentDueDay < 1 || resolvedPaymentDueDay > 31) {
    return NextResponse.json({ error: "Payment due day must be between 1 and 31" }, { status: 400 });
  }
  if (linkedDisbursementAccountId && !(await assertCanWriteAccount(session, linkedDisbursementAccountId))) {
    return NextResponse.json({ error: "Forbidden disbursement account" }, { status: 403 });
  }

  // Create loan and schedule in a transaction
  const createdLoan = await prisma.$transaction(async (tx) => {
    const loanSeq = await getNextServerSeq(tx);
    const loan = await tx.loan.create({
      data: {
        id: loanId,
        userId: session.userId,
        kind,
        lenderName,
        originalPrincipalMinor,
        residualValueMinor: residualValueMinor || 0,
        annualInterestRateBps,
        tenureMonths,
        paidInstallments: Math.max(0, Math.min(tenureMonths, paidInstallments)),
        startDate: startDateTime,
        paymentDueDay: resolvedPaymentDueDay,
        monthlyEmiAmountMinor,
        calculationType,
        linkedDisbursementAccountId: linkedDisbursementAccountId || null,
        status: "ACTIVE",
        serverSeq: loanSeq,
      },
    });

    const scheduleSeq = await getNextServerSeq(tx);
    const scheduleEntriesData = scheduleRows.map((row) => {
      const dueDate = addMonthsOnDay(new Date(startDateTime), row.installmentNumber, resolvedPaymentDueDay);
      return {
        id: uuidv4(),
        loanId: loan.id,
        installmentNumber: row.installmentNumber,
        dueDate,
        principalComponentMinor: row.principalComponentMinor,
        interestComponentMinor: row.interestComponentMinor,
        openingBalanceMinor: row.openingBalanceMinor,
        closingBalanceMinor: row.closingBalanceMinor,
        status: row.installmentNumber <= paidInstallments ? "PAID" : "SCHEDULED",
        serverSeq: scheduleSeq,
      };
    });

    await tx.loanScheduleEntry.createMany({
      data: scheduleEntriesData,
    });

    if (linkedDisbursementAccountId && originalPrincipalMinor > 0) {
      const transactionSeq = await getNextServerSeq(tx);
      await tx.transaction.create({
        data: {
          id: `${loan.id}-disbursement`,
          userId: session.userId,
          accountId: linkedDisbursementAccountId,
          amountMinor: originalPrincipalMinor,
          type: "INCOME",
          subType: "LOAN_DISBURSEMENT",
          source: "SYSTEM",
          createdByUserId: session.userId,
          updatedByUserId: session.userId,
          transactionDate: startDateTime,
          note: `${kind === "LEASE" ? "Lease" : "Loan"} Disbursement: ${lenderName}`,
          excludeFromBudget: true,
          excludeFromStats: true,
          excludeFromBalance: false,
          serverSeq: transactionSeq,
        },
      });
    }

    return loan;
  });

  return NextResponse.json(
    { loan: { ...createdLoan, serverSeq: Number(createdLoan.serverSeq) } },
    { status: 201 }
  );
}
