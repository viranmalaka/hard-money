import { apiClient } from "@/lib/api/client";

export interface BankSmsItem {
  id: string;
  userId: string;
  sender: string;
  rawMessage: string;
  receivedAt: string;
  status: string;
  parseMethod: string | null;
  parsedPayload: Record<string, unknown> | null;
  reviewReason: string | null;
  failureReason: string | null;
  attempts: number;
}

export async function listInbox() {
  const { data } = await apiClient.get<{ items: BankSmsItem[] }>("/sms/inbox");
  return data.items;
}

export async function postInboxItem(
  itemId: string,
  input: {
    accountId: string;
    amount?: string;
    categoryId?: string;
    note?: string;
    toAccountId?: string;
    destinationAmount?: string;
    exchangeRate?: string;
  }
) {
  const { data } = await apiClient.post(`/sms/inbox/${itemId}/post`, input);
  return data;
}

export async function ignoreInboxItem(itemId: string) {
  const { data } = await apiClient.post(`/sms/inbox/${itemId}/ignore`);
  return data;
}

export async function retryInboxItem(itemId: string) {
  const { data } = await apiClient.post(`/sms/inbox/${itemId}/retry`);
  return data;
}

export async function mergeTransferInboxItem(
  itemId: string,
  input?: {
    counterpartTransactionId?: string;
    fromAccountId?: string;
    toAccountId?: string;
    note?: string;
  }
) {
  const { data } = await apiClient.post(`/sms/inbox/${itemId}/merge-transfer`, input || {});
  return data;
}

