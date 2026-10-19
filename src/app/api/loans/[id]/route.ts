import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const loan = await (prisma as any).loan.findFirst({
    where: { id, userId: session.userId, deletedAt: null },
    include: {
      scheduleEntries: {
        where: { deletedAt: null },
        orderBy: { installmentNumber: "asc" },
      },
      payments: {
        orderBy: { paymentDate: "desc" },
      },
    },
  });

  if (!loan) {
    return NextResponse.json({ error: "Loan not found" }, { status: 404 });
  }

  const totalPrincipalPaid = loan.payments.reduce(
    (sum: number, p: any) => sum + p.principalComponentMinor,
    0
  );
  const totalInterestPaid = loan.payments.reduce(
    (sum: number, p: any) => sum + p.interestComponentMinor,
    0
  );
  const remainingPrincipalMinor = Math.max(
    0,
    loan.originalPrincipalMinor - totalPrincipalPaid
  );

  return NextResponse.json({
    loan: {
      ...loan,
      serverSeq: Number(loan.serverSeq),
      scheduleEntries: loan.scheduleEntries.map((se: any) => ({
        ...se,
        serverSeq: Number(se.serverSeq),
      })),
      payments: loan.payments.map((p: any) => ({
        ...p,
        serverSeq: Number(p.serverSeq),
      })),
      remainingPrincipalMinor,
      totalPrincipalPaidMinor: totalPrincipalPaid,
      totalInterestPaidMinor: totalInterestPaid,
    },
  });
}
