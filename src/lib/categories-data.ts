export type CategoryType = "EXPENSE" | "INCOME";

export const DEFAULT_SYSTEM_CATEGORIES: { name: string; icon: string; color: string; type: CategoryType }[] = [
  { name: "Groceries", icon: "ShoppingCart", color: "#2B8A3E", type: "EXPENSE" },
  { name: "Dining", icon: "Utensils", color: "#E8590C", type: "EXPENSE" },
  { name: "Fuel & Transport", icon: "Fuel", color: "#1971C2", type: "EXPENSE" },
  { name: "Utilities & Bills", icon: "Zap", color: "#F59F00", type: "EXPENSE" },
  { name: "Healthcare", icon: "HeartPulse", color: "#D6336C", type: "EXPENSE" },
  { name: "Shopping", icon: "ShoppingBag", color: "#845EF7", type: "EXPENSE" },
  { name: "Bank Fees", icon: "AlertCircle", color: "#495057", type: "EXPENSE" },
  { name: "Cash Withdrawal", icon: "ArrowDownCircle", color: "#495057", type: "EXPENSE" },
  { name: "Salary", icon: "Wallet", color: "#0CA678", type: "INCOME" },
  { name: "Investment Yield", icon: "TrendingUp", color: "#2F9E44", type: "INCOME" },
  { name: "Loan Principal", icon: "CreditCard", color: "#3B5BDB", type: "EXPENSE" },
  { name: "Balance Calibration", icon: "Sliders", color: "#868E96", type: "EXPENSE" },
];

const LEGACY_INCOME_NAMES = new Set(["Salary", "Investment Yield"]);

/** Resolve a category's type; older records without `type` fall back to a name heuristic. */
export function getCategoryType(cat: { name: string; type?: string | null }): CategoryType {
  if (cat.type === "INCOME" || cat.type === "EXPENSE") return cat.type;
  return LEGACY_INCOME_NAMES.has(cat.name) ? "INCOME" : "EXPENSE";
}

/** Split categories into expense / income groups (sorted by name). */
export function groupCategoriesByType<T extends { name: string; type?: string | null }>(
  categories: T[]
): { expense: T[]; income: T[] } {
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
  return {
    expense: sorted.filter((c) => getCategoryType(c) === "EXPENSE"),
    income: sorted.filter((c) => getCategoryType(c) === "INCOME"),
  };
}
