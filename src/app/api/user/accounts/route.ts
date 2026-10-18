import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.account.findMany({
    where: {
      userId: session.userId,
      deletedAt: null,
    },
    orderBy: { name: "asc" },
  });

  const serialized = accounts.map((acc) => ({
    ...acc,
    serverSeq: Number(acc.serverSeq),
  }));

  return NextResponse.json({ accounts: serialized });
}
