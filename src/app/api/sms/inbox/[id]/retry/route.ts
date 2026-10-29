import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processBankSms } from "@/lib/sms/worker";

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

  // If SMS is currently in PROCESSING state, prevent accidental double-processing
  // unless 1 minute has elapsed since ingress (createdAt/receivedAt) or force flag is set.
  const isForce = _request.nextUrl.searchParams.get("force") === "true";
  if (sms.status === "PROCESSING" && !isForce) {
    const ingressTime = new Date(sms.createdAt || sms.receivedAt).getTime();
    const elapsedMs = Date.now() - ingressTime;
    if (elapsedMs < 60 * 1000) {
      const waitSeconds = Math.ceil((60 * 1000 - elapsedMs) / 1000);
      return NextResponse.json(
        {
          error: "SMS is currently being processed. Please wait 1 minute before retrying.",
          retryAfterSeconds: waitSeconds,
        },
        { status: 429 }
      );
    }
  }

  await prisma.bankSms.update({
    where: { id },
    data: {
      status: "PENDING",
      attempts: 0,
      failureReason: null,
    },
  });

  await processBankSms(id, { force: true });

  const updated = await prisma.bankSms.findUnique({
    where: { id },
  });

  return NextResponse.json({ ok: true, item: updated });
}
