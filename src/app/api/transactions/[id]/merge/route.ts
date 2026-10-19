import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextServerSeq } from "@/lib/server-seq";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const manualTx = await prisma.transaction.findFirst({
    where: { id, userId: user.id },
  });

  if (!manualTx) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  const targetId = manualTx.possibleDuplicateOfTransactionId;
  if (!targetId) {
    return NextResponse.json(
      { error: "Transaction is not marked as a duplicate" },
      { status: 400 }
    );
  }

  const smsTx = await prisma.transaction.findFirst({
    where: { id: targetId, userId: user.id },
  });

  if (!smsTx) {
    return NextResponse.json(
      { error: "Target duplicate transaction not found" },
      { status: 404 }
    );
  }

  const nextSeq1 = await getNextServerSeq();
  const nextSeq2 = await getNextServerSeq();

  // Merge note and category
  let mergedNote = smsTx.note || "";
  if (manualTx.note) {
    if (!mergedNote) {
      mergedNote = manualTx.note;
    } else if (!mergedNote.includes(manualTx.note)) {
      mergedNote = `${manualTx.note} - ${mergedNote}`;
    }
  }

  await prisma.transaction.update({
    where: { id: smsTx.id },
    data: {
      categoryId: smsTx.categoryId || manualTx.categoryId,
      note: mergedNote || null,
      serverSeq: nextSeq1,
    },
  });

  // Soft-delete manual transaction and clear duplicate flag
  await prisma.transaction.update({
    where: { id: manualTx.id },
    data: {
      deletedAt: new Date(),
      possibleDuplicateOfTransactionId: null,
      serverSeq: nextSeq2,
    },
  });

  return NextResponse.json({
    success: true,
    transactionId: smsTx.id,
  });
}
