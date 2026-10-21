import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authorizeLoan } from "@/lib/authorization";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const loan = await authorizeLoan(session, id, "read");
  const loanWithDetails = loan && await (prisma as any).loan.findFirst({
    where: { id, deletedAt: null },
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

  if (!loanWithDetails) {
    return NextResponse.json({ error: "Loan not found" }, { status: 404 });
  }

  const totalPrincipalPaid = loanWithDetails.payments.reduce(
    (sum: number, p: any) => sum + p.principalComponentMinor,
    0
  );
  const totalInterestPaid = loanWithDetails.payments.reduce(
    (sum: number, p: any) => sum + p.interestComponentMinor,
    0
  );
  const remainingPrincipalMinor = Math.max(
    0,
    loan.originalPrincipalMinor - totalPrincipalPaid
  );

  return NextResponse.json({
    loan: {
      ...loanWithDetails,
      serverSeq: Number(loanWithDetails.serverSeq),
      scheduleEntries: loanWithDetails.scheduleEntries.map((se: any) => ({
        ...se,
        serverSeq: Number(se.serverSeq),
      })),
      payments: loanWithDetails.payments.map((p: any) => ({
        ...p,
        serverSeq: Number(p.serverSeq),
      })),
      remainingPrincipalMinor,
      totalPrincipalPaidMinor: totalPrincipalPaid,
      totalInterestPaidMinor: totalInterestPaid,
    },
  });
}
