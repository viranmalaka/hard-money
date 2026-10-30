import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // e.g. "2026-10"

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

  const transactions = await prisma.transaction.findMany({
    where: {
      deletedAt: null,
      excludeFromStats: false,
      OR: [
        { userId: user.id },
        { householdId: { in: fullReadHouseholdIds } },
        { householdId: { in: contributorHouseholdIds }, createdByUserId: user.id },
      ],
      ...dateFilter,
    },
    select: {
      type: true,
      amountMinor: true,
      source: true,
      isSplit: true,
      splitItems: {
        select: {
          amountMinor: true,
          categoryId: true,
        },
      },
      categoryId: true,
      transactionDate: true,
    },
  });

  let totalIncomeMinor = 0;
  let totalExpenseMinor = 0;

  for (const t of transactions) {
    if (t.type === "TRANSFER" || t.type === "ADJUSTMENT" || t.source === "CALIBRATION") continue;

    if (t.isSplit && t.splitItems && t.splitItems.length > 0) {
      for (const item of t.splitItems) {
        if (t.type === "INCOME") totalIncomeMinor += item.amountMinor;
        else if (t.type === "EXPENSE" || t.type === "REFUND") totalExpenseMinor += item.amountMinor;
      }
    } else {
      if (t.type === "INCOME") totalIncomeMinor += t.amountMinor;
      else if (t.type === "EXPENSE" || t.type === "REFUND") totalExpenseMinor += t.amountMinor;
    }
  }

  const netSavingsMinor = totalIncomeMinor - totalExpenseMinor;

  return NextResponse.json({
    summary: {
      totalIncomeMinor,
      totalExpenseMinor,
      netSavingsMinor,
      month: month || "all",
      transactionCount: transactions.length,
    },
  });
}
