import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextServerSeq } from "@/lib/server-seq";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const sms = await prisma.bankSms.findUnique({
    where: { id },
  });

  if (!sms || sms.userId !== session.userId) {
    return NextResponse.json({ error: "SMS not found" }, { status: 404 });
  }

  const parsedPayload = (sms.parsedPayload as Record<string, unknown>) || {};
  const suggestedTransfer = parsedPayload.suggestedTransfer as
    | {
        counterpartTransactionId?: string;
        fromAccountId?: string;
        toAccountId?: string;
        amountMinor?: number;
      }
    | undefined;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional if suggestedTransfer is in payload
  }

  const counterpartTransactionId =
    (body.counterpartTransactionId as string | undefined) ||
    suggestedTransfer?.counterpartTransactionId;
  const fromAccountId =
    (body.fromAccountId as string | undefined) ||
    suggestedTransfer?.fromAccountId;
  const toAccountId =
    (body.toAccountId as string | undefined) || suggestedTransfer?.toAccountId;

  if (!counterpartTransactionId || !fromAccountId || !toAccountId) {
    return NextResponse.json(
      { error: "Missing required transfer parameters" },
      { status: 400 }
    );
  }

  const counterpartTx = await prisma.transaction.findFirst({
    where: {
      id: counterpartTransactionId,
      userId: session.userId,
      deletedAt: null,
    },
  });

  if (!counterpartTx) {
    return NextResponse.json(
      { error: "Counterpart transaction not found" },
      { status: 404 }
    );
  }

  const [fromAccount, toAccount] = await Promise.all([
    prisma.account.findFirst({
      where: { id: fromAccountId, userId: session.userId, deletedAt: null },
    }),
    prisma.account.findFirst({
      where: { id: toAccountId, userId: session.userId, deletedAt: null },
    }),
  ]);

  if (!fromAccount || !toAccount) {
    return NextResponse.json(
      { error: "Source or destination account not found" },
      { status: 404 }
    );
  }

  const nextSeq = await getNextServerSeq();
  const transferNote =
    (typeof body.note === "string" && body.note.trim()) ||
    counterpartTx.note ||
    `Transfer: ${fromAccount.name} → ${toAccount.name}`;

  await prisma.transaction.update({
    where: { id: counterpartTx.id },
    data: {
      accountId: fromAccount.id,
      toAccountId: toAccount.id,
      type: "TRANSFER",
      subType: "ONLINE_TRANSFER",
      categoryId: null,
      note: transferNote,
      serverSeq: nextSeq,
    },
  });

  await prisma.bankSms.update({
    where: { id: sms.id },
    data: {
      status: "PROCESSED",
      transactionId: counterpartTx.id,
    },
  });

  return NextResponse.json({
    status: "PROCESSED",
    transactionId: counterpartTx.id,
  });
}
