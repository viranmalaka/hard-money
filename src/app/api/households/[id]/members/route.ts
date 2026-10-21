import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

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

  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = z.object({
    email: z.string().email().max(254).optional(),
    userId: z.string().min(1).optional(),
    role: z.enum(["CO_OWNER", "CONTRIBUTOR_ADD_ONLY", "VIEWER"]).default("VIEWER"),
  }).safeParse(body);
  if (!parsed.success || (!parsed.data.email && !parsed.data.userId) || (parsed.data.email && parsed.data.userId)) {
    return NextResponse.json({ error: "Valid email or userId and role are required" }, { status: 400 });
  }
  const { email, userId, role } = parsed.data;
  const targetRole = role || "VIEWER";
  const validRoles = ["CO_OWNER", "CONTRIBUTOR_ADD_ONLY", "VIEWER"];

  if (!validRoles.includes(targetRole)) {
    return NextResponse.json(
      { error: "Invalid role. Must be CO_OWNER, CONTRIBUTOR_ADD_ONLY, or VIEWER" },
      { status: 400 }
    );
  }

  // Check caller's permission in this household: must be OWNER or CO_OWNER
  const callerMembership = await prisma.householdMember.findUnique({
    where: {
      householdId_userId: {
        householdId,
        userId: session.userId,
      },
    },
  });

  if (!callerMembership || (callerMembership.role !== "OWNER" && callerMembership.role !== "CO_OWNER")) {
    return NextResponse.json(
      { error: "Forbidden: Only OWNER or CO_OWNER can add members" },
      { status: 403 }
    );
  }
  if (targetRole === "CO_OWNER" && callerMembership.role !== "OWNER") {
    return NextResponse.json({ error: "Only the OWNER can add CO_OWNER members" }, { status: 403 });
  }

  // Find target user
  let targetUser = null;
  if (userId) {
    targetUser = await prisma.user.findUnique({ where: { id: userId } });
  } else if (email) {
    targetUser = await prisma.user.findFirst({
      where: {
        email: { equals: email.trim(), mode: "insensitive" },
      },
    });
  }

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Check if target is already a member
  const existingMember = await prisma.householdMember.findUnique({
    where: {
      householdId_userId: {
        householdId,
        userId: targetUser.id,
      },
    },
  });

  if (existingMember) {
    return NextResponse.json(
      { error: "User is already a member of this household" },
      { status: 400 }
    );
  }

  // Add member directly (no acceptance step)
  const newMember = await prisma.householdMember.create({
    data: {
      householdId,
      userId: targetUser.id,
      role: targetRole,
    },
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

  return NextResponse.json({ member: newMember }, { status: 201 });
}
