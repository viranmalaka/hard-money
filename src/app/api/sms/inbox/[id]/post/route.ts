import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextServerSeq } from "@/lib/server-seq";
import { amountTextToMinor } from "@/lib/sms/template-parser";

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

  const body = await request.json().catch(() => ({}));
  const parsedPayload = (sms.parsedPayload as any) || {};

  let amountMinor = 0;
  if (typeof body.amountMinor === "number") {
    amountMinor = body.amountMinor;
  } else if (typeof body.amount === "number") {
    amountMinor = Math.round(body.amount * 100);
  } else if (typeof body.amount === "string" && body.amount.trim().length > 0) {
    amountMinor = amountTextToMinor(body.amount);
  } else if (parsedPayload.amountText) {
    amountMinor = amountTextToMinor(parsedPayload.amountText);
  }

  if (amountMinor <= 0) {
    return NextResponse.json(
      { error: "Amount must be greater than zero" },
      { status: 400 }
    );
  }

  const accountId = body.accountId;
  if (!accountId) {
    return NextResponse.json({ error: "accountId is required" }, { status: 400 });
  }

  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: session.userId },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const txType =
    body.type ||
    (parsedPayload.transactionType === "CREDIT" ? "INCOME" : "EXPENSE");
  const subType = parsedPayload.channel || "UNKNOWN";
  const note = body.note ?? parsedPayload.merchantOrEntity ?? sms.sender;
  const categoryId = body.categoryId || null;

  const nextSeq = await getNextServerSeq();
  const tx = await prisma.transaction.create({
    data: {
      userId: session.userId,
      accountId: account.id,
      amountMinor,
      type: txType,
      subType,
      categoryId,
      source: "SMS",
      note,
      transactionDate: sms.receivedAt,
      createdByUserId: session.userId,
      updatedByUserId: session.userId,
      serverSeq: nextSeq,
    },
  });

  await prisma.bankSms.update({
    where: { id: sms.id },
    data: {
      status: "PROCESSED",
      transactionId: tx.id,
    },
  });

  return NextResponse.json({ ok: true, transactionId: tx.id });
}
