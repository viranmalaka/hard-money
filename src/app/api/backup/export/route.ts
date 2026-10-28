import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { exportUserData } from "@/lib/backup/export";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const backupData = await exportUserData(session.userId);
    const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `hardmoney-backup-${dateStr}.json`;

    return new NextResponse(JSON.stringify(backupData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    console.error("Backup export failed:", error);
    const msg = error instanceof Error ? error.message : "Failed to generate backup export";
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
