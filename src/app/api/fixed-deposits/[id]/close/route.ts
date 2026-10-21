import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerNow } from "@/lib/server-clock";
import { getNextServerSeq } from "@/lib/server-seq";
import { v4 as uuidv4 } from "uuid";
import { authorizeFixedDeposit, assertCanWriteAccount } from "@/lib/authorization";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const fd = await authorizeFixedDeposit(user, id, "write");

  if (!fd) {
    return NextResponse.json({ error: "Fixed deposit not found" }, { status: 404 });
  }

  if (fd.status === "CLOSED") {
    return NextResponse.json({ error: "Fixed deposit is already closed" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const actualProceedsMinor = typeof body.actualProceedsMinor === "number"
    ? body.actualProceedsMinor
    : fd.principalAmountMinor;
  const targetAccountId = body.targetAccountId || fd.linkedPayoutAccountId || fd.fundingAccountId;

  if (!targetAccountId) {
    return NextResponse.json({ error: "No target account specified for closure proceeds" }, { status: 400 });
  }
  if (!(await assertCanWriteAccount(user, targetAccountId))) {
    return NextResponse.json({ error: "Forbidden target account" }, { status: 403 });
  }

  const now = getServerNow();
  const nextSeq1 = await getNextServerSeq();

  const principalToReturn = Math.min(fd.principalAmountMinor, actualProceedsMinor);
  const interestToReturn = Math.max(0, actualProceedsMinor - fd.principalAmountMinor);

  // 1. Post principal proceeds (FD_MATURITY, excluded from stats & budget)
  await (prisma as any).transaction.create({
    data: {
      id: uuidv4(),
      userId: user.id,
      accountId: targetAccountId,
      amountMinor: principalToReturn,
      type: "INCOME",
      subType: "FD_MATURITY",
      source: "SYSTEM",
      createdByUserId: user.id,
      updatedByUserId: user.id,
      transactionDate: now,
      note: `Fixed Deposit Premature Closure Principal: ${fd.bankName}`,
      excludeFromBudget: true,
      excludeFromStats: true,
      excludeFromBalance: false,
      serverSeq: nextSeq1,
    },
  });

  // 2. Post any interest (FD_INTEREST, included in stats)
  if (interestToReturn > 0) {
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
        amountMinor: interestToReturn,
        type: "INCOME",
        subType: "FD_INTEREST",
        source: "SYSTEM",
        createdByUserId: user.id,
        updatedByUserId: user.id,
        transactionDate: now,
        note: `Fixed Deposit Premature Closure Interest: ${fd.bankName}`,
        excludeFromBudget: false,
        excludeFromStats: false,
        excludeFromBalance: false,
        serverSeq: nextSeq2,
      },
    });
  }

  // 3. Mark FD CLOSED with prematureClosure: true
  const nextSeq3 = await getNextServerSeq();
  const updatedFd = await (prisma as any).fixedDeposit.update({
    where: { id: fd.id },
    data: {
      status: "CLOSED",
      closedAt: now,
      prematureClosure: true,
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
