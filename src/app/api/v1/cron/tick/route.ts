import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runCronTick } from "@/lib/jobs/cron-runner";

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  const provided = authHeader?.replace(/^Bearer\s+/i, "") ||
    request.headers.get("x-cron-secret") || "";
  const expected = configuredSecret || "";
  const isMatch = provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!isMatch) {
    return NextResponse.json({ error: "Unauthorized: invalid or missing CRON_SECRET" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runCronTick());
  } catch (err) {
    console.error("Cron tick error:", err);
    return NextResponse.json({ error: "Cron tick failed" }, { status: 500 });
  }
}
