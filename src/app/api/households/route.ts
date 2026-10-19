import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find all households where current user is a member
  const memberships = await prisma.householdMember.findMany({
    where: { userId: session.userId },
    include: {
      household: {
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  const households = memberships.map((m) => {
    const h = m.household;
    return {
      id: h.id,
      name: h.name,
      ownerId: h.ownerId,
      isOwner: h.ownerId === session.userId,
      myRole: m.role,
      createdAt: h.createdAt,
      members: h.members.map((mem) => ({
        id: mem.id,
        householdId: mem.householdId,
        userId: mem.userId,
        role: mem.role,
        user: mem.user,
        createdAt: mem.createdAt,
      })),
    };
  });

  return NextResponse.json({ households });
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Household name is required" }, { status: 400 });
  }

  const household = await prisma.$transaction(async (tx) => {
    const h = await tx.household.create({
      data: {
        name,
        ownerId: session.userId,
      },
    });

    await tx.householdMember.create({
      data: {
        householdId: h.id,
        userId: session.userId,
        role: "OWNER",
      },
    });

    return h;
  });

  return NextResponse.json({ household }, { status: 201 });
}
