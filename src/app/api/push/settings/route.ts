import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const PushSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:mm format").optional(),
});

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await (prisma as any).user.findUnique({
    where: { id: session.userId },
    include: {
      pushSubscriptions: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    enabled: user.pushRemindersEnabled,
    reminderTime: user.dailyReminderTime || "20:00",
    hasSubscription: user.pushSubscriptions.length > 0,
    subscriptionCount: user.pushSubscriptions.length,
  });
}

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = PushSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid payload" }, { status: 400 });
  }

  const dataToUpdate: { pushRemindersEnabled?: boolean; dailyReminderTime?: string } = {};
  if (parsed.data.enabled !== undefined) {
    dataToUpdate.pushRemindersEnabled = parsed.data.enabled;
  }
  if (parsed.data.reminderTime !== undefined) {
    dataToUpdate.dailyReminderTime = parsed.data.reminderTime;
  }

  const updatedUser = await (prisma as any).user.update({
    where: { id: session.userId },
    data: dataToUpdate,
  });

  return NextResponse.json({
    ok: true,
    enabled: updatedUser.pushRemindersEnabled,
    reminderTime: updatedUser.dailyReminderTime,
  });
}
