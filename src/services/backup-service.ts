import { apiClient } from "@/lib/api/client";
import { HardMoneyBackupPayload, ExportOptions } from "@/lib/backup/types";
import { ImportResult } from "@/lib/backup/import";

export async function downloadBackup(options?: ExportOptions): Promise<void> {
  const isPost = !!options;
  const response = await fetch("/api/backup/export", {
    method: isPost ? "POST" : "GET",
    headers: isPost ? { "Content-Type": "application/json" } : undefined,
    body: isPost ? JSON.stringify({ options }) : undefined,
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to download backup");
  }

  // Get filename from header or use default
  const disposition = response.headers.get("Content-Disposition");
  let filename = `hardmoney-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (disposition && disposition.includes("filename=")) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match?.[1]) {
      filename = match[1];
    }
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export async function importBackup(payload: HardMoneyBackupPayload): Promise<ImportResult> {
  const { data } = await apiClient.post<ImportResult>("/backup/import", payload);
  return data;
}
