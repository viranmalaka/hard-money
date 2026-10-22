import { apiClient } from "@/lib/api/client";

export async function getSmsActivity() {
  const { data } = await apiClient.get("/sms/activity");
  return data;
}
