import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") || "").trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ user: null });
  }

  const target = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
      NOT: {
        id: session.userId,
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  return NextResponse.json({ user: target });
}
