import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { exportUserData } from "@/lib/backup/export";
import { ExportOptions } from "@/lib/backup/types";

function parseQueryOptions(url: string): ExportOptions | undefined {
  const { searchParams } = new URL(url);
  const keys: (keyof ExportOptions)[] = [
    "accounts",
    "transactions",
    "categories",
    "budgets",
    "fixedDeposits",
    "loans",
    "creditCards",
    "templates",
    "households",
    "bankSms",
    "settings",
  ];

  let hasAny = false;
  const options: ExportOptions = {};

  for (const key of keys) {
    if (searchParams.has(key)) {
      hasAny = true;
      options[key] = searchParams.get(key) !== "false" && searchParams.get(key) !== "0";
    }
  }

  return hasAny ? options : undefined;
}

async function handleExportResponse(userId: string, options?: ExportOptions) {
  const backupData = await exportUserData(userId, options);
  const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `hardmoney-backup-${dateStr}.json`;

  return new NextResponse(JSON.stringify(backupData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const options = parseQueryOptions(request.url);
    return await handleExportResponse(session.userId, options);
  } catch (error: unknown) {
    console.error("Backup export failed:", error);
    const msg = error instanceof Error ? error.message : "Failed to generate backup export";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const options: ExportOptions | undefined = body?.options;
    return await handleExportResponse(session.userId, options);
  } catch (error: unknown) {
    console.error("Backup export failed:", error);
    const msg = error instanceof Error ? error.message : "Failed to generate backup export";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

