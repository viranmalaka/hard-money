import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const whereClause: {
    userId: string;
    status?: string;
  } = {
    userId: session.userId,
  };

  if (status && status !== "ALL") {
    whereClause.status = status;
  }

  const items = await prisma.bankSms.findMany({
    where: whereClause,
    orderBy: { receivedAt: "desc" },
    include: {
      transaction: {
        select: {
          id: true,
          amountMinor: true,
          type: true,
          subType: true,
          note: true,
        },
      },
    },
  });

  return NextResponse.json({ items });
}
