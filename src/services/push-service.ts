import { apiClient } from "@/lib/api/client";

export async function getPushSettings() {
  const { data } = await apiClient.get("/push/settings");
  return data;
}

export async function subscribePush(input: Record<string, unknown>) {
  const { data } = await apiClient.post("/push/subscribe", input);
  return data;
}

export async function unsubscribePush() {
  const { data } = await apiClient.post("/push/unsubscribe");
  return data;
}

export async function savePushSettings(input: { enabled: boolean; reminderTime: string }) {
  const { data } = await apiClient.post("/push/settings", input);
  return data;
}
