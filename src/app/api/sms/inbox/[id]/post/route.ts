import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextServerSeq } from "@/lib/server-seq";
import { amountTextToMinor } from "@/lib/sms/template-parser";
import type { ParsedTransactionPayload } from "@/lib/sms/types";
import {
  calculateConvertedMinor,
  calculateExchangeRateMicros,
  rateNumberToMicros,
} from "@/lib/finance-core/currency";

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
  const parsedPayload = (sms.parsedPayload as Partial<ParsedTransactionPayload> | null) || {};

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

  const toAccountId = typeof body.toAccountId === "string" ? body.toAccountId : null;
  const toAccount = toAccountId
    ? await prisma.account.findFirst({ where: { id: toAccountId, userId: session.userId } })
    : null;
  const parsedCurrency = parsedPayload.currency === "USD" ? "USD" : "LKR";
  let destinationAmountMinor =
    typeof body.destinationAmountMinor === "number"
      ? Math.round(body.destinationAmountMinor)
      : typeof body.destinationAmount === "number"
        ? Math.round(body.destinationAmount * 100)
        : typeof body.destinationAmount === "string"
          ? amountTextToMinor(body.destinationAmount)
          : typeof parsedPayload.destinationAmountText === "string"
            ? amountTextToMinor(parsedPayload.destinationAmountText)
        : null;
  const exchangeRateMicros =
    typeof body.exchangeRateMicros === "number"
      ? Math.round(body.exchangeRateMicros)
      : typeof body.exchangeRate === "number"
        ? rateNumberToMicros(body.exchangeRate)
        : typeof body.exchangeRate === "string"
          ? rateNumberToMicros(Number(body.exchangeRate))
        : null;

  if (
    parsedCurrency === "USD" &&
    toAccount &&
    (!destinationAmountMinor || destinationAmountMinor <= 0) &&
    exchangeRateMicros &&
    exchangeRateMicros > 0
  ) {
    destinationAmountMinor = calculateConvertedMinor(amountMinor, exchangeRateMicros);
  }

  if (parsedCurrency === "USD" && toAccount) {
    if (account.currency !== "USD" || toAccount.currency !== "LKR" || destinationAmountMinor === null || destinationAmountMinor <= 0) {
      return NextResponse.json({ error: "USD SMS transfers require a USD source, LKR destination, and final LKR amount" }, { status: 400 });
    }
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
      toAccountId: toAccount?.id || null,
      amountMinor,
      destinationAmountMinor:
        parsedCurrency === "USD" && toAccount ? destinationAmountMinor : null,
      exchangeRateMicros:
        parsedCurrency === "USD" && toAccount
          ? exchangeRateMicros || calculateExchangeRateMicros(amountMinor, destinationAmountMinor || 0)
          : null,
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
