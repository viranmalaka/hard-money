import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptAesGcm, decryptAesGcm, maskApiKey } from "@/lib/encryption";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      geminiApiKeyEncrypted: true,
      geminiModel: true,
      smsAutoPostMode: true,
    },
  });

  let maskedKey: string | null = null;
  if (user?.geminiApiKeyEncrypted) {
    try {
      const decrypted = decryptAesGcm(user.geminiApiKeyEncrypted);
      maskedKey = maskApiKey(decrypted);
    } catch {
      maskedKey = "••••****";
    }
  }

  return NextResponse.json({
    hasKey: Boolean(user?.geminiApiKeyEncrypted),
    maskedKey,
    geminiModel: user?.geminiModel || "gemini-2.5-flash",
    smsAutoPostMode: user?.smsAutoPostMode || "AUTO_VALIDATED",
  });
}

export async function PATCH(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updateData: {
    geminiApiKeyEncrypted?: string | null;
    geminiModel?: string;
    smsAutoPostMode?: string;
  } = {};

  if (typeof body.geminiApiKey === "string") {
    const rawKey = body.geminiApiKey.trim();
    if (rawKey.length === 0) {
      updateData.geminiApiKeyEncrypted = null;
    } else {
      updateData.geminiApiKeyEncrypted = encryptAesGcm(rawKey);
    }
  }

  if (typeof body.geminiModel === "string" && body.geminiModel.trim().length > 0) {
    updateData.geminiModel = body.geminiModel.trim();
  }

  if (typeof body.smsAutoPostMode === "string" && body.smsAutoPostMode.trim().length > 0) {
    updateData.smsAutoPostMode = body.smsAutoPostMode.trim();
  }

  const updatedUser = await prisma.user.update({
    where: { id: session.userId },
    data: updateData,
    select: {
      geminiApiKeyEncrypted: true,
      geminiModel: true,
      smsAutoPostMode: true,
    },
  });

  let maskedKey: string | null = null;
  if (updatedUser.geminiApiKeyEncrypted) {
    try {
      const decrypted = decryptAesGcm(updatedUser.geminiApiKeyEncrypted);
      maskedKey = maskApiKey(decrypted);
    } catch {
      maskedKey = "••••****";
    }
  }

  return NextResponse.json({
    ok: true,
    hasKey: Boolean(updatedUser.geminiApiKeyEncrypted),
    maskedKey,
    geminiModel: updatedUser.geminiModel || "gemini-2.5-flash",
    smsAutoPostMode: updatedUser.smsAutoPostMode || "AUTO_VALIDATED",
  });
}
