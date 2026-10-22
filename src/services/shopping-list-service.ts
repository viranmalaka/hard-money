import { apiClient } from "@/lib/api/client";

export async function getShoppingListCount() {
  const { data } = await apiClient.get<{ count: number }>("/shopping-list/count");
  return data;
}
