import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextServerSeq } from "@/lib/server-seq";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    accountId,
    amountMinor,
    categoryId,
    note,
    type = "EXPENSE",
    transactionDate = new Date().toISOString(),
  } = body;

  if (!accountId || amountMinor === undefined) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const householdId = account.householdId;
  if (householdId) {
    const member = await prisma.householdMember.findUnique({
      where: {
        householdId_userId: {
          householdId,
          userId: user.id,
        },
      },
    });

    if (!member && account.userId !== user.id) {
      return NextResponse.json(
        { error: "Forbidden: Not a member of this household" },
        { status: 403 }
      );
    }

    if (member?.role === "VIEWER") {
      return NextResponse.json(
        { error: "Forbidden: VIEWER cannot create transactions" },
        { status: 403 }
      );
    }
  }

  const nextSeq = await getNextServerSeq();
  const tx = await prisma.transaction.create({
    data: {
      userId: user.id,
      householdId,
      accountId,
      amountMinor: Number(amountMinor),
      type,
      categoryId: categoryId || null,
      note: note || null,
      createdByUserId: user.id,
      updatedByUserId: user.id,
      transactionDate: new Date(transactionDate),
      serverSeq: nextSeq,
    },
  });

  return NextResponse.json({ transaction: tx }, { status: 201 });
}
