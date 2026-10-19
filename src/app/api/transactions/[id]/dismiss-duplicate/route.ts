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
  const tx = await prisma.transaction.findFirst({
    where: { id, userId: user.id },
  });

  if (!tx) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  const nextSeq = await getNextServerSeq();
  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      possibleDuplicateOfTransactionId: null,
      serverSeq: nextSeq,
    },
  });

  return NextResponse.json({ success: true });
}
