import { apiClient } from "@/lib/api/client";

export async function getRawSms(transactionId: string) {
  const { data } = await apiClient.get(`/transactions/${transactionId}/raw-sms`);
  return data;
}

export async function mergeDuplicate(transactionId: string) {
  const { data } = await apiClient.post(`/transactions/${transactionId}/merge`);
  return data;
}

export async function dismissDuplicate(transactionId: string) {
  const { data } = await apiClient.post(`/transactions/${transactionId}/dismiss-duplicate`);
  return data;
}
