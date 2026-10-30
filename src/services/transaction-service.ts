import { apiClient } from "@/lib/api/client";
import type { LocalTransaction } from "@/lib/db";

export interface TransactionSummaryData {
  totalIncomeMinor: number;
  totalExpenseMinor: number;
  netSavingsMinor: number;
  month: string;
  transactionCount: number;
}

export async function listTransactions(params: { month?: string; accountId?: string; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.month) query.set("month", params.month);
  if (params.accountId) query.set("accountId", params.accountId);
  if (params.limit) query.set("limit", String(params.limit));

  const url = `/transactions${query.toString() ? `?${query.toString()}` : ""}`;
  const { data } = await apiClient.get<{ transactions: LocalTransaction[] }>(url);
  return data.transactions ?? [];
}

export async function getTransactionSummary(month?: string): Promise<TransactionSummaryData> {
  const url = month ? `/transactions/summary?month=${month}` : "/transactions/summary";
  const { data } = await apiClient.get<{ summary: TransactionSummaryData }>(url);
  return data.summary;
}

export async function createTransaction(payload: Record<string, unknown>) {
  const { data } = await apiClient.post<{ transaction: LocalTransaction }>("/transactions", payload);
  return data.transaction;
}

export async function updateTransaction(id: string, payload: Record<string, unknown>) {
  const { data } = await apiClient.patch<{ transaction: LocalTransaction }>(`/transactions/${id}`, payload);
  return data.transaction;
}

export async function deleteTransaction(id: string) {
  const { data } = await apiClient.delete(`/transactions/${id}`);
  return data;
}

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
