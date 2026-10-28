import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { importUserData } from "@/lib/backup/import";
import { HardMoneyBackupPayload } from "@/lib/backup/types";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: HardMoneyBackupPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON format" }, { status: 400 });
  }

  if (!body || body.version !== 1 || !body.user) {
    return NextResponse.json(
      { error: "Invalid backup structure. Must be a valid HardMoney backup (version 1)." },
      { status: 400 }
    );
  }

  try {
    const result = await importUserData(session.userId, body);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Backup import failed:", error);
    const msg = error instanceof Error ? error.message : "Failed to import backup data";
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
