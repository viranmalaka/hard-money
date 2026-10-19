import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextServerSeq } from "@/lib/server-seq";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx || tx.deletedAt) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  if (tx.householdId) {
    const member = await prisma.householdMember.findUnique({
      where: {
        householdId_userId: {
          householdId: tx.householdId,
          userId: user.id,
        },
      },
    });

    if (!member && tx.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (member?.role === "VIEWER") {
      return NextResponse.json(
        { error: "Forbidden: VIEWER cannot edit transactions" },
        { status: 403 }
      );
    }

    if (member?.role === "CONTRIBUTOR_ADD_ONLY") {
      if (tx.createdByUserId !== user.id && tx.userId !== user.id) {
        return NextResponse.json(
          { error: "Forbidden: CONTRIBUTOR_ADD_ONLY cannot edit other users' transactions" },
          { status: 403 }
        );
      }
    }
  } else if (tx.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const nextSeq = await getNextServerSeq();
  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      ...(body.note !== undefined && { note: body.note }),
      ...(body.amountMinor !== undefined && { amountMinor: Number(body.amountMinor) }),
      ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
      updatedByUserId: user.id,
      serverSeq: nextSeq,
    },
  });

  return NextResponse.json({ transaction: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const tx = await prisma.transaction.findUnique({ where: { id } });
  if (!tx || tx.deletedAt) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  if (tx.householdId) {
    const member = await prisma.householdMember.findUnique({
      where: {
        householdId_userId: {
          householdId: tx.householdId,
          userId: user.id,
        },
      },
    });

    if (!member && tx.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (member?.role === "VIEWER") {
      return NextResponse.json(
        { error: "Forbidden: VIEWER cannot delete transactions" },
        { status: 403 }
      );
    }

    if (member?.role === "CONTRIBUTOR_ADD_ONLY") {
      if (tx.createdByUserId !== user.id && tx.userId !== user.id) {
        return NextResponse.json(
          { error: "Forbidden: CONTRIBUTOR_ADD_ONLY cannot delete other users' transactions" },
          { status: 403 }
        );
      }
    }
  } else if (tx.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const nextSeq = await getNextServerSeq();
  await prisma.transaction.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      updatedByUserId: user.id,
      serverSeq: nextSeq,
    },
  });

  return NextResponse.json({ success: true });
}
