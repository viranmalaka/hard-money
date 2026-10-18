import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const sms = await prisma.bankSms.findUnique({
    where: { id },
  });

  if (!sms || sms.userId !== session.userId) {
    return NextResponse.json({ error: "SMS not found" }, { status: 404 });
  }

  await prisma.bankSms.update({
    where: { id },
    data: { status: "IGNORED_NON_TX" },
  });

  return NextResponse.json({ ok: true });
}
