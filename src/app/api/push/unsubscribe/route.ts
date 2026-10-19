import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UnsubscribeSchema = z.object({
  endpoint: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = UnsubscribeSchema.safeParse(body);

  if (parsed.success && parsed.data.endpoint) {
    await (prisma as any).pushSubscription.deleteMany({
      where: {
        userId: session.userId,
        endpoint: parsed.data.endpoint,
      },
    });
  } else {
    // Unsubscribe all for user
    await (prisma as any).pushSubscription.deleteMany({
      where: { userId: session.userId },
    });
  }

  return NextResponse.json({ ok: true });
}
