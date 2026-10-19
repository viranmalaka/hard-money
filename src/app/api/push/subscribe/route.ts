import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = SubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid push subscription object" },
      { status: 400 }
    );
  }

  const { endpoint, keys } = parsed.data;

  // Upsert subscription for user
  const sub = await (prisma as any).pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: session.userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    update: {
      userId: session.userId,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });

  // Automatically enable push reminders when a device subscribes
  await (prisma as any).user.update({
    where: { id: session.userId },
    data: { pushRemindersEnabled: true },
  });

  return NextResponse.json({ ok: true, subscriptionId: sub.id });
}
