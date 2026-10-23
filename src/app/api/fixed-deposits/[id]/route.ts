import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextServerSeq } from "@/lib/server-seq";
import { addMonthsClamped } from "@/lib/finance-core/dates";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.fixedDeposit.findFirst({ where: { id, userId: session.userId, deletedAt: null } });
  if (!existing) return NextResponse.json({ error: "Fixed deposit not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const startDate = body.startDate ? new Date(body.startDate) : existing.startDate;
  const tenureMonths = Number.isInteger(body.tenureMonths) ? body.tenureMonths : existing.tenureMonths;
  if (Number.isNaN(startDate.getTime()) || tenureMonths <= 0) {
    return NextResponse.json({ error: "Invalid start date or tenure" }, { status: 400 });
  }
  const paidPeriods = Math.max(0, Math.min(tenureMonths, Number.isInteger(body.paidPeriods) ? body.paidPeriods : existing.paidPeriods));
  const updated = await prisma.fixedDeposit.update({
    where: { id },
    data: {
      ...(body.bankName !== undefined && { bankName: String(body.bankName).trim() }),
      ...(body.principalAmountMinor !== undefined && { principalAmountMinor: body.principalAmountMinor }),
      ...(body.annualInterestRateBps !== undefined && { annualInterestRateBps: body.annualInterestRateBps }),
      tenureMonths,
      startDate,
      maturityDate: addMonthsClamped(startDate, tenureMonths),
      paidPeriods,
      serverSeq: await getNextServerSeq(),
    },
  });
  return NextResponse.json({ fixedDeposit: { ...updated, serverSeq: Number(updated.serverSeq) } });
}
