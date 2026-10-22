import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerNow } from "@/lib/server-clock";
import { getNextServerSeq } from "@/lib/server-seq";
import { calculateCompoundMaturity } from "@/lib/finance-core/investments";
import type { CompoundingFrequency } from "@/lib/finance-core/investments";
import { v5 as uuidv5 } from "uuid";
import { authorizeFixedDeposit, assertCanWriteAccount } from "@/lib/authorization";

const FD_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

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
  const targetAccountId = body.targetAccountId || fd.linkedPayoutAccountId || fd.fundingAccountId;

  if (!targetAccountId) {
    return NextResponse.json({ error: "No target account specified for proceeds" }, { status: 400 });
  }
  if (!(await assertCanWriteAccount(user, targetAccountId))) {
    return NextResponse.json({ error: "Forbidden target account" }, { status: 403 });
  }

  const now = getServerNow();
  if (fd.status !== "MATURED" && now.getTime() < new Date(fd.maturityDate).getTime()) {
    return NextResponse.json({ error: "Fixed deposit has not matured" }, { status: 409 });
  }
  const nextSeq1 = await getNextServerSeq();

  // 1. Post principal proceeds (FD_MATURITY, excluded from stats & budget)
  const principalTxId = uuidv5(`${fd.id}:MATURITY:PRINCIPAL`, FD_NAMESPACE);
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
      fd.compoundingFrequency as CompoundingFrequency,
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
          id: uuidv5(`${fd.id}:MATURITY:INTEREST`, FD_NAMESPACE),
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
