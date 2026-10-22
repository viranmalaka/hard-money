import { apiClient } from "@/lib/api/client";

export async function closeFixedDeposit(
  input: { id: string; actualProceedsMinor: number; targetAccountId: string }
) {
  const { data } = await apiClient.post(`/fixed-deposits/${input.id}/close`, {
    actualProceedsMinor: input.actualProceedsMinor,
    targetAccountId: input.targetAccountId,
  });
  return data;
}

export async function depositFixedDepositProceeds(id: string) {
  const { data } = await apiClient.post(`/fixed-deposits/${id}/deposit-proceeds`);
  return data;
}
