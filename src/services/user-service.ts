import { apiClient } from "@/lib/api/client";

export async function getAccounts() {
  const { data } = await apiClient.get("/user/accounts");
  return data.accounts;
}

export async function getCategories() {
  const { data } = await apiClient.get("/user/categories");
  return data.categories;
}

export async function getSettings() {
  const { data } = await apiClient.get("/user/settings");
  return data;
}

export async function updateSettings(input: Record<string, unknown>) {
  const { data } = await apiClient.patch("/user/settings", input);
  return data;
}

export async function getGeminiSettings() {
  const { data } = await apiClient.get("/user/gemini-settings");
  return data;
}

export async function updateGeminiSettings(input: Record<string, unknown>) {
  const { data } = await apiClient.patch("/user/gemini-settings", input);
  return data;
}

export async function getWebhookKey() {
  const { data } = await apiClient.get("/user/webhook-key");
  return data;
}

export async function regenerateWebhookKey() {
  const { data } = await apiClient.post("/user/webhook-key");
  return data;
}
