import { apiClient } from "@/lib/api/client";
import type { LocalShoppingListItem } from "@/lib/db";

export async function getShoppingListCount() {
  const { data } = await apiClient.get<{ count: number }>("/shopping-list/count");
  return data;
}

export async function listShoppingItems(householdId: string): Promise<LocalShoppingListItem[]> {
  if (!householdId) return [];
  const { data } = await apiClient.get<{ items: LocalShoppingListItem[] }>(
    `/shopping-list?householdId=${encodeURIComponent(householdId)}`
  );
  return data.items ?? [];
}
