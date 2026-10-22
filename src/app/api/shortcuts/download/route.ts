import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { encryptAesGcm, decryptAesGcm } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function plistString(value: string): string {
  return `<string>${escapeXml(value)}</string>`;
}

function plistKeyValue(key: string, value: string): string {
  return `<key>${escapeXml(key)}</key>${plistString(value)}`;
}

function buildShortcut(apiKey: string, webhookUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>WFWorkflowActions</key><array>
  <dict>
    <key>WFWorkflowActionIdentifier</key>${plistString("is.workflow.actions.getcontents-ofurl")}
    <key>WFWorkflowActionParameters</key><dict>
      ${plistKeyValue("WFURL", webhookUrl)}
      ${plistKeyValue("WFHTTPMethod", "POST")}
      <key>WFHTTPHeaders</key><dict>
        ${plistKeyValue("Content-Type", "application/json")}
        ${plistKeyValue("x-api-key", apiKey)}
      </dict>
      ${plistKeyValue("WFRequestBodyType", "JSON")}
      <key>WFJSONValues</key><dict>
        ${plistKeyValue("rawSms", "Shortcut Input")}
        ${plistKeyValue("sender", "Shortcut Input")}
        ${plistKeyValue("receivedAt", "Current Date")}
      </dict>
    </dict>
  </dict>
</array>
${plistKeyValue("WFWorkflowClientRelease", "2.0")}
${plistKeyValue("WFWorkflowClientVersion", "2600")}
<key>WFWorkflowIcon</key><dict>
  <key>WFWorkflowIconGlyphNumber</key><integer>59511</integer>
  <key>WFWorkflowIconStartColor</key><integer>4282601983</integer>
</dict>
<key>WFWorkflowImportQuestions</key><array/>
${plistKeyValue("WFWorkflowName", "HardMoney SMS Ingress")}
<key>WFWorkflowTypes</key><array><string>NCWidget</string><string>WatchKit</string></array>
</dict></plist>`;
}

function createApiKey(): string {
  return `hm_live_${crypto.randomBytes(24).toString("hex")}`;
}

export async function GET(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { apiKeyEncrypted: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let apiKey: string;
  if (user.apiKeyEncrypted) {
    try {
      apiKey = decryptAesGcm(user.apiKeyEncrypted);
    } catch (error) {
      console.error("Failed to decrypt webhook API key for shortcut download", error);
      return NextResponse.json({ error: "Webhook API key could not be recovered" }, { status: 500 });
    }
  } else {
    // Legacy keys were only hashed and cannot be recovered, so rotate once.
    apiKey = createApiKey();
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        apiKeyHash: crypto.createHash("sha256").update(apiKey).digest("hex"),
        apiKeyPrefix: `hm_live_${apiKey.slice(8, 14)}...`,
        apiKeyEncrypted: encryptAesGcm(apiKey),
      },
    });
  }

  const webhookUrl = new URL("/api/v1/webhooks/sms-ingress", request.url).toString();
  return new NextResponse(buildShortcut(apiKey, webhookUrl), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="HardMoney_SMS_Ingress.shortcut"; filename*=UTF-8\'\'HardMoney_SMS_Ingress.shortcut',
      "Cache-Control": "no-store",
    },
  });
}
