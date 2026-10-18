import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await prisma.bankSms.findMany({
    where: {
      userId: session.userId,
      status: "NEEDS_REVIEW",
    },
    orderBy: { receivedAt: "desc" },
  });

  return NextResponse.json({
    count: items.length,
    items,
  });
}
