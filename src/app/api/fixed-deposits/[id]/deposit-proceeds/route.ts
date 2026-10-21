import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerNow } from "@/lib/server-clock";
import { getNextServerSeq } from "@/lib/server-seq";
import { calculateCompoundMaturity } from "@/lib/finance-core/investments";
import { v4 as uuidv4 } from "uuid";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const fd = await (prisma as any).fixedDeposit.findUnique({
    where: { id, userId: user.id },
  });

  if (!fd) {
    return NextResponse.json({ error: "Fixed deposit not found" }, { status: 404 });
  }

  if (fd.status === "CLOSED") {
    return NextResponse.json({ error: "Fixed deposit is already closed" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const targetAccountId = body.targetAccountId || fd.linkedPayoutAccountId || fd.fundingAccountId;

  if (!targetAccountId) {
    return NextResponse.json({ error: "No target account specified for proceeds" }, { status: 400 });
  }

  const now = getServerNow();
  const nextSeq1 = await getNextServerSeq();

  // 1. Post principal proceeds (FD_MATURITY, excluded from stats & budget)
  const principalTxId = uuidv4();
  await (prisma as any).transaction.create({
    data: {
      id: principalTxId,
      userId: user.id,
      accountId: targetAccountId,
      amountMinor: fd.principalAmountMinor,
      type: "INCOME",
      subType: "FD_MATURITY",
      source: "SYSTEM",
      createdByUserId: user.id,
      updatedByUserId: user.id,
      transactionDate: now,
      note: `Fixed Deposit Maturity Principal: ${fd.bankName}`,
      excludeFromBudget: true,
      excludeFromStats: true,
      excludeFromBalance: false,
      serverSeq: nextSeq1,
    },
  });

  // 2. For compounding FDs, post accumulated net interest (FD_INTEREST, included in stats)
  if (fd.payoutMode === "REINVEST_COMPOUND") {
    const comp = calculateCompoundMaturity(
      fd.principalAmountMinor,
      fd.annualInterestRateBps,
      fd.tenureMonths,
      fd.compoundingFrequency,
      fd.withholdingTaxRateBps
    );

    if (comp.netInterestMinor > 0) {
      const nextSeq2 = await getNextServerSeq();
      let invCat = await prisma.category.findFirst({
        where: { name: "Investment Yield", OR: [{ userId: user.id }, { userId: null }] },
      });
      if (!invCat) {
        invCat = await prisma.category.create({
          data: {
            userId: user.id,
            name: "Investment Yield", type: "INCOME",
            icon: "📈",
            color: "#10b981",
            serverSeq: nextSeq2,
          },
        });
      }

      await (prisma as any).transaction.create({
        data: {
          id: uuidv4(),
          userId: user.id,
          accountId: targetAccountId,
          categoryId: invCat.id,
          amountMinor: comp.netInterestMinor,
          type: "INCOME",
          subType: "FD_INTEREST",
          source: "SYSTEM",
          createdByUserId: user.id,
          updatedByUserId: user.id,
          transactionDate: now,
          note: `Fixed Deposit Maturity Interest: ${fd.bankName}`,
          excludeFromBudget: false,
          excludeFromStats: false,
          excludeFromBalance: false,
          serverSeq: nextSeq2,
        },
      });
    }
  }

  // 3. Mark FD CLOSED
  const nextSeq3 = await getNextServerSeq();
  const updatedFd = await (prisma as any).fixedDeposit.update({
    where: { id: fd.id },
    data: {
      status: "CLOSED",
      closedAt: now,
      serverSeq: nextSeq3,
    },
  });

  return NextResponse.json({
    ok: true,
    fixedDeposit: {
      ...updatedFd,
      serverSeq: Number(updatedFd.serverSeq),
    },
  });
}
