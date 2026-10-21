import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await prisma.householdMember.findMany({
    where: { userId: user.id },
    select: { householdId: true },
  });
  const householdIds = memberships.map((membership) => membership.householdId);
  const count = householdIds.length
    ? await prisma.shoppingListItem.count({
        where: {
          householdId: { in: householdIds },
          isCompleted: false,
          deletedAt: null,
        },
      })
    : 0;

  return NextResponse.json({ count });
}
