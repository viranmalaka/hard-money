import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templates = await prisma.transactionTemplate.findMany({
    where: {
      userId: session.userId,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  const serialized = templates.map((tmpl) => ({
    ...tmpl,
    serverSeq: Number(tmpl.serverSeq),
  }));

  return NextResponse.json({ templates: serialized });
}

