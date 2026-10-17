import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const categories = await prisma.category.findMany({
    where: {
      userId: session.userId,
      deletedAt: null,
    },
    orderBy: { createdAt: "asc" },
  });

  const serialized = categories.map((cat) => ({
    ...cat,
    serverSeq: Number(cat.serverSeq),
  }));

  return NextResponse.json({ categories: serialized });
}
