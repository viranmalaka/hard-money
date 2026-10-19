import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SettingsSchema = z.object({
  name: z.string().optional(),
  timezone: z.string().optional(),
  defaultCurrency: z.string().optional(),
  defaultWithholdingTaxRateBps: z.number().optional(),
});

export async function PATCH(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = SettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const dataToUpdate: {
    name?: string;
    timezone?: string;
    defaultCurrency?: string;
    defaultWithholdingTaxRateBps?: number;
  } = {};

  if (parsed.data.name && parsed.data.name.trim().length > 0) {
    dataToUpdate.name = parsed.data.name.trim();
  }
  if (parsed.data.timezone && parsed.data.timezone.trim().length > 0) {
    dataToUpdate.timezone = parsed.data.timezone.trim();
  }
  if (parsed.data.defaultCurrency && parsed.data.defaultCurrency.trim().length === 3) {
    dataToUpdate.defaultCurrency = parsed.data.defaultCurrency.trim().toUpperCase();
  }
  if (parsed.data.defaultWithholdingTaxRateBps !== undefined) {
    dataToUpdate.defaultWithholdingTaxRateBps = parsed.data.defaultWithholdingTaxRateBps;
  }

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data: dataToUpdate,
    select: {
      id: true,
      name: true,
      email: true,
      timezone: true,
      defaultCurrency: true,
      defaultWithholdingTaxRateBps: true,
    },
  });

  return NextResponse.json({ user: updated });
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      timezone: true,
      defaultCurrency: true,
      defaultWithholdingTaxRateBps: true,
    },
  });

  return NextResponse.json({ user });
}
