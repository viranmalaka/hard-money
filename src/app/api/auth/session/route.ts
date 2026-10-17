import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      timezone: true,
      defaultCurrency: true,
      countryCode: true,
      smsAutoPostMode: true,
    },
  });

  if (!user) {
    return NextResponse.json({
      user: {
        id: session.userId,
        name: session.name,
        email: session.email,
        timezone: "Asia/Colombo",
        defaultCurrency: "LKR",
      },
    });
  }

  return NextResponse.json({ user });
}
