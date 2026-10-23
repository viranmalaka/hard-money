import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authorizeLoan } from "@/lib/authorization";
import { generateAmortizationSchedule } from "@/lib/finance-core/loans";
import { addMonthsClamped } from "@/lib/finance-core/dates";
import { getNextServerSeq } from "@/lib/server-seq";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const loan = await authorizeLoan(session, id, "read");
  if (!loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });
  const details = await prisma.loan.findFirst({
    where: { id, deletedAt: null },
    include: {
      scheduleEntries: { where: { deletedAt: null }, orderBy: { installmentNumber: "asc" } },
      payments: { orderBy: { paymentDate: "desc" } },
    },
  });
  if (!details) return NextResponse.json({ error: "Loan not found" }, { status: 404 });
  const totalPrincipalPaid = details.payments.reduce((sum, payment) => sum + payment.principalComponentMinor, 0);
  const totalInterestPaid = details.payments.reduce((sum, payment) => sum + payment.interestComponentMinor, 0);
  return NextResponse.json({
    loan: {
      ...details,
      serverSeq: Number(details.serverSeq),
      scheduleEntries: details.scheduleEntries.map((entry) => ({ ...entry, serverSeq: Number(entry.serverSeq) })),
      payments: details.payments.map((payment) => ({ ...payment, serverSeq: Number(payment.serverSeq) })),
      remainingPrincipalMinor: Math.max(0, loan.originalPrincipalMinor - totalPrincipalPaid),
      totalPrincipalPaidMinor: totalPrincipalPaid,
      totalInterestPaidMinor: totalInterestPaid,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const loan = await authorizeLoan(session, id, "write");
  if (!loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const principal = body.originalPrincipalMinor ?? loan.originalPrincipalMinor;
  const rate = body.annualInterestRateBps ?? loan.annualInterestRateBps;
  const tenure = body.tenureMonths ?? loan.tenureMonths;
  const calculationType = body.calculationType ?? loan.calculationType;
  const residual = body.residualValueMinor ?? loan.residualValueMinor ?? 0;
  const startDate = body.startDate ? new Date(body.startDate) : loan.startDate;
  const paidInstallments = Math.max(
    0,
    Math.min(tenure, Number.isInteger(body.paidInstallments) ? body.paidInstallments : loan.paidInstallments),
  );
  if (!Number.isInteger(principal) || principal <= 0 || !Number.isInteger(tenure) || tenure <= 0 || Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Invalid loan values" }, { status: 400 });
  }
  const rows = generateAmortizationSchedule(principal, rate, tenure, calculationType, residual);
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.loan.update({
      where: { id },
      data: {
        ...(body.lenderName !== undefined && { lenderName: String(body.lenderName).trim() }),
        originalPrincipalMinor: principal,
        residualValueMinor: residual,
        annualInterestRateBps: rate,
        tenureMonths: tenure,
        paidInstallments,
        startDate,
        monthlyEmiAmountMinor: rows[0]?.emiAmountMinor || 0,
        calculationType,
        serverSeq: await getNextServerSeq(),
      },
    });
    const entries = await tx.loanScheduleEntry.findMany({
      where: { loanId: id, deletedAt: null },
      orderBy: { installmentNumber: "asc" },
    });
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const entry = entries[index];
      const data = {
        installmentNumber: row.installmentNumber,
        dueDate: addMonthsClamped(startDate, row.installmentNumber),
        principalComponentMinor: row.principalComponentMinor,
        interestComponentMinor: row.interestComponentMinor,
        openingBalanceMinor: row.openingBalanceMinor,
        closingBalanceMinor: row.closingBalanceMinor,
        status: row.installmentNumber <= paidInstallments ? "PAID" : "SCHEDULED",
        serverSeq: await getNextServerSeq(),
      };
      if (entry) await tx.loanScheduleEntry.update({ where: { id: entry.id }, data });
      else await tx.loanScheduleEntry.create({ data: { id: crypto.randomUUID(), loanId: id, ...data } });
    }
    return saved;
  });
  return NextResponse.json({ loan: { ...updated, serverSeq: Number(updated.serverSeq) } });
}
