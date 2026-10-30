import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getNextServerSeq } from "@/lib/server-seq";
import { assertCanWriteAccount } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // e.g. "2026-10"
  const accountId = searchParams.get("accountId");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 500) : 100;

  // Household memberships
  const memberships = await prisma.householdMember.findMany({
    where: { userId: user.id },
  });
  const householdRoleMap = new Map<string, string>();
  for (const m of memberships) {
    householdRoleMap.set(m.householdId, m.role);
  }
  const allHouseholdIds = Array.from(householdRoleMap.keys());
  const fullReadHouseholdIds = allHouseholdIds.filter(
    (id) => householdRoleMap.get(id) !== "CONTRIBUTOR_ADD_ONLY"
  );
  const contributorHouseholdIds = allHouseholdIds.filter(
    (id) => householdRoleMap.get(id) === "CONTRIBUTOR_ADD_ONLY"
  );

  let dateFilter = {};
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
    dateFilter = {
      transactionDate: {
        gte: start,
        lt: end,
      },
    };
  }

  const whereClause: any = {
    deletedAt: null,
    OR: [
      { userId: user.id },
      { householdId: { in: fullReadHouseholdIds } },
      { householdId: { in: contributorHouseholdIds }, createdByUserId: user.id },
    ],
    ...dateFilter,
  };

  if (accountId) {
    whereClause.accountId = accountId;
  }

  const transactions = await prisma.transaction.findMany({
    where: whereClause,
    include: {
      splitItems: true,
    },
    orderBy: { transactionDate: "desc" },
    take: limit,
  });

  const serialized = transactions.map((t) => ({
    ...t,
    serverSeq: Number(t.serverSeq),
    transactionDate: t.transactionDate.toISOString(),
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    deletedAt: t.deletedAt ? t.deletedAt.toISOString() : null,
  }));

  return NextResponse.json({ transactions: serialized });
}

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
    isSplit = false,
    splitItems,
  } = body;

  if (!accountId || amountMinor === undefined) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const account = await assertCanWriteAccount(user, accountId);
  if (!account) {
    return NextResponse.json({ error: "Account not found or access forbidden" }, { status: 404 });
  }

  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  if (!["EXPENSE", "INCOME", "TRANSFER", "REFUND", "ADJUSTMENT"].includes(type)) {
    return NextResponse.json({ error: "Invalid transaction type" }, { status: 400 });
  }

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
        return NextResponse.json(
          { error: "Cross-currency transfers require destination amount and exchange rate" },
          { status: 400 }
        );
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
      isSplit: Boolean(isSplit),
      createdByUserId: user.id,
      updatedByUserId: user.id,
      transactionDate: new Date(transactionDate),
      serverSeq: nextSeq,
      ...(isSplit && Array.isArray(splitItems) && splitItems.length > 0
        ? {
            splitItems: {
              create: splitItems.map((si: any) => ({
                categoryId: si.categoryId,
                amountMinor: si.amountMinor,
                note: si.note || null,
              })),
            },
          }
        : {}),
    },
    include: {
      splitItems: true,
    },
  });

  return NextResponse.json({ transaction: tx }, { status: 201 });
}
