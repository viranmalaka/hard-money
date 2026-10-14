import { NextResponse } from "next/server";
import { getServerNow } from "@/lib/server-clock";

export async function GET() {
  const now = getServerNow();
  return NextResponse.json({
    status: "ok",
    now: now.toISOString(),
    uptime: process.uptime(),
  });
}
