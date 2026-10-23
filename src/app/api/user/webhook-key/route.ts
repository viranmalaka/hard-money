import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      apiKeyPrefix: true,
      apiKeyHash: true,
    },
  });

  return NextResponse.json({
    hasKey: Boolean(user?.apiKeyHash),
    apiKeyPrefix: user?.apiKeyPrefix || null,
  });
}

export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const randomPart = crypto.randomBytes(24).toString("hex");
  const rawApiKey = `hm_live_${randomPart}`;
  const prefix = `hm_live_${randomPart.slice(0, 6)}...`;
  const hash = crypto.createHash("sha256").update(rawApiKey).digest("hex");

  await prisma.user.update({
    where: { id: session.userId },
    data: {
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
    },
  });

  // The full plaintext apiKey is returned ONLY on initial generation/regeneration
  return NextResponse.json({
    apiKey: rawApiKey,
    apiKeyPrefix: prefix,
  });
}
