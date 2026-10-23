import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextServerSeq } from "@/lib/server-seq";
import { assertCanWriteAccount } from "@/lib/authorization";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    accountId,
    toAccountId,
    amountMinor,
    destinationAmountMinor,
    exchangeRateMicros,
    categoryId,
    note,
    type = "EXPENSE",
    transactionDate = new Date().toISOString(),
  } = body;

  if (!accountId || amountMinor === undefined) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const account = await assertCanWriteAccount(user, accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  if (!account) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  if (!["EXPENSE", "INCOME", "TRANSFER", "REFUND", "ADJUSTMENT"].includes(type)) return NextResponse.json({ error: "Invalid transaction type" }, { status: 400 });
  const validatedDestinationAmountMinor =
    typeof destinationAmountMinor === "number" ? destinationAmountMinor : null;
  const validatedExchangeRateMicros =
    typeof exchangeRateMicros === "number" ? exchangeRateMicros : null;
  if (type === "TRANSFER" && toAccountId) {
    const destination = await assertCanWriteAccount(user, toAccountId);
    if (!destination) {
      return NextResponse.json({ error: "Destination account not found" }, { status: 404 });
    }
    if (account.currency === "USD" && destination.currency === "LKR") {
      if (
        validatedDestinationAmountMinor === null ||
        validatedDestinationAmountMinor <= 0 ||
        validatedExchangeRateMicros === null ||
        validatedExchangeRateMicros <= 0 ||
        !Number.isInteger(validatedDestinationAmountMinor) ||
        !Number.isInteger(validatedExchangeRateMicros)
      ) {
        return NextResponse.json({ error: "Cross-currency transfers require destination amount and exchange rate" }, { status: 400 });
      }
    } else if (account.currency !== destination.currency) {
      return NextResponse.json({ error: "Only USD to LKR transfers are supported" }, { status: 400 });
    }
  }
  const householdId = account.accessScope === "SHARED_HOUSEHOLD" ? account.householdId : null;

  const nextSeq = await getNextServerSeq();
  const tx = await prisma.transaction.create({
    data: {
      userId: user.id,
      householdId,
      accountId,
      toAccountId: toAccountId || null,
      amountMinor,
      destinationAmountMinor: validatedDestinationAmountMinor,
      exchangeRateMicros: validatedExchangeRateMicros,
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
