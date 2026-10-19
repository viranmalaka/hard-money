import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: householdId } = await params;
  const body = await request.json().catch(() => null);
  const { newOwnerId: rawId, newOwnerUserId } = body || {};
  const newOwnerId = rawId || newOwnerUserId;

  if (!newOwnerId) {
    return NextResponse.json({ error: "newOwnerId is required" }, { status: 400 });
  }

  const household = await prisma.household.findUnique({
    where: { id: householdId },
  });

  if (!household) {
    return NextResponse.json({ error: "Household not found" }, { status: 404 });
  }

  if (household.ownerId !== session.userId) {
    return NextResponse.json(
      { error: "Forbidden: Only the current owner can transfer ownership" },
      { status: 403 }
    );
  }

  const newOwnerMember = await prisma.householdMember.findUnique({
    where: {
      householdId_userId: {
        householdId,
        userId: newOwnerId,
      },
    },
  });

  if (!newOwnerMember) {
    return NextResponse.json(
      { error: "Target user is not a member of this household" },
      { status: 400 }
    );
  }

  await prisma.$transaction(async (tx) => {
    // 1. Update household ownerId
    await tx.household.update({
      where: { id: householdId },
      data: { ownerId: newOwnerId },
    });

    // 2. Demote previous owner to CO_OWNER
    await tx.householdMember.update({
      where: {
        householdId_userId: {
          householdId,
          userId: session.userId,
        },
      },
      data: { role: "CO_OWNER" },
    });

    // 3. Promote new owner to OWNER
    await tx.householdMember.update({
      where: {
        householdId_userId: {
          householdId,
          userId: newOwnerId,
        },
      },
      data: { role: "OWNER" },
    });
  });

  return NextResponse.json({ success: true });
}
