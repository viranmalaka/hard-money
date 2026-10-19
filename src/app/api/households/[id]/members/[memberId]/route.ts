import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: householdId, memberId } = await params;
  const body = await request.json().catch(() => null);
  const { role } = body || {};

  const validRoles = ["CO_OWNER", "CONTRIBUTOR_ADD_ONLY", "VIEWER"];
  if (!validRoles.includes(role)) {
    return NextResponse.json(
      { error: "Invalid role. Role must be CO_OWNER, CONTRIBUTOR_ADD_ONLY, or VIEWER" },
      { status: 400 }
    );
  }

  // Caller permission check
  const caller = await prisma.householdMember.findUnique({
    where: {
      householdId_userId: {
        householdId,
        userId: session.userId,
      },
    },
  });

  if (!caller || (caller.role !== "OWNER" && caller.role !== "CO_OWNER")) {
    return NextResponse.json(
      { error: "Forbidden: Only OWNER or CO_OWNER can modify roles" },
      { status: 403 }
    );
  }

  // Target member
  const targetMember = await prisma.householdMember.findUnique({
    where: { id: memberId },
  });

  if (!targetMember || targetMember.householdId !== householdId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (targetMember.role === "OWNER") {
    return NextResponse.json(
      { error: "Cannot change the role of the household OWNER. Use ownership transfer." },
      { status: 400 }
    );
  }

  const updated = await prisma.householdMember.update({
    where: { id: memberId },
    data: { role },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return NextResponse.json({ member: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: householdId, memberId } = await params;

  // Target member
  const targetMember = await prisma.householdMember.findUnique({
    where: { id: memberId },
  });

  if (!targetMember || targetMember.householdId !== householdId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const isSelf = targetMember.userId === session.userId;

  if (isSelf) {
    // User is leaving
    if (targetMember.role === "OWNER") {
      return NextResponse.json(
        { error: "Owner cannot leave without transferring ownership first" },
        { status: 400 }
      );
    }
  } else {
    // Caller is removing someone else
    const caller = await prisma.householdMember.findUnique({
      where: {
        householdId_userId: {
          householdId,
          userId: session.userId,
        },
      },
    });

    if (!caller || (caller.role !== "OWNER" && caller.role !== "CO_OWNER")) {
      return NextResponse.json(
        { error: "Forbidden: Only OWNER or CO_OWNER can remove members" },
        { status: 403 }
      );
    }

    if (targetMember.role === "OWNER") {
      return NextResponse.json(
        { error: "Cannot remove the household OWNER" },
        { status: 400 }
      );
    }
  }

  await prisma.householdMember.delete({
    where: { id: memberId },
  });

  return NextResponse.json({ success: true, removed: true });
}
