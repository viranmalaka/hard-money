import { NextResponse } from "next/server";

export async function GET() {
  const shortcutPayload = JSON.stringify(
    {
      name: "HardMoney SMS Ingress",
      description:
        "Apple Shortcut to forward incoming Sri Lankan Bank SMS notifications to HardMoney webhook",
      actions: [
        {
          type: "GetDictionaryFromInput",
          comment: "Receives SMS text and sender from automation trigger",
        },
        {
          type: "NetworkRequest",
          method: "POST",
          url: "https://your-domain.com/api/v1/webhooks/sms-ingress",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": "PASTE_YOUR_API_KEY_HERE",
          },
        },
      ],
      version: "1.0.0",
    },
    null,
    2
  );

  return new NextResponse(shortcutPayload, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="HardMoney_SMS_Ingress.shortcut"',
    },
  });
}
