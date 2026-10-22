import { apiClient } from "@/lib/api/client";

export async function getLoan(id: string) {
  const { data } = await apiClient.get(`/loans/${id}`);
  return data;
}

export async function payLoanEmi(id: string, input: Record<string, unknown> = {}) {
  const { data } = await apiClient.post(`/loans/${id}/pay-emi`, input);
  return data;
}

export async function closeLoan(id: string) {
  const { data } = await apiClient.post(`/loans/${id}/close`);
  return data;
}

export async function updateLoanSchedule(id: string, entryId: string, input: Record<string, unknown>) {
  const { data } = await apiClient.patch(`/loans/${id}/schedule/${entryId}`, input);
  return data;
}
