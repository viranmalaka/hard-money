import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const sms = await prisma.bankSms.findFirst({
    where: {
      userId: user.id,
      transactionId: id,
    },
    select: {
      id: true,
      sender: true,
      rawMessage: true,
      receivedAt: true,
      status: true,
    },
  });

  if (!sms) {
    return NextResponse.json({ error: "SMS not found for transaction" }, { status: 404 });
  }

  return NextResponse.json({ sms });
}
