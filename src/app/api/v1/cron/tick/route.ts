import { NextRequest, NextResponse } from "next/server";
import { runCronTick } from "@/lib/jobs/cron-runner";

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET || "optional-cron-secret-token";

  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  const cronSecretHeader = request.headers.get("x-cron-secret");

  console.log("CRON DEBUG:", {
    configuredSecret,
    authHeader,
    cronSecretHeader,
  });

  const isBearerMatch = authHeader === `Bearer ${configuredSecret}`;
  const isHeaderMatch = cronSecretHeader === configuredSecret;

  if (!isBearerMatch && !isHeaderMatch) {
    return NextResponse.json({ error: "Unauthorized: invalid or missing CRON_SECRET" }, { status: 401 });
  }

  try {
    const result = await runCronTick();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Cron tick error:", err);
    return NextResponse.json({ error: err.message || "Cron tick failed" }, { status: 500 });
  }
}
