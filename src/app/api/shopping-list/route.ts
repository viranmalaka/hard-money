import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const householdId = searchParams.get("householdId");

  if (!householdId) {
    return NextResponse.json({ items: [] });
  }

  // Ensure user is member of this household
  const membership = await prisma.householdMember.findUnique({
    where: {
      householdId_userId: {
        householdId,
        userId: user.id,
      },
    },
  });

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = await prisma.shoppingListItem.findMany({
    where: {
      householdId,
      deletedAt: null,
    },
    orderBy: [{ isCompleted: "asc" }, { position: "asc" }, { createdAt: "asc" }],
  });

  const serialized = items.map((i) => ({
    ...i,
    serverSeq: Number(i.serverSeq),
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    completedAt: i.completedAt ? i.completedAt.toISOString() : null,
    deletedAt: i.deletedAt ? i.deletedAt.toISOString() : null,
  }));

  return NextResponse.json({ items: serialized });
}
