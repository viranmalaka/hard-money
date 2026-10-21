import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getNextServerSeq } from "@/lib/server-seq";
import { prisma } from "@/lib/prisma";
import { authorizeLoan } from "@/lib/authorization";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const loan = await authorizeLoan(session, id, "write");

  if (!loan) {
    return NextResponse.json({ error: "Loan not found" }, { status: 404 });
  }

  const now = new Date();
  const nextSeq = await getNextServerSeq();

  await (prisma as any).$transaction([
    (prisma as any).loan.update({
      where: { id: loan.id },
      data: {
        status: "CLOSED",
        closedAt: now,
        serverSeq: nextSeq,
      },
    }),
    (prisma as any).loanScheduleEntry.updateMany({
      where: {
        loanId: loan.id,
        status: "SCHEDULED",
      },
      data: {
        deletedAt: now,
        serverSeq: nextSeq,
      },
    }),
  ]);

  return NextResponse.json({ success: true });
}
