import { getQueryClient } from "@/components/query-provider";
import { queryKeys } from "@/lib/api/query-keys";
import type { HardMoneyDB } from "@/lib/db";

export function updateQueryCacheOptimistic<T extends { id: string; deletedAt?: string | null }>(
  queryKey: readonly unknown[],
  op: "CREATE" | "UPDATE" | "DELETE",
  item: T
) {
  try {
    const queryClient = getQueryClient();
    queryClient.setQueryData<T[]>(queryKey, (old = []) => {
      if (op === "CREATE") {
        const filtered = old.filter((x) => x.id !== item.id);
        return [item, ...filtered];
      }
      if (op === "UPDATE") {
        return old.map((x) => (x.id === item.id ? { ...x, ...item } : x));
      }
      if (op === "DELETE") {
        return old.filter((x) => x.id !== item.id);
      }
      return old;
    });
  } catch (err) {
    console.warn("Failed to update query cache optimistically:", err);
  }
}

export async function syncDbToQueryCache(db: HardMoneyDB) {
  try {
    const notDeleted = <R extends { deletedAt?: unknown }>(r: R) => !r.deletedAt;
    const [
      accounts,
      categories,
      transactions,
      templates,
      budgets,
      budgetSnapshots,
      creditCardStatements,
      installmentPlans,
      fixedDeposits,
      fixedDepositPayouts,
      loans,
      loanScheduleEntries,
      loanPayments,
      shoppingListItems,
    ] = await Promise.all([
      db.accounts.filter(notDeleted).toArray(),
      db.categories.filter(notDeleted).toArray(),
      db.transactions.filter(notDeleted).toArray(),
      db.templates.filter(notDeleted).toArray(),
      db.budgets.filter(notDeleted).toArray(),
      db.budgetSnapshots.toArray(),
      db.creditCardStatements.toArray(),
      db.installmentPlans.filter(notDeleted).toArray(),
      db.fixedDeposits.filter(notDeleted).toArray(),
      db.fixedDepositPayouts.toArray(),
      db.loans.filter(notDeleted).toArray(),
      db.loanScheduleEntries.toArray(),
      db.loanPayments.toArray(),
      db.shoppingListItems.filter(notDeleted).toArray(),
    ]);

    const qc = getQueryClient();
    qc.setQueryData(queryKeys.accounts.all(), accounts);
    qc.setQueryData(queryKeys.categories.all(), categories);
    qc.setQueryData(queryKeys.transactions.all(), transactions);
    qc.setQueryData(queryKeys.templates.all(), templates);
    qc.setQueryData(queryKeys.budgets.all(), budgets);
    qc.setQueryData(queryKeys.budgets.snapshots(), budgetSnapshots);
    qc.setQueryData(queryKeys.creditCardStatements.all(), creditCardStatements);
    qc.setQueryData(queryKeys.installmentPlans.all(), installmentPlans);
    qc.setQueryData(queryKeys.fixedDeposits.all(), fixedDeposits);
    qc.setQueryData(queryKeys.fixedDeposits.payouts(), fixedDepositPayouts);
    qc.setQueryData(queryKeys.loans.all(), loans);
    qc.setQueryData(queryKeys.loans.scheduleEntries(), loanScheduleEntries);
    qc.setQueryData(queryKeys.loans.payments(), loanPayments);
    qc.setQueryData(
      queryKeys.shoppingList.count(),
      shoppingListItems.filter((i) => !i.isCompleted).length
    );
  } catch (err) {
    console.warn("Failed to sync Dexie to React Query cache:", err);
  }
}

